import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Návrh zaúčtovania od AI (pozri `ai-predkontacia.ts`). Všetko cez klienta
  prihláseného — RLS a oblasť „doklady" platia; návrh sa počíta len tomu,
  kto smie doklady meniť (inak by ho nemal kto potvrdiť a platilo by sa
  za každé otvorenie).
*/

async function smieMenit(supabase: any, userId: string, companyId: string): Promise<boolean> {
  try {
    const { overPristup } = await import("./over-pristup");
    await overPristup({ supabase, userId }, companyId, { oblast: "doklady", zapis: true });
    return true;
  } catch {
    return false;
  }
}

/** Návrh pre jeden doklad — lenivo pri otvorení, s pamäťou na doklade. */
export const navrhZauctovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        typ: z.enum(["prijata", "nespracovany"]),
        id: z.string().uuid(),
        /** Spočítať znova aj vtedy, keď je návrh zapamätaný. */
        vynutit: z.boolean().optional(),
        /** Nespracovaný doklad: druh z formulára, ak ho človek ešte neuložil. */
        druh: z.enum(["faktura", "zalohova", "dobropis", "blocek"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const prazdny = (stav: string) => ({ stav, polia: {}, dovod: null }) as any;
    const tabulka = data.typ === "prijata" ? "purchase_invoices" : "nespracovane_doklady";
    const { data: r } = await supabase.from(tabulka).select("*").eq("id", data.id).maybeSingle();
    if (!r) return prazdny("netreba");
    if (!(await smieMenit(supabase, context.userId, r.company_id))) return prazdny("bez_prava");
    try {
      const s = await import("./ai-predkontacia.server");
      const kontext = await s.nacitajKontext(supabase, r.company_id);
      return data.typ === "prijata"
        ? await s.navrhPrijatej(supabase, r, kontext, context.userId, data.vynutit)
        : await s.navrhNespracovaneho(
            supabase,
            data.druh ? { ...r, druh: data.druh } : r,
            kontext,
            context.userId,
            data.vynutit,
          );
    } catch (e) {
      console.warn("[ai-predkontacia]", String((e as Error)?.message ?? e).slice(0, 200));
      return prazdny("nedostupny");
    }
  });

/**
 * „Navrhnúť AI pre vybrané" v zozname prijatých faktúr. Najviac 50 naraz;
 * čo sa do ~10 s nestihne, vráti sa v `zostava` a prehliadač sa dopýta.
 * Návrhy sa nezaúčtujú — človek ich potvrdí v okne.
 */
export const navrhyAiHromadneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        ids: z.array(z.string().uuid()).min(1).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    if (!(await smieMenit(supabase, context.userId, data.company_id)))
      throw new Error("Na zaúčtovanie dokladov nemáte v tejto firme oprávnenie.");
    const { navrhyHromadne } = await import("./ai-predkontacia.server");
    return navrhyHromadne(supabase, {
      companyId: data.company_id,
      ids: data.ids,
      userId: context.userId,
    });
  });
