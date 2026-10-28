/*
  Zálohy firmy — čisté pomocné funkcie (bez servera), aby sa dali testovať.
*/

/** Koľko hotových záloh sa ponecháva — staršie sa zmažú. */
export const POCET_ZALOH = 5;

/** Beh starší než toto sa považuje za zaseknutý (server sa medzitým reštartoval). */
export const ZASEKNUTA_PO_MS = 2 * 3600 * 1000;

export type RiadokZalohy = {
  id: string;
  stav: string;
  cesta?: string | null;
  created_at: string;
};

/** Cesta súboru zálohy v koši `export-firmy` — priečinok firmy, podpriečinok `zalohy`. */
export function cestaZalohy(companyId: string, kedy: Date): string {
  return `${companyId}/zalohy/zaloha-${kedy.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;
}

/**
 * Ktoré zálohy zmazať: hotové nad počet `ponechat` (najnovšie ostávajú)
 * a chybné staršie než najstaršia ponechaná hotová.
 */
export function zalohyNaZmazanie<T extends RiadokZalohy>(riadky: T[], ponechat: number): T[] {
  const zoradene = [...riadky].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const hotove = zoradene.filter((r) => r.stav === "hotovo");
  const nazmazanie = hotove.slice(ponechat);
  const hranica = hotove[Math.min(ponechat, hotove.length) - 1]?.created_at;
  const stareChyby = hranica
    ? zoradene.filter((r) => r.stav === "chyba" && r.created_at < hranica)
    : [];
  return [...nazmazanie, ...stareChyby];
}

/** Beží ešte záloha? Zaseknutá (príliš stará) sa za bežiacu nepovažuje. */
export function bezi(r: RiadokZalohy, teraz = Date.now()): boolean {
  return r.stav === "bezi" && teraz - new Date(r.created_at).getTime() < ZASEKNUTA_PO_MS;
}

/** Veľkosť pre ľudí — pod megabajt v kilobajtoch. */
export function velkostSlovom(bajtov: number | null | undefined): string {
  const b = Number(bajtov ?? 0);
  if (!b) return "—";
  return b < 1024 * 1024
    ? `${Math.max(1, Math.round(b / 1024))} kB`
    : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
