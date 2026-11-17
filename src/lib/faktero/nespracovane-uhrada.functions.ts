import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Doklad o úhrade v Nespracovaných — výber prijatej faktúry, priradenie
  (súbor do príloh faktúry + úhrada), založenie faktúry z dokladu s úhradou
  a hromadné priradenie. Logika je v `nespracovane-uhrada.server.ts`.

  Práva: ako ostatné akcie Nespracovaných — zápis klientom prihláseného
  (RLS oblasti „doklady“: nespracovaný doklad, prijatá faktúra, prílohy aj
  úhrady), navyše `overPristup` so zápisom do dokladov, aby človek bez práva
  dostal zrozumiteľnú hlášku skôr, než sa čokoľvek nahrá.
*/

async function overPrava(context: any, companyId: string) {
  const { overPristup } = await import("./over-pristup");
  await overPristup(context, companyId, { oblast: "doklady", zapis: true });
  const { assertCompanyActive } = await import("./active-check.server");
  await assertCompanyActive(companyId);
}

async function nespracovany(supabase: any, id: string) {
  const { data: r } = await supabase.from("nespracovane_doklady").select("*").eq("id", id).maybeSingle();
  if (!r) throw new Error("Doklad sa nenašiel — možno ho už niekto spracoval.");
  if (r.stav === "cita") throw new Error("Doklad sa ešte číta — počkajte chvíľu.");
  return r as Record<string, any>;
}

export type PrijataNaVyber = {
  id: string;
  invoice_number: string | null;
  variable_symbol: string | null;
  supplier_name: string | null;
  issue_date: string | null;
  amount_total: number | null;
  currency: string | null;
  status: string | null;
  type: string | null;
  payment_date: string | null;
};

/** Prijaté faktúry firmy na výber — podľa čísla, VS, dodávateľa alebo sumy. */
export const kandidatiUhradyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), hladaj: z.string().max(80).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { STLPCE_PRIJATEJ, TYPY_NA_UHRADU } = await import("./nespracovane-uhrada.server");
    const { hladanaCastCisla } = await import("./nespracovane-uhrada");
    const h = (data.hladaj ?? "").trim().replace(/[%,()*\\]/g, " ").trim();
    let q = supabase
      .from("purchase_invoices")
      .select(STLPCE_PRIJATEJ)
      .eq("company_id", data.company_id)
      .in("type", TYPY_NA_UHRADU)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false })
      .limit(30);
    if (h) {
      const podmienky = [`invoice_number.ilike.%${h}%`, `supplier_name.ilike.%${h}%`, `variable_symbol.ilike.%${h}%`];
      // „0/0/0002/052152“ nájde aj „0/0(022)0002/052152“ — podľa najdlhšej skupiny číslic.
      const cast = hladanaCastCisla(h);
      if (cast && cast !== h) podmienky.push(`invoice_number.ilike.%${cast}%`);
      const suma = Number(h.replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(suma) && /\d/.test(h) && /^[\d\s.,-]+$/.test(h))
        podmienky.push(`amount_total.eq.${suma}`, `amount_total.eq.${-suma}`);
      q = q.or(podmienky.join(","));
    }
    const { data: r, error } = await q;
    if (error) throw new Error(error.message);
    return (r ?? []) as PrijataNaVyber[];
  });

/**
 * Súbor dokladu o úhrade k prijatej faktúre; nezaplatená faktúra sa označí
 * ako uhradená. Keď suma nesedí, chce `ajInuSumu` (rozhranie sa opýta).
 */
export const priradUhraduFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), purchaseInvoiceId: z.string().uuid(), ajInuSumu: z.boolean().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const r = await nespracovany(supabase, data.id);
    await overPrava(context, r.company_id);
    const { priradUhradu } = await import("./nespracovane-uhrada.server");
    return priradUhradu(supabase, context.userId, r, data.purchaseInvoiceId, { ajInuSumu: data.ajInuSumu });
  });

/**
 * Prijatá faktúra z dokladu (súbor nesie aj faktúru s rozpisom DPH) a hneď
 * úhrada z dokladu. Keď faktúra v súbore nie je čitateľná, odmietne s dôvodom.
 */
export const vytvorFakturuSUhradouFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
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
    const { vytvorFakturuSUhradou } = await import("./nespracovane-uhrada.server");
    return vytvorFakturuSUhradou(supabase, context.userId, r);
  });

/** Hromadné „Priradiť doklady o úhrade“ — len presná zhoda čísla aj sumy, ostatné s dôvodom. */
export const priradUhradyHromadneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await overPrava(context, data.company_id);
    const { priradUhradyHromadne } = await import("./nespracovane-uhrada.server");
    return priradUhradyHromadne(context.supabase as any, context.userId, data.company_id, data.ids);
  });
