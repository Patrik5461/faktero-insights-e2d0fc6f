import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SendInput = z.object({
  invoiceId: z.string().uuid(),
  reminderNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  recipient_email: z.string().email().max(255),
  subject: z.string().max(255).optional(),
  message: z.string().max(10000).optional(),
});

export const sendReminderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: inv } = await context.supabase
      .from("invoices").select("id, company_id").eq("id", data.invoiceId).maybeSingle();
    if (!inv) throw new Error("Faktúra nenájdená");
    const { sendReminder } = await import("./reminders.server");
    return sendReminder({
      company_id: inv.company_id,
      invoice_id: inv.id,
      reminderNumber: data.reminderNumber as 1 | 2 | 3,
      recipient_email: data.recipient_email,
      overrideSubject: data.subject,
      overrideMessage: data.message,
      triggeredBy: "manual",
    });
  });

const PreviewInput = z.object({
  invoiceId: z.string().uuid(),
  reminderNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const previewReminderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PreviewInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: inv } = await context.supabase
      .from("invoices").select("*").eq("id", data.invoiceId).maybeSingle();
    if (!inv) throw new Error("Faktúra nenájdená");
    const { data: company } = await context.supabase
      .from("companies").select("*").eq("id", inv.company_id).maybeSingle();
    let recipient = "";
    if (inv.customer_id) {
      const { data: c } = await context.supabase
        .from("customers").select("email").eq("id", inv.customer_id).maybeSingle();
      recipient = c?.email ?? "";
    }
    const { buildReminderContent } = await import("./reminders.server");
    const built = buildReminderContent({
      invoice: inv, company,
      reminderNumber: data.reminderNumber as 1 | 2 | 3,
    });
    return {
      recipient_email: recipient,
      subject: built.subject,
      message: built.plain,
    };
  });
