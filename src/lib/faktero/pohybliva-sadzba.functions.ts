import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Pohyblivá úroková sadzba — volania zo stránky: aktuálna sadzba a história
 * zmluvy, ručná sadzba za obdobie a posledná hodnota indexu pre formulár.
 * Výpočet je v `pohybliva-sadzba.ts`, databáza v `referencne-sadzby.server.ts`
 * a `kontokorent.server.ts`.
 */

async function overClena(ctx: any, companyId: string) {
  const { data } = await ctx.supabase.rpc("is_company_member", {
    _company_id: companyId,
    _user_id: ctx.userId,
  });
  if (!data) throw new Error("Nemáte prístup k firme.");
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const INDEXY = [
  "EURIBOR_1M",
  "EURIBOR_3M",
  "EURIBOR_6M",
  "EURIBOR_12M",
  "ESTR",
  "PRIBOR_1M",
  "PRIBOR_3M",
  "PRIBOR_6M",
  "PRIBOR_1R",
] as const;

const STLPCE_ZMLUVY =
  "id, kind, interest_rate, rate_type, reference_index, rate_margin, index_floor, fixing_rule, fixing_offset_days, rate_reset, day_count, interest_from, interest_period, bank_account_id";

/**
 * Sadzba zmluvy: dnešná, po obdobiach za posledný rok, a pri kontokorente aj
 * vypočítaný úrok po mesiacoch porovnaný so strhnutým.
 */
export const sadzbaZmluvyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overClena(context, data.company_id);
    const { data: zmluva } = await supabase
      .from("financing_contracts")
      .select(STLPCE_ZMLUVY)
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!zmluva) throw new Error("Zmluva sa nenašla.");
    const z_ = zmluva as any;

    const { sadzbaZmluvy, odhadUrokovKontokorentu } = await import("./kontokorent.server");
    const podklady = await sadzbaZmluvy(supabase, data.company_id, z_);
    const odhad =
      z_.kind === "kontokorent"
        ? await odhadUrokovKontokorentu(supabase, data.company_id, z_, podklady)
        : null;
    return {
      aktualna: podklady.aktualna,
      // Najnovšie hore — tak sa história číta.
      historia: [...podklady.historia].reverse(),
      rucne: podklady.rucne,
      odhad: odhad ? (odhad.ok ? { ...odhad, riadky: [...odhad.riadky].reverse() } : odhad) : null,
    };
  });

/**
 * Ručná sadzba za obdobie fixácie — keď banka oznámi skutočnú, alebo keď ju
 * človek prevezme zo strhnutého úroku. `rate: null` ju zmaže a vráti výpočet.
 */
export const ulozRucnuSadzbuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        contract_id: z.string().uuid(),
        period_start: z
          .string()
          .regex(DATUM)
          .refine((s) => s.endsWith("-01"), {
            message: "Obdobie začína prvým dňom mesiaca.",
          }),
        rate: z.number().min(-10).max(100).nullable(),
        source: z.enum(["rucne", "banka"]).default("rucne"),
        note: z.string().trim().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await overClena(context, data.company_id);
    const { data: zmluva } = await supabase
      .from("financing_contracts")
      .select("id")
      .eq("id", data.contract_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!zmluva) throw new Error("Zmluva sa nenašla.");

    if (data.rate === null) {
      const { error } = await (supabase as any)
        .from("financing_rate_periods")
        .delete()
        .eq("company_id", data.company_id)
        .eq("contract_id", data.contract_id)
        .eq("period_start", data.period_start);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await (supabase as any).from("financing_rate_periods").upsert(
      {
        company_id: data.company_id,
        contract_id: data.contract_id,
        period_start: data.period_start,
        rate: data.rate,
        source: data.source,
        note: data.note || null,
        created_by: userId,
      },
      { onConflict: "contract_id,period_start" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Posledné známe hodnoty indexu — formulár z nich ukáže dnešnú celkovú sadzbu. */
export const poslednaHodnotaIndexuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ index: z.enum(INDEXY) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: riadky } = await (context.supabase as any)
      .from("referencne_sadzby")
      .select("druh, datum, hodnota")
      .eq("index", data.index)
      .order("datum", { ascending: false })
      .limit(40);
    const r = (riadky ?? []) as { druh: string; datum: string; hodnota: number }[];
    const denna = r.find((x) => x.druh === "denna") ?? null;
    const mesacna = r.find((x) => x.druh === "mesacny_priemer") ?? null;
    const naj = denna ?? mesacna;
    return naj
      ? {
          hodnota: Number(naj.hodnota),
          datum: naj.datum,
          druh: naj.druh as "denna" | "mesacny_priemer",
        }
      : null;
  });
