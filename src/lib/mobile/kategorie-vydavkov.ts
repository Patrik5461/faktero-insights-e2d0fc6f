/**
 * Kategórie nákladov pre naskenované doklady.
 *
 * Stĺpec `category` v `expense_documents` existoval odjakživa, ale bol to
 * voľný text a v databáze nebola vyplnená ani jedna hodnota — nikde sa totiž
 * nedal vybrať. Zoznam je tu, a nie v obrazovke, aby sa dal doplniť na jednom
 * mieste a aby ho vedel použiť aj web, keď sa tam kategórie dorobia.
 *
 * Hodnota, ktorá sa ukladá, je `kod` — ten sa nemení ani keď sa preloží názov.
 */
export type Kategoria = { kod: string; nazov: string };

export const KATEGORIE_VYDAVKOV: Kategoria[] = [
  { kod: "palivo", nazov: "Palivo" },
  { kod: "vozidlo", nazov: "Vozidlo a servis" },
  { kod: "material", nazov: "Materiál a tovar" },
  { kod: "sluzby", nazov: "Služby a subdodávky" },
  { kod: "kancelaria", nazov: "Kancelária a réžia" },
  { kod: "software", nazov: "Softvér a telekomunikácie" },
  { kod: "reprezentacia", nazov: "Reprezentácia a strava" },
  { kod: "cestovne", nazov: "Cestovné a ubytovanie" },
  { kod: "najom", nazov: "Nájom a energie" },
  { kod: "marketing", nazov: "Marketing a reklama" },
  { kod: "poplatky", nazov: "Poplatky a poistenie" },
  { kod: "ine", nazov: "Iné" },
];

/** Názov kategórie na zobrazenie. Neznámy kód sa ukáže, ako je. */
export function nazovKategorie(kod: string | null | undefined): string | null {
  if (!kod) return null;
  return KATEGORIE_VYDAVKOV.find((k) => k.kod === kod)?.nazov ?? kod;
}

/** Kľúč, pod ktorým si telefón pamätá naposledy použitú kategóriu. */
const KLUC = "faktero.skener.kategoria";

/**
 * Kategória sa pri sebe idúcich dokladoch opakuje — kto skenuje tankovania,
 * skenuje ich desať za sebou. Preto sa posledná voľba pamätá; prvá je prázdna,
 * aby appka nepriradila kategóriu, ktorú človek nevybral.
 */
export function poslednaKategoria(): string {
  try {
    const v = localStorage.getItem(KLUC) ?? "";
    return KATEGORIE_VYDAVKOV.some((k) => k.kod === v) ? v : "";
  } catch {
    return "";
  }
}

export function zapamatajKategoriu(kod: string): void {
  try {
    if (kod) localStorage.setItem(KLUC, kod);
    else localStorage.removeItem(KLUC);
  } catch {
    /* súkromné okno — voľba sa proste nezapamätá */
  }
}
