/**
 * Názov sťahovaného exportu s firmou na konci (Patrik 20. 11. 2026), aby sa
 * súbor v Stiahnutých dal nájsť:
 *   pohoda-faktury-2026-11-18.xml → pohoda-faktury-2026-11-18-PALIERA-sro.xml
 *
 * Mení sa len názov súboru, nikdy obsah. Súbory pre konektor (mostík) a
 * názvy vnútri balíkov ostávajú, ako boli — čítajú ich stroje.
 */

/** Právne formy — písmená v poradí, ako sa píšu (bodky a medzery voliteľné). */
const PRAVNE_FORMY: { vzor: RegExp; skratka: (m: string) => string }[] = [
  // „spol. s r. o.“, „spol. s r.o.“, „spol.s.r.o.“
  {
    vzor: /(?<![\p{L}\d])spol\s*\.?\s*s\s*\.?\s*r\s*\.?\s*o(?![\p{L}\d])\.?/giu,
    skratka: (m) => pismena(m).slice(-3),
  },
  ...[
    ["v", "o", "s"],
    ["s", "r", "o"],
    ["a", "s"],
    ["k", "s"],
    ["s", "p"],
    ["n", "o"],
    ["o", "z"],
    ["z", "s"],
    ["o", "p", "s"],
    ["z", "u"],
  ].map((p) => ({
    // Aspoň jedna bodka, aby sa „AS“ v názve nebralo ako právna forma
    // (aj tak by ostalo „AS“, ale nech sa nič nezlepí z bežných slov).
    vzor: new RegExp(`(?<![\\p{L}\\d])${p.join("\\s*\\.?\\s*")}(?![\\p{L}\\d])\\.?`, "giu"),
    skratka: (m: string) => (m.includes(".") ? pismena(m) : m),
  })),
];

function pismena(s: string): string {
  return s.replace(/[^\p{L}]/gu, "");
}

const MAX_DLZKA = 40;

/** „PALIERA, s. r. o.“ → „PALIERA-sro“; prázdny reťazec, ak z názvu nič neostane. */
export function slugFirmy(nazov: string | null | undefined): string {
  let s = String(nazov ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // ß, ø, æ, ł… nemajú rozklad — aspoň tie bežné.
    .replace(/ß/g, "ss")
    .replace(/[øØ]/g, (c) => (c === "ø" ? "o" : "O"))
    .replace(/[łŁ]/g, (c) => (c === "ł" ? "l" : "L"))
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE");
  for (const { vzor, skratka } of PRAVNE_FORMY) s = s.replace(vzor, (m) => ` ${skratka(m)} `);
  s = s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > MAX_DLZKA) s = s.slice(0, MAX_DLZKA).replace(/-+$/, "");
  return s;
}

/**
 * Pridá firmu pred príponu. Bez názvu firmy vráti názov bez zmeny; ak už
 * firma na konci je (opakované stiahnutie z histórie), nepridá ju druhýkrát.
 */
export function nazovSuboruSFirmou(
  nazov: string,
  firma: string | { name?: string | null } | null | undefined,
): string {
  const slug = slugFirmy(typeof firma === "string" ? firma : firma?.name);
  if (!nazov || !slug) return nazov;
  const m = /^(.*?)((?:\.[A-Za-z0-9]{1,5})?)$/.exec(nazov)!;
  const [zaklad, pripona] = m[2] && m[1] ? [m[1], m[2]] : [nazov, ""];
  if (zaklad.endsWith(`-${slug}`)) return nazov;
  return `${zaklad}-${slug}${pripona}`;
}
