import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Automatické členenie DPH, KV a predkontácia vystavených dokladov
  (clenenie-vystavenej.server.ts). Len serverové funkcie — žiadny iný export,
  inak by sa serverový kód dostal do prehliadača.
*/

/** Čo doklad dostane automaticky (bez zápisu) — detail ukáže „automaticky“. */
export const vyriesClenenieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    // Číta prihlásený (RLS) — cudziu faktúru nedostane.
    const { data: row } = await supabase
      .from("invoices")
      .select("*")
      .eq("company_id", data.company_id)
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return null;
    const { vyriesClenenieRiadku } = await import("./clenenie-vystavenej.server");
    const v = await vyriesClenenieRiadku(supabase, row);
    return {
      pohoda_clenenie_dph: v.pohoda_clenenie_dph,
      kv_clenenie: v.kv_clenenie,
      pohoda_predkontacia: v.pohoda_predkontacia,
      auto: v.auto,
      zdroj: v.zdroj,
      rucne: v.rucne,
    };
  });

/**
 * Po uložení faktúry z prehliadača (formulár vo webe, úprava, appka):
 * automatika doklad hneď prejde a doplní členenie, KV a predkontáciu.
 */
export const prepocitajClenenieFn = createServerFn({ method: "POST" })
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
    const { overPristup } = await import("./over-pristup");
    await overPristup(context as any, data.company_id, { oblast: "faktury", zapis: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Len faktúry tejto firmy — admin klient by inak siahol aj na cudzie id.
    const { data: riadky } = await supabaseAdmin
      .from("invoices")
      .select("id")
      .eq("company_id", data.company_id)
      .in("id", data.ids);
    const { uplatniClenenieFaktur } = await import("./clenenie-vystavenej.server");
    const zmenenych = await uplatniClenenieFaktur(
      supabaseAdmin,
      ((riadky ?? []) as { id: string }[]).map((r) => r.id),
    );
    return { ok: true, zmenenych };
  });

/**
 * Návrh predvolených kódov vydaných faktúr pre Predkontácie → Predvolené
 * (platiteľ DPH): UD, UDpdp z číselníka, predkontácia z ustáleného zvyku firmy.
 */
export const navrhPredvolenychVystavenychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { nacitajKontextClenenia } = await import("./clenenie-vystavenej.server");
    const { navrhPredvolenychVystavenych } = await import("./clenenie-vystavenej");
    const k = await nacitajKontextClenenia(supabase, data.company_id);
    return navrhPredvolenychVystavenych(k.firma, k.ciselnik, k.odhad);
  });
