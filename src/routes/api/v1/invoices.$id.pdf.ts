import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/invoices/$id/pdf")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const { data: inv, error } = await ctx.supabase.from("invoices")
            .select("id").eq("id", params.id).eq("company_id", ctx.company_id).maybeSingle();
          if (error) { console.error("[api/pdf] db error", error); return err("db_error", error.message, 500); }
          if (!inv) return err("not_found", "Faktúra nenájdená.", 404);

          const { ensureInvoicePdf, signInvoicePdf } = await import("@/lib/faktero/invoice-pdf.server");
          try {
            // Generates and stores the PDF first when the cache is empty or stale.
            const { path, fileName } = await ensureInvoicePdf(params.id);
            const url = await signInvoicePdf(path, fileName);
            return ok({ url, expires_in: 3600 });
          } catch (e: any) {
            console.error("[api/pdf] generate failed", params.id, e);
            return err("generate_error", "PDF sa nepodarilo vygenerovať.", 500);
          }
        });
      },
    },
  },
});
