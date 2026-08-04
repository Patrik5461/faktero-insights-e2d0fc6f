import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only export bundle for migrating to a self-hosted Supabase project.
 * Returns:
 *   - users:     all auth.users records (id, email, phone, metadata, created_at, email_confirmed_at, providers)
 *   - storage:   per-bucket list of objects with short-lived signed download URLs
 *
 * Public-schema data should be exported separately via psql/CSV (no need to ship MBs through this fn).
 */
export const exportMigrationBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: adminErr } = await context.supabase.rpc("is_platform_admin", {
      _user_id: context.userId,
    });
    if (adminErr) throw new Error(`admin check failed: ${adminErr.message}`);
    if (!isAdmin) throw new Error("Forbidden: platform admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // ---- Auth users (paginated) ----
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const users: any[] = [];
    let page = 1;
    const perPage = 1000;
    // listUsers returns at most ~1000 per page
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(`listUsers page ${page}: ${error.message}`);
      if (!data?.users?.length) break;
      for (const u of data.users) {
        users.push({
          id: u.id,
          email: u.email ?? null,
          phone: u.phone ?? null,
          email_confirmed_at: u.email_confirmed_at ?? null,
          phone_confirmed_at: u.phone_confirmed_at ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          user_metadata: u.user_metadata ?? {},
          app_metadata: u.app_metadata ?? {},
          identities: u.identities ?? [],
        });
      }
      if (data.users.length < perPage) break;
      page += 1;
    }

    // ---- Storage objects per bucket ----
    const buckets = ["invoice-pdfs", "company-logos", "imports", "efaktura-xml"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage: Record<string, any[]> = {};

    async function listAll(
      bucket: string,
      prefix = "",
    ): Promise<Array<{ path: string; size: number | null; mimetype: string | null }>> {
      const out: Array<{ path: string; size: number | null; mimetype: string | null }> = [];
      let offset = 0;
      const limit = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabaseAdmin.storage
          .from(bucket)
          .list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
        if (!data || data.length === 0) break;
        for (const entry of data) {
          const full = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.id === null) {
            // folder
            const nested = await listAll(bucket, full);
            out.push(...nested);
          } else {
            out.push({
              path: full,
              size: (entry.metadata as { size?: number } | null)?.size ?? null,
              mimetype: (entry.metadata as { mimetype?: string } | null)?.mimetype ?? null,
            });
          }
        }
        if (data.length < limit) break;
        offset += limit;
      }
      return out;
    }

    for (const bucket of buckets) {
      const objects = await listAll(bucket);
      const withUrls: Array<{
        path: string;
        size: number | null;
        mimetype: string | null;
        signedUrl: string;
      }> = [];
      // Sign in batches of 100
      for (let i = 0; i < objects.length; i += 100) {
        const slice = objects.slice(i, i + 100);
        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from(bucket)
          .createSignedUrls(
            slice.map((o) => o.path),
            60 * 60 * 6,
          ); // 6 hours
        if (signErr) throw new Error(`sign ${bucket}: ${signErr.message}`);
        for (let j = 0; j < slice.length; j += 1) {
          const s = signed?.[j];
          if (!s?.signedUrl) continue;
          withUrls.push({ ...slice[j], signedUrl: s.signedUrl });
        }
      }
      storage[bucket] = withUrls;
    }

    return {
      exportedAt: new Date().toISOString(),
      counts: {
        users: users.length,
        storage: Object.fromEntries(Object.entries(storage).map(([k, v]) => [k, v.length])),
      },
      users,
      storage,
    };
  });
