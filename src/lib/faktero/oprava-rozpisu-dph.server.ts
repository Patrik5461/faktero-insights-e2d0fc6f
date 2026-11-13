/**
 * Beh opravy rozpisu DPH nad databázou — volá ho `scripts/oprava-rozpisu-dph.ts`
 * a vracia ho `scripts/oprava-rozpisu-dph-rollback.ts`.
 *
 * Rozhodovanie je v `oprava-rozpisu-dph.ts` (čisté funkcie); tu je len
 * načítanie, súbory, nové vyťaženie a zápis s auditom. Klient Supabase aj
 * prístup k súborom a AI sa dajú podstrčiť (testy s mockom), predvolené
 * implementácie sa načítajú až pri použití.
 *
 * Bezpečnosť zápisu:
 *  - predvolene nanečisto — bez `zapisat: true` sa do DB nezapíše nič;
 *  - pred každou zmenou sa do `oprava_rozpisu_dph_audit` uloží pôvodná aj nová
 *    hodnota; zápis ide s podmienkou `updated_at` = načítaná hodnota, takže
 *    doklad zmenený medzitým (človekom) sa neprepíše (konflikt, audit sa zmaže);
 *  - celková suma dokladu sa nemení nikdy.
 */
import {
  navrhOpravy,
  noveZUlozenehoAi,
  ochrany,
  odtlacokRozpisu,
  povodneHodnoty,
  PRESKOCIT,
  priznakKontroly,
  rucnaUprava,
  SUMOVE_POLIA,
  denDph,
  ulozenyStav,
  vyhodnot,
  zVytazenia,
  type FirmaOpravy,
  type NavrhOpravy,
  type NoveVytazenie,
  type Ochrana,
  type TabulkaOpravy,
  type Vyhodnotenie,
  type ZaznamHistorie,
} from "./oprava-rozpisu-dph";

type Klient = any;

export const AUDIT_TABULKA = "oprava_rozpisu_dph_audit";

/** Kbelík Storage so súbormi agendy. */
export const KBELIK: Record<TabulkaOpravy, string> = {
  purchase_invoices: "purchase-invoices",
  expense_documents: "expense-receipts",
  nespracovane_doklady: "nespracovane",
};

const AGENDA_HISTORIE: Partial<Record<TabulkaOpravy, string>> = {
  purchase_invoices: "prijata",
  expense_documents: "doklad",
};

export type Vysledok =
  | "ok"
  | "opravene"
  | "na_opravu_bez_ai"
  | "na_vytazenie"
  | "na_kontrolu"
  | "preskocene"
  | "konflikt"
  | "chyba";

export type RiadokReportu = {
  tabulka: TabulkaOpravy;
  id: string;
  firma: string;
  cislo: string;
  dodavatel: string;
  datum_dph: string;
  zdroj: string;
  bez_dph: number;
  dph: number;
  spolu: number;
  stav: Vyhodnotenie["stav"];
  vysledok: Vysledok;
  dovod: string;
  chyby: string;
  podozrenia: string;
  ochrany: string;
  rucne: string;
  ulozeny_rozpis: string;
  novy_rozpis: string;
  ai_volanie: "" | "ano" | "xml" | "vzorka";
};

export type ZavislostiOpravy = {
  /** Text súboru (textová vrstva PDF) a či nesie strojové XML (ISDOC/Factur-X). */
  textSuboru?: (
    sb: Klient,
    kbelik: string,
    cesta: string,
    mime: string | null,
  ) => Promise<{ text: string | null; maXml: boolean }>;
  /** Nové vyťaženie súboru (AI alebo vložené XML). */
  vytaz?: (
    sb: Klient,
    args: {
      bucket: string;
      path: string;
      mime: string | null;
      krajina: string | null;
      firmaId: string;
      datumDodania: string | null;
    },
  ) => Promise<NoveVytazenie | null>;
  /** Dnešný deň a čas (testy). */
  teraz?: () => Date;
  log?: (s: string) => void;
};

export type VolbyOpravy = {
  runId: string;
  /** Ostrý zápis. Bez neho sa nič nezapíše a AI sa nevolá (okrem vzorky). */
  zapisat?: boolean;
  firma?: string | null;
  tabulky?: TabulkaOpravy[];
  /** Povoliť zmenu aj v období, za ktoré už uplynul termín priznania (nie v uzavretom). */
  ajPoTermine?: boolean;
  /** Nečítať súbory (bez textu sa niektoré podozrenia nedajú overiť). */
  bezTextu?: boolean;
  /** Pri ostrom zápise označiť na kontrolu aj preskočené (odovzdané, uzavreté…). */
  oznacitPreskocene?: boolean;
  /** Nanečisto znova vyťažiť prvých N dokladov „na vyťaženie“ (stojí AI volania). */
  vytazitVzorku?: number;
  /** Strop AI volaní pri ostrom zápise. */
  limitAi?: number;
};

export type SuhrnOpravy = {
  runId: string;
  zapisat: boolean;
  skontrolovane: number;
  podlaVysledku: Record<Vysledok, number>;
  podlaTabulky: Record<string, Record<Vysledok, number>>;
  podlaChyby: Record<string, number>;
  podlaOchrany: Record<string, number>;
  odhadAiVolani: number;
  sXml: number;
  riadky: RiadokReportu[];
};

const PRAZDNY: Record<Vysledok, number> = {
  ok: 0,
  opravene: 0,
  na_opravu_bez_ai: 0,
  na_vytazenie: 0,
  na_kontrolu: 0,
  preskocene: 0,
  konflikt: 0,
  chyba: 0,
};

/** Celá tabuľka po 1000 (strop PostgREST), stabilne podľa id. */
async function vsetky(sb: Klient, tabulka: string, uprav?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let start = 0; ; start += 1000) {
    let q = sb.from(tabulka).select("*");
    if (uprav) q = uprav(q);
    const { data, error } = await q.order("id").range(start, start + 999);
    if (error) throw new Error(`${tabulka}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function historiaDokladov(
  sb: Klient,
  tabulka: TabulkaOpravy,
  ids: string[],
): Promise<Map<string, ZaznamHistorie[]>> {
  const out = new Map<string, ZaznamHistorie[]>();
  const agenda = AGENDA_HISTORIE[tabulka];
  if (!agenda || !ids.length) return out;
  const polia = SUMOVE_POLIA[tabulka as "purchase_invoices"];
  for (let i = 0; i < ids.length; i += 200) {
    const kus = ids.slice(i, i + 200);
    for (let start = 0; ; start += 1000) {
      const { data, error } = await sb
        .from("historia_dokladov")
        .select("id, doklad_id, pole, kto, kto_typ, kedy")
        .eq("agenda", agenda)
        .in("doklad_id", kus)
        .in("pole", polia)
        .order("id")
        .range(start, start + 999);
      if (error) throw new Error(`historia_dokladov: ${error.message}`);
      for (const h of data ?? []) {
        const z = out.get(h.doklad_id) ?? [];
        z.push({ pole: h.pole, kto: h.kto ?? null, kto_typ: h.kto_typ ?? null, kedy: h.kedy });
        out.set(h.doklad_id, z);
      }
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

const fmtRozpis = (
  r: { sadzba: number; zaklad: number; dph: number; pdp?: boolean; vat_category?: string | null }[],
) => odtlacokRozpisu(r as any);

function zakladReportu(
  tabulka: TabulkaOpravy,
  row: any,
  firma: FirmaOpravy | undefined,
  st: ReturnType<typeof ulozenyStav>,
) {
  const u = tabulka === "nespracovane_doklady" ? (row.udaje ?? {}) : null;
  return {
    tabulka,
    id: String(row.id),
    firma: String(firma?.name ?? row.company_id ?? ""),
    cislo: String(row.invoice_number ?? row.document_number ?? u?.cislo ?? ""),
    dodavatel: String(row.supplier_name ?? u?.dodavatel?.nazov ?? ""),
    datum_dph: String(denDph(tabulka, row) ?? st.datumDodania ?? ""),
    zdroj: String(row.source ?? row.zdroj ?? ""),
    bez_dph: st.bezDph,
    dph: st.dph,
    spolu: st.spolu,
  };
}

/** Prejde doklady, vyhodnotí ich a (pri `zapisat`) opraví alebo označí. */
export async function spustiOpravu(
  sb: Klient,
  volby: VolbyOpravy,
  deps: ZavislostiOpravy = {},
): Promise<SuhrnOpravy> {
  const log = deps.log ?? ((s: string) => console.error(s));
  const teraz = (deps.teraz ?? (() => new Date()))();
  const terazIso = teraz.toISOString();
  const dnes = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(teraz);
  const textSuboru = deps.textSuboru ?? predvolenyTextSuboru;
  const vytaz = deps.vytaz ?? predvoleneVytazenie;
  const tabulky = volby.tabulky ?? [
    "purchase_invoices",
    "expense_documents",
    "nespracovane_doklady",
  ];

  const firmy = await vsetky(sb, "companies", (q) => (volby.firma ? q.eq("id", volby.firma) : q));
  const podlaFirmy = new Map<string, FirmaOpravy>(firmy.map((f: any) => [f.id, f]));

  const suhrn: SuhrnOpravy = {
    runId: volby.runId,
    zapisat: !!volby.zapisat,
    skontrolovane: 0,
    podlaVysledku: { ...PRAZDNY },
    podlaTabulky: {},
    podlaChyby: {},
    podlaOchrany: {},
    odhadAiVolani: 0,
    sXml: 0,
    riadky: [],
  };
  let aiVolania = 0;
  let vzorka = volby.vytazitVzorku ?? 0;

  for (const tabulka of tabulky) {
    const riadky = await vsetky(sb, tabulka, (q) =>
      volby.firma ? q.eq("company_id", volby.firma) : q,
    );
    suhrn.podlaTabulky[tabulka] = { ...PRAZDNY };
    log(`${tabulka}: ${riadky.length} dokladov`);

    // 1. kolo — kontrola uložených hodnôt bez súborov.
    const prve = riadky.map((row) => {
      const firma = podlaFirmy.get(row.company_id);
      const st = ulozenyStav(tabulka, row, firma);
      return { row, firma, st, v: vyhodnot(st, null) };
    });
    const ids = prve.map((x) => String(x.row.id));
    const historia = await historiaDokladov(sb, tabulka, ids);

    for (const { row, firma, st, v: v0 } of prve) {
      if (!firma) continue; // doklad firmy mimo výberu
      suhrn.skontrolovane++;
      const zaklad = zakladReportu(tabulka, row, firma, st);
      const rucne = rucnaUprava(tabulka, row, historia.get(String(row.id)) ?? []);
      const och = ochrany({
        tabulka,
        row,
        firma,
        stav: st,
        rucne,
        dnes,
        ajPoTermine: volby.ajPoTermine,
      });
      const preskocit = och.filter((o) => PRESKOCIT.has(o));
      const mozeMenit =
        !preskocit.length &&
        zVytazenia(tabulka, row) &&
        !och.includes("rucne_upravene") &&
        !och.includes("mozno_rucne_upravene") &&
        !och.includes("zahranicne_sadzby") &&
        !och.includes("cudzia_mena");

      // 2. kolo — text súboru (len kde má zmysel: doklad sa smie opraviť).
      let v = v0;
      let maXml = false;
      let text: string | null = null;
      if (mozeMenit && row.file_path && !volby.bezTextu) {
        try {
          const t = await textSuboru(sb, KBELIK[tabulka], row.file_path, row.file_mime ?? null);
          maXml = t.maXml;
          text = t.text;
          if (t.text) v = vyhodnot(st, t.text);
        } catch (e: any) {
          log(`  ${row.id}: súbor sa nedal prečítať (${String(e?.message ?? e).slice(0, 120)})`);
        }
      }

      const r: RiadokReportu = {
        ...zaklad,
        stav: v.stav,
        vysledok: "ok",
        dovod: "",
        chyby: v.kontrola.chyby.map((c) => `${c.kod}: ${c.sprava}`).join(" | "),
        podozrenia: v.podozrenia.map((p) => `${p.kod}: ${p.sprava}`).join(" | "),
        ochrany: och.join(","),
        rucne: rucne.stav === "nie" ? "" : `${rucne.stav}: ${rucne.dovod}`,
        ulozeny_rozpis: fmtRozpis(st.rozpis),
        novy_rozpis: "",
        ai_volanie: "",
      };
      const zapocitaj = () => {
        suhrn.podlaVysledku[r.vysledok]++;
        suhrn.podlaTabulky[tabulka][r.vysledok]++;
        if (r.vysledok !== "ok") {
          for (const c of v.kontrola.chyby)
            suhrn.podlaChyby[c.kod] = (suhrn.podlaChyby[c.kod] ?? 0) + 1;
          for (const p of v.podozrenia)
            suhrn.podlaChyby[p.kod] = (suhrn.podlaChyby[p.kod] ?? 0) + 1;
          for (const o of och) suhrn.podlaOchrany[o] = (suhrn.podlaOchrany[o] ?? 0) + 1;
        }
        suhrn.riadky.push(r);
      };

      if (v.stav === "ok") {
        zapocitaj();
        continue;
      }

      // Preskočené — len log (voliteľne označiť).
      if (preskocit.length) {
        r.vysledok = "preskocene";
        r.dovod = preskocit.join(",");
        if (
          volby.zapisat &&
          volby.oznacitPreskocene &&
          !row.deleted_at &&
          tabulka !== "nespracovane_doklady"
        )
          await oznacNaKontrolu(
            sb,
            tabulka,
            row,
            `preskočené: ${r.dovod}`,
            v,
            volby.runId,
            terazIso,
            log,
          );
        zapocitaj();
        continue;
      }
      if (!mozeMenit) {
        r.vysledok = "na_kontrolu";
        r.dovod = och.filter((o) => o !== "bez_suboru").join(",") || "nedá sa opraviť automaticky";
        if (volby.zapisat)
          await oznacNaKontrolu(sb, tabulka, row, r.dovod, v, volby.runId, terazIso, log);
        zapocitaj();
        continue;
      }

      // Bez nového volania AI: opravený výpočet nad uloženým výsledkom AI.
      const ulozeneAi =
        tabulka === "expense_documents"
          ? row.ai_raw
          : tabulka === "nespracovane_doklady"
            ? row.ai
            : null;
      let navrh: NavrhOpravy | null = null;
      const zUlozeneho = noveZUlozenehoAi(ulozeneAi, {
        krajina: st.krajina,
        datumDodania: st.datumDodania,
      });
      if (zUlozeneho) {
        const n = navrhOpravy({ tabulka, row, stav: st, nove: { ...zUlozeneho, text } });
        if (n.akcia === "prepisat") navrh = n;
      }

      if (!navrh) {
        if (!row.file_path) {
          r.vysledok = "na_kontrolu";
          r.dovod = "bez súboru — nové vyťaženie nie je z čoho";
          if (volby.zapisat)
            await oznacNaKontrolu(sb, tabulka, row, r.dovod, v, volby.runId, terazIso, log);
          zapocitaj();
          continue;
        }
        const ostro = volby.zapisat && (volby.limitAi == null || aiVolania < volby.limitAi);
        const vzorkaTeraz = !volby.zapisat && vzorka > 0;
        if (!ostro && !vzorkaTeraz) {
          r.vysledok = "na_vytazenie";
          r.dovod = volby.zapisat
            ? "prekročený limit AI volaní"
            : "nanečisto — nové vyťaženie sa nevolá";
          r.ai_volanie = maXml ? "xml" : "ano";
          suhrn.odhadAiVolani += maXml ? 0 : 1;
          if (maXml) suhrn.sXml++;
          zapocitaj();
          continue;
        }
        if (vzorkaTeraz) vzorka--;
        if (!maXml) aiVolania++;
        r.ai_volanie = vzorkaTeraz ? "vzorka" : maXml ? "xml" : "ano";
        try {
          const nove = await vytaz(sb, {
            bucket: KBELIK[tabulka],
            path: row.file_path,
            mime: row.file_mime ?? null,
            krajina: firma.country ?? null,
            firmaId: firma.id,
            datumDodania: st.datumDodania,
          });
          // Podozrenia nového rozpisu sa overujú voči textu celého súboru.
          const n: NavrhOpravy = nove
            ? navrhOpravy({ tabulka, row, stav: st, nove: { ...nove, text } })
            : { akcia: "na_kontrolu", dovod: "nové vyťaženie nič neprečítalo" };
          if (n.akcia === "na_kontrolu") {
            r.vysledok = "na_kontrolu";
            r.dovod = n.dovod;
            r.novy_rozpis = nove ? fmtRozpis(nove.rozpis) : "";
            if (volby.zapisat)
              await oznacNaKontrolu(sb, tabulka, row, n.dovod, v, volby.runId, terazIso, log);
            zapocitaj();
            continue;
          }
          navrh = n;
        } catch (e: any) {
          r.vysledok = "chyba";
          r.dovod = `vyťaženie zlyhalo: ${String(e?.message ?? e).slice(0, 200)}`;
          zapocitaj();
          continue;
        }
      }

      // Máme opravu.
      r.novy_rozpis = navrh.popis.split(" → ")[1] ?? navrh.popis;
      if (!volby.zapisat) {
        r.vysledok = r.ai_volanie === "vzorka" ? "na_vytazenie" : "na_opravu_bez_ai";
        r.dovod =
          r.ai_volanie === "vzorka"
            ? `vzorka: ${navrh.popis}`
            : `z uloženého výsledku AI: ${navrh.popis}`;
        zapocitaj();
        continue;
      }
      const z = await prepis(
        sb,
        tabulka,
        row,
        navrh.zmeny,
        `oprava rozpisu: ${navrh.popis}`,
        volby.runId,
      );
      r.vysledok = z === "ok" ? "opravene" : z === "konflikt" ? "konflikt" : "chyba";
      r.dovod =
        z === "ok" ? navrh.popis : z === "konflikt" ? "doklad sa medzitým zmenil" : String(z);
      zapocitaj();
    }
  }
  return suhrn;
}

/** Zápis s auditom: najprv audit, potom zmena s podmienkou na `updated_at`. */
export async function prepis(
  sb: Klient,
  tabulka: TabulkaOpravy,
  row: Record<string, any>,
  zmeny: Record<string, unknown>,
  dovod: string,
  runId: string,
  akcia: "prepis" | "na_kontrolu" | "rollback" = "prepis",
): Promise<"ok" | "konflikt" | string> {
  const stare = povodneHodnoty(row, zmeny);
  const a = await sb
    .from(AUDIT_TABULKA)
    .insert({
      run_id: runId,
      tabulka,
      document_id: row.id,
      company_id: row.company_id ?? null,
      akcia,
      old_values: stare,
      new_values: zmeny,
      reason: dovod.slice(0, 2000),
    })
    .select("id")
    .single();
  if (a.error) return `audit: ${a.error.message}`;
  let q = sb.from(tabulka).update(zmeny).eq("id", row.id);
  q = row.updated_at ? q.eq("updated_at", row.updated_at) : q;
  const u = await q.select("id");
  if (u.error || !u.data?.length) {
    await sb.from(AUDIT_TABULKA).delete().eq("id", a.data.id);
    return u.error ? `zápis: ${u.error.message}` : "konflikt";
  }
  return "ok";
}

async function oznacNaKontrolu(
  sb: Klient,
  tabulka: TabulkaOpravy,
  row: Record<string, any>,
  dovod: string,
  v: Vyhodnotenie,
  runId: string,
  teraz: string,
  log: (s: string) => void,
) {
  let zmeny: Record<string, unknown>;
  if (tabulka === "nespracovane_doklady") {
    // Nespracované nesú kontrolu v údajoch formulára (`udaje.kontrolaDph`).
    const p = priznakKontroly(dovod, v, teraz);
    if (row.udaje?.kontrolaDph?.dovod === p.na_kontrolu_dovod) return;
    const st = ulozenyStav(tabulka, row);
    zmeny = {
      udaje: {
        ...(row.udaje ?? {}),
        kontrolaDph: { bezDph: st.bezDph, dph: st.dph, dovod: p.na_kontrolu_dovod },
      },
    };
  } else {
    const p = priznakKontroly(dovod, v, teraz);
    if (row.na_kontrolu_at && row.na_kontrolu_dovod === p.na_kontrolu_dovod) return;
    zmeny = {
      na_kontrolu_at: row.na_kontrolu_at ?? p.na_kontrolu_at,
      na_kontrolu_dovod: p.na_kontrolu_dovod,
    };
  }
  const z = await prepis(sb, tabulka, row, zmeny, `na kontrolu: ${dovod}`, runId, "na_kontrolu");
  if (z !== "ok") log(`  ${row.id}: označenie na kontrolu sa nezapísalo (${z})`);
}

/* ───────────────────────────── rollback ───────────────────────────── */

/** JSON s usporiadanými kľúčmi a čísla na 6 desatinných miest — jsonb poradie kľúčov mení. */
export function kanonicky(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (x === undefined) return null;
    if (typeof x === "number") return Math.round(x * 1e6) / 1e6;
    if (typeof x === "string" && /^-?\d+(\.\d+)?$/.test(x))
      return Math.round(Number(x) * 1e6) / 1e6;
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === "object")
      return Object.fromEntries(
        Object.keys(x as object)
          .sort()
          .map((k) => [k, norm((x as any)[k])]),
      );
    return x;
  };
  return JSON.stringify(norm(v));
}

export type VysledokRollbacku = {
  runId: string;
  zapisat: boolean;
  vratene: number;
  naVratenie: number;
  konflikty: { id: string; tabulka: string; pole: string }[];
  chyby: string[];
};

/**
 * Vráti zmeny behu `runId` (od poslednej po prvú). Zmenu, ktorú medzitým
 * niekto prepísal (aktuálna hodnota ≠ `new_values`), nevráti — nahlási
 * konflikt; `vynutit` ju vráti aj tak.
 */
export async function vratBeh(
  sb: Klient,
  runId: string,
  volby: { zapisat?: boolean; vynutit?: boolean; log?: (s: string) => void } = {},
): Promise<VysledokRollbacku> {
  const log = volby.log ?? ((s: string) => console.error(s));
  const audit = await vsetky(sb, AUDIT_TABULKA, (q) =>
    q.eq("run_id", runId).neq("akcia", "rollback"),
  );
  audit.sort((a, b) => Number(b.id) - Number(a.id));
  const out: VysledokRollbacku = {
    runId,
    zapisat: !!volby.zapisat,
    vratene: 0,
    naVratenie: 0,
    konflikty: [],
    chyby: [],
  };
  for (const a of audit) {
    const { data: row, error } = await sb
      .from(a.tabulka)
      .select("*")
      .eq("id", a.document_id)
      .maybeSingle();
    if (error || !row) {
      out.chyby.push(`${a.tabulka}/${a.document_id}: doklad sa nenašiel`);
      continue;
    }
    const nove = (a.new_values ?? {}) as Record<string, unknown>;
    const zmenene = Object.keys(nove).find((k) => kanonicky(row[k]) !== kanonicky(nove[k]));
    if (zmenene && !volby.vynutit) {
      out.konflikty.push({ id: a.document_id, tabulka: a.tabulka, pole: zmenene });
      log(`  konflikt ${a.tabulka}/${a.document_id}: ${zmenene} sa od behu zmenil — nevraciam`);
      continue;
    }
    out.naVratenie++;
    if (!volby.zapisat) continue;
    const z = await prepis(
      sb,
      a.tabulka,
      row,
      (a.old_values ?? {}) as Record<string, unknown>,
      `rollback ${runId} (audit ${a.id})`,
      `rollback:${runId}`,
      "rollback",
    );
    if (z === "ok") out.vratene++;
    else out.chyby.push(`${a.tabulka}/${a.document_id}: ${z}`);
  }
  return out;
}

/* ───────────────────────────── predvolené I/O ───────────────────────────── */

async function stiahni(sb: Klient, kbelik: string, cesta: string): Promise<Uint8Array> {
  const { data, error } = await sb.storage.from(kbelik).download(cesta);
  if (error || !data) throw new Error(`${kbelik}/${cesta}: ${error?.message ?? "nenájdený"}`);
  return new Uint8Array(await data.arrayBuffer());
}

/** Textová vrstva PDF (unpdf) + či PDF/XML nesie strojové údaje faktúry. */
export async function predvolenyTextSuboru(
  sb: Klient,
  kbelik: string,
  cesta: string,
  mime: string | null,
): Promise<{ text: string | null; maXml: boolean }> {
  const bajty = await stiahni(sb, kbelik, cesta);
  const jePdf = bajty[0] === 0x25 && bajty[1] === 0x50 && bajty[2] === 0x44 && bajty[3] === 0x46;
  let maXml = false;
  try {
    const { dokladZPrilohy } = await import("./pdf-prilohy.server");
    maXml = !!(await dokladZPrilohy(bajty, mime ?? (jePdf ? "application/pdf" : "")));
  } catch {
    maXml = false;
  }
  if (!jePdf) return { text: null, maXml };
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bajty.slice(), { verbosity: 0 } as any);
  const strany: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const s = await pdf.getPage(i);
    const obsah = await s.getTextContent();
    // Riadky podľa súradnice y — kľúčové slová (DPH, Základ) musia ostať pri percentách.
    let posledneY: number | null = null;
    let riadok = "";
    const riadky: string[] = [];
    for (const it of obsah.items as any[]) {
      const y = Math.round(it.transform?.[5] ?? 0);
      if (posledneY !== null && Math.abs(y - posledneY) > 2) {
        riadky.push(riadok);
        riadok = "";
      }
      riadok += (riadok ? " " : "") + String(it.str ?? "");
      posledneY = y;
      if (it.hasEOL) {
        riadky.push(riadok);
        riadok = "";
        posledneY = null;
      }
    }
    if (riadok) riadky.push(riadok);
    strany.push(riadky.filter((x) => x.trim()).join("\n"));
  }
  const text = strany.join("\n").trim();
  return { text: text.length > 20 ? text : null, maXml };
}

/** Nové vyťaženie cez `vytazRozpisDph` (Agent A) + kategórie z `rozpisZVytazenia`. */
export async function predvoleneVytazenie(
  sb: Klient,
  args: {
    bucket: string;
    path: string;
    mime: string | null;
    krajina: string | null;
    firmaId: string;
    datumDodania: string | null;
  },
): Promise<NoveVytazenie | null> {
  const { vytazRozpisDph } = await import("./rozpis-dph-vytazenie.server");
  const res = await vytazRozpisDph(sb, {
    bucket: args.bucket,
    path: args.path,
    mime: args.mime,
    krajina: args.krajina,
    firmaId: args.firmaId,
  });
  if (!res) return null;
  const { rozpisZVytazenia } = await import("./rozpis-dph-vytazeny");
  const { aiSOdpoctomZalohy } = await import("./odpocet-zalohy-vytazenie");
  const v = rozpisZVytazenia(
    aiSOdpoctomZalohy(res.ai, { krajina: args.krajina ?? "SK", den: args.datumDodania }).ai,
    { krajina: args.krajina ?? "SK", datumDodania: args.datumDodania },
  );
  return {
    ai: res.ai,
    rozpis: v.rozpis.map((r) => ({
      sadzba: r.sadzba,
      zaklad: r.zaklad,
      dph: r.dph,
      vat_category: r.vat_category,
    })),
    spolu: res.spolu || null,
    prenesenie: v.prenesenie || res.reverseCharge,
  };
}

export type { Ochrana };
