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
  /** Len udalosti bez vplyvu na peniaze; úhradu a storno posiela fronta webhookov. */
  event: z.enum(["invoice.created", "invoice.sent", "customer.created"]),
  /** Id faktúry alebo kontaktu — údaje udalosti sa načítajú z databázy. */
  id: z.string().uuid(),
});

export const triggerEventFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => TriggerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { prekazkaUdalosti } = await import("./webhook-udalost-klienta");
    const { overPristup } = await import("./over-pristup");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const faktura = data.event !== "customer.created";
    // Čítanie cez RLS používateľa — cudzí doklad sa nenájde.
    const { data: riadok } = await (context.supabase as any)
      .from(faktura ? "invoices" : "customers")
      .select(faktura ? "*" : "id, company_id, name, email, ico, external_id, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!riadok) throw new Error("Doklad sa nenašiel.");
    await overPristup(context, riadok.company_id, {
      oblast: faktura ? "faktury" : "kontakty",
      zapis: true,
    });
    const prekazka = prekazkaUdalosti(data.event, riadok);
    if (prekazka) return { ok: false, dovod: prekazka };
    // Tá istá udalosť za ten istý doklad odíde len raz.
    const { count } = await (supabaseAdmin as any)
      .from("webhook_delivery_logs")
      .select("id", { count: "exact", head: true })
      .eq("company_id", riadok.company_id)
      .eq("event_type", data.event)
      .eq(faktura ? "payload->data->>invoice_id" : "payload->data->>customer_id", riadok.id);
    if ((count ?? 0) > 0) return { ok: false, dovod: "Udalosť už odišla." };
    const { triggerEvent, invoicePayload, customerPayload } = await import(
      "./webhook-trigger.server"
    );
    await triggerEvent({
      company_id: riadok.company_id,
      event: data.event,
      data: faktura ? invoicePayload(riadok) : customerPayload(riadok),
    });
    return { ok: true };
  });
