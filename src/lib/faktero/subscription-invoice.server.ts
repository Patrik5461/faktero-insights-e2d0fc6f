/**
 * Vystavovanie daňových dokladov od Tobify s.r.o. za predplatné Faktero
 * a emailová notifikácia zákazníkovi o aktivácii.
 *
 * Volá sa po úspešnej GoPay platbe (z webhooku aj z manual sync).
 * Idempotentné — ak už bol pre daný `billing_payment_id` doklad vystavený,
 * druhý beh len prípadne pošle email znova nespustí.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Fixné identifikačné údaje predávajúceho (Tobify s.r.o.). */
export const TOBIFY_SELLER = {
  name: "Tobify s. r. o.",
  ico: "56607016",
  dic: "2122358579",
  ic_dph: "SK2122358579",
  street: "Športová 707/43",
  city: "Zavar",
  zip: "919 26",
  country: "Slovenská republika",
  email: "info@faktero.sk",
  web: "https://www.faktero.sk",
  registration: "Obchodný register Okresného súdu Trnava, oddiel: Sro, dátum vzniku: 31. 10. 2024",
} as const;

function centsFromGrossInclVat(gross: number, vatRate = 23) {
  const base = Math.round(gross / (1 + vatRate / 100));
  const vat = gross - base;
  return { subtotal_cents: base, vat_cents: vat, total_cents: gross };
}

function fmtCents(cents: number, currency = "EUR") {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function publicBaseUrl(): string {
  return (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
}

function escapeHtml(s: string) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}

/**
 * Vystaví daňový doklad pre danú (zaplatenú) billing_payments radu.
 * Idempotentné podľa `billing_payment_id`.
 * Vracia platformInvoice + prípadne odoslaný email log id.
 */
export async function issueSubscriptionInvoiceForPayment(billingPaymentId: string) {
  // 1. Načítať platbu
  const { data: bp, error: bpErr } = await supabaseAdmin
    .from("billing_payments")
    .select(
      "id, company_id, plan_slug, amount_cents, currency, status, provider, provider_payment_id, paid_at",
    )
    .eq("id", billingPaymentId)
    .maybeSingle();
  if (bpErr) throw bpErr;
  if (!bp) throw new Error("billing_payment not found");
  if (bp.status !== "PAID") return { skipped: "not_paid" as const };

  // 2. Idempotencia
  const { data: existing } = await supabaseAdmin
    .from("platform_invoices")
    .select("id, invoice_number, public_token")
    .eq("billing_payment_id", bp.id)
    .maybeSingle();
  if (existing) {
    return { platformInvoice: existing, created: false as const };
  }

  // 3. Kupujúci — snapshot firmy
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id, name, ico, dic, ic_dph, street, city, zip, country, email")
    .eq("id", bp.company_id)
    .maybeSingle();
  if (!company) throw new Error("company not found");

  // 4. Plán (na názov)
  const { data: plan } = await supabaseAdmin
    .from("subscription_plans")
    .select("slug, name")
    .eq("slug", bp.plan_slug ?? "")
    .maybeSingle();

  const gross = bp.amount_cents;
  const { subtotal_cents, vat_cents, total_cents } = centsFromGrossInclVat(gross, 23);

  // 5. Sekvenčné číslo
  const { data: numRow, error: numErr } = await supabaseAdmin.rpc(
    "next_platform_invoice_number" as any,
  );
  if (numErr) throw numErr;
  const invoice_number = String(numRow);

  const buyer_snapshot = {
    name: company.name,
    ico: company.ico,
    dic: company.dic,
    ic_dph: company.ic_dph,
    street: company.street,
    city: company.city,
    zip: company.zip,
    country: company.country ?? "SK",
    email: company.email,
  };

  const { data: platformInvoice, error: piErr } = await supabaseAdmin
    .from("platform_invoices")
    .insert({
      company_id: bp.company_id,
      billing_payment_id: bp.id,
      invoice_number,
      plan_slug: bp.plan_slug ?? "premium",
      plan_name: plan?.name ?? bp.plan_slug ?? "Predplatné",
      currency: bp.currency ?? "EUR",
      vat_rate: 23,
      subtotal_cents,
      vat_cents,
      total_cents,
      provider: bp.provider ?? "gopay",
      provider_payment_id: bp.provider_payment_id,
      buyer_snapshot,
    })
    .select("id, invoice_number, public_token")
    .single();
  if (piErr) throw piErr;

  await supabaseAdmin.from("billing_events").insert({
    company_id: bp.company_id,
    event_type: "platform_invoice_issued",
    payload: { invoice_number: platformInvoice.invoice_number, billing_payment_id: bp.id } as any,
  });

  // 6. Email zákazníkovi
  let emailResult: { sent: boolean; error?: string } = { sent: false };
  try {
    emailResult = await sendActivationEmail({
      company_id: bp.company_id,
      recipient: company.email ?? undefined,
      planName: plan?.name ?? bp.plan_slug ?? "predplatné",
      invoiceNumber: platformInvoice.invoice_number,
      publicToken: platformInvoice.public_token,
      totalCents: total_cents,
      currency: bp.currency ?? "EUR",
    });
  } catch (e: any) {
    emailResult = { sent: false, error: e?.message ?? String(e) };
    await supabaseAdmin.from("billing_events").insert({
      company_id: bp.company_id,
      event_type: "activation_email_failed",
      payload: { error: emailResult.error } as any,
    });
  }

  return { platformInvoice, created: true as const, email: emailResult };
}

async function sendActivationEmail(input: {
  company_id: string;
  recipient?: string;
  planName: string;
  invoiceNumber: string;
  publicToken: string;
  totalCents: number;
  currency: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY missing");

  // Fallback recipient — vlastník firmy
  let recipient = input.recipient;
  if (!recipient) {
    const { data: owner } = await supabaseAdmin
      .from("company_users")
      .select("user_id, role")
      .eq("company_id", input.company_id)
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();
    if (owner) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", owner.user_id)
        .maybeSingle();
      recipient = prof?.email ?? undefined;
    }
  }
  if (!recipient) return { sent: false, error: "no_recipient" };

  const base = publicBaseUrl();
  const docUrl = `${base}/danovy-doklad/${input.publicToken}`;
  const total = fmtCents(input.totalCents, input.currency);

  const from = `Faktero <${process.env.RESEND_FROM_EMAIL || "faktury@faktero.sk"}>`;
  const subject = `Predplatné Faktero aktivované — daňový doklad ${input.invoiceNumber}`;

  const text = [
    `Dobrý deň,`,
    ``,
    `ďakujeme za platbu. Vaše predplatné plánu ${input.planName} vo Faktere je aktívne.`,
    ``,
    `Uhradená suma: ${total} (s DPH 23 %)`,
    `Daňový doklad č.: ${input.invoiceNumber}`,
    `Zobrazenie / tlač dokladu: ${docUrl}`,
    ``,
    `Doklad vystavil prevádzkovateľ Tobify s. r. o., IČO 56607016, IČ DPH SK2122358579.`,
    ``,
    `Prihláste sa v aplikácii: ${base}/prihlasenie`,
    ``,
    `S pozdravom, tím Faktero`,
  ].join("\n");

  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;line-height:1.5">
  <h2 style="margin:0 0 12px">Predplatné aktivované 🎉</h2>
  <p>Ďakujeme za platbu. Vaše predplatné plánu <b>${escapeHtml(input.planName)}</b> vo Faktere je aktívne.</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:4px 8px;color:#555">Uhradená suma</td><td style="padding:4px 8px"><b>${escapeHtml(total)}</b> <span style="color:#777">(s DPH 23 %)</span></td></tr>
    <tr><td style="padding:4px 8px;color:#555">Daňový doklad č.</td><td style="padding:4px 8px"><b>${escapeHtml(input.invoiceNumber)}</b></td></tr>
  </table>
  <p><a href="${escapeHtml(docUrl)}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Zobraziť / vytlačiť daňový doklad</a></p>
  <p style="color:#555;font-size:12px;margin-top:24px">Doklad vystavil prevádzkovateľ <b>Tobify s. r. o.</b>, IČO 56607016, IČ DPH SK2122358579.</p>
  <p><a href="${escapeHtml(base)}/prihlasenie">Prihlásiť sa do Faktero →</a></p>
</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [recipient], subject, text, html }),
  });
  const bodyText = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(bodyText);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(`Resend error: ${json?.message ?? bodyText.slice(0, 300)}`);
  }
  await supabaseAdmin.from("billing_events").insert({
    company_id: input.company_id,
    event_type: "activation_email_sent",
    payload: {
      recipient,
      message_id: json?.id ?? null,
      invoice_number: input.invoiceNumber,
    } as any,
  });
  return { sent: true as const, message_id: json?.id ?? null };
}
