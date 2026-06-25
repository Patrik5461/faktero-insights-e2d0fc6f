import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tatrabanka/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const origin = `${url.protocol}//${url.host}`;
        const back = `${origin}/bankove-ucty`;
        if (error) return redirect(`${back}?error=${encodeURIComponent(error)}`);
        if (!code || !state) return redirect(`${back}?error=missing_code`);
        try {
          const { exchangeCodeForToken, getRedirectUri } = await import("@/lib/faktero/tatrabanka.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: conn } = await supabaseAdmin
            .from("bank_connections").select("id, company_id, status")
            .eq("id", state).maybeSingle();
          if (!conn) return redirect(`${back}?error=invalid_state`);
          const tokens = await exchangeCodeForToken(code, getRedirectUri(origin));
          const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
          await supabaseAdmin.from("bank_connections").update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? null,
            token_expires_at: expiresAt,
            consent_id: tokens.consent_id ?? null,
            status: "connected",
          }).eq("id", conn.id);
          // Best-effort initial accounts sync
          try {
            const { fetchAccounts } = await import("@/lib/faktero/tatrabanka.server");
            const accounts = await fetchAccounts(tokens.access_token, tokens.consent_id ?? null);
            for (const a of accounts) {
              await supabaseAdmin.from("bank_accounts").insert({
                company_id: conn.company_id, bank_connection_id: conn.id,
                external_account_id: a.external_account_id, iban: a.iban,
                account_name: a.account_name, currency: a.currency, balance: a.balance,
                last_synced_at: new Date().toISOString(),
              });
            }
          } catch (e) { console.error("[tatrabanka] initial accounts sync failed", e); }
          return redirect(`${back}?connected=1`);
        } catch (e: any) {
          console.error("[tatrabanka callback]", e);
          return redirect(`${back}?error=${encodeURIComponent(e?.message ?? "callback_failed")}`);
        }
      },
    },
  },
});

function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { Location: to } });
}