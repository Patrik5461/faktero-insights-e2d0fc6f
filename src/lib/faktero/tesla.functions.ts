import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function maskEmail(e?: string | null) {
  if (!e) return null;
  const [u, d] = e.split("@");
  if (!d) return "•••";
  return (u.slice(0, 2) || "•") + "•••@" + d;
}

async function assertAdmin(ctx: any, companyId: string) {
  const { data: ok } = await ctx.supabase.rpc("is_company_admin", {
    _company_id: companyId,
    _user_id: ctx.userId,
  });
  if (!ok) throw new Error("Nemáte oprávnenie meniť Tesla integráciu.");
}

async function logSync(
  companyId: string,
  sync_type: string,
  status: string,
  message?: string,
  raw?: any,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    await supabaseAdmin.from("tesla_sync_logs").insert({
      company_id: companyId,
      sync_type,
      status,
      message: message ?? null,
      raw_response: raw ?? null,
    });
  } catch (e) {
    console.error("[tesla-log]", e);
  }
}

export const getTeslaStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { canDecryptSecret } = await import("./payment-crypto.server");
    const { data: row } = await supabase
      .from("tesla_connections")
      .select(
        "id, enabled, tesla_account_email, token_expires_at, last_sync_at, sync_status, error_message, updated_at",
      )
      .eq("company_id", data.companyId)
      .maybeSingle();
    let credentials_invalid = false;
    if (row) {
      const { data: sec } = await supabaseAdmin
        .from("tesla_connections")
        .select("encrypted_access_token, encrypted_refresh_token")
        .eq("company_id", data.companyId)
        .maybeSingle();
      const hasTokens = !!(sec?.encrypted_access_token || sec?.encrypted_refresh_token);
      if (hasTokens) {
        const okA = sec?.encrypted_access_token
          ? canDecryptSecret(sec.encrypted_access_token)
          : true;
        const okR = sec?.encrypted_refresh_token
          ? canDecryptSecret(sec.encrypted_refresh_token)
          : true;
        credentials_invalid = !(okA && okR);
      }
    }
    const { data: links } = await supabase
      .from("tesla_vehicle_links")
      .select(
        "id, tesla_vehicle_id, tesla_vin, tesla_display_name, tesla_license_plate, faktero_vehicle_id, last_synced_at",
      )
      .eq("company_id", data.companyId)
      .order("tesla_display_name", { ascending: true });
    const { data: logs } = await supabase
      .from("tesla_sync_logs")
      .select("id, sync_type, status, message, created_at, raw_response")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(20);
    const { data: snaps } = await supabase
      .from("tesla_vehicle_snapshots")
      .select("id, tesla_vehicle_id, captured_at, odometer_km, latitude, longitude, shift_state")
      .eq("company_id", data.companyId)
      .order("captured_at", { ascending: false })
      .limit(50);
    return {
      connection: row
        ? {
            ...row,
            email_masked: maskEmail(row.tesla_account_email),
            tesla_account_email: undefined,
            credentials_invalid,
          }
        : null,
      credentials_invalid,
      links: links ?? [],
      logs: logs ?? [],
      snapshots: snaps ?? [],
    };
  });

export const startTeslaOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getTeslaAuthUrl } = await import("./tesla.server");
    // Create or reuse a pending connection row; its id is used as OAuth state.
    const { data: existing } = await supabaseAdmin
      .from("tesla_connections")
      .select("id")
      .eq("company_id", data.companyId)
      .maybeSingle();
    let id = existing?.id as string | undefined;
    if (!id) {
      const { data: ins, error } = await supabaseAdmin
        .from("tesla_connections")
        .insert({
          company_id: data.companyId,
          user_id: context.userId,
          enabled: true,
          sync_status: "pending",
        })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      id = ins!.id as string;
    }
    const url = getTeslaAuthUrl(id!);
    return { url };
  });

export const disconnectTesla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { odpojIntegraciu } = await import("./integracie-odpojenie.server");
    const upratane = await odpojIntegraciu(data.companyId, "tesla_vehicle_links");
    await supabaseAdmin.from("tesla_connections").delete().eq("company_id", data.companyId);
    return { ok: true, ...upratane };
  });

async function loadValidAccessToken(companyId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptSecret, encryptSecret } = await import("./payment-crypto.server");
  const { refreshTeslaToken } = await import("./tesla.server");
  const { data: row } = await supabaseAdmin
    .from("tesla_connections")
    .select("id, encrypted_access_token, encrypted_refresh_token, token_expires_at, enabled")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!row) throw new Error("Tesla nie je pripojená.");
  if (!row.encrypted_access_token || !row.encrypted_refresh_token)
    throw new Error("Tesla tokeny chýbajú. Pripojte účet znovu.");
  const exp = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  // Refresh if expires in <60s
  if (!exp || exp - Date.now() < 60_000) {
    const refreshed = await refreshTeslaToken(decryptSecret(row.encrypted_refresh_token));
    const newExpires = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
    await supabaseAdmin
      .from("tesla_connections")
      .update({
        encrypted_access_token: encryptSecret(refreshed.access_token),
        encrypted_refresh_token: encryptSecret(
          refreshed.refresh_token ?? decryptSecret(row.encrypted_refresh_token),
        ),
        token_expires_at: newExpires,
      })
      .eq("id", row.id);
    return refreshed.access_token;
  }
  return decryptSecret(row.encrypted_access_token);
}

export const syncTeslaVehicles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listTeslaVehicles, TeslaAuthError } = await import("./tesla.server");
    let vehicles: any[];
    try {
      const token = await loadValidAccessToken(data.companyId);
      vehicles = await listTeslaVehicles(token);
    } catch (e: any) {
      const { isDecryptError } = await import("./payment-crypto.server");
      if (isDecryptError(e)) {
        const msg =
          "Tesla prihlasovacie údaje je potrebné znova pripojiť. Toto sa stáva po zmene bezpečnostného kľúča systému. Pripojte prosím Tesla účet znovu.";
        await logSync(data.companyId, "vehicles", "error", msg);
        await supabaseAdmin
          .from("tesla_connections")
          .update({
            sync_status: "error",
            error_message: msg,
            last_sync_at: new Date().toISOString(),
          })
          .eq("company_id", data.companyId);
        return { ok: false, error: msg, needs_reauth: true };
      }
      const msg =
        e instanceof TeslaAuthError
          ? "Tesla token vypršal. Pripojte účet znovu."
          : (e?.message ?? "Synchronizácia vozidiel zlyhala.");
      await logSync(data.companyId, "vehicles", "error", msg);
      await supabaseAdmin
        .from("tesla_connections")
        .update({
          sync_status: "error",
          error_message: msg,
          last_sync_at: new Date().toISOString(),
        })
        .eq("company_id", data.companyId);
      return { ok: false, error: msg, needs_reauth: e instanceof TeslaAuthError };
    }

    const { data: faktVehicles } = await supabaseAdmin
      .from("vehicles")
      .select("id, name, license_plate")
      .eq("company_id", data.companyId);
    const byPlate = new Map<string, string>();
    const byName = new Map<string, string>();
    (faktVehicles ?? []).forEach((v: any) => {
      if (v.license_plate)
        byPlate.set(String(v.license_plate).toUpperCase().replace(/\s+/g, ""), v.id);
      if (v.name) byName.set(String(v.name).toLowerCase().trim(), v.id);
    });

    let count = 0;
    for (const tv of vehicles) {
      const tid = String(tv.id ?? tv.vehicle_id ?? tv.vin);
      const vin = tv.vin ?? null;
      const name = (tv.display_name ?? vin ?? `Tesla ${tid}`).toString();
      let faktero_vehicle_id: string | null = null;
      if (name) faktero_vehicle_id = byName.get(name.toLowerCase().trim()) ?? null;
      if (!faktero_vehicle_id) {
        const { data: ins } = await supabaseAdmin
          .from("vehicles")
          .insert({
            company_id: data.companyId,
            name,
            license_plate: vin ? vin.slice(-6) : null,
            fuel_type: "electric",
            vehicle_type: "osobné",
            initial_odometer: 0,
            active: true,
          })
          .select("id")
          .maybeSingle();
        if (ins?.id) faktero_vehicle_id = ins.id;
      }
      await supabaseAdmin.from("tesla_vehicle_links").upsert(
        {
          company_id: data.companyId,
          tesla_vehicle_id: tid,
          tesla_vin: vin,
          tesla_display_name: name,
          tesla_license_plate: null,
          faktero_vehicle_id,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "company_id,tesla_vehicle_id" },
      );
      count++;
    }

    await supabaseAdmin
      .from("tesla_connections")
      .update({
        sync_status: "ok",
        error_message: null,
        last_sync_at: new Date().toISOString(),
      })
      .eq("company_id", data.companyId);
    const msg = `Synchronizovaných ${count} vozidiel z Tesla účtu.`;
    await logSync(data.companyId, "vehicles", "ok", msg, { count });
    return { ok: true, count, message: msg };
  });

export const linkTeslaVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string; linkId: string; faktero_vehicle_id: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tesla_vehicle_links")
      .update({ faktero_vehicle_id: data.faktero_vehicle_id })
      .eq("id", data.linkId)
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const syncTeslaSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      getTeslaVehicleData,
      extractOdometerKm,
      extractLatLng,
      extractShiftState,
      TeslaAuthError,
    } = await import("./tesla.server");

    const { data: conn } = await supabaseAdmin
      .from("tesla_connections")
      .select("id")
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (!conn) return { ok: false, error: "Tesla nie je pripojená." };

    const { data: links } = await supabaseAdmin
      .from("tesla_vehicle_links")
      .select("id, tesla_vehicle_id, tesla_vin, faktero_vehicle_id")
      .eq("company_id", data.companyId);
    if (!links?.length) return { ok: false, error: "Najprv synchronizujte vozidlá." };

    let token: string;
    try {
      token = await loadValidAccessToken(data.companyId);
    } catch (e: any) {
      const msg = e?.message ?? "Token chyba.";
      await logSync(data.companyId, "snapshots", "error", msg);
      return { ok: false, error: msg };
    }

    let stored = 0,
      errors = 0;
    for (const l of links) {
      try {
        const v = await getTeslaVehicleData(token, l.tesla_vehicle_id);
        if (!v) continue;
        const odo = extractOdometerKm(v);
        const { lat, lng } = extractLatLng(v);
        await supabaseAdmin.from("tesla_vehicle_snapshots").insert({
          company_id: data.companyId,
          tesla_connection_id: conn.id,
          tesla_vehicle_id: l.tesla_vehicle_id,
          faktero_vehicle_id: l.faktero_vehicle_id,
          captured_at: new Date().toISOString(),
          odometer_km: odo,
          latitude: lat,
          longitude: lng,
          shift_state: extractShiftState(v),
          drive_state: v?.drive_state ?? null,
          raw_data: {
            vehicle_state: v?.vehicle_state ?? null,
            drive_state: v?.drive_state ?? null,
          },
        });
        stored++;
      } catch (e: any) {
        errors++;
        if (e instanceof TeslaAuthError) {
          await logSync(data.companyId, "snapshots", "error", "Tesla token vypršal.");
          return { ok: false, error: "Tesla token vypršal. Pripojte účet znovu." };
        }
        console.error("[tesla] snapshot failed", l.tesla_vehicle_id, e);
      }
    }
    await supabaseAdmin
      .from("tesla_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: errors ? "partial" : "ok",
      })
      .eq("company_id", data.companyId);
    const msg = `Uložených ${stored} snímok${errors ? `, ${errors} chýb` : ""}.`;
    await logSync(data.companyId, "snapshots", errors ? "partial" : "ok", msg, { stored, errors });
    return { ok: true, stored, errors, message: msg };
  });
