import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Kontokorentný úver — volania zo stránky.
 *
 * Výber účtu, detail rámca (limit, čerpanie, voľný rámec), zoznam úrokov a
 * poplatkov strhnutých bankou a návrhy, ktoré sa samy nespárovali. Logika je
 * v `kontokorent.ts` (čistá) a `kontokorent.server.ts` (databáza).
 */

async function overClena(ctx: any, companyId: string) {
  const { data } = await ctx.supabase.rpc("is_company_member", {
    _company_id: companyId,
    _user_id: ctx.userId,
  });
  if (!data) throw new Error("Nemáte prístup k firme.");
}

const IdFirmy = z.object({ company_id: z.string().uuid() });
const IdZmluvy = z.object({ company_id: z.string().uuid(), id: z.string().uuid() });

/** Napojené účty firmy na výber vo formulári — rámec je vždy na konkrétnom účte. */
export const uctyPreKontokorentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdFirmy.parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id);
    const { data: ucty } = await context.supabase
      .from("bank_accounts")
      .select("id, account_name, iban, currency")
      .eq("company_id", data.company_id)
      .order("account_name");
    return {
      ucty: ((ucty ?? []) as any[]).map((u) => ({
        id: u.id as string,
        account_name: (u.account_name as string | null) ?? null,
        iban: (u.iban as string | null) ?? null,
        currency: (u.currency as string) || "EUR",
      })),
    };
  });

export const detailKontokorentuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdZmluvy.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overClena(context, data.company_id);
    const { stavRamca, suctyPoplatkov } = await import("./kontokorent");
    const { podkladyKontokorentu } = await import("./kontokorent.server");
    const { sparujPoplatkyKontokorentu } = await import("./kontokorent");

    const { data: zmluva } = await supabase
      .from("financing_contracts")
      .select("id, credit_limit, bank_account_id, currency")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!zmluva) throw new Error("Zmluva sa nenašla.");

    const [{ data: ucet }, { data: poplatky }] = await Promise.all([
      zmluva.bank_account_id
        ? supabase
            .from("bank_accounts")
            .select("id, account_name, iban, currency, balance, booked_balance, last_synced_at")
            .eq("id", zmluva.bank_account_id)
            .eq("company_id", data.company_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("financing_charges")
        .select(
          "id, kind, amount, currency, charged_on, source, bank_transaction_id, bank_transactions(description, counterparty)",
        )
        .eq("contract_id", data.id)
        .eq("company_id", data.company_id)
        .order("charged_on", { ascending: false }),
    ]);

    const riadky = ((poplatky ?? []) as any[]).map((r) => ({
      id: r.id as string,
      kind: r.kind as "urok" | "poplatok",
      amount: Number(r.amount) || 0,
      currency: (r.currency as string) || "EUR",
      charged_on: r.charged_on as string,
      source: r.source as string,
      popis:
        [r.bank_transactions?.description, r.bank_transactions?.counterparty]
          .filter(Boolean)
          .join(" · ") || null,
    }));

    // Návrhy len k tejto zmluve — na detaile inej by mýlili.
    const { zmluvy, pohyby, vsZmluv } = await podkladyKontokorentu(supabase, data.company_id);
    const { navrhy } = sparujPoplatkyKontokorentu(pohyby, zmluvy, vsZmluv);
    const tieto = navrhy.filter((n) => n.contractId === data.id);
    const podlaId = new Map(pohyby.map((p) => [p.id, p]));

    return {
      ucet: ucet ?? null,
      stav: stavRamca(Number(zmluva.credit_limit) || 0, ucet as any),
      poplatky: riadky,
      sucty: suctyPoplatkov(riadky),
      navrhy: tieto.map((n) => ({
        ...n,
        popis: podlaId.get(n.transactionId)?.description ?? null,
      })),
    };
  });

/** Spárovanie na požiadanie — úroky stiahnuté skôr, než bola zmluva zapísaná. */
export const sparujKontokorentTerazFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdFirmy.parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id);
    const { sparujPoplatkyFirmy } = await import("./kontokorent.server");
    const r = await sparujPoplatkyFirmy(context.supabase, data.company_id, "auto", context.userId);
    return { zapisanych: r.zapisanych, navrhov: r.navrhy.length, pohybov: r.pohybov };
  });

export const potvrdPoplatokFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        contract_id: z.string().uuid(),
        transaction_id: z.string().uuid(),
        kind: z.enum(["urok", "poplatok"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id);
    const { zapisPoplatok } = await import("./kontokorent.server");
    const ok = await zapisPoplatok(
      context.supabase,
      data.company_id,
      { contractId: data.contract_id, transactionId: data.transaction_id, druh: data.kind },
      "rucne",
      context.userId,
    );
    if (!ok) throw new Error("Pohyb sa nepodarilo priradiť — možno už je priradený.");
    return { ok: true };
  });

/** Zrušenie väzby — pohyb sa vráti medzi nespárované. */
export const zrusPoplatokFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdZmluvy.parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id);
    const { error } = await context.supabase
      .from("financing_charges")
      .delete()
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
