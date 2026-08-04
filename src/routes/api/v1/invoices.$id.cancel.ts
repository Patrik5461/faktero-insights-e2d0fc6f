import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/invoices/$id/cancel")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        const { triggerEvent, invoicePayload } =
          await import("@/lib/faktero/webhook-trigger.server");
        return handleApi(request, async (ctx) => {
          const { isCompanyActive } = await import("@/lib/faktero/active-check.server");
          if (!(await isCompanyActive(ctx.company_id))) {
            return err(
              "plan_inactive",
              "Vaše predplatné nie je aktívne. Pre pokračovanie si aktivujte plán.",
              402,
            );
          }
          const { data: existing } = await ctx.supabase
            .from("invoices")
            .select("status")
            .eq("id", params.id)
            .eq("company_id", ctx.company_id)
            .maybeSingle();
          if (!existing) return err("not_found", "Faktúra nenájdená.", 404);
          if (existing.status === "cancelled")
            return err("invalid_state", "Faktúra je už stornovaná.", 409);
          const { data, error } = await ctx.supabase
            .from("invoices")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("id", params.id)
            .eq("company_id", ctx.company_id)
            .select()
            .maybeSingle();
          if (error) return err("db_error", error.message, 500);
          if (!data) return err("not_found", "Faktúra nenájdená.", 404);
          await triggerEvent({
            company_id: ctx.company_id,
            event: "invoice.cancelled",
            data: invoicePayload(data),
          });
          return ok(data);
        });
      },
    },
  },
});
