import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  quoteId: z.string().uuid(),
  recipient_email: z.string().email().max(255),
  subject: z.string().max(255).optional(),
  message: z.string().max(5000).optional(),
});

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function b64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}

export const sendQuoteEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY nie je nakonfigurovaný.");
    const { data: q, error } = await context.supabase
      .from("quotes")
      .select("*")
      .eq("id", data.quoteId)
      .maybeSingle();
    if (error || !q) throw new Error("Cenová ponuka nenájdená");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertCompanyActive } = await import("./active-check.server");
    await assertCompanyActive(q.company_id);
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("*")
      .eq("id", q.company_id)
      .single();

    // Ensure PDF
    let pdfPath = q.pdf_url as string | null;
    if (!pdfPath) {
      const { generateQuotePdf } = await import("./quote-pdf.functions");
      void generateQuotePdf; // type only
      // Inline regen using helper to avoid double serverFn call
      const [{ data: items }] = await Promise.all([
        supabaseAdmin.from("quote_items").select("*").eq("quote_id", q.id).order("position"),
      ]);
      let logoBytes: Uint8Array | null = null;
      let logoMime: string | null = null;
      if (company?.logo_url) {
        try {
          const { data: blob } = await supabaseAdmin.storage
            .from("company-logos")
            .download(company.logo_url);
          if (blob) {
            logoBytes = new Uint8Array(await blob.arrayBuffer());
            logoMime = blob.type;
          }
        } catch {}
      }
      const { generateInvoicePdfBytes } = await import("./pdf-generator.server");
      const bytes = await generateInvoicePdfBytes({
        company,
        invoice: q,
        items: items ?? [],
        logoBytes,
        logoMime,
        documentLabel: "CENOVÁ PONUKA",
        numberLabel: `č. ${q.quote_number}`,
        hidePayment: true,
      });
      pdfPath = `${q.company_id}/quotes/${q.id}.pdf`;
      const { error: upErr } = await supabaseAdmin.storage
        .from("invoice-pdfs")
        .upload(pdfPath, bytes, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (upErr) throw new Error(upErr.message);
      await supabaseAdmin.from("quotes").update({ pdf_url: pdfPath }).eq("id", q.id);
    }
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from("invoice-pdfs")
      .download(pdfPath);
    if (dlErr || !blob) throw new Error(dlErr?.message ?? "PDF sa nepodarilo načítať.");
    const pdfB64 = b64(await blob.arrayBuffer());

    const subject = (data.subject ?? `Cenová ponuka ${q.quote_number}`).replaceAll(
      "{quote_number}",
      q.quote_number,
    );
    const message = (
      data.message ?? `V prílohe Vám posielame cenovú ponuku ${q.quote_number}.`
    ).replaceAll("{quote_number}", q.quote_number);
    const senderName = company?.email_sender_name || company?.name || "Faktero";

    const fromEmail = process.env.RESEND_FROM_EMAIL || "faktury@faktero.sk";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: `${senderName} <${fromEmail}>`,
        to: [data.recipient_email],
        subject,
        reply_to: company?.email_reply_to || undefined,
        text: message,
        html: `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;white-space:pre-wrap">${escapeHtml(message)}</div>`,
        attachments: [{ filename: `${q.quote_number}.pdf`, content: pdfB64 }],
      }),
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {}
    if (!res.ok) {
      const errMsg = json?.message ?? text.slice(0, 500);
      await supabaseAdmin.from("quote_email_logs" as any).insert({
        company_id: q.company_id,
        quote_id: q.id,
        recipient_email: data.recipient_email,
        subject,
        message,
        status: "failed",
        error_message: errMsg,
      });
      throw new Error(`Resend error: ${errMsg}`);
    }

    await supabaseAdmin.from("quote_email_logs" as any).insert({
      company_id: q.company_id,
      quote_id: q.id,
      recipient_email: data.recipient_email,
      subject,
      message,
      status: "sent",
      provider_message_id: json?.id ?? null,
      sent_at: new Date().toISOString(),
    });

    await supabaseAdmin
      .from("quotes")
      .update({
        status: q.status === "draft" ? "sent" : q.status,
        sent_at: new Date().toISOString(),
      })
      .eq("id", q.id);
    return { ok: true, message_id: json?.id ?? null };
  });
