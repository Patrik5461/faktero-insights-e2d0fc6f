import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Prepočet dokladu v cudzej mene na eurá.
 *
 * Volá sa hneď po vystavení faktúry. Keby sa počítal až pri tlači, doklad by
 * v databáze ostal bez eurových súm a výkazy k DPH by ho museli preskočiť.
 */
export const prepocitajFakturuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: f } = await context.supabase
      .from("invoices")
      .select("id, currency, issue_date, delivery_date, subtotal, vat_total, total")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (!f) throw new Error("Faktúra sa nenašla.");
    if (!f.currency || f.currency === "EUR") return { prepocitane: false as const };

    const { prepocitajDoklad } = await import("./kurzy.server");
    const p = await prepocitajDoklad(f.currency, String(f.delivery_date || f.issue_date), {
      zaklad: Number(f.subtotal ?? 0),
      dan: Number(f.vat_total ?? 0),
      celkom: Number(f.total ?? 0),
    });
    if (!p) return { prepocitane: false as const };

    await context.supabase
      .from("invoices")
      .update({
        exchange_rate: p.kurz,
        exchange_rate_date: p.den,
        subtotal_eur: p.zaklad,
        vat_total_eur: p.dan,
        total_eur: p.celkom,
      })
      .eq("id", f.id);
    return { prepocitane: true as const, kurz: p.kurz, den: p.den, danEur: p.dan };
  });

/** To isté pre prijatú faktúru — do priznania vstupuje v eurách. */
export const prepocitajPrijatuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: f } = await context.supabase
      .from("purchase_invoices")
      .select(
        "id, currency, issue_date, delivery_date, amount_without_vat, vat_amount, amount_total",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (!f) throw new Error("Faktúra sa nenašla.");
    if (!f.currency || f.currency === "EUR") return { prepocitane: false as const };

    const { prepocitajDoklad } = await import("./kurzy.server");
    const p = await prepocitajDoklad(f.currency, String(f.delivery_date || f.issue_date), {
      zaklad: Number(f.amount_without_vat ?? 0),
      dan: Number(f.vat_amount ?? 0),
      celkom: Number(f.amount_total ?? 0),
    });
    if (!p) return { prepocitane: false as const };

    await context.supabase
      .from("purchase_invoices")
      .update({
        exchange_rate: p.kurz,
        amount_without_vat_eur: p.zaklad,
        vat_amount_eur: p.dan,
      })
      .eq("id", f.id);
    return { prepocitane: true as const, kurz: p.kurz, den: p.den, danEur: p.dan };
  });

/** Kurz na obrazovku — pri vystavovaní faktúry v cudzej mene. */
export const kurzKuDnuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ mena: z.string().min(3).max(3), den: z.string() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { kurzPreDoklad } = await import("./kurzy.server");
    return (await kurzPreDoklad(data.mena, data.den)) ?? null;
  });
