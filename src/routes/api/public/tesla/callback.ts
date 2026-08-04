import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tesla/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const origin = `${url.protocol}//${url.host}`;
        const back = `${origin}/jazdy/integracie/tesla`;
        if (error) return redirect(`${back}?error=${encodeURIComponent(error)}`);
        if (!code || !state) return redirect(`${back}?error=missing_code`);
        try {
          const { exchangeTeslaCode } = await import("@/lib/faktero/tesla.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { encryptSecret } = await import("@/lib/faktero/payment-crypto.server");

          const { data: conn } = await supabaseAdmin
            .from("tesla_connections")
            .select("id, company_id")
            .eq("id", state)
            .maybeSingle();
          if (!conn) return redirect(`${back}?error=invalid_state`);

          const tokens = await exchangeTeslaCode(code);
          let email: string | null = null;
          try {
            if (tokens.id_token) {
              const part = tokens.id_token.split(".")[1];
              if (part) {
                const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
                const json = JSON.parse(
                  Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
                    "utf8",
                  ),
                );
                email = json?.email ?? null;
              }
            }
          } catch {
            /* ignore */
          }

          const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
          await supabaseAdmin
            .from("tesla_connections")
            .update({
              encrypted_access_token: encryptSecret(tokens.access_token),
              encrypted_refresh_token: encryptSecret(tokens.refresh_token),
              token_expires_at: expiresAt,
              tesla_account_email: email,
              sync_status: "connected",
              error_message: null,
              enabled: true,
            })
            .eq("id", conn.id);

          return redirect(`${back}?connected=1`);
        } catch (e: any) {
          console.error("[tesla callback]", e);
          return redirect(`${back}?error=${encodeURIComponent(e?.message ?? "callback_failed")}`);
        }
      },
    },
  },
});

function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { Location: to } });
}
