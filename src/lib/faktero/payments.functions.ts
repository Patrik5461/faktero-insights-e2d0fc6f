import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { zostavaUhradit } from "./zaloha";

/** Public view of a provider config (NO secret values). */
export const getMyPaymentProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("company_payment_providers")
      .select(
        "id, provider, enabled, sandbox_mode, goid, client_id, connected_at, last_test_at, last_test_ok, last_test_error, updated_at",
      )
      .eq("company_id", data.companyId)
      .eq("provider", "gopay")
      .maybeSingle();
    // also return company toggle
    const { data: co } = await supabase
      .from("companies")
      .select("online_payments_enabled")
      .eq("id", data.companyId)
      .maybeSingle();
    return { provider: row, onlinePaymentsEnabled: !!co?.online_payments_enabled };
  });

const SaveSchema = z.object({
  companyId: z.string().uuid(),
  goid: z.string().trim().min(1).max(64).regex(/^\d+$/, "GoID musí byť číslo"),
  client_id: z.string().trim().min(1).max(128),
  client_secret: z.string().trim().min(1).max(256).optional(), // optional → keep existing
  sandbox_mode: z.boolean(),
  enabled: z.boolean(),
});

export const savePaymentProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_company_admin", {
      _company_id: data.companyId,
      _user_id: userId,
    });
    if (!isAdmin) throw new Error("Nemáte oprávnenie meniť nastavenia platieb.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptSecret } = await import("./payment-crypto.server");
    const { randomBytes } = await import("crypto");

    const { data: existing } = await supabaseAdmin
      .from("company_payment_providers")
      .select("id, encrypted_client_secret, webhook_secret")
      .eq("company_id", data.companyId)
      .eq("provider", "gopay")
      .maybeSingle();

    const encrypted = data.client_secret
      ? encryptSecret(data.client_secret)
      : (existing?.encrypted_client_secret ?? null);
    if (!encrypted) throw new Error("Client Secret je povinný.");

    const webhookSecret = existing?.webhook_secret ?? randomBytes(24).toString("hex");

    const patch = {
      company_id: data.companyId,
      provider: "gopay",
      enabled: data.enabled,
      sandbox_mode: data.sandbox_mode,
      goid: data.goid,
      client_id: data.client_id,
      encrypted_client_secret: encrypted,
      webhook_secret: webhookSecret,
      connected_at: existing ? undefined : new Date().toISOString(),
    };
    if (existing) {
      await supabaseAdmin.from("company_payment_providers").update(patch).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("company_payment_providers").insert(patch);
    }
    await supabaseAdmin.from("platform_audit_logs").insert({
      admin_user_id: userId,
      action: "payment_provider_save",
      entity_type: "company",
      entity_id: data.companyId,
      metadata: { provider: "gopay", sandbox: data.sandbox_mode, enabled: data.enabled } as any,
    });
    return { ok: true };
  });

export const testPaymentProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_company_admin", {
      _company_id: data.companyId,
      _user_id: userId,
    });
    if (!isAdmin) throw new Error("Nemáte oprávnenie.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptSecret } = await import("./payment-crypto.server");
    const { merchantTestConnection } = await import("./payments-gopay.server");
    const { data: row } = await supabaseAdmin
      .from("company_payment_providers")
      .select("goid, client_id, encrypted_client_secret, sandbox_mode")
      .eq("company_id", data.companyId)
      .eq("provider", "gopay")
      .maybeSingle();
    if (!row?.goid || !row?.client_id || !row?.encrypted_client_secret) {
      throw new Error("Najprv vyplňte a uložte prihlasovacie údaje.");
    }
    try {
      await merchantTestConnection({
        goid: row.goid,
        clientId: row.client_id,
        clientSecret: decryptSecret(row.encrypted_client_secret),
        sandbox: row.sandbox_mode,
      });
      await supabaseAdmin
        .from("company_payment_providers")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_ok: true,
          last_test_error: null,
        })
        .eq("company_id", data.companyId)
        .eq("provider", "gopay");
      return { ok: true };
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 500);
      await supabaseAdmin
        .from("company_payment_providers")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_ok: false,
          last_test_error: msg,
        })
        .eq("company_id", data.companyId)
        .eq("provider", "gopay");
      throw new Error(msg);
    }
  });

export const disconnectPaymentProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_company_admin", {
      _company_id: data.companyId,
      _user_id: userId,
    });
    if (!isAdmin) throw new Error("Nemáte oprávnenie.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("company_payment_providers")
      .delete()
      .eq("company_id", data.companyId)
      .eq("provider", "gopay");
    await supabaseAdmin
      .from("companies")
      .update({ online_payments_enabled: false })
      .eq("id", data.companyId);
    await supabaseAdmin.from("platform_audit_logs").insert({
      admin_user_id: userId,
      action: "payment_provider_disconnect",
      entity_type: "company",
      entity_id: data.companyId,
      metadata: { provider: "gopay" } as any,
    });
    return { ok: true };
  });

export const setOnlinePaymentsEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string; enabled: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_company_admin", {
      _company_id: data.companyId,
      _user_id: userId,
    });
    if (!isAdmin) throw new Error("Nemáte oprávnenie.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.enabled) {
      const { data: row } = await supabaseAdmin
        .from("company_payment_providers")
        .select("enabled")
        .eq("company_id", data.companyId)
        .eq("provider", "gopay")
        .maybeSingle();
      if (!row?.enabled) throw new Error("Najprv pripojte GoPay účet.");
    }
    await supabaseAdmin
      .from("companies")
      .update({ online_payments_enabled: data.enabled })
      .eq("id", data.companyId);
    return { ok: true };
  });

/** Rotate the per-merchant webhook secret. Admin only. Returns the new secret + notify URL. */
export const rotateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_company_admin", {
      _company_id: data.companyId,
      _user_id: userId,
    });
    if (!isAdmin) throw new Error("Nemáte oprávnenie.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { randomBytes } = await import("crypto");
    const { data: row } = await supabaseAdmin
      .from("company_payment_providers")
      .select("id")
      .eq("company_id", data.companyId)
      .eq("provider", "gopay")
      .maybeSingle();
    if (!row) throw new Error("GoPay účet nie je pripojený.");
    const newSecret = randomBytes(24).toString("hex");
    await supabaseAdmin
      .from("company_payment_providers")
      .update({ webhook_secret: newSecret, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    await supabaseAdmin.from("platform_audit_logs").insert({
      admin_user_id: userId,
      action: "payment_provider_webhook_rotate",
      entity_type: "company",
      entity_id: data.companyId,
      metadata: { provider: "gopay" } as any,
    });
    const base = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
    const notifyUrl = `${base}/api/public/webhooks/gopay-merchant?cid=${data.companyId}&s=${encodeURIComponent(newSecret)}`;
    return { notifyUrl, secret: newSecret };
  });

/** Lightweight diagnostics for the online-payments settings page. */
export const getPaymentDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isMember } = await supabase.rpc("is_company_member", {
      _company_id: data.companyId,
      _user_id: userId,
    });
    if (!isMember) throw new Error("Forbidden");
    const { hasPaymentSecretsKey } = await import("./payment-crypto.server");
    const base = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
    const { data: row } = await context.supabase
      .from("company_payment_providers")
      .select("webhook_secret_present:webhook_secret")
      .eq("company_id", data.companyId)
      .eq("provider", "gopay")
      .maybeSingle();
    // Build the notify URL only if the user is an admin (secret is sensitive)
    let notifyUrl: string | null = null;
    const { data: isAdmin } = await supabase.rpc("is_company_admin", {
      _company_id: data.companyId,
      _user_id: userId,
    });
    if (isAdmin) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: adm } = await supabaseAdmin
        .from("company_payment_providers")
        .select("webhook_secret")
        .eq("company_id", data.companyId)
        .eq("provider", "gopay")
        .maybeSingle();
      if (adm?.webhook_secret) {
        notifyUrl = `${base}/api/public/webhooks/gopay-merchant?cid=${data.companyId}&s=${encodeURIComponent(adm.webhook_secret)}`;
      }
    }
    return {
      paymentSecretsKey: hasPaymentSecretsKey(),
      hasWebhookSecret: !!(row as any)?.webhook_secret_present,
      notifyUrl,
    };
  });

/** Manually re-sync an invoice's payment status with GoPay using the company's credentials. */
export const syncInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string; invoiceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isMember } = await supabase.rpc("is_company_member", {
      _company_id: data.companyId,
      _user_id: userId,
    });
    if (!isMember) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptSecret } = await import("./payment-crypto.server");
    const { merchantGetPayment } = await import("./payments-gopay.server");

    const { data: link } = await supabaseAdmin
      .from("invoice_payment_links")
      .select("*")
      .eq("invoice_id", data.invoiceId)
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!link) throw new Error("Pre túto faktúru neexistuje žiadny platobný odkaz.");
    if (!link.provider_payment_id) {
      return {
        state: link.status,
        message: "Platba ešte nebola spustená (zákazník neotvoril odkaz).",
      };
    }

    const { data: prov } = await supabaseAdmin
      .from("company_payment_providers")
      .select("*")
      .eq("company_id", data.companyId)
      .eq("provider", "gopay")
      .maybeSingle();
    if (!prov?.encrypted_client_secret) throw new Error("GoPay účet nie je pripojený.");

    const payment = await merchantGetPayment(
      {
        goid: prov.goid!,
        clientId: prov.client_id!,
        clientSecret: decryptSecret(prov.encrypted_client_secret),
        sandbox: !!prov.sandbox_mode,
      },
      String(link.provider_payment_id),
    );
    const state = String(payment.state ?? "");
    const isPaid = state === "PAID";

    await supabaseAdmin
      .from("invoice_payment_links")
      .update({
        status: isPaid ? "paid" : state.toLowerCase(),
        paid_at: isPaid ? new Date().toISOString() : (link.paid_at ?? null),
      })
      .eq("id", link.id);

    if (isPaid) {
      const { data: inv } = await supabaseAdmin
        .from("invoices")
        .select("id, status")
        .eq("id", link.invoice_id)
        .maybeSingle();
      if (inv && inv.status !== "paid") {
        await supabaseAdmin
          .from("invoices")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
          })
          .eq("id", inv.id);
      }
      // Create payment record only if none exists for this GoPay payment id
      const note = `GoPay payment ${payment.id}`;
      const { data: existingPay } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("invoice_id", link.invoice_id)
        .eq("note", note)
        .maybeSingle();
      if (!existingPay) {
        // Tabuľka `payments` má `paid_at` (dátum) a nemá ani `currency`, ani
        // `payment_date` — s nimi zápis ticho padal a úhrada nikdy nevznikla.
        await supabaseAdmin.from("payments").insert({
          company_id: data.companyId,
          invoice_id: link.invoice_id,
          amount: link.amount_cents / 100,
          paid_at: new Date().toISOString().slice(0, 10),
          method: "gopay",
          note,
        });
      }
    }

    await supabaseAdmin.from("billing_events").insert({
      company_id: data.companyId,
      event_type: `gopay_merchant_sync_${state.toLowerCase() || "unknown"}`,
      payload: {
        id: String(payment.id),
        state,
        invoice_id: link.invoice_id,
        source: "manual_sync",
      } as any,
    });

    return { state, paid: isPaid };
  });

/** Create payment link (token only — actual GoPay payment is created when customer opens it). */
export const createInvoicePaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { companyId: string; invoiceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inv, error } = await supabase
      .from("invoices")
      .select("id, company_id, invoice_number, total, advance_amount, currency, status")
      .eq("id", data.invoiceId)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (error || !inv) throw new Error("Faktúra nenájdená.");
    if (inv.status === "cancelled")
      throw new Error("Stornovanú faktúru nie je možné platiť online.");
    if (inv.status === "paid") throw new Error("Faktúra je už uhradená.");

    const { data: prov } = await supabase
      .from("company_payment_providers")
      .select("enabled, sandbox_mode")
      .eq("company_id", data.companyId)
      .eq("provider", "gopay")
      .maybeSingle();
    if (!prov?.enabled) throw new Error("Online platby nie sú pre túto firmu pripojené.");

    const { data: co } = await supabase
      .from("companies")
      .select("online_payments_enabled")
      .eq("id", data.companyId)
      .maybeSingle();
    if (!co?.online_payments_enabled)
      throw new Error("Online platby sú vypnuté v nastaveniach firmy.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Reuse a pending link if it exists and is fresh
    const { data: existing } = await supabaseAdmin
      .from("invoice_payment_links")
      .select("id, token, status, created_at")
      .eq("invoice_id", data.invoiceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing && (existing.status === "created" || existing.status === "pending")) {
      return { token: existing.token, reused: true };
    }

    const { randomBytes } = await import("crypto");
    const token = randomBytes(24).toString("base64url");
    // Zaplatenú zálohu odberateľ platiť druhýkrát nemá.
    const amountCents = Math.round(zostavaUhradit(inv.total, (inv as any).advance_amount) * 100);
    if (amountCents <= 0) throw new Error("Suma faktúry musí byť kladná.");

    await supabaseAdmin.from("invoice_payment_links").insert({
      company_id: data.companyId,
      invoice_id: data.invoiceId,
      token,
      amount_cents: amountCents,
      currency: inv.currency ?? "EUR",
      sandbox_mode: !!prov.sandbox_mode,
      created_by: userId,
      expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    });
    // Invalidate cached PDF so the next download/email regenerates it with the GoPay block
    await supabaseAdmin.from("invoices").update({ pdf_url: null }).eq("id", data.invoiceId);
    return { token, reused: false };
  });

/** Public — read minimal info for /pay/$token page. No auth. */
export const getPaymentLinkPublic = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link } = await supabaseAdmin
      .from("invoice_payment_links")
      .select(
        "id, invoice_id, company_id, status, amount_cents, currency, sandbox_mode, expires_at, gw_url",
      )
      .eq("token", data.token)
      .maybeSingle();
    if (!link) throw new Error("Platobný odkaz neexistuje.");
    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select("invoice_number, due_date, status, variable_symbol")
      .eq("id", link.invoice_id)
      .maybeSingle();
    const { data: co } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", link.company_id)
      .maybeSingle();
    return {
      link: {
        status: link.status,
        amountCents: link.amount_cents,
        currency: link.currency,
        sandbox: link.sandbox_mode,
        expiresAt: link.expires_at,
        gwUrl: link.gw_url,
      },
      invoice: {
        number: inv?.invoice_number ?? "",
        dueDate: inv?.due_date ?? null,
        status: inv?.status ?? "",
        variableSymbol: inv?.variable_symbol ?? null,
      },
      company: { name: co?.name ?? "" },
    };
  });

/** Public — actually create the GoPay payment for the token and return gw_url. */
export const startPaymentPublic = createServerFn({ method: "POST" })
  .validator((d: { token: string; payerEmail?: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptSecret } = await import("./payment-crypto.server");
    const { merchantCreatePayment } = await import("./payments-gopay.server");

    const { data: link } = await supabaseAdmin
      .from("invoice_payment_links")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (!link) throw new Error("Neplatný odkaz.");
    if (link.status === "paid") throw new Error("Faktúra je už uhradená.");
    if (link.expires_at && new Date(link.expires_at) < new Date())
      throw new Error("Platnosť odkazu vypršala.");
    if (link.gw_url && link.status === "pending") return { gwUrl: link.gw_url };

    const { data: prov } = await supabaseAdmin
      .from("company_payment_providers")
      .select("*")
      .eq("company_id", link.company_id)
      .eq("provider", "gopay")
      .maybeSingle();
    if (!prov?.enabled || !prov.encrypted_client_secret)
      throw new Error("Príjemca platby nemá pripojený GoPay účet.");

    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select("invoice_number")
      .eq("id", link.invoice_id)
      .maybeSingle();

    const base = process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk";
    const returnUrl = `${base}/pay/${data.token}?r=1`;
    const notifyUrl = `${base}/api/public/webhooks/gopay-merchant?cid=${link.company_id}&s=${encodeURIComponent(prov.webhook_secret ?? "")}`;

    const payment = await merchantCreatePayment(
      {
        goid: prov.goid!,
        clientId: prov.client_id!,
        clientSecret: decryptSecret(prov.encrypted_client_secret),
        sandbox: prov.sandbox_mode,
      },
      {
        amountCents: link.amount_cents,
        currency: link.currency,
        orderNumber: inv?.invoice_number ?? link.invoice_id,
        orderDescription: `Faktúra ${inv?.invoice_number ?? ""}`.trim(),
        returnUrl,
        notifyUrl,
        payerEmail: data.payerEmail,
      },
    );

    await supabaseAdmin
      .from("invoice_payment_links")
      .update({
        provider_payment_id: String(payment.id),
        gw_url: payment.gw_url ?? null,
        status: "pending",
      })
      .eq("id", link.id);

    return { gwUrl: payment.gw_url ?? "" };
  });
