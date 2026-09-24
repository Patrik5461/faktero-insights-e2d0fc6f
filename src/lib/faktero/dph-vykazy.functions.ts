import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RucneRiadky } from "./dph-vykazy";

/**
 * Zostavenie výkazov k DPH za zdaňovacie obdobie.
 *
 * Číta sa cez prihláseného používateľa (teda pod RLS), lebo výkaz je citlivý
 * pohľad na celé účtovníctvo firmy a nemá zmysel ho obchádzať servisným kľúčom.
 */

const Obdobie = z
  .object({
    company_id: z.string().uuid(),
    rok: z.number().int().min(2020).max(2100),
    mesiac: z.number().int().min(1).max(12).nullable().optional(),
    stvrtrok: z.number().int().min(1).max(4).nullable().optional(),
    /** Riadky priznania, ktoré z dokladov nevyplývajú. */
    rucne: z.record(z.string(), z.number()).optional(),
  })
  .refine((d) => Boolean(d.mesiac) !== Boolean(d.stvrtrok), {
    message: "Zadajte mesiac alebo štvrťrok, nie oboje.",
  });

export const zostavVykazyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Obdobie.parse(input))
  .handler(async ({ data, context }) => {
    const { nacitajVstup } = await import("./dph-vykazy.server");
    const { kontrolnyVykaz, priznanie, suhrnnyVykaz } = await import("./dph-vykazy");

    const obdobie = { rok: data.rok, mesiac: data.mesiac ?? null, stvrtrok: data.stvrtrok ?? null };
    const { data: firma } = await context.supabase
      .from("companies")
      .select(
        "name, ico, dic, ic_dph, street, city, zip, country, phone, email, vat_payer, vat_scheme",
      )
      .eq("id", data.company_id)
      .maybeSingle();
    if (!firma) throw new Error("Firma sa nenašla.");

    const { vstup, vytky } = await nacitajVstup(context.supabase as any, data.company_id, obdobie);
    const kv = kontrolnyVykaz(vstup);
    const sv = suhrnnyVykaz(vstup);
    const dp = priznanie(vstup, (data.rucne ?? {}) as RucneRiadky);

    // Posledný uložený výkaz drží údaje hlavičky (daňový úrad, kto podáva),
    // aby sa nemuseli písať každý mesiac odznova.
    const { data: posledny } = await context.supabase
      .from("vat_reports")
      .select("data")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      obdobie,
      firma,
      kv,
      sv,
      priznanie: dp,
      vytky: [...vytky, ...kv.vytky, ...sv.vytky],
      pocty: {
        vystavene: vstup.vystavene.length,
        prijate: vstup.prijate.length,
        doklady: vstup.doklady.length,
      },
      hlavicka: {
        danovyUrad: (posledny?.data as any)?.danovyUrad ?? "",
        konatel: (posledny?.data as any)?.konatel ?? "",
      },
    };
  });

const Ulozenie = z.object({
  company_id: z.string().uuid(),
  druh: z.enum(["priznanie", "kv", "sv"]),
  typ: z.enum(["R", "O", "D"]).default("R"),
  rok: z.number().int(),
  mesiac: z.number().int().min(1).max(12).nullable().optional(),
  stvrtrok: z.number().int().min(1).max(4).nullable().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
  podane: z.boolean().default(false),
});

/** Uloží zostavený výkaz — aby sa dalo dohľadať, čo a kedy sa podávalo. */
export const ulozVykazFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Ulozenie.parse(input))
  .handler(async ({ data, context }) => {
    const { data: riadok, error } = await context.supabase
      .from("vat_reports")
      .insert({
        company_id: data.company_id,
        druh: data.druh,
        typ: data.typ,
        rok: data.rok,
        mesiac: data.mesiac ?? null,
        stvrtrok: data.stvrtrok ?? null,
        data: data.data as any,
        podane_at: data.podane ? new Date().toISOString() : null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: riadok.id as string };
  });

/** Čo sa už za rok podalo — prehľad nad obdobiami. */
export const zoznamVykazovFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { company_id: string; rok: number }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("vat_reports")
      .select("id, druh, typ, rok, mesiac, stvrtrok, podane_at, created_at")
      .eq("company_id", data.company_id)
      .eq("rok", data.rok)
      .order("created_at", { ascending: false });
    return { rows: rows ?? [] };
  });
