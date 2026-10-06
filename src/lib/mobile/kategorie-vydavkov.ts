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
  /*
    Prvé sú účtovné položky, ktoré Doklado zakladá každej firme — účtovníčky
    ich poznajú a pri prechode z Doklado sa nemusia nič preučiť. Staré kódy
    ostávajú, aby sa nerozbili doklady a pravidlá, ktoré ich už nesú.
  */
  { kod: "kancelarske_potreby", nazov: "Kancelárske potreby" },
  { kod: "palivo", nazov: "Nákup PHM" },
  { kod: "spotrebny_material", nazov: "Spotrebný materiál" },
  { kod: "rezijny_material", nazov: "Režijný materiál" },
  { kod: "dhm", nazov: "Drobný hmotný majetok" },
  { kod: "material", nazov: "Materiál a tovar" },
  { kod: "tovar", nazov: "Nákup tovaru na predaj" },
  { kod: "vozidlo", nazov: "Vozidlo a servis" },
  { kod: "parkovne", nazov: "Parkovné, mýto a diaľničná známka" },
  { kod: "opravy", nazov: "Opravy a údržba" },
  { kod: "sluzby", nazov: "Služby a subdodávky" },
  { kod: "kancelaria", nazov: "Kancelária a réžia" },
  { kod: "software", nazov: "Softvér a telekomunikácie" },
  { kod: "postovne", nazov: "Poštovné a kuriér" },
  { kod: "reprezentacia", nazov: "Reprezentácia a strava" },
  { kod: "cestovne", nazov: "Cestovné a ubytovanie" },
  { kod: "skolenia", nazov: "Školenia a literatúra" },
  { kod: "odevy", nazov: "Pracovné odevy a OOPP" },
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
