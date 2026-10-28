/**
 * Splatnosť zadaná počtom dní („14 dní“) popri dátume. Ráta sa v UTC z
 * dátumov YYYY-MM-DD, aby letný čas neposunul výsledok o deň.
 */
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Dátum o `dni` dní neskôr než `od`; bez platného `od` od dnešného dňa. */
export function datumPoDnoch(od: string | null | undefined, dni: number): string {
  const zaklad = od && DATUM.test(od) ? new Date(`${od}T00:00:00Z`) : new Date();
  return new Date(zaklad.getTime() + dni * 86400000).toISOString().slice(0, 10);
}

/** Počet dní medzi `od` a `doDna`; pri neplatnom dátume `null`. */
export function dniMedzi(
  od: string | null | undefined,
  doDna: string | null | undefined,
): number | null {
  if (!od || !doDna || !DATUM.test(od) || !DATUM.test(doDna)) return null;
  return Math.round((Date.parse(`${doDna}T00:00:00Z`) - Date.parse(`${od}T00:00:00Z`)) / 86400000);
}
