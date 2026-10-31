import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  invoiceId: z.string().uuid(),
  recipient_email: z.string().email().max(255),
  subject: z.string().max(255).optional(),
  message: z.string().max(5000).optional(),
  /** Priložiť k mailu aj súbory, ktoré visia na doklade. */
  s_prilohami: z.boolean().optional(),
  /** Odoslať so starším dátumom vystavenia — len keď sa zmeniť nedá. */
  potvrdeny_stary_datum: z.boolean().optional(),
  /** Číslo faktúry, s ktorým sa predvyplnil predmet a text okna. */
  cislo_v_okne: z.string().max(100).optional(),
});

export const sendInvoiceEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: inv } = await context.supabase
      .from("invoices")
      .select("id, company_id")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (!inv) throw new Error("Faktúra nenájdená");
    const { assertCompanyActive } = await import("./active-check.server");
    await assertCompanyActive(inv.company_id);
    const { sendInvoiceEmail } = await import("./email.server");
    return sendInvoiceEmail({
      company_id: inv.company_id,
      invoice_id: inv.id,
      recipient_email: data.recipient_email,
      subject: data.subject,
      message: data.message,
      s_prilohami: data.s_prilohami,
      potvrdeny_stary_datum: data.potvrdeny_stary_datum,
      cislo_v_okne: data.cislo_v_okne,
      user_id: context.userId,
    });
  });

const TriggerInput = z.object({
  companyId: z.string().uuid(),
  event: z.enum([
    "invoice.created",
    "invoice.sent",
    "invoice.paid",
    "invoice.cancelled",
    "customer.created",
  ]),
  data: z.record(z.string(), z.any()),
});

export const triggerEventFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => TriggerInput.parse(d))
  .handler(async ({ data, context }) => {
    // Verify caller is a member of this company
    const { data: cu } = await context.supabase
      .from("company_users")
      .select("user_id")
      .eq("company_id", data.companyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!cu) throw new Error("Forbidden");
    const { triggerEvent } = await import("./webhook-trigger.server");
    await triggerEvent({ company_id: data.companyId, event: data.event, data: data.data });
    return { ok: true };
  });
