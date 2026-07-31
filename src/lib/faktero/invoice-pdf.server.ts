import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function safePdfFileName(s: string): string {
  return `${String(s || "faktura").replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;
}

export function invoicePdfPath(companyId: string, invoiceId: string) {
  return `${companyId}/${invoiceId}.pdf`;
}

async function computeHash(invoiceId: string): Promise<string | null> {
  const { data, error } = await (supabaseAdmin as any).rpc("faktero_invoice_pdf_hash", {
    _invoice_id: invoiceId,
  });
  if (error) {
    console.warn("[pdf] hash rpc failed", invoiceId, error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

async function objectExists(companyId: string, invoiceId: string) {
  const { data } = await supabaseAdmin.storage
    .from("invoice-pdfs")
    .list(companyId, { search: `${invoiceId}.pdf`, limit: 1 });
  return Boolean(data && data.length > 0);
}

/**
 * Returns a storage path to a PDF that matches the invoice's current content.
 * Regenerates (and replaces the cached object) whenever the cache is stale,
 * missing, or `force` is set.
 */
export async function ensureInvoicePdf(
  invoiceId: string,
  opts: { force?: boolean } = {},
): Promise<{ path: string; fileName: string; regenerated: boolean }> {
  const { data: invoice, error } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !invoice) {
    console.error("[pdf] invoice not found", invoiceId, error);
    throw new Error("Faktúra nenájdená");
  }

  const fileName = safePdfFileName((invoice as any).invoice_number ?? "faktura");
  const path = invoicePdfPath(invoice.company_id, invoice.id);
  const hash = await computeHash(invoice.id);
  const cachedHash = (invoice as any).pdf_source_hash as string | null;

  const cacheValid =
    !opts.force &&
    Boolean(invoice.pdf_url) &&
    Boolean(hash) &&
    cachedHash === hash &&
    (await objectExists(invoice.company_id, invoice.id));

  if (cacheValid) return { path: invoice.pdf_url as string, fileName, regenerated: false };

  const [{ data: items }, { data: company }] = await Promise.all([
    supabaseAdmin.from("invoice_items").select("*").eq("invoice_id", invoice.id).order("position"),
    supabaseAdmin.from("companies").select("*").eq("id", invoice.company_id).maybeSingle(),
  ]);
  if (!company) {
    console.error("[pdf] company not found", invoice.company_id);
    throw new Error("Firma nenájdená");
  }

  let logoBytes: Uint8Array | null = null;
  let logoMime: string | null = null;
  if ((company as any).logo_url) {
    try {
      const { data: blob } = await supabaseAdmin.storage
        .from("company-logos")
        .download((company as any).logo_url);
      if (blob) {
        logoBytes = new Uint8Array(await blob.arrayBuffer());
        logoMime = blob.type;
      }
    } catch { /* ignore */ }
  }

  let paymentLinkUrl: string | null = null;
  try {
    const { data: link } = await supabaseAdmin
      .from("invoice_payment_links")
      .select("token, status, expires_at")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (link && link.status !== "cancelled" && (!link.expires_at || new Date(link.expires_at) > new Date())) {
      const base = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
      paymentLinkUrl = `${base}/pay/${link.token}`;
    }
  } catch { /* ignore */ }

  const { generateInvoicePdfBytes } = await import("./pdf-generator.server");
  const bytes = await generateInvoicePdfBytes({
    company,
    invoice,
    items: items ?? [],
    logoBytes,
    logoMime,
    paymentLinkUrl,
  });

  // Drop the stale cached object before writing the fresh one.
  try {
    await supabaseAdmin.storage.from("invoice-pdfs").remove([path]);
  } catch { /* ignore */ }

  const { error: upErr } = await supabaseAdmin.storage.from("invoice-pdfs").upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) {
    console.error("[pdf] upload failed", path, upErr);
    throw new Error(`PDF sa nepodarilo nahrať: ${upErr.message}`);
  }

  // Re-read the hash: content may have changed while the PDF was rendering.
  const finalHash = await computeHash(invoice.id);
  await supabaseAdmin
    .from("invoices")
    .update({ pdf_url: path, pdf_source_hash: finalHash } as any)
    .eq("id", invoice.id);

  return { path, fileName, regenerated: true };
}

export async function signInvoicePdf(path: string, fileName: string) {
  const { data: signed, error } = await supabaseAdmin.storage
    .from("invoice-pdfs")
    .createSignedUrl(path, 60 * 60, { download: fileName });
  if (error || !signed) {
    console.error("[pdf] sign failed", path, error);
    throw new Error("PDF sa nepodarilo podpísať na stiahnutie.");
  }
  return signed.signedUrl;
}
