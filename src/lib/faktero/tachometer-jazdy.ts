/**
 * J-05: tachometer jazdy zaznamenanej GPS. Prístroj meria len prejdené km,
 * takže začiatok je posledný známy stav vozidla (koniec jeho poslednej jazdy,
 * inak počiatočný stav z karty) a koniec = začiatok + km.
 *
 * Rovnaké pravidlo drží aj spúšťač `trips_doplnit_tachometer` v databáze – ten
 * zachytí jazdy z appky v telefóne, ktorá sa bez nového buildu nezmení.
 */
export function tachometerGpsJazdy(
  poslednyKoniec: number | string | null | undefined,
  pociatocny: number | string | null | undefined,
  km: number,
): { start_odometer: number; end_odometer: number } {
  const posledny = poslednyKoniec == null || poslednyKoniec === "" ? null : Number(poslednyKoniec);
  const zaklad =
    posledny != null && Number.isFinite(posledny) ? posledny : Number(pociatocny ?? 0) || 0;
  const zaokruhli = (n: number) => Math.round(n * 100) / 100;
  return { start_odometer: zaokruhli(zaklad), end_odometer: zaokruhli(zaklad + (Number(km) || 0)) };
}
