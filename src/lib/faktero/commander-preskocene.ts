/**
 * Preskočené jazdy z Commanderu — spoločné pre ručnú synchronizáciu aj nočný cron.
 *
 * Prečo to má vlastný súbor: obe cesty si predtým držali vlastnú kópiu zoznamu
 * dôvodov a obe logovali **každú** preskočenú jazdu ako `console.warn`. Denný beh
 * ich pritom preskakuje tisíce — pri audite 2026-08-13 tvorilo 4 400 riadkov
 * chybového logu práve toto a skutočné chyby sa v tom stratili. Počítadlo aj
 * záznam v `commander_sync_logs` ostávajú úplné, do konzoly ide len to, čo má
 * cenu čítať.
 */

export type CommanderSkipReason =
  | "duplicate_external_id"
  | "duplicate_fallback_match"
  | "vehicle_not_linked"
  | "missing_vehicle_mapping"
  | "validation_error"
  | "zero_distance"
  | "insert_error";

export function emptySkipBreakdown(): Record<CommanderSkipReason, number> {
  return {
    duplicate_external_id: 0,
    duplicate_fallback_match: 0,
    vehicle_not_linked: 0,
    missing_vehicle_mapping: 0,
    validation_error: 0,
    zero_distance: 0,
    insert_error: 0,
  };
}

/**
 * Duplicita nie je chyba — jazdu už máme, len sme ju natiahli druhýkrát.
 * Ani nulová jazda nie je chyba, tých chodí z Commanderu bežne niekoľko denne.
 */
const OCAKAVANE_DOVODY: CommanderSkipReason[] = [
  "duplicate_external_id",
  "duplicate_fallback_match",
  "zero_distance",
];

/** Koľko prvých výskytov toho istého dôvodu sa vypíše, kým sa začne len počítať. */
const VZORIEK_NA_DOVOD = 3;

/**
 * Má sa preskočená jazda vypísať do konzoly? Volá sa **až po** zvýšení počítadla,
 * takže prvá jazda daného dôvodu má v `breakdown` hodnotu 1.
 */
export function zalogovatPreskocenu(
  reason: CommanderSkipReason,
  breakdown: Record<CommanderSkipReason, number>,
): boolean {
  if (OCAKAVANE_DOVODY.includes(reason)) return false;
  return (breakdown[reason] ?? 0) <= VZORIEK_NA_DOVOD;
}

/**
 * Hláška z databázy, ktorá znamená „taký riadok už máme".
 * Unikátny index `idx_trips_external_unique` chytá jazdy, ktoré prekĺzli
 * kontrolou duplicít vyššie — je to duplicita, nie zlyhaný zápis.
 */
export function jeDuplicitaVDatabaze(message: string | null | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("duplicate key") || m.includes("idx_trips_external_unique");
}

/**
 * Jazda, ktorá nikam neviedla.
 *
 * Commander posiela aj krátke záznamy s nulovou vzdialenosťou — naštartovanie
 * a zhasnutie na tom istom mieste, typicky 10 až 30 sekúnd, štart aj cieľ na
 * rovnakých súradniciach. Do knihy jázd nepatria: kniha stojí na kilometroch a
 * nulový riadok v nej len prekáža. Pri audite 1. 9. 2026 ich takto pribudlo 444
 * z 3 209 jázd, teda každá siedma.
 *
 * Zápornú vzdialenosť tu neriešime — tú odmietne kontrola pred týmto.
 */
export function jazdaBezKilometrov(distance: number): boolean {
  return Number.isFinite(distance) && distance <= 0;
}
