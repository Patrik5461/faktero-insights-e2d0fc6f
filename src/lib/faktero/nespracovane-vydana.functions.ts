import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Vlastná vystavená faktúra v Nespracovaných — výber vystavenej faktúry,
  priradenie súboru k nej, založenie vystavenej faktúry z dokladu a hromadné
  priradenie. Logika je v `nespracovane-vydana.server.ts`.

  Práva: zápis ide klientom prihláseného (RLS oblastí „doklady“ a „faktury“),
  navyše `overPristup` — kto nesmie upravovať faktúry alebo doklady, dostane
  zrozumiteľnú hlášku skôr, než sa čokoľvek nahrá.
*/

async function overPrava(context: any, companyId: string) {
  const { overPristup } = await import("./over-pristup");
  await overPristup(context, companyId, { oblast: "doklady", zapis: true });
  await overPristup(context, companyId, { oblast: "faktury", zapis: true });
  const { assertCompanyActive } = await import("./active-check.server");
  await assertCompanyActive(companyId);
}

async function nespracovany(supabase: any, id: string) {
  const { data: r } = await supabase.from("nespracovane_doklady").select("*").eq("id", id).maybeSingle();
  if (!r) throw new Error("Doklad sa nenašiel — možno ho už niekto spracoval.");
  if (r.stav === "cita") throw new Error("Doklad sa ešte číta — počkajte chvíľu.");
  return r as Record<string, any>;
}

/** Vystavené faktúry firmy na výber — podľa čísla, odberateľa alebo sumy. */
export const kandidatiVydanychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), hladaj: z.string().max(80).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { STLPCE_VYDANEJ } = await import("./nespracovane-vydana.server");
    const h = (data.hladaj ?? "").trim().replace(/[%,()*\\]/g, " ").trim();
    let q = supabase
      .from("invoices")
      .select(STLPCE_VYDANEJ)
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false })
      .limit(30);
    if (h) {
      const suma = Number(h.replace(/\s/g, "").replace(",", "."));
      const podmienky = [`invoice_number.ilike.%${h}%`, `customer_name.ilike.%${h}%`];
      if (Number.isFinite(suma) && /\d/.test(h)) podmienky.push(`total.eq.${suma}`, `total.eq.${-suma}`);
      q = q.or(podmienky.join(","));
    }
    const { data: r, error } = await q;
    if (error) throw new Error(error.message);
    return (r ?? []) as {
      id: string;
      invoice_number: string;
      type: string | null;
      status: string | null;
      customer_name: string | null;
      issue_date: string | null;
      total: number | null;
      currency: string | null;
    }[];
  });

/** Súbor nespracovaného dokladu k vystavenej faktúre; doklad z Nespracovaných zmizne. */
export const priradKVydanejFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const r = await nespracovany(supabase, data.id);
    await overPrava(context, r.company_id);
    const { priradKVydanej } = await import("./nespracovane-vydana.server");
    return priradKVydanej(supabase, context.userId, r, data.invoiceId);
  });

/**
 * Vystavená faktúra z dokladu (číslo z dokladu, stav vystavená, nič sa
 * neodošle) so súborom v prílohách. Keď údaje nestačia, odmietne s dôvodom.
 */
export const vytvorVydanuZNespracovanehoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), udaje: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const r = await nespracovany(supabase, data.id);
    await overPrava(context, r.company_id);
    // Firma schvaľuje nespracované doklady — doklad z neho vznikne až po schválení.
    await (
      await import("./schvalovanie.server")
    ).overSchvalenie(
      r.company_id,
      "nespracovany",
      r.id,
      "Doklad čaká na schválenie — vytvoriť ho možno až po schválení.",
    );
    const { nacitajUdaje } = await import("./nespracovane");
    const { vytvorVydanu } = await import("./nespracovane-vydana.server");
    return vytvorVydanu(supabase, context.userId, r, nacitajUdaje(data.udaje));
  });

/** Hromadné „Priradiť k vystaveným faktúram“ — len presná zhoda čísla, ostatné s dôvodom. */
export const priradVydaneHromadneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await overPrava(context, data.company_id);
    const { priradVydaneHromadne } = await import("./nespracovane-vydana.server");
    return priradVydaneHromadne(context.supabase as any, context.userId, data.company_id, data.ids);
  });
