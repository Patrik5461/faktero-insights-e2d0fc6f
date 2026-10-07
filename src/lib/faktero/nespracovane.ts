/*
  Nespracované doklady (ako v Doklado).

  Všetko, čo príde e-mailom alebo sa nahrá, čaká najprv tu. Človek doklad
  otvorí, určí druh (prijatá faktúra, zálohová, dobropis, bloček, iný
  doklad), skontroluje vyťažené údaje, zaúčtuje a „Vytvorí" — až vtedy
  vznikne skutočný doklad v príslušnej sekcii. Kým je doklad tu, nevstupuje
  do DPH, pokladne ani do účtovníctva.

  Čisté funkcie: návrh druhu z vyťaženia, údaje formulára, povinné polia
  a riadky cieľových tabuliek.
*/

import { druhPrijatehoDokladu } from "./zalohova-rozpoznanie";
import { najblizsiaSadzba } from "./vat-rates";
import { datum as datumZAi } from "./mail-prijem";

export type DruhNespracovaneho = "faktura" | "zalohova" | "dobropis" | "blocek" | "ostatny";

export const DRUHY_NESPRACOVANYCH: { kluc: DruhNespracovaneho; nazov: string }[] = [
  { kluc: "faktura", nazov: "Prijatá faktúra" },
  { kluc: "zalohova", nazov: "Prijatá zálohová faktúra" },
  { kluc: "dobropis", nazov: "Prijatý dobropis" },
  { kluc: "blocek", nazov: "Bloček / pokladničný doklad" },
  { kluc: "ostatny", nazov: "Iný doklad (zmluva, list, predpis…)" },
];

export type RiadokRozpisu = { sadzba: number; zaklad: number; dph: number };

export type UdajeNespracovaneho = {
  dodavatel: {
    nazov: string;
    ico: string;
    dic: string;
    icDph: string;
    iban: string;
    ulica: string;
    mesto: string;
    psc: string;
  };
  cislo: string;
  vs: string;
  /** Čo sa fakturuje — do Pohody ide ako text faktúry. */
  popis: string;
  datumVystavenia: string;
  datumDodania: string;
  splatnost: string;
  mena: string;
  rozpis: RiadokRozpisu[];
  celkom: number | null;
  platba: string;
  kategoria: string;
  opravuje: string;
  jobId: string;
  poznamka: string;
  /** Iný doklad. */
  ostatny: { druh: string; predmet: string; lehota: string };
  /** Zaúčtovanie — rovnaké kódy ako pri prijatej faktúre. */
  kody: {
    predkontacia: string;
    clenenie: string;
    kv: string;
    stredisko: string;
    cinnost: string;
    rad: string;
    intPoznamka: string;
  };
  polozky: {
    name: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    vat_rate: number | null;
    total: number | null;
    /** Položka v prenesení daňovej povinnosti (§ 69 ods. 12). */
    pdp?: boolean;
  }[];
  /** Celá faktúra je v prenesení daňovej povinnosti. */
  prenesenie?: boolean;
};

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const t = (v: unknown, max = 255) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
/** Dátum z vyťaženia — prijme aj „15.10.2026" či „15/10/2026", nielen RRRR-MM-DD. */
const datum = (v: unknown): string => datumZAi(typeof v === "string" ? v : "") ?? "";

/** Prázdne údaje formulára. */
export function prazdneUdaje(): UdajeNespracovaneho {
  return {
    dodavatel: { nazov: "", ico: "", dic: "", icDph: "", iban: "", ulica: "", mesto: "", psc: "" },
    cislo: "",
    vs: "",
    popis: "",
    datumVystavenia: "",
    datumDodania: "",
    splatnost: "",
    mena: "EUR",
    rozpis: [],
    celkom: null,
    platba: "",
    kategoria: "",
    opravuje: "",
    jobId: "",
    poznamka: "",
    ostatny: { druh: "ine", predmet: "", lehota: "" },
    kody: { predkontacia: "", clenenie: "", kv: "", stredisko: "", cinnost: "", rad: "", intPoznamka: "" },
    polozky: [],
  };
}

/** Zlúči uložené údaje s prázdnou kostrou — staršie riadky nemusia mať všetky polia. */
export function nacitajUdaje(v: unknown): UdajeNespracovaneho {
  const z = prazdneUdaje();
  const u = (v && typeof v === "object" ? v : {}) as Partial<UdajeNespracovaneho>;
  return {
    ...z,
    ...u,
    dodavatel: { ...z.dodavatel, ...(u.dodavatel ?? {}) },
    ostatny: { ...z.ostatny, ...(u.ostatny ?? {}) },
    kody: { ...z.kody, ...(u.kody ?? {}) },
    rozpis: Array.isArray(u.rozpis) ? u.rozpis : [],
    polozky: Array.isArray(u.polozky) ? u.polozky : [],
  };
}

/** Druh dokladu podľa toho, čo prečítala AI; človek ho môže zmeniť. */
export function navrhDruhu(ai: Record<string, unknown> | null | undefined, nazovSuboru?: string | null): DruhNespracovaneho {
  if (!ai) return "faktura";
  if (ai.document_type === "ostatny") return "ostatny";
  const pod = String(ai.document_subtype ?? "").toLowerCase();
  if (pod === "blocek") return "blocek";
  if (pod === "dobropis" || (num(ai.amount_total) ?? 0) < 0) return "dobropis";
  const typ = druhPrijatehoDokladu({
    druhOdAi: ai.document_subtype,
    nazovDokladu: ai.document_title,
    cisloDokladu: ai.invoice_number,
    nazovSuboru,
  });
  return typ === "proforma" ? "zalohova" : "faktura";
}

/**
 * Rozpis DPH z vyťaženia: z položiek po sadzbách, keď súčet sedí so sumami
 * dokladu; inak jeden riadok so sadzbou dopočítanou zo základu a dane.
 */
export function rozpisZAi(ai: Record<string, unknown> | null | undefined): RiadokRozpisu[] {
  if (!ai) return [];
  const zaklad = num(ai.amount_without_vat);
  const dph = num(ai.vat_amount);
  const spolu = num(ai.amount_total);
  const z = zaklad ?? (spolu !== null && dph !== null ? spolu - dph : null);
  const d = dph ?? (spolu !== null && z !== null ? spolu - z : null);
  const polozky = Array.isArray(ai.items) ? (ai.items as any[]) : [];
  if (polozky.length && z !== null) {
    const po: Record<string, RiadokRozpisu> = {};
    for (const p of polozky) {
      const s = num(p?.vat_rate);
      const celk = num(p?.total);
      if (s === null || celk === null) {
        Object.keys(po).forEach((k) => delete po[k]);
        break;
      }
      const zakl = celk / (1 + s / 100);
      const k = String(s);
      po[k] ??= { sadzba: s, zaklad: 0, dph: 0 };
      po[k].zaklad += zakl;
      po[k].dph += celk - zakl;
    }
    const riadky = Object.values(po)
      .sort((a, b) => b.sadzba - a.sadzba)
      .map((r) => ({ sadzba: r.sadzba, zaklad: r2(r.zaklad), dph: r2(r.dph) }));
    const sucet = riadky.reduce((a, r) => a + r.zaklad, 0);
    if (riadky.length && Math.abs(sucet - z) <= 0.05 * Math.max(1, riadky.length)) {
      // Centy dorovná posledný riadok, aby súčty sedeli s dokladom.
      const posl = riadky[riadky.length - 1]!;
      posl.zaklad = r2(posl.zaklad + (z - sucet));
      if (d !== null) posl.dph = r2(posl.dph + (d - riadky.reduce((a, r) => a + r.dph, 0)));
      return riadky;
    }
  }
  if (z === null && d === null) return [];
  const zz = Math.abs(z ?? 0);
  const dd = Math.abs(d ?? 0);
  return [{ sadzba: zz ? najblizsiaSadzba((dd / zz) * 100, "SK") : 0, zaklad: zz, dph: dd }];
}

/**
 * Variabilný symbol: čo je na doklade (bez medzier, najviac 10 číslic), inak
 * číslo faktúry, keď je celé z číslic — tak to robí väčšina slovenských
 * dodávateľov a bez VS sa platba s faktúrou nespáruje.
 */
export function vsDokladu(vs: unknown, cislo: string): string {
  const z = t(vs, 40).replace(/\s/g, "").replace(/^VS:?/i, "");
  if (/^\d{1,10}$/.test(z)) return z;
  if (z) return z.slice(0, 20);
  const c = cislo.replace(/\s/g, "");
  return /^\d{1,10}$/.test(c) ? c : "";
}

/**
 * Doplní do už vyplnených údajov to, čo v nich chýba (VS, IBAN, splatnosť,
 * adresa, popis…), z nového vyťaženia. Vyplnené sa neprepisuje — napríklad
 * údaje z bločkového čítania, ktoré si človek mohol už opraviť.
 */
export function doplnUdaje(povodne: UdajeNespracovaneho, nove: UdajeNespracovaneho): UdajeNespracovaneho {
  const u = { ...povodne, dodavatel: { ...povodne.dodavatel } };
  for (const k of Object.keys(u.dodavatel) as (keyof UdajeNespracovaneho["dodavatel"])[])
    if (!u.dodavatel[k] && nove.dodavatel[k]) u.dodavatel[k] = nove.dodavatel[k];
  for (const k of ["cislo", "popis", "splatnost", "datumVystavenia", "datumDodania"] as const)
    if (!u[k] && nove[k]) u[k] = nove[k];
  if (!u.vs) u.vs = nove.vs || vsDokladu(null, u.cislo);
  if (!u.rozpis.length && nove.rozpis.length) u.rozpis = nove.rozpis;
  if (u.celkom == null && nove.celkom != null) u.celkom = nove.celkom;
  if (!u.polozky.length && nove.polozky.length) u.polozky = nove.polozky;
  return u;
}

/** Údaje formulára predvyplnené z vyťaženia. */
export function udajeZAi(ai: Record<string, unknown> | null | undefined, dnes: string): UdajeNespracovaneho {
  const u = prazdneUdaje();
  if (!ai) return u;
  const vystavenie = datum(ai.issue_date);
  u.dodavatel = {
    nazov: t(ai.supplier_name, 200),
    ico: t(ai.supplier_ico, 20).replace(/\s/g, ""),
    dic: t(ai.supplier_dic, 20),
    icDph: t(ai.supplier_ic_dph, 20).replace(/\s/g, "").toUpperCase(),
    iban: t(ai.supplier_iban, 40).replace(/\s/g, "").toUpperCase(),
    ulica: t(ai.supplier_street, 120),
    mesto: t(ai.supplier_city, 80),
    psc: t(ai.supplier_zip, 15),
  };
  u.cislo = t(ai.invoice_number, 60);
  u.popis = t(ai.description, 240);
  u.vs = vsDokladu(ai.variable_symbol, u.cislo);
  u.datumVystavenia = vystavenie || dnes;
  u.datumDodania = vystavenie || dnes;
  u.splatnost = datum(ai.due_date) || datum(ai.other_due_date);
  u.mena = (t(ai.currency, 3) || "EUR").toUpperCase();
  u.rozpis = rozpisZAi(ai);
  const spolu = num(ai.amount_total);
  u.celkom = spolu === null ? null : Math.abs(spolu);
  u.polozky = (Array.isArray(ai.items) ? (ai.items as any[]) : [])
    .filter((p) => t(p?.name))
    .map((p) => ({
      name: t(p.name, 200),
      quantity: num(p.quantity),
      unit: t(p.unit, 10) || null,
      unit_price: num(p.unit_price),
      vat_rate: num(p.vat_rate),
      total: num(p.total),
      ...(p.reverse_charge === true ? { pdp: true } : {}),
    }));
  u.prenesenie = ai.reverse_charge === true;
  u.ostatny = {
    druh: t(ai.other_kind, 30) || "ine",
    predmet: t(ai.other_subject, 500),
    lehota: datum(ai.other_due_date),
  };
  u.poznamka = t(ai.summary, 1000);
  return u;
}

/** Súčty rozpisu (kladné). */
export function sucty(u: UdajeNespracovaneho): { zaklad: number; dph: number; celkom: number } {
  const zaklad = r2(u.rozpis.reduce((a, r) => a + (Number(r.zaklad) || 0), 0));
  const dph = r2(u.rozpis.reduce((a, r) => a + (Number(r.dph) || 0), 0));
  const celkom = u.celkom != null && u.celkom !== ("" as unknown) ? r2(Number(u.celkom)) : r2(zaklad + dph);
  return { zaklad, dph, celkom };
}

/** Názov vyrovnávacej položky — podľa neho ju export spozná. */
export const VYROVNAVACIA_POLOZKA = "Vyrovnanie centového rozdielu";

/**
 * Nesúlad položiek so súčtom dokladu. Položky z čítania bývajú raz s DPH,
 * raz bez — sedí, keď sa súčet položiek rovná sume s DPH alebo základu.
 * Vráti `null`, keď sedí (alebo položky nie sú), inak rozdiel oproti sume
 * s DPH, ktorý treba doplniť vyrovnávacou položkou.
 */
export function rozdielPoloziek(
  u: UdajeNespracovaneho,
): { sucet: number; rozdiel: number; netto: boolean } | null {
  const p = u.polozky.filter((x) => x.name?.trim());
  if (!p.length) return null;
  const sucet = r2(
    p.reduce((a, x) => a + (x.total != null ? Number(x.total) : (Number(x.quantity) || 1) * Number(x.unit_price ?? 0)), 0),
  );
  const s = sucty(u);
  if (!s.celkom) return null;
  if (Math.abs(sucet - s.celkom) < 0.005) return null;
  if (s.zaklad && Math.abs(sucet - s.zaklad) < 0.005) return null;
  // Bližšie k základu = položky sú bez DPH, rozdiel sa ráta voči základu.
  const netto = s.zaklad > 0 && Math.abs(sucet - s.zaklad) < Math.abs(sucet - s.celkom);
  return { sucet, rozdiel: r2((netto ? s.zaklad : s.celkom) - sucet), netto };
}

/** Doplní vyrovnávaciu položku tak, aby súčet položiek sedel s dokladom. */
export function vyrovnajPolozky(u: UdajeNespracovaneho): UdajeNespracovaneho {
  const r = rozdielPoloziek(u);
  if (!r) return u;
  const ina = u.polozky.filter((x) => x.name !== VYROVNAVACIA_POLOZKA);
  const stara = u.polozky.find((x) => x.name === VYROVNAVACIA_POLOZKA);
  const suma = r2((stara?.total != null ? Number(stara.total) : 0) + r.rozdiel);
  return {
    ...u,
    polozky: suma
      ? [...ina, { name: VYROVNAVACIA_POLOZKA, quantity: 1, unit: null, unit_price: suma, vat_rate: 0, total: suma }]
      : ina,
  };
}

/** Povinné polia, ktoré chýbajú — zvýraznia sa červenou, bez nich sa doklad nevytvorí. */
export function chybajuce(druh: DruhNespracovaneho | null, u: UdajeNespracovaneho): string[] {
  const out: string[] = [];
  if (!druh) return ["druh"];
  if (druh === "ostatny") return out;
  if (!u.dodavatel.nazov.trim()) out.push("dodavatel");
  if (!u.datumVystavenia) out.push("datumVystavenia");
  const s = sucty(u);
  if (!s.celkom) out.push("celkom");
  if (druh === "blocek") {
    if (!u.platba) out.push("platba");
  } else {
    if (!u.cislo.trim()) out.push("cislo");
    if (!u.splatnost) out.push("splatnost");
    if (druh === "dobropis" && !u.opravuje.trim()) out.push("opravuje");
  }
  // Položky musia sedieť so sumou; pri hotovosti je rozdiel zaokrúhlenie na 5 centov.
  const rozdiel = rozdielPoloziek(u);
  if (rozdiel && !(u.platba === "hotovost" && Math.abs(rozdiel.rozdiel) <= 0.02)) out.push("polozky");
  return out;
}

/** Popisy povinných polí pre hlášku. */
export const NAZVY_POLI: Record<string, string> = {
  druh: "druh dokladu",
  dodavatel: "dodávateľ",
  datumVystavenia: "dátum vystavenia",
  celkom: "suma",
  platba: "spôsob úhrady",
  cislo: "číslo dokladu",
  splatnost: "splatnosť",
  opravuje: "číslo opravovanej faktúry",
  polozky: "súlad položiek so sumou (pridajte vyrovnávaciu položku)",
};

const prazdne = (v: string) => (v.trim() ? v.trim() : null);

/** Riadok `purchase_invoices` z údajov (faktúra, zálohová, dobropis). */
export function prijataZUdajov(
  druh: "faktura" | "zalohova" | "dobropis",
  u: UdajeNespracovaneho,
  dnes: string,
) {
  const s = sucty(u);
  const zn = druh === "dobropis" ? -1 : 1;
  return {
    supplier_name: u.dodavatel.nazov.trim() || "Neurčený dodávateľ",
    supplier_ico: prazdne(u.dodavatel.ico),
    supplier_dic: prazdne(u.dodavatel.dic),
    supplier_ic_dph: prazdne(u.dodavatel.icDph),
    supplier_iban: prazdne(u.dodavatel.iban.replace(/\s/g, "").toUpperCase()),
    supplier_street: prazdne(u.dodavatel.ulica),
    supplier_city: prazdne(u.dodavatel.mesto),
    supplier_zip: prazdne(u.dodavatel.psc),
    invoice_number: u.cislo.trim() || "bez čísla",
    variable_symbol: prazdne(u.vs),
    issue_date: u.datumVystavenia || dnes,
    delivery_date: u.datumDodania || u.datumVystavenia || dnes,
    due_date: u.splatnost || u.datumVystavenia || dnes,
    received_date: dnes,
    amount_without_vat: r2(zn * s.zaklad),
    vat_amount: r2(zn * s.dph),
    amount_total: r2(zn * s.celkom),
    currency: (u.mena || "EUR").toUpperCase(),
    payment_method: u.platba || "prevod",
    type: druh === "zalohova" ? "proforma" : "regular",
    // Zo zálohovej sa daň neodpočítava.
    odpocet: druh !== "zalohova",
    opravuje_cislo: druh === "dobropis" ? prazdne(u.opravuje) : null,
    intro_note: prazdne(u.popis ?? ""),
    category: prazdne(u.kategoria),
    note: prazdne(u.poznamka),
    items: u.polozky.length ? u.polozky : null,
    // Celá faktúra v prenesení: odberateľ daň samozdaní (KV B.1).
    ...(u.prenesenie ? { reverse_charge: true, dph_rezim: "samozdanenie" } : {}),
    job_id: prazdne(u.jobId),
    pohoda_predkontacia: prazdne(u.kody.predkontacia),
    pohoda_clenenie_dph: prazdne(u.kody.clenenie),
    kv_clenenie: prazdne(u.kody.kv),
    stredisko: prazdne(u.kody.stredisko),
    cinnost: prazdne(u.kody.cinnost),
    pohoda_rad: prazdne(u.kody.rad),
    int_poznamka: prazdne(u.kody.intPoznamka),
  };
}

/** Riadok `expense_documents` z údajov (bloček). */
export function blocekZUdajov(u: UdajeNespracovaneho) {
  const s = sucty(u);
  const sadzby = [...new Set(u.rozpis.map((r) => Number(r.sadzba) || 0))];
  return {
    supplier_name: prazdne(u.dodavatel.nazov),
    supplier_ico: prazdne(u.dodavatel.ico),
    supplier_ic_dph: prazdne(u.dodavatel.icDph),
    document_number: prazdne(u.cislo),
    issue_date: u.datumVystavenia || null,
    net_amount: s.zaklad,
    vat_amount: s.dph,
    total_amount: s.celkom,
    vat_rate: sadzby.length === 1 ? sadzby[0] : null,
    vat_breakdown: u.rozpis.length ? u.rozpis : null,
    currency: (u.mena || "EUR").toUpperCase(),
    payment_method: u.platba || "karta",
    category: prazdne(u.kategoria),
    note: prazdne(u.poznamka),
    items: u.polozky.length ? u.polozky : null,
    job_id: prazdne(u.jobId),
    pohoda_predkontacia: prazdne(u.kody.predkontacia),
    pohoda_clenenie_dph: prazdne(u.kody.clenenie),
    kv_clenenie: prazdne(u.kody.kv),
    stredisko: prazdne(u.kody.stredisko),
    cinnost: prazdne(u.kody.cinnost),
    pohoda_rad: prazdne(u.kody.rad),
    int_poznamka: prazdne(u.kody.intPoznamka),
  };
}

/** Riadok `other_documents` z údajov (iný doklad). */
export function ostatnyZUdajov(u: UdajeNespracovaneho, dnes: string) {
  const s = sucty(u);
  return {
    kind: u.ostatny.druh || "ine",
    sender: prazdne(u.dodavatel.nazov),
    subject: prazdne(u.ostatny.predmet) ?? prazdne(u.cislo),
    received_date: dnes,
    amount: s.celkom || null,
    currency: (u.mena || "EUR").toUpperCase(),
    due_date: u.ostatny.lehota || u.splatnost || null,
    note: prazdne(u.poznamka),
  };
}
