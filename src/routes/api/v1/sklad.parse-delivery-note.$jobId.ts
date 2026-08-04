import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
};
const jsonHeaders = { "content-type": "application/json; charset=utf-8", ...corsHeaders };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

export const Route = createFileRoute("/api/v1/sklad/parse-delivery-note/$jobId")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request, params }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          if (!auth.toLowerCase().startsWith("bearer "))
            return json(401, { error: "missing_token" });
          const token = auth.slice(7).trim();
          if (!token) return json(401, { error: "missing_token" });

          const SUPABASE_URL = process.env.SUPABASE_URL;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)
            return json(500, { error: "supabase_not_configured" });

          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          // RLS restricts to company members.
          const { data: job, error } = await supabase
            .from("delivery_parse_jobs")
            .select("id, status, result, error_message, created_at")
            .eq("id", params.jobId)
            .maybeSingle();
          if (error) return json(500, { error: "query_failed", message: error.message });
          if (!job) return json(404, { error: "not_found" });

          const result = (job.result ?? {}) as any;
          return json(200, {
            status: job.status,
            items: result.items ?? null,
            supplier: result.supplier ?? null,
            delivery_number: result.delivery_number ?? null,
            error_message: job.error_message ?? null,
          });
        } catch (e: any) {
          return json(500, { error: "internal_error", message: e?.message ?? String(e) });
        }
      },
    },
  },
});
