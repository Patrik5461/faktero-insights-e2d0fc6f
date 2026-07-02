import { supabaseAdmin } from "@/integrations/supabase/client.server";

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]!));
}

function baseUrl() {
  return (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
}

async function sendMail(opts: { to: string; subject: string; html: string; text: string; from?: string; reply_to?: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY nie je nakonfigurovaný.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: opts.from ?? `Faktero <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`,
      to: [opts.to],
      subject: opts.subject,
      reply_to: opts.reply_to || undefined,
      text: opts.text,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend error: ${t.slice(0, 500)}`);
  }
  return res.json().catch(() => ({}));
}

export async function sendApprovalRequestEmail(params: {
  invoice: any; company: any; recipientEmail: string; token: string;
}) {
  const { invoice, company, recipientEmail, token } = params;
  const link = `${baseUrl()}/schvalit/${token}`;
  const senderName = company?.email_sender_name || company?.name || "Faktero";
  const from = `${senderName} <${process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk"}>`;
  const total = `${Number(invoice.total).toFixed(2)} ${invoice.currency}`;

  // Load editable DB template (falls back to hardcoded default)
  const { getEmailTemplate, applyTemplateVars, DEFAULT_TEMPLATES } = await import("./email-templates.server");
  let subject = DEFAULT_TEMPLATES.approval_request.subject;
  let bodyTpl = DEFAULT_TEMPLATES.approval_request.body;
  try {
    const tpl = await getEmailTemplate(company?.id ?? invoice.company_id, "approval_request");
    subject = tpl.subject; bodyTpl = tpl.body;
  } catch { /* ignore */ }
  subject = applyTemplateVars(subject, { invoice, company });
  const bodyText = applyTemplateVars(bodyTpl, { invoice, company });

  const text =
`${bodyText}

Faktúru si môžete pozrieť a schváliť alebo zamietnuť na tomto odkaze:
${link}

Odkaz je platný 7 dní.`;

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px">
    <div style="white-space:pre-wrap">${escapeHtml(bodyText)}</div>
    <p style="margin:24px 0">
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#12734f;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">
        Zobraziť a schváliť faktúru
      </a>
    </p>
    <p style="color:#6b7280;font-size:12px">Odkaz je platný 7 dní. Alebo skopírujte do prehliadača:<br>
    <span style="word-break:break-all">${escapeHtml(link)}</span></p>
    <p style="color:#6b7280;font-size:12px;margin-top:24px">Suma faktúry: <strong>${escapeHtml(total)}</strong></p>
  </div>`;

  await sendMail({ to: recipientEmail, subject, html, text, from, reply_to: company?.email_reply_to });
}

export async function sendApprovalResultEmail(params: {
  invoice: any; company: any; approved: boolean; note?: string | null; supplierEmail: string;
}) {
  const { invoice, company, approved, note, supplierEmail } = params;
  const status = approved ? "schválená" : "zamietnutá";
  const subject = `Faktúra ${invoice.invoice_number} bola ${status}`;
  const total = `${Number(invoice.total).toFixed(2)} ${invoice.currency}`;
  const text =
`Faktúra ${invoice.invoice_number} pre odberateľa ${invoice.customer_name ?? ""} v sume ${total} bola ${status}.
${!approved && note ? `\nDôvod zamietnutia:\n${note}\n` : ""}
Otvoriť faktúru: ${baseUrl()}/faktury/${invoice.id}`;

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;max-width:560px">
    <p>Faktúra <strong>${escapeHtml(invoice.invoice_number)}</strong> pre odberateľa
    <strong>${escapeHtml(invoice.customer_name ?? "")}</strong> v sume <strong>${escapeHtml(total)}</strong>
    bola <strong style="color:${approved ? "#12734f" : "#b91c1c"}">${status}</strong>.</p>
    ${!approved && note ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin:16px 0">
      <div style="font-size:12px;color:#991b1b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Dôvod zamietnutia</div>
      <div style="white-space:pre-wrap">${escapeHtml(note)}</div>
    </div>` : ""}
    <p style="margin-top:20px">
      <a href="${escapeHtml(baseUrl())}/faktury/${escapeHtml(invoice.id)}" style="color:#12734f">Otvoriť faktúru</a>
    </p>
  </div>`;

  await sendMail({ to: supplierEmail, subject, html, text });
}

export async function getInvoiceForApproval(token: string) {
  const { data: inv } = await supabaseAdmin
    .from("invoices")
    .select("id, invoice_number, customer_name, customer_email, subtotal, vat_total, total, currency, issue_date, due_date, status, approval_status, approval_requested_at, approval_responded_at, approval_note, company_id, notes")
    .eq("approval_token", token)
    .maybeSingle();
  if (!inv) return null;

  // Enforce 7-day link expiry
  if (inv.approval_requested_at) {
    const ageMs = Date.now() - new Date(inv.approval_requested_at).getTime();
    if (ageMs > 7 * 24 * 3600 * 1000) return { ...inv, expired: true } as any;
  }

  const [{ data: items }, { data: company }] = await Promise.all([
    supabaseAdmin.from("invoice_items").select("description, quantity, unit, unit_price, vat_rate, total").eq("invoice_id", inv.id).order("position"),
    supabaseAdmin.from("companies").select("name, street, city, zip, country, ico, dic, ic_dph, email, logo_url").eq("id", inv.company_id).maybeSingle(),
  ]);
  return { invoice: inv, items: items ?? [], company: company ?? null } as any;
}
