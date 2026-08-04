import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(context: any) {
  const { data } = await context.supabase
    .from("platform_admins")
    .select("role")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const getGoogleSeoStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { getConnection } = await import("./google-seo.server");
    const gsc = await getConnection("gsc");
    const ga4 = await getConnection("ga4");
    const strip = (c: any) =>
      c
        ? {
            type: c.type,
            property_id: c.property_id,
            connected_at: c.connected_at,
            expires_at: c.expires_at,
            has_refresh: !!c.refresh_token_enc,
          }
        : null;
    return { gsc: strip(gsc), ga4: strip(ga4) };
  });

export const getGoogleSeoAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ type: z.enum(["gsc", "ga4"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { buildAuthorizeUrl } = await import("./google-seo.server");
    return { url: buildAuthorizeUrl(data.type) };
  });

export const disconnectGoogleSeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ type: z.enum(["gsc", "ga4"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("google_seo_connections" as any)
      .delete()
      .eq("type", data.type);
    if (error) throw error;
    return { ok: true };
  });

export const listGscSitesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { listGscSites } = await import("./google-seo.server");
    return listGscSites();
  });

export const listGa4PropertiesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { listGa4Properties } = await import("./google-seo.server");
    return listGa4Properties();
  });

export const setGoogleSeoProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ type: z.enum(["gsc", "ga4"]), property_id: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("google_seo_connections" as any)
      .update({ property_id: data.property_id, updated_at: new Date().toISOString() })
      .eq("type", data.type);
    if (error) throw error;
    // clear cache for that type
    const { invalidateCache } = await import("./google-seo.server");
    await invalidateCache(`${data.type}:`);
    return { ok: true };
  });

export const getGscOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ force: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getConnection, gscOverview, getCached, setCached } =
      await import("./google-seo.server");
    const conn = await getConnection("gsc");
    if (!conn?.property_id) return { connected: !!conn, missingProperty: true } as any;
    const key = `gsc:overview:${conn.property_id}`;
    if (!data.force) {
      const cached = await getCached<any>(key);
      if (cached) return { ...cached, cached: true };
    }
    const out = await gscOverview(conn.property_id);
    await setCached(key, out, 3600);
    return { ...out, cached: false };
  });

export const getGa4Overview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ force: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getConnection, ga4Overview, getCached, setCached } =
      await import("./google-seo.server");
    const conn = await getConnection("ga4");
    if (!conn?.property_id) return { connected: !!conn, missingProperty: true } as any;
    // property_id stored as "properties/12345" or bare number — normalize
    const pid = String(conn.property_id).replace(/^properties\//, "");
    const key = `ga4:overview:${pid}`;
    if (!data.force) {
      const cached = await getCached<any>(key);
      if (cached) return { ...cached, cached: true };
    }
    const out = await ga4Overview(pid);
    await setCached(key, out, 3600);
    return { ...out, cached: false };
  });

export const requestIndexingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ url: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { requestIndexing } = await import("./google-seo.server");
    return requestIndexing(data.url);
  });
