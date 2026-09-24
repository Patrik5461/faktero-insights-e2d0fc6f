import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Overenie IČ DPH vo VIES aj so zápisom dôkazu.
 *
 * Zapisuje sa každé overenie, nielen to úspešné — pri kontrole sa preukazuje,
 * že sa overovalo v čase dodania, a rovnako dôležité je, keď register vypadol.
 */
export const overIcDphFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        ic_dph: z.string().min(4).max(20),
        customer_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { overVies } = await import("./vies.server");
    const { upravIcDph } = await import("./vies");
    const ic = upravIcDph(data.ic_dph);
    const v = await overVies(ic);

    await context.supabase.from("vies_checks").insert({
      company_id: data.company_id,
      customer_id: data.customer_id ?? null,
      ic_dph: ic,
      platne: v.platne,
      nazov: v.nazov ?? null,
      adresa: v.adresa ?? null,
      potvrdenie: v.potvrdenie ?? null,
      chyba: v.chyba ?? null,
      overil: context.userId,
    });

    // Posledný výsledok si drží aj odberateľ, nech ho vidno pri fakturácii.
    if (data.customer_id) {
      await context.supabase
        .from("customers")
        .update({ vies_platne: v.platne, vies_overene_at: new Date().toISOString() })
        .eq("id", data.customer_id);
    }

    return v;
  });

/** História overení odberateľa — dôkaz pri kontrole. */
export const historiaViesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { company_id: string; ic_dph: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("vies_checks")
      .select("id, ic_dph, platne, nazov, potvrdenie, chyba, overene_at")
      .eq("company_id", data.company_id)
      .eq("ic_dph", data.ic_dph.toUpperCase())
      .order("overene_at", { ascending: false })
      .limit(20);
    return { rows: rows ?? [] };
  });
