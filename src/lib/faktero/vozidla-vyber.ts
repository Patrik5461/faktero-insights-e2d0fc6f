/**
 * Spoločné drobnosti Knihy jázd a vozového parku.
 */

/** J-07: popisy druhov paliva (kľúč v DB → text pre `t()`). */
export const PALIVA: Record<string, string> = {
  diesel: "Diesel",
  benzin: "Benzín",
  lpg: "LPG",
  cng: "CNG",
  elektro: "Elektro",
  hybrid: "Hybrid",
};

export function popisPaliva(kluc: string | null | undefined): string | null {
  if (!kluc) return null;
  return PALIVA[kluc] ?? kluc;
}

/**
 * J-06b, J-09: vozidlá do výberu – len aktívne, plus práve vybrané (pri
 * úprave starej jazdy vyradeného auta), aby select neukázal prázdno.
 */
export function vozidlaNaVyber<T extends { id: string; active?: boolean | null }>(
  vozidla: T[],
  vybrane?: string | null,
): T[] {
  return vozidla.filter((v) => v.active !== false || (!!vybrane && v.id === vybrane));
}

/** J-12b: druh synchronizácie GPS/Tesla (sync_type) → text pre `t()`. */
export const DRUH_SYNCHRONIZACIE: Record<string, string> = {
  snapshots: "Stav vozidiel",
  rides: "Jazdy",
  trips: "Jazdy",
  daily: "Denná synchronizácia",
  vehicles: "Vozidlá",
  test: "Test pripojenia",
};

export function popisSynchronizacie(druh: string | null | undefined): string {
  if (!druh) return "—";
  return DRUH_SYNCHRONIZACIE[druh] ?? druh;
}

/**
 * Z-12: súbory dokumentov nového vozidla, ktoré ešte nemajú riadok vo
 * `vehicle_documents` (nahraté do `{firma}/nove/…`). Tie treba zmazať,
 * keď sa vozidlo neuloží.
 */
export function neulozeneSuboryVozidla(
  dokumenty: { id?: string | null; file_path: string }[],
): string[] {
  return dokumenty.filter((d) => !d.id && /\/nove\//.test(d.file_path)).map((d) => d.file_path);
}

/**
 * Z-11: Palivové karty sú v menu Fakturácie (vozový park) aj Knihy jázd
 * (vozidlá). Tlačidlo späť vedie podľa produktu, v ktorom človek práve je.
 */
export function navratZPalivovychKariet(produkt: "invoicing" | "logbook" | null): {
  to: "/vozovy-park" | "/jazdy/vozidla";
  text: string;
} {
  return produkt === "logbook"
    ? { to: "/jazdy/vozidla", text: "Späť na vozidlá" }
    : { to: "/vozovy-park", text: "Späť na vozový park" };
}
