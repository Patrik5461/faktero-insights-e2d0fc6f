/*
  Doklady so zaúčtovaním v jednom tvare pre všetky účtovné programy.

  Pohoda má vlastný export (`export.server.ts`) a kódy predkontácií berie
  priamo. Omega, Money S3, ABRA Flexi a súpiska CSV potrebujú to isté
  rozhodnutie — ktorá predkontácia, aké členenie, ktorá časť dane sa
  odpočíta, kam ide bloček — len ho zapisujú inak. Tu sa preto rozhodne raz:
  vystavená faktúra, prijatá faktúra aj bloček sa prevedú na `DokladUctovania`
  s riadkami zaúčtovania po sadzbách a kódoch.

  Poradie kódov je rovnaké ako pri Pohode: kód na doklade (alebo na položke
  či riadku rozúčtovania), pravidlo účtovania, kategória nákladu, predvolený
  kód druhu dokladu. Čisté funkcie bez databázy.
*/

import { riadkyDokladu, rozpisBlocku, type RozpisSadzby } from "./rozuctovanie";
import { rozpisPrijatej } from "./prijate-do-pohody";

export type AgendaUctovania = "vystavena" | "prijata" | "doklad";
/** Ako ide doklad do účtovníctva: faktúra, pokladničný doklad alebo interný doklad. */
export type FormaUctovania = "faktura" | "pokladna" | "interny";

export type RiadokUctovania = {
  sadzba: number;
  /** Kladné sumy; dobropis sa pozná podľa `druh`. */
  zaklad: number;
  dph: number;
  predkontacia: string | null;
  clenenie: string | null;
  kv: string | null;
  /** Či si firma z tohto riadku odpočíta DPH (bez odpočtu ide daň do nákladu). */
  odpocet: boolean;
  text: string | null;
};

export type PolozkaUctovania = {
  nazov: string;
  mnozstvo: number;
  mj: string | null;
  /** Jednotková cena bez DPH. */
  cena: number;
  sadzba: number;
  zaklad: number;
  dph: number;
  predkontacia: string | null;
  clenenie: string | null;
};

export type PartnerUctovania = {
  nazov: string;
  ico: string | null;
  dic: string | null;
  icDph: string | null;
  ulica: string | null;
  mesto: string | null;
  psc: string | null;
  stat: string | null;
  iban: string | null;
  email: string | null;
};

export type DokladUctovania = {
  id: string;
  agenda: AgendaUctovania;
  druh: "faktura" | "zaloha" | "dobropis";
  forma: FormaUctovania;
  /** Číslo vo Fakteri (vystavená) alebo číslo dodávateľa (prijatá, bloček). */
  cislo: string;
  vs: string | null;
  ks: string | null;
  ss: string | null;
  /** Pri dobropise číslo opravovanej faktúry. */
  opravuje: string | null;
  datumVystavenia: string | null;
  datumDodania: string | null;
  datumSplatnosti: string | null;
  datumPrijatia: string | null;
  /** Dátum zaúčtovania, keď doklad patrí do uzamknutého obdobia; inak null. */
  datumZauctovania: string | null;
  mena: string;
  kurz: number | null;
  platba: string | null;
  partner: PartnerUctovania;
  zaklad: number;
  dph: number;
  celkom: number;
  /** Zaokrúhlenie: rozdiel celkovej sumy a súčtu riadkov. */
  zaokruhlenie: number;
  riadky: RiadokUctovania[];
  /** Riadky majú rôzne kódy (ručné rozúčtovanie, pomer alebo kódy po položkách). */
  rozuctovany: boolean;
  predkontacia: string | null;
  clenenie: string | null;
  kv: string | null;
  stredisko: string | null;
  cinnost: string | null;
  zakazka: string | null;
  rad: string | null;
  pokladna: string | null;
  text: string;
  poznamka: string | null;
  intPoznamka: string | null;
  prenesenieDph: boolean;
  /** Odpočet zaplatenej zálohy na vyúčtovacej faktúre (kladná suma s DPH). */
  odpocetZalohy: number;
  /**
   * Daňový doklad k prijatej platbe (záloha). Nie je to tržba — účtuje sa
   * len daň zo zálohy (MD 324 / D 343), tržbu prinesie až vyúčtovacia faktúra.
   */
  dokladKPlatbe?: boolean;
  polozky: PolozkaUctovania[];
};

/** Kód predkontácie s účtami (MD/Dal) z číselníka firmy. */
export type KodUctovania = {
  kod: string;
  popis: string | null;
  ucetMd: string | null;
  ucetD: string | null;
};

export type NastaveniaUctovania = {
  predkontacia?: string | null;
  predkontaciaZaloha?: string | null;
  predkontaciaDobropis?: string | null;
  clenenieDph?: string | null;
  clenenieDphPdp?: string | null;
  predkontaciaPrijata?: string | null;
  clenenieDphPrijata?: string | null;
  /** Členenie DPH prijatej faktúry v prenesení daňovej povinnosti. */
  clenenieDphPrijataPdp?: string | null;
  predkontaciaDoklady?: string | null;
  clenenieDphDoklady?: string | null;
  predkontaciaPokladna?: string | null;
  podlaKategorie?: Record<string, { predkontacia?: string | null; clenenie?: string | null }>;
  pomeryPredkontacii?: Record<string, unknown>;
  blockyPodlaPlatby?: boolean;
  stredisko?: string | null;
  radPrijate?: string | null;
  radDoklady?: string | null;
  radPokladna?: string | null;
  radInterne?: string | null;
  pokladna?: string | null;
  zamknuteDo?: string | null;
  zakazkyDokladov?: Record<string, string>;
};

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const t = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s || null;
};

/** Dátum zaúčtovania pre doklad z uzamknutého obdobia (deň po uzávierke). */
export function datumPoUzavierke(datum: unknown, zamknuteDo: unknown): string | null {
  const d = String(datum ?? "").slice(0, 10);
  const z = String(zamknuteDo ?? "").slice(0, 10);
  if (!d || !z || d > z) return null;
  const n = new Date(`${z}T00:00:00Z`);
  n.setUTCDate(n.getUTCDate() + 1);
  return n.toISOString().slice(0, 10);
}

/** Zlúči riadky s rovnakou sadzbou a kódmi — do účtovníctva ide súhrn, nie položky. */
export function zlucRiadky(riadky: RiadokUctovania[]): RiadokUctovania[] {
  const out: RiadokUctovania[] = [];
  for (const r of riadky) {
    const k = out.find(
      (x) =>
        x.sadzba === r.sadzba &&
        x.predkontacia === r.predkontacia &&
        x.clenenie === r.clenenie &&
        x.kv === r.kv &&
        x.odpocet === r.odpocet,
    );
    if (k) {
      k.zaklad = r2(k.zaklad + r.zaklad);
      k.dph = r2(k.dph + r.dph);
    } else out.push({ ...r, zaklad: r2(r.zaklad), dph: r2(r.dph) });
  }
  return out.filter((r) => r.zaklad || r.dph);
}

function rozdielneKody(riadky: RiadokUctovania[]): boolean {
  return new Set(riadky.map((r) => `${r.predkontacia}|${r.clenenie}|${r.odpocet}`)).size > 1;
}

/**
 * Riadky z rozpisu po sadzbách s kódmi dokladu — ručné rozúčtovanie, inak
 * predkontácie pri položkách, inak hlavička; predkontácia s pomerom sa
 * rozvinie na celý doklad aj na položku (ako v Doklado).
 */
function riadkyPrijatehoDokladu(
  rozpis: RozpisSadzby[],
  doklad: { rozuctovanie?: unknown; items?: unknown },
  predkontacia: string | null,
  clenenie: string | null,
  kv: string | null,
  odpocet: boolean,
  nast: NastaveniaUctovania,
): RiadokUctovania[] {
  return riadkyDokladu(doklad, rozpis, predkontacia, clenenie, nast.pomeryPredkontacii).map((r) => ({
    sadzba: Number(r.sadzba) || 0,
    zaklad: r2(r.zaklad),
    dph: r2(r.dph),
    predkontacia: t(r.predkontacia) ?? predkontacia,
    clenenie: t(r.clenenie) ?? clenenie,
    kv: t(r.kv) ?? kv,
    odpocet: odpocet && r.odpocet !== false,
    text: t(r.text),
  }));
}

function partnerZDodavatela(r: any): PartnerUctovania {
  return {
    nazov: String(r?.supplier_name ?? "").trim() || "Neurčený dodávateľ",
    ico: t(r?.supplier_ico),
    dic: t(r?.supplier_dic),
    icDph: t(r?.supplier_ic_dph),
    ulica: t(r?.supplier_street),
    mesto: t(r?.supplier_city),
    psc: t(r?.supplier_zip),
    stat: t(r?.supplier_country),
    iban: t(r?.supplier_iban),
    email: t(r?.supplier_email),
  };
}

/** Bloček či výdavkový doklad (`expense_documents`). */
export function blocekNaUctovanie(d: any, nast: NastaveniaUctovania): DokladUctovania {
  const kat = nast.podlaKategorie?.[String(d?.category ?? "")];
  const predkontacia =
    t(d?.pohoda_predkontacia) ??
    t(kat?.predkontacia) ??
    t(nast.predkontaciaDoklady) ??
    t(nast.predkontaciaPrijata);
  const clenenie =
    t(d?.pohoda_clenenie_dph) ??
    t(kat?.clenenie) ??
    t(nast.clenenieDphDoklady) ??
    t(nast.clenenieDphPrijata);
  const kv = t(d?.kv_clenenie);
  const odpocet = d?.odpocet !== false && kv !== "X";
  const rozpis = rozpisBlocku(d);
  const riadky = zlucRiadky(
    riadkyPrijatehoDokladu(rozpis, d, predkontacia, clenenie, kv, odpocet, nast),
  );
  const platba = t(d?.payment_method);
  const forma: FormaUctovania = nast.blockyPodlaPlatby
    ? platba === "hotovost"
      ? "pokladna"
      : platba === "karta"
        ? "interny"
        : "faktura"
    : "faktura";
  const zaklad = r2(riadky.reduce((a, r) => a + r.zaklad, 0));
  const dph = r2(riadky.reduce((a, r) => a + r.dph, 0));
  const celkom = r2(Number(d?.total_amount ?? 0) || zaklad + dph);
  const datum = t(d?.issue_date);
  return {
    id: String(d.id),
    agenda: "doklad",
    druh: "faktura",
    forma,
    cislo: t(d?.document_number) ?? "",
    vs: t(
      String(d?.document_number ?? "")
        .replace(/\D/g, "")
        .slice(0, 10),
    ),
    ks: null,
    ss: null,
    opravuje: null,
    datumVystavenia: datum,
    datumDodania: datum,
    datumSplatnosti: datum,
    datumPrijatia: t(String(d?.created_at ?? "").slice(0, 10)) ?? datum,
    datumZauctovania: datumPoUzavierke(datum, nast.zamknuteDo),
    mena: String(d?.currency ?? "EUR").toUpperCase(),
    kurz: null,
    platba,
    partner: partnerZDodavatela(d),
    zaklad,
    dph,
    celkom,
    zaokruhlenie: r2(celkom - zaklad - dph),
    riadky,
    rozuctovany: rozdielneKody(riadky),
    predkontacia,
    clenenie,
    kv,
    stredisko: t(d?.stredisko) ?? t(nast.stredisko),
    cinnost: t(d?.cinnost),
    zakazka: d?.job_id ? (nast.zakazkyDokladov?.[String(d.job_id)] ?? null) : null,
    rad:
      t(d?.pohoda_rad) ??
      (forma === "pokladna"
        ? t(nast.radPokladna)
        : forma === "interny"
          ? t(nast.radInterne)
          : t(nast.radDoklady)),
    pokladna: forma === "pokladna" ? (t(d?.pohoda_pokladna) ?? t(nast.pokladna)) : null,
    text:
      [t(d?.supplier_name), t(d?.document_number) ? `č. ${d.document_number}` : null]
        .filter(Boolean)
        .join(" ")
        .slice(0, 240) || "Prijatý doklad",
    poznamka: t(d?.note),
    intPoznamka: t(d?.int_poznamka),
    prenesenieDph: false,
    odpocetZalohy: 0,
    dokladKPlatbe: false,
    polozky: [],
  };
}

/** Prijatá faktúra (`purchase_invoices`). */
export function prijataNaUctovanie(p: any, nast: NastaveniaUctovania): DokladUctovania {
  const kat = nast.podlaKategorie?.[String(p?.category ?? "")];
  const predkontacia =
    t(p?.pohoda_predkontacia) ?? t(kat?.predkontacia) ?? t(nast.predkontaciaPrijata);
  /*
    Prenesenie daňovej povinnosti (§ 69): formulár ukladá `dph_rezim:
    "samozdanenie"`, čítanie dokladu `reverse_charge`. Takú faktúru treba
    zaúčtovať s členením pre prenesenie a v KV v B.1 — inak by odišla ako
    bežný nákup a samozdanenie by v priznaní chýbalo.
  */
  const prenesenie = Boolean(p?.reverse_charge) || p?.dph_rezim === "samozdanenie";
  const clenenie =
    t(p?.pohoda_clenenie_dph) ??
    t(kat?.clenenie) ??
    (prenesenie ? t(nast.clenenieDphPrijataPdp) : null) ??
    t(nast.clenenieDphPrijata);
  const kv = t(p?.kv_clenenie) ?? (prenesenie ? "B1" : null);
  const odpocet = p?.odpocet !== false && kv !== "X";
  const spolu = Number(p?.amount_total ?? 0);
  const dobropis = spolu < 0 || Boolean(p?.opravuje_cislo);
  // Sumy riadkov sú kladné, dobropis nesie `druh`.
  const rozpis = rozpisPrijatej(p).map((x) => ({
    sadzba: x.sadzba,
    zaklad: Math.abs(x.zaklad),
    dph: Math.abs(x.dph),
  }));
  const riadky = zlucRiadky(
    riadkyPrijatehoDokladu(rozpis, p, predkontacia, clenenie, kv, odpocet, nast),
  );
  const zaklad = r2(riadky.reduce((a, r) => a + r.zaklad, 0));
  const dph = r2(riadky.reduce((a, r) => a + r.dph, 0));
  const celkom = r2(Math.abs(spolu) || zaklad + dph);
  const dodanie = t(p?.delivery_date) ?? t(p?.issue_date);
  const items: any[] = Array.isArray(p?.items) ? p.items : [];
  return {
    id: String(p.id),
    agenda: "prijata",
    druh: dobropis ? "dobropis" : p?.type === "proforma" ? "zaloha" : "faktura",
    forma: "faktura",
    cislo: t(p?.invoice_number) ?? "",
    vs: t(p?.variable_symbol),
    ks: t(p?.constant_symbol),
    ss: t(p?.specific_symbol),
    opravuje: t(p?.opravuje_cislo),
    datumVystavenia: t(p?.issue_date),
    datumDodania: dodanie,
    datumSplatnosti: t(p?.due_date),
    datumPrijatia: t(p?.received_date) ?? t(p?.issue_date),
    datumZauctovania: datumPoUzavierke(dodanie, nast.zamknuteDo),
    mena: String(p?.currency ?? "EUR").toUpperCase(),
    kurz: Number(p?.exchange_rate) || null,
    platba: t(p?.payment_method),
    partner: partnerZDodavatela(p),
    zaklad,
    dph,
    celkom,
    zaokruhlenie: r2(celkom - zaklad - dph),
    riadky,
    rozuctovany: rozdielneKody(riadky),
    predkontacia,
    clenenie,
    kv,
    stredisko: t(p?.stredisko) ?? t(nast.stredisko),
    cinnost: t(p?.cinnost),
    zakazka: p?.job_id ? (nast.zakazkyDokladov?.[String(p.job_id)] ?? null) : null,
    rad: t(p?.pohoda_rad) ?? t(nast.radPrijate),
    pokladna: null,
    text:
      [t(p?.supplier_name), t(p?.invoice_number) ? `č. ${p.invoice_number}` : null]
        .filter(Boolean)
        .join(" ")
        .slice(0, 240) || "Prijatá faktúra",
    poznamka: t(p?.note),
    intPoznamka: t(p?.int_poznamka),
    prenesenieDph: prenesenie,
    odpocetZalohy: Math.abs(Number(p?.advance_amount ?? 0)),
    dokladKPlatbe: false,
    polozky: items
      .filter((x) => t(x?.name))
      .map((x) => ({
        nazov: String(x.name),
        mnozstvo: Number(x.quantity ?? 1) || 1,
        mj: t(x.unit),
        cena: Number(x.unit_price ?? 0),
        sadzba: Number(x.vat_rate ?? 0) || 0,
        zaklad: r2(Number(x.subtotal ?? x.total ?? 0)),
        dph: r2(Number(x.vat_amount ?? 0)),
        predkontacia: null,
        clenenie: null,
      })),
  };
}

/** Vystavená faktúra (`invoices`) s položkami (`invoice_items`). */
export function vystavenaNaUctovanie(
  inv: any,
  items: any[],
  nast: NastaveniaUctovania,
): DokladUctovania {
  const druh: DokladUctovania["druh"] =
    inv?.type === "credit_note" ? "dobropis" : inv?.type === "proforma" ? "zaloha" : "faktura";
  // Daňový doklad k prijatej platbe — `advance_amount` je na ňom zaplatená
  // suma, nie odpočet; predvolene sa účtuje predkontáciou zálohy (ako v Pohode).
  const kPlatbe = inv?.type === "advance_payment";
  const prenesenie = Boolean(inv?.reverse_charge);
  const predkontacia =
    t(inv?.pohoda_predkontacia) ??
    (druh === "zaloha" || kPlatbe
      ? t(nast.predkontaciaZaloha)
      : druh === "dobropis"
        ? t(nast.predkontaciaDobropis)
        : null) ??
    t(nast.predkontacia);
  const clenenie =
    t(inv?.pohoda_clenenie_dph) ??
    (prenesenie ? t(nast.clenenieDphPdp) : null) ??
    t(nast.clenenieDph);
  const kv = t(inv?.kv_clenenie);
  const polozky: PolozkaUctovania[] = (items ?? []).map((it) => ({
    nazov: String(it?.name ?? it?.description ?? "").trim() || "Položka",
    mnozstvo: Math.abs(Number(it?.quantity ?? 1)) || 1,
    mj: t(it?.unit),
    cena: Math.abs(Number(it?.unit_price ?? 0)),
    sadzba: Number(it?.vat_rate ?? 0) || 0,
    zaklad: r2(Math.abs(Number(it?.subtotal ?? 0))),
    dph: r2(Math.abs(Number(it?.vat_amount ?? 0))),
    predkontacia: t(it?.pohoda_predkontacia),
    clenenie: t(it?.pohoda_clenenie_dph),
  }));
  // Zľava na doklad (v hlavičke) zníži základ aj daň po sadzbách pomerne.
  const zlava = Math.abs(Number(inv?.discount_total ?? 0));
  const spoluPolozky = polozky.reduce((a, p) => a + p.zaklad, 0);
  const koef = zlava && spoluPolozky ? Math.max(0, (spoluPolozky - zlava) / spoluPolozky) : 1;
  const riadky = zlucRiadky(
    polozky.map((p) => ({
      sadzba: p.sadzba,
      zaklad: r2(p.zaklad * koef),
      dph: r2(p.dph * koef),
      predkontacia: p.predkontacia ?? predkontacia,
      clenenie: p.clenenie ?? clenenie,
      kv,
      odpocet: true,
      text: null,
    })),
  );
  const zaklad = r2(riadky.reduce((a, r) => a + r.zaklad, 0));
  const dph = r2(riadky.reduce((a, r) => a + r.dph, 0));
  const celkom = r2(Math.abs(Number(inv?.total ?? 0)) || zaklad + dph);
  const dodanie = t(inv?.delivery_date) ?? t(inv?.issue_date);
  return {
    id: String(inv.id),
    agenda: "vystavena",
    druh,
    forma: "faktura",
    cislo: t(inv?.invoice_number) ?? "",
    vs: t(inv?.variable_symbol) ?? t(String(inv?.invoice_number ?? "").replace(/\D/g, "")),
    ks: t(inv?.constant_symbol),
    ss: t(inv?.specific_symbol),
    opravuje: t(inv?._opravujeCislo),
    datumVystavenia: t(inv?.issue_date),
    datumDodania: dodanie,
    datumSplatnosti: t(inv?.due_date),
    datumPrijatia: null,
    datumZauctovania: datumPoUzavierke(dodanie, nast.zamknuteDo),
    mena: String(inv?.currency ?? "EUR").toUpperCase(),
    kurz: Number(inv?.exchange_rate) || null,
    platba: t(inv?.payment_method),
    partner: {
      nazov: String(inv?.customer_name ?? "").trim() || "Odberateľ",
      ico: t(inv?.customer_ico),
      dic: t(inv?.customer_dic),
      icDph: t(inv?.customer_ic_dph),
      ulica: t(inv?.customer_street),
      mesto: t(inv?.customer_city),
      psc: t(inv?.customer_zip),
      stat: t(inv?.customer_country),
      iban: null,
      email: t(inv?.customer_email),
    },
    zaklad,
    dph,
    celkom,
    zaokruhlenie: r2(celkom - zaklad - dph),
    riadky,
    rozuctovany: rozdielneKody(riadky),
    predkontacia,
    clenenie,
    kv,
    stredisko: t(inv?.stredisko) ?? t(nast.stredisko),
    cinnost: t(inv?.cinnost),
    zakazka: inv?.job_id ? (nast.zakazkyDokladov?.[String(inv.job_id)] ?? null) : null,
    rad: null,
    pokladna: null,
    text: (t(inv?.intro_note) ?? `Faktúra ${inv?.invoice_number ?? ""}`).slice(0, 240),
    poznamka: t(inv?.notes),
    intPoznamka: t(inv?.int_poznamka),
    prenesenieDph: prenesenie,
    odpocetZalohy: kPlatbe ? 0 : Math.abs(Number(inv?.advance_amount ?? 0)),
    dokladKPlatbe: kPlatbe,
    polozky,
  };
}

/** Rozdelí účet z číselníka („501", „501100", „501.100") na syntetiku a analytiku. */
export function rozdelUcet(ucet: unknown): { synteticky: string; analyticky: string } | null {
  const s = String(ucet ?? "").replace(/\s/g, "");
  const m = s.match(/^(\d{3})[.\-/]?(\d{0,6})$/);
  if (!m) return null;
  return { synteticky: m[1]!, analyticky: m[2] ?? "" };
}
