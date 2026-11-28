import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Daňový kalendár firmy (FAK-667). Fakty o firme sa zbierajú z dát (platiteľ,
  paragraf, krajina, zamestnanci, vozidlá, OSS, dodania do EÚ, samozdanenie
  pri § 7/7a), nastavenia z `companies.danovy_kalendar`. Výpočet je čistá
  funkcia v `danovy-kalendar.ts`. Číta sa klientom prihláseného (RLS).
  POZOR: v *.functions.ts len createServerFn — obyčajný export zhodí build.
*/

const Nastavenia = z
  .object({
    dph_obdobie: z.enum(["mesacne", "stvrtrocne"]).optional(),
    sv_stvrtrocne: z.boolean().optional(),
    preddavky_dzp: z.enum(["ziadne", "stvrtrocne", "mesacne"]).optional(),
    odklad_dp: z.union([z.literal(0), z.literal(3), z.literal(6)]).optional(),
    nehnutelnost_priznanie: z.boolean().optional(),
    dmv_preddavky: z.enum(["ziadne", "stvrtrocne", "mesacne"]).optional(),
    vyplatny_den: z.number().int().min(1).max(31).nullable().optional(),
    cz_poradca: z.boolean().optional(),
    cz_zalohy: z.enum(["ziadne", "pololetne", "stvrtrocne"]).optional(),
  })
  .strict();

const mesiac = (d: string | null | undefined) => (d ? String(d).slice(0, 7) : null);

export const danovyKalendarFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        od: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        do: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { kalendarFirmy } = await import("./danovy-kalendar.server");
    return kalendarFirmy(context.supabase as any, data.company_id, data.od, data.do);
  });

export const ulozNastaveniaKalendaraFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid(), nastavenia: Nastavenia }).parse(d))
  .handler(async ({ data, context }) => {
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { spravca: true });
    const { error } = await (context.supabase as any)
      .from("companies")
      .update({ danovy_kalendar: data.nastavenia })
      .eq("id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
