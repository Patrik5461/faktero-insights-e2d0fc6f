import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DRUHY_RADOV,
  NAZVY_DRUHOV,
  chybaSablony,
  normalizujSablonu,
  type CiselnyRad,
  type DruhRadu,
} from "./ciselne-rady";

/**
 * Správa číselných radov.
 *
 * Zápis ide cez klienta prihláseného používateľa, takže cudziu firmu
 * odfiltruje RLS. Čo sa tu strážiť musí, je zmysel: šablóna bez poradia by
 * dala každému dokladu to isté číslo a rad, z ktorého už doklady visia, sa
 * nesmie zmazať — číslo na papieri u zákazníka by prestalo na čokoľvek
 * ukazovať.
 */

const Druh = z.enum(DRUHY_RADOV);

/** Tabuľka a stĺpec, kde má daný druh dokladu svoje čísla. */
const KDE: Record<DruhRadu, { tabulka: string; stlpec: string }> = {
  invoice: { tabulka: "invoices", stlpec: "number_series_id" },
  proforma: { tabulka: "invoices", stlpec: "number_series_id" },
  credit_note: { tabulka: "invoices", stlpec: "number_series_id" },
  advance_payment: { tabulka: "invoices", stlpec: "number_series_id" },
  quote: { tabulka: "quotes", stlpec: "number_series_id" },
  sales_order: { tabulka: "sales_orders", stlpec: "number_series_id" },
  purchase_order: { tabulka: "purchase_orders", stlpec: "number_series_id" },
  cash: { tabulka: "cash_entries", stlpec: "number_series_id" },
};

export const ciselneRadyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ rady: CiselnyRad[] }> => {
    const { data: rows, error } = await context.supabase
      .from("number_series")
      .select("id, kind, name, format, is_default, active, start_from")
      .eq("company_id", data.company_id)
      .order("kind")
      .order("name");
    if (error) throw new Error(error.message);
    return { rady: (rows ?? []) as CiselnyRad[] };
  });

const Ulozenie = z.object({
  company_id: z.string().uuid(),
  id: z.string().uuid().optional(),
  kind: Druh,
  name: z.string().trim().min(1).max(60),
  format: z.string().trim().min(1).max(40),
  is_default: z.boolean().default(false),
  active: z.boolean().default(true),
  /* Od ktorého poradia rad začína — pri prechode z iného programu sa nadväzuje. */
  start_from: z.number().int().min(1).max(999999).default(1),
});

export const ulozCiselnyRadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Ulozenie.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const chyba = chybaSablony(data.format);
    if (chyba) throw new Error(chyba);
    /* Vlastný tvar sa berie, ako je — doplní sa len poradie, bez ktorého by číslo nerástlo. */
    const format = normalizujSablonu(data.format);

    /*
      Predvolený rad smie byť na druh dokladu len jeden — databáza to stráži
      jedinečným indexom, takže starý sa musí odznačiť skôr, než sa zapíše nový.
    */
    if (data.is_default) {
      let q = supabase
        .from("number_series")
        .update({ is_default: false })
        .eq("company_id", data.company_id)
        .eq("kind", data.kind)
        .eq("is_default", true);
      if (data.id) q = q.neq("id", data.id);
      const { error } = await q;
      if (error) throw new Error(error.message);
    }

    if (data.id) {
      const { error } = await supabase
        .from("number_series")
        .update({
          name: data.name,
          format,
          is_default: data.is_default,
          active: data.active,
          start_from: data.start_from,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .eq("company_id", data.company_id);
      if (error) throw new Error(prelozChybu(error.message));
      return { id: data.id };
    }

    const { data: novy, error } = await supabase
      .from("number_series")
      .insert({
        company_id: data.company_id,
        kind: data.kind,
        name: data.name,
        format,
        is_default: data.is_default,
        active: data.active,
        start_from: data.start_from,
      })
      .select("id")
      .single();
    if (error || !novy) throw new Error(prelozChybu(error?.message ?? "Rad sa nepodarilo uložiť."));
    return { id: novy.id };
  });

export const zmazCiselnyRadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ zmazany: boolean }> => {
    const { supabase } = context;
    const { data: rad } = await supabase
      .from("number_series")
      .select("id, kind, is_default")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!rad) throw new Error("Číselný rad sa nenašiel.");

    /*
      Rad, z ktorého už doklady visia, sa nemaže — číslo na papieri u
      zákazníka by prestalo na čokoľvek ukazovať a v prehľade by nebolo
      vidieť, odkiaľ pochádza. Taký rad sa dá len vypnúť.
    */
    const kde = KDE[rad.kind as DruhRadu];
    const { count } = await supabase
      .from(kde.tabulka as never)
      .select("id", { count: "exact", head: true })
      .eq(kde.stlpec, data.id);
    if ((count ?? 0) > 0) {
      throw new Error(
        `Z tohto radu je vystavených ${count} dokladov, tak sa zmazať nedá. Vypnite ho — prestane sa ponúkať a doklady ostanú.`,
      );
    }

    const { error } = await supabase
      .from("number_series")
      .delete()
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { zmazany: true };
  });

/** Databázové hlásenia povedia človeku, čo s tým. */
function prelozChybu(sprava: string): string {
  if (sprava.includes("number_series_meno_idx")) return "Rad s týmto názvom už pre tento druh je.";
  if (sprava.includes("number_series_predvoleny_idx")) {
    return "Predvolený rad môže byť na druh dokladu len jeden.";
  }
  if (sprava.includes("number_series_format_check")) {
    return "Šablóna musí obsahovať poradie — {NN} až {NNNNNN}.";
  }
  return sprava;
}

/**
 * „Odteraz číslujte takto" — rad prevezme tvar ručne zadaného čísla.
 *
 * Človek opraví číslo na doklade a zaškrtne, že sa v ňom má pokračovať.
 * Predvolený rad daného druhu potom dostane odvodenú šablónu a hranicu, od
 * ktorej sa počíta ďalej: z „FA-2026-100" vyjde `FA-{YYYY}-{NNN}` a ďalšia
 * faktúra bude FA-2026-101, nie 001.
 *
 * Staré doklady sa neprečíslujú — menia sa len tie, čo ešte len vzniknú.
 */
export const pokracujVRaduFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        kind: Druh,
        cislo: z.string().trim().min(1).max(40),
        /** Dátum dokladu — podľa neho sa v čísle spozná rok a mesiac. */
        datum: z.string().date(),
        /** Keď doklad rad pozná, upraví sa ten; inak predvolený pre druh. */
        series_id: z.string().uuid().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ format: string; start_from: number }> => {
    const { supabase } = context;
    const { sablonaZCisla } = await import("./ciselne-rady");
    const odvodene = sablonaZCisla(data.cislo, data.datum);
    if (!odvodene) {
      throw new Error(
        "Z tohto čísla sa číselný rad odvodiť nedá — potrebuje poradie aspoň o dvoch číslach na konci. Šablónu si nastavte v Číselných radoch.",
      );
    }

    let radId = data.series_id ?? null;
    if (!radId) {
      const { data: rad } = await supabase
        .from("number_series")
        .select("id")
        .eq("company_id", data.company_id)
        .eq("kind", data.kind)
        .eq("is_default", true)
        .maybeSingle();
      radId = rad?.id ?? null;
    }

    if (!radId) {
      const { data: novy, error } = await supabase
        .from("number_series")
        .insert({
          company_id: data.company_id,
          kind: data.kind,
          name: NAZVY_DRUHOV[data.kind],
          format: odvodene.format,
          start_from: odvodene.poradie + 1,
          is_default: true,
        })
        .select("id")
        .single();
      if (error || !novy) throw new Error(prelozChybu(error?.message ?? "Rad sa nepodarilo uložiť."));
      return { format: odvodene.format, start_from: odvodene.poradie + 1 };
    }

    const { error } = await supabase
      .from("number_series")
      .update({
        format: odvodene.format,
        start_from: odvodene.poradie + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", radId)
      .eq("company_id", data.company_id);
    if (error) throw new Error(prelozChybu(error.message));
    return { format: odvodene.format, start_from: odvodene.poradie + 1 };
  });
