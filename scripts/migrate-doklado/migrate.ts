/*
  Jednorazový presun Doklado → Faktero.

    npx jiti scripts/migrate-doklado/migrate.ts --dry-run --company 12345678
    npx jiti scripts/migrate-doklado/migrate.ts --company 12345678 [--since 2024-01-01]

  Voľby:
    --dry-run               nič nezapíše; vypíše počty, párovanie a ukážku mapovania
    --company <IČO>         len jedna firma (inak všetky, ku ktorým má kľúč prístup)
    --since <RRRR-MM-DD>    len doklady vystavené od dátumu
    --vlastnik <e-mail>     chýbajúcu firmu založí s týmto vlastníkom (inak ju len vypíše)
    --pripojit-k <id>       firmu Tobify/PALIERA pripojí k tejto firme vo Fakteri (len s --company)
    --za-sekundu <n>        strop požiadaviek na Doklado (predvolene 4)

  Doklado účtuje spotrebu (1 € / 1 000 jednotiek): zoznam = 1 jednotka za doklad,
  prílohy 1 za doklad s prílohami, PDF faktúry 1. Detail sa nevolá — zoznam nesie
  celý doklad; dry-run ho volá len pri ukážke (najviac 3 doklady).

  Kľúč berie z DOKLADO_API_KEY (prostredie alebo ecosystem.config.cjs) a nikam
  ho nevypisuje. Popis polí je v MAPPING.md.
*/
import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { DokladoKlient, iso, type DokladAleboFaktura, type FakturaV2 } from "./doklado-klient";
import {
  datum as datumZTextu,
  blocek,
  druhDokladu,
  jeZauctovany,
  klucPartnera,
  lenCislice,
  menoSuboru,
  prijata,
  vystavena,
  type Druh,
  type Partner,
} from "./mapovanie";
import {
  rozpoznajRad,
  ukazkaCisla,
  druhPodlaTypuFaktury,
} from "../../src/lib/faktero/ciselne-rady";
import { rozpoznajRadyPoImporte } from "../../src/lib/faktero/ciselne-rady-import.server";

const datumDokladu = (d: DokladAleboFaktura) => datumZTextu(d.issuedAt);

const TU = dirname(fileURLToPath(import.meta.url));
const LOG = join(TU, "migrate.log");

/* ---------------- voľby a prostredie ---------------- */

function volby(argv: string[]) {
  const o: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const dalsi = argv[i + 1];
    if (dalsi !== undefined && !dalsi.startsWith("--")) {
      o[k] = dalsi;
      i++;
    } else o[k] = true;
  }
  return {
    dryRun: Boolean(o["dry-run"]),
    company: typeof o.company === "string" ? lenCislice(o.company) : null,
    since: typeof o.since === "string" ? o.since : null,
    vlastnik: typeof o.vlastnik === "string" ? o.vlastnik : null,
    pripojitK: typeof o["pripojit-k"] === "string" ? o["pripojit-k"] : null,
    zaSekundu: Number(o["za-sekundu"]) || 4,
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
  };
}

function log(riadok: string, aj = true) {
  appendFileSync(LOG, `${new Date().toISOString()} ${riadok}\n`);
  if (aj) console.log(riadok);
}

/* ---------------- databáza ---------------- */

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

async function maStlpecDokladoId(db: Db): Promise<boolean> {
  for (const t of ["invoices", "purchase_invoices", "expense_documents"]) {
    const { error } = await db.from(t).select("doklado_id").limit(1);
    if (error) return false;
  }
  return true;
}

type Existujuce = {
  faktury: Map<string, { id: string; doklado_id: string | null }>;
  fakturyPodlaDoklado: Set<string>;
  prijate: Map<string, { id: string; doklado_id: string | null }>;
  /** Tá istá faktúra bez IČO (napr. zahraničný dodávateľ z mailu): číslo + suma. */
  prijatePodlaCislaSumy: Map<string, { id: string; doklado_id: string | null; cislo: string }>;
  /** Iné číslo, ten istý doklad: IČO + dátum vystavenia + suma (len keď je jediný taký). */
  prijatePodlaDna: Map<string, { id: string; doklado_id: string | null; cislo: string } | null>;
  prijatePodlaDoklado: Set<string>;
  blocky: Map<string, { id: string; doklado_id: string | null }>;
  blockyPodlaDoklado: Set<string>;
  partneri: Map<string, { id: string; odberatel: boolean; dodavatel: boolean }>;
};

const klucCislaSumy = (cislo: unknown, suma: unknown) =>
  `${String(cislo ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")}|${Math.abs(Number(suma ?? 0)).toFixed(2)}`;

const klucDna = (ico: unknown, datum: unknown, suma: unknown) =>
  `${lenCislice(ico)}|${String(datum ?? "").slice(0, 10)}|${Math.abs(Number(suma ?? 0)).toFixed(2)}`;

/**
 * Existujúca prijatá faktúra: IČO + číslo, inak číslo + suma (dodávateľ bez
 * IČO), inak IČO + deň + suma — ten istý doklad mohol prísť mailom s iným
 * číslom (variabilný symbol namiesto čísla faktúry).
 */
function najdiPrijatu(
  ex: Existujuce,
  ico: unknown,
  cislo: unknown,
  suma: unknown,
  datum?: unknown,
) {
  return (
    (klucPrijatej(ico, cislo, suma) ? ex.prijate.get(klucPrijatej(ico, cislo, suma)) : undefined) ??
    ex.prijatePodlaCislaSumy.get(klucCislaSumy(cislo, suma)) ??
    (lenCislice(ico) && datum
      ? (ex.prijatePodlaDna.get(klucDna(ico, datum, suma)) ?? undefined)
      : undefined)
  );
}

/**
 * IČO + číslo + suma. Bez IČO kľúč nie je (""): zahraniční dodávatelia bez
 * IČO s rovnakým číslom (RNS26012268 od dvoch firiem) by sa inak zliali.
 * Suma je v kľúči, lebo rovnaké číslo s inou sumou je iný doklad.
 */
const klucPrijatej = (ico: unknown, cislo: unknown, suma: unknown) =>
  lenCislice(ico)
    ? `${lenCislice(ico)}|${String(cislo ?? "")
        .trim()
        .toLowerCase()}|${Math.abs(Number(suma ?? 0)).toFixed(2)}`
    : "";
const klucBlocku = (ico: unknown, cislo: unknown, datum: unknown, suma: unknown) =>
  `${lenCislice(ico)}|${String(cislo ?? "")
    .trim()
    .toLowerCase()}|${String(datum ?? "").slice(0, 10)}|${Number(suma ?? 0).toFixed(2)}`;

async function nacitajExistujuce(db: Db, companyId: string, sId: boolean): Promise<Existujuce> {
  const d = sId ? ", doklado_id" : "";
  const [faktury, prijate, blocky, partneri] = await Promise.all([
    vsetko<any>((od, po) =>
      db
        .from("invoices")
        .select(`id, invoice_number${d}`)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("id")
        .range(od, po),
    ),
    vsetko<any>((od, po) =>
      db
        .from("purchase_invoices")
        .select(`id, supplier_ico, invoice_number, amount_total, issue_date${d}`)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("id")
        .range(od, po),
    ),
    vsetko<any>((od, po) =>
      db
        .from("expense_documents")
        .select(`id, supplier_ico, document_number, issue_date, total_amount${d}`)
        .eq("company_id", companyId)
        .order("id")
        .range(od, po),
    ),
    vsetko<any>((od, po) =>
      db
        .from("customers")
        .select("id, ico, name, odberatel, dodavatel")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("id")
        .range(od, po),
    ),
  ]);
  const e: Existujuce = {
    faktury: new Map(
      faktury.map((f) => [
        String(f.invoice_number).trim(),
        { id: f.id, doklado_id: f.doklado_id ?? null },
      ]),
    ),
    fakturyPodlaDoklado: new Set(faktury.map((f) => f.doklado_id).filter(Boolean)),
    prijate: new Map(
      prijate
        .filter((f) => klucPrijatej(f.supplier_ico, f.invoice_number, f.amount_total))
        .map((f) => [
          klucPrijatej(f.supplier_ico, f.invoice_number, f.amount_total),
          { id: f.id, doklado_id: f.doklado_id ?? null },
        ]),
    ),
    prijatePodlaDoklado: new Set(prijate.map((f) => f.doklado_id).filter(Boolean)),
    prijatePodlaDna: new Map(),
    prijatePodlaCislaSumy: new Map(
      prijate.map((f) => [
        klucCislaSumy(f.invoice_number, f.amount_total),
        { id: f.id, doklado_id: f.doklado_id ?? null, cislo: f.invoice_number },
      ]),
    ),
    blocky: new Map(
      blocky.map((b) => [
        klucBlocku(b.supplier_ico, b.document_number, b.issue_date, b.total_amount),
        { id: b.id, doklado_id: b.doklado_id ?? null },
      ]),
    ),
    blockyPodlaDoklado: new Set(blocky.map((b) => b.doklado_id).filter(Boolean)),
    partneri: new Map(),
  };
  for (const f of prijate) {
    if (!lenCislice(f.supplier_ico)) continue;
    const k = klucDna(f.supplier_ico, f.issue_date, f.amount_total);
    // Viac kandidátov v ten istý deň s tou istou sumou = nehádame.
    e.prijatePodlaDna.set(
      k,
      e.prijatePodlaDna.has(k)
        ? null
        : { id: f.id, doklado_id: f.doklado_id ?? null, cislo: f.invoice_number },
    );
  }
  for (const p of partneri) {
    const k = klucPartnera({ ico: p.ico, name: p.name ?? "" });
    if (!e.partneri.has(k))
      e.partneri.set(k, { id: p.id, odberatel: p.odberatel, dodavatel: p.dodavatel });
  }
  return e;
}

/* ---------------- súhrn ---------------- */

type Suhrn = {
  firma: string;
  ico: string;
  doklady: number;
  vystavene: number;
  prijate: number;
  blocky: number;
  nove: number;
  sparovane: number;
  preskocene: number;
  partneriNovi: number;
  prilohy: number;
  chyby: number;
};

const novySuhrn = (firma: string, ico: string): Suhrn => ({
  firma,
  ico,
  doklady: 0,
  vystavene: 0,
  prijate: 0,
  blocky: 0,
  nove: 0,
  sparovane: 0,
  preskocene: 0,
  partneriNovi: 0,
  prilohy: 0,
  chyby: 0,
});

function vypisSuhrn(riadky: Suhrn[], dryRun: boolean) {
  const hlav = [
    "firma",
    "IČO",
    "doklady",
    "faktúry (vyst./prij.)",
    "bločky",
    dryRun ? "nové" : "zapísané",
    "už vo Fakteri",
    "partneri noví",
    "prílohy",
    "chyby",
  ];
  const data = riadky.map((r) => [
    r.firma.slice(0, 32),
    r.ico,
    String(r.doklady),
    `${r.vystavene}/${r.prijate}`,
    String(r.blocky),
    String(r.nove),
    String(r.sparovane + r.preskocene),
    String(r.partneriNovi),
    String(r.prilohy),
    String(r.chyby),
  ]);
  const sirky = hlav.map((h, i) => Math.max(h.length, ...data.map((d) => d[i]!.length)));
  const riadok = (b: string[]) => b.map((x, i) => x.padEnd(sirky[i]!)).join(" | ");
  log("");
  log(riadok(hlav));
  log(sirky.map((s) => "-".repeat(s)).join("-|-"));
  for (const d of data) log(riadok(d));
}

/* ---------------- hlavný beh ---------------- */

async function main() {
  const o = volby(process.argv.slice(2));
  const env = prostredie();
  if (!env.doklado) {
    console.error("Chýba DOKLADO_API_KEY. Vložte ho cez ~/vloz-tajomstvo.sh DOKLADO_API_KEY.");
    process.exit(1);
  }
  if (!env.url || !env.sluzba) {
    console.error("Chýba SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (o.pripojitK && !o.company) {
    console.error("--pripojit-k sa dá použiť len s --company.");
    process.exit(1);
  }
  log(`=== migrácia Doklado → Faktero ${o.dryRun ? "(DRY-RUN, nič sa nezapíše)" : "(ZÁPIS)"} ===`);
  log(`firma: ${o.company ?? "všetky"}, od: ${o.since ?? "začiatku"}`);

  const db: Db = createClient(env.url, env.sluzba, { auth: { persistSession: false } });
  const doklado = new DokladoKlient(env.doklado, {
    zaSekundu: o.zaSekundu,
    log: (r) => log(r, false),
  });
  const sId = await maStlpecDokladoId(db);
  if (!sId) {
    if (!o.dryRun) {
      log("Chýba stĺpec doklado_id (migrácia ešte nebola schválená) — zápis bez neho nespustím.");
      process.exit(1);
    }
    log("Pozn.: stĺpec doklado_id ešte neexistuje; dry-run páruje len podľa čísel dokladov.");
  }

  const firmy = await vsetko<any>((od, po) =>
    db.from("companies").select("id, name, ico, locked_until").order("id").range(od, po),
  );
  const podlaIco = new Map<string, any[]>();
  for (const f of firmy) {
    const k = lenCislice(f.ico);
    if (!k) continue;
    podlaIco.set(k, [...(podlaIco.get(k) ?? []), f]);
  }

  let organizacie = await doklado.organizacie();
  log(`Doklado: ${organizacie.length} organizácií`);
  if (o.company)
    organizacie = organizacie.filter(
      (x) => lenCislice(x.identificationNumber ?? x.organizationId) === o.company,
    );
  if (!organizacie.length) {
    log(
      o.company
        ? `Organizácia s IČO ${o.company} v Doklade nie je (alebo k nej kľúč nemá prístup).`
        : "Žiadne organizácie.",
    );
    process.exit(1);
  }

  const suhrny: Suhrn[] = [];
  const nevyriesene: string[] = [];
  const od = o.since ? new Date(`${o.since}T00:00:00Z`) : new Date("2000-01-01T00:00:00Z");
  const doDna = new Date();
  const teraz = new Date().toISOString();
  const dnes = iso(new Date());

  for (const org of organizacie) {
    const ico = lenCislice(org.identificationNumber ?? org.organizationId);
    const meno = org.name ?? ico;
    const s = novySuhrn(meno, ico);
    suhrny.push(s);
    log(`\n--- ${meno} (IČO ${ico}) ---`);

    // Párovanie s firmou vo Fakteri.
    const kandidati = podlaIco.get(ico) ?? [];
    let firma: any = null;
    const chranena =
      /tobify|paliera/i.test(meno) || kandidati.some((k) => /tobify|paliera/i.test(k.name));
    if (chranena && !o.pripojitK) {
      nevyriesene.push(
        `${meno} (${ico}): Tobify/PALIERA sa nepárujú automaticky — kandidáti: ${kandidati.map((k) => `${k.name} ${k.id}`).join(", ") || "žiadni"}; použite --company ${ico} --pripojit-k <company_id>`,
      );
      log("  nepárujem automaticky (Tobify/PALIERA) — dokladom sa len pozriem na počty");
    } else if (o.pripojitK) {
      firma = firmy.find((f) => f.id === o.pripojitK) ?? null;
      if (!firma) throw new Error(`Firma ${o.pripojitK} vo Fakteri nie je.`);
    } else if (kandidati.length === 1) {
      firma = kandidati[0];
    } else if (kandidati.length > 1) {
      nevyriesene.push(
        `${meno} (${ico}): vo Fakteri je ${kandidati.length}× s tým istým IČO — ${kandidati.map((k) => `${k.name} ${k.id}`).join(", ")}`,
      );
    } else if (o.vlastnik && !o.dryRun) {
      firma = await zalozFirmu(db, org, o.vlastnik);
      log(`  založená firma ${firma.id}`);
    } else {
      nevyriesene.push(
        `${meno} (${ico}): vo Fakteri chýba${o.vlastnik ? " — založí sa pri zápise" : " — založím ju len s --vlastnik <e-mail>"}`,
      );
    }
    if (firma)
      log(
        `  Faktero: ${firma.name} (${firma.id})${firma.locked_until ? `, zamknuté do ${firma.locked_until}` : ""}`,
      );

    // Doklady.
    let doklady: DokladAleboFaktura[];
    let exportovane: Set<string>;
    try {
      // Dva výbery podľa stavu exportu = každý doklad sa prečíta (a zaplatí) raz.
      const uz = await doklado.doklady({ ico, od, do: doDna, exportovane: true });
      const este = await doklado.doklady({ ico, od, do: doDna, exportovane: false });
      exportovane = new Set(uz.map((d) => String(d.documentId)));
      const videne = new Set<string>();
      doklady = [...uz, ...este].filter((d) => {
        const id = String(d.documentId);
        if (videne.has(id)) return false;
        videne.add(id);
        return true;
      });
    } catch (e) {
      s.chyby++;
      log(`  CHYBA pri načítaní dokladov: ${(e as Error).message}`);
      continue;
    }
    const podlaDruhu = new Map<Druh, DokladAleboFaktura[]>();
    const podtypy = new Map<string, number>();
    for (const d of doklady) {
      const dr = druhDokladu(d);
      podlaDruhu.set(dr, [...(podlaDruhu.get(dr) ?? []), d]);
      const k = `${d.type ?? "?"}/${d.subType ?? "-"}`;
      podtypy.set(k, (podtypy.get(k) ?? 0) + 1);
    }
    s.doklady = doklady.length;
    s.vystavene = podlaDruhu.get("vystavena")?.length ?? 0;
    s.prijate = podlaDruhu.get("prijata")?.length ?? 0;
    s.blocky = podlaDruhu.get("blocek")?.length ?? 0;
    log(`  dokladov: ${doklady.length} (exportovaných v Doklade: ${exportovane.size})`);
    log(`  podľa typu: ${[...podtypy].map(([k, v]) => `${k} ${v}`).join(", ")}`);
    const nezname = podlaDruhu.get("nezname") ?? [];
    if (nezname.length) log(`  POZOR: ${nezname.length} dokladov neznámeho druhu sa preskočí`);
    if (doklady.length) {
      const datumy = doklady
        .map((d) => String(d.issuedAt ?? "").slice(0, 10))
        .filter(Boolean)
        .sort();
      log(`  obdobie: ${datumy[0]} – ${datumy[datumy.length - 1]}`);
    }

    const ex = firma ? await nacitajExistujuce(db, firma.id, sId) : null;

    if (o.dryRun) {
      await dryRunFirmy({ doklado, ico, podlaDruhu, exportovane, ex, s, teraz, dnes });
      continue;
    }
    if (!firma || !ex) continue;
    await zapisFirmy({ db, doklado, ico, firma, podlaDruhu, exportovane, ex, s, teraz, dnes });
    try {
      const rady = await rozpoznajRadyPoImporte(db, firma.id);
      for (const r of rady)
        log(
          `  číselný rad ${r.nazov}: ${r.format}, ďalšie ${r.dalsie}${r.nastavene ? " (nastavené)" : " (len návrh — firma má vlastné faktúry)"}`,
        );
    } catch (e) {
      log(`  číselný rad sa nepodarilo rozpoznať: ${(e as Error).message}`);
    }
  }

  vypisSuhrn(suhrny, o.dryRun);
  if (nevyriesene.length) {
    log("\nNevyriešené firmy:");
    for (const n of nevyriesene) log(`  - ${n}`);
  }
  log(`\nVolaní Doklado API: ${doklado.volani}. Protokol: ${LOG}`);
}

/* ---------------- dry-run ---------------- */

async function dryRunFirmy(a: {
  doklado: DokladoKlient;
  ico: string;
  podlaDruhu: Map<Druh, DokladAleboFaktura[]>;
  exportovane: Set<string>;
  ex: Existujuce | null;
  s: Suhrn;
  teraz: string;
  dnes: string;
}) {
  const { podlaDruhu, ex, s } = a;
  // Zaúčtované v Doklade musí prísť zaúčtované — tu je to vidieť po druhoch.
  for (const dr of ["vystavena", "prijata", "blocek"] as const) {
    const zoz = podlaDruhu.get(dr) ?? [];
    if (!zoz.length) continue;
    let zauct = 0;
    let lenExportom = 0;
    for (const d of zoz) {
      const exp = a.exportovane.has(String(d.documentId));
      if (jeZauctovany(d, exp)) zauct++;
      if (exp && !jeZauctovany(d, false)) lenExportom++;
    }
    log(
      `  ${dr}: zaúčtovaných ${zauct}/${zoz.length}` +
        (lenExportom ? ` (z toho ${lenExportom} bez predkontácie, zaúčtované podľa exportu)` : "") +
        (zoz.length - zauct ? `, nezaúčtovaných ${zoz.length - zauct}` : ""),
    );
  }
  const partneri = new Set<string>();
  const noviPartneri = new Set<string>();
  for (const dr of ["vystavena", "prijata", "blocek"] as const) {
    for (const d of podlaDruhu.get(dr) ?? []) {
      const id = String(d.documentId);
      let uz = false;
      if (dr === "vystavena")
        uz = Boolean(
          ex &&
          (ex.fakturyPodlaDoklado.has(id) || ex.faktury.has(String(d.invoiceNumber ?? "").trim())),
        );
      if (dr === "vystavena" && uz) log(`  už vo Fakteri: vystavená ${d.invoiceNumber}`);
      if (dr === "prijata")
        uz = Boolean(
          ex &&
          (ex.prijatePodlaDoklado.has(id) ||
            Boolean(
              najdiPrijatu(ex, d.organizationId, d.invoiceNumber, d.totalPrice, datumDokladu(d)),
            )),
        );
      if (uz)
        log(
          `  už vo Fakteri: prijatá ${d.invoiceNumber} (${d.organizationName}, ${d.totalPrice} €)`,
        );
      if (dr === "blocek") {
        const b = blocek(d, a);
        uz = Boolean(
          ex &&
          (ex.blockyPodlaDoklado.has(id) ||
            ex.blocky.has(
              klucBlocku(b.supplier_ico, b.document_number, b.issue_date, b.total_amount),
            )),
        );
      }
      if (uz) s.sparovane++;
      else s.nove++;
      if (dr !== "blocek" && d.organizationName) {
        const k = klucPartnera({
          ico: lenCislice(d.organizationId) || null,
          name: d.organizationName,
        });
        partneri.add(k);
        if (!ex?.partneri.has(k)) noviPartneri.add(k);
      }
    }
  }
  s.partneriNovi = noviPartneri.size;
  log(`  nové: ${s.nove}, už vo Fakteri (podľa čísla/doklado_id): ${s.sparovane}`);
  log(`  partneri: ${partneri.size} (noví: ${noviPartneri.size})`);

  // Číselný rad, v ktorom by pokračovali nové faktúry.
  const podlaRadu = new Map<string, { cislo: string | null; datum: string | null }[]>();
  for (const d of podlaDruhu.get("vystavena") ?? []) {
    const m = vystavena(d as FakturaV2, a);
    const druh = druhPodlaTypuFaktury(m.hlavicka.type);
    podlaRadu.set(druh, [
      ...(podlaRadu.get(druh) ?? []),
      { cislo: m.hlavicka.invoice_number, datum: m.hlavicka.issue_date },
    ]);
  }
  for (const [druh, zoznam] of podlaRadu) {
    const r = rozpoznajRad(zoznam);
    log(
      r
        ? `  rad ${druh}: šablóna ${r.format}, posledné ${r.cislo}, ďalšie ${ukazkaCisla(r.format, r.startFrom)}`
        : `  rad ${druh}: nerozpoznaný`,
    );
  }

  // Ukážka mapovania — jeden doklad z každého druhu, s detailom a prílohami.
  for (const dr of ["vystavena", "prijata", "blocek"] as const) {
    const d0 = (podlaDruhu.get(dr) ?? [])[0];
    if (!d0?.documentId) continue;
    let d = d0;
    try {
      d = (await a.doklado.detail(d0.documentId)) ?? d0;
    } catch (e) {
      log(`  detail ${d0.documentId}: ${(e as Error).message}`);
    }
    const ov = { ...a, exportovany: a.exportovane.has(String(d0.documentId)) };
    const mapa =
      dr === "vystavena"
        ? vystavena(d as FakturaV2, ov)
        : dr === "prijata"
          ? prijata(d as FakturaV2, ov)
          : blocek(d, ov);
    let subory = "";
    try {
      if (dr === "vystavena") {
        const pdf = await a.doklado.pdfFaktury(a.ico, d0.documentId);
        subory = pdf ? `PDF ${pdf.bajty.length} B` : "PDF nie je";
      } else {
        const pr = await a.doklado.prilohy(d0.documentId);
        subory = `${pr.length} súborov (${pr.map((p) => `${p.fileType}:${p.fileName}`).join(", ")})`;
      }
    } catch (e) {
      subory = `súbory: ${(e as Error).message}`;
    }
    log(`\n  UKÁŽKA ${dr} ${d0.documentId} — ${subory}`);
    log(`  Doklado: ${JSON.stringify(skrat(d)).slice(0, 2500)}`);
    log(`  Faktero: ${JSON.stringify(mapa).slice(0, 2500)}`);
  }
}

/** Do protokolu bez účtovných nastavení — sú dlhé a nič nehovoria. */
function skrat(d: any) {
  const { accountingSettings, ...zvysok } = d ?? {};
  return {
    ...zvysok,
    items: (zvysok.items ?? []).map(({ accountingSettings: _a, ...p }: any) => p),
    accountingSettings: accountingSettings ? "…" : undefined,
  };
}

/* ---------------- zápis ---------------- */

async function zalozFirmu(db: Db, org: any, vlastnik: string) {
  const { data: u } = await db.auth.admin.listUsers({ perPage: 1000 });
  const user = u?.users.find((x) => x.email?.toLowerCase() === vlastnik.toLowerCase());
  if (!user) throw new Error(`Používateľ ${vlastnik} neexistuje.`);
  const { data: f, error } = await db
    .from("companies")
    .insert({
      name: org.name ?? lenCislice(org.identificationNumber),
      ico: lenCislice(org.identificationNumber) || null,
      dic: org.taxIdentificationNumber ?? null,
      country: ["SK", "CZ"].includes(String(org.countryCode ?? "").toUpperCase())
        ? String(org.countryCode).toUpperCase()
        : "SK",
      created_by: user.id,
    })
    .select("id, name, ico, locked_until")
    .single();
  if (error || !f) throw new Error(`Firma: ${error?.message}`);
  const { error: e2 } = await db
    .from("company_users")
    .insert({ company_id: f.id, user_id: user.id, role: "owner" });
  if (e2) throw new Error(`Vlastník firmy: ${e2.message}`);
  return f;
}

async function partnerId(
  db: Db,
  companyId: string,
  ex: Existujuce,
  p: Partner | null,
  rola: "odberatel" | "dodavatel",
  s: Suhrn,
) {
  if (!p) return null;
  const k = klucPartnera(p);
  const uz = ex.partneri.get(k);
  if (uz) {
    if (!uz[rola]) {
      await db
        .from("customers")
        .update({ [rola]: true })
        .eq("id", uz.id)
        .eq("company_id", companyId);
      uz[rola] = true;
    }
    return uz.id;
  }
  const { data, error } = await db
    .from("customers")
    .insert({
      company_id: companyId,
      name: p.name,
      ico: p.ico,
      dic: p.dic,
      ic_dph: p.ic_dph,
      street: p.street,
      city: p.city,
      zip: p.zip,
      country: p.country,
      iban: rola === "dodavatel" ? p.iban : null,
      odberatel: rola === "odberatel",
      dodavatel: rola === "dodavatel",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Partner ${p.name}: ${error?.message}`);
  ex.partneri.set(k, {
    id: data.id,
    odberatel: rola === "odberatel",
    dodavatel: rola === "dodavatel",
  });
  s.partneriNovi++;
  return data.id as string;
}

async function nahraj(db: Db, kos: string, cesta: string, bajty: Uint8Array, mime: string) {
  const { error } = await db.storage
    .from(kos)
    .upload(cesta, bajty, { contentType: mime, upsert: true });
  if (error) throw new Error(`úložisko ${kos}/${cesta}: ${error.message}`);
}

async function stiahni(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`stiahnutie súboru: ${r.status}`);
  return {
    bajty: new Uint8Array(await r.arrayBuffer()),
    mime: r.headers.get("content-type") || "application/octet-stream",
  };
}

/**
 * Doklad exportovaný z Doklada je zaúčtovaný — aj ten, čo vo Fakteri už bol
 * (z mailu, z predošlého importu) a teraz sa len spároval. Mení sa len to, čo
 * ešte nastavené nie je; vlastné zaúčtovanie vo Fakteri sa neprepíše.
 */
async function dozauctuj(
  db: Db,
  tabulka: "invoices" | "purchase_invoices" | "expense_documents",
  cid: string,
  kde: { id: string } | { doklado_id: string },
  teraz: string,
) {
  const [stlpec, hodnota] = "id" in kde ? ["id", kde.id] : ["doklado_id", kde.doklado_id];
  const r1 = await db
    .from(tabulka)
    .update({ zauctovane_at: teraz, zauctovanie_zdroj: "manual" })
    .eq("company_id", cid)
    .eq(stlpec, hodnota)
    .is("zauctovane_at", null)
    .select("id");
  if (r1.error) throw new Error(`dozaúčtovanie: ${r1.error.message}`);
  const r2 = await db
    .from(tabulka)
    .update(
      tabulka === "expense_documents"
        ? { exported_at: teraz, status: "exported" }
        : { exported_at: teraz },
    )
    .eq("company_id", cid)
    .eq(stlpec, hodnota)
    .is("exported_at", null)
    .select("id");
  if (r2.error) throw new Error(`označenie exportu: ${r2.error.message}`);
  if (tabulka === "purchase_invoices") {
    const r3 = await db
      .from(tabulka)
      .update({ status: "booked" })
      .eq("company_id", cid)
      .eq(stlpec, hodnota)
      .in("status", ["draft", "received"]);
    if (r3.error) throw new Error(`stav: ${r3.error.message}`);
  }
  return (r1.data?.length ?? 0) + (r2.data?.length ?? 0) > 0;
}

/** Vystavená faktúra je pre konektor Pohody odovzdaná, keď má riadok v export_logs. */
async function zapisOdovzdanie(
  db: Db,
  cid: string,
  jobId: () => Promise<string>,
  faktura: { id: string; cislo: string },
) {
  const { data: uz } = await db
    .from("export_logs")
    .select("id")
    .eq("invoice_id", faktura.id)
    .eq("status", "ok")
    .limit(1);
  if (uz?.length) return false;
  const { error } = await db.from("export_logs").insert({
    company_id: cid,
    export_job_id: await jobId(),
    invoice_id: faktura.id,
    invoice_number: faktura.cislo,
    status: "ok",
  });
  if (error) throw new Error(`export_logs: ${error.message}`);
  return true;
}

async function zapisFirmy(a: {
  db: Db;
  doklado: DokladoKlient;
  ico: string;
  firma: any;
  podlaDruhu: Map<Druh, DokladAleboFaktura[]>;
  exportovane: Set<string>;
  ex: Existujuce;
  s: Suhrn;
  teraz: string;
  dnes: string;
}) {
  const { db, doklado, firma, ex, s } = a;
  const cid = firma.id as string;
  const o = { teraz: a.teraz, dnes: a.dnes };
  let dozauctovane = 0;
  // Jeden záznam „Prenos z Doklada“ v histórii exportov — export_logs ho vyžaduje.
  let job: string | null = null;
  const jobId = async () => {
    if (job) return job;
    const { data, error } = await db
      .from("export_jobs")
      .insert({
        company_id: cid,
        format: "doklado-prenos",
        target_system: "pohoda",
        status: "completed",
        file_name: "Prenos z Doklada",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`export_jobs: ${error?.message}`);
    job = data.id as string;
    return job;
  };

  // Vystavené faktúry.
  for (const z of a.podlaDruhu.get("vystavena") ?? []) {
    const id = String(z.documentId);
    try {
      if (ex.fakturyPodlaDoklado.has(id)) {
        s.preskocene++;
        if (a.exportovane.has(id)) {
          const { data: f } = await db
            .from("invoices")
            .select("id, invoice_number")
            .eq("company_id", cid)
            .eq("doklado_id", id)
            .maybeSingle();
          if (f) {
            const zmena = await dozauctuj(db, "invoices", cid, { id: f.id }, a.teraz);
            const odovzd = await zapisOdovzdanie(db, cid, jobId, {
              id: f.id,
              cislo: f.invoice_number,
            });
            if (zmena || odovzd) dozauctovane++;
          }
        }
        continue;
      }
      const m = vystavena(z as FakturaV2, { ...o, exportovany: a.exportovane.has(id) });
      const cislo = m.hlavicka.invoice_number;
      const uz = ex.faktury.get(cislo);
      if (uz) {
        // Ten istý doklad z predošlého importu — neprepisuje sa, len sa označí.
        if (!uz.doklado_id)
          await db
            .from("invoices")
            .update({ doklado_id: id })
            .eq("id", uz.id)
            .eq("company_id", cid);
        if (a.exportovane.has(id)) {
          const zmena = await dozauctuj(db, "invoices", cid, { id: uz.id }, a.teraz);
          const odovzd = await zapisOdovzdanie(db, cid, jobId, { id: uz.id, cislo });
          if (zmena || odovzd) dozauctovane++;
        }
        ex.fakturyPodlaDoklado.add(id);
        s.sparovane++;
        continue;
      }
      const customer_id = await partnerId(db, cid, ex, m.partner, "odberatel", s);
      const exportovana = a.exportovane.has(id);
      const { data: f, error } = await db
        .from("invoices")
        .insert({
          ...m.hlavicka,
          company_id: cid,
          customer_id,
          ...(exportovana ? { exported_at: a.teraz } : {}),
        })
        .select("id")
        .single();
      if (error || !f) throw new Error(error?.message ?? "faktúra sa nezapísala");
      if (m.polozky.length) {
        const { error: e2 } = await db
          .from("invoice_items")
          .insert(m.polozky.map((p) => ({ ...p, invoice_id: f.id })));
        if (e2) {
          await db.from("invoices").delete().eq("id", f.id);
          throw new Error(`položky: ${e2.message}`);
        }
      }
      if (exportovana) await zapisOdovzdanie(db, cid, jobId, { id: f.id, cislo });
      ex.faktury.set(cislo, { id: f.id, doklado_id: id });
      ex.fakturyPodlaDoklado.add(id);
      s.nove++;
      // Pôvodné PDF ako príloha — to, čo odberateľ dostal.
      try {
        const pdf = await doklado.pdfFaktury(a.ico, id);
        if (pdf) {
          const cesta = `${cid}/doklado/${id}/${menoSuboru(`${cislo}.pdf`, "faktura.pdf")}`;
          await nahraj(db, "invoice-attachments", cesta, pdf.bajty, pdf.mime);
          await db.from("invoice_attachments").insert({
            company_id: cid,
            invoice_id: f.id,
            path: cesta,
            name: `Faktúra ${cislo} z Doklada.pdf`,
            mime: pdf.mime,
            size: pdf.bajty.length,
          });
          s.prilohy++;
        }
      } catch (e) {
        s.chyby++;
        log(`  PDF faktúry ${cislo}: ${(e as Error).message}`);
      }
    } catch (e) {
      s.chyby++;
      log(`  CHYBA vystavená ${id} ${z.invoiceNumber ?? ""}: ${(e as Error).message}`);
    }
  }

  // Prijaté faktúry.
  for (const z of a.podlaDruhu.get("prijata") ?? []) {
    const id = String(z.documentId);
    try {
      if (ex.prijatePodlaDoklado.has(id)) {
        s.preskocene++;
        if (
          a.exportovane.has(id) &&
          (await dozauctuj(db, "purchase_invoices", cid, { doklado_id: id }, a.teraz))
        )
          dozauctovane++;
        continue;
      }
      const m = prijata(z as FakturaV2, { ...o, exportovany: a.exportovane.has(id) });
      const k = klucPrijatej(
        m.hlavicka.supplier_ico,
        m.hlavicka.invoice_number,
        m.hlavicka.amount_total,
      );
      const uz = najdiPrijatu(
        ex,
        m.hlavicka.supplier_ico,
        m.hlavicka.invoice_number,
        m.hlavicka.amount_total,
        m.hlavicka.issue_date,
      );
      if (uz) {
        if (!uz.doklado_id)
          await db
            .from("purchase_invoices")
            .update({ doklado_id: id })
            .eq("id", uz.id)
            .eq("company_id", cid);
        else if (uz.doklado_id !== id)
          log(
            `  duplicita v Doklade: prijatá ${z.invoiceNumber} (${z.organizationName}, ${z.totalPrice} €) — ${id} = ${uz.doklado_id}, prenesená raz`,
          );
        if (
          uz.id &&
          a.exportovane.has(id) &&
          (await dozauctuj(db, "purchase_invoices", cid, { id: uz.id }, a.teraz))
        )
          dozauctovane++;
        ex.prijatePodlaDoklado.add(id);
        s.sparovane++;
        continue;
      }
      const customer_id = await partnerId(db, cid, ex, m.partner, "dodavatel", s);
      const subory = await suboryDokladu(db, doklado, cid, id, "purchase-invoices", s);
      const { data: nova, error } = await db
        .from("purchase_invoices")
        .insert({
          ...m.hlavicka,
          company_id: cid,
          customer_id,
          ...subory.hlavny,
          int_poznamka: [m.hlavicka.int_poznamka, subory.dalsie].filter(Boolean).join("\n") || null,
          ...(a.exportovane.has(id) ? { exported_at: a.teraz } : {}),
        })
        .select("id")
        .single();
      if (error || !nova) throw new Error(error?.message ?? "prijatá faktúra sa nezapísala");
      if (k) ex.prijate.set(k, { id: nova.id, doklado_id: id });
      ex.prijatePodlaCislaSumy.set(
        klucCislaSumy(m.hlavicka.invoice_number, m.hlavicka.amount_total),
        {
          id: nova.id,
          doklado_id: id,
          cislo: m.hlavicka.invoice_number,
        },
      );
      ex.prijatePodlaDoklado.add(id);
      s.nove++;
    } catch (e) {
      s.chyby++;
      log(`  CHYBA prijatá ${id} ${z.invoiceNumber ?? ""}: ${(e as Error).message}`);
    }
  }

  // Bločky.
  for (const z of a.podlaDruhu.get("blocek") ?? []) {
    const id = String(z.documentId);
    try {
      if (ex.blockyPodlaDoklado.has(id)) {
        s.preskocene++;
        if (
          a.exportovane.has(id) &&
          (await dozauctuj(db, "expense_documents", cid, { doklado_id: id }, a.teraz))
        )
          dozauctovane++;
        continue;
      }
      const m = blocek(z, { ...o, exportovany: a.exportovane.has(id) });
      const k = klucBlocku(m.supplier_ico, m.document_number, m.issue_date, m.total_amount);
      const uz = ex.blocky.get(k);
      if (uz) {
        if (!uz.doklado_id)
          await db
            .from("expense_documents")
            .update({ doklado_id: id })
            .eq("id", uz.id)
            .eq("company_id", cid);
        else if (uz.doklado_id !== id)
          log(`  duplicita v Doklade: bloček ${id} = ${uz.doklado_id}, prenesený raz`);
        if (
          uz.id &&
          a.exportovane.has(id) &&
          (await dozauctuj(db, "expense_documents", cid, { id: uz.id }, a.teraz))
        )
          dozauctovane++;
        ex.blockyPodlaDoklado.add(id);
        s.sparovane++;
        continue;
      }
      const subory = await suboryDokladu(db, doklado, cid, id, "expense-receipts", s);
      const { data: novy, error } = await db
        .from("expense_documents")
        .insert({
          ...m,
          company_id: cid,
          ...subory.hlavny,
          int_poznamka: [m.int_poznamka, subory.dalsie].filter(Boolean).join("\n") || null,
          ...(a.exportovane.has(id) ? { exported_at: a.teraz } : {}),
        })
        .select("id")
        .single();
      if (error || !novy) throw new Error(error?.message ?? "bloček sa nezapísal");
      ex.blocky.set(k, { id: novy.id, doklado_id: id });
      ex.blockyPodlaDoklado.add(id);
      s.nove++;
    } catch (e) {
      s.chyby++;
      log(`  CHYBA bloček ${id}: ${(e as Error).message}`);
    }
  }
  if (dozauctovane)
    log(`  dozaúčtované (exportované v Doklade, vo Fakteri boli nezaúčtované): ${dozauctovane}`);
}

/** Súbory prijatého dokladu: hlavný do `file_path`, ďalšie vedľa a ich zoznam do poznámky. */
async function suboryDokladu(
  db: Db,
  doklado: DokladoKlient,
  cid: string,
  id: string,
  kos: string,
  s: Suhrn,
) {
  const hlavny: Record<string, unknown> = {};
  const dalsie: string[] = [];
  let prilohy: Awaited<ReturnType<DokladoKlient["prilohy"]>> = [];
  try {
    prilohy = await doklado.prilohy(id);
  } catch (e) {
    s.chyby++;
    log(`  prílohy ${id}: ${(e as Error).message}`);
  }
  for (const [i, p] of prilohy.entries()) {
    if (!p.downloadUrl) continue;
    try {
      const sub = await stiahni(p.downloadUrl);
      const cesta = `${cid}/doklado/${id}/${i}-${menoSuboru(p.fileName, `subor-${i}`)}`;
      await nahraj(db, kos, cesta, sub.bajty, sub.mime);
      s.prilohy++;
      if (p.fileType !== "secondary" && !hlavny.file_path) {
        Object.assign(hlavny, {
          file_path: cesta,
          file_mime: sub.mime,
          file_size: sub.bajty.length,
        });
      } else dalsie.push(cesta);
    } catch (e) {
      s.chyby++;
      log(`  súbor ${p.fileName} (${id}): ${(e as Error).message}`);
    }
  }
  return {
    hlavny,
    dalsie: dalsie.length ? `Ďalšie súbory z Doklada (${kos}): ${dalsie.join(", ")}` : null,
  };
}

main().catch((e) => {
  log(`ZLYHANIE: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
