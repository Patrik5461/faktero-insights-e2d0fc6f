/**
 * Verejný odkaz na PDF faktúry.
 *
 * Existuje kvôli Pohode: v záložke Dokumenty vie doklad niesť URL adresu, ale
 * schéma jej dáva 255 znakov — podpísaný odkaz zo Supabase je dlhší a ešte mu
 * vyprší platnosť. Tu je adresa krátka a podpis sa vyrába až pri kliknutí.
 *
 * Odkaz existuje len pre faktúry, ktoré cez konektor naozaj išli do Pohody
 * (token vzniká pri zostavovaní dávky), dá sa vypnúť vo Firma → Pohoda a
 * zrušiť vymazaním tokenu. Prezradzuje to isté, čo faktúra poslaná mailom.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/faktura/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token ?? "");
        // Krátky alebo nenáhodný token nemá zmysel ani hľadať.
        if (!/^[a-f0-9]{32}$/.test(token)) {
          return new Response("Odkaz nie je platný.", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: faktura } = await supabaseAdmin
          .from("invoices")
          .select("id, invoice_number, company_id, deleted_at")
          .eq("pdf_token", token)
          .maybeSingle();
        if (!faktura || faktura.deleted_at) {
          return new Response("Odkaz nie je platný.", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        try {
          const { ensureInvoicePdf } = await import("@/lib/faktero/invoice-pdf.server");
          const { path, fileName } = await ensureInvoicePdf(faktura.id);
          const { data: subor } = await supabaseAdmin.storage.from("invoice-pdfs").download(path);
          if (!subor) throw new Error("PDF sa nenašlo");

          return new Response(await subor.arrayBuffer(), {
            status: 200,
            headers: {
              "content-type": "application/pdf",
              "content-disposition": `inline; filename="${fileName.replace(/[^\w.-]+/g, "_")}"`,
              // Odkaz visí v účtovnom programe — nech ho nikto neindexuje.
              "x-robots-tag": "noindex, nofollow",
              "cache-control": "private, max-age=300",
            },
          });
        } catch (e) {
          console.error("[faktura-pdf]", e);
          return new Response("PDF sa nepodarilo pripraviť.", {
            status: 500,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
      },
    },
  },
});
