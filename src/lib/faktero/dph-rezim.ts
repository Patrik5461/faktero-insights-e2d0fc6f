/**
 * Postavenie firmy k DPH — platiteľ, alebo len registrovaná osoba.
 *
 * Doteraz sa to odvodzovalo z vyplneného IČ DPH a to je nesprávne: osoba
 * registrovaná podľa § 7 (nadobudnutie tovaru z EÚ) alebo § 7a (služby v rámci
 * EÚ) IČ DPH dostane, ale platiteľom nie je — faktúry vystavuje bez dane a daň
 * odvádza len zo svojich nákupov. Z registrov sa pritom ťahá iba IČ DPH, typ
 * registrácie v nich nie je, takže ho musí zadať človek.
 *
 * Preto sú na firme dve polia: `vat_payer` (zaškrtávacie „som platiteľ“) a
 * `vat_scheme` (podľa ktorého paragrafu). Pravdou je schéma — zaškrtnutie je
 * len jej zjednodušenie a vždy sa z nej dá dopočítať.
 */

import { krajinaDane, sadzbyKrajiny, vatRateOptions, type KrajinaDane } from "./vat-rates";

export type SchemaDph =
  | "sk_neplatitel"
  | "sk_4"
  | "sk_4b"
  | "sk_5"
  | "sk_7"
  | "sk_7a"
  | "cz_neplatce"
  | "cz_platce"
  | "cz_identifikovana";

type Zaznam = {
  kod: SchemaDph;
  krajina: KrajinaDane;
  /** Do rozbaľovacieho zoznamu. */
  nazov: string;
  /** Vysvetlenie pod zoznamom — komu tá možnosť patrí. */
  popis: string;
  platitel: boolean;
  /** Registrácii patrí IČ DPH, aj keď firma platiteľom nie je. */
  maIcDph: boolean;
  /** Veta na doklad. Platiteľ ju nemá — na jeho faktúre je daň vyčíslená. */
  textNaDoklad: string | null;
};

const ZAZNAMY: Zaznam[] = [
  {
    kod: "sk_4",
    krajina: "SK",
    nazov: "Platiteľ DPH podľa § 4",
    popis: "Bežná registrácia tuzemskej firmy — faktúry sa vystavujú s DPH.",
    platitel: true,
    maIcDph: true,
    textNaDoklad: null,
  },
  {
    kod: "sk_4b",
    krajina: "SK",
    nazov: "Platiteľ DPH – skupinová registrácia podľa § 4b",
    popis: "Viac firiem registrovaných ako jeden platiteľ so spoločným IČ DPH.",
    platitel: true,
    maIcDph: true,
    textNaDoklad: null,
  },
  {
    kod: "sk_5",
    krajina: "SK",
    nazov: "Platiteľ DPH podľa § 5 (zahraničná osoba)",
    popis: "Zahraničná osoba registrovaná na Slovensku.",
    platitel: true,
    maIcDph: true,
    textNaDoklad: null,
  },
  {
    kod: "sk_7",
    krajina: "SK",
    nazov: "Registrovaná osoba podľa § 7 (nadobudnutie tovaru z EÚ)",
    popis:
      "IČ DPH má, platiteľom nie je — faktúry vystavuje bez dane, daň platí z tovaru nadobudnutého z EÚ.",
    platitel: false,
    maIcDph: true,
    textNaDoklad:
      "Dodávateľ nie je platiteľom DPH, je registrovaný podľa § 7 zákona č. 222/2004 Z. z. o DPH.",
  },
  {
    kod: "sk_7a",
    krajina: "SK",
    nazov: "Registrovaná osoba podľa § 7a (služby v rámci EÚ)",
    popis: "IČ DPH pre služby prijaté z EÚ alebo dodané do EÚ. Faktúry sa vystavujú bez dane.",
    platitel: false,
    maIcDph: true,
    textNaDoklad:
      "Dodávateľ nie je platiteľom DPH, je registrovaný podľa § 7a zákona č. 222/2004 Z. z. o DPH.",
  },
  {
    kod: "sk_neplatitel",
    krajina: "SK",
    nazov: "Neplatiteľ DPH",
    popis: "Bez registrácie. Faktúry sa vystavujú bez dane.",
    platitel: false,
    maIcDph: false,
    textNaDoklad: "Dodávateľ nie je platiteľom DPH.",
  },
  {
    kod: "cz_platce",
    krajina: "CZ",
    nazov: "Plátce DPH (§ 6 zákona o DPH)",
    popis: "Bežná registrácia — faktury se vystavují s DPH.",
    platitel: true,
    maIcDph: true,
    textNaDoklad: null,
  },
  {
    kod: "cz_identifikovana",
    krajina: "CZ",
    nazov: "Identifikovaná osoba (§ 6g–6l)",
    popis: "DIČ pro plnění z EU má, plátcem není — faktury se vystavují bez daně.",
    platitel: false,
    maIcDph: true,
    textNaDoklad: "Dodavatel není plátcem DPH, je identifikovanou osobou podle zákona o DPH.",
  },
  {
    kod: "cz_neplatce",
    krajina: "CZ",
    nazov: "Neplátce DPH",
    popis: "Bez registrace. Faktury se vystavují bez daně.",
    platitel: false,
    maIcDph: false,
    textNaDoklad: "Dodavatel není plátcem DPH.",
  },
];

const PODLA_KODU = new Map<SchemaDph, Zaznam>(ZAZNAMY.map((z) => [z.kod, z]));

export function jeSchemaDph(kod: unknown): kod is SchemaDph {
  return typeof kod === "string" && PODLA_KODU.has(kod as SchemaDph);
}

/** Možnosti do výberu: pre danú krajinu a podľa toho, či je zaškrtnuté „platiteľ“. */
export function schemyKrajiny(krajina: KrajinaDane, platitel: boolean): Zaznam[] {
  return ZAZNAMY.filter((z) => z.krajina === krajina && z.platitel === platitel);
}

export function schema(kod: SchemaDph): Zaznam {
  return PODLA_KODU.get(kod)!;
}

export function nazovSchemy(kod: SchemaDph): string {
  return schema(kod).nazov;
}

export function jePlatitel(kod: SchemaDph): boolean {
  return schema(kod).platitel;
}

/** Prvá možnosť pre krajinu a zaškrtnutie — predvolí sa pri prepnutí. */
export function predvolenaSchema(krajina: KrajinaDane, platitel: boolean): SchemaDph {
  return schemyKrajiny(krajina, platitel)[0].kod;
}

/**
 * Schéma, ktorá po zmene krajiny alebo zaškrtnutia stále dáva zmysel.
 *
 * Pri prepnutí z Česka na Slovensko by inak ostalo `cz_platce` a firma by mala
 * uložený režim, ktorý pre ňu vôbec neplatí.
 */
export function zosuladSchemu(
  kod: SchemaDph | null | undefined,
  krajina: KrajinaDane,
  platitel: boolean,
): SchemaDph {
  if (kod && jeSchemaDph(kod)) {
    const z = schema(kod);
    if (z.krajina === krajina && z.platitel === platitel) return kod;
  }
  return predvolenaSchema(krajina, platitel);
}

export type FirmaDph = {
  country?: string | null;
  ic_dph?: string | null;
  vat_payer?: boolean | null;
  vat_scheme?: string | null;
};

export type RezimDph = {
  krajina: KrajinaDane;
  schema: SchemaDph;
  platitel: boolean;
  /** Veta, ktorá musí ísť na doklad; platiteľ ju nemá. */
  textNaDoklad: string | null;
};

/**
 * Režim z riadku firmy.
 *
 * Firmy založené pred zavedením tejto voľby nemajú `vat_scheme` vyplnené, a tie
 * musia ostať pri starom správaní: kto má IČ DPH, ten fakturuje s daňou.
 */
export function rezimFirmy(firma: FirmaDph | null | undefined): RezimDph {
  const krajina = krajinaDane(firma?.country);
  const platitelPodlaPola = firma?.vat_payer ?? Boolean(String(firma?.ic_dph ?? "").trim());
  const kod = jeSchemaDph(firma?.vat_scheme)
    ? (firma!.vat_scheme as SchemaDph)
    : predvolenaSchema(krajina, platitelPodlaPola);
  const z = schema(kod);
  return { krajina, schema: kod, platitel: z.platitel, textNaDoklad: z.textNaDoklad };
}

/** Vysvetlenie pod výberom — aby sa nemuselo hľadať v zákone. */
export function popisSchemy(kod: SchemaDph): string {
  return schema(kod).popis;
}

/** Registrácia, ku ktorej patrí IČ DPH. Neplatiteľ bez registrácie ho nemá. */
export function maMatIcDph(kod: SchemaDph): boolean {
  return schema(kod).maIcDph;
}

/*
  Sadzby na doklade, ktorý firma vystavuje.

  Neplatiteľ daň nevyčísľuje vôbec — ani registrovaná osoba podľa § 7 či § 7a,
  hoci IČ DPH má. Ponúkať mu 23 % by znamenalo tichú výzvu vystaviť faktúru,
  ktorú by musel opravovať.
*/
export function sadzbyRezimu(rezim: RezimDph, den?: string | null): number[] {
  return rezim.platitel ? sadzbyKrajiny(rezim.krajina, den) : [0];
}

export function zakladnaSadzbaRezimu(rezim: RezimDph, den?: string | null): number {
  return sadzbyRezimu(rezim, den)[0];
}

/**
 * Sadzby do rozbaľovacieho zoznamu pri úprave.
 * Sadzba, ktorú položka už nesie, ostáva v ponuke aj u neplatiteľa — inak by sa
 * pri otvorení staršieho dokladu ticho prepla na nulu.
 */
export function moznostiSadziebRezimu(
  rezim: RezimDph,
  aktualna?: number | null,
  den?: string | null,
): number[] {
  if (rezim.platitel) return vatRateOptions(rezim.krajina, aktualna, den);
  const a = aktualna == null ? null : Number(aktualna);
  return a && a > 0 ? [a, 0] : [0];
}
