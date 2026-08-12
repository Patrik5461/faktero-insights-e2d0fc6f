import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const input = z.object({ quoteId: z.string().uuid() });

/** Meno súboru pre stiahnutie — bez neho sa PDF uloží pod UUID objektu. */
function nazovSuboru(cisloPonuky: unknown): string {
  return `${String(cisloPonuky || "ponuka").replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;
}

export const generateQuotePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: quote, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", data.quoteId)
      .single();
    if (error || !quote) throw new Error("Cenová ponuka nenájdená");

    const [{ data: items }, { data: company }] = await Promise.all([
      supabase.from("quote_items").select("*").eq("quote_id", quote.id).order("position"),
      supabase.from("companies").select("*").eq("id", quote.company_id).single(),
    ]);
    if (!company) throw new Error("Firma nenájdená");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let logoBytes: Uint8Array | null = null;
    let logoMime: string | null = null;
    if (company.logo_url) {
      try {
        const { data: blob } = await supabaseAdmin.storage
          .from("company-logos")
          .download(company.logo_url);
        if (blob) {
          logoBytes = new Uint8Array(await blob.arrayBuffer());
          logoMime = blob.type;
        }
      } catch {
        /* ignore */
      }
    }

    const { generateInvoicePdfBytes } = await import("./pdf-generator.server");
    const bytes = await generateInvoicePdfBytes({
      company,
      invoice: quote,
      items: items ?? [],
      logoBytes,
      logoMime,
      documentLabel: "CENOVÁ PONUKA",
      numberLabel: `č. ${quote.quote_number}`,
      hidePayment: true,
      metaOverride: [
        ["Dátum vystavenia", quote.issue_date ?? ""],
        ["Platnosť do", quote.valid_until ?? "—"],
        ["Mena", quote.currency ?? "EUR"],
        ["Stav", labelForStatus(quote.status)],
      ],
    });

    const path = `${quote.company_id}/quotes/${quote.id}.pdf`;
    const { error: upErr } = await supabaseAdmin.storage.from("invoice-pdfs").upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin.from("quotes").update({ pdf_url: path }).eq("id", quote.id);

    const { data: signed } = await supabaseAdmin.storage
      .from("invoice-pdfs")
      // Bez `download` sa súbor stiahne pod menom objektu — teda ako UUID.
      .createSignedUrl(path, 60 * 60, { download: nazovSuboru(quote.quote_number) });
    return { path, signedUrl: signed?.signedUrl ?? null };
  });

export const getQuotePdfSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: quote, error } = await context.supabase
      .from("quotes")
      .select("id, pdf_url, quote_number")
      .eq("id", data.quoteId)
      .single();
    if (error || !quote?.pdf_url) throw new Error("PDF zatiaľ neexistuje");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("invoice-pdfs")
      .createSignedUrl(quote.pdf_url, 60 * 60, {
        download: nazovSuboru((quote as any).quote_number),
      });
    if (sErr || !signed) throw new Error(sErr?.message ?? "Chyba podpisu URL");
    return { signedUrl: signed.signedUrl };
  });

function labelForStatus(s: string) {
  switch (s) {
    case "draft":
      return "Koncept";
    case "sent":
      return "Odoslaná";
    case "accepted":
      return "Akceptovaná";
    case "rejected":
      return "Zamietnutá";
    case "expired":
      return "Expirovaná";
    case "converted":
      return "Konvertovaná";
    default:
      return s;
  }
}
