import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const input = z.object({ invoiceId: z.string().uuid() });

function safeFileName(s: string): string {
  return String(s || "faktura").replace(/[^A-Za-z0-9._-]+/g, "_");
}

export const generateInvoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: invoice, error } = await supabase.from("invoices").select("*").eq("id", data.invoiceId).single();
    if (error || !invoice) {
      console.error("[pdf] invoice not found", data.invoiceId, error);
      throw new Error("Faktúra nenájdená");
    }

    const [{ data: items }, { data: company }] = await Promise.all([
      supabase.from("invoice_items").select("*").eq("invoice_id", invoice.id).order("position"),
      supabase.from("companies").select("*").eq("id", invoice.company_id).single(),
    ]);
    if (!company) {
      console.error("[pdf] company not found", invoice.company_id);
      throw new Error("Firma nenájdená");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let logoBytes: Uint8Array | null = null;
    let logoMime: string | null = null;
    if (company.logo_url) {
      try {
        const { data: blob } = await supabaseAdmin.storage.from("company-logos").download(company.logo_url);
        if (blob) {
          logoBytes = new Uint8Array(await blob.arrayBuffer());
          logoMime = blob.type;
        }
      } catch { /* ignore */ }
    }

    // Look up an active payment link (newest non-terminal status) and build a public URL
    let paymentLinkUrl: string | null = null;
    try {
      const { data: link } = await supabaseAdmin.from("invoice_payment_links")
        .select("token, status, expires_at")
        .eq("invoice_id", invoice.id)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (link && link.status !== "cancelled" && (!link.expires_at || new Date(link.expires_at) > new Date())) {
        const base = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
        paymentLinkUrl = `${base}/pay/${link.token}`;
      }
    } catch { /* ignore */ }

    const { generateInvoicePdfBytes } = await import("./pdf-generator.server");
    const bytes = await generateInvoicePdfBytes({ company, invoice, items: items ?? [], logoBytes, logoMime, paymentLinkUrl });

    const path = `${invoice.company_id}/${invoice.id}.pdf`;
    const { error: upErr } = await supabaseAdmin.storage.from("invoice-pdfs").upload(path, bytes, {
      contentType: "application/pdf", upsert: true,
    });
    if (upErr) {
      console.error("[pdf] upload failed", path, upErr);
      throw new Error(`PDF sa nepodarilo nahrať: ${upErr.message}`);
    }

    await supabaseAdmin.from("invoices").update({ pdf_url: path }).eq("id", invoice.id);

    const downloadName = `${safeFileName(invoice.invoice_number ?? "faktura")}.pdf`;
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("invoice-pdfs")
      .createSignedUrl(path, 60 * 60, { download: downloadName });
    if (sErr || !signed) {
      console.error("[pdf] sign failed", path, sErr);
      throw new Error("PDF sa nepodarilo podpísať na stiahnutie.");
    }
    return { path, signedUrl: signed.signedUrl, fileName: downloadName };
  });

export const getInvoicePdfSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: invoice, error } = await context.supabase.from("invoices").select("id, company_id, pdf_url").eq("id", data.invoiceId).single();
    if (error || !invoice) {
      console.error("[pdf] invoice not found", data.invoiceId, error);
      throw new Error("Faktúra nenájdená");
    }
    if (!invoice.pdf_url) throw new Error("PDF zatiaľ neexistuje");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Verify the object still exists in storage; otherwise treat as missing so caller can regenerate.
    const { data: head } = await supabaseAdmin.storage.from("invoice-pdfs").list(invoice.company_id, { search: `${invoice.id}.pdf`, limit: 1 });
    if (!head || head.length === 0) {
      console.warn("[pdf] pdf_url present but object missing", invoice.pdf_url);
      throw new Error("PDF zatiaľ neexistuje");
    }
    const { data: invoiceMeta } = await context.supabase
      .from("invoices")
      .select("invoice_number")
      .eq("id", invoice.id)
      .single();
    const downloadName = `${safeFileName(invoiceMeta?.invoice_number ?? "faktura")}.pdf`;
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("invoice-pdfs")
      .createSignedUrl(invoice.pdf_url, 60 * 60, { download: downloadName });
    if (sErr || !signed) {
      console.error("[pdf] sign failed", invoice.pdf_url, sErr);
      throw new Error("PDF sa nepodarilo stiahnuť.");
    }
    return { signedUrl: signed.signedUrl, fileName: downloadName };
  });