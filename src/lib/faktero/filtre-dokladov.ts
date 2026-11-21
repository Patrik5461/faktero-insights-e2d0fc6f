/**
 * Jednotné filtre zoznamov dokladov (Patrik 21. 11.: „nech sú tie filtre
 * všade, kde filtre máme, totožné“).
 *
 * Každý zoznam (vystavené, zálohové, prijaté, prijaté zálohové, bločky,
 * nespracované, ostatné doklady) skladá svoje filtre z týchto stavebníc —
 * rovnaký názov, rovnaké voľby, rovnaký kľúč v adrese (`?f[kľúč]=…`) a toto
 * poradie:
 *
 *   Stav · Obdobie · Zaúčtovanie · Export do účtovníctva · Platba · Úhrada
 *   · (vlastné filtre zoznamu) · Štítky/stavy · Vymazané
 *
 * Zoznam použije len tie, na ktoré má dáta. Kľúče, ktoré sa v adrese
 * historicky volajú inak (bločky: `platba` = spôsob úhrady, `stavPlatby` =
 * párovanie; prijaté: `platba` = párovanie), ostávajú — mení sa len názov a
 * voľby, nech nezlyhajú uložené filtre a odkazy.
 */
import type { FilterDef, MoznostFiltra } from "@/components/faktero/DocumentListToolbar";

/** Poradie filtrov v lište — podľa `key` stavebnice. */
export const PORADIE_FILTROV = [
  "stav",
  "obdobie",
  "zauct",
  "export",
  "stavPlatby",
  "uhrada",
] as const;

export const NAZVY_FILTROV = {
  stav: "Stav",
  obdobie: "Obdobie",
  zauct: "Zaúčtovanie",
  export: "Export do účtovníctva",
  stavPlatby: "Platba",
  uhrada: "Úhrada",
  vymazane: "Zobraziť vymazané",
} as const;

/** Voľby „Obdobie podľa“ — rovnaké názvy všade, zoznam si vyberie tie, ktoré má. */
export const DATUMY_OBDOBIA = {
  vystavenie: { value: "vystavenie", label: "dátumu vystavenia" },
  dodanie: { value: "dodanie", label: "dátumu dodania" },
  splatnost: { value: "splatnost", label: "dátumu splatnosti" },
  prijatie: { value: "prijatie", label: "dátumu prijatia" },
  nahratie: { value: "nahratie", label: "dátumu nahratia" },
} as const satisfies Record<string, MoznostFiltra>;

export function filterStavu(options: MoznostFiltra[], key = "stav"): FilterDef {
  return { key, label: NAZVY_FILTROV.stav, type: "select", options };
}

export function filterObdobia(
  datumy: (keyof typeof DATUMY_OBDOBIA)[] = ["vystavenie"],
  key = "obdobie",
): FilterDef {
  return {
    key,
    label: NAZVY_FILTROV.obdobie,
    type: "dateRange",
    ...(datumy.length > 1 ? { dateFieldOptions: datumy.map((d) => DATUMY_OBDOBIA[d]) } : {}),
  };
}

/** Zaúčtované = má predkontáciu / `zauctovane_at` (pri nespracovaných: návrh zaúčtovania). */
export function filterZauctovania(key = "zauct"): FilterDef {
  return {
    key,
    label: NAZVY_FILTROV.zauct,
    type: "select",
    options: [
      { value: "ano", label: "Zaúčtované" },
      { value: "nie", label: "Nezaúčtované" },
    ],
  };
}

/** Export = odovzdané do účtovníctva (`exported_at`). */
export function filterExportu(key = "export"): FilterDef {
  return {
    key,
    label: NAZVY_FILTROV.export,
    type: "select",
    options: [
      { value: "ano", label: "Exportované" },
      { value: "nie", label: "Neexportované" },
    ],
  };
}

/** Párovanie s pohybom na účte. */
export function filterPlatby(key = "stavPlatby"): FilterDef {
  return {
    key,
    label: NAZVY_FILTROV.stavPlatby,
    type: "select",
    options: [
      { value: "sparovana", label: "Spárovaná" },
      { value: "navrh", label: "Nájdená, čaká na potvrdenie" },
      { value: "nenajdena", label: "Nenájdená" },
    ],
  };
}

/** Spôsob úhrady. */
export function filterUhrady(key = "uhrada"): FilterDef {
  return {
    key,
    label: NAZVY_FILTROV.uhrada,
    type: "select",
    options: [
      { value: "hotovost", label: "Hotovosť" },
      { value: "karta", label: "Karta" },
      { value: "prevod", label: "Prevod" },
    ],
  };
}

export function filterVymazanych(key = "vymazane"): FilterDef {
  return { key, label: NAZVY_FILTROV.vymazane, type: "checkbox" };
}
