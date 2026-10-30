/**
 * Register adaptérov GPS. Len pre server — adaptéry sú `*.server.ts`.
 * Prehliadač dostane katalóg (bez kódu) cez `gpsKatalog` v `gps.functions.ts`.
 */
import type { GpsAdapter } from "./typy";
import { adapter as gpsdozor } from "./gpsdozor.server";

export const ADAPTERY: GpsAdapter[] = [gpsdozor];

export function adapterPodlaId(id: string): GpsAdapter | null {
  return ADAPTERY.find((a) => a.id === id) ?? null;
}

/** Hodnoty `trips.external_source` a `fuel_records.external_source` z GPS integrácií. */
export function zdrojeGps(): string[] {
  return ADAPTERY.map((a) => a.id);
}
