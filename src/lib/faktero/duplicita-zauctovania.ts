/*
  Duplicitný doklad sa nesmie zaúčtovať.

  Tá istá faktúra nahratá dvakrát (mailom aj ručne, upomienka s kópiou) či
  bloček naskenovaný dvakrát by v Pohode bol dvakrát náklad aj odpočet DPH.
  Upozornenie pri nahratí človek môže odkliknúť („uložiť aj tak“) — preto sa
  to isté pravidlo stráži ešte raz pri zaúčtovaní a pred odovzdaním do Pohody:
  ručne, hromadne, automatom, cez API aj v konektore.

  Pravidlo (čisté funkcie, bez databázy):

  - Porovnávajú sa len doklady **tej istej firmy a toho istého druhu** —
    prijatá faktúra s prijatou (bežná s bežnou, zálohová so zálohovou),
    bloček s bločkom. Dobropis a faktúra, ktorú opravuje, nie sú duplicita.
  - Druhý doklad sa ráta, len keď nie je zmazaný, stornovaný ani koncept.
  - **Prijatá faktúra:** rovnaké číslo dokladu dodávateľa (bez medzier,
    pomlčiek a vedúcich núl), rovnaký dodávateľ — IČO, keď ho majú oba,
    inak názov bez diakritiky a právnej formy — a rovnaká suma aj rok
    vystavenia (neznáma suma či dátum sa za rozdiel nepočíta). Taká faktúra
    sa **ani neuloží** (`chybaUlozenejPrijatej`, spúšťač v databáze).
    Rovnaké číslo od toho istého dodávateľa s inou sumou alebo z iného roka
    je len **možná duplicita** (`moznaDuplicita`) — Alza a iní opakujú čísla
    v ďalších rokoch; človek ju po potvrdení „Nie je duplicita“ uloží a
    zaúčtovanie ju nezastaví.
  - **Bloček:** rovnaký kód z eKasy (QR nesie jednoznačné UID/OKP dokladu);
    keď ho oba nemajú, rovnaký dodávateľ (IČO, inak názov) + dátum + suma.
    Duplicitný bloček sa ani neuloží (`chybaUlozenehoBlocku`).

  Zaúčtovať sa nedá doklad, ktorý má aspoň jednu duplicitu: keď je druhý už
  zaúčtovaný či odovzdaný, tento je navyše; keď nie je ani jeden, oba čakajú,
  kým sa jeden nezmaže.
*/

import { normCislo, normNazov } from "./prijate-duplicity";

export type DruhDuplicity = "prijata" | "blocek";

/** Doklad zjednotený na porovnanie — `zPrijatej` / `zBlocku`. */
export type DokladNaPorovnanie = {
  id: string;
  druh: DruhDuplicity;
  /** Číslo dokladu dodávateľa (invoice_number / document_number). */
  cislo: string;
  /** Číslo tak, ako je na doklade — do hlášky. */
  cisloText: string;
  /** `type` prijatej (regular, proforma…); pri bločku prázdny. */
  typ: string;
  /** Dobropis / opravný doklad (záporná suma alebo odkaz na opravovanú). */
  dobropis: boolean;
  ico: string;
  nazov: string;
  datum: string;
  /** Suma v centoch (absolútna hodnota), null = neznáma. */
  centy: number | null;
  qr: string;
  /** Zmazaný, stornovaný alebo koncept — s ním sa neporovnáva. */
  neplatny: boolean;
  zauctovany: boolean;
  odovzdany: boolean;
  /** Bloček uložený vedome „aj tak“ — človek potvrdil, že nejde o duplicitu. */
  potvrdena?: boolean;
};

/** Druhý doklad v páre — čo treba ukázať v hláške a v odkaze. */
export type Duplicita = {
  id: string;
  cislo: string;
  zauctovany: boolean;
};

type Riadok = Record<string, any>;

const alnum = (v: unknown) =>
  String(v ?? "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase();
const centy = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : null;
};

const bezCisla = (v: unknown) => String(v ?? "").trim().toLowerCase() === "bez čísla";

export function zPrijatej(r: Riadok): DokladNaPorovnanie {
  const suma = Number(r.amount_total);
  return {
    id: String(r.id ?? ""),
    druh: "prijata",
    // „bez čísla“ dosadí vytvorenie z Nespracovaných — dve také nie sú tá istá faktúra.
    cislo: bezCisla(r.invoice_number) ? "" : normCislo(r.invoice_number),
    cisloText: String(r.invoice_number ?? "").trim(),
    typ: String(r.type ?? "regular"),
    dobropis: (Number.isFinite(suma) && suma < 0) || Boolean(r.opravuje_cislo || r.opravuje_id),
    ico: alnum(r.supplier_ico),
    nazov: normNazov(r.supplier_name),
    datum: String(r.issue_date ?? "").slice(0, 10),
    centy: centy(r.amount_total),
    qr: "",
    neplatny: Boolean(r.deleted_at) || r.status === "cancelled" || r.status === "draft",
    zauctovany: Boolean(r.zauctovane_at),
    odovzdany: Boolean(r.exported_at),
  };
}

export function zBlocku(r: Riadok): DokladNaPorovnanie {
  const suma = Number(r.total_amount);
  return {
    id: String(r.id ?? ""),
    druh: "blocek",
    cislo: normCislo(r.document_number),
    cisloText: String(r.document_number ?? r.supplier_name ?? "").trim(),
    typ: "",
    dobropis: Number.isFinite(suma) && suma < 0,
    ico: alnum(r.supplier_ico),
    nazov: normNazov(r.supplier_name),
    datum: String(r.issue_date ?? "").slice(0, 10),
    centy: centy(r.total_amount),
    qr: String(r.qr_raw ?? "")
      .trim()
      .toLowerCase(),
    neplatny: Boolean(r.deleted_at) || r.status === "cancelled",
    potvrdena: Boolean(r.duplicita_potvrdena),
    zauctovany: Boolean(r.zauctovane_at),
    odovzdany: Boolean(r.exported_at),
  };
}

export const naPorovnanie = (druh: DruhDuplicity, r: Riadok) =>
  druh === "prijata" ? zPrijatej(r) : zBlocku(r);

/** Ten istý dodávateľ: IČO, keď ho majú oba, inak názov. Nevieme nič = nie. */
function rovnakyDodavatel(a: DokladNaPorovnanie, b: DokladNaPorovnanie): boolean {
  if (a.ico && b.ico) return a.ico === b.ico;
  return Boolean(a.nazov) && a.nazov === b.nazov;
}

/** Prijaté faktúry s rovnakým číslom od toho istého dodávateľa (bez ohľadu na sumu a rok). */
function rovnakeCisloOdDodavatela(a: DokladNaPorovnanie, b: DokladNaPorovnanie): boolean {
  if (!a.id || a.id === b.id) return false;
  if (a.druh !== "prijata" || b.druh !== "prijata" || a.neplatny || b.neplatny) return false;
  // Dobropis a faktúra, ktorú opravuje, majú často to isté číslo — nie sú to dva rovnaké doklady.
  if (a.dobropis !== b.dobropis) return false;
  if (a.typ !== b.typ) return false;
  if (!a.cislo || a.cislo !== b.cislo) return false;
  return rovnakyDodavatel(a, b);
}

/** Rovnaká suma a rok vystavenia — neznáme sa za rozdiel nepočíta. */
function rovnakaSumaARok(a: DokladNaPorovnanie, b: DokladNaPorovnanie): boolean {
  if (a.centy != null && b.centy != null && a.centy !== b.centy) return false;
  const ra = a.datum.slice(0, 4);
  const rb = b.datum.slice(0, 4);
  return !ra || !rb || ra === rb;
}

/**
 * Možná duplicita prijatej faktúry: rovnaké číslo od toho istého dodávateľa,
 * ale iná suma alebo iný rok. Upozorní, uložiť sa dá po potvrdení.
 */
export function moznaDuplicita(a: DokladNaPorovnanie, b: DokladNaPorovnanie): boolean {
  return rovnakeCisloOdDodavatela(a, b) && !rovnakaSumaARok(a, b);
}

/** Sú `a` a `b` ten istý doklad (podľa pravidla vyššie)? */
export function suDuplicitne(a: DokladNaPorovnanie, b: DokladNaPorovnanie): boolean {
  if (!a.id || a.id === b.id) return false;
  if (a.druh !== b.druh || a.neplatny || b.neplatny) return false;
  if (a.druh === "prijata") return rovnakeCisloOdDodavatela(a, b) && rovnakaSumaARok(a, b);
  // Dobropis a faktúra, ktorú opravuje, majú často to isté číslo — nie sú to dva rovnaké doklady.
  if (a.dobropis !== b.dobropis) return false;
  // Bloček: kód eKasy (UID/OKP) je jednoznačný — dva rôzne kódy sú dva nákupy.
  if (a.qr && b.qr) return a.qr === b.qr;
  // Vedome uložený „aj tak“ (dva parkovacie lístky po 2 € v ten istý deň).
  if (a.potvrdena || b.potvrdena) return false;
  /*
    Bez QR na oboch: rôzne čísla dokladu sú dva rôzne nákupy (audit 8. 11.).
    Keď QR má jeden z nich, číslo z fotky býva prečítané inak — neplatí.
  */
  if (!a.qr && !b.qr && a.cislo && b.cislo && a.cislo !== b.cislo) return false;
  // Inak rovnaký dodávateľ, deň a suma (Patrik 3. 11.: „nedovoľ ukladať duplicity bločkov“).
  if (!rovnakyDodavatel(a, b)) return false;
  if (!a.datum || a.datum !== b.datum) return false;
  return a.centy != null && a.centy === b.centy;
}

/** Duplicity dokladu medzi kandidátmi (bez neho samého). */
export function duplicityDokladu(
  doklad: DokladNaPorovnanie,
  kandidati: DokladNaPorovnanie[],
): Duplicita[] {
  const out: Duplicita[] = [];
  const videne = new Set<string>();
  for (const k of kandidati) {
    if (videne.has(k.id) || !suDuplicitne(doklad, k)) continue;
    videne.add(k.id);
    out.push({ id: k.id, cislo: k.cisloText, zauctovany: k.zauctovany || k.odovzdany });
  }
  // Zaúčtované navrch — hláška ukáže najprv ten, ktorý platí.
  return out.sort((x, y) => Number(y.zauctovany) - Number(x.zauctovany));
}

/** Duplicity v jednom zozname riadkov (id → druhé doklady). */
export function mapaDuplicit(druh: DruhDuplicity, riadky: Riadok[]): Map<string, Duplicita[]> {
  const doklady = riadky.map((r) => naPorovnanie(druh, r));
  // Skupiny podľa čísla (faktúry) alebo dátumu/QR (bločky) — nie každý s každým.
  const skupiny = new Map<string, DokladNaPorovnanie[]>();
  const pridaj = (k: string, d: DokladNaPorovnanie) => {
    if (!k) return;
    const s = skupiny.get(k) ?? [];
    s.push(d);
    skupiny.set(k, s);
  };
  for (const d of doklady) {
    if (druh === "prijata") pridaj(`c:${d.cislo}`, d);
    else {
      pridaj(d.qr ? `q:${d.qr}` : "", d);
      pridaj(d.datum ? `d:${d.datum}` : "", d);
    }
  }
  const out = new Map<string, Duplicita[]>();
  for (const s of skupiny.values()) {
    if (s.length < 2) continue;
    for (const d of s) {
      const dup = duplicityDokladu(d, s);
      if (!dup.length) continue;
      const uz = out.get(d.id) ?? [];
      for (const x of dup) if (!uz.some((y) => y.id === x.id)) uz.push(x);
      out.set(d.id, uz);
    }
  }
  return out;
}

/** Predpona hlášky — podľa nej ju rozhranie aj testy spoznajú. */
export const PREDPONA_DUPLICITY_ZAUCTOVANIA = "Duplicitný doklad";

/**
 * Hláška, prečo sa doklad nezaúčtuje (null = nie je duplicitný). Server ju
 * dáva do zoznamu vynechaných a kontroly pred Pohodou; rozhranie má vlastný
 * preklad s odkazom.
 */
export function textDuplicity(druhe: Duplicita[]): string | null {
  if (!druhe.length) return null;
  const z = druhe.find((d) => d.zauctovany);
  const cisla = druhe.map((d) => d.cislo || "bez čísla").join(", ");
  return z
    ? `${PREDPONA_DUPLICITY_ZAUCTOVANIA} — rovnaký doklad (${z.cislo || "bez čísla"}) je už zaúčtovaný; tento zmažte, nezaúčtujte ho`
    : `${PREDPONA_DUPLICITY_ZAUCTOVANIA} — rovnaký doklad (${cisla}) je v evidencii viackrát; zaúčtovať sa dá až po zmazaní jedného z nich`;
}

/* ───────────── uloženie bločku ───────────── */

/** Začiatok chyby pri ukladaní duplicitného bločku — appka aj web ju ukážu. */
export const PREDPONA_ULOZENEHO_BLOCKU = "Tento bloček už je uložený: ";

function datumSk(d: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ""));
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : "";
}

/** „Shell Slovakia, 20. 9. 2026, 70,00 EUR“ */
export function popisBlocku(r: Riadok): string {
  const suma =
    r.total_amount == null || r.total_amount === ""
      ? ""
      : `${Number(r.total_amount).toFixed(2).replace(".", ",")} ${r.currency || "EUR"}`;
  return [String(r.supplier_name ?? "").trim() || "bez dodávateľa", datumSk(r.issue_date), suma]
    .filter(Boolean)
    .join(", ");
}

/** Chyba pri uložení — id na konci v hranatých zátvorkách nesie odkaz „otvoriť“. */
export function chybaUlozenehoBlocku(r: Riadok): string {
  return `${PREDPONA_ULOZENEHO_BLOCKU}${popisBlocku(r)} [${r.id}]`;
}

/** Rozloží chybu z `chybaUlozenehoBlocku` (null = iná chyba). */
export function rozlozChybuBlocku(sprava: unknown): { popis: string; id: string | null } | null {
  const s = String(sprava ?? "");
  const i = s.indexOf(PREDPONA_ULOZENEHO_BLOCKU);
  if (i < 0) return null;
  const zvysok = s.slice(i + PREDPONA_ULOZENEHO_BLOCKU.length);
  const m = /\s*\[([0-9a-f-]{36})\]\s*$/i.exec(zvysok);
  return { popis: m ? zvysok.slice(0, m.index).trim() : zvysok.trim(), id: m ? m[1] : null };
}

/* ───────────── uloženie prijatej faktúry ───────────── */

/** Začiatok chyby pri ukladaní duplicitnej prijatej faktúry (aj zo spúšťača v DB). */
export const PREDPONA_ULOZENEJ_PRIJATEJ = "Táto faktúra už je v evidencii: ";

/** „1126817, MOKOŠÁK PLUS s.r.o., 78,30 EUR“ */
export function popisPrijatej(r: Riadok): string {
  const suma =
    r.amount_total == null || r.amount_total === ""
      ? ""
      : `${Number(r.amount_total).toFixed(2).replace(".", ",")} ${r.currency || "EUR"}`;
  return [
    String(r.invoice_number ?? "").trim() || "bez čísla",
    String(r.supplier_name ?? "").trim() || "bez dodávateľa",
    suma,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Chyba pri uložení — id na konci v hranatých zátvorkách nesie odkaz „Otvoriť“. */
export function chybaUlozenejPrijatej(r: Riadok): string {
  return `${PREDPONA_ULOZENEJ_PRIJATEJ}${popisPrijatej(r)} [${r.id}]`;
}

/** Rozloží chybu z `chybaUlozenejPrijatej` (alebo zo spúšťača); null = iná chyba. */
export function rozlozChybuPrijatej(sprava: unknown): { popis: string; id: string | null } | null {
  const s = String(sprava ?? "");
  const i = s.indexOf(PREDPONA_ULOZENEJ_PRIJATEJ);
  if (i < 0) return null;
  const zvysok = s.slice(i + PREDPONA_ULOZENEJ_PRIJATEJ.length);
  const m = /\s*\[([0-9a-f-]{36})\]/i.exec(zvysok);
  return { popis: (m ? zvysok.slice(0, m.index) : zvysok).trim(), id: m ? m[1] : null };
}

/**
 * Text možnej duplicity (iná suma alebo rok) — za `PREDPONA_DUPLICITY`;
 * rozhranie ho ukáže v potvrdení „Nie je duplicita – uložiť“.
 */
export function textMoznejDuplicity(r: Riadok): string {
  const rok = String(r.issue_date ?? "").slice(0, 4);
  return `Faktúra s rovnakým číslom od toho istého dodávateľa už v evidencii je: ${popisPrijatej(r)}${
    rok ? `, vystavená ${datumSk(r.issue_date)}` : ""
  }. Má inú sumu alebo je z iného roka — niektorí dodávatelia čísla opakujú. Ak nejde o duplicitu, uložte ju.`;
}
