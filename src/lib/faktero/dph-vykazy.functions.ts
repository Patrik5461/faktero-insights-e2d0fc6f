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
  druh: z.enum(["priznanie", "kv", "sv", "cz_dp3", "cz_kh", "cz_sh"]),
  typ: z.enum(["R", "O", "D", "B", "E", "N"]).default("R"),
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

/**
 * České výkazy — priznanie DPHDP3 za mesiac alebo štvrťrok a kontrolné
 * hlásenie DPHKH1 za každý mesiac obdobia (právnická osoba ho podáva vždy
 * mesačne). Sumy sú v korunách, z toho istého načítania ako slovenské výkazy.
 */
export const zostavCzVykazyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        rok: z.number().int().min(2020).max(2100),
        mesiac: z.number().int().min(1).max(12).nullable().optional(),
        stvrtrok: z.number().int().min(1).max(4).nullable().optional(),
        kod_predmetu: z.string().max(3).nullable().optional(),
      })
      .refine((d) => Boolean(d.mesiac) !== Boolean(d.stvrtrok), {
        message: "Zadajte mesiac alebo štvrťrok, nie oboje.",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { nacitajVstup } = await import("./dph-vykazy.server");
    const { priznaniCz, kontrolniHlaseni, souhrnneHlaseni } = await import("./cz-dph");

    const { data: firma } = await context.supabase
      .from("companies")
      .select(
        "name, ico, dic, ic_dph, street, city, zip, country, phone, email, vat_payer, vat_scheme",
      )
      .eq("id", data.company_id)
      .maybeSingle();
    if (!firma) throw new Error("Firma sa nenašla.");

    const obdobie = { rok: data.rok, mesiac: data.mesiac ?? null, stvrtrok: data.stvrtrok ?? null };
    const { vstup, vytky } = await nacitajVstup(context.supabase as any, data.company_id, obdobie);
    const dp = priznaniCz(vstup);
    // Súhrnné hlásenie za to isté obdobie (mesiac, pri samotných službách aj štvrťrok).
    const sh = souhrnneHlaseni(vstup);

    const { dicCz } = await import("./cz-dph");
    const vlastneDic = dicCz(firma.ic_dph, firma.dic);
    const mesiace = data.mesiac
      ? [data.mesiac]
      : [0, 1, 2].map((i) => (data.stvrtrok! - 1) * 3 + 1 + i);
    const hlasenia = [];
    for (const m of mesiace) {
      const o = { rok: data.rok, mesiac: m, stvrtrok: null };
      const { vstup: v } = data.mesiac
        ? { vstup }
        : await nacitajVstup(context.supabase as any, data.company_id, o);
      hlasenia.push({
        mesiac: m,
        kh: kontrolniHlaseni(v, { kodPredmetu: data.kod_predmetu, vlastneDic }),
      });
    }

    const { data: posledny } = await context.supabase
      .from("vat_reports")
      .select("data")
      .eq("company_id", data.company_id)
      .in("druh", ["cz_dp3", "cz_kh", "cz_sh"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const h = ((posledny?.data as any)?.hlavicka ?? {}) as Record<string, string>;

    return {
      obdobie,
      firma,
      priznani: dp.riadky,
      hlasenia,
      souhrnne: sh.riadky,
      vytky: [...vytky, ...dp.vytky, ...sh.vytky, ...hlasenia.flatMap((x) => x.kh.vytky)],
      pocty: {
        vystavene: vstup.vystavene.length,
        prijate: vstup.prijate.length,
        doklady: vstup.doklady.length,
      },
      hlavicka: {
        cUfo: h.cUfo ?? "",
        cPracufo: h.cPracufo ?? "",
        okec: h.okec ?? "",
        oprJmeno: h.oprJmeno ?? "",
        oprPrijmeni: h.oprPrijmeni ?? "",
        oprPostaveni: h.oprPostaveni ?? "",
        kodPredmetu: h.kodPredmetu ?? "",
      },
    };
  });
