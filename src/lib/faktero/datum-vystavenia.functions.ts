import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Pred prvým odoslaním: treba zmeniť dátum vystavenia na dnes?
 * Viac faktúr naraz kvôli hromadnému odoslaniu zo zoznamu.
 */
export const kontrolaDatumuVystaveniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ invoiceIds: z.array(z.string().uuid()).min(1).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // RLS: vidno len faktúry firiem, ku ktorým človek patrí.
    const { data: faktury, error } = await context.supabase
      .from("invoices")
      .select("id, company_id")
      .in("id", data.invoiceIds);
    if (error) throw new Error(error.message);
    const { kontrolaPredOdoslanim } = await import("./datum-vystavenia.server");
    const vysledok: Record<string, import("./datum-vystavenia").KontrolaDatumu> = {};
    for (const f of faktury ?? []) {
      vysledok[f.id] = await kontrolaPredOdoslanim(f.id, f.company_id);
    }
    return vysledok;
  });

/** Zmení dátum vystavenia na dnešok (splatnosť sa posunie, dodanie ostáva). */
export const zmenDatumVystaveniaNaDnesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: f } = await context.supabase
      .from("invoices")
      .select("id, company_id")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (!f) throw new Error("Faktúra nenájdená");
    const { assertCompanyActive } = await import("./active-check.server");
    await assertCompanyActive(f.company_id);
    const { zmenDatumNaDnes } = await import("./datum-vystavenia.server");
    // Zápis prihláseným používateľom — rovnaké práva a zámok ako pri oprave faktúry.
    return zmenDatumNaDnes(context.supabase as any, f.id, f.company_id);
  });
