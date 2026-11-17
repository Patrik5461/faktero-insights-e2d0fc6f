import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Bloček, ktorý je úhradou faktúry: návrh pre detail, priradenie k prijatej
  faktúre ako doklad o úhrade, presun do Iných dokladov a hromadné verzie.
  Logika je v `blocek-uhrada.server.ts`.

  Práva: zápis do dokladov (bloček aj prijatá faktúra sú oblasť „doklady“),
  pri presune aj zápis do Iných dokladov; bloček sa maže, a to smie len
  správca firmy (politika „admins delete expenses“) — preto `spravca`, aby
  sa nič nezapísalo napoly. Zámok (odovzdaný, zamknutý, uzavreté obdobie)
  odmietne server.
*/

async function overPrava(context: any, companyId: string, ajOstatne = false) {
  const { overPristup } = await import("./over-pristup");
  await overPristup(context, companyId, { oblast: "doklady", zapis: true, spravca: true });
  if (ajOstatne) await overPristup(context, companyId, { oblast: "ostatne", zapis: true });
  const { assertCompanyActive } = await import("./active-check.server");
  await assertCompanyActive(companyId);
}

/** Detail bločku: vyzerá ako úhrada faktúry?, údaje úhrady, zhody prijatých faktúr a zámok. */
export const navrhUhradyBlockuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { nacitajBlocek, navrhBlocku } = await import("./blocek-uhrada.server");
    const r = await nacitajBlocek(context.supabase, data.id);
    return navrhBlocku(context.supabase, r as any);
  });

/** Súbor bločku k prijatej faktúre ako doklad o úhrade; bloček do koša. */
export const priradBlocekKFaktureFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), purchaseInvoiceId: z.string().uuid(), ajInuSumu: z.boolean().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { nacitajBlocek, priradBlocekKFakture } = await import("./blocek-uhrada.server");
    const r = await nacitajBlocek(supabase, data.id);
    await overPrava(context, r.company_id);
    return priradBlocekKFakture(supabase, context.userId, r, data.purchaseInvoiceId, { ajInuSumu: data.ajInuSumu });
  });

/** Bloček → Iný doklad s tým istým súborom; bloček do koša. */
export const presunBlocekDoOstatnychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { nacitajBlocek, presunBlocekDoOstatnych } = await import("./blocek-uhrada.server");
    const r = await nacitajBlocek(supabase, data.id);
    await overPrava(context, r.company_id, true);
    return presunBlocekDoOstatnych(supabase, context.userId, r);
  });

const Hromadne = z.object({ company_id: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(300) });

/** Hromadné „Priradiť úhrady k faktúram“ — len presná jedinečná zhoda čísla aj sumy. */
export const priradBlockyHromadneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Hromadne.parse(d))
  .handler(async ({ data, context }) => {
    await overPrava(context, data.company_id);
    const { priradBlockyHromadne } = await import("./blocek-uhrada.server");
    return priradBlockyHromadne(context.supabase as any, context.userId, data.company_id, data.ids);
  });

/** Hromadný presun vybraných bločkov do Iných dokladov. */
export const presunBlockyDoOstatnychFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Hromadne.parse(d))
  .handler(async ({ data, context }) => {
    await overPrava(context, data.company_id, true);
    const { presunBlockyDoOstatnych } = await import("./blocek-uhrada.server");
    return presunBlockyDoOstatnych(context.supabase as any, context.userId, data.company_id, data.ids);
  });
