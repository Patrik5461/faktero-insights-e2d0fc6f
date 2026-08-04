/**
 * Commander GPS — daily auto-sync runner.
 * Invoked by the public cron hook /api/public/hooks/commander-sync.
 * Server-only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptSecret } from "./payment-crypto.server";
import {
  commanderListVehicles,
  commanderListRides,
  CommanderAuthError,
  CommanderRateLimitError,
  mapFuelType,
  mapRideTypePurpose,
  pickRideId,
  pickLocation,
  getRideId,
  getRideVehicleId,
  getRideStartDate,
  getRideEndDate,
  getRideDistance,
  getRideStartOdometer,
  getRideEndOdometer,
  getRideStartLocation,
  getRideEndLocation,
  getRideType,
  getRideDriver,
} from "./commander.server";

const DAY_MS = 24 * 60 * 60 * 1000;

type DailyResult = {
  processed: number;
  imported: number;
  duplicates: number;
  errors: { company_id: string; error: string }[];
};

type CommanderSkipReason =
  | "duplicate_external_id"
  | "duplicate_fallback_match"
  | "vehicle_not_linked"
  | "missing_vehicle_mapping"
  | "validation_error"
  | "insert_error";

function emptySkipBreakdown(): Record<CommanderSkipReason, number> {
  return {
    duplicate_external_id: 0,
    duplicate_fallback_match: 0,
    vehicle_not_linked: 0,
    missing_vehicle_mapping: 0,
    validation_error: 0,
    insert_error: 0,
  };
}

function parseCommanderDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 100_000_000_000 ? raw : raw * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  let s = String(raw).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      const ms = n > 100_000_000_000 ? n : n * 1000;
      const d = new Date(ms);
      return Number.isFinite(d.getTime()) ? d : null;
    }
  }
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = dmy;
    const d = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(mi),
      Number(ss),
    );
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(s)) {
    s = s.replace(" ", "T");
  }
  const parsed = Date.parse(s);
  if (!Number.isFinite(parsed)) return null;
  const d = new Date(parsed);
  return Number.isFinite(d.getTime()) ? d : null;
}

function finiteNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function writeLog(
  company_id: string,
  status: "ok" | "error" | "rate_limited",
  message: string,
  raw: any = {},
) {
  try {
    await supabaseAdmin.from("commander_sync_logs").insert({
      company_id,
      sync_type: "daily",
      status,
      message,
      raw_response: raw,
    });
  } catch (e) {
    console.error("[commander-cron] log insert failed", e);
  }
}

async function maybeSyncVehicles(
  companyId: string,
  username: string,
  password: string,
  lastSyncAt: string | null,
) {
  if (lastSyncAt && Date.now() - new Date(lastSyncAt).getTime() < DAY_MS) return;
  const vehicles = await commanderListVehicles(username, password);
  const { data: faktVehicles } = await supabaseAdmin
    .from("vehicles")
    .select("id, name, license_plate")
    .eq("company_id", companyId);
  const byPlate = new Map<string, string>();
  const byName = new Map<string, string>();
  (faktVehicles ?? []).forEach((v: any) => {
    if (v.license_plate)
      byPlate.set(String(v.license_plate).toUpperCase().replace(/\s+/g, ""), v.id);
    if (v.name) byName.set(String(v.name).toLowerCase().trim(), v.id);
  });
  for (const cv of vehicles) {
    const cid = String(cv.vehicleId);
    const plate = (cv.vehicleRegistrationPlate ?? "").toString();
    const name = (cv.vehicleName ?? plate ?? `Commander ${cid}`).toString();
    let faktero_vehicle_id: string | null = null;
    if (plate) faktero_vehicle_id = byPlate.get(plate.toUpperCase().replace(/\s+/g, "")) ?? null;
    if (!faktero_vehicle_id && name)
      faktero_vehicle_id = byName.get(name.toLowerCase().trim()) ?? null;
    if (!faktero_vehicle_id) {
      const { data: ins } = await supabaseAdmin
        .from("vehicles")
        .insert({
          company_id: companyId,
          name,
          license_plate: plate || null,
          fuel_type: mapFuelType(cv.mainFuelType ?? null),
          consumption_l_100km: cv.combinedKmConsumption ?? cv.theoreticalConsumption ?? null,
          initial_odometer: 0,
          active: true,
        })
        .select("id")
        .maybeSingle();
      if (ins?.id) faktero_vehicle_id = ins.id;
    }
    await supabaseAdmin.from("commander_vehicle_links").upsert(
      {
        company_id: companyId,
        commander_vehicle_id: cid,
        commander_vehicle_name: name,
        commander_license_plate: plate || null,
        faktero_vehicle_id,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "company_id,commander_vehicle_id" },
    );
  }
}

function previousDayRange(): { from: Date; to: Date } {
  const now = new Date();
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const from = new Date(y);
  from.setHours(0, 0, 0, 0);
  const to = new Date(y);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

async function syncCompanyDaily(
  companyId: string,
  username: string,
  password: string,
  lastSyncAt: string | null,
) {
  let fetched = 0,
    candidates = 0,
    imported = 0;
  const skippedBreakdown = emptySkipBreakdown();
  const skippedRides: any[] = [];

  function skip(reason: CommanderSkipReason, ride: any, link: any, detail: string) {
    skippedBreakdown[reason]++;
    const entry = {
      reason,
      detail,
      commander_vehicle_id: String(ride?.vehicleId ?? link?.commander_vehicle_id ?? ""),
      faktero_vehicle_id: link?.faktero_vehicle_id ?? null,
      external_id: pickRideId(ride),
      datetimeStart: ride?.datetimeStart ?? null,
    };
    skippedRides.push(entry);
    console.warn("[commander-cron] skipped ride", { company_id: companyId, ...entry });
  }

  try {
    await maybeSyncVehicles(companyId, username, password, lastSyncAt);
  } catch (e: any) {
    if (e instanceof CommanderRateLimitError) throw e;
    if (e instanceof CommanderAuthError) throw e;
    // non-fatal: continue with rides if vehicles already linked
    console.error("[commander-cron] vehicle sync soft fail", e?.message);
  }

  const { data: links } = await supabaseAdmin
    .from("commander_vehicle_links")
    .select("commander_vehicle_id, faktero_vehicle_id")
    .eq("company_id", companyId);

  if (!links?.length) {
    return {
      imported,
      duplicates: 0,
      fetched,
      candidates,
      skippedBreakdown,
      skippedRides,
      note: "Žiadne prepojené vozidlá.",
    };
  }

  const linksByCommanderId = new Map<string, any>();
  links.forEach((l: any) => linksByCommanderId.set(String(l.commander_vehicle_id), l));

  const { from, to } = previousDayRange();

  for (const link of links) {
    const rides = await commanderListRides(
      username,
      password,
      String(link.commander_vehicle_id),
      from,
      to,
    );
    fetched += rides.length;
    for (const r of rides) {
      const resolvedVehicleId = getRideVehicleId(r);
      const rideVehicleId =
        resolvedVehicleId == null ? String(link.commander_vehicle_id) : resolvedVehicleId;
      const mappedLink = linksByCommanderId.get(rideVehicleId) ?? link;
      if (!mappedLink?.commander_vehicle_id) {
        skip(
          "missing_vehicle_mapping",
          r,
          link,
          `Commander vehicle ${rideVehicleId || "—"} nemá záznam v prepojeniach.`,
        );
        continue;
      }
      if (!mappedLink.faktero_vehicle_id) {
        skip(
          "vehicle_not_linked",
          r,
          mappedLink,
          "Commander vozidlo nie je prepojené na vozidlo vo Faktero.",
        );
        continue;
      }

      const externalId = getRideId(r);
      const rawStart = getRideStartDate(r);
      const start = parseCommanderDate(rawStart);
      if (!start) {
        skip(
          "validation_error",
          r,
          mappedLink,
          `Neplatný začiatočný dátum. Raw: ${JSON.stringify(rawStart)} (typ: ${typeof rawStart}). Kľúče: [${Object.keys(r ?? {}).join(", ")}]`,
        );
        continue;
      }
      const trip_date = start.toISOString().slice(0, 10);
      const rawEnd = getRideEndDate(r);
      const end = parseCommanderDate(rawEnd);
      const start_time_iso = start.toISOString();
      const end_time_iso = end ? end.toISOString() : null;
      const duration_seconds = end
        ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
        : null;
      const resolvedStartOdo = getRideStartOdometer(r);
      const resolvedEndOdo = getRideEndOdometer(r);
      const resolvedDistance = getRideDistance(r);
      const start_odo = resolvedStartOdo ?? 0;
      const rawDistance = resolvedDistance ?? NaN;
      const end_odo =
        resolvedEndOdo != null
          ? resolvedEndOdo
          : Number.isFinite(rawDistance)
            ? start_odo + rawDistance
            : start_odo;
      const distance = Number.isFinite(rawDistance)
        ? rawDistance
        : Math.max(0, end_odo - start_odo);
      if (!Number.isFinite(distance) || distance < 0) {
        skip(
          "validation_error",
          r,
          mappedLink,
          `Neplatná vzdialenosť: ${String(resolvedDistance ?? "")}`,
        );
        continue;
      }
      if (end_odo < start_odo) {
        skip(
          "validation_error",
          r,
          mappedLink,
          `Koncový tachometer (${end_odo}) je menší ako počiatočný (${start_odo}).`,
        );
        continue;
      }

      if (externalId) {
        const { data: dup, error: dupError } = await supabaseAdmin
          .from("trips")
          .select("id")
          .eq("company_id", companyId)
          .eq("external_source", "commander")
          .eq("external_id", externalId)
          .maybeSingle();
        if (dupError) {
          skip("insert_error", r, mappedLink, `Kontrola duplicity zlyhala: ${dupError.message}`);
          continue;
        }
        if (dup) {
          skip("duplicate_external_id", r, mappedLink, `external_id ${externalId} už existuje.`);
          continue;
        }
      } else {
        const startLocation = getRideStartLocation(r);
        const endLocation = getRideEndLocation(r);
        let dupQuery = supabaseAdmin
          .from("trips")
          .select("id")
          .eq("company_id", companyId)
          .eq("vehicle_id", mappedLink.faktero_vehicle_id!)
          .eq("trip_date", trip_date)
          .eq("distance_km", distance);
        dupQuery =
          startLocation === null
            ? dupQuery.is("start_location", null)
            : dupQuery.eq("start_location", startLocation);
        dupQuery =
          endLocation === null
            ? dupQuery.is("end_location", null)
            : dupQuery.eq("end_location", endLocation);
        const { data: dup, error: dupError } = await dupQuery.maybeSingle();
        if (dupError) {
          skip(
            "insert_error",
            r,
            mappedLink,
            `Kontrola fallback duplicity zlyhala: ${dupError.message}`,
          );
          continue;
        }
        if (dup) {
          skip(
            "duplicate_fallback_match",
            r,
            mappedLink,
            "Jazda bez external_id zodpovedá existujúcej jazde podľa vozidla, dátumu, trasy a vzdialenosti.",
          );
          continue;
        }
      }

      candidates++;
      const { error } = await supabaseAdmin.from("trips").insert({
        company_id: companyId,
        vehicle_id: mappedLink.faktero_vehicle_id!,
        trip_date,
        driver_name: getRideDriver(r),
        start_location: getRideStartLocation(r),
        end_location: getRideEndLocation(r),
        purpose: mapRideTypePurpose(getRideType(r) ?? null),
        start_odometer: start_odo,
        end_odometer: end_odo,
        distance_km: distance,
        start_time: start_time_iso,
        end_time: end_time_iso,
        duration_seconds,
        average_speed_kmh:
          duration_seconds && duration_seconds > 0 && Number.isFinite(distance)
            ? Math.round((distance / (duration_seconds / 3600)) * 10) / 10
            : null,
        note: "Automatický import z Commander GPS",
        external_source: "commander",
        external_id: externalId,
        imported_at: new Date().toISOString(),
        raw_provider_data: r as any,
      });
      if (error) {
        skip("insert_error", r, mappedLink, error.message);
        continue;
      }
      imported++;
    }
  }

  const duplicates =
    skippedBreakdown.duplicate_external_id + skippedBreakdown.duplicate_fallback_match;
  console.log("[commander-cron] ride sync summary", {
    company_id: companyId,
    fetched_rides_count: fetched,
    candidate_rides_count: candidates,
    inserted_trips_count: imported,
    skipped_breakdown: skippedBreakdown,
  });

  return {
    imported,
    duplicates,
    fetched,
    candidates,
    skippedBreakdown,
    skippedRides,
    note: null as string | null,
  };
}

export async function runCommanderDailySync(): Promise<DailyResult> {
  const result: DailyResult = { processed: 0, imported: 0, duplicates: 0, errors: [] };

  const { data: conns, error } = await supabaseAdmin
    .from("commander_connections")
    .select("company_id, username, encrypted_password, last_sync_at")
    .eq("enabled", true)
    .eq("auto_sync_daily", true);

  if (error) throw new Error(error.message);

  for (const c of conns ?? []) {
    result.processed++;
    let password: string;
    try {
      password = decryptSecret(c.encrypted_password);
    } catch (e: any) {
      const msg = "Nepodarilo sa dešifrovať prihlasovacie údaje.";
      result.errors.push({ company_id: c.company_id, error: msg });
      await writeLog(c.company_id, "error", msg, { error_message: msg });
      await supabaseAdmin
        .from("commander_connections")
        .update({
          sync_status: "error",
          error_message: msg,
        })
        .eq("company_id", c.company_id);
      continue;
    }

    try {
      const r = await syncCompanyDaily(c.company_id, c.username, password, c.last_sync_at);
      result.imported += r.imported;
      result.duplicates += r.duplicates;
      const msg =
        r.note ?? `Denná synchronizácia: ${r.imported} importovaných, ${r.duplicates} duplikátov.`;
      await writeLog(c.company_id, "ok", msg, {
        fetched_rides_count: r.fetched,
        candidate_rides_count: r.candidates,
        inserted_trips_count: r.imported,
        skipped_rides_count: Object.values(r.skippedBreakdown).reduce(
          (sum, count) => sum + count,
          0,
        ),
        skipped_duplicates: r.duplicates,
        skipped_unlinked_vehicle: r.skippedBreakdown.vehicle_not_linked,
        validation_errors: r.skippedBreakdown.validation_error,
        insert_errors: r.skippedBreakdown.insert_error,
        missing_vehicle_mapping: r.skippedBreakdown.missing_vehicle_mapping,
        duplicate_external_id: r.skippedBreakdown.duplicate_external_id,
        duplicate_fallback_match: r.skippedBreakdown.duplicate_fallback_match,
        skipped_breakdown: r.skippedBreakdown,
        skipped_rides: r.skippedRides,
      });
      await supabaseAdmin
        .from("commander_connections")
        .update({
          sync_status: "ok",
          error_message: null,
          last_sync_at: new Date().toISOString(),
        })
        .eq("company_id", c.company_id);
    } catch (e: any) {
      const isRate = e instanceof CommanderRateLimitError;
      const isAuth = e instanceof CommanderAuthError;
      const msg = isRate
        ? "Commander API limit bol dosiahnutý."
        : isAuth
          ? "Neplatné prihlasovacie údaje."
          : (e?.message ?? "Synchronizácia zlyhala.");
      result.errors.push({ company_id: c.company_id, error: msg });
      await writeLog(c.company_id, isRate ? "rate_limited" : "error", msg, { error_message: msg });
      await supabaseAdmin
        .from("commander_connections")
        .update({
          sync_status: "error",
          error_message: msg,
          last_sync_at: new Date().toISOString(),
        })
        .eq("company_id", c.company_id);
      // rate-limited: stop processing this company, continue with next (loop continues)
    }
  }

  return result;
}
