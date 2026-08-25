import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { buildNotifications, applyReadState, type NotificationInput } from "./notifications";

const CompanyInput = z.object({ company_id: z.string().uuid() });

const MarkInput = z.object({
  company_id: z.string().uuid(),
  /** Prázdny zoznam znamená „označ všetko, čo teraz visí". */
  keys: z.array(z.string().min(1).max(200)).max(500).optional(),
});

async function assertMember(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/** Koľko riadkov si od každého zdroja pýtame. Zvonček nie je zoznam faktúr. */
const LIMIT = 50;

async function zozbierajSignaly(companyId: string): Promise<NotificationInput> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date().toISOString().slice(0, 10);

  const [faktury, prijate, transakcie, platby] = await Promise.all([
    supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, customer_name, total, currency, due_date")
      .eq("company_id", companyId)
      .in("status", ["sent", "issued", "overdue"])
      .lt("due_date", today)
      .is("deleted_at", null)
      // Zvonček hlási pohľadávky po splatnosti. Zálohová faktúra ani dobropis
      // medzi ne nepatria — rovnaké pravidlo ako `jeOtvorena`.
      .or("type.is.null,type.eq.regular")
      .order("due_date", { ascending: true })
      .limit(LIMIT),
    supabaseAdmin
      .from("purchase_invoices")
      .select("id, invoice_number, supplier_name, amount_total, currency, due_date")
      .eq("company_id", companyId)
      .in("status", ["received", "booked"])
      .lt("due_date", today)
      .is("deleted_at", null)
      .order("due_date", { ascending: true })
      .limit(LIMIT),
    // Len príchodzie platby — odchodzie sa k faktúram nepárujú.
    supabaseAdmin
      .from("bank_transactions")
      .select("id, booking_date, amount, currency, counterparty, variable_symbol")
      .eq("company_id", companyId)
      .is("matched_invoice_id", null)
      .gt("amount", 0)
      .order("booking_date", { ascending: false })
      .limit(LIMIT),
    supabaseAdmin
      .from("bank_payments")
      .select(
        "id, purchase_invoice_id, creditor_name, amount, currency, status, error_message, updated_at",
      )
      .eq("company_id", companyId)
      .in("status", ["rejected", "failed"])
      .order("updated_at", { ascending: false })
      .limit(LIMIT),
  ]);

  return {
    today,
    overdueInvoices: (faktury.data as any[]) ?? [],
    overduePurchases: (prijate.data as any[]) ?? [],
    unmatchedIncoming: (transakcie.data as any[]) ?? [],
    failedPayments: (platby.data as any[]) ?? [],
  };
}

/** Čo má firma práve teraz na stole, aj s tým, čo si už používateľ prečítal. */
export const listNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [signaly, precitane] = await Promise.all([
      zozbierajSignaly(data.company_id),
      supabaseAdmin
        .from("notification_reads")
        .select("notification_key")
        .eq("company_id", data.company_id)
        .eq("user_id", context.userId),
    ]);

    const vsetky = buildNotifications(signaly);
    const kluce = ((precitane.data as any[]) ?? []).map((r) => r.notification_key as string);
    return applyReadState(vsetky, kluce);
  });

/** Označí notifikácie za prečítané. Bez zoznamu kľúčov označí všetky súčasné. */
export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => MarkInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const keys =
      data.keys && data.keys.length > 0
        ? data.keys
        : buildNotifications(await zozbierajSignaly(data.company_id)).map((n) => n.key);
    if (keys.length === 0) return { ok: true, marked: 0 };

    // Kľúč sa môže označiť opakovane — unikátny index to pretečie na no-op.
    const { error } = await supabaseAdmin.from("notification_reads").upsert(
      keys.map((notification_key) => ({
        company_id: data.company_id,
        user_id: context.userId,
        notification_key,
      })),
      { onConflict: "company_id,user_id,notification_key", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return { ok: true, marked: keys.length };
  });
