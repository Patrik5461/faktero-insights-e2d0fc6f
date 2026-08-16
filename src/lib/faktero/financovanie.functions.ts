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
  day_count: z.enum(["ACT/365", "ACT/360", "30E/360"]).default("ACT/365"),
  interest_from: z.string().regex(DATUM).optional().nullable(),
  vehicle_id: z.string().uuid().optional().nullable(),
  document_path: z.string().max(500).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  /**
   * Kalendár prečítaný z nahratého dokumentu. Keď príde, je záväzný a nič sa
   * nedopočítava — sú to sumy, ktoré banka naozaj stiahne.
   */
  splatky: z
    .array(
      z.object({
        number: z.number().int().min(1).max(600),
        due_date: z.string().regex(DATUM),
        amount: z.number().min(0).max(10_000_000),
        principal_part: z.number().min(0).max(10_000_000),
        interest_part: z.number().min(0).max(10_000_000),
        vat_amount: z.number().min(0).max(10_000_000),
        remaining_principal: z.number().min(0).max(100_000_000),
      }),
    )
    .max(600)
    .optional(),
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

    /*
     * Odkiaľ je kalendár. Nové riadky z dokumentu prebíjajú všetko; keď
     * nechodia, ostáva to, čo zmluva mala doteraz — inak by úprava názvu
     * prepočítala kalendár prečítaný z papiera a rozišla ho s predpisom.
     */
    let zdrojKalendara: "vypocet" | "zmluva" = data.splatky?.length ? "zmluva" : "vypocet";
    if (!data.splatky?.length && data.id) {
      const { data: stara } = await supabase
        .from("financing_contracts")
        .select("schedule_source")
        .eq("id", data.id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      if (stara?.schedule_source === "zmluva") zdrojKalendara = "zmluva";
    }

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
      day_count: data.day_count,
      interest_from: data.interest_from || null,
      vehicle_id: data.vehicle_id || null,
      document_path: data.document_path || null,
      note: data.note || null,
      schedule_source: zdrojKalendara,
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

    if (data.splatky?.length) {
      const pocet = await zapisKalendarZoZmluvy(supabase, zmluvaId!, data.company_id, data.splatky);
      return { id: zmluvaId!, splatok: pocet, zdroj: "zmluva" as const };
    }
    if (zdrojKalendara === "zmluva") {
      // Kalendár je z papiera a nové riadky neprišli — necháme ho na pokoji.
      const { count } = await supabase
        .from("financing_installments")
        .select("id", { count: "exact", head: true })
        .eq("contract_id", zmluvaId!);
      return { id: zmluvaId!, splatok: count ?? 0, zdroj: "zmluva" as const };
    }

    const pocet = await prepocitajKalendar(
      supabase,
      zmluvaId!,
      data.company_id,
      hlavicka as Zmluva,
    );
    return { id: zmluvaId!, splatok: pocet, zdroj: "vypocet" as const };
  });

/**
 * Zapíše kalendár tak, ako je v dokumente.
 *
 * Zaplatené splátky sa ani tu neprepisujú — keby si niekto nahral kalendár
 * druhýkrát, prišiel by o spárované platby.
 */
async function zapisKalendarZoZmluvy(
  supabase: any,
  contractId: string,
  companyId: string,
  riadky: Array<{
    number: number;
    due_date: string;
    amount: number;
    principal_part: number;
    interest_part: number;
    vat_amount: number;
    remaining_principal: number;
  }>,
): Promise<number> {
  const { data: existujuce } = await supabase
    .from("financing_installments")
    .select("id, number, paid_at")
    .eq("contract_id", contractId);

  const stare = (existujuce ?? []) as { id: string; number: number; paid_at: string | null }[];
  const zaplatene = new Set(stare.filter((r) => r.paid_at).map((r) => r.number));
  const podlaCisla = new Map(stare.map((r) => [r.number, r.id]));

  const nadbytocne = stare.filter((r) => r.number > riadky.length && !r.paid_at).map((r) => r.id);
  if (nadbytocne.length) {
    await supabase.from("financing_installments").delete().in("id", nadbytocne);
  }

  for (const r of riadky) {
    if (zaplatene.has(r.number)) continue;
    const zaznam = { company_id: companyId, contract_id: contractId, ...r };
    const id = podlaCisla.get(r.number);
    if (id) await supabase.from("financing_installments").update(zaznam).eq("id", id);
    else await supabase.from("financing_installments").insert(zaznam);
  }
  return riadky.length;
}

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

/**
 * Načíta celý výsledok dopytu, nie prvú tisícku.
 *
 * PostgREST vracia bez `range` najviac 1000 riadkov a mlčí o tom. Firma, ktorá
 * má v banke vyše desaťtisíc pohybov, tak dostala náhodnú tisícku a splátky
 * zaplatené minulý mesiac medzi nimi neboli — párovanie potom nenašlo nič a
 * vyzeralo to, akoby prestalo fungovať. Radí sa podľa `id`, lebo pri radení
 * podľa dátumu si databáza pri rovnakom dni poradie volí sama a medzi stranami
 * riadky vypadávajú.
 */
async function vsetkyRiadky(dopyt: (od: number, do_: number) => any): Promise<any[]> {
  const KROK = 1000;
  const riadky: any[] = [];
  for (let od = 0; ; od += KROK) {
    const { data, error } = await dopyt(od, od + KROK - 1);
    if (error) throw new Error(error.message);
    riadky.push(...((data as any[]) ?? []));
    if (!data || data.length < KROK) return riadky;
  }
}

/** Podklady na párovanie: nespárované odchádzajúce platby a otvorené splátky. */
async function podkladyParovania(supabase: any, companyId: string) {
  const od = new Date(Date.now() - DNI_DOZADU * 86_400_000).toISOString().slice(0, 10);

  const [txs, splatky] = await Promise.all([
    vsetkyRiadky((a, b) =>
      supabase
        .from("bank_transactions")
        .select("id, booking_date, amount, currency, variable_symbol, counterparty, description")
        .eq("company_id", companyId)
        .is("matched_installment_id", null)
        .is("matched_invoice_id", null)
        .lt("amount", 0)
        .gte("booking_date", od)
        .order("id", { ascending: true })
        .range(a, b),
    ),
    vsetkyRiadky((a, b) =>
      supabase
        .from("financing_installments")
        .select(
          "id, contract_id, number, due_date, amount, financing_contracts!inner(currency, variable_symbol, counterparty_hint, provider_name, name, status)",
        )
        .eq("company_id", companyId)
        .is("paid_at", null)
        .gte("due_date", od)
        .order("id", { ascending: true })
        .range(a, b),
    ),
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

/**
 * Spárovanie na požiadanie.
 *
 * Automatika beží pri sťahovaní pohybov z banky. Lenže keď firma zapíše zmluvu
 * až potom, čo sa platby stiahli, nemá to čo spustiť — a človek márne čaká.
 * Toto tlačidlo prejde už stiahnuté pohyby a isté zhody zapíše.
 */
export const sparujTerazFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdFirmy.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overClena(context, data.company_id);

    const { pohyby, splatky } = await podkladyParovania(supabase, data.company_id);
    const { auto, navrhy } = sparujSplatky(pohyby, splatky);

    let zapisanych = 0;
    for (const z of auto) {
      const ok = await zapisPlatbu(supabase, data.company_id, {
        installmentId: z.installmentId,
        transactionId: z.transactionId,
      });
      if (ok) zapisanych++;
    }
    return { zapisanych, navrhov: navrhy.length, pohybov: pohyby.length };
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

/* ------------------------------------------------------------------ *
 * Načítanie zmluvy z dokumentu
 * ------------------------------------------------------------------ */

/** 15 MB — nad tým už PDF od banky nebýva a telo požiadavky by bolo neúnosné. */
const MAX_DOKUMENT = 15 * 1024 * 1024;

const Dokument = z.object({
  company_id: z.string().uuid(),
  /** Súbor ako data URL — rovnako, ako to robí čítanie bločkov. */
  subor: z.string().min(100),
  nazov: z.string().max(200).optional().nullable(),
});

/**
 * Uloží nahratú zmluvu alebo splátkový kalendár a spustí jeho čítanie.
 *
 * Vracia sa hneď po uložení súboru; na výsledok sa stránka pýta cez
 * `stavCitaniaZmluvyFn`. Dokument sa ukladá **ako prvý**, ešte pred čítaním —
 * keď model zlyhá, papier je aspoň v systéme a človek ho prepíše ručne.
 */
export const spustiCitanieZmluvyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Dokument.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await overClena(context, data.company_id);

    const zhoda = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(data.subor);
    if (!zhoda || !zhoda[2]) throw new Error("Súbor sa nepodarilo prečítať.");
    const mime = (zhoda[1] || "application/pdf").trim();
    const base64 = zhoda[3] ?? "";
    if (!/^(application\/pdf|image\/(png|jpe?g|webp|heic))$/i.test(mime)) {
      throw new Error("Nahrajte PDF alebo fotku zmluvy.");
    }
    const bajty = Buffer.from(base64, "base64");
    if (bajty.length === 0) throw new Error("Súbor je prázdny.");
    if (bajty.length > MAX_DOKUMENT) throw new Error("Súbor je väčší než 15 MB.");

    const pripona = mime === "application/pdf" ? "pdf" : mime.split("/")[1]!.replace("jpeg", "jpg");
    const cesta = `${data.company_id}/${crypto.randomUUID()}.${pripona}`;
    const { error: upErr } = await supabase.storage
      .from("financing-documents")
      .upload(cesta, bajty, { contentType: mime, upsert: false });
    if (upErr) throw new Error(`Dokument sa nepodarilo uložiť: ${upErr.message}`);

    // Čítanie beží ďalej samo a odpoveď ide von hneď. Kalendár na 72 splátok
    // číta model aj 40 sekúnd a taká dlhá požiadavka po ceste padne — prehliadač
    // ju zavrie skôr, než odpoveď príde, a človek vidí len točiace sa koliesko.
    void citajNaPozadi(supabase, cesta, base64, mime);
    return { document_path: cesta, nazov_suboru: data.nazov ?? null };
  });

/** Výsledok čítania — leží vedľa dokumentu ako `<cesta>.vysledok.json`. */
async function citajNaPozadi(supabase: any, cesta: string, base64: string, mime: string) {
  let vysledok: Record<string, unknown>;
  try {
    const { precitajZmluvu } = await import("./financovanie-citanie.server");
    vysledok = { ok: true, zmluva: await precitajZmluvu(base64, mime) };
  } catch (e: any) {
    vysledok = {
      ok: false,
      chyba: `${e?.message ?? "Dokument sa nepodarilo prečítať."} Údaje vyplňte ručne, súbor je uložený.`,
    };
  }
  const { error } = await supabase.storage
    .from("financing-documents")
    .upload(`${cesta}.vysledok.json`, Buffer.from(JSON.stringify(vysledok)), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) console.error("Výsledok čítania zmluvy sa nepodarilo uložiť:", error.message);
}

const StavCitania = z.object({
  company_id: z.string().uuid(),
  document_path: z.string().min(10).max(300),
});

/**
 * Ako je na tom čítanie. Kým výsledok nie je na svete, vracia `hotovo: false`
 * a stránka sa spýta o chvíľu znova.
 */
export const stavCitaniaZmluvyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => StavCitania.parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id);
    // Cesta chodí z prehliadača — bez tejto kontroly by sa dal vypýtať výsledok
    // z priečinka cudzej firmy.
    if (!data.document_path.startsWith(`${data.company_id}/`)) {
      throw new Error("Neplatný dokument.");
    }
    const { data: subor } = await context.supabase.storage
      .from("financing-documents")
      .download(`${data.document_path}.vysledok.json`);
    if (!subor) return { hotovo: false as const };
    const obsah = JSON.parse(await subor.text());
    return { hotovo: true as const, ...obsah };
  });
