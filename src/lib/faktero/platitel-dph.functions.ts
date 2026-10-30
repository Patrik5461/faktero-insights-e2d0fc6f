import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { overPristup } from "./over-pristup";

const Vstup = z.object({ company_id: z.string().uuid() });

/**
 * Stav overenia platiteľstva DPH pre nastavenia firmy: posledné overenie,
 * história zmien a či nastavenie firmy s registrom sedí. Číta sa cez RLS
 * prihláseného — `dph_overenia` vidí každý člen firmy.
 */
export const stavPlatitelaDphFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Vstup.parse(input))
  .handler(async ({ data, context }) => {
    await overPristup(context, data.company_id);
    // Nové stĺpce a tabuľka ešte nemusia byť v typoch databázy.
    const db = context.supabase as any;
    const [{ data: firma }, { data: historia }] = await Promise.all([
      db
        .from("companies")
        .select(
          "country, ico, dic, ic_dph, vat_payer, vat_scheme, dph_auto_overenie, dph_overene_at",
        )
        .eq("id", data.company_id)
        .maybeSingle(),
      db
        .from("dph_overenia")
        .select(
          "id, overene_at, naposledy_at, zdroj, stav, schema, ic_dph, platne_od, zrusene_od, zoznam_k, zmena, predosla_schema, doplnene, nesulad, sposob",
        )
        .eq("company_id", data.company_id)
        .order("overene_at", { ascending: false })
        .limit(20),
    ]);
    const { porovnaj } = await import("./platitel-dph");
    const posledne = ((historia ?? []) as any[]).find((h) => h.stav !== "chyba") ?? null;
    const chyba = ((historia ?? []) as any[])[0]?.stav === "chyba" ? (historia as any[])[0] : null;
    // Nesúlad sa počíta proti dnešnému nastaveniu firmy — keď ho človek medzitým
    // opravil ručne, upozornenie zmizne hneď, nie až po ďalšom behu cronu.
    const nesulad =
      firma && posledne
        ? porovnaj(firma as any, {
            zdroj: posledne.zdroj,
            stav: posledne.stav,
            schema: posledne.schema,
            icDph: posledne.ic_dph,
            platneOd: posledne.platne_od,
            zruseneOd: posledne.zrusene_od,
            dovodyNaZrusenie: null,
            nespolehlivy: false,
            zoznamK: posledne.zoznam_k,
            odpoved: null,
            chyba: null,
          }).nesulad
        : false;
    return {
      auto: (firma as any)?.dph_auto_overenie !== false,
      overene_at: ((firma as any)?.dph_overene_at as string | null) ?? null,
      posledne,
      chyba: chyba ? { at: chyba.naposledy_at as string } : null,
      nesulad,
      historia: ((historia ?? []) as any[]).filter((h) => h.stav !== "chyba"),
    };
  });

/** Overiť teraz — ktorýkoľvek člen; zapisuje len výsledok a prázdne polia. */
export const overPlatitelaDphFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Vstup.parse(input))
  .handler(async ({ data, context }) => {
    await overPristup(context, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { overFirmu } = await import("./platitel-dph.server");
    const r = await overFirmu(supabaseAdmin as any, data.company_id, {
      sposob: "rucne",
      userId: context.userId,
    });
    return {
      stav: r.vysledok?.stav ?? null,
      chyba: r.vysledok?.chyba ?? null,
      doplnene: r.porovnanie?.doplnit ?? null,
    };
  });

/** Prevziať z registra — prepíše režim DPH firmy; len majiteľ alebo admin. */
export const prevezmiPlatitelaDphFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Vstup.parse(input))
  .handler(async ({ data, context }) => {
    await overPristup(context, data.company_id, { spravca: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { prevezmiZRegistra } = await import("./platitel-dph.server");
    const v = await prevezmiZRegistra(supabaseAdmin as any, data.company_id, context.userId);
    return { schema: v.schema, vat_payer: v.stav === "platitel", ic_dph: v.icDph };
  });
