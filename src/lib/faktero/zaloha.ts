/**
 * Zúčtovanie zálohy.
 *
 * Faktúra si sumu zálohovej faktúry pamätá v `advance_amount`, ale `total`
 * ostáva celá cena dodávky — kvôli DPH a účtovaniu. Odberateľ však už zálohu
 * zaplatil, takže na doklade aj v QR kóde musí byť len zvyšok.
 */

function cislo(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/** Suma, ktorú má odberateľ ešte poslať. Nikdy nie záporná. */
export function zostavaUhradit(total: unknown, zaloha: unknown): number {
  const zvysok = cislo(total) - cislo(zaloha);
  return Math.round(Math.max(0, zvysok) * 100) / 100;
}

/** Má zmysel zálohu na doklade vôbec ukazovať? */
export function maZuctovanuZalohu(zaloha: unknown): boolean {
  return cislo(zaloha) > 0;
}
