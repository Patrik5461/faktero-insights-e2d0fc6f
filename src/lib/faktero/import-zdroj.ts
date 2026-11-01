/**
 * Hodnota `import_jobs.source` – stabilný kľúč zdroja importu.
 *
 * Do 11/2026 sa zapisovali texty („Pohoda“, „Money S3“, „Prijaté doklady (Doklado)“…),
 * kým filter v histórii ponúkal `superfaktura`, `csv`, `xml` – nesedelo nič okrem
 * SuperFaktúry. Teraz sa zapisuje kľúč (rovnaký ako `id` v `IMPORT_ZDROJE`)
 * a táto funkcia rozumie aj starým textom.
 */
export const KLUCE_ZDROJOV = [
  "pohoda",
  "superfaktura",
  "idoklad",
  "money-s3",
  "omega",
  "kros",
  "doklady",
] as const;
export type KlucZdroja = (typeof KLUCE_ZDROJOV)[number];

/** Krátky názov zdroja (slovenský kľúč pre `t()`). */
export const NAZVY_ZDROJOV: Record<KlucZdroja, string> = {
  pohoda: "Pohoda a mPohoda",
  superfaktura: "SuperFaktúra",
  idoklad: "iDoklad",
  "money-s3": "Money S3",
  omega: "KROS Omega",
  kros: "KROS Alfa plus",
  doklady: "Prijaté doklady (Doklado, skeny)",
};

/** Staré texty v `import_jobs.source` → kľúč. Porovnáva sa bez ohľadu na veľkosť písmen. */
const STARE: Record<string, KlucZdroja> = {
  pohoda: "pohoda",
  superfaktura: "superfaktura",
  superfaktúra: "superfaktura",
  idoklad: "idoklad",
  "money s3": "money-s3",
  "money-s3": "money-s3",
  omega: "omega",
  kros: "kros",
  doklady: "doklady",
};

/** Kľúč zdroja z hodnoty v DB (nový kľúč aj starý text); neznámy zdroj → null. */
export function zdrojImportu(source: string | null | undefined): KlucZdroja | null {
  const s = (source ?? "").trim().toLowerCase();
  if (!s) return null;
  if (STARE[s]) return STARE[s];
  if (s.startsWith("prijaté doklady")) return "doklady";
  return null;
}

/**
 * Hodnoty `source`, ktoré filter „Zdroj“ musí nájsť – kľúč aj staré texty,
 * ktoré sa kedy zapisovali (pre `.in("source", …)`). Staré „Prijaté doklady (…)“
 * mali v zátvorke ľubovoľnú aplikáciu; v DB žiadny taký riadok nie je.
 */
export function hodnotyZdrojaPreFilter(kluc: KlucZdroja): string[] {
  const stare: Record<KlucZdroja, string[]> = {
    pohoda: ["Pohoda"],
    superfaktura: [],
    idoklad: ["iDoklad"],
    "money-s3": ["Money S3"],
    omega: ["Omega"],
    kros: ["KROS"],
    doklady: ["Prijaté doklady (Doklado)"],
  };
  return [kluc, ...stare[kluc]];
}

/** Text zdroja do tabuľky: názov zo zoznamu, inak pôvodná hodnota. */
export function nazovZdrojaImportu(source: string | null | undefined): string {
  const k = zdrojImportu(source);
  return k ? NAZVY_ZDROJOV[k] : (source ?? "—");
}

/** Stav importu (aj riadku logu) → slovenský kľúč pre `t()`. */
export const NAZVY_STAVOV_IMPORTU: Record<string, string> = {
  completed: "Dokončené",
  running: "Bežiace",
  uploaded: "Nahraté",
  failed: "Zlyhané",
  error: "Chyba",
  success: "OK",
  duplicate: "Duplicita",
  warning: "Upozornenie",
  cancelled: "Zrušené",
};

export function nazovStavuImportu(stav: string | null | undefined): string {
  return (stav && NAZVY_STAVOV_IMPORTU[stav]) || stav || "—";
}

/** Druh riadku v logu importu → slovenský kľúč pre `t()`. */
export function nazovDruhuLogu(druh: string | null | undefined): string {
  const m: Record<string, string> = { invoice: "Faktúra", customer: "Odberateľ" };
  return (druh && m[druh]) || druh || "—";
}
