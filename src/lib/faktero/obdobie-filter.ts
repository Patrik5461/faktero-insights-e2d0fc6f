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

export function filtrujObdobie<Q extends SObdobim<Q>>(
  q: Q,
  podla: DatumObdobia,
  od: string,
  doDna: string,
): Q {
  if (podla === "vystavenie") return q.gte("issue_date", od).lte("issue_date", doDna);
  return q.or(
    `and(delivery_date.gte.${od},delivery_date.lte.${doDna}),` +
      `and(delivery_date.is.null,issue_date.gte.${od},issue_date.lte.${doDna})`,
  );
}

/** Dátum, podľa ktorého doklad do obdobia padol. */
export function datumDodania(r: { delivery_date?: string | null; issue_date?: string | null }) {
  return r.delivery_date || r.issue_date || null;
}
