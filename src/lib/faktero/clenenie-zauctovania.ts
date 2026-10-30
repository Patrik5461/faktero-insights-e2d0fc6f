/*
  Členenie DPH pri zaúčtovaní prijatej faktúry — jedno pravidlo pre detail
  (ZauctovaniePanel), hromadné zaúčtovanie v zozname (zauctujPrijateFn) aj
  kontrolu pred odovzdaním do Pohody (pohoda-kontrola).

  Poradie: zvolené v okne > na faktúre > návrh pre faktúru (pravidlo, návyk
  dodávateľa) > kód podľa kategórie > predvolené firmy > rozúčtovanie, kde
  má každý riadok vlastné členenie. Návrh sa do faktúry zapíše (`doplnit`),
  ostatné zdroje si export dosadí sám.

  Platiteľ DPH bez členenia nezaúčtuje — Pohoda by doklad do priznania
  zaradila naslepo a odovzdanie ho aj tak zastaví.
*/

export type ZdrojClenenia =
  "zvolene" | "doklad" | "navrh" | "kategoria" | "predvolene" | "rozuctovanie";

export type VstupClenenia = {
  /** Vyplnené v okne zaúčtovania (hromadne aj na detaile). */
  zvolene?: string | null;
  /** `pohoda_clenenie_dph` na faktúre. */
  naDoklade?: string | null;
  /** Návrh pre túto faktúru z pravidla alebo návyku dodávateľa. */
  navrh?: string | null;
  /** Kód z číselníka pre kategóriu nákladu. */
  kategoria?: string | null;
  /** Predvolené členenie prijatých faktúr firmy. */
  predvolene?: string | null;
  /** Riadky rozúčtovania faktúry. */
  rozuctovanie?: { clenenie?: string | null }[] | null;
};

export type UcinneClenenie = {
  kod: string | null;
  zdroj: ZdrojClenenia | null;
  /** Kód, ktorý treba do faktúry zapísať (len návrh — ostatné tam už sú alebo ich dosadí export). */
  doplnit: string | null;
};

const kod = (v: unknown) => String(v ?? "").trim();

export function ucinneClenenie(v: VstupClenenia): UcinneClenenie {
  const poradie: [ZdrojClenenia, unknown][] = [
    ["zvolene", v.zvolene],
    ["doklad", v.naDoklade],
    ["navrh", v.navrh],
    ["kategoria", v.kategoria],
    ["predvolene", v.predvolene],
  ];
  for (const [zdroj, h] of poradie) {
    const k = kod(h);
    if (k) return { kod: k, zdroj, doplnit: zdroj === "navrh" ? k : null };
  }
  const r = Array.isArray(v.rozuctovanie) ? v.rozuctovanie : [];
  if (r.length && r.every((x) => kod(x?.clenenie)))
    return { kod: kod(r[0].clenenie), zdroj: "rozuctovanie", doplnit: null };
  return { kod: null, zdroj: null, doplnit: null };
}

/** Smie sa zaúčtovať? Neplatiteľ áno aj bez členenia, platiteľ nie. */
export function chybaClenenie(platitel: boolean, c: UcinneClenenie): boolean {
  return platitel && !c.kod;
}

/** Dôvod pri vynechanej faktúre (za číslom faktúry). */
export const DOVOD_BEZ_CLENENIA =
  "chýba členenie DPH — vyberte ho, alebo ho nastavte v pravidle či v predvolených predkontáciách";

export type FakturaNaClenenie = {
  id: string;
  /** `pohoda_clenenie_dph` na faktúre. */
  clenenie?: string | null;
  /** Kategória nákladu po zaúčtovaní (zvolená v okne, inak z faktúry). */
  kategoria?: string | null;
  rozuctovanie?: unknown;
  /** Návrh z pravidla alebo návyku — len keď faktúra a okno členenie nemajú. */
  navrh?: string | null;
};

/**
 * Faktúry, ktorým treba spočítať návrh: v okne členenie nik nevybral a na
 * faktúre nie je (pri vymazaní na detaile sa návrh nedopĺňa — človek ho zmazal).
 */
export function potrebujeNavrh(
  f: Pick<FakturaNaClenenie, "clenenie">,
  o: { zvolene?: string | null; vymazat?: boolean },
): boolean {
  return !o.vymazat && !kod(o.zvolene) && !kod(f.clenenie);
}

/**
 * Zaúčtovanie viacerých faktúr: ktorým sa členenie doplní z návrhu a ktoré
 * sa pre chýbajúce členenie nezaúčtujú. `vymazat` = detail poslal prázdne
 * členenie, ktoré z faktúry zmaže to doterajšie.
 */
export function clenenieFaktur(
  faktury: FakturaNaClenenie[],
  o: {
    zvolene?: string | null;
    vymazat?: boolean;
    podlaKategorie?: Record<string, { clenenie?: string | null } | undefined>;
    predvolene?: string | null;
    platitel: boolean;
  },
): { doplnit: Record<string, string>; bez: string[] } {
  const doplnit: Record<string, string> = {};
  const bez: string[] = [];
  for (const f of faktury) {
    const c = ucinneClenenie({
      zvolene: o.zvolene,
      naDoklade: o.vymazat ? null : f.clenenie,
      navrh: o.vymazat ? null : f.navrh,
      kategoria: o.podlaKategorie?.[kod(f.kategoria)]?.clenenie,
      predvolene: o.predvolene,
      rozuctovanie: Array.isArray(f.rozuctovanie) ? f.rozuctovanie : null,
    });
    if (c.doplnit) doplnit[f.id] = c.doplnit;
    if (chybaClenenie(o.platitel, c)) bez.push(f.id);
  }
  return { doplnit, bez };
}
