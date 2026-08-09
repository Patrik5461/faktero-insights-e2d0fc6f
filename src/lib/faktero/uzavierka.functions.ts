import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { jeDatum } from "./uzavierka";

/**
 * Uzamknutie období.
 *
 * Zámok samotný drží `companies.locked_until`; to, že doklad z uzavretého
 * obdobia neprejde, vynucujú triggery v databáze, nie tieto funkcie. Kontrola
 * v aplikácii by sa dala obísť priamym volaním PostgRESTu.
 */

const CompanyScoped = z.object({ company_id: z.string().uuid() });

export const getPeriodLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { data: company, error } = await context.supabase
      .from("companies")
      .select("id, name, locked_until")
      .eq("id", data.company_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!company) throw new Error("Firma nenájdená.");

    const { data: admin } = await context.supabase.rpc("is_company_admin", {
      _company_id: data.company_id,
      _user_id: context.userId,
    });

    // Koľko doteraz nezamknutých dokladov by zámok pokryl — bez toho človek
    // netuší, čoho sa rozhodnutie týka.
    const [{ count: faktury }, { count: prijate }, { count: jazdy }] = await Promise.all([
      context.supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.company_id)
        .is("deleted_at", null),
      context.supabase
        .from("purchase_invoices")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.company_id)
        .is("deleted_at", null),
      context.supabase
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("company_id", data.company_id),
    ]);

    return {
      locked_until: company.locked_until as string | null,
      je_admin: !!admin,
      pocty: { faktury: faktury ?? 0, prijate: prijate ?? 0, jazdy: jazdy ?? 0 },
    };
  });

export const setPeriodLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      // `null` zámok zruší úplne.
      locked_until: z.string().date().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.locked_until !== null && !jeDatum(data.locked_until)) {
      throw new Error("Dátum musí byť v tvare RRRR-MM-DD.");
    }

    const { data: admin } = await context.supabase.rpc("is_company_admin", {
      _company_id: data.company_id,
      _user_id: context.userId,
    });
    if (!admin) throw new Error("Uzávierku môže meniť len správca firmy.");

    const { error } = await context.supabase
      .from("companies")
      .update({ locked_until: data.locked_until })
      .eq("id", data.company_id);
    if (error) throw new Error(error.message);

    return { ok: true, locked_until: data.locked_until };
  });
