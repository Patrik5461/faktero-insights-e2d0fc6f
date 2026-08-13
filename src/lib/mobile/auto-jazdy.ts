/**
 * Napojenie automaticky rozpoznaných jázd na knihu jázd.
 *
 * Plugin `@faktero/drive-detector` je zámerne lokálny — nahrá trasu a ďalej ju
 * nikam neposiela. Tento súbor je tá druhá polovica: rozpoznanú jazdu vezme
 * z buffra, spraví z nej riadok v `trips` a povie pluginu, že ju už nemá komu
 * ponúkať.
 *
 * Prevzatie musí zniesť opakovanie. Preto sa píše s `external_source` +
 * `external_id`, na ktorých je v databáze jedinečný index — keď sa uloženie
 * podarí a označenie v pluginu už nie, druhý pokus nevyrobí duplicitu.
 */
import type { BufferedTrip, Classification } from "@faktero/drive-detector";
import type { TablesInsert } from "@/integrations/supabase/types";
import { trasaDoPolyline } from "@/lib/faktero/polyline";

export const ZDROJ = "drive_detector";

/** Kratší presun do knihy jázd nepatrí — je to prechádzka po parkovisku. */
export const MIN_VZDIALENOST_M = 500;

/** Dátum jazdy v miestnom čase. `toISOString()` by v noci posunul deň o jeden. */
export function miestnyDatum(cas: number): string {
  const d = new Date(cas);
  const mesiac = String(d.getMonth() + 1).padStart(2, "0");
  const den = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mesiac}-${den}`;
}

function zaokruhli(hodnota: number, desatinne = 2): number {
  const n = 10 ** desatinne;
  return Math.round(hodnota * n) / n;
}

/**
 * Z nahranej trasy spraví riadok knihy jázd.
 *
 * Tachometer sa nastavuje rovnako ako pri ručnej GPS jazde (0 → počet km) —
 * telefón skutočný stav tachometra nevie a vymyslené číslo by bolo horšie než
 * žiadne.
 */
export function riadokZJazdy(args: {
  jazda: BufferedTrip;
  companyId: string;
  vehicleId: string;
  classification: Classification;
  spotrebaL100?: number | null;
  cenaPaliva?: number | null;
  userId?: string | null;
}): TablesInsert<"trips"> {
  const { jazda } = args;
  const km = zaokruhli(jazda.distanceMeters / 1000);
  const koniec = jazda.endedAt ?? jazda.startedAt;
  const trvanieSekundy = Math.max(0, Math.round((koniec - jazda.startedAt) / 1000));
  const spotreba =
    args.spotrebaL100 != null && args.spotrebaL100 > 0
      ? zaokruhli((km * Number(args.spotrebaL100)) / 100)
      : null;

  return {
    company_id: args.companyId,
    vehicle_id: args.vehicleId,
    trip_date: miestnyDatum(jazda.startedAt),
    purpose: args.classification === "business" ? "Automaticky rozpoznaná jazda" : "Súkromná jazda",
    classification: args.classification,
    start_odometer: 0,
    end_odometer: km,
    distance_km: km,
    fuel_consumption: spotreba,
    fuel_price: args.cenaPaliva ?? null,
    start_time: new Date(jazda.startedAt).toISOString(),
    end_time: jazda.endedAt ? new Date(jazda.endedAt).toISOString() : null,
    duration_seconds: trvanieSekundy,
    average_speed_kmh: zaokruhli(jazda.avgSpeedKmh, 1),
    route: trasaDoPolyline(jazda.points),
    external_source: ZDROJ,
    external_id: jazda.id,
    created_by: args.userId ?? null,
    note: `Automatická detekcia: ${jazda.points.length} bodov, max ${Math.round(jazda.maxSpeedKmh)} km/h`,
  };
}

/** Jazda, ktorú bez človeka uložiť nevieme — chýba jej zaradenie. */
export function cakaNaCloveka(jazda: BufferedTrip): boolean {
  return jazda.classification == null;
}

/** Príliš krátky záznam, ktorý nemá zmysel nikomu ukazovať. */
export function jePrikratka(jazda: BufferedTrip): boolean {
  return jazda.distanceMeters < MIN_VZDIALENOST_M;
}
