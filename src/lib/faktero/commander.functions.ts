import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function maskUser(u?: string | null) {
  if (!u) return null;
  if (u.length <= 3) return "•••";
  return u.slice(0, 2) + "•••" + u.slice(-1);
}

async function assertAdmin(ctx: any, companyId: string) {
  const { data: ok } = await ctx.supabase.rpc("is_company_admin", {
    _company_id: companyId, _user_id: ctx.userId,
  });
  if (!ok) throw new Error("Nemáte oprávnenie meniť Commander integráciu.");
}

export const getCommanderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { canDecryptSecret } = await import("./payment-crypto.server");
    const { data: row } = await supabase
      .from("commander_connections")
      .select("id, enabled, username, auto_sync_daily, last_sync_at, sync_status, error_message, updated_at")
      .eq("company_id", data.companyId).maybeSingle();
    // Probe stored password so UI can prompt for re-entry after key rotation.
    let credentials_invalid = false;
    if (row) {
      const { data: sec } = await supabaseAdmin
        .from("commander_connections")
        .select("encrypted_password")
        .eq("company_id", data.companyId).maybeSingle();
      credentials_invalid = !!sec?.encrypted_password && !canDecryptSecret(sec.encrypted_password);
    }
    const { data: links } = await supabase
      .from("commander_vehicle_links")
      .select("id, commander_vehicle_id, commander_vehicle_name, commander_license_plate, faktero_vehicle_id, last_synced_at")
      .eq("company_id", data.companyId)
      .order("commander_vehicle_name", { ascending: true });
    const { data: logs } = await supabase
      .from("commander_sync_logs")
      .select("id, sync_type, status, message, created_at, raw_response")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(20);
    return {
      connection: row ? { ...row, username_masked: maskUser(row.username), username: undefined, credentials_invalid } : null,
      credentials_invalid,
      links: links ?? [],
      logs: logs ?? [],
    };
  });

const SaveSchema = z.object({
  companyId: z.string().uuid(),
  username: z.string().trim().min(1).max(200),
  password: z.string().trim().min(1).max(500).optional(), // optional → keep existing
  enabled: z.boolean(),
  auto_sync_daily: z.boolean().optional(),
});

export const saveCommanderConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptSecret } = await import("./payment-crypto.server");
    const { data: existing } = await supabaseAdmin
      .from("commander_connections").select("id, encrypted_password")
      .eq("company_id", data.companyId).maybeSingle();
    const encrypted = data.password
      ? encryptSecret(data.password)
      : existing?.encrypted_password ?? null;
    if (!encrypted) throw new Error("Heslo je povinné.");
    const patch = {
      company_id: data.companyId,
      username: data.username,
      encrypted_password: encrypted,
      enabled: data.enabled,
      auto_sync_daily: data.auto_sync_daily ?? false,
    };
    if (existing) {
      const { error } = await supabaseAdmin.from("commander_connections").update(patch).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("commander_connections").insert(patch);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const disconnectCommander = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("commander_connections").delete().eq("company_id", data.companyId);
    return { ok: true };
  });

async function loadCreds(companyId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptSecret } = await import("./payment-crypto.server");
  const { data: row } = await supabaseAdmin
    .from("commander_connections")
    .select("username, encrypted_password, enabled")
    .eq("company_id", companyId).maybeSingle();
  if (!row) throw new Error("Commander nie je pripojený.");
  return { username: row.username, password: decryptSecret(row.encrypted_password), enabled: row.enabled };
}

async function logSync(companyId: string, sync_type: string, status: string, message?: string, raw?: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    await supabaseAdmin.from("commander_sync_logs").insert({
      company_id: companyId, sync_type, status, message: message ?? null, raw_response: raw ?? null,
    });
  } catch (e) { console.error("[commander-log]", e); }
}

const DECRYPT_MSG = "Prihlasovacie údaje Commander GPS je potrebné znova zadať. Toto sa stáva po zmene bezpečnostného kľúča systému. Zadajte prosím váš Commander username a heslo znova.";

export const testCommander = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; username?: string; password?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.companyId);
    const { commanderTest, CommanderAuthError, CommanderRateLimitError } = await import("./commander.server");
    const { isDecryptError } = await import("./payment-crypto.server");
    let u = data.username, p = data.password;
    if (!u || !p) {
      try {
        const c = await loadCreds(data.companyId);
        u = u ?? c.username; p = p ?? c.password;
      } catch (e: any) {
        if (isDecryptError(e)) {
          await logSync(data.companyId, "test", "error", DECRYPT_MSG);
          return { ok: false, error: DECRYPT_MSG, needs_reauth: true };
        }
        throw e;
      }
    }
    try {
      await commanderTest(u!, p!);
      await logSync(data.companyId, "test", "ok", "Pripojenie funguje.");
      return { ok: true };
    } catch (e: any) {
      const msg = e instanceof CommanderAuthError ? "Neplatné prihlasovacie údaje."
        : e instanceof CommanderRateLimitError ? "Commander API limit bol dosiahnutý. Skúste neskôr."
        : e?.message ?? "Pripojenie zlyhalo.";
      await logSync(data.companyId, "test", "error", msg);
      return { ok: false, error: msg };
    }
  });

export const syncCommanderVehicles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      commanderListVehicles, CommanderAuthError, CommanderRateLimitError, mapFuelType,
    } = await import("./commander.server");
    const { isDecryptError } = await import("./payment-crypto.server");
    let creds;
    try { creds = await loadCreds(data.companyId); }
    catch (e: any) {
      if (isDecryptError(e)) {
        await logSync(data.companyId, "vehicles", "error", DECRYPT_MSG);
        await supabaseAdmin.from("commander_connections").update({
          sync_status: "error", error_message: DECRYPT_MSG, last_sync_at: new Date().toISOString(),
        }).eq("company_id", data.companyId);
        return { ok: false, error: DECRYPT_MSG, needs_reauth: true };
      }
      throw e;
    }
    let vehicles;
    try { vehicles = await commanderListVehicles(creds.username, creds.password); }
    catch (e: any) {
      const msg = e instanceof CommanderAuthError ? "Neplatné prihlasovacie údaje."
        : e instanceof CommanderRateLimitError ? "Commander API limit bol dosiahnutý. Skúste neskôr."
        : e?.message ?? "Synchronizácia vozidiel zlyhala.";
      await logSync(data.companyId, "vehicles", "error", msg);
      await supabaseAdmin.from("commander_connections").update({
        sync_status: "error", error_message: msg, last_sync_at: new Date().toISOString(),
      }).eq("company_id", data.companyId);
      return { ok: false, error: msg };
    }
    // Existing Faktero vehicles for auto-matching
    const { data: faktVehicles } = await supabaseAdmin
      .from("vehicles").select("id, name, license_plate").eq("company_id", data.companyId);
    const byPlate = new Map<string, string>();
    const byName = new Map<string, string>();
    (faktVehicles ?? []).forEach((v: any) => {
      if (v.license_plate) byPlate.set(String(v.license_plate).toUpperCase().replace(/\s+/g, ""), v.id);
      if (v.name) byName.set(String(v.name).toLowerCase().trim(), v.id);
    });
    let upserted = 0, linked = 0;
    for (const cv of vehicles) {
      const cid = String(cv.vehicleId);
      const plate = (cv.vehicleRegistrationPlate ?? "").toString();
      const name = (cv.vehicleName ?? plate ?? `Commander ${cid}`).toString();
      let faktero_vehicle_id: string | null = null;
      if (plate) faktero_vehicle_id = byPlate.get(plate.toUpperCase().replace(/\s+/g, "")) ?? null;
      if (!faktero_vehicle_id && name) faktero_vehicle_id = byName.get(name.toLowerCase().trim()) ?? null;
      // Auto-create Faktero vehicle if no match
      if (!faktero_vehicle_id) {
        const { data: ins } = await supabaseAdmin.from("vehicles").insert({
          company_id: data.companyId,
          name,
          license_plate: plate || null,
          fuel_type: mapFuelType(cv.mainFuelType ?? null),
          consumption_l_100km: cv.combinedKmConsumption ?? cv.theoreticalConsumption ?? null,
          initial_odometer: 0,
          active: true,
        }).select("id").maybeSingle();
        if (ins?.id) { faktero_vehicle_id = ins.id; linked++; }
      } else {
        linked++;
      }
      await supabaseAdmin.from("commander_vehicle_links").upsert({
        company_id: data.companyId,
        commander_vehicle_id: cid,
        commander_vehicle_name: name,
        commander_license_plate: plate || null,
        faktero_vehicle_id,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "company_id,commander_vehicle_id" });
      upserted++;
    }
    await supabaseAdmin.from("commander_connections").update({
      sync_status: "ok", error_message: null, last_sync_at: new Date().toISOString(),
    }).eq("company_id", data.companyId);
    const msg = `Synchronizovaných ${upserted} vozidiel, prepojených ${linked}.`;
    await logSync(data.companyId, "vehicles", "ok", msg, { count: upserted });
    return { ok: true, count: upserted, linked, message: msg };
  });

export const linkCommanderVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; linkId: string; faktero_vehicle_id: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("commander_vehicle_links")
      .update({ faktero_vehicle_id: data.faktero_vehicle_id })
      .eq("id", data.linkId).eq("company_id", data.companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SyncRidesSchema = z.object({
  companyId: z.string().uuid(),
  preset: z.enum(["today", "week", "month", "last30", "custom"]).default("last30"),
  from: z.string().optional(), // YYYY-MM-DD
  to: z.string().optional(),
  force: z.boolean().optional(), // when true, skip fallback-match dedup so previously-skipped rides retry
});

function rangeFor(preset: string, from?: string, to?: string): { from: Date; to: Date } {
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (preset === "today") return { from: start, to: end };
  if (preset === "week") {
    const d = new Date(start); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day);
    return { from: d, to: end };
  }
  if (preset === "month") {
    return { from: new Date(start.getFullYear(), start.getMonth(), 1), to: end };
  }
  if (preset === "custom" && from && to) {
    const f = new Date(from + "T00:00:00"); const t = new Date(to + "T23:59:59");
    return { from: f, to: t };
  }
  const f = new Date(start); f.setDate(f.getDate() - 30);
  return { from: f, to: end };
}

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
  // DD.MM.YYYY[ HH:mm[:ss]] (Slovak/Commander UI style)
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = dmy;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
    return Number.isFinite(d.getTime()) ? d : null;
  }
  // YYYY-MM-DD HH:mm:ss → normalize space to T so Date.parse handles it cross-engine
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

export const syncCommanderRides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SyncRidesSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      commanderListRides, CommanderAuthError, CommanderRateLimitError,
      mapRideTypePurpose, pickRideId, pickLocation,
      getRideId, getRideVehicleId, getRideStartDate, getRideEndDate,
      getRideDistance, getRideStartOdometer, getRideEndOdometer,
      getRideStartLocation, getRideEndLocation, getRideType, getRideDriver,
    } = await import("./commander.server");
    const { isDecryptError } = await import("./payment-crypto.server");
    let creds;
    try { creds = await loadCreds(data.companyId); }
    catch (e: any) {
      if (isDecryptError(e)) {
        await logSync(data.companyId, "rides", "error", DECRYPT_MSG);
        return { ok: false, error: DECRYPT_MSG, needs_reauth: true, imported: 0, skipped: 0, duplicates: 0, unlinked: 0, errors: 0, fetched: 0 };
      }
      throw e;
    }

    const { data: allLinks } = await supabaseAdmin
      .from("commander_vehicle_links")
      .select("commander_vehicle_id, commander_vehicle_name, faktero_vehicle_id")
      .eq("company_id", data.companyId);
    const links = allLinks ?? [];
    const linksByCommanderId = new Map<string, any>();
    links.forEach((l: any) => linksByCommanderId.set(String(l.commander_vehicle_id), l));

    if (!links.length) {
      const msg = "Najprv synchronizujte a prepojte vozidlá.";
      const skippedBreakdown = emptySkipBreakdown();
      await logSync(data.companyId, "rides", "error", msg, {
        fetched_rides_count: 0,
        candidate_rides_count: 0,
        inserted_trips_count: 0,
        skipped_rides_count: 0,
        skipped_breakdown: skippedBreakdown,
        skipped_rides: [],
      });
      return { ok: false, error: msg, imported: 0, skipped: 0, duplicates: 0, unlinked: 0, errors: 0, fetched: 0 };
    }

    const { from, to } = rangeFor(data.preset, data.from, data.to);
    let fetched = 0, candidates = 0, imported = 0;
    const skippedBreakdown = emptySkipBreakdown();
    const skippedRides: any[] = [];
    const insertErrorSamples: string[] = [];
    const sampleRides: any[] = []; // first 10 rides — raw + parsed datetimes for diagnostics
    const rawRideSampleFull: any[] = []; // first 3 rides — entire payload (sanitized)

    function skip(reason: CommanderSkipReason, ride: any, link: any, detail: string) {
      skippedBreakdown[reason]++;
      const entry = {
        reason,
        detail,
        commander_vehicle_id: String(ride?.vehicleId ?? link?.commander_vehicle_id ?? ""),
        commander_vehicle_name: link?.commander_vehicle_name ?? null,
        faktero_vehicle_id: link?.faktero_vehicle_id ?? null,
        external_id: pickRideId(ride),
        datetimeStart: ride?.datetimeStart ?? null,
      };
      skippedRides.push(entry);
      console.warn("[commander] skipped ride", { company_id: data.companyId, ...entry });
    }

    try {
      for (const link of links) {
        const rides = await commanderListRides(creds.username, creds.password, String(link.commander_vehicle_id), from, to);
        fetched += rides.length;
        for (const r of rides) {
          if (rawRideSampleFull.length < 3) {
            // No credentials are present on ride payloads; safe to store as-is.
            rawRideSampleFull.push(r);
          }
          if (sampleRides.length < 10) {
            const rawS = getRideStartDate(r) ?? null;
            const rawE = getRideEndDate(r) ?? null;
            const ps = parseCommanderDate(rawS);
            const pe = parseCommanderDate(rawE);
            sampleRides.push({
              ride_id: getRideId(r),
              vehicle_id: getRideVehicleId(r),
              keys: Object.keys(r ?? {}),
              datetimeStart_raw: rawS,
              datetimeStart_type: typeof rawS,
              datetimeStart_parsed: ps ? ps.toISOString() : null,
              datetimeEnd_raw: rawE,
              datetimeEnd_parsed: pe ? pe.toISOString() : null,
              distance: getRideDistance(r),
              start_location: getRideStartLocation(r),
              end_location: getRideEndLocation(r),
            });
          }
          const resolvedVehicleId = getRideVehicleId(r);
          const rideVehicleId = resolvedVehicleId == null ? String(link.commander_vehicle_id) : resolvedVehicleId;
          const mappedLink = linksByCommanderId.get(rideVehicleId) ?? link;
          if (!mappedLink?.commander_vehicle_id) {
            skip("missing_vehicle_mapping", r, link, `Commander vehicle ${rideVehicleId || "—"} nemá záznam v prepojeniach.`);
            continue;
          }
          if (!mappedLink.faktero_vehicle_id) {
            skip("vehicle_not_linked", r, mappedLink, "Commander vozidlo nie je prepojené na vozidlo vo Faktero.");
            continue;
          }

          const externalId = getRideId(r);
          const rawStart = getRideStartDate(r);
          const rawEnd = getRideEndDate(r);
          const start = parseCommanderDate(rawStart);
          const end = parseCommanderDate(rawEnd);
          if (rawStart === null || rawStart === undefined || rawStart === "") {
            skip("validation_error", r, mappedLink, `Chýba začiatočný dátum. Kľúče v payloade: [${Object.keys(r ?? {}).join(", ")}]`);
            continue;
          }
          if (!start) {
            skip("validation_error", r, mappedLink, `Neplatný začiatočný dátum. Raw: ${JSON.stringify(rawStart)} (typ: ${typeof rawStart}). Parser vrátil null.`);
            continue;
          }
          const trip_date = start.toISOString().slice(0, 10);
          const start_time_iso = start.toISOString();
          const end_time_iso = end ? end.toISOString() : null;
          const duration_seconds = end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000)) : null;
          const resolvedStartOdo = getRideStartOdometer(r);
          const resolvedEndOdo = getRideEndOdometer(r);
          const resolvedDistance = getRideDistance(r);
          const start_odo = resolvedStartOdo ?? 0;
          const rawDistance = resolvedDistance ?? NaN;
          const end_odo = resolvedEndOdo != null
            ? resolvedEndOdo
            : (Number.isFinite(rawDistance) ? start_odo + rawDistance : start_odo);
          const distance = Number.isFinite(rawDistance) ? rawDistance : Math.max(0, end_odo - start_odo);
          if (!Number.isFinite(distance) || distance < 0) {
            skip("validation_error", r, mappedLink, `Neplatná vzdialenosť: ${String(resolvedDistance ?? "")}`);
            continue;
          }
          if (end_odo < start_odo) {
            skip("validation_error", r, mappedLink, `Koncový tachometer (${end_odo}) je menší ako počiatočný (${start_odo}).`);
            continue;
          }

          // Dedup
          if (externalId) {
            const { data: dup, error: dupError } = await supabaseAdmin.from("trips").select("id")
              .eq("company_id", data.companyId).eq("external_source", "commander").eq("external_id", externalId).maybeSingle();
            if (dupError) { skip("insert_error", r, mappedLink, `Kontrola duplicity zlyhala: ${dupError.message}`); continue; }
            if (dup) { skip("duplicate_external_id", r, mappedLink, `external_id ${externalId} už existuje.`); continue; }
          } else if (!data.force) {
            const startLocation = getRideStartLocation(r);
            const endLocation = getRideEndLocation(r);
            let dupQuery = supabaseAdmin.from("trips").select("id")
              .eq("company_id", data.companyId)
              .eq("vehicle_id", mappedLink.faktero_vehicle_id!)
              .eq("trip_date", trip_date)
              .eq("distance_km", distance);
            dupQuery = startLocation === null ? dupQuery.is("start_location", null) : dupQuery.eq("start_location", startLocation);
            dupQuery = endLocation === null ? dupQuery.is("end_location", null) : dupQuery.eq("end_location", endLocation);
            const { data: dup, error: dupError } = await dupQuery.maybeSingle();
            if (dupError) { skip("insert_error", r, mappedLink, `Kontrola fallback duplicity zlyhala: ${dupError.message}`); continue; }
            if (dup) { skip("duplicate_fallback_match", r, mappedLink, "Jazda bez external_id zodpovedá existujúcej jazde podľa vozidla, dátumu, trasy a vzdialenosti."); continue; }
          }

          candidates++;
          const { error } = await supabaseAdmin.from("trips").insert({
            company_id: data.companyId,
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
            average_speed_kmh: duration_seconds && duration_seconds > 0 && Number.isFinite(distance)
              ? Math.round((distance / (duration_seconds / 3600)) * 10) / 10
              : null,
            note: "Importované z Commander GPS",
            external_source: "commander",
            external_id: externalId,
            imported_at: new Date().toISOString(),
            raw_provider_data: r as any,
          });
          if (error) {
            skip("insert_error", r, mappedLink, error.message);
            if (insertErrorSamples.length < 5) insertErrorSamples.push(error.message);
            console.error("[commander] trip insert error", error.message);
            continue;
          }
          imported++;
        }
      }
    } catch (e: any) {
      const msg = e instanceof CommanderAuthError ? "Neplatné prihlasovacie údaje."
        : e instanceof CommanderRateLimitError ? "Commander API limit bol dosiahnutý. Skúste synchronizáciu neskôr."
        : e?.message ?? "Synchronizácia jázd zlyhala.";
      const duplicateTotal = skippedBreakdown.duplicate_external_id + skippedBreakdown.duplicate_fallback_match;
      const skippedTotal = Object.values(skippedBreakdown).reduce((sum, count) => sum + count, 0);
      console.log("[commander] ride sync summary", {
        company_id: data.companyId,
        fetched_rides_count: fetched,
        candidate_rides_count: candidates,
        inserted_trips_count: imported,
        skipped_breakdown: skippedBreakdown,
      });
      await logSync(data.companyId, "rides", "error", msg, {
        fetched_rides_count: fetched,
        candidate_rides_count: candidates,
        inserted_trips_count: imported,
        skipped_rides_count: skippedTotal,
        skipped_duplicates: duplicateTotal,
        skipped_unlinked_vehicle: skippedBreakdown.vehicle_not_linked,
        validation_errors: skippedBreakdown.validation_error,
        insert_errors: skippedBreakdown.insert_error,
        missing_vehicle_mapping: skippedBreakdown.missing_vehicle_mapping,
        duplicate_external_id: skippedBreakdown.duplicate_external_id,
        duplicate_fallback_match: skippedBreakdown.duplicate_fallback_match,
        skipped_breakdown: skippedBreakdown,
        skipped_rides: skippedRides,
        insert_error_samples: insertErrorSamples,
        sample_rides: sampleRides,
        raw_ride_sample_full: rawRideSampleFull,
      });
      await supabaseAdmin.from("commander_connections").update({
        sync_status: "error", error_message: msg, last_sync_at: new Date().toISOString(),
      }).eq("company_id", data.companyId);
      return { ok: false, error: msg, imported, duplicates: duplicateTotal, unlinked: skippedBreakdown.vehicle_not_linked, errors: skippedBreakdown.validation_error + skippedBreakdown.insert_error, fetched };
    }

    const duplicateTotal = skippedBreakdown.duplicate_external_id + skippedBreakdown.duplicate_fallback_match;
    const skippedTotal = Object.values(skippedBreakdown).reduce((sum, count) => sum + count, 0);
    console.log("[commander] ride sync summary", {
      company_id: data.companyId,
      fetched_rides_count: fetched,
      candidate_rides_count: candidates,
      inserted_trips_count: imported,
      skipped_breakdown: skippedBreakdown,
    });
    const errorTotal = skippedBreakdown.validation_error + skippedBreakdown.insert_error;
    const msg = `Načítané z Commanderu: ${fetched} · Importované do knihy jázd: ${imported} · Duplicity preskočené: ${duplicateTotal} · Vozidlá bez prepojenia: ${skippedBreakdown.vehicle_not_linked} · Chyby: ${errorTotal}`;
    await logSync(data.companyId, "rides", "ok", msg, {
      fetched_rides_count: fetched,
      candidate_rides_count: candidates,
      inserted_trips_count: imported,
      skipped_rides_count: skippedTotal,
      skipped_duplicates: duplicateTotal,
      skipped_unlinked_vehicle: skippedBreakdown.vehicle_not_linked,
      validation_errors: skippedBreakdown.validation_error,
      insert_errors: skippedBreakdown.insert_error,
      missing_vehicle_mapping: skippedBreakdown.missing_vehicle_mapping,
      duplicate_external_id: skippedBreakdown.duplicate_external_id,
      duplicate_fallback_match: skippedBreakdown.duplicate_fallback_match,
      skipped_breakdown: skippedBreakdown,
      skipped_rides: skippedRides,
      insert_error_samples: insertErrorSamples,
        sample_rides: sampleRides,
        raw_ride_sample_full: rawRideSampleFull,
    });
    await supabaseAdmin.from("commander_connections").update({
      sync_status: "ok", error_message: null, last_sync_at: new Date().toISOString(),
    }).eq("company_id", data.companyId);
    return { ok: true, imported, duplicates: duplicateTotal, unlinked: skippedBreakdown.vehicle_not_linked, errors: skippedBreakdown.validation_error + skippedBreakdown.insert_error, fetched, message: msg };
  });