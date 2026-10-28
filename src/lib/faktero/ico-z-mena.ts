/*
  Náhradné IČO z mena partnera — pre export do Pohody.

  Partner bez IČO (zahraničná firma, fyzická osoba) sa v adresári Pohody
  páruje len podľa textu adresy; drobná zmena v názve alebo ulici založí
  ďalšiu kartu. Keď si to firma zapne (`companies.pohoda_ico_z_mena`), pošle
  sa namiesto prázdneho IČO stabilný identifikátor odvodený z mena a krajiny —
  ten istý partner dostane vždy ten istý. Predpona „FK“ ho odlíši od
  skutočného IČO (to má len číslice).
*/

/** Meno bez diakritiky, veľkosti písmen, interpunkcie a medzier. */
export function normalizujMeno(nazov: unknown): string {
  return String(nazov ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** FNV-1a (32 bitov) — stabilný a rovnaký v prehliadači aj na serveri. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Náhradné IČO, napr. „FK3A9F12C0“; prázdne meno = prázdny reťazec. */
export function icoZMena(nazov: unknown, krajina?: unknown): string {
  const meno = normalizujMeno(nazov);
  if (!meno) return "";
  const k = String(krajina ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  return `FK${fnv1a(`${k}|${meno}`).toString(16).toUpperCase().padStart(8, "0")}`;
}

/** IČO partnera do Pohody — skutočné, inak náhradné (keď je voľba zapnutá). */
export function icoPrePohodu(
  ico: unknown,
  nazov: unknown,
  krajina: unknown,
  zapnute: boolean | null | undefined,
): string {
  const skutocne = String(ico ?? "").replace(/\s/g, "");
  if (skutocne || !zapnute) return skutocne;
  return icoZMena(nazov, krajina);
}
