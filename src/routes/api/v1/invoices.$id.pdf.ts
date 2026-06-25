import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/invoices/$id/pdf")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data: inv, error } = await ctx.supabase.from("invoices").select("*").eq("id", params.id).eq("company_id", ctx.company_id).maybeSingle();
          if (error) { console.error("[api/pdf] db error", error); return err("db_error", error.message, 500); }
          if (!inv) return err("not_found", "Faktúra nenájdená.", 404);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let path = inv.pdf_url;
          if (!path) {
            const [{ data: items }, { data: company }] = await Promise.all([
              ctx.supabase.from("invoice_items").select("*").eq("invoice_id", inv.id).order("position"),
              ctx.supabase.from("companies").select("*").eq("id", inv.company_id).single(),
            ]);
            if (!company) return err("not_found", "Firma nenájdená.", 404);
            let logoBytes: Uint8Array | null = null, logoMime: string | null = null;
            if (company.logo_url) {
              try {
                const { data: blob } = await supabaseAdmin.storage.from("company-logos").download(company.logo_url);
                if (blob) { logoBytes = new Uint8Array(await blob.arrayBuffer()); logoMime = blob.type; }
              } catch { /* */ }
            }
            try {
              const { generateInvoicePdfBytes } = await import("@/lib/faktero/pdf-generator.server");
              const bytes = await generateInvoicePdfBytes({ company, invoice: inv, items: items ?? [], logoBytes, logoMime });
              path = `${inv.company_id}/${inv.id}.pdf`;
              const { error: upErr } = await supabaseAdmin.storage.from("invoice-pdfs").upload(path, bytes, { contentType: "application/pdf", upsert: true });
              if (upErr) { console.error("[api/pdf] upload failed", path, upErr); return err("storage_error", "PDF sa nepodarilo vygenerovať.", 500); }
              await supabaseAdmin.from("invoices").update({ pdf_url: path }).eq("id", inv.id);
            } catch (e: any) {
              console.error("[api/pdf] generate failed", inv.id, e);
              return err("generate_error", "PDF sa nepodarilo vygenerovať.", 500);
            }
          }

          const { data: signed, error: sErr } = await supabaseAdmin.storage.from("invoice-pdfs").createSignedUrl(path!, 60 * 60);
          if (sErr || !signed) { console.error("[api/pdf] sign failed", path, sErr); return err("storage_error", "PDF sa nepodarilo stiahnuť.", 500); }
          return ok({ url: signed.signedUrl, expires_in: 3600 });
        });
      },
    },
  },
});