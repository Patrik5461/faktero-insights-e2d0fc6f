import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Stable URL: /api/admin/migration-export  (POST, Authorization: Bearer <user JWT>)
// Requires the caller to be a platform admin. Returns the full migration bundle
// (auth users + storage object list with 6h signed download URLs).
export const Route = createFileRoute("/api/admin/migration-export")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "missing bearer token" }), { status: 401, headers: { "content-type": "application/json" } });
        }
        const token = authHeader.slice(7);

        const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response(JSON.stringify({ error: "invalid token" }), { status: 401, headers: { "content-type": "application/json" } });
        }
        const userId = claims.claims.sub;

        const { data: isAdmin, error: adminErr } = await userClient.rpc("is_platform_admin", { _user_id: userId });
        if (adminErr) {
          return new Response(JSON.stringify({ error: `admin check failed: ${adminErr.message}` }), { status: 500, headers: { "content-type": "application/json" } });
        }
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: "forbidden: platform admin only" }), { status: 403, headers: { "content-type": "application/json" } });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ---- Auth users ----
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const users: any[] = [];
        let page = 1;
        const perPage = 1000;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
          if (error) {
            return new Response(JSON.stringify({ error: `listUsers page ${page}: ${error.message}` }), { status: 500, headers: { "content-type": "application/json" } });
          }
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

        // ---- Storage ----
        const buckets = ["invoice-pdfs", "company-logos", "imports", "efaktura-xml"];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const storage: Record<string, any[]> = {};

        async function listAll(bucket: string, prefix = ""): Promise<Array<{ path: string; size: number | null; mimetype: string | null }>> {
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

        try {
          for (const bucket of buckets) {
            const objects = await listAll(bucket);
            const withUrls: Array<{ path: string; size: number | null; mimetype: string | null; signedUrl: string }> = [];
            for (let i = 0; i < objects.length; i += 100) {
              const slice = objects.slice(i, i + 100);
              const { data: signed, error: signErr } = await supabaseAdmin.storage
                .from(bucket)
                .createSignedUrls(slice.map((o) => o.path), 60 * 60 * 6);
              if (signErr) throw new Error(`sign ${bucket}: ${signErr.message}`);
              for (let j = 0; j < slice.length; j += 1) {
                const s = signed?.[j];
                if (!s?.signedUrl) continue;
                withUrls.push({ ...slice[j], signedUrl: s.signedUrl });
              }
            }
            storage[bucket] = withUrls;
          }
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { "content-type": "application/json" } });
        }

        return new Response(
          JSON.stringify({
            exportedAt: new Date().toISOString(),
            counts: {
              users: users.length,
              storage: Object.fromEntries(Object.entries(storage).map(([k, v]) => [k, v.length])),
            },
            users,
            storage,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});