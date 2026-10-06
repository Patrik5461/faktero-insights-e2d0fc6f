/**
 * Verejný odkaz na sken prijatého dokladu (bloček, prijatá faktúra).
 *
 * Rovnako ako odkaz na PDF faktúry: Pohoda vie v záložke Dokumenty niesť URL
 * do 255 znakov, podpísaný odkaz zo Supabase je dlhší a vyprší. Token vzniká
 * až pri odovzdaní do Pohody a dá sa vypnúť na stránke Predkontácie.
 */
import { createFileRoute } from "@tanstack/react-router";

const zle = (status: number, text: string) =>
  new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export const Route = createFileRoute("/api/public/doklad/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token ?? "");
        if (!/^[a-f0-9]{32}$/.test(token)) return zle(404, "Odkaz nie je platný.");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [{ data: doklad }, { data: prijata }] = await Promise.all([
          supabaseAdmin
            .from("expense_documents")
            .select("file_path, file_mime, document_number")
            .eq("pdf_token", token)
            .maybeSingle(),
          supabaseAdmin
            .from("purchase_invoices")
            .select("file_path, file_mime, invoice_number, deleted_at")
            .eq("pdf_token", token)
            .maybeSingle(),
        ]);
        const zdroj = doklad
          ? { bucket: "expense-receipts", cesta: doklad.file_path, mime: doklad.file_mime, cislo: doklad.document_number }
          : prijata && !prijata.deleted_at
            ? { bucket: "purchase-invoices", cesta: prijata.file_path, mime: prijata.file_mime, cislo: prijata.invoice_number }
            : null;
        if (!zdroj?.cesta) return zle(404, "Odkaz nie je platný.");

        const { data: subor } = await supabaseAdmin.storage.from(zdroj.bucket).download(zdroj.cesta);
        if (!subor) return zle(404, "Sken sa nenašiel.");
        const koncovka = String(zdroj.cesta).split(".").pop() ?? "pdf";
        const meno = `doklad-${String(zdroj.cislo ?? "").replace(/[^\w.-]+/g, "_") || "sken"}.${koncovka}`;
        return new Response(await subor.arrayBuffer(), {
          status: 200,
          headers: {
            "content-type": zdroj.mime || subor.type || "application/octet-stream",
            "content-disposition": `inline; filename="${meno}"`,
            "x-robots-tag": "noindex, nofollow",
            "cache-control": "private, max-age=300",
          },
        });
      },
    },
  },
});
