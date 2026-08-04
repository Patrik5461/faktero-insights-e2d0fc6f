import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  recipient_email: z.string().email().max(255).optional(),
  subject: z.string().max(255).optional(),
  message: z.string().max(5000).optional(),
});

export const Route = createFileRoute("/api/v1/invoices/$id/send")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { handleApi, ok, err } = await import("@/lib/faktero/api-auth.server");
        return handleApi(request, async (ctx) => {
          const parsed = Body.safeParse(ctx.requestBody ?? {});
          if (!parsed.success)
            return err("validation_error", "Neplatné dáta.", 400, parsed.error.flatten());

          const { isCompanyActive } = await import("@/lib/faktero/active-check.server");
          if (!(await isCompanyActive(ctx.company_id))) {
            return err(
              "plan_inactive",
              "Vaše predplatné nie je aktívne. Pre pokračovanie si aktivujte plán.",
              402,
            );
          }

          const { data: inv } = await ctx.supabase
            .from("invoices")
            .select("id, company_id, customer_email, status")
            .eq("id", params.id)
            .eq("company_id", ctx.company_id)
            .maybeSingle();
          if (!inv) return err("not_found", "Faktúra nenájdená.", 404);
          if (inv.status === "cancelled")
            return err("invalid_state", "Stornovanú faktúru nemožno odoslať.", 409);

          const to = parsed.data.recipient_email ?? inv.customer_email ?? null;
          if (!to) return err("missing_recipient", "Chýba e-mailová adresa odberateľa.", 400);

          try {
            const { sendInvoiceEmail } = await import("@/lib/faktero/email.server");
            const r = await sendInvoiceEmail({
              company_id: ctx.company_id,
              invoice_id: inv.id,
              recipient_email: to,
              subject: parsed.data.subject,
              message: parsed.data.message,
            });
            return ok({ status: "sent", message_id: r.message_id });
          } catch (e: any) {
            return err("send_failed", e?.message ?? "Odoslanie zlyhalo.", 502);
          }
        });
      },
    },
  },
});
