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

/**
 * Suma, ktorú má odberateľ ešte poslať.
 *
 * Záloha vyššia než faktúra nespraví záporný predpis — orezáva sa na nulu.
 * Dobropis je však záporný sám od seba a tak sa aj ukáže: predtým sa orezal
 * tiež, takže každý dobropis tvrdil „Spolu k úhrade 0,00“.
 */
export function zostavaUhradit(total: unknown, zaloha: unknown): number {
  const t = cislo(total);
  const zvysok = cislo(zaloha) > 0 ? Math.max(0, t - cislo(zaloha)) : t;
  // Polovica halierika od nuly, aj pri zápornej sume (Math.round ide k +∞).
  return (Math.sign(zvysok) * Math.round(Math.abs(zvysok) * 100)) / 100 || 0;
}

/** Má zmysel zálohu na doklade vôbec ukazovať? */
export function maZuctovanuZalohu(zaloha: unknown): boolean {
  return cislo(zaloha) > 0;
}
