import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { overPristup } from "./over-pristup";

/**
 * Overenie dodávateľa v Registri plátců DPH — nespoľahlivý platca a či je
 * účet z faktúry zverejnený. Len pre českú firmu: slovenskej ručenie podľa
 * § 109 ZDPH nehrozí a register slovenské DIČ nepozná.
 */
export const overPlatceDphFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        dic: z.string().max(20),
        iban: z.string().max(40).nullable().optional(),
        obnovit: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await overPristup(context, data.company_id, { oblast: "doklady" });
    const { data: firma } = await context.supabase
      .from("companies")
      .select("country")
      .eq("id", data.company_id)
      .maybeSingle();
    const { krajinaKurzu } = await import("./kurzy");
    if (krajinaKurzu(firma?.country) !== "CZ") return null;

    const { dicPreRegister, jeUcetZverejneny } = await import("./cz-registr-dph");
    const dic = dicPreRegister(data.dic);
    if (!dic) return null;

    const overene_at = new Date().toISOString();
    try {
      const { stavPlatceDph } = await import("./cz-registr-dph.server");
      const s = await stavPlatceDph(dic, { obnovit: data.obnovit });
      return {
        dic,
        nalezen: s.nespolehlivy !== "NENALEZEN",
        nespolehlivy: s.nespolehlivy === "ANO",
        datumNespolehlivosti: s.datumNespolehlivosti,
        nazov: s.nazov,
        zverejneneUcty: s.ucty.filter((u) => !u.do).map((u) => u.zobrazenie),
        ucetZverejneny: jeUcetZverejneny(data.iban ?? null, s.ucty),
        overene_at,
        chyba: null as string | null,
      };
    } catch (e: any) {
      return {
        dic,
        nalezen: false,
        nespolehlivy: false,
        datumNespolehlivosti: null,
        nazov: null,
        zverejneneUcty: [] as string[],
        ucetZverejneny: null,
        overene_at,
        chyba: String(e?.message ?? e),
      };
    }
  });
