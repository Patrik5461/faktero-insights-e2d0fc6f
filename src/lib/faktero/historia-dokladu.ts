/*
  História dokladu — z riadkov `historia_dokladov` (jeden riadok = jedno pole)
  poskladá zrozumiteľné udalosti „kedy · kto · čo“:

    Nahratie / Vytvorenie, Uloženie, Úprava (zmenené polia staré → nové),
    Zaúčtovanie (kódy), Zmena zaúčtovania, Zrušenie zaúčtovania,
    Odovzdanie do Pohody / Vrátenie z Pohody, Úhrada / Zrušenie úhrady,
    Spárovanie s platbou / Zrušenie spárovania, Odoslanie, Storno,
    Zmazanie / Obnovenie, Oprava automatického zaúčtovania.

  Riadky jedného zápisu majú rovnaký čas (now() transakcie) aj autora —
  podľa toho sa zoskupia. Kto: `kto_typ`/`kto_popis` (migrácia
  20261103120000_historia_kto_kedy); staré riadky ich nemajú.

  Starý doklad (pred históriou alebo s neúplnou históriou) dostane základné
  udalosti odvodené z jeho stĺpcov — pri zobrazení, nič sa nezapisuje.

  Čisté funkcie, zobrazenie je v `HistoriaDokladu.tsx`.
*/
import {
  nahranieDokladu,
  tenIstyCas,
  ulozenieDokladu,
  type AgendaKtoKedy,
  type Kto,
} from "./kto-kedy";
import { STAV_DOKLADU_NAZOV } from "./doklad-stav";
import { nazovDruhu, DRUHY_KLUCE } from "./ostatne-doklady";

export type AgendaHistorie = "prijata" | "doklad" | "faktura" | "ostatny";

export type ZaznamHistorie = {
  id: string;
  pole: string;
  pred: unknown;
  po: unknown;
  kto: string | null;
  kto_typ?: string | null;
  kto_popis?: string | null;
  kedy: string;
};

export type DruhUdalosti =
  | "nahratie"
  | "vytvorenie"
  | "ulozenie"
  | "uprava"
  | "zauctovanie"
  | "zmena_zauctovania"
  | "zrusenie_zauctovania"
  | "oprava_zauctovania"
  | "odovzdanie"
  | "vratenie"
  | "uhrada"
  | "zrusenie_uhrady"
  | "sparovanie"
  | "zrusenie_sparovania"
  | "odoslanie"
  | "storno"
  | "zmazanie"
  | "obnovenie";

export type ZmenaPola = { pole: string; pred: unknown; po: unknown };

export type UdalostHistorie = {
  druh: DruhUdalosti;
  kedy: string | null;
  kto: Kto;
  zmeny: ZmenaPola[];
  /** Doplnkový text (cesta odovzdania, údaje platby). */
  info?: unknown;
  /** Odvodené zo stĺpcov dokladu (staré doklady), nie zo zápisu histórie. */
  odvodena?: boolean;
};

/** Zaúčtovacie kódy — zmena len týchto polí = „Zmena zaúčtovania“. */
export const KODY_ZAUCTOVANIA = [
  "pohoda_predkontacia",
  "pohoda_clenenie_dph",
  "kv_clenenie",
  "rozuctovanie",
  "stredisko",
  "cinnost",
] as const;
const KODY = new Set<string>(KODY_ZAUCTOVANIA);

const AUTOMAT = new Set(["pravidlo", "zvyk", "ai"]);
const s = (v: unknown): string | null => {
  const t = v == null ? "" : String(v).trim();
  return t ? t : null;
};

/** Pole z prenosu z Doklada: „Doklado (ucet@firma.sk) · paymentStatus“. */
export function poleDoklada(pole: string): { ucet: string | null; pole: string } | null {
  const m = /^Doklado(?: \(([^)]*)\))? · (.+)$/.exec(pole);
  return m ? { ucet: m[1] ?? null, pole: m[2] } : null;
}

/** Kto zápis urobil — z `kto_typ` / `kto_popis`, pri starých riadkoch z `kto`. */
export function ktoZaznamu(z: Pick<ZaznamHistorie, "pole" | "kto" | "kto_typ" | "kto_popis">): Kto {
  const d = poleDoklada(z.pole);
  if (d) return { typ: "doklado", ucet: d.ucet };
  const popis = s(z.kto_popis);
  switch (z.kto_typ) {
    case "automat":
      return { typ: "automat", zdroj: (AUTOMAT.has(popis ?? "") ? popis : "ai") as "pravidlo" | "zvyk" | "ai" };
    case "api":
      return { typ: "api", nazov: popis };
    case "mail":
      return { typ: "mail", adresa: popis };
    case "import":
      return { typ: "import" };
    case "efaktura":
      return { typ: "efaktura" };
    case "appka":
      return { typ: "appka", id: z.kto };
    case "system":
      return z.kto ? { typ: "clovek", id: z.kto } : { typ: "system" };
    case "clovek":
      return popis && AUTOMAT.has(popis)
        ? { typ: "clovek", id: z.kto, cez: popis as "pravidlo" | "zvyk" | "ai" }
        : { typ: "clovek", id: z.kto };
    default:
      return z.kto ? { typ: "clovek", id: z.kto } : { typ: "system" };
  }
}

const kluc = (z: ZaznamHistorie) => {
  const d = poleDoklada(z.pole);
  return [z.kedy, z.kto ?? "", z.kto_typ ?? "", z.kto_popis ?? "", d ? `doklado:${d.ucet}` : ""].join("|");
};

const prazdne = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Riadky jedného zápisu → udalosti. Jeden zápis môže byť viac udalostí
 * (zaúčtovanie a odovzdanie naraz); čo ostane, je „Úprava“.
 */
export function udalostiZapisu(zaznamy: ZaznamHistorie[]): UdalostHistorie[] {
  if (!zaznamy.length) return [];
  const prvy = zaznamy[0];
  const kedy = prvy.kedy;
  let kto = ktoZaznamu(prvy);
  const podla = new Map<string, ZaznamHistorie>();
  for (const z of zaznamy) podla.set(poleDoklada(z.pole)?.pole ?? z.pole, z);
  const minute = new Set<string>();
  const vezmi = (p: string) => {
    const z = podla.get(p);
    if (z) minute.add(p);
    return z;
  };
  const zmena = (z: ZaznamHistorie): ZmenaPola => ({ pole: poleDoklada(z.pole)?.pole ?? z.pole, pred: z.pred, po: z.po });

  // Starý riadok (bez kto_typ): automat prezradí zdroj zaúčtovania v tom istom zápise.
  const zdroj = vezmi("zauctovanie_zdroj");
  if (!prvy.kto_typ && kto.typ === "system" && zdroj && AUTOMAT.has(String(zdroj.po)))
    kto = { typ: "automat", zdroj: String(zdroj.po) as "pravidlo" | "zvyk" | "ai" };

  const out: UdalostHistorie[] = [];
  const pridaj = (druh: DruhUdalosti, zmeny: ZmenaPola[] = [], info?: unknown) =>
    out.push({ druh, kedy, kto, zmeny, ...(info !== undefined ? { info } : {}) });

  if (vezmi("_vytvoreny")) pridaj("vytvorenie");

  const kody = [...podla.values()].filter((z) => KODY.has(z.pole)).map((z) => (minute.add(z.pole), zmena(z)));
  const zauct = vezmi("zauctovane_at");
  if (zauct) {
    if (prazdne(zauct.po)) pridaj("zrusenie_zauctovania", kody);
    else pridaj("zauctovanie", kody);
  } else if (kody.length) pridaj("zmena_zauctovania", kody);

  const oprava = vezmi("zauctovanie_oprava");
  if (oprava) {
    const pred = (oprava.pred ?? {}) as { predkontacia?: string | null };
    const po = (oprava.po ?? {}) as { predkontacia?: string | null };
    pridaj("oprava_zauctovania", [
      { pole: "pohoda_predkontacia", pred: pred.predkontacia ?? null, po: po.predkontacia ?? null },
    ]);
  }

  const exp = vezmi("exported_at");
  if (exp) {
    if (prazdne(exp.po)) pridaj("vratenie");
    else pridaj("odovzdanie", [], s(prvy.kto_popis) && !AUTOMAT.has(String(prvy.kto_popis)) ? prvy.kto_popis : undefined);
  }

  const zmaz = vezmi("deleted_at");
  if (zmaz) pridaj(prazdne(zmaz.po) ? "obnovenie" : "zmazanie");

  const storno = podla.get("cancelled_at");
  if (storno && !prazdne(storno.po)) {
    minute.add("cancelled_at");
    pridaj("storno");
  }

  const odosl = podla.get("sent_at");
  if (odosl && !prazdne(odosl.po) && prazdne(odosl.pred)) {
    minute.add("sent_at");
    pridaj("odoslanie");
  }

  // Úhrada: paid_at (vystavené) alebo stav „paid“; stav pri odovzdaní/úhrade sa neopakuje.
  const paid = vezmi("paid_at");
  const stav = podla.get("status") ?? podla.get("paymentStatus");
  const jeUhradene = (v: unknown) => v === "paid";
  if (paid) {
    if (stav) minute.add(poleDoklada(stav.pole)?.pole ?? stav.pole);
    pridaj(prazdne(paid.po) ? "zrusenie_uhrady" : "uhrada");
  } else if (stav && (jeUhradene(stav.po) || jeUhradene(stav.pred))) {
    minute.add(poleDoklada(stav.pole)?.pole ?? stav.pole);
    pridaj(jeUhradene(stav.po) ? "uhrada" : "zrusenie_uhrady");
  } else if (stav && exp && stav.pole === "status") {
    minute.add("status");
  } else if (stav && zauct && stav.pole === "status" && (stav.po === "booked" || stav.pred === "booked")) {
    // Prijatá: zaúčtovanie prepne stav na „Zaúčtované“ (zrušenie späť) — neopakuje sa ako úprava.
    minute.add("status");
  }

  for (const z of zaznamy) {
    if (z.pole !== "_platba") continue;
    minute.add("_platba");
    if (z.po != null) out.push({ druh: "sparovanie", kedy, kto, zmeny: [], info: z.po });
    else out.push({ druh: "zrusenie_sparovania", kedy, kto, zmeny: [], info: z.pred });
  }

  const zvysok = zaznamy.filter((z) => !minute.has(poleDoklada(z.pole)?.pole ?? z.pole)).map(zmena);
  if (zvysok.length) pridaj("uprava", zvysok);
  return out;
}

/** Riadky histórie (v ľubovoľnom poradí) → udalosti od najnovšej. */
export function udalostiZHistorie(zaznamy: ZaznamHistorie[]): UdalostHistorie[] {
  const skupiny = new Map<string, ZaznamHistorie[]>();
  for (const z of zaznamy) {
    const k = kluc(z);
    const g = skupiny.get(k);
    if (g) g.push(z);
    else skupiny.set(k, [z]);
  }
  return zorad([...skupiny.values()].flatMap(udalostiZapisu));
}

const cas = (u: UdalostHistorie) => (u.kedy ? Date.parse(u.kedy) : 0);
/** Najnovšie hore; v jednom zápise poradie, v akom sa stali (vytvorenie pred zaúčtovaním). */
function zorad(u: UdalostHistorie[]): UdalostHistorie[] {
  return u
    .map((x, i) => ({ x, i }))
    .sort((a, b) => cas(b.x) - cas(a.x) || b.i - a.i)
    .map((p) => p.x);
}

const agendaKtoKedy = (a: AgendaHistorie): AgendaKtoKedy => a;

/**
 * Udalosti odvodené zo stĺpcov dokladu: nahratie (vždy — stĺpce vedia
 * odosielateľa mailu aj čas z Nespracovaných), uloženie a k starým dokladom
 * zaúčtovanie, odovzdanie, vrátenie, úhrada a zmazanie, ak ich história nemá.
 */
export function odvodeneUdalosti(
  r: Record<string, any> | null | undefined,
  agenda: AgendaHistorie,
  zHistorie: UdalostHistorie[] = [],
): UdalostHistorie[] {
  if (!r) return [];
  const out: UdalostHistorie[] = [];
  const ma = (d: DruhUdalosti) => zHistorie.some((u) => u.druh === d);
  const odv = (druh: DruhUdalosti, kedy: string | null, kto: Kto, zmeny: ZmenaPola[] = [], info?: unknown) =>
    out.push({ druh, kedy, kto, zmeny, odvodena: true, ...(info !== undefined ? { info } : {}) });

  const n = nahranieDokladu(r, agendaKtoKedy(agenda));
  if (n) odv("nahratie", n.kedy, n.kto);
  const ul = ulozenieDokladu(r, agendaKtoKedy(agenda));
  if (ul) odv("ulozenie", ul.kedy, ul.kto);

  if (agenda !== "ostatny" && s(r.zauctovane_at) && !ma("zauctovanie")) {
    const zdroj = s(r.zauctovanie_zdroj);
    const id = s(r.zauctoval);
    const kto: Kto =
      !id && zdroj && AUTOMAT.has(zdroj)
        ? { typ: "automat", zdroj: zdroj as "pravidlo" | "zvyk" | "ai" }
        : { typ: "clovek", id };
    const neskor = s(r.naposledy_zauctovane_at);
    const zmenene = neskor && !tenIstyCas(neskor, s(r.zauctovane_at));
    // Aktuálne kódy patria k prvému zaúčtovaniu len vtedy, keď sa odvtedy nemenili.
    const kody = zmenene
      ? []
      : KODY_ZAUCTOVANIA.filter((k) => !prazdne(r[k]) && typeof r[k] !== "object").map((k) => ({
          pole: k,
          pred: null,
          po: r[k],
        }));
    odv("zauctovanie", s(r.zauctovane_at), kto, kody);
    if (zmenene && !ma("zmena_zauctovania"))
      odv("zmena_zauctovania", neskor, { typ: "clovek", id: s(r.naposledy_zauctoval) });
  }

  const prvy = s(r.prvy_export_at) ?? s(r.exported_at);
  if (prvy && !ma("odovzdanie")) odv("odovzdanie", prvy, { typ: "clovek", id: null }, [], s(r.export_cesta) ?? undefined);
  if (s(r.vratene_z_pohody_at) && !ma("vratenie")) odv("vratenie", s(r.vratene_z_pohody_at), { typ: "clovek", id: null });
  if (s(r.paid_at) && !ma("uhrada")) odv("uhrada", s(r.paid_at), { typ: "clovek", id: null });
  if (s(r.deleted_at) && !ma("zmazanie")) odv("zmazanie", s(r.deleted_at), { typ: "clovek", id: null });
  return out;
}

const ktoCloveka = (k: Kto) => (k.typ === "clovek" || k.typ === "appka" ? k.id : null);

/**
 * Celá história na zobrazenie: zápisy histórie + odvodené udalosti.
 * „Vytvorenie“ zo zápisu splynie s nahratím (bohatší autor — appka, API —
 * prejde do nahratia), ak sa stalo v tú istú chvíľu alebo pri uložení.
 */
export function historiaDokladu(
  zaznamy: ZaznamHistorie[],
  r: Record<string, any> | null | undefined,
  agenda: AgendaHistorie,
): UdalostHistorie[] {
  const zHist = udalostiZHistorie(zaznamy);
  const odv = odvodeneUdalosti(r, agenda, zHist);
  const nahratie = odv.find((u) => u.druh === "nahratie");
  const ulozenie = odv.find((u) => u.druh === "ulozenie");
  const vysledok: UdalostHistorie[] = [];
  for (const u of zHist) {
    if (u.druh === "vytvorenie") {
      if (nahratie && tenIstyCas(u.kedy, nahratie.kedy)) {
        // Z appky / cez API s názvom kľúča vie zápis histórie viac ako stĺpce.
        const bohatsi = u.kto.typ === "appka" || (u.kto.typ === "api" && u.kto.nazov);
        const rovnakyClovek = ktoCloveka(u.kto) && ktoCloveka(u.kto) === ktoCloveka(nahratie.kto);
        if (bohatsi && (nahratie.kto.typ === "api" || nahratie.kto.typ === "clovek" || rovnakyClovek))
          nahratie.kto = u.kto;
        continue;
      }
      if (ulozenie && tenIstyCas(u.kedy, ulozenie.kedy)) continue;
      if (!nahratie && r) {
        vysledok.push({ ...u, druh: "nahratie" });
        continue;
      }
    }
    vysledok.push(u);
  }
  return zorad([...vysledok, ...odv]);
}

/** Názov udalosti (slovenský kľúč pre t()); vystavená faktúra sa nenahráva, vytvára. */
export function nazovUdalosti(druh: DruhUdalosti, agenda: AgendaHistorie): string {
  switch (druh) {
    case "nahratie":
      return agenda === "faktura" ? "Vytvorenie" : "Nahratie";
    case "vytvorenie":
      return "Vytvorenie";
    case "ulozenie":
      return "Uloženie";
    case "uprava":
      return "Úprava";
    case "zauctovanie":
      return "Zaúčtovanie";
    case "zmena_zauctovania":
      return "Zmena zaúčtovania";
    case "zrusenie_zauctovania":
      return "Zrušenie zaúčtovania";
    case "oprava_zauctovania":
      return "Oprava automatického zaúčtovania";
    case "odovzdanie":
      return "Odovzdanie do Pohody";
    case "vratenie":
      return "Vrátenie z Pohody";
    case "uhrada":
      return "Úhrada";
    case "zrusenie_uhrady":
      return "Zrušenie úhrady";
    case "sparovanie":
      return "Spárovanie s platbou";
    case "zrusenie_sparovania":
      return "Zrušenie spárovania s platbou";
    case "odoslanie":
      return "Odoslanie";
    case "storno":
      return "Storno";
    case "zmazanie":
      return "Zmazanie";
    case "obnovenie":
      return "Obnovenie";
  }
}

/** Názvy polí (slovenské kľúče pre t()). */
export const POLIA_HISTORIE: Record<string, string> = {
  invoice_number: "Číslo",
  document_number: "Číslo",
  type: "Typ dokladu",
  supplier_name: "Dodávateľ",
  supplier_ico: "IČO",
  supplier_ic_dph: "IČ DPH",
  supplier_iban: "IBAN",
  issue_date: "Dátum vystavenia",
  delivery_date: "Dátum dodania",
  due_date: "Splatnosť",
  received_date: "Dátum prijatia",
  amount_without_vat: "Základ",
  net_amount: "Základ",
  vat_amount: "DPH",
  amount_total: "Suma",
  total_amount: "Suma",
  amount: "Suma",
  currency: "Mena",
  variable_symbol: "VS",
  payment_method: "Spôsob úhrady",
  items: "Položky",
  status: "Stav",
  pohoda_predkontacia: "Predkontácia",
  pohoda_clenenie_dph: "Členenie DPH",
  kv_clenenie: "Členenie KV",
  rozuctovanie: "Rozúčtovanie",
  stredisko: "Stredisko",
  cinnost: "Činnosť",
  job_id: "Zákazka",
  category: "Kategória",
  note: "Poznámka",
  locked_at: "Zámok",
  stitky: "Štítky",
  customer_name: "Odberateľ",
  customer_ico: "IČO",
  customer_ic_dph: "IČ DPH",
  subtotal: "Základ",
  vat_total: "DPH",
  total: "Suma",
  exchange_rate: "Kurz",
  reverse_charge: "Prenesenie daňovej povinnosti",
  sent_at: "Odoslanie",
  cancelled_at: "Storno",
  odberatel_nesedi: "Odberateľ na doklade",
  kind: "Druh",
  sender: "Odosielateľ",
  subject: "Predmet",
  employee_id: "Zamestnanec",
  financing_contract_id: "Zmluva",
  priecinok: "Priečinok",
  // Prenos z Doklada
  paymentStatus: "Stav úhrady",
  paymentType: "Spôsob úhrady",
  deliveryDate: "Dátum dodania",
  dueDate: "Splatnosť",
  issuedAt: "Dátum vystavenia",
  comment: "Komentár",
  internalNote: "Interná poznámka",
  label: "Štítok",
  resourceSubType: "Typ dokladu",
};

const PENIAZE = new Set([
  "amount_without_vat",
  "net_amount",
  "vat_amount",
  "amount_total",
  "total_amount",
  "amount",
  "subtotal",
  "vat_total",
  "total",
]);
/** Stav dokladu tak, ako ho ukazuje odznak v zozname danej agendy. */
const STAVY_AGENDY: Record<AgendaHistorie, Record<string, string>> = {
  // prijate-faktury.index.tsx STATUS_LABEL
  prijata: {
    draft: "Koncept",
    received: "Prijaté",
    booked: "Zaúčtované",
    paid: "Zaplatené",
    partially_paid: "Čiastočne uhradená",
    cancelled: "Stornované",
  },
  // dashboard.tsx StatusBadge
  faktura: {
    draft: "Koncept",
    issued: "Vystavená",
    sent: "Odoslaná",
    paid: "Uhradená",
    partially_paid: "Čiastočne uhradená",
    overdue: "Po splatnosti",
    cancelled: "Stornovaná",
  },
  doklad: STAV_DOKLADU_NAZOV,
  ostatny: STAV_DOKLADU_NAZOV,
};
/** Stav bez agendy (prenos z Doklada, neznáma agenda). */
const STAVY: Record<string, string> = {
  paid: "uhradená",
  unpaid: "neuhradená",
  not_paid: "neuhradená",
  partially_paid: "čiastočne uhradená",
  partial: "čiastočne uhradená",
  overdue: "po splatnosti",
  new: "nová",
  draft: "koncept",
  issued: "vystavená",
  sent: "odoslaná",
  received: "prijatá",
  booked: "zaúčtovaná",
  exported: "odovzdaná",
  processed: "spracovaná",
  cancelled: "stornovaná",
};
/** Spôsob úhrady — bločky `prevod/hotovost/karta`, faktúry `bank_transfer/cash/card`. */
const SPOSOBY_UHRADY: Record<string, string> = {
  prevod: "Prevod",
  bank_transfer: "Prevod",
  transfer: "Prevod",
  hotovost: "Hotovosť",
  cash: "Hotovosť",
  karta: "Karta",
  card: "Karta",
};
/** Typ faktúry (vystavenej aj prijatej). */
const TYPY_FAKTURY: Record<string, string> = {
  regular: "Faktúra",
  proforma: "Zálohová faktúra",
  credit_note: "Dobropis",
  debit_note: "Ťarchopis",
  advance_payment: "Daňový doklad k prijatej platbe",
};

type Prekladac = (s: string, p?: Record<string, string | number>) => string;

const datum = (v: string, loc: string) => {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(loc, { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Bratislava" });
};
const cislo = (v: unknown, loc: string) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);
};

/** Hodnota poľa na zobrazenie (prázdna = „—“). */
export function hodnotaPola(
  pole: string,
  v: unknown,
  t: Prekladac,
  loc: string,
  agenda?: AgendaHistorie,
): string {
  // Príznak „faktúra nepatrí firme“ — zrušený = človek potvrdil, že patrí tejto firme.
  if (pole === "odberatel_nesedi") {
    if (v == null) return t("patrí tejto firme (potvrdené)");
    const o = ((v as any)?.odberatel ?? {}) as { nazov?: string | null; ico?: string | null };
    return `${t("iná firma")}${o.nazov || o.ico ? ` — ${[o.nazov, o.ico].filter(Boolean).join(", ")}` : ""}`;
  }
  if (v == null || v === "") return "—";
  if (pole === "items" && typeof v === "object" && !Array.isArray(v)) {
    const o = v as { pocet?: number; suma?: number | null };
    const n = o.pocet ?? 0;
    const riadky = t(n === 1 ? "{n} riadok" : n >= 2 && n <= 4 ? "{n} riadky" : "{n} riadkov", { n });
    return o.suma != null ? `${riadky}, ${cislo(o.suma, loc)}` : riadky;
  }
  if (pole === "rozuctovanie" && Array.isArray(v)) {
    return v
      .map((x: any) =>
        typeof x === "object" && x
          ? [x.predkontacia ?? x.ucet ?? x.pohoda_predkontacia, x.suma ?? x.castka ?? x.amount]
              .filter((y) => y != null && y !== "")
              .map((y) => (typeof y === "number" ? cislo(y, loc) : String(y)))
              .join(" ")
          : String(x),
      )
      .join("; ") || "—";
  }
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "boolean") return v ? t("áno") : t("nie");
  if (pole === "job_id" || pole === "employee_id" || pole === "financing_contract_id") return t("zmenená");
  const kod = String(v);
  if (pole === "status") {
    const nazov = (agenda ? STAVY_AGENDY[agenda][kod] : undefined) ?? STAVY[kod];
    return nazov ? t(nazov) : kod;
  }
  if (pole === "paymentStatus") return STAVY[kod] ? t(STAVY[kod]) : kod;
  if (pole === "payment_method" && SPOSOBY_UHRADY[kod]) return t(SPOSOBY_UHRADY[kod]);
  if (pole === "type" && TYPY_FAKTURY[kod]) return t(TYPY_FAKTURY[kod]);
  if (pole === "kind" && (DRUHY_KLUCE as readonly string[]).includes(kod)) return t(nazovDruhu(kod));
  if (PENIAZE.has(pole)) return cislo(v, loc);
  if (pole.endsWith("_at") || /date|Date|At$/.test(pole)) {
    const str = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return pole.endsWith("_at") && str.length > 10
        ? new Date(str).toLocaleString(loc, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bratislava" })
        : datum(str.slice(0, 10), loc);
    }
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Zmeny udalosti ako text: „Predkontácia 501/321 → 518/321 · Suma 100,00 → 120,00“.
 * Pri zaúčtovaní s jedinou predkontáciou bez názvu poľa („501/321 → 518/321“).
 * Prvé vyplnenie bez šípky.
 */
export function textZmien(
  u: Pick<UdalostHistorie, "druh" | "zmeny">,
  t: Prekladac,
  loc: string,
  agenda?: AgendaHistorie,
): { pole: string | null; pred: string | null; po: string }[] {
  const lenPredkontacia =
    u.zmeny.length === 1 &&
    u.zmeny[0].pole === "pohoda_predkontacia" &&
    (u.druh === "zauctovanie" || u.druh === "zmena_zauctovania" || u.druh === "zrusenie_zauctovania" || u.druh === "oprava_zauctovania");
  return u.zmeny.map((z) => {
    const nazov = lenPredkontacia ? null : POLIA_HISTORIE[z.pole] ? t(POLIA_HISTORIE[z.pole]) : z.pole;
    const pred = prazdne(z.pred) && z.pole !== "odberatel_nesedi" ? null : hodnotaPola(z.pole, z.pred, t, loc, agenda);
    // Zrušenie zaúčtovania: kódy ostali, ukáže sa, čo bolo.
    const po = hodnotaPola(z.pole, z.po, t, loc, agenda);
    return { pole: nazov, pred, po };
  });
}

/** Údaje platby (spárovanie) a cesta odovzdania ako text. */
export function textInfo(u: Pick<UdalostHistorie, "druh" | "info">, t: Prekladac, loc: string): string | null {
  if (u.info == null) return null;
  if (u.druh === "sparovanie" || u.druh === "zrusenie_sparovania") {
    const p = u.info as { suma?: number | null; mena?: string | null; datum?: string | null; protistrana?: string | null };
    return [
      p.suma != null ? `${cislo(p.suma, loc)} ${p.mena ?? ""}`.trim() : null,
      p.datum ? datum(p.datum, loc) : null,
      s(p.protistrana),
    ]
      .filter(Boolean)
      .join(", ") || null;
  }
  if (u.druh === "odovzdanie") {
    const c: Record<string, string> = {
      konektor: "Pohoda konektor",
      subor: "súborom",
      prenos: "prenosom z iného programu",
      ine: "inou cestou",
    };
    const k = c[String(u.info)];
    return k ? t(k) : null;
  }
  return null;
}

/** Mená treba len vtedy, keď niektorá udalosť ukazuje človeka. */
export function potrebujeMenaHistorie(u: UdalostHistorie[]): boolean {
  return u.some((x) => ktoCloveka(x.kto) != null);
}
