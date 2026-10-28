import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  recipient_email: z.string().email().max(255).optional(),
  subject: z.string().max(255).optional(),
  message: z.string().max(5000).optional(),
  /*
    Prvé odoslanie so starším dátumom vystavenia sa odmietne (409
    issue_date_in_past). `update_issue_date` ho pred odoslaním zmení na dnes
    (splatnosť sa posunie o rovnaký počet dní), `keep_issue_date` pošle doklad
    s pôvodným dátumom — len keď sa zmeniť nedá (uzamknuté obdobie, export).
  */
  update_issue_date: z.boolean().optional(),
  keep_issue_date: z.boolean().optional(),
});

export const Route = createFileRoute("/api/v1/invoices/$id/send")({
  server: {
    handlers: {
      GET: async () => (await import("@/lib/faktero/api-auth.server")).metodaNepovolena("POST"),
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

          const datum = await import("@/lib/faktero/datum-vystavenia.server");
          const kontrola = await datum.kontrolaPredOdoslanim(inv.id, ctx.company_id);
          if (kontrola.treba) {
            if (kontrola.mozno && parsed.data.update_issue_date) {
              try {
                await datum.zmenDatumNaDnes(ctx.supabase, inv.id, ctx.company_id);
              } catch (e: any) {
                return err(
                  "invalid_state",
                  e?.message ?? "Dátum vystavenia sa nepodarilo zmeniť.",
                  409,
                );
              }
            } else if (!(!kontrola.mozno && parsed.data.keep_issue_date)) {
              return err(
                "issue_date_in_past",
                kontrola.mozno
                  ? 'Dátum vystavenia nie je dnešný. Pošlite požiadavku znova s "update_issue_date": true — dátum sa zmení na dnes a splatnosť sa posunie o rovnaký počet dní.'
                  : `Dátum vystavenia nie je dnešný a zmeniť sa nedá (${kontrola.dovod?.replace("{datum}", kontrola.zamknuteDo ?? "")}). Odoslať s pôvodným dátumom sa dá s \"keep_issue_date\": true.`,
                409,
                {
                  issue_date: kontrola.datum,
                  today: kontrola.dnes,
                  new_due_date: kontrola.novaSplatnost,
                  can_update: kontrola.mozno,
                },
              );
            }
          }

          try {
            const { sendInvoiceEmail } = await import("@/lib/faktero/email.server");
            const r = await sendInvoiceEmail({
              company_id: ctx.company_id,
              invoice_id: inv.id,
              recipient_email: to,
              subject: parsed.data.subject,
              message: parsed.data.message,
              potvrdeny_stary_datum: parsed.data.keep_issue_date,
            });
            return ok({ status: "sent", message_id: r.message_id });
          } catch (e: any) {
            // Strážca odosielania (strop adresátov, podozrivý obsah, pozastavenie).
            if (e?.code === "issue_date_in_past") return err("issue_date_in_past", e.message, 409);
            if (e?.code === "approval_pending") return err("approval_pending", e.message, 409);
            if (e?.name === "OdosielanieZastavene")
              return err("sending_blocked", e.message, 429, { reason: e.dovod ?? null });
            return err("send_failed", e?.message ?? "Odoslanie zlyhalo.", 502);
          }
        });
      },
    },
  },
});
