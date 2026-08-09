import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dalsieCisloDokladu } from "./cislovanie";
import { priebehPokladne, stavPokladne } from "./pokladna";

/**
 * Pokladňa. Všetko ide cez klienta prihláseného používateľa, takže cudziu
 * firmu odfiltruje RLS — `supabaseAdmin` sa tu nepoužíva.
 */

const CompanyScoped = z.object({ company_id: z.string().uuid() });

/** Číslovanie PD{rok}{poradie}, rovnaký tvar ako ostatné doklady. */
async function dalsieCislo(supabase: any, companyId: string): Promise<string> {
  const prefix = `PD${new Date().getFullYear()}`;
  const { data: rows } = await supabase
    .from("cash_entries")
    .select("entry_number")
    .eq("company_id", companyId)
    .like("entry_number", `${prefix}%`)
    .limit(5000);
  return dalsieCisloDokladu(
    prefix,
    (rows ?? []).map((r: any) => r.entry_number),
  );
}

export const getCashBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      // `YYYY-MM`; bez neho sa vráti celý priebeh.
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .nullable()
        .optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [{ data: doklady }, { data: vydavky }, { data: firma }] = await Promise.all([
      context.supabase
        .from("cash_entries")
        .select("*")
        .eq("company_id", data.company_id)
        .order("entry_date", { ascending: true })
        .limit(5000),
      context.supabase
        .from("expense_documents")
        .select("id, issue_date, total_amount, payment_method, supplier_name, document_number")
        .eq("company_id", data.company_id)
        .eq("payment_method", "hotovost")
        .limit(5000),
      context.supabase
        .from("companies")
        .select("locked_until")
        .eq("id", data.company_id)
        .maybeSingle(),
    ]);

    // Priebeh sa počíta z celej histórie, aby zostatok na začiatku mesiaca
    // sedel; až potom sa oreže na zobrazovaný mesiac.
    const celyPriebeh = priebehPokladne(doklady ?? [], vydavky ?? []);
    const riadky = data.month
      ? celyPriebeh.filter((r) => r.datum.startsWith(data.month as string))
      : celyPriebeh;

    return {
      stav: stavPokladne(doklady ?? [], vydavky ?? []),
      riadky: [...riadky].reverse(),
      // Zostatok pred prvým riadkom mesiaca — počiatočný stav obdobia.
      pociatocny_stav_obdobia:
        riadky.length > 0
          ? Math.round(
              (riadky[0].zostatok -
                (riadky[0].typ === "prijem" ? riadky[0].suma : -riadky[0].suma)) *
                100,
            ) / 100
          : (celyPriebeh[celyPriebeh.length - 1]?.zostatok ?? 0),
      locked_until: (firma?.locked_until as string | null) ?? null,
    };
  });

export const createCashEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      type: z.enum(["prijem", "vydaj"]),
      amount: z.coerce.number().positive(),
      description: z.string().trim().min(1).max(255),
      entry_date: z.string().date(),
      category: z.string().trim().max(80).nullable().optional(),
      note: z.string().trim().max(2000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("cash_entries")
      .insert({
        company_id: data.company_id,
        entry_number: await dalsieCislo(supabase, data.company_id),
        entry_date: data.entry_date,
        type: data.type,
        amount: data.amount,
        description: data.description,
        category: data.category ?? null,
        note: data.note ?? null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Doklad sa nepodarilo uložiť.");
    return { id: row.id, entry_number: row.entry_number };
  });

export const deleteCashEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Doklad z uzavretého obdobia odmietne trigger `cash_entries_locked_period`.
    const { error } = await context.supabase
      .from("cash_entries")
      .delete()
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
