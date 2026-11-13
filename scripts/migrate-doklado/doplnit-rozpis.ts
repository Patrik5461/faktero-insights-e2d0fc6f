/*
  Doplnenie rozpisu DPH (`vat_breakdown`) k dokladom, ktoré už prišli z Doklada.

    npx jiti scripts/migrate-doklado/doplnit-rozpis.ts --company <IČO> --dry-run
    npx jiti scripts/migrate-doklado/doplnit-rozpis.ts --company <IČO>

  Voľby:
    --dry-run               nič nezapíše, len vypíše počty
    --company <IČO>         firma (povinné)
    --firma <company_id>    keď je vo Fakteri viac firiem s tým istým IČO
    --za-sekundu <n>        strop požiadaviek na Doklado (predvolene 4)

  Prvý prenos uložil pri prijatých faktúrach len hlavičku (základ + DPH spolu)
  bez rozpisu po sadzbách, takže z nej „sadzba“ vychádzala 22,46 %, 16,28 %…
  Skript pre prijaté faktúry a bločky s `doklado_id` a bez platného rozpisu
  stiahne zoznam dokladov firmy z Doklada (dva výbery podľa `isExported` ako
  migrate.ts, 1 jednotka API za doklad, obdobie len od-do dotknutých dokladov)
  a doplní rozpis. Hlavičku opraví podľa súčtov rozpisu len vtedy, keď rozpis
  dá presne sumu dokladu vo Fakteri. Rozpis so sadzbou mimo zákonných, s DPH,
  ktorá nesedí so základom, alebo nesediacim súčtom sa neuloží. Keď je
  hlavička vo Fakteri čistá jedna zákonná sadzba, doplní jednoriadkový rozpis
  z hlavičky; inak doklad označí „na kontrolu“ (`na_kontrolu_at` + dôvod
  „Rozpis DPH z Doklada sa neprevzal…“) — ukážu ho Nespracované a opraví sa
  cez Opraviť rozpis DPH (rovnako ako pri prvom prenose, `dphNaUlozenie`).

  Pred zápisom uloží dotknuté riadky do `zaloha_rozpis_doklado_<ico>_<RRRRMMDD>`
  (cez Management API a SUPABASE_ACCESS_TOKEN; RLS zapnuté, bez práv pre
  public/anon/authenticated). Zapisuje servisným kľúčom ako migrate.ts.
  Doklad v uzamknutom období (companies.locked_until) preskočí.
*/
import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { DokladoKlient, iso, type DokladAleboFaktura } from "./doklado-klient";
import {
  datum,
  dphNaUlozenie,
  druhDokladu,
  jeCudziDodavatel,
  krajinaFirmy,
  lenCislice,
  rozpisDph,
  toleranciaDph,
  zakonneSadzby,
  type KrajinaDane,
  type Rozpis,
  type RiadokRozpisu,
} from "./mapovanie";

const TU = dirname(fileURLToPath(import.meta.url));
const LOG = join(TU, "doplnit-rozpis.log");

function log(riadok: string, aj = true) {
  appendFileSync(LOG, `${new Date().toISOString()} ${riadok}\n`);
  if (aj) console.log(riadok);
}

function volby(argv: string[]) {
  const o: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const dalsi = argv[i + 1];
    if (dalsi !== undefined && !dalsi.startsWith("--")) {
      o[a.slice(2)] = dalsi;
      i++;
    } else o[a.slice(2)] = true;
  }
  return {
    dryRun: Boolean(o["dry-run"]),
    company: typeof o.company === "string" ? lenCislice(o.company) : "",
    firma: typeof o.firma === "string" ? o.firma : null,
    zaSekundu: Number(o["za-sekundu"]) || 4,
    /** Záloha už existuje (napr. zaloha_rozpis_doklado_20261113 urobená ručne) — nevytvárať ju cez Management API. */
    zalohaHotova: typeof o["zaloha-hotova"] === "string" ? String(o["zaloha-hotova"]) : null,
  };
}

function prostredie() {
  let eco: Record<string, string> = {};
  try {
    eco = createRequire(import.meta.url)("/home/patrik/ecosystem.config.cjs").apps[0].env ?? {};
  } catch {
    /* mimo servera stačí prostredie */
  }
  const z = (k: string) => process.env[k] || eco[k] || "";
  return {
    doklado: z("DOKLADO_API_KEY"),
    url: z("SUPABASE_URL") || z("VITE_SUPABASE_URL"),
    sluzba: z("SUPABASE_SERVICE_ROLE_KEY"),
    token: z("SUPABASE_ACCESS_TOKEN"),
    projekt: z("SUPABASE_PROJECT_ID") || z("VITE_SUPABASE_PROJECT_ID"),
  };
}

type Db = ReturnType<typeof createClient<any>>;

async function vsetko<T>(
  dotaz: (od: number, po: number) => PromiseLike<{ data: T[] | null; error: any }>,
) {
  const von: T[] = [];
  for (let od = 0; ; od += 1000) {
    const { data, error } = await dotaz(od, od + 999);
    if (error) throw new Error(error.message);
    von.push(...(data ?? []));
    if (!data || data.length < 1000) return von;
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;

/** Jednotný pohľad na riadok prijatej faktúry aj bločku. */
type Riadok = {
  tabulka: "purchase_invoices" | "expense_documents";
  id: string;
  doklado_id: string;
  zaklad: number;
  dph: number;
  spolu: number;
  den: string | null;
  vystavenie: string | null;
  rozpis: unknown;
  mena: string;
  exportovany: boolean;
  /** Prijatá faktúra v cudzej mene má aj sumy v EUR — tie by oprava hlavičky rozbila. */
  eur: boolean;
  /** Zálohová faktúra alebo koncept — spúšťač ich nekontroluje. */
  vynimka: boolean;
  /** Už je na kontrole. */
  naKontrole: boolean;
  supplier_country: string | null;
  supplier_ic_dph: string | null;
};

/**
 * Platný rozpis: neprázdne pole, zákonné sadzby, DPH = základ × sadzba
 * a súčty = hlavička dokladu vo Fakteri.
 */
function maPlatnyRozpis(r: Riadok, krajina: KrajinaDane): boolean {
  if (!Array.isArray(r.rozpis) || !r.rozpis.length) return false;
  const zakonne = zakonneSadzby(krajina, r.den);
  let z = 0;
  let d = 0;
  for (const x of r.rozpis as Partial<RiadokRozpisu>[]) {
    const sadzba = Number(x?.sadzba);
    if (x?.sadzba == null || !zakonne.some((s) => Math.abs(s - sadzba) < 0.001)) return false;
    const pdp = x.pdp === true || x.vat_category === "reverse_charge";
    const ocak = pdp ? 0 : r2((num(x.zaklad) * sadzba) / 100);
    if (Math.abs(num(x.dph) - ocak) > toleranciaDph() + 1e-9) return false;
    z += num(x.zaklad);
    d += num(x.dph);
  }
  return Math.abs(r2(z) - r.zaklad) <= 0.01 && Math.abs(r2(d) - r.dph) <= 0.01;
}

type Pocty = Record<string, number>;
const pridaj = (p: Pocty, k: string) => (p[k] = (p[k] ?? 0) + 1);

async function main() {
  const o = volby(process.argv.slice(2));
  if (!o.company) {
    console.error("Chýba --company <IČO>.");
    process.exit(1);
  }
  const env = prostredie();
  if (!env.doklado || !env.url || !env.sluzba) {
    console.error("Chýba DOKLADO_API_KEY, SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (!o.dryRun && (!env.token || !env.projekt)) {
    console.error("Na zálohu pred zápisom treba SUPABASE_ACCESS_TOKEN a SUPABASE_PROJECT_ID.");
    process.exit(1);
  }
  log(`=== doplnenie rozpisu DPH z Doklada ${o.dryRun ? "(DRY-RUN, nič sa nezapíše)" : "(ZÁPIS)"} ===`);
  log(`IČO ${o.company}`);

  const db: Db = createClient(env.url, env.sluzba, { auth: { persistSession: false } });
  const { data: firmy, error: ef } = await db
    .from("companies")
    .select("id, name, ico, country, locked_until")
    .eq("ico", o.company);
  if (ef) throw new Error(ef.message);
  const kand = (firmy ?? []).filter((f: any) => !o.firma || f.id === o.firma);
  if (kand.length !== 1) {
    log(
      kand.length
        ? `Vo Fakteri je ${kand.length}× IČO ${o.company} (${kand.map((f: any) => `${f.name} ${f.id}`).join(", ")}) — vyberte --firma <id>.`
        : `Firma s IČO ${o.company} vo Fakteri nie je.`,
    );
    process.exit(1);
  }
  const firma = kand[0] as any;
  const krajina = krajinaFirmy(firma.country);
  const zamok: string | null = firma.locked_until ?? null;
  log(`Faktero: ${firma.name} (${firma.id}), krajina dane ${krajina}${zamok ? `, zamknuté do ${zamok}` : ""}`);

  // Doklady vo Fakteri.
  const prijate = await vsetko<any>((od, po) =>
    db
      .from("purchase_invoices")
      .select(
        "id, doklado_id, amount_without_vat, vat_amount, amount_total, vat_breakdown, issue_date, delivery_date, currency, exported_at, deleted_at, type, status, na_kontrolu_at, supplier_country, supplier_ic_dph",
      )
      .eq("company_id", firma.id)
      .not("doklado_id", "is", null)
      .order("id")
      .range(od, po),
  );
  const blocky = await vsetko<any>((od, po) =>
    db
      .from("expense_documents")
      .select(
        "id, doklado_id, net_amount, vat_amount, total_amount, vat_breakdown, issue_date, currency, exported_at, na_kontrolu_at, supplier_country, supplier_ic_dph",
      )
      .eq("company_id", firma.id)
      .not("doklado_id", "is", null)
      .order("id")
      .range(od, po),
  );
  const riadky: Riadok[] = [
    ...prijate
      .filter((x) => !x.deleted_at)
      .map(
        (x): Riadok => ({
          tabulka: "purchase_invoices",
          id: x.id,
          doklado_id: String(x.doklado_id),
          zaklad: num(x.amount_without_vat),
          dph: num(x.vat_amount),
          spolu: num(x.amount_total),
          den: x.delivery_date ?? x.issue_date,
          vystavenie: x.issue_date,
          rozpis: x.vat_breakdown,
          mena: x.currency ?? "EUR",
          exportovany: Boolean(x.exported_at),
          eur: (x.currency ?? "EUR") !== "EUR",
          vynimka: x.type === "proforma" || x.status === "draft",
          naKontrole: Boolean(x.na_kontrolu_at),
          supplier_country: x.supplier_country ?? null,
          supplier_ic_dph: x.supplier_ic_dph ?? null,
        }),
      ),
    ...blocky.map(
      (x): Riadok => ({
        tabulka: "expense_documents",
        id: x.id,
        doklado_id: String(x.doklado_id),
        zaklad: num(x.net_amount),
        dph: num(x.vat_amount),
        spolu: num(x.total_amount),
        den: x.issue_date,
        vystavenie: x.issue_date,
        rozpis: x.vat_breakdown,
        mena: x.currency ?? "EUR",
        exportovany: Boolean(x.exported_at),
        eur: false,
        vynimka: false,
        naKontrole: Boolean(x.na_kontrolu_at),
        supplier_country: x.supplier_country ?? null,
        supplier_ic_dph: x.supplier_ic_dph ?? null,
      }),
    ),
  ];

  const pocty: Record<Riadok["tabulka"], Pocty> = { purchase_invoices: {}, expense_documents: {} };
  const naPracu: Riadok[] = [];
  for (const r of riadky) {
    if (maPlatnyRozpis(r, krajina)) pridaj(pocty[r.tabulka], "už má platný rozpis");
    else naPracu.push(r);
  }
  log(
    `Vo Fakteri s doklado_id: prijaté ${prijate.length}, bločky ${blocky.length}; bez platného rozpisu ${naPracu.length}`,
  );

  type Zmena = {
    r: Riadok;
    rozpis: RiadokRozpisu[] | null;
    hlavicka: Record<string, number | null> | null;
    /** Dôvod „na kontrolu“ — rozpis sa nezapíše, len príznak. */
    naKontrolu?: string;
  };
  const zmeny: Zmena[] = [];
  /*
    Rozpis z Doklada nejde použiť: z hlavičky vo Fakteri jednoriadkový rozpis,
    keď je čistá jedna zákonná sadzba, inak doklad na kontrolu.
  */
  const nahradne = (r: Riadok, roz: Rozpis, dovod: string) => {
    const p = pocty[r.tabulka];
    const blocek = r.tabulka === "expense_documents";
    const v = dphNaUlozenie(
      { ...roz, stav: roz.stav === "ok" ? "sucet" : roz.stav, rozpis: null },
      { zaklad: r.zaklad, dph: r.dph },
      {
        krajina,
        den: r.den,
        cudzi: jeCudziDodavatel(krajina, r.supplier_country, r.supplier_ic_dph),
        blocek,
        vynimka: r.vynimka,
      },
    );
    if (v.rozpis && v.rozpis.length) {
      pridaj(p, `${dovod} → rozpis z hlavičky (jedna zákonná sadzba)`);
      zmeny.push({ r, rozpis: v.rozpis, hlavicka: null });
    } else if (v.naKontrolu && !r.naKontrole) {
      pridaj(p, `${dovod} → na kontrolu`);
      priklad("na kontrolu", `${r.tabulka} ${r.id}: ${v.naKontrolu}`);
      zmeny.push({ r, rozpis: null, hlavicka: null, naKontrolu: v.naKontrolu });
    } else pridaj(p, dovod);
  };
  const priklady: Record<string, string[]> = {};
  const priklad = (k: string, t: string) => {
    const p = (priklady[k] ??= []);
    if (p.length < 5) p.push(t);
  };

  if (naPracu.length) {
    // Obdobie len od-do dotknutých dokladov (Doklado účtuje 1 jednotku za doklad v zozname).
    const dni = naPracu.map((r) => r.vystavenie).filter(Boolean).sort() as string[];
    const od = new Date(`${dni[0] ?? "2000-01-01"}T00:00:00Z`);
    od.setUTCDate(od.getUTCDate() - 2);
    const doDna = new Date(`${dni[dni.length - 1] ?? iso(new Date())}T23:59:59Z`);
    doDna.setUTCDate(doDna.getUTCDate() + 2);
    const doklado = new DokladoKlient(env.doklado, {
      zaSekundu: o.zaSekundu,
      log: (r) => log(r, false),
    });
    log(`Doklado: zoznam dokladov ${iso(od)} – ${iso(doDna)}`);
    const uz = await doklado.doklady({ ico: o.company, od, do: doDna, exportovane: true });
    const este = await doklado.doklady({ ico: o.company, od, do: doDna, exportovane: false });
    const podlaId = new Map<string, DokladAleboFaktura>();
    for (const d of [...uz, ...este]) podlaId.set(String(d.documentId), d);
    log(`Doklado: ${podlaId.size} dokladov (${doklado.volani} požiadaviek)`);

    for (const r of naPracu) {
      const p = pocty[r.tabulka];
      const d = podlaId.get(r.doklado_id);
      const bezDoklada = (text: string): Rozpis => ({
        stav: "nema",
        rozpis: null,
        zaklad: r.zaklad,
        dph: r.dph,
        spolu: r.spolu,
        text,
      });
      if (!d) {
        nahradne(r, bezDoklada("doklad sa v Doklade nenašiel"), "v Doklade sa nenašiel");
        continue;
      }
      const druh = druhDokladu(d);
      if (druh !== (r.tabulka === "purchase_invoices" ? "prijata" : "blocek")) {
        nahradne(r, bezDoklada(`v Doklade je iný druh dokladu (${druh})`), `v Doklade iný druh (${druh})`);
        continue;
      }
      if (zamok && r.vystavenie && r.vystavenie <= zamok) {
        pridaj(p, "obdobie uzamknuté");
        continue;
      }
      const blocek = r.tabulka === "expense_documents";
      const den =
        r.den ?? datum((d as any).deliveryDate) ?? datum((d as any).taxPointDate) ?? datum(d.issuedAt);
      const roz = rozpisDph(d, {
        krajina,
        den,
        dobropis: !blocek && r.spolu < 0,
        blocek,
        cudzi: jeCudziDodavatel(krajina, r.supplier_country, r.supplier_ic_dph),
      });
      if (roz.stav === "nema") {
        nahradne(r, roz, "Doklado nemá rozpis");
        continue;
      }
      if (roz.stav === "sadzba") {
        priklad("sadzba mimo zákonných", `${r.tabulka} ${r.id}: ${roz.text}`);
        nahradne(r, roz, "sadzba mimo zákonných");
        continue;
      }
      if (roz.stav !== "ok") {
        priklad("súčty v Doklade nesedia", `${r.tabulka} ${r.id}: ${roz.text}`);
        nahradne(r, roz, "súčty v Doklade nesedia");
        continue;
      }
      const rozpis = roz.rozpis!;
      const sedi = Math.abs(roz.zaklad - r.zaklad) <= 0.01 && Math.abs(roz.dph - r.dph) <= 0.01;
      if (sedi) {
        pridaj(p, "doplní rozpis");
        zmeny.push({ r, rozpis, hlavicka: null });
        continue;
      }
      // Hlavička sa opraví len vtedy, keď rozpis dá presne sumu dokladu vo Fakteri.
      const tol = blocek ? 0.05 : 0.01;
      if (Math.abs(roz.zaklad + roz.dph - r.spolu) > tol + 1e-9) {
        priklad(
          "nesedí so sumou vo Fakteri",
          `${r.tabulka} ${r.id}: rozpis ${roz.zaklad} + ${roz.dph}, vo Fakteri ${r.zaklad} + ${r.dph} = ${r.spolu}`,
        );
        nahradne(
          r,
          { ...roz, text: `rozpis z Doklada ${roz.zaklad} + ${roz.dph} nesedí so sumou ${r.spolu} vo Fakteri` },
          "nesedí so sumou vo Fakteri",
        );
        continue;
      }
      if (r.eur) {
        priklad("cudzia mena", `${r.tabulka} ${r.id}: ${r.mena}`);
        nahradne(
          r,
          { ...roz, text: `cudzia mena (${r.mena}) — hlavičku treba opraviť ručne` },
          "cudzia mena — hlavičku treba opraviť ručne",
        );
        continue;
      }
      pridaj(p, "doplní rozpis a opraví hlavičku");
      if (r.exportovany) pridaj(p, "  z toho už odovzdané do účtovníctva");
      priklad(
        "oprava hlavičky",
        `${r.tabulka} ${r.id}: ${r.zaklad} + ${r.dph} → ${roz.zaklad} + ${roz.dph} (spolu ${r.spolu})`,
      );
      zmeny.push({
        r,
        rozpis,
        hlavicka: blocek
          ? { net_amount: roz.zaklad, vat_amount: roz.dph }
          : { amount_without_vat: roz.zaklad, vat_amount: roz.dph },
      });
    }
  }

  log("\nVýsledok:");
  for (const [t, p] of Object.entries(pocty)) {
    log(`  ${t === "purchase_invoices" ? "prijaté faktúry" : "bločky"}:`);
    for (const [k, v] of Object.entries(p)) log(`    ${k}: ${v}`);
  }
  for (const [k, zoz] of Object.entries(priklady)) {
    log(`  príklady — ${k}:`);
    for (const t of zoz) log(`    ${t}`);
  }

  if (o.dryRun || !zmeny.length) {
    log(o.dryRun ? "\nDRY-RUN: nič sa nezapísalo." : "\nNie je čo zapísať.");
    return;
  }

  // Záloha dotknutých riadkov.
  const den = iso(new Date()).replace(/-/g, "");
  const tabZalohy = `zaloha_rozpis_doklado_${o.company}_${den}`;
  const idPodla = (t: Riadok["tabulka"]) =>
    zmeny.filter((z) => z.r.tabulka === t).map((z) => `'${z.r.id.replace(/[^0-9a-f-]/gi, "")}'`);
  const casti = (["purchase_invoices", "expense_documents"] as const)
    .filter((t) => idPodla(t).length)
    .map(
      (t) =>
        `select '${t}'::text as tabulka, id, to_jsonb(x) as riadok from public.${t} x where id in (${idPodla(t).join(",")})`,
    );
  const sql = `
    create table if not exists public.${tabZalohy} (tabulka text, id uuid, riadok jsonb, ulozene_at timestamptz default now());
    alter table public.${tabZalohy} enable row level security;
    revoke all on public.${tabZalohy} from public, anon, authenticated;
    insert into public.${tabZalohy} (tabulka, id, riadok) ${casti.join(" union all ")};
    select count(*)::int as n from public.${tabZalohy};`;
  if (o.zalohaHotova) {
    log(`Záloha: ${o.zalohaHotova} (urobená vopred)`);
  } else {
    const res = await fetch(`https://api.supabase.com/v1/projects/${env.projekt}/database/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) throw new Error(`záloha sa nepodarila: ${res.status} ${(await res.text()).slice(0, 300)}`);
    log(`Záloha: ${tabZalohy} (${JSON.stringify(await res.json())})`);
  }

  let zapisane = 0;
  let chyby = 0;
  const teraz = new Date().toISOString();
  for (const z of zmeny) {
    const blocek = z.r.tabulka === "expense_documents";
    // Na kontrolu: len príznak, rozpis ani sumy sa nemenia (spúšťač doklad z Doklada na kontrole pustí).
    const zmena: Record<string, unknown> = z.naKontrolu
      ? { na_kontrolu_at: teraz, na_kontrolu_dovod: z.naKontrolu }
      : {
          vat_breakdown: z.rozpis,
          ...(z.hlavicka ?? {}),
          ...(blocek ? { vat_rate: z.rozpis?.length === 1 ? z.rozpis[0]!.sadzba : null } : {}),
        };
    const { error } = await db
      .from(z.r.tabulka)
      .update(zmena)
      .eq("id", z.r.id)
      .eq("company_id", firma.id);
    if (error) {
      chyby++;
      log(`  CHYBA ${z.r.tabulka} ${z.r.id}: ${error.message}`);
    } else zapisane++;
  }
  log(`\nZapísané: ${zapisane}, chyby: ${chyby}. Záloha v ${tabZalohy}.`);
}

main().catch((e) => {
  log(`CHYBA: ${(e as Error).message}`);
  process.exit(1);
});
