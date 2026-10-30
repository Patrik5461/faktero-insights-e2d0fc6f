/**
 * Register adaptérov GPS. Len pre server — adaptéry sú `*.server.ts`.
 * Prehliadač dostane katalóg (bez kódu) cez `gpsKatalog` v `gps.functions.ts`.
 * Poradie = poradie dlaždíc v Integráciách (najprv domáce CZ/SK systémy).
 */
import type { GpsAdapter } from "./typy";
import { adapter as gpsdozor } from "./gpsdozor.server";
import { adapter as webdispecink } from "./webdispecink.server";
import { adapter as webfleet } from "./webfleet.server";
import { adapter as traccar } from "./traccar.server";
import { adapter as geotab } from "./geotab.server";
import { adapter as samsara } from "./samsara.server";
import { adapter as wialon } from "./wialon.server";

export const ADAPTERY: GpsAdapter[] = [
  gpsdozor,
  webdispecink,
  webfleet,
  traccar,
  geotab,
  samsara,
  wialon,
];

export function adapterPodlaId(id: string): GpsAdapter | null {
  return ADAPTERY.find((a) => a.id === id) ?? null;
}

/** Hodnoty `trips.external_source` a `fuel_records.external_source` z GPS integrácií. */
export function zdrojeGps(): string[] {
  return ADAPTERY.map((a) => a.id);
}
