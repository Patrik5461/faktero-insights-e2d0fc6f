import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Exporty → „Kontrola pred odovzdaním“ a „Rozdiely oproti Pohode“.
  Logika je v `pohoda-kontrola.server.ts`; číta sa prihláseným klientom.
*/

/** Doklady, ktoré ručný export, balík aj konektor do Pohody nepustia, s dôvodom. */
export const zastaveneDokladyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { zastaveneDoklady } = await import("./pohoda-kontrola.server");
    const vsetky = await zastaveneDoklady(context.supabase as any, data.company_id);
    return {
      doklady: vsetky.filter((d) => !d.varovanie),
      // Upozornenia doklad nezastavia (napr. záväzkový kód v rozúčtovaní).
      varovania: vsetky.filter((d) => d.varovanie),
    };
  });

/** Odovzdané doklady, ktoré sa od odoslaného XML zmenili (alebo by dnes neprešli). */
export const rozdielyOprotiPohodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { rozdielyOprotiPohode } = await import("./pohoda-kontrola.server");
    return await rozdielyOprotiPohode(context.supabase as any, data.company_id);
  });
