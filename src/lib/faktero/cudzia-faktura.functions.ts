import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Prijatá faktúra, ktorá nepatrí firme — voľby z upozornenia: ponuka firiem
  na presun, potvrdenie „Faktúra patrí tejto firme“ a presun.
*/

const Druh = z.enum(["prijata", "nespracovany"]);

/**
 * Kam sa dá doklad presunúť. Vracia len firmy, kde smie prihlásený zapisovať
 * doklady; o iných firmách nič nehovorí (ani že existujú).
 */
export const moznostiCudzejFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ druh: Druh, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const srv = await import("./cudzia-faktura.server");
    const { nacitajNesedi } = await import("./cudzia-faktura");
    let companyId: string;
    let nesedi;
    if (data.druh === "prijata") {
      const { data: r } = await supabase
        .from("purchase_invoices")
        .select("id, company_id, odberatel_nesedi")
        .eq("id", data.id)
        .maybeSingle();
      if (!r) throw new Error("Faktúra sa nenašla.");
      companyId = r.company_id;
      nesedi = nacitajNesedi(r.odberatel_nesedi);
    } else {
      const { data: r } = await supabase
        .from("nespracovane_doklady")
        .select("id, company_id, druh, ai")
        .eq("id", data.id)
        .maybeSingle();
      if (!r) throw new Error("Doklad sa nenašiel.");
      companyId = r.company_id;
      nesedi = srv.nesediNespracovany(r, await srv.firmaNaPorovnanie(supabase, r.company_id));
    }
    if (!nesedi) return { nesedi: null, ciele: [] as { id: string; nazov: string }[] };
    const ciele = await srv.cieleNaPresunPreUzivatela(
      { supabase, userId: context.userId },
      nesedi,
      companyId,
    );
    return { nesedi, ciele };
  });

/**
 * „Faktúra patrí tejto firme“ — zruší príznak (zmena sa zapíše do histórie
 * dokladu) a faktúru vráti do fronty automatického zaúčtovania. Pravidlo
 * účtovania sa uplatní znova: zápis `supplier_ico` spustí jeho spúšťač.
 */
export const potvrdOdberatelaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: r } = await supabase
      .from("purchase_invoices")
      .select("id, company_id, supplier_ico, odberatel_nesedi")
      .eq("id", data.id)
      .maybeSingle();
    if (!r) throw new Error("Faktúra sa nenašla.");
    const { overPristup } = await import("./over-pristup");
    await overPristup({ supabase, userId: context.userId }, r.company_id, {
      oblast: "doklady",
      zapis: true,
    });
    if (!r.odberatel_nesedi) return { ok: true };
    const { error } = await supabase
      .from("purchase_invoices")
      .update({
        odberatel_nesedi: null,
        odberatel_potvrdene_at: new Date().toISOString(),
        odberatel_potvrdil: context.userId,
        auto_uctovanie_at: null,
        supplier_ico: r.supplier_ico,
      })
      .eq("id", r.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const presunCudzuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ druh: Druh, id: z.string().uuid(), cielovaFirmaId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = { supabase: context.supabase as any, userId: context.userId };
    const srv = await import("./cudzia-faktura.server");
    return data.druh === "prijata"
      ? srv.presunPrijatu(ctx, { id: data.id, cielovaFirmaId: data.cielovaFirmaId })
      : srv.presunNespracovany(ctx, { id: data.id, cielovaFirmaId: data.cielovaFirmaId });
  });
