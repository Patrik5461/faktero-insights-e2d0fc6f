/**
 * Doklady patriace do mesiaca.
 *
 * Účtuje sa podľa dátumu vystavenia — lenže bloček, ktorý sa nepodarilo
 * prečítať, žiadny nemá. A porovnanie `issue_date >= …` je pri prázdnej
 * hodnote vždy nepravda, takže taký doklad vypadol z filtra vo **všetkých**
 * mesiacoch: appka naň upozorňovala („čaká na kontrolu"), ale na webe sa
 * nedal nájsť, opraviť ani zmazať. Bez dátumu vystavenia preto rozhoduje
 * dátum vzniku — presne ako v appke, kde sa doklady zoskupujú podľa
 * `issue_date ?? created_at`.
 */
export function vMesiaci<Q extends { or: (filter: string) => Q }>(q: Q, month: string): Q {
  // Iná hodnota než RRRR-MM (napr. „vsetky“ z odkazu) nie je mesiac — bez nej
  // padal dotaz na „NaN-undefined-01“ a zoznam ostal prázdny s chybou.
  if (!/^\d{4}-\d{2}$/.test(month)) return q;
  const [y, m] = month.split("-").map(Number);
  const od = `${y}-${String(m).padStart(2, "0")}-01`;
  const dalsiMesiac = m === 12 ? 1 : m + 1;
  const dalsiRok = m === 12 ? y + 1 : y;
  const do_ = `${dalsiRok}-${String(dalsiMesiac).padStart(2, "0")}-01`;
  return q.or(
    `and(issue_date.gte.${od},issue_date.lt.${do_}),` +
      `and(issue_date.is.null,created_at.gte.${od},created_at.lt.${do_})`,
  );
}
