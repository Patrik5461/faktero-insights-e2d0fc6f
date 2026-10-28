import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MOZNOSTI_EXPORTU, MOZNOSTI_TEXTU_PRIJEMCU } from "./export-nastavenia";

/*
  Uloženie nastavení exportu do účtovníctva a nastavení banky do
  `companies.uctovanie_nastavenia` (kľúče `export` a `banka`). Ukladá sa len
  to, čo prišlo — ostatné kľúče JSON-u (nastavenia programov, Nespracované)
  aj ostatné voľby ostanú. Cez klienta prihláseného: RLS rozhodne, kto smie
  firmu meniť, a `select` po zápise povie, či sa naozaj zapísalo.
*/

const datum = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const exportSchema = z
  .object({
    datumZapisu: z.enum(MOZNOSTI_EXPORTU.datumZapisu),
    datumOdpoctu: z.enum(MOZNOSTI_EXPORTU.datumOdpoctu),
    textPrijate: z.enum(MOZNOSTI_EXPORTU.textPrijate),
    textVystavene: z.enum(MOZNOSTI_EXPORTU.textVystavene),
    intPoznamkaPrijate: z.enum(MOZNOSTI_EXPORTU.intPoznamkaPrijate),
    intPoznamkaBlocky: z.enum(MOZNOSTI_EXPORTU.intPoznamkaBlocky),
    partneri: z.enum(MOZNOSTI_EXPORTU.partneri),
    dokladKPlatbe: z.enum(MOZNOSTI_EXPORTU.dokladKPlatbe),
    polozkyZRozpisu: z.boolean(),
    nazovOdpoctu: z.enum(MOZNOSTI_EXPORTU.nazovOdpoctu),
  })
  .partial();

const bankaSchema = z
  .object({
    ignorovatTypPlatby: z.boolean(),
    synchronizovatOd: datum,
    autoParovanieOd: datum,
    textPrijemcu: z.enum(MOZNOSTI_TEXTU_PRIJEMCU),
  })
  .partial();

export const ulozNastaveniaUctovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        export: exportSchema.optional(),
        banka: bankaSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: f, error: e1 } = await supabase
      .from("companies")
      .select("uctovanie_nastavenia")
      .eq("id", data.company_id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!f) throw new Error("Firma sa nenašla alebo k nej nemáte prístup.");
    const un = ((f.uctovanie_nastavenia as Record<string, any> | null) ?? {}) as Record<
      string,
      any
    >;
    const nove: Record<string, any> = { ...un };
    if (data.export) nove.export = { ...(un.export ?? {}), ...data.export };
    if (data.banka) nove.banka = { ...(un.banka ?? {}), ...data.banka };
    const { data: upd, error } = await supabase
      .from("companies")
      .update({ uctovanie_nastavenia: nove })
      .eq("id", data.company_id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!upd?.length) throw new Error("Nastavenia firmy môže meniť len jej správca.");
    return { ok: true };
  });
