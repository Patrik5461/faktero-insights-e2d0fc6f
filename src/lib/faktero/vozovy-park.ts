/**
 * Vozový park — číselníky a termíny vozidla.
 *
 * Vozidlo je to isté ako v Knihe jázd (tabuľka `vehicles`); vozový park k nemu
 * pridáva technický preukaz, vlastníctvo, poistky a termíny. Jazdy sa tu
 * zámerne neukazujú.
 */

export const VLASTNICTVO: { kod: string; nazov: string; popis: string }[] = [
  { kod: "vlastne", nazov: "Vlastné vozidlo firmy", popis: "kúpené, v majetku firmy" },
  {
    kod: "financny_leasing",
    nazov: "Finančný leasing",
    popis: "vlastníkom je leasingová spoločnosť, po splatení prejde na firmu",
  },
  {
    kod: "operativny_leasing",
    nazov: "Operatívny leasing",
    popis: "dlhodobý prenájom, vozidlo sa vracia",
  },
  { kod: "uver", nazov: "Kúpené na úver", popis: "v majetku firmy, financované úverom" },
  { kod: "prenajom", nazov: "Krátkodobý prenájom", popis: "požičané vozidlo" },
  {
    kod: "sukromne",
    nazov: "Súkromné vozidlo",
    popis: "vozidlo zamestnanca alebo konateľa používané aj na služobné cesty",
  },
];

/** Vlastníctvo, pri ktorom má zmysel prepojiť zmluvu o financovaní. */
export const S_FINANCOVANIM = new Set(["financny_leasing", "operativny_leasing", "uver"]);

export const KATEGORIE_VOZIDLA: { kod: string; nazov: string }[] = [
  { kod: "M1", nazov: "M1 — osobné vozidlo" },
  { kod: "N1", nazov: "N1 — úžitkové do 3,5 t" },
  { kod: "N2", nazov: "N2 — nákladné 3,5 – 12 t" },
  { kod: "N3", nazov: "N3 — nákladné nad 12 t" },
  { kod: "M2", nazov: "M2 — autobus do 5 t" },
  { kod: "M3", nazov: "M3 — autobus nad 5 t" },
  { kod: "L", nazov: "L — motocykel, štvorkolka" },
  { kod: "O", nazov: "O — príves, náves" },
  { kod: "T", nazov: "T — traktor" },
];

/**
 * Daň z motorových vozidiel na Slovensku od roku 2023 platia len nákladné
 * vozidlá a autobusy nad 3,5 t a ťažké prívesy (§ 83 zákona 582/2004).
 * Osobné autá a dodávky do 3,5 t ňou už nie sú.
 */
export function podliehaDmv(kategoria: string | null | undefined): boolean {
  return ["N2", "N3", "M2", "M3", "O"].includes(String(kategoria ?? ""));
}

export const DRUHY_DOKUMENTOV: { kod: string; nazov: string }[] = [
  { kod: "tp1", nazov: "Osvedčenie o evidencii — časť I (malý TP)" },
  { kod: "tp2", nazov: "Osvedčenie o evidencii — časť II (veľký TP)" },
  { kod: "pzp", nazov: "Povinné zmluvné poistenie (PZP)" },
  { kod: "havarijne", nazov: "Havarijné poistenie" },
  { kod: "stk", nazov: "Technická kontrola (STK)" },
  { kod: "ek", nazov: "Emisná kontrola (EK)" },
  { kod: "zmluva", nazov: "Kúpna / leasingová zmluva" },
  { kod: "faktura", nazov: "Faktúra za vozidlo" },
  { kod: "ine", nazov: "Iný dokument" },
];

export function nazovDruhu(kod: string | null | undefined): string {
  return DRUHY_DOKUMENTOV.find((d) => d.kod === kod)?.nazov ?? "Dokument";
}

export function nazovVlastnictva(kod: string | null | undefined): string | null {
  return VLASTNICTVO.find((v) => v.kod === kod)?.nazov ?? null;
}

export type StavTerminu = "prepadnute" | "coskoro" | "ok";
export type Termin = { kluc: string; nazov: string; datum: string; stav: StavTerminu; dni: number };

/** Koľko dní vopred sa termín hlási ako blížiaci sa. */
export const DNI_VOPRED = 30;

type VozidloSTerminmi = {
  stk_do?: string | null;
  ek_do?: string | null;
  pzp_do?: string | null;
  havarijne_do?: string | null;
  dialnicna_znamka_do?: string | null;
  servis_datum?: string | null;
};

const TERMINY: { kluc: keyof VozidloSTerminmi; nazov: string }[] = [
  { kluc: "stk_do", nazov: "STK" },
  { kluc: "ek_do", nazov: "Emisná kontrola" },
  { kluc: "pzp_do", nazov: "PZP" },
  { kluc: "havarijne_do", nazov: "Havarijné poistenie" },
  { kluc: "dialnicna_znamka_do", nazov: "Diaľničná známka" },
  { kluc: "servis_datum", nazov: "Servis" },
];

function rozdielDni(od: string, do_: string): number {
  return Math.round((Date.parse(`${do_}T00:00:00Z`) - Date.parse(`${od}T00:00:00Z`)) / 86_400_000);
}

/** Termíny vozidla zoradené od najbližšieho; prázdne sa vynechajú. */
export function terminyVozidla(v: VozidloSTerminmi, dnes: string): Termin[] {
  return TERMINY.flatMap(({ kluc, nazov }) => {
    const datum = v[kluc];
    if (!datum) return [];
    const dni = rozdielDni(dnes, datum);
    const stav: StavTerminu = dni < 0 ? "prepadnute" : dni <= DNI_VOPRED ? "coskoro" : "ok";
    return [{ kluc, nazov, datum, stav, dni }];
  }).sort((a, b) => a.dni - b.dni);
}

/** Termíny, ktoré treba riešiť — prepadnuté alebo do 30 dní. */
export function terminyNaRiesenie(v: VozidloSTerminmi, dnes: string): Termin[] {
  return terminyVozidla(v, dnes).filter((t) => t.stav !== "ok");
}

/** Údaje prečítané z technického preukazu. */
export type PrecitanyPreukaz = {
  license_plate: string | null;
  vin: string | null;
  znacka: string | null;
  model: string | null;
  kategoria: string | null;
  farba: string | null;
  rok_vyroby: number | null;
  datum_prvej_evidencie: string | null;
  objem_cm3: number | null;
  vykon_kw: number | null;
  celkova_hmotnost_kg: number | null;
  pocet_miest: number | null;
  fuel_type: string | null;
  vlastnik_nazov: string | null;
  vlastnik_ico: string | null;
  drzitel_nazov: string | null;
};

const textAleboNull = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s && s.toLowerCase() !== "null" ? s : null;
};
const cisloAleboNull = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const datumAleboNull = (v: unknown) => {
  const s = textAleboNull(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/** Hodnoty ako v Knihe jázd (`jazdy.vozidla`). */
const PALIVA: Record<string, string> = {
  nafta: "diesel",
  diesel: "diesel",
  benzín: "benzin",
  benzin: "benzin",
  petrol: "benzin",
  elektro: "elektro",
  electric: "elektro",
  lpg: "lpg",
  cng: "cng",
  hybrid: "hybrid",
};

/** Upratanie odpovede modelu — nič, čo nesedí s formátom, sa do formulára nedostane. */
export function normalizujPreukaz(r: any): PrecitanyPreukaz {
  const vin = textAleboNull(r?.vin)?.replace(/\s/g, "").toUpperCase() ?? null;
  const spz = textAleboNull(r?.license_plate)?.replace(/\s+/g, "").toUpperCase() ?? null;
  const kategoria =
    textAleboNull(r?.kategoria)
      ?.toUpperCase()
      .replace(/^([A-Z]\d?).*$/, "$1") ?? null;
  const palivo = textAleboNull(r?.fuel_type)?.toLowerCase() ?? null;
  const ico = textAleboNull(r?.vlastnik_ico)?.replace(/\s/g, "") ?? null;
  const rok = cisloAleboNull(r?.rok_vyroby);
  return {
    license_plate: spz,
    vin: vin && /^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin) ? vin : null,
    znacka: textAleboNull(r?.znacka),
    model: textAleboNull(r?.model),
    kategoria: kategoria && KATEGORIE_VOZIDLA.some((k) => k.kod === kategoria) ? kategoria : null,
    farba: textAleboNull(r?.farba),
    rok_vyroby: rok && rok >= 1900 && rok <= 2100 ? Math.round(rok) : null,
    datum_prvej_evidencie: datumAleboNull(r?.datum_prvej_evidencie),
    objem_cm3:
      cisloAleboNull(r?.objem_cm3) === null ? null : Math.round(cisloAleboNull(r?.objem_cm3)!),
    vykon_kw: cisloAleboNull(r?.vykon_kw),
    celkova_hmotnost_kg:
      cisloAleboNull(r?.celkova_hmotnost_kg) === null
        ? null
        : Math.round(cisloAleboNull(r?.celkova_hmotnost_kg)!),
    pocet_miest:
      cisloAleboNull(r?.pocet_miest) === null ? null : Math.round(cisloAleboNull(r?.pocet_miest)!),
    fuel_type: palivo ? (PALIVA[palivo] ?? null) : null,
    vlastnik_nazov: textAleboNull(r?.vlastnik_nazov),
    vlastnik_ico: ico && /^\d{6,8}$/.test(ico) ? ico : null,
    drzitel_nazov: textAleboNull(r?.drzitel_nazov),
  };
}
