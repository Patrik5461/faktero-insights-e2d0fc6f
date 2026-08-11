import { createFileRoute } from "@tanstack/react-router";
import { zasifrujBankToken } from "@/lib/faktero/bank-tokens.server";

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

        // Platby chodia na ten istý redirect_uri ako súhlasy — TB prijme len
        // adresy zaregistrované v portáli, tak ich nerozmnožujeme. Rozlišuje
        // sa podľa `state`, ktorý si nastavujeme sami.
        const { PAYMENT_STATE_PREFIX } =
          await import("@/lib/faktero/tatrabanka-payments.functions");
        if (state.startsWith(PAYMENT_STATE_PREFIX)) {
          return handlePaymentCallback(code, state.slice(PAYMENT_STATE_PREFIX.length), origin);
        }

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
              // Tokeny do banky sa ukladajú šifrované — pozri `bank-tokens.server`.
              access_token: zasifrujBankToken(tokens.access_token),
              refresh_token: zasifrujBankToken(tokens.refresh_token ?? null),
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

/**
 * Dokončenie platby po podpise v banke.
 *
 * Podpis sám o sebe platbu nevykoná — zostala by v ACTC a v aplikácii by
 * pritom vyzerala ako hotová. Vykoná ju až PUT na authorizations, ktorý tu
 * voláme tokenom vymeneným za autorizačný kód.
 */
async function handlePaymentCallback(
  code: string,
  paymentRowId: string,
  origin: string,
): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("bank_payments")
    .select("id, purchase_invoice_id, payment_id, authorization_id, metadata, status")
    .eq("id", paymentRowId)
    .maybeSingle();

  const back = (params: string) =>
    redirect(
      row?.purchase_invoice_id
        ? `${origin}/prijate-faktury/${row.purchase_invoice_id}?${params}`
        : `${origin}/prijate-faktury?${params}`,
    );

  if (!row) return redirect(`${origin}/prijate-faktury?platba_chyba=invalid_state`);
  const meta = (row.metadata as any) ?? {};
  const verifier = meta.pkce_code_verifier as string | undefined;
  if (!verifier || !row.payment_id || !row.authorization_id) {
    return back("platba_chyba=missing_code_verifier");
  }

  try {
    const { getRedirectUri } = await import("@/lib/faktero/tatrabanka.server");
    const { exchangePaymentCode, submitPayment } =
      await import("@/lib/faktero/tatrabanka-payments.server");

    const token = await exchangePaymentCode(code, getRedirectUri(origin), verifier);
    // Verifier je jednorazový — zahoď ho hneď, nech sa kód nedá použiť znova.
    await supabaseAdmin
      .from("bank_payments")
      .update({
        status: "authorized",
        sca_status: "unconfirmed",
        metadata: { ...meta, pkce_code_verifier: null },
      })
      .eq("id", row.id);

    const result = await submitPayment(row.payment_id, row.authorization_id, token);
    const done = ["ACSC", "ACCC"].includes(result.transactionStatus);
    const rejected = result.transactionStatus === "RJCT";
    await supabaseAdmin
      .from("bank_payments")
      .update({
        transaction_status: result.transactionStatus,
        sca_status: "finalised",
        status: rejected ? "rejected" : "submitted",
        error_message: rejected ? "Banka platbu zamietla" : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    // Za zaplatenú považujeme faktúru až po zúčtovaní. ACSP znamená, že sa
    // platba ešte spracováva, PDNG že čaká na dátum splatnosti.
    if (done && row.purchase_invoice_id) {
      await supabaseAdmin
        .from("purchase_invoices")
        .update({ status: "paid", payment_date: new Date().toISOString().slice(0, 10) })
        .eq("id", row.purchase_invoice_id);
    }
    return back(`platba=${encodeURIComponent(result.transactionStatus)}`);
  } catch (e: any) {
    console.error("[tatrabanka platba]", e);
    await supabaseAdmin
      .from("bank_payments")
      .update({
        status: "failed",
        error_message: String(e?.message ?? "submit_failed").slice(0, 500),
        metadata: { ...meta, pkce_code_verifier: null },
      })
      .eq("id", row.id);
    return back(`platba_chyba=${encodeURIComponent(e?.message ?? "submit_failed")}`);
  }
}
