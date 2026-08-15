import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { kalendar, suhrn, zaokruhli, type Zmluva } from "./financovanie";
import {
  sparujSplatky,
  type OdchadzajuciPohyb,
  type SplatkaNaSparovanie,
  type ZhodaSplatky,
} from "./financovanie-parovanie";

/**
 * Leasingy a úvery — serverová časť.
 *
 * Výpočet kalendára aj rozhodovanie o párovaní sú v čistých moduloch bez
 * databázy (`financovanie.ts`, `financovanie-parovanie.ts`). Tu sa len načítajú
 * podklady a zapíše výsledok.
 *
 * Zápis platby ide vždy cez `bank_transaction_id` s jedinečným indexom, takže
 * druhé spustenie tú istú platbu nezapíše dvakrát — rovnako ako pri faktúrach.
 */

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Koľko dozadu má zmysel hľadať nespárované platby. */
const DNI_DOZADU = 400;

async function overClena(ctx: any, companyId: string) {
  const { data } = await ctx.supabase.rpc("is_company_member", {
    _company_id: companyId,
    _user_id: ctx.userId,
  });
  if (!data) throw new Error("Nemáte prístup k firme.");
}

function cislo(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const Zmluva_ = z.object({
  id: z.string().uuid().optional().nullable(),
  company_id: z.string().uuid(),
  kind: z.enum(["leasing", "uver"]),
  name: z.string().trim().min(1).max(200),
  provider_name: z.string().trim().max(200).optional().nullable(),
  contract_number: z.string().trim().max(100).optional().nullable(),
  variable_symbol: z.string().trim().max(30).optional().nullable(),
  counterparty_hint: z.string().trim().max(200).optional().nullable(),
  currency: z.string().length(3).default("EUR"),
  principal: z.number().positive().max(100_000_000),
  interest_rate: z.number().min(0).max(100).default(0),
  term_months: z.number().int().min(1).max(600),
  first_due_date: z.string().regex(DATUM),
  payment_amount: z.number().positive().max(10_000_000).optional().nullable(),
  vat_rate: z.number().min(0).max(100).default(0),
  down_payment: z.number().min(0).max(100_000_000).default(0),
  residual_value: z.number().min(0).max(100_000_000).default(0),
  vehicle_id: z.string().uuid().optional().nullable(),
  document_path: z.string().max(500).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

/**
 * Uloží zmluvu a prepočíta kalendár.
 *
 * Už zaplatené splátky sa **neprepisujú**: keď človek opraví úrok alebo počet
 * mesiacov, prepočítajú sa len tie, ktoré ešte nikto nezaplatil. Inak by
 * prepočet zahodil spárované platby a účtovníctvo by prestalo sedieť.
 */
export const ulozZmluvuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Zmluva_.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await overClena(context, data.company_id);

    const hlavicka = {
      company_id: data.company_id,
      kind: data.kind,
      name: data.name,
      provider_name: data.provider_name || null,
      contract_number: data.contract_number || null,
      variable_symbol: data.variable_symbol || null,
      counterparty_hint: data.counterparty_hint || null,
      currency: data.currency,
      principal: data.principal,
      interest_rate: data.interest_rate,
      term_months: data.term_months,
      first_due_date: data.first_due_date,
      payment_amount: data.payment_amount ?? null,
      vat_rate: data.vat_rate,
      down_payment: data.down_payment,
      residual_value: data.residual_value,
      vehicle_id: data.vehicle_id || null,
      document_path: data.document_path || null,
      note: data.note || null,
    };

    let zmluvaId = data.id ?? null;
    if (zmluvaId) {
      const { error } = await supabase
        .from("financing_contracts")
        .update(hlavicka)
        .eq("id", zmluvaId)
        .eq("company_id", data.company_id);
      if (error) throw new Error(error.message);
    } else {
      const { data: nova, error } = await supabase
        .from("financing_contracts")
        .insert({ ...hlavicka, created_by: userId })
        .select("id")
        .single();
      if (error || !nova) throw new Error(error?.message ?? "Zmluvu sa nepodarilo uložiť.");
      zmluvaId = nova.id;
    }

    const pocet = await prepocitajKalendar(
      supabase,
      zmluvaId!,
      data.company_id,
      hlavicka as Zmluva,
    );
    return { id: zmluvaId!, splatok: pocet };
  });

/**
 * Prepíše nezaplatené splátky podľa aktuálnej hlavičky.
 *
 * Vracia, koľko riadkov má kalendár celkovo.
 */
async function prepocitajKalendar(
  supabase: any,
  contractId: string,
  companyId: string,
  z: Zmluva,
): Promise<number> {
  const riadky = kalendar(z);

  const { data: existujuce } = await supabase
    .from("financing_installments")
    .select("id, number, paid_at")
    .eq("contract_id", contractId);

  const zaplatene = new Set(
    ((existujuce ?? []) as { number: number; paid_at: string | null }[])
      .filter((r) => r.paid_at)
      .map((r) => r.number),
  );
  const podlaCisla = new Map(
    ((existujuce ?? []) as { id: string; number: number }[]).map((r) => [r.number, r.id]),
  );

  // Riadky nad rámec nového počtu mesiacov idú preč — ale len nezaplatené.
  const nadbytocne = (
    (existujuce ?? []) as { id: string; number: number; paid_at: string | null }[]
  )
    .filter((r) => r.number > riadky.length && !r.paid_at)
    .map((r) => r.id);
  if (nadbytocne.length) {
    await supabase.from("financing_installments").delete().in("id", nadbytocne);
  }

  for (const r of riadky) {
    if (zaplatene.has(r.number)) continue;
    const zaznam = {
      company_id: companyId,
      contract_id: contractId,
      number: r.number,
      due_date: r.due_date,
      amount: r.amount,
      principal_part: r.principal_part,
      interest_part: r.interest_part,
      vat_amount: r.vat_amount,
      remaining_principal: r.remaining_principal,
    };
    const id = podlaCisla.get(r.number);
    if (id) await supabase.from("financing_installments").update(zaznam).eq("id", id);
    else await supabase.from("financing_installments").insert(zaznam);
  }

  return riadky.length;
}

const IdFirmy = z.object({ company_id: z.string().uuid() });

/** Zoznam zmlúv aj s tým, koľko je zaplatené a čo je najbližšie. */
export const zoznamZmluvFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdFirmy.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overClena(context, data.company_id);

    const [{ data: zmluvy }, { data: splatky }] = await Promise.all([
      supabase
        .from("financing_contracts")
        .select("*")
        .eq("company_id", data.company_id)
        .order("status")
        .order("name"),
      supabase
        .from("financing_installments")
        .select("contract_id, amount, paid_at, due_date, remaining_principal, number")
        .eq("company_id", data.company_id),
    ]);

    const podlaZmluvy = new Map<string, any[]>();
    for (const s of (splatky ?? []) as any[]) {
      if (!podlaZmluvy.has(s.contract_id)) podlaZmluvy.set(s.contract_id, []);
      podlaZmluvy.get(s.contract_id)!.push(s);
    }

    const dnes = new Date().toISOString().slice(0, 10);
    return {
      zmluvy: ((zmluvy ?? []) as any[]).map((z) => {
        const riadky = (podlaZmluvy.get(z.id) ?? []).sort((a, b) => a.number - b.number);
        const zaplatene = riadky.filter((r) => r.paid_at);
        const nezaplatene = riadky.filter((r) => !r.paid_at);
        const dalsia = nezaplatene.find((r) => r.due_date >= dnes) ?? nezaplatene[0] ?? null;
        return {
          ...z,
          splatok: riadky.length,
          zaplatenych: zaplatene.length,
          zaplatenaSuma: zaokruhli(zaplatene.reduce((s, r) => s + cislo(r.amount), 0)),
          zostavaSuma: zaokruhli(nezaplatene.reduce((s, r) => s + cislo(r.amount), 0)),
          /** Po splatnosti a nezaplatené — to firma potrebuje vidieť prvé. */
          poSplatnosti: nezaplatene.filter((r) => r.due_date < dnes).length,
          dalsiaSplatka: dalsia
            ? { due_date: dalsia.due_date, amount: cislo(dalsia.amount) }
            : null,
        };
      }),
    };
  });

const IdZmluvy = z.object({ company_id: z.string().uuid(), id: z.string().uuid() });

export const detailZmluvyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdZmluvy.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overClena(context, data.company_id);

    const { data: zmluva } = await supabase
      .from("financing_contracts")
      .select("*")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!zmluva) throw new Error("Zmluva sa nenašla.");

    const { data: splatky } = await supabase
      .from("financing_installments")
      .select("*")
      .eq("contract_id", data.id)
      .order("number");

    const riadky = ((splatky ?? []) as any[]).map((r) => ({
      ...r,
      amount: cislo(r.amount),
      principal_part: cislo(r.principal_part),
      interest_part: cislo(r.interest_part),
      vat_amount: cislo(r.vat_amount),
      remaining_principal: cislo(r.remaining_principal),
    }));

    return { zmluva, splatky: riadky, suhrn: suhrn(riadky, zmluva as Zmluva) };
  });

export const zmazZmluvuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdZmluvy.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overClena(context, data.company_id);
    // Splátky odídu s ňou cez ON DELETE CASCADE; spárované pohyby ostanú a len
    // stratia odkaz — peniaze na účte nikto nemazal.
    const { error } = await supabase
      .from("financing_contracts")
      .delete()
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RucnaPlatba = z.object({
  company_id: z.string().uuid(),
  installment_id: z.string().uuid(),
  paid_at: z.string().regex(DATUM).nullable(),
  paid_amount: z.number().min(0).max(10_000_000).optional().nullable(),
});

/** Odškrtnutie splátky ručne — keď platba neprišla cez napojenú banku. */
export const oznacSplatkuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RucnaPlatba.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overClena(context, data.company_id);

    const zmena = {
      paid_at: data.paid_at,
      paid_amount: data.paid_at ? (data.paid_amount ?? null) : null,
      // Odškrtnutie naspäť musí uvoľniť aj bankový pohyb, inak by ostal navždy
      // zabratý a nedal by sa spárovať znova.
      ...(data.paid_at ? {} : { bank_transaction_id: null }),
    };

    const { data: splatka, error } = await supabase
      .from("financing_installments")
      .update(zmena)
      .eq("id", data.installment_id)
      .eq("company_id", data.company_id)
      .select("id, bank_transaction_id")
      .single();
    if (error) throw new Error(error.message);

    if (!data.paid_at) {
      await supabase
        .from("bank_transactions")
        .update({ matched_installment_id: null })
        .eq("matched_installment_id", data.installment_id);
    }
    return { ok: true, id: splatka?.id };
  });

/** Podklady na párovanie: nespárované odchádzajúce platby a otvorené splátky. */
async function podkladyParovania(supabase: any, companyId: string) {
  const od = new Date(Date.now() - DNI_DOZADU * 86_400_000).toISOString().slice(0, 10);

  const [{ data: txs }, { data: splatky }] = await Promise.all([
    supabase
      .from("bank_transactions")
      .select("id, booking_date, amount, currency, variable_symbol, counterparty, description")
      .eq("company_id", companyId)
      .is("matched_installment_id", null)
      .is("matched_invoice_id", null)
      .lt("amount", 0)
      .gte("booking_date", od),
    supabase
      .from("financing_installments")
      .select(
        "id, contract_id, number, due_date, amount, financing_contracts!inner(currency, variable_symbol, counterparty_hint, provider_name, name, status)",
      )
      .eq("company_id", companyId)
      .is("paid_at", null)
      .gte("due_date", od),
  ]);

  const pohyby: OdchadzajuciPohyb[] = ((txs ?? []) as any[]).map((t) => ({
    id: t.id,
    booking_date: t.booking_date,
    amount: cislo(t.amount),
    currency: t.currency || "EUR",
    variable_symbol: t.variable_symbol,
    counterparty: t.counterparty,
    description: t.description,
  }));

  const kandidati: SplatkaNaSparovanie[] = ((splatky ?? []) as any[])
    .filter((s) => s.financing_contracts?.status === "active")
    .map((s) => ({
      id: s.id,
      contract_id: s.contract_id,
      number: s.number,
      due_date: s.due_date,
      amount: cislo(s.amount),
      currency: s.financing_contracts?.currency || "EUR",
      variable_symbol: s.financing_contracts?.variable_symbol ?? null,
      counterparty_hint: s.financing_contracts?.counterparty_hint ?? null,
      provider_name: s.financing_contracts?.provider_name ?? null,
      contract_name: s.financing_contracts?.name ?? "",
    }));

  return { pohyby, splatky: kandidati };
}

/** Čo by sa dalo spárovať — ukazuje sa človeku, nezapisuje sa nič. */
export const navrhySplatokFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdFirmy.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overClena(context, data.company_id);
    const { pohyby, splatky } = await podkladyParovania(supabase, data.company_id);
    const { auto, navrhy } = sparujSplatky(pohyby, splatky);
    return {
      navrhy: [...auto, ...navrhy],
      pohyby,
      splatky,
    };
  });

const Potvrdenie = z.object({
  company_id: z.string().uuid(),
  installment_id: z.string().uuid(),
  transaction_id: z.string().uuid(),
});

export const potvrdSplatkuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Potvrdenie.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overClena(context, data.company_id);
    const zapisane = await zapisPlatbu(supabase, data.company_id, {
      installmentId: data.installment_id,
      transactionId: data.transaction_id,
    });
    if (!zapisane) throw new Error("Platbu sa nepodarilo zapísať.");
    return { ok: true };
  });

/**
 * Zapíše, že pohyb zaplatil splátku.
 *
 * Dátum a suma sa berú z pohybu — nie z kalendára. Keď firma zaplatila o pár dní
 * neskôr alebo o cent inak, v evidencii má byť to, čo sa naozaj stalo.
 */
async function zapisPlatbu(
  supabase: any,
  companyId: string,
  z: { installmentId: string; transactionId: string },
): Promise<boolean> {
  const { data: pohyb } = await supabase
    .from("bank_transactions")
    .select("id, booking_date, amount")
    .eq("id", z.transactionId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!pohyb) return false;

  const { error } = await supabase
    .from("financing_installments")
    .update({
      paid_at: pohyb.booking_date,
      paid_amount: zaokruhli(Math.abs(cislo(pohyb.amount))),
      bank_transaction_id: pohyb.id,
    })
    .eq("id", z.installmentId)
    .eq("company_id", companyId)
    .is("paid_at", null);
  if (error) return false;

  await supabase
    .from("bank_transactions")
    .update({ matched_installment_id: z.installmentId })
    .eq("id", pohyb.id);
  return true;
}

export const zrusSparovanieSplatkyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), installment_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overClena(context, data.company_id);
    await supabase
      .from("financing_installments")
      .update({ paid_at: null, paid_amount: null, bank_transaction_id: null })
      .eq("id", data.installment_id)
      .eq("company_id", data.company_id);
    await supabase
      .from("bank_transactions")
      .update({ matched_installment_id: null })
      .eq("matched_installment_id", data.installment_id);
    return { ok: true };
  });

/**
 * Automatické párovanie po stiahnutí pohybov z banky.
 *
 * Volá sa zo `bank-sync` servisným kľúčom, takže tu nie je prihlásený človek.
 * Zapíše sa len isté — sporné ostávajú návrhmi.
 */
export async function sparujSplatkyFirmyAutomaticky(
  companyId: string,
): Promise<{ zapisanych: number; zhody: ZhodaSplatky[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { pohyby, splatky } = await podkladyParovania(supabaseAdmin, companyId);
  const { auto } = sparujSplatky(pohyby, splatky);
  if (auto.length === 0) return { zapisanych: 0, zhody: [] };

  const zapisane: ZhodaSplatky[] = [];
  for (const z of auto) {
    const ok = await zapisPlatbu(supabaseAdmin, companyId, {
      installmentId: z.installmentId,
      transactionId: z.transactionId,
    });
    if (ok) zapisane.push(z);
  }
  return { zapisanych: zapisane.length, zhody: zapisane };
}
