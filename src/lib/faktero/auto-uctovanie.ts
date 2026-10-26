/*
  Automatické zaúčtovanie — čisté funkcie (bez databázy a modelu).

  Motor (`auto-uctovanie.server.ts`) skladá návrh z troch zdrojov v pevnom
  poradí: pravidlo účtovania → zvyk dodávateľa → AI. Členenie DPH a KV sa
  nikdy nepýta modelu — odvodí ho `odvodClenenia` z režimu dane na doklade,
  lebo tam rozhoduje zákon, nie podobnosť textu.

  Autopilot doklad potvrdí (zaúčtuje) len vtedy, keď nemá žiadny blokátor
  a zdroj je dosť istý; inak návrh čaká na stránke Na kontrolu.
*/

import { KRAJINY_EU, rozdelIcDph } from "./vies";

export type DokladTyp = "prijata" | "blocek" | "vystavena" | "banka";
export type ZdrojZauctovania = "pravidlo" | "zvyk" | "ai";
export type RezimAutopilota = "vypnuty" | "bezpecny" | "plny";

export const REZIMY_AUTOPILOTA: { kod: RezimAutopilota; nazov: string; popis: string }[] = [
  {
    kod: "vypnuty",
    nazov: "Vypnutý",
    popis:
      "Faktero nič nenavrhuje samo — návrh si vyžiadate na doklade alebo na stránke Na kontrolu.",
  },
  {
    kod: "bezpecny",
    nazov: "Bezpečný",
    popis:
      "Samo zaúčtuje doklady, ktoré sedia na pravidlo alebo na ustálený zvyk dodávateľa (istota aspoň 95 %). Návrhy od AI čakajú na kontrolu.",
  },
  {
    kod: "plny",
    nazov: "Plný",
    popis: "Ako bezpečný, a navyše zaúčtuje aj návrhy od AI s istotou aspoň 90 %.",
  },
];

export const PRAH_ISTOTY_ZVYK = 95;
export const PRAH_ISTOTY_AI = 90;
export const PREDVOLENY_LIMIT = 5000;

/** Dôvody, pre ktoré doklad nikdy nejde sám — čaká na človeka. */
export type Blokator =
  | "polozky"
  | "sucet"
  | "vies"
  | "limit"
  | "prvy"
  | "clenenie"
  | "predkontacia"
  | "rezim_dph"
  | "uzamknuty";

export const TEXTY_BLOKATOROV: Record<Blokator, string> = {
  polozky: "Súčet položiek nesedí so sumou dokladu",
  sucet: "Základ a DPH nedávajú spolu sumu dokladu",
  vies: "Prenesenie alebo plnenie z EÚ bez platného overenia IČ DPH vo VIES",
  limit: "Suma je nad limitom pre automatické zaúčtovanie",
  prvy: "Prvý doklad od tohto partnera",
  clenenie: "Nepodarilo sa určiť členenie DPH",
  predkontacia: "Chýba predkontácia",
  rezim_dph: "Režim DPH treba skontrolovať (zahraničný partner)",
  uzamknuty: "Doklad je odovzdaný alebo uzamknutý",
};

export type NavrhZauctovania = {
  predkontacia: string | null;
  clenenieDph: string | null;
  kvClenenie: string | null;
  stredisko: string | null;
  cinnost: string | null;
  kategoria?: string | null;
  zdroj: ZdrojZauctovania | null;
  istota: number;
  pravidloId?: string | null;
  pravidloNazov?: string | null;
  zdovodnenie: string;
  blokatory: Blokator[];
  rezimDph?: RezimDph | null;
  /** Doklad je odovzdaný či uzamknutý — motor ho nesmie meniť. */
  neprepisovat?: boolean;
  /** Kedy návrh vznikol (ISO). */
  kedy?: string;
};

// ───────────────────────── členenie DPH a KV ─────────────────────────

export type RezimDph =
  // prijaté
  | "tuzemsko"
  | "blocek"
  | "tuzemsko_bez_odpoctu"
  | "bez_dph"
  | "pdp_tuzemsko"
  | "eu_tovar"
  | "eu_sluzby"
  | "tretia_krajina"
  | "cudzia_dph"
  | "osobitna_uprava"
  | "firma_neplatitel"
  // vydané
  | "vystup_tuzemsko"
  | "vystup_oslobodene"
  | "vystup_pdp"
  | "vystup_eu_tovar"
  | "vystup_eu_sluzby"
  | "vystup_trojstranny"
  | "vystup_export"
  | "vystup_oss"
  | "vystup_osobitna"
  | "vystup_neplatitel";

export const NAZVY_REZIMOV: Record<RezimDph, string> = {
  tuzemsko: "Tuzemsko s odpočtom",
  blocek: "Bloček (zjednodušená faktúra)",
  tuzemsko_bez_odpoctu: "Tuzemsko bez nároku na odpočet",
  bez_dph: "Doklad bez DPH",
  pdp_tuzemsko: "Prenesenie daňovej povinnosti (tuzemsko)",
  eu_tovar: "Nadobudnutie tovaru z EÚ",
  eu_sluzby: "Služby z EÚ (samozdanenie)",
  tretia_krajina: "Partner mimo EÚ",
  cudzia_dph: "Cudzia DPH z iného štátu EÚ (bez odpočtu)",
  osobitna_uprava: "Osobitná úprava",
  firma_neplatitel: "Firma nie je platiteľ DPH",
  vystup_tuzemsko: "Tuzemské plnenie",
  vystup_oslobodene: "Oslobodené plnenie",
  vystup_pdp: "Prenesenie daňovej povinnosti § 69 ods. 12",
  vystup_eu_tovar: "Dodanie tovaru do EÚ",
  vystup_eu_sluzby: "Služby do EÚ",
  vystup_trojstranny: "Trojstranný obchod",
  vystup_export: "Vývoz mimo EÚ",
  vystup_oss: "Predaj na diaľku (OSS)",
  vystup_osobitna: "Osobitná úprava",
  vystup_neplatitel: "Firma nie je platiteľ DPH",
};

export type VstupClenenia = {
  smer: "prijate" | "vydane";
  krajinaFirmy: string;
  firmaPlatitel: boolean;
  blocek?: boolean;
  opravny?: boolean;
  /** Suma DPH na doklade. */
  dph: number;
  reverseCharge?: boolean | null;
  reverseChargeType?: string | null;
  dphRezim?: string | null;
  euPlnenie?: string | null;
  osobitnaUprava?: string | null;
  ossKrajina?: string | null;
  odpocet?: boolean | null;
  partnerIcDph?: string | null;
  partnerKrajina?: string | null;
};

export type KodCiselnika = {
  druh: string;
  kod: string;
  popis?: string | null;
  agenda?: string | null;
  aktivne?: boolean | null;
};

export type Clenenie = {
  rezim: RezimDph;
  clenenieDph: string | null;
  kvClenenie: string | null;
  odpocet: boolean;
};

const EU = new Set<string>(
  KRAJINY_EU.filter((k) => k !== "XI").map((k) => (k === "EL" ? "GR" : k)),
);

/** Krajina partnera: zo stĺpca, inak z predpony IČ DPH, inak krajina firmy. */
export function krajinaPartnera(
  d: Pick<VstupClenenia, "partnerKrajina" | "partnerIcDph" | "krajinaFirmy">,
) {
  const k = String(d.partnerKrajina ?? "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]{2}$/.test(k)) return k === "EL" ? "GR" : k;
  const r = rozdelIcDph(d.partnerIcDph);
  if (r) return r.kod === "EL" ? "GR" : r.kod;
  return String(d.krajinaFirmy || "SK").toUpperCase();
}

export const jeKrajinaEu = (k: string) => EU.has(String(k).toUpperCase());

/** Režim dane dokladu — z príznakov na doklade a z postavenia firmy. */
export function rezimDph(d: VstupClenenia): RezimDph {
  const domov = String(d.krajinaFirmy || "SK").toUpperCase();
  const partner = krajinaPartnera(d);
  const cudziEu = partner !== domov && jeKrajinaEu(partner);
  const mimoEu = partner !== domov && !jeKrajinaEu(partner);
  const dph = Math.abs(Number(d.dph) || 0);

  if (d.smer === "vydane") {
    if (!d.firmaPlatitel) return "vystup_neplatitel";
    if (d.ossKrajina) return "vystup_oss";
    if (d.osobitnaUprava) return "vystup_osobitna";
    if (d.reverseChargeType === "domestic_69") return "vystup_pdp";
    if (d.euPlnenie === "trojstranny") return "vystup_trojstranny";
    if (d.euPlnenie === "tovar") return "vystup_eu_tovar";
    if (d.euPlnenie === "sluzba") return "vystup_eu_sluzby";
    if (d.reverseChargeType === "export") return "vystup_export";
    if (d.reverseChargeType === "eu_b2b") return "vystup_eu_sluzby";
    if (dph === 0) {
      if (mimoEu) return "vystup_export";
      if (cudziEu) return "vystup_eu_sluzby";
      return "vystup_oslobodene";
    }
    return "vystup_tuzemsko";
  }

  if (!d.firmaPlatitel) return "firma_neplatitel";
  if (d.osobitnaUprava) return "osobitna_uprava";
  if (d.dphRezim === "nadobudnutie" || (cudziEu && d.euPlnenie === "tovar")) return "eu_tovar";
  if (d.dphRezim === "samozdanenie") return mimoEu ? "tretia_krajina" : "eu_sluzby";
  if (d.reverseCharge || d.reverseChargeType === "domestic_69") {
    if (cudziEu) return "eu_sluzby";
    if (mimoEu) return "tretia_krajina";
    return "pdp_tuzemsko";
  }
  if (mimoEu) return "tretia_krajina";
  if (cudziEu && dph === 0) return "eu_sluzby";
  // Hotel či palivo v Rakúsku: cudzia DPH do domáceho priznania nepatrí, odpočet nie je.
  if (cudziEu) return "cudzia_dph";
  if (d.odpocet === false) return "tuzemsko_bez_odpoctu";
  if (dph === 0) return "bez_dph";
  return d.blocek ? "blocek" : "tuzemsko";
}

/** Kódy Pohody overené v Stormware SK (`ZAKLADNE_CLENENIA_DPH`). */
const ZNAME_KODY: Partial<Record<RezimDph, string>> = {
  tuzemsko: "PD",
  blocek: "PD",
  tuzemsko_bez_odpoctu: "PN",
  bez_dph: "PN",
  osobitna_uprava: "PN",
  cudzia_dph: "PN",
  firma_neplatitel: "PN",
  vystup_tuzemsko: "UD",
  vystup_pdp: "UDpdp",
  vystup_oss: "UN",
  vystup_neplatitel: "UN",
};

/** Podľa čoho sa kód hľadá v číselníku firmy (popis z Pohody). */
const KLUCOVE_SLOVA: Partial<Record<RezimDph, RegExp[]>> = {
  tuzemsko: [/tuzem.*odpo/i, /s nárokom/i],
  blocek: [/tuzem.*odpo/i, /s nárokom/i],
  tuzemsko_bez_odpoctu: [/tuzem.*bez nároku/i, /bez nároku/i, /nezahr/i],
  bez_dph: [/nezahr/i, /bez nároku/i],
  osobitna_uprava: [/nezahr/i, /bez nároku/i],
  cudzia_dph: [/nezahr/i],
  firma_neplatitel: [/nezahr/i],
  pdp_tuzemsko: [/daň platí príjemca/i, /§\s*69\s*ods\.?\s*12/i, /prenes/i, /pdp/i],
  eu_tovar: [/nadobud.*tovar/i, /nadobud/i],
  eu_sluzby: [/daň platí príjemca/i, /služ.*(eú|eu|člensk)/i, /§\s*69\s*ods\.?\s*3/i, /samozdan/i],
  tretia_krajina: [/daň platí príjemca/i, /tret(ej|ích|ia) krajin/i, /mimo (eú|eu)/i],
  vystup_tuzemsko: [/^tuzemsk[ée] plnenie$/i, /tuzemsk/i],
  vystup_oslobodene: [/oslob/i],
  vystup_pdp: [/§\s*69\s*ods\.?\s*12/i, /prenes/i],
  vystup_eu_tovar: [/dodanie tovaru.*(eú|eu|člensk)/i, /§\s*43/i],
  vystup_eu_sluzby: [/služ.*(eú|eu|člensk)/i, /miesto plnenia v zahrani/i, /§\s*15/i],
  vystup_trojstranny: [/trojstrann/i],
  vystup_export: [/vývoz/i, /export/i, /§\s*47/i],
  vystup_oss: [/nezahr/i, /oss/i],
  vystup_osobitna: [/osobitn/i, /§\s*6[56]/i],
  vystup_neplatitel: [/nezahr/i],
};

/**
 * Smer kódu členenia. Pohoda SK posiela v agende riadok priznania
 * („1300 P01“, „1200 U01“, „1351 D02“): P = vstup (odpočet), U = výstup,
 * D = daň na výstupe pri samozdanení — tú Pohoda dopĺňa sama, na doklad sa
 * nedáva. Bez agendy rozhoduje prvé písmeno kódu.
 */
function smerKodu(z: KodCiselnika): "prijate" | "vydane" | "ine" | null {
  const a = String(z.agenda ?? "");
  const riadok =
    a.match(/\b([PUD])\d{2}\b/i)?.[1]?.toUpperCase() ??
    a
      .trim()
      .match(/^\d+\s+([PUD])$/i)?.[1]
      ?.toUpperCase();
  const pismeno = riadok ?? String(z.kod).charAt(0).toUpperCase();
  const male = a.toLowerCase();
  if (!riadok && /input|vstup|prij|receiv/.test(male)) return "prijate";
  if (!riadok && /output|vystup|výstup|vyd|issued/.test(male)) return "vydane";
  if (pismeno === "P") return "prijate";
  if (pismeno === "U") return "vydane";
  if (pismeno === "D") return "ine";
  return null;
}

/**
 * Kód členenia DPH pre režim. Firma s vlastným číselníkom dostane kód
 * z neho (známy kód, inak podľa popisu); bez číselníka len overené
 * základné kódy. Neznámy režim vráti `null` — radšej blokátor ako hádanie.
 */
export function kodClenenia(
  rezim: RezimDph,
  smer: "prijate" | "vydane",
  ciselnik: KodCiselnika[],
): string | null {
  const zoznam = ciselnik.filter(
    (z) => z.druh === "clenenie_dph" && z.aktivne !== false && (smerKodu(z) ?? smer) === smer,
  );
  const znamy = ZNAME_KODY[rezim] ?? null;
  if (!zoznam.length) return znamy;
  // Bez nároku na odpočet: firma s číselníkom má na to vlastný kód (PB), PN až potom.
  if (znamy && rezim !== "tuzemsko_bez_odpoctu") {
    const presne = zoznam.find((z) => z.kod === znamy);
    if (presne) return presne.kod;
  }
  for (const re of KLUCOVE_SLOVA[rezim] ?? []) {
    const hit = zoznam.filter((z) => re.test(String(z.popis ?? "")));
    if (hit.length === 1) return hit[0].kod;
    if (hit.length > 1) {
      // Viac kandidátov: najkratší popis býva základný kód.
      return [...hit].sort((a, b) => String(a.popis ?? "").length - String(b.popis ?? "").length)[0]
        .kod;
    }
  }
  return znamy && zoznam.some((z) => z.kod === znamy) ? znamy : null;
}

/** Riadok kontrolného výkazu (len SK platiteľ; prijaté B1/B2/B3/C2/X, vydané A2 alebo automaticky). */
function kvPreRezim(rezim: RezimDph, d: VstupClenenia): string | null {
  if (String(d.krajinaFirmy).toUpperCase() !== "SK") return null;
  if (d.smer === "vydane") return rezim === "vystup_pdp" ? "A2" : null;
  switch (rezim) {
    case "pdp_tuzemsko":
    case "eu_tovar":
    case "eu_sluzby":
      return "B1";
    case "tretia_krajina":
      return d.reverseCharge || d.dphRezim === "samozdanenie" ? "B1" : "X";
    case "blocek":
      return d.opravny ? "C2" : "B3";
    case "tuzemsko":
      return d.opravny ? "C2" : "B2";
    default:
      return "X";
  }
}

/**
 * Členenie DPH a KV z režimu dane. Čistá funkcia — žiadna AI.
 * Odpočet: len tuzemsko, bloček a samozdanenie (daň sa odvedie aj odpočíta).
 */
export function odvodClenenia(d: VstupClenenia, ciselnik: KodCiselnika[] = []): Clenenie {
  const rezim = rezimDph(d);
  const odpocet =
    d.smer === "prijate" &&
    d.firmaPlatitel &&
    ["tuzemsko", "blocek", "pdp_tuzemsko", "eu_tovar", "eu_sluzby"].includes(rezim) &&
    d.odpocet !== false;
  return {
    rezim,
    clenenieDph: kodClenenia(rezim, d.smer, ciselnik),
    kvClenenie: kvPreRezim(rezim, d),
    odpocet,
  };
}

/** Režimy, pri ktorých zákon chce platné IČ DPH partnera z iného štátu. */
export const REZIMY_S_VIES: RezimDph[] = [
  "eu_tovar",
  "eu_sluzby",
  "vystup_eu_tovar",
  "vystup_eu_sluzby",
  "vystup_trojstranny",
];

// ───────────────────────── zvyk dodávateľa ─────────────────────────

export type ZaucDoklad = {
  predkontacia: string | null;
  stredisko?: string | null;
  cinnost?: string | null;
  kategoria?: string | null;
};

export type Zvyk = {
  predkontacia: string;
  stredisko: string | null;
  cinnost: string | null;
  kategoria: string | null;
  istota: number;
  pocet: number;
  zhoda: number;
};

/** Najčastejšia hodnota a jej počet (prázdne sa nerátajú). */
function modus(hodnoty: (string | null | undefined)[]): { h: string; n: number } | null {
  const m = new Map<string, number>();
  for (const v of hodnoty) {
    const t = String(v ?? "").trim();
    if (t) m.set(t, (m.get(t) ?? 0) + 1);
  }
  let best: { h: string; n: number } | null = null;
  for (const [h, n] of m) if (!best || n > best.n) best = { h, n };
  return best;
}

/**
 * Zvyk z posledných (najviac 10) zaúčtovaných dokladov toho istého partnera
 * a druhu. Treba aspoň 3 a väčšinovú predkontáciu; istota je podiel zhody,
 * najviac 98 % (100 % patrí len pravidlu).
 */
export function zvykZDokladov(doklady: ZaucDoklad[], minimum = 3): Zvyk | null {
  const s = doklady.slice(0, 10).filter((d) => String(d.predkontacia ?? "").trim());
  if (s.length < minimum) return null;
  const pk = modus(s.map((d) => d.predkontacia));
  if (!pk || pk.n / s.length <= 0.5) return null;
  const rovnake = s.filter((d) => String(d.predkontacia).trim() === pk.h);
  const vacsinou = (pole: keyof ZaucDoklad) => {
    const m = modus(rovnake.map((d) => d[pole] as string | null));
    return m && m.n / rovnake.length > 0.5 ? m.h : null;
  };
  return {
    predkontacia: pk.h,
    stredisko: vacsinou("stredisko"),
    cinnost: vacsinou("cinnost"),
    kategoria: vacsinou("kategoria"),
    istota: Math.min(98, Math.round((pk.n / s.length) * 100)),
    pocet: s.length,
    zhoda: pk.n,
  };
}

// ───────────────────────── blokátory ─────────────────────────

export type VstupBlokatorov = {
  /** Položky existujú a nesedia so sumou (podľa `polozkyPrijatej`/`rozdielPoloziek`). */
  polozkyNesedia?: boolean;
  zaklad?: number | null;
  dph?: number | null;
  celkom?: number | null;
  rezim?: RezimDph | null;
  viesPlatne?: boolean;
  sumaEur?: number | null;
  limit?: number | null;
  prvyOdPartnera?: boolean;
  clenenieDph?: string | null;
  predkontacia?: string | null;
  uzamknuty?: boolean;
};

export function blokatory(v: VstupBlokatorov): Blokator[] {
  const out: Blokator[] = [];
  if (v.uzamknuty) return ["uzamknuty"];
  if (v.polozkyNesedia) out.push("polozky");
  if (v.zaklad != null && v.dph != null && v.celkom != null) {
    const rozdiel = Math.abs(Number(v.zaklad) + Number(v.dph) - Number(v.celkom));
    // Zaokrúhlenie hotovosti na 5 centov je bežné.
    if (Number(v.celkom) !== 0 && rozdiel > 0.051) out.push("sucet");
  }
  if (v.rezim && REZIMY_S_VIES.includes(v.rezim) && !v.viesPlatne) out.push("vies");
  if (v.rezim === "tretia_krajina" || v.rezim === "cudzia_dph") out.push("rezim_dph");
  if (v.limit != null && v.sumaEur != null && Math.abs(Number(v.sumaEur)) > Number(v.limit))
    out.push("limit");
  if (v.prvyOdPartnera) out.push("prvy");
  if (!String(v.predkontacia ?? "").trim()) out.push("predkontacia");
  if (!String(v.clenenieDph ?? "").trim()) out.push("clenenie");
  return out;
}

// ───────────────────────── autopilot ─────────────────────────

/** Smie autopilot návrh potvrdiť sám? */
export function smieAutopilot(rezim: RezimAutopilota, n: NavrhZauctovania): boolean {
  if (rezim === "vypnuty" || n.neprepisovat || !n.zdroj) return false;
  if (n.blokatory.length) return false;
  if (!n.predkontacia || !n.clenenieDph) return false;
  if (n.zdroj === "pravidlo" || n.zdroj === "zvyk") return n.istota >= PRAH_ISTOTY_ZVYK;
  return rezim === "plny" && n.istota >= PRAH_ISTOTY_AI;
}

export function jeRezimAutopilota(v: unknown): v is RezimAutopilota {
  return v === "vypnuty" || v === "bezpecny" || v === "plny";
}

/** Krátky popis zdroja na štítok: „pravidlo Telekom“, „zvyk 98 %“, „AI 91 %“. */
export function popisZdroja(
  zdroj: string | null | undefined,
  istota: number | null | undefined,
  pravidlo?: string | null,
): string {
  if (zdroj === "pravidlo") return pravidlo ? `pravidlo ${pravidlo}` : "pravidlo";
  if (zdroj === "zvyk") return `zvyk ${istota ?? 0} %`;
  if (zdroj === "ai") return `AI ${istota ?? 0} %`;
  if (zdroj === "manual") return "ručne";
  return "";
}

/**
 * Oprava automatického návrhu: rovnaká oprava (rovnaký nový kód) u toho
 * istého partnera druhýkrát → ponúknuť pravidlo.
 */
export function ponukniPravidlo(
  predoslePravy: { ico: string | null; po: string | null }[],
  ico: string | null,
  po: string | null,
) {
  if (!ico || !po) return false;
  return predoslePravy.filter((p) => p.ico === ico && p.po === po).length >= 1;
}

/**
 * Položky nesedia so sumou dokladu — ani so sumou s DPH, ani so základom
 * (položky z čítania bývajú raz s DPH, raz bez). Bez položiek nič.
 */
export function polozkyNesedia(
  items: unknown,
  zaklad: number | null | undefined,
  celkom: number | null | undefined,
): boolean {
  const p = Array.isArray(items) ? items.filter((x: any) => String(x?.name ?? "").trim()) : [];
  if (!p.length) return false;
  const suma = (x: any) => {
    const t = Number(x?.total);
    return x?.total !== null && x?.total !== undefined && Number.isFinite(t)
      ? t
      : (Number(x?.quantity ?? 1) || 1) * Number(x?.unit_price ?? 0);
  };
  const sucet = p.reduce((a, x) => a + suma(x), 0);
  const tol = Math.max(0.03, 0.01 * p.length);
  const sedi = (cie: number | null | undefined) =>
    cie != null &&
    Number.isFinite(Number(cie)) &&
    Math.abs(Math.abs(sucet) - Math.abs(Number(cie))) <= tol;
  return !(sedi(celkom) || sedi(zaklad));
}
