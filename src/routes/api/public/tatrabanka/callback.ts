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
          const { exchangeCodeForToken, getRedirectUri } =
            await import("@/lib/faktero/tatrabanka.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: conn } = await supabaseAdmin
            .from("bank_connections")
            .select("id, company_id, status, consent_id, metadata")
            .eq("id", state)
            .maybeSingle();
          if (!conn) return redirect(`${back}?error=invalid_state`);
          // PKCE verifier odložený pri štarte flowu — bez neho TB kód nevymení.
          const verifier = (conn.metadata as any)?.pkce_code_verifier as string | undefined;
          if (!verifier) return redirect(`${back}?error=missing_code_verifier`);
          const tokens = await exchangeCodeForToken(code, getRedirectUri(origin), verifier);
          const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
          const meta = (conn.metadata as any) ?? {};
          // Pri obnove súhlasu je nový consent odložený v metadata; pri prvom
          // pripojení je rovno na pripojení.
          const newConsentId =
            tokens.consent_id ?? meta.pending_consent_id ?? conn.consent_id ?? null;
          await supabaseAdmin
            .from("bank_connections")
            .update({
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token ?? null,
              token_expires_at: expiresAt,
              // consent_id vznikol pred redirectom; token ho už nevracia.
              consent_id: newConsentId,
              status: "connected",
              // verifier aj odložený consent sú jednorazové — nenechávaj ich v DB
              metadata: { ...meta, pkce_code_verifier: null, pending_consent_id: null },
            })
            .eq("id", conn.id);

          // Starý súhlas po úspešnej obnove v banke zrušíme, nech tam nevisí.
          const oldConsent = meta.previous_consent_id as string | undefined;
          if (oldConsent && oldConsent !== newConsentId) {
            try {
              const { revokeConsent } = await import("@/lib/faktero/tatrabanka.server");
              await revokeConsent(oldConsent);
            } catch (e) {
              console.warn("[tatrabanka] starý súhlas sa nepodarilo zrušiť", e);
            }
          }
          // Best-effort initial accounts sync
          try {
            const { fetchAccounts, upsertBankAccounts } =
              await import("@/lib/faktero/tatrabanka.server");
            const accounts = await fetchAccounts(tokens.access_token, newConsentId);
            // Párovanie podľa IBAN — pri obnove súhlasu tie isté účty už existujú
            // a visia na nich transakcie aj výpisy.
            await upsertBankAccounts(conn.company_id, conn.id, accounts);
          } catch (e) {
            console.error("[tatrabanka] initial accounts sync failed", e);
          }
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
