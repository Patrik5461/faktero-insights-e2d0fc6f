/**
 * Výber dokladov za obdobie podľa dátumu vystavenia alebo dodania.
 *
 * Faktúra vystavená 1. 10. s dodaním 30. 9. patrí do DPH za september, takže
 * účtovníčka potrebuje vyberať aj podľa dodania. Doklad bez dátumu dodania
 * má dodanie v deň vystavenia — preto náhradný stĺpec, inak by z výberu
 * ticho vypadol.
 */
export type DatumObdobia = "vystavenie" | "dodanie";

type SObdobim<Q> = {
  gte(stlpec: string, hodnota: string): Q;
  lte(stlpec: string, hodnota: string): Q;
  or(podmienka: string): Q;
};

/** Hranice sú voliteľné — bez `od` aj `do` sa dotaz nemení. */
export function filtrujObdobie<Q extends SObdobim<Q>>(
  q: Q,
  podla: DatumObdobia,
  od?: string | null,
  doDna?: string | null,
): Q {
  if (podla === "vystavenie") {
    if (od) q = q.gte("issue_date", od);
    if (doDna) q = q.lte("issue_date", doDna);
    return q;
  }
  if (!od && !doDna) return q;
  const hranice = (stlpec: string) =>
    [od ? `${stlpec}.gte.${od}` : null, doDna ? `${stlpec}.lte.${doDna}` : null].filter(Boolean);
  return q.or(
    `and(${hranice("delivery_date").join(",")}),` +
      `and(delivery_date.is.null,${hranice("issue_date").join(",")})`,
  );
}

/** Dátum, podľa ktorého doklad do obdobia padol. */
export function datumDodania(r: { delivery_date?: string | null; issue_date?: string | null }) {
  return r.delivery_date || r.issue_date || null;
}
