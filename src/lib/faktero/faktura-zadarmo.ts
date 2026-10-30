/*
  „Faktúra zadarmo“ — verejná stránka `/faktura-zadarmo`, kde si človek bez
  účtu vyplní faktúru a stiahne PDF.

  Tu sú len čisté funkcie, ktoré používa prehliadač aj server:
  - tvar a limity vstupu (zod), čistenie textu a kontrola náležitostí,
  - súčty (rovnaké zaokrúhľovanie ako `computeInvoiceTotals`),
  - prevod na vstup PDF generátora (`generateInvoicePdfBytes`),
  - prenos vyplnených údajov do účtu po registrácii (localStorage → firma,
    odberateľ, koncept faktúry).

  Nič z toho nič neukladá ani neposiela. Generovanie s captchou a limitom
  pokusov je v `faktura-zadarmo.server.ts`.
*/
import { z } from "zod";
import { cistyText } from "@/lib/bezpecny-text";
import { krajinaDane, sadzbyKrajiny, zakladnaSadzba, type KrajinaDane } from "./vat-rates";
import { predvolenaSchema, type SchemaDph } from "./dph-rezim";
import { skontrolujDatumy } from "./faktura-nalezitosti";
import { ibanPlatny, normIban } from "./banka-notifikacie";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
/* ───────────── limity ───────────── */

export const LIMITY_ZADARMO = {
  polozky: 50,
  nazov: 150,
  ulica: 120,
  mesto: 80,
  psc: 12,
  ico: 12,
  dic: 14,
  icDph: 16,
  iban: 42,
  swift: 11,
  email: 120,
  telefon: 30,
  zapis: 200,
  cislo: 30,
  vs: 10,
  nazovPolozky: 200,
  mj: 10,
  poznamka: 1000,
  /** Logo v bajtoch (PNG/JPEG). Base64 je o tretinu dlhší. */
  logoBajtov: 250_000,
  mnozstvo: 1_000_000,
  cena: 10_000_000,
} as const;

/** Najviac znakov base64 pre logo (s rezervou na zaokrúhlenie). */
export const LOGO_BASE64_MAX = Math.ceil((LIMITY_ZADARMO.logoBajtov * 4) / 3) + 8;

export const KRAJINY_ZADARMO = ["SK", "CZ"] as const;
export type KrajinaZadarmo = (typeof KRAJINY_ZADARMO)[number];
export const MENY_ZADARMO = ["EUR", "CZK"] as const;
export const JAZYKY_FAKTURY_ZADARMO = ["sk", "cs", "en", "de"] as const;
export type JazykFakturyZadarmo = (typeof JAZYKY_FAKTURY_ZADARMO)[number];

/**
 * Režim DPH platiteľa. Neplatiteľ má vždy „bežný“ (bez dane) — prenesenie
 * ani oslobodené dodanie do EÚ neuplatňuje.
 */
export const REZIMY_ZADARMO = ["bezny", "pdp_tuzemsko", "eu_tovar", "eu_sluzba"] as const;
export type RezimZadarmo = (typeof REZIMY_ZADARMO)[number];

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const txt = (max: number) =>
  z
    .string()
    .max(max * 2)
    .default("");

const PolozkaZ = z.object({
  nazov: txt(LIMITY_ZADARMO.nazovPolozky),
  mnozstvo: z.number().finite().gt(0).max(LIMITY_ZADARMO.mnozstvo),
  mj: txt(LIMITY_ZADARMO.mj),
  cena: z.number().finite().min(-LIMITY_ZADARMO.cena).max(LIMITY_ZADARMO.cena),
  sadzba: z.number().finite().min(0).max(100).default(0),
});

const DodavatelZ = z.object({
  nazov: txt(LIMITY_ZADARMO.nazov),
  ulica: txt(LIMITY_ZADARMO.ulica),
  mesto: txt(LIMITY_ZADARMO.mesto),
  psc: txt(LIMITY_ZADARMO.psc),
  ico: txt(LIMITY_ZADARMO.ico),
  dic: txt(LIMITY_ZADARMO.dic),
  icDph: txt(LIMITY_ZADARMO.icDph),
  iban: txt(LIMITY_ZADARMO.iban),
  swift: txt(LIMITY_ZADARMO.swift),
  email: txt(LIMITY_ZADARMO.email),
  telefon: txt(LIMITY_ZADARMO.telefon),
  /** Zápis v obchodnom / živnostenskom registri (§ 3a Obchodného zákonníka). */
  zapis: txt(LIMITY_ZADARMO.zapis),
  platitel: z.boolean().default(false),
});

const OdberatelZ = z.object({
  nazov: txt(LIMITY_ZADARMO.nazov),
  ulica: txt(LIMITY_ZADARMO.ulica),
  mesto: txt(LIMITY_ZADARMO.mesto),
  psc: txt(LIMITY_ZADARMO.psc),
  krajina: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .default("SK"),
  ico: txt(LIMITY_ZADARMO.ico),
  dic: txt(LIMITY_ZADARMO.dic),
  icDph: txt(LIMITY_ZADARMO.icDph),
  email: txt(LIMITY_ZADARMO.email),
});

export const FakturaZadarmoZ = z.object({
  krajina: z.enum(KRAJINY_ZADARMO),
  mena: z.enum(MENY_ZADARMO),
  jazyk: z.enum(JAZYKY_FAKTURY_ZADARMO),
  rezim: z.enum(REZIMY_ZADARMO).default("bezny"),
  sposobUhrady: z.enum(["bank_transfer", "cash", "card"]).default("bank_transfer"),
  dodavatel: DodavatelZ,
  odberatel: OdberatelZ,
  cislo: txt(LIMITY_ZADARMO.cislo),
  vs: txt(LIMITY_ZADARMO.vs),
  datumVystavenia: z.string().regex(DATUM),
  datumDodania: z.union([z.string().regex(DATUM), z.literal("")]).default(""),
  datumSplatnosti: z.string().regex(DATUM),
  polozky: z.array(PolozkaZ).min(1).max(LIMITY_ZADARMO.polozky),
  poznamka: txt(LIMITY_ZADARMO.poznamka),
});

export type FakturaZadarmo = z.infer<typeof FakturaZadarmoZ>;
export type PolozkaZadarmo = FakturaZadarmo["polozky"][number];

/** Logo ide s požiadavkou zvlášť — do prenosu do účtu sa neukladá (je veľké). */
export const LogoZ = z
  .object({
    mime: z.enum(["image/png", "image/jpeg"]),
    base64: z.string().max(LOGO_BASE64_MAX),
  })
  .nullable()
  .optional();

/* ───────────── predvolené hodnoty ───────────── */

export function pridajDni(iso: string, dni: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + dni);
  return d.toISOString().slice(0, 10);
}

/** Splatnosť, ktorú formulár predvolí — 14 dní od vystavenia. */
export const SPLATNOST_DNI = 14;

export function prazdnaPolozka(
  krajina: KrajinaZadarmo,
  platitel: boolean,
  den?: string,
): PolozkaZadarmo {
  return {
    nazov: "",
    mnozstvo: 1,
    mj: "ks",
    cena: 0,
    sadzba: platitel ? zakladnaSadzba(krajina, den) : 0,
  };
}

export function novaFakturaZadarmo(
  krajina: KrajinaZadarmo,
  dnes: string = dnesBratislava(),
): FakturaZadarmo {
  return {
    krajina,
    mena: krajina === "CZ" ? "CZK" : "EUR",
    jazyk: krajina === "CZ" ? "cs" : "sk",
    rezim: "bezny",
    sposobUhrady: "bank_transfer",
    dodavatel: {
      nazov: "",
      ulica: "",
      mesto: "",
      psc: "",
      ico: "",
      dic: "",
      icDph: "",
      iban: "",
      swift: "",
      email: "",
      telefon: "",
      zapis: "",
      platitel: false,
    },
    odberatel: {
      nazov: "",
      ulica: "",
      mesto: "",
      psc: "",
      krajina,
      ico: "",
      dic: "",
      icDph: "",
      email: "",
    },
    cislo: `${dnes.slice(0, 4)}001`,
    vs: "",
    datumVystavenia: dnes,
    datumDodania: dnes,
    datumSplatnosti: pridajDni(dnes, SPLATNOST_DNI),
    polozky: [prazdnaPolozka(krajina, false, dnes)],
    poznamka: "",
  };
}

/* ───────────── sadzby a režim ───────────── */

/** Deň, podľa ktorého sa berú sadzby — dodanie, inak vystavenie. */
export function denSadzieb(f: Pick<FakturaZadarmo, "datumDodania" | "datumVystavenia">): string {
  return f.datumDodania || f.datumVystavenia;
}

/** Sadzby na výber: platiteľ podľa krajiny a dňa (`vat-rates.ts`), neplatiteľ len 0. */
export function sadzbyZadarmo(
  f: Pick<FakturaZadarmo, "krajina" | "datumDodania" | "datumVystavenia" | "dodavatel">,
): number[] {
  return f.dodavatel.platitel ? sadzbyKrajiny(f.krajina, denSadzieb(f)) : [0];
}

/** Daň sa na faktúre nevyčísľuje (neplatiteľ, prenesenie, dodanie do EÚ). */
export function bezDane(f: Pick<FakturaZadarmo, "rezim" | "dodavatel">): boolean {
  return !f.dodavatel.platitel || f.rezim !== "bezny";
}

/** Sadzba, ktorá na položke naozaj platí. */
export function sadzbaPolozky(
  f: Pick<FakturaZadarmo, "rezim" | "dodavatel">,
  p: Pick<PolozkaZadarmo, "sadzba">,
): number {
  return bezDane(f) ? 0 : Number(p.sadzba) || 0;
}

export function schemaDphZadarmo(krajina: KrajinaDane, platitel: boolean): SchemaDph {
  return predvolenaSchema(krajina, platitel);
}

/* ───────────── súčty ───────────── */

export type SuctyZadarmo = {
  zaklad: number;
  dan: number;
  spolu: number;
  riadky: { zaklad: number; dan: number; spolu: number; sadzba: number }[];
  /** Rozpis podľa sadzieb (len nenulové základy). */
  podlaSadzby: { sadzba: number; zaklad: number; dan: number }[];
};

const r2 = (n: number) => +n.toFixed(2);

/** Rovnaké zaokrúhlenie ako `computeInvoiceTotals` — riadok na centy, potom súčet. */
export function spocitajZadarmo(
  f: Pick<FakturaZadarmo, "polozky" | "rezim" | "dodavatel">,
): SuctyZadarmo {
  let zaklad = 0;
  let dan = 0;
  const mapa = new Map<number, { zaklad: number; dan: number }>();
  const riadky = f.polozky.map((p) => {
    const sadzba = sadzbaPolozky(f, p);
    const z = r2(Number(p.mnozstvo) * Number(p.cena));
    const d = r2((z * sadzba) / 100);
    zaklad += z;
    dan += d;
    const m = mapa.get(sadzba) ?? { zaklad: 0, dan: 0 };
    m.zaklad += z;
    m.dan += d;
    mapa.set(sadzba, m);
    return { zaklad: z, dan: d, spolu: r2(z + d), sadzba };
  });
  return {
    zaklad: r2(zaklad),
    dan: r2(dan),
    spolu: r2(zaklad + dan),
    riadky,
    podlaSadzby: [...mapa.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([sadzba, s]) => ({ sadzba, zaklad: r2(s.zaklad), dan: r2(s.dan) })),
  };
}

/* ───────────── čistenie a kontrola ───────────── */

const bezMedzier = (s: string) => s.replace(/\s+/g, "");

/** Vyčistí všetok text (bezpecny-text) a normalizuje identifikátory. */
export function ocistiFakturu(f: FakturaZadarmo): FakturaZadarmo {
  const L = LIMITY_ZADARMO;
  const d = f.dodavatel;
  const o = f.odberatel;
  const platitel = Boolean(d.platitel);
  return {
    ...f,
    rezim: platitel ? f.rezim : "bezny",
    dodavatel: {
      nazov: cistyText(d.nazov, L.nazov),
      ulica: cistyText(d.ulica, L.ulica),
      mesto: cistyText(d.mesto, L.mesto),
      psc: cistyText(d.psc, L.psc),
      ico: bezMedzier(cistyText(d.ico, L.ico)),
      dic: bezMedzier(cistyText(d.dic, L.dic)).toUpperCase(),
      // Neplatiteľ bez registrácie IČ DPH nemá (registrácie § 7/§ 7a tu neponúkame).
      icDph: platitel ? bezMedzier(cistyText(d.icDph, L.icDph)).toUpperCase() : "",
      iban: normIban(cistyText(d.iban, L.iban)),
      swift: bezMedzier(cistyText(d.swift, L.swift)).toUpperCase(),
      email: cistyText(d.email, L.email),
      telefon: cistyText(d.telefon, L.telefon),
      zapis: cistyText(d.zapis, L.zapis),
      platitel,
    },
    odberatel: {
      nazov: cistyText(o.nazov, L.nazov),
      ulica: cistyText(o.ulica, L.ulica),
      mesto: cistyText(o.mesto, L.mesto),
      psc: cistyText(o.psc, L.psc),
      krajina: o.krajina,
      ico: bezMedzier(cistyText(o.ico, L.ico)),
      dic: bezMedzier(cistyText(o.dic, L.dic)).toUpperCase(),
      icDph: bezMedzier(cistyText(o.icDph, L.icDph)).toUpperCase(),
      email: cistyText(o.email, L.email),
    },
    cislo: cistyText(f.cislo, L.cislo),
    vs: bezMedzier(cistyText(f.vs, L.vs)),
    polozky: f.polozky.map((p) => ({
      nazov: cistyText(p.nazov, L.nazovPolozky),
      mnozstvo: Number(p.mnozstvo),
      mj: cistyText(p.mj, L.mj),
      cena: Math.round(Number(p.cena) * 100000) / 100000,
      sadzba: platitel ? Number(p.sadzba) : 0,
    })),
    poznamka: cistyText(f.poznamka, L.poznamka, { riadky: true, maxRiadkov: 15 }),
  };
}

/** Chyba vo formulári — slovenská veta je zároveň kľúč prekladu. */
export type ChybaZadarmo = {
  pole: string;
  sprava: string;
  parametre?: Record<string, string | number>;
};

/**
 * Kontrola náležitostí, ktoré sa dajú zistiť z formulára. Volá ju prehliadač
 * (hlášky pri poli) aj server (pred vygenerovaním PDF). Vstup má byť
 * vyčistený (`ocistiFakturu`).
 */
export function skontrolujFakturuZadarmo(
  f: FakturaZadarmo,
  dnes: string = dnesBratislava(),
): ChybaZadarmo[] {
  const ch: ChybaZadarmo[] = [];
  const d = f.dodavatel;
  const o = f.odberatel;
  if (!d.nazov)
    ch.push({ pole: "dodavatel.nazov", sprava: "Doplňte názov alebo meno dodávateľa." });
  if (!d.ulica || !d.mesto)
    ch.push({ pole: "dodavatel.ulica", sprava: "Doplňte adresu sídla dodávateľa." });
  if (!d.ico) ch.push({ pole: "dodavatel.ico", sprava: "Doplňte IČO dodávateľa." });
  else if (!/^\d{6,8}$/.test(d.ico))
    ch.push({ pole: "dodavatel.ico", sprava: "IČO má 6 až 8 číslic." });
  if (d.platitel && !d.icDph)
    ch.push({ pole: "dodavatel.icDph", sprava: "Platiteľ DPH musí na faktúre uviesť IČ DPH." });
  if (d.icDph && !/^[A-Z]{2}[A-Z0-9]{6,14}$/.test(d.icDph))
    ch.push({ pole: "dodavatel.icDph", sprava: "IČ DPH má tvar SK1234567890 alebo CZ12345678." });
  if (d.iban && !ibanPlatny(d.iban))
    ch.push({ pole: "dodavatel.iban", sprava: "IBAN nie je platný — skontrolujte ho." });
  if (f.sposobUhrady === "bank_transfer" && !d.iban)
    ch.push({ pole: "dodavatel.iban", sprava: "Pri úhrade prevodom doplňte IBAN." });
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))
    ch.push({ pole: "dodavatel.email", sprava: "E-mail nie je platný." });

  if (!o.nazov)
    ch.push({ pole: "odberatel.nazov", sprava: "Doplňte názov alebo meno odberateľa." });
  if (!o.ulica || !o.mesto)
    ch.push({ pole: "odberatel.ulica", sprava: "Doplňte adresu odberateľa." });
  if (o.ico && !/^\d{6,8}$/.test(o.ico) && (o.krajina === "SK" || o.krajina === "CZ"))
    ch.push({ pole: "odberatel.ico", sprava: "IČO má 6 až 8 číslic." });
  if (o.icDph && !/^[A-Z]{2}[A-Z0-9]{2,14}$/.test(o.icDph))
    ch.push({ pole: "odberatel.icDph", sprava: "IČ DPH odberateľa nemá platný tvar." });
  if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email))
    ch.push({ pole: "odberatel.email", sprava: "E-mail nie je platný." });

  if (f.rezim === "eu_tovar" || f.rezim === "eu_sluzba") {
    if (!o.icDph)
      ch.push({
        pole: "odberatel.icDph",
        sprava: "Pri dodaní do inej krajiny EÚ je IČ DPH odberateľa povinné.",
      });
    else if (o.icDph.slice(0, 2) === f.krajina || o.krajina === f.krajina)
      ch.push({
        pole: "odberatel.icDph",
        sprava: "Pri dodaní do EÚ musí byť odberateľ z iného členského štátu.",
      });
  }
  if (f.rezim === "pdp_tuzemsko" && !o.icDph)
    ch.push({
      pole: "odberatel.icDph",
      sprava: "Pri prenesení daňovej povinnosti uveďte IČ DPH odberateľa.",
    });

  if (!f.cislo) ch.push({ pole: "cislo", sprava: "Doplňte číslo faktúry." });
  else if (!/^[A-Za-z0-9][A-Za-z0-9/._-]*$/.test(f.cislo))
    ch.push({
      pole: "cislo",
      sprava: "Číslo faktúry môže obsahovať len písmená, číslice a znaky / . - _",
    });
  if (f.vs && !/^\d{1,10}$/.test(f.vs))
    ch.push({ pole: "vs", sprava: "Variabilný symbol má najviac 10 číslic." });

  const datumy = skontrolujDatumy(
    { platitel: d.platitel, datumDodania: f.datumDodania, datumVystavenia: f.datumVystavenia },
    dnes,
  );
  if (datumy.chyba)
    ch.push({
      pole: "datumDodania",
      sprava: f.krajina === "CZ" ? CZ_DATUM_PLNENIA : datumy.chyba,
    });
  if (f.datumSplatnosti < f.datumVystavenia)
    ch.push({ pole: "datumSplatnosti", sprava: "Splatnosť nemôže byť pred dátumom vystavenia." });

  const povolene = sadzbyZadarmo(f);
  f.polozky.forEach((p, i) => {
    if (!p.nazov)
      ch.push({
        pole: `polozky.${i}.nazov`,
        sprava: "Položka {n} nemá názov.",
        parametre: { n: i + 1 },
      });
    if (!bezDane(f) && !povolene.includes(Number(p.sadzba)))
      ch.push({
        pole: `polozky.${i}.sadzba`,
        sprava: "Položka {n}: sadzba {s} % v tomto období neplatí.",
        parametre: { n: i + 1, s: p.sadzba },
      });
  });
  if (spocitajZadarmo(f).spolu <= 0)
    ch.push({ pole: "polozky", sprava: "Suma faktúry musí byť väčšia ako nula." });
  return ch;
}

/* Česká firma: DUZP a lehota podľa zákona č. 235/2004 Sb., nie podľa slovenského § 73/§ 74. */
const CZ_DATUM_PLNENIA =
  "Doplňte dátum uskutočnenia zdaniteľného plnenia — na faktúre platiteľa je povinný (§ 29 zákona č. 235/2004 Sb.).";
const CZ_LEHOTA =
  "Od plnenia uplynulo {n} dní. Daňový doklad sa vystavuje do 15 dní od uskutočnenia plnenia (§ 28 zákona č. 235/2004 Sb.).";

const SK_LEHOTA =
  "Od dodania uplynulo {n} dní. Faktúra sa má vyhotoviť do 15 dní od dodania alebo od prijatia platby (§ 73 zákona o DPH).";

/** Upozornenia, ktoré PDF nezastavia (lehota 15 dní od dodania). */
export function upozorneniaZadarmo(
  f: FakturaZadarmo,
  dnes: string = dnesBratislava(),
): ChybaZadarmo[] {
  const r = skontrolujDatumy(
    {
      platitel: f.dodavatel.platitel,
      datumDodania: f.datumDodania,
      datumVystavenia: f.datumVystavenia,
    },
    dnes,
  );
  if (!r.upozornenie) return [];
  if (/uplynulo/.test(r.upozornenie)) {
    const dni = Math.round(
      (Date.parse(`${f.datumVystavenia}T00:00:00Z`) - Date.parse(`${f.datumDodania}T00:00:00Z`)) /
        86_400_000,
    );
    return [
      {
        pole: "datumDodania",
        sprava: f.krajina === "CZ" ? CZ_LEHOTA : SK_LEHOTA,
        parametre: { n: dni },
      },
    ];
  }
  return [{ pole: "datumDodania", sprava: r.upozornenie }];
}

/* ───────────── vstup PDF generátora ───────────── */

/** Pätička PDF podľa jazyka faktúry — reklama, ktorú prijímateľ uvidí. */
export const PATA_ZADARMO: Record<JazykFakturyZadarmo, string> = {
  sk: "Vystavené vo Faktero — faktero.sk",
  cs: "Vystaveno ve Faktero — faktero.sk",
  en: "Issued with Faktero — faktero.sk",
  de: "Erstellt mit Faktero — faktero.sk",
};

/** Variabilný symbol: zadaný, inak číslice z čísla faktúry (ak ich je najviac 10). */
export function vsZadarmo(f: Pick<FakturaZadarmo, "vs" | "cislo">): string | null {
  if (f.vs) return f.vs;
  const c = f.cislo.replace(/\D/g, "");
  return c && c.length <= 10 ? c : null;
}

export function nazovSuboruZadarmo(cislo: string): string {
  return `faktura-${String(cislo || "faktura").replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;
}

/** Firma, faktúra a položky v tvare, v akom ich PDF generator berie z databázy. */
export function naVstupPdf(f: FakturaZadarmo): { company: any; invoice: any; items: any[] } {
  const d = f.dodavatel;
  const o = f.odberatel;
  const sucty = spocitajZadarmo(f);
  const rc = d.platitel && f.rezim !== "bezny";
  const poznamka = [f.poznamka, d.zapis].filter(Boolean).join("\n\n");
  return {
    company: {
      name: d.nazov,
      street: d.ulica || null,
      city: d.mesto || null,
      zip: d.psc || null,
      country: f.krajina,
      ico: d.ico || null,
      dic: d.dic || null,
      ic_dph: d.icDph || null,
      email: d.email || null,
      phone: d.telefon || null,
      iban: d.iban || null,
      swift: d.swift || null,
      vat_payer: d.platitel,
      vat_scheme: schemaDphZadarmo(f.krajina, d.platitel),
      invoice_footer: PATA_ZADARMO[f.jazyk],
      invoice_show_logo: true,
    },
    invoice: {
      type: "regular",
      status: "issued",
      invoice_number: f.cislo,
      issue_date: f.datumVystavenia,
      delivery_date: f.datumDodania || null,
      due_date: f.datumSplatnosti,
      variable_symbol: vsZadarmo(f),
      payment_method: f.sposobUhrady,
      currency: f.mena,
      language: f.jazyk,
      customer_name: o.nazov,
      customer_street: o.ulica || null,
      customer_city: o.mesto || null,
      customer_zip: o.psc || null,
      customer_country: o.krajina,
      customer_ico: o.ico || null,
      customer_dic: o.dic || null,
      customer_ic_dph: o.icDph || null,
      customer_email: o.email || null,
      subtotal: sucty.zaklad,
      vat_total: sucty.dan,
      total: sucty.spolu,
      discount_total: 0,
      notes: poznamka || null,
      reverse_charge: rc,
      reverse_charge_type: !rc ? null : f.rezim === "pdp_tuzemsko" ? "domestic_69" : "eu_b2b",
      eu_plnenie: f.rezim === "eu_tovar" ? "tovar" : f.rezim === "eu_sluzba" ? "sluzba" : null,
    },
    items: f.polozky.map((p, i) => ({
      position: i,
      name: p.nazov,
      quantity: p.mnozstvo,
      unit: p.mj,
      unit_price: p.cena,
      vat_rate: sucty.riadky[i].sadzba,
      subtotal: sucty.riadky[i].zaklad,
      vat_amount: sucty.riadky[i].dan,
      total: sucty.riadky[i].spolu,
    })),
  };
}

/** Treba prepočet dane do domácej meny (SK firma v CZK, CZ firma v EUR). */
export function trebaKurz(
  f: Pick<FakturaZadarmo, "krajina" | "mena" | "dodavatel" | "rezim">,
): boolean {
  const domaca = f.krajina === "CZ" ? "CZK" : "EUR";
  return f.mena !== domaca && f.dodavatel.platitel && f.rezim === "bezny";
}

/* ───────────── prenos do účtu ───────────── */

export const KLUC_PRENOSU = "faktero_faktura_zadarmo";
/** Po mesiaci sa rozpracovaná faktúra už neponúka. */
const PLATNOST_PRENOSU_MS = 30 * 24 * 60 * 60 * 1000;

type Uloziste = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function ulozisko(u?: Uloziste | null): Uloziste | null {
  if (u) return u;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function zabalPrenos(f: FakturaZadarmo, teraz = Date.now()): string {
  return JSON.stringify({ verzia: 1, ulozene: teraz, faktura: f });
}

/** Prečíta a overí uložený prenos; poškodený, cudzí alebo starý vráti `null`. */
export function rozbalPrenos(
  surovy: string | null | undefined,
  teraz = Date.now(),
): FakturaZadarmo | null {
  if (!surovy) return null;
  try {
    const o = JSON.parse(surovy);
    if (!o || o.verzia !== 1 || typeof o.ulozene !== "number") return null;
    if (teraz - o.ulozene > PLATNOST_PRENOSU_MS || o.ulozene > teraz + 60_000) return null;
    const r = FakturaZadarmoZ.safeParse(o.faktura);
    return r.success ? ocistiFakturu(r.data) : null;
  } catch {
    return null;
  }
}

export function ulozPrenos(f: FakturaZadarmo, u?: Uloziste | null): boolean {
  try {
    const s = ulozisko(u);
    if (!s) return false;
    s.setItem(KLUC_PRENOSU, zabalPrenos(f));
    return true;
  } catch {
    return false; // plné alebo zakázané úložisko — prenos sa jednoducho neponúkne
  }
}

export function nacitajPrenos(u?: Uloziste | null): FakturaZadarmo | null {
  try {
    const s = ulozisko(u);
    return s ? rozbalPrenos(s.getItem(KLUC_PRENOSU)) : null;
  } catch {
    return null;
  }
}

export function zmazPrenos(u?: Uloziste | null): void {
  try {
    ulozisko(u)?.removeItem(KLUC_PRENOSU);
  } catch {
    /* nič */
  }
}

/** Údaje pre formulár zakladania firmy (onboarding). */
export function firmaZPrenosu(f: FakturaZadarmo) {
  const d = f.dodavatel;
  return {
    name: d.nazov,
    ico: d.ico,
    dic: d.dic,
    ic_dph: d.icDph,
    street: d.ulica,
    city: d.mesto,
    zip: d.psc,
    country: f.krajina as string,
    email: d.email,
    phone: d.telefon,
    iban: d.iban,
    default_currency: f.mena as string,
    vat_payer: d.platitel,
    vat_scheme: schemaDphZadarmo(krajinaDane(f.krajina), d.platitel),
  };
}

/** Riadok do adresára (`customers`) — rovnaké stĺpce ako `NewCustomerModal`. */
export function odberatelZPrenosu(f: FakturaZadarmo, companyId: string) {
  const o = f.odberatel;
  return {
    company_id: companyId,
    name: o.nazov,
    typ: o.ico ? "firma" : "fyzicka",
    ico: o.ico || null,
    dic: o.dic || null,
    ic_dph: o.icDph || null,
    email: o.email || null,
    street: o.ulica || null,
    city: o.mesto || null,
    zip: o.psc || null,
    country: o.krajina || "SK",
  };
}

/**
 * Vstup pre `vystavFakturuFn` so stavom „draft“. Číslo dá číselný rad firmy
 * (nie číslo z formulára) — inak by sa rad rozišiel s ďalšími faktúrami.
 */
export function konceptZPrenosu(f: FakturaZadarmo, companyId: string, customerId: string) {
  const sucty = spocitajZadarmo(f);
  return {
    company_id: companyId,
    customer_id: customerId,
    issue_date: f.datumVystavenia,
    due_date: f.datumSplatnosti,
    payment_method: f.sposobUhrady,
    currency: f.mena,
    notes: f.poznamka || null,
    status: "draft" as const,
    type: "regular" as const,
    discount_value: 0,
    items: f.polozky.map((p, i) => ({
      name: p.nazov,
      quantity: p.mnozstvo,
      unit: p.mj || "ks",
      unit_price: p.cena,
      vat_rate: sucty.riadky[i].sadzba,
      discount_percent: 0,
    })),
  };
}

/**
 * Čo `vystavFakturuFn` nepozná a koncept to má mať ako vo formulári —
 * dopíše sa úpravou konceptu (tá istá cesta ako „Upraviť faktúru“).
 */
export function doplnenieKonceptu(f: FakturaZadarmo) {
  const v = naVstupPdf(f).invoice;
  return {
    delivery_date: v.delivery_date,
    language: f.jazyk,
    reverse_charge: v.reverse_charge,
    reverse_charge_type: v.reverse_charge_type,
    eu_plnenie: v.eu_plnenie,
  };
}
