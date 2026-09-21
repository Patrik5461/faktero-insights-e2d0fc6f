/*
  Ostatné doklady — listy, predpisy, exekúcie, zmluvy a ďalšie podklady pre
  účtovníka, ktoré nie sú faktúra ani bloček. Neúčtujú sa automaticky (do
  Pohody nejdú), ale účtovník z nich účtuje, tak ich musí vidieť a odkliknúť.
*/

export const DRUHY_OSTATNYCH = [
  { kluc: "exekucia", nazov: "Exekúcia" },
  { kluc: "poistovna", nazov: "Poisťovňa — predpis" },
  { kluc: "danovy_urad", nazov: "Daňový úrad" },
  { kluc: "socialna_zdravotna", nazov: "Sociálna / zdravotná poisťovňa" },
  { kluc: "zmluva", nazov: "Zmluva" },
  { kluc: "leasing_uver", nazov: "Leasing a úver" },
  { kluc: "uradny_list", nazov: "Úradný list" },
  { kluc: "ine", nazov: "Iné" },
] as const;

export type DruhOstatneho = (typeof DRUHY_OSTATNYCH)[number]["kluc"];

export const DRUHY_KLUCE = DRUHY_OSTATNYCH.map((d) => d.kluc) as [DruhOstatneho, ...DruhOstatneho[]];

export function nazovDruhu(kluc: string | null | undefined): string {
  return DRUHY_OSTATNYCH.find((d) => d.kluc === kluc)?.nazov ?? "Iné";
}

/** Najviac 20 MB na súbor — rovnako ako strop kbelíka `other-docs`. */
export const MAX_VELKOST_PRILOHY = 20 * 1024 * 1024;

export const POVOLENE_TYPY_PRILOH = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"];

/**
 * Meno súboru do cesty v úložisku: bez diakritiky, medzier a lomiek. Pôvodné
 * meno sa pamätá zvlášť, človek ho uvidí nezmenené.
 */
export function bezpecneMeno(meno: string): string {
  const cisty = meno
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+/, "");
  return (cisty || "subor").slice(-100);
}

/** Cesta prílohy musí ležať v priečinku firmy a dokladu, inak ju server odmietne. */
export function jeCestaDokladu(path: string, companyId: string, documentId: string): boolean {
  const casti = path.split("/");
  return (
    casti.length === 3 &&
    casti[0] === companyId &&
    casti[1] === documentId &&
    casti[2].length > 0 &&
    !casti[2].includes("..")
  );
}

/** Lehota, ktorá už uplynula alebo príde do 7 dní — v zozname sa zvýrazní. */
export function stavLehoty(dueDate: string | null | undefined, dnes: string): "po" | "blizko" | null {
  if (!dueDate) return null;
  if (dueDate < dnes) return "po";
  const o7 = new Date(`${dnes}T00:00:00Z`);
  o7.setUTCDate(o7.getUTCDate() + 7);
  return dueDate <= o7.toISOString().slice(0, 10) ? "blizko" : null;
}
