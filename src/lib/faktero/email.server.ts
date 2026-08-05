import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SendInvoiceEmailInput = {
  company_id: string;
  invoice_id: string;
  recipient_email: string;
  subject?: string;
  message?: string;
};

function applyVars(s: string, inv: any, company: any) {
  const total = `${Number(inv.total).toFixed(2)} ${inv.currency}`;
  const pairs: Array<[string, string]> = [
    ["invoice_number", inv.invoice_number ?? ""],
    ["due_date", inv.due_date ?? ""],
    ["total", total],
    ["company_name", company?.name ?? ""],
    ["customer_name", inv.customer_name ?? ""],
    ["iban", company?.iban ?? ""],
    ["variable_symbol", inv.variable_symbol ?? inv.invoice_number ?? ""],
  ];
  let out = s;
  for (const [k, v] of pairs) {
    out = out.split(`{{${k}}}`).join(v).split(`{${k}}`).join(v);
  }
  return out;
}

function arrayBufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  // btoa exists in Workers/SSR
  return btoa(binary);
}

export async function sendInvoiceEmail(input: SendInvoiceEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY nie je nakonfigurovaný.");

  const { data: invoice, error } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("id", input.invoice_id)
    .eq("company_id", input.company_id)
    .maybeSingle();
  if (error || !invoice) throw new Error("Faktúra nenájdená");
  if (invoice.status === "cancelled") throw new Error("Stornovanú faktúru nemožno odoslať.");

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("*")
    .eq("id", input.company_id)
    .single();

  // Look up active payment link (used both for PDF embed and email CTA)
  let paymentLinkUrl: string | null = null;
  try {
    const { data: link } = await supabaseAdmin
      .from("invoice_payment_links")
      .select("token, status, expires_at")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      link &&
      link.status !== "cancelled" &&
      (!link.expires_at || new Date(link.expires_at) > new Date())
    ) {
      const base = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
      paymentLinkUrl = `${base}/pay/${link.token}`;
    }
  } catch {
    /* ignore */
  }

  // Ensure a fresh PDF exists (regenerates when the cached copy is stale)
  const { ensureInvoicePdf } = await import("./invoice-pdf.server");
  const { path: pdfPath } = await ensureInvoicePdf(invoice.id);

  const { data: pdfBlob, error: dlErr } = await supabaseAdmin.storage
    .from("invoice-pdfs")
    .download(pdfPath);
  if (dlErr || !pdfBlob) throw new Error(dlErr?.message ?? "PDF sa nepodarilo načítať.");
  const pdfB64 = arrayBufferToBase64(await pdfBlob.arrayBuffer());

  let tplSubject: string | undefined;
  let tplBody: string | undefined;
  try {
    const { getEmailTemplate } = await import("./email-templates.server");
    const tpl = await getEmailTemplate(input.company_id, "invoice_send");
    if (tpl.fromDb) {
      tplSubject = tpl.subject;
      tplBody = tpl.body;
    }
  } catch {
    /* ignore */
  }

  const subject =
    input.subject ?? tplSubject ?? company?.email_default_subject ?? "Faktúra {invoice_number}";
  const message =
    input.message ??
    tplBody ??
    company?.email_default_message ??
    "V prílohe posielame faktúru {invoice_number}.";
  const finalSubject = applyVars(subject, invoice, company);
  const finalMessage = applyVars(message, invoice, company);

  // Append online payment CTA to plain + HTML body when a link is active
  const ctaPlain = paymentLinkUrl
    ? `\n\nFaktúru môžete zaplatiť online kliknutím na tento odkaz: ${paymentLinkUrl}`
    : "";
  const finalPlain = finalMessage + ctaPlain;
  const ctaHtml = paymentLinkUrl
    ? `<div style="margin-top:24px;padding-top:20px;border-top:1px solid #e5e7eb">
         <p style="margin:0 0 12px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#111">
           Faktúru môžete zaplatiť online:
         </p>
         <a href="${escapeAttr(paymentLinkUrl)}" style="display:inline-block;background:#12734f;color:#fff;text-decoration:none;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px">
           Zaplatiť online
         </a>
         <p style="margin:10px 0 0;font-family:Inter,Arial,sans-serif;font-size:12px;color:#6b7280;word-break:break-all">
           Alebo otvorte: <a href="${escapeAttr(paymentLinkUrl)}" style="color:#12734f">${escapeHtml(paymentLinkUrl)}</a>
         </p>
       </div>`
    : "";
  const bodyHtml =
    `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;white-space:pre-wrap">${escapeHtml(finalMessage)}</div>` +
    ctaHtml;

  const senderName = company?.email_sender_name || company?.name || "Faktero";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "faktury@faktero.sk";
  const from = `${senderName} <${fromEmail}>`;

  const { data: log } = await supabaseAdmin
    .from("invoice_email_logs")
    .insert({
      company_id: input.company_id,
      invoice_id: invoice.id,
      recipient_email: input.recipient_email,
      subject: finalSubject,
      message: finalPlain,
      status: "pending",
    })
    .select("id")
    .single();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [input.recipient_email],
        subject: finalSubject,
        reply_to: company?.email_reply_to || undefined,
        text: finalPlain,
        html: bodyHtml,
        attachments: [{ filename: `${invoice.invoice_number}.pdf`, content: pdfB64 }],
      }),
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {
      // Resend pri chybe niekedy vráti HTML/prázdno — nižšie sa použije surový text
    }
    if (!res.ok) {
      const errMsg = json?.message ?? text.slice(0, 500);
      await supabaseAdmin
        .from("invoice_email_logs")
        .update({
          status: "failed",
          error_message: errMsg,
        })
        .eq("id", log!.id);
      throw new Error(`Resend error: ${errMsg}`);
    }
    await supabaseAdmin
      .from("invoice_email_logs")
      .update({
        status: "sent",
        provider_message_id: json?.id ?? null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", log!.id);

    // Update invoice as sent
    const { data: updated } = await supabaseAdmin
      .from("invoices")
      .update({
        status: invoice.status === "draft" || invoice.status === "issued" ? "sent" : invoice.status,
        sent_at: new Date().toISOString(),
      })
      .eq("id", invoice.id)
      .select()
      .single();

    // Webhook: invoice.sent
    const { triggerEvent, invoicePayload } = await import("./webhook-trigger.server");
    await triggerEvent({
      company_id: input.company_id,
      event: "invoice.sent",
      data: invoicePayload(updated ?? invoice),
    });

    return { ok: true, message_id: json?.id ?? null, log_id: log!.id };
  } catch (e: any) {
    await supabaseAdmin
      .from("invoice_email_logs")
      .update({
        status: "failed",
        error_message: e?.message ?? "unknown",
      })
      .eq("id", log!.id);
    throw e;
  }
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function escapeAttr(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
