/**
 * Kontokorentný úver — serverová časť.
 *
 * Rozhodovanie (čo je úrok z kontokorentu, čo nie) je v čistom `kontokorent.ts`.
 * Tu sa len načítajú podklady a zapíše výsledok do `financing_charges`.
 *
 * Prečo samostatná tabuľka a nie `financing_installments`: kontokorent nemá
 * predpis, ku ktorému by sa platba dala priradiť. Strhnutý úrok je sám osebe
 * náklad (úrok 562, poplatok 568), nie úhrada niečoho vopred známeho. Jeden
 * riadok = jeden bankový pohyb, jedinečný index na `bank_transaction_id` je
 * poistka proti dvojitému zápisu pri opakovanom párovaní.
 */
import { zaokruhli } from "./financovanie";
import {
  jeIban,
  normIban,
  sparujPoplatkyKontokorentu,
  uctPodlaIban,
  type KontokorentNaSparovanie,
  type PohybNaUcte,
  type ZhodaPoplatku,
} from "./kontokorent";

/** Koľko dozadu hľadať nespárované úroky — rovnako ako pri splátkach. */
const DNI_DOZADU = 400;

function cislo(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Celý výsledok, nie prvá tisícka (pamäť faktero-strop-1000-riadkov). */
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

export type KontokorentNaUlozenie = {
  id?: string | null;
  company_id: string;
  name: string;
  provider_name?: string | null;
  contract_number?: string | null;
  counterparty_hint?: string | null;
  currency: string;
  interest_rate: number;
  credit_limit?: number | null;
  bank_account_id?: string | null;
  account_iban?: string | null;
  limit_fee_yearly?: number | null;
  valid_until?: string | null;
  interest_period?: "mesacne" | "stvrtrocne" | null;
  document_path?: string | null;
  note?: string | null;
};

/**
 * Uloží kontokorent. Kalendár sa nerobí žiadny — a keď zmluva predtým bola
 * úverom, nezaplatené splátky idú preč. Zaplatené nie: na tie sú spárované
 * platby a zahodiť ich by rozbilo účtovníctvo, tak sa zmena druhu odmietne.
 */
export async function ulozKontokorent(
  supabase: any,
  userId: string,
  data: KontokorentNaUlozenie,
): Promise<{ id: string; splatok: number; zdroj: "kontokorent"; sparovanych: number }> {
  // Účet musí byť tejto firmy — id chodí z prehliadača.
  let ucetId = data.bank_account_id || null;
  let iban = jeIban(data.account_iban) ? normIban(data.account_iban) : null;
  const { data: ucty } = await supabase
    .from("bank_accounts")
    .select("id, iban")
    .eq("company_id", data.company_id);
  const uctyFirmy = (ucty ?? []) as { id: string; iban: string | null }[];
  if (ucetId) {
    const ucet = uctyFirmy.find((u) => u.id === ucetId);
    if (!ucet) throw new Error("Vybraný účet nepatrí k tejto firme.");
    if (!iban && jeIban(ucet.iban)) iban = normIban(ucet.iban);
  } else if (iban) {
    // Účet zo zmluvy je už napojený — priradí sa sám.
    ucetId = uctPodlaIban(iban, uctyFirmy)?.id ?? null;
  }

  if (data.id) {
    const { count } = await supabase
      .from("financing_installments")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", data.id)
      .not("paid_at", "is", null);
    if ((count ?? 0) > 0) {
      throw new Error(
        "Zmluva má zaplatené splátky — na kontokorent sa zmeniť nedá. Založte kontokorent ako novú zmluvu.",
      );
    }
  }

  const hlavicka = {
    company_id: data.company_id,
    kind: "kontokorent" as const,
    name: data.name,
    provider_name: data.provider_name || null,
    contract_number: data.contract_number || null,
    variable_symbol: null,
    counterparty_hint: data.counterparty_hint || null,
    currency: data.currency,
    principal: null,
    interest_rate: data.interest_rate,
    term_months: null,
    first_due_date: null,
    payment_amount: null,
    vat_rate: 0,
    down_payment: 0,
    residual_value: 0,
    interest_from: null,
    vehicle_id: null,
    document_path: data.document_path || null,
    note: data.note || null,
    schedule_source: "vypocet",
    credit_limit: data.credit_limit ?? null,
    bank_account_id: ucetId,
    account_iban: iban,
    limit_fee_yearly: data.limit_fee_yearly ?? null,
    valid_until: data.valid_until || null,
    interest_period: data.interest_period ?? "mesacne",
  };

  let id = data.id ?? null;
  if (id) {
    const { error } = await supabase
      .from("financing_contracts")
      .update(hlavicka)
      .eq("id", id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    await supabase
      .from("financing_installments")
      .delete()
      .eq("contract_id", id)
      .is("paid_at", null);
  } else {
    const { data: nova, error } = await supabase
      .from("financing_contracts")
      .insert({ ...hlavicka, created_by: userId })
      .select("id")
      .single();
    if (error || !nova) throw new Error(error?.message ?? "Zmluvu sa nepodarilo uložiť.");
    id = nova.id as string;
  }

  // Úroky, ktoré banka strhla ešte pred zapísaním zmluvy, sa spárujú hneď.
  let sparovanych = 0;
  try {
    sparovanych = (await sparujPoplatkyFirmy(supabase, data.company_id, "auto", userId)).zapisanych;
  } catch (e: any) {
    console.error("[kontokorent] párovanie po uložení zlyhalo:", e?.message ?? e);
  }
  return { id: id!, splatok: 0, zdroj: "kontokorent", sparovanych };
}

/** Kontokorenty firmy, nespárované odchádzajúce pohyby z ich účtov a symboly úverov. */
export async function podkladyKontokorentu(
  klient: any,
  companyId: string,
): Promise<{ zmluvy: KontokorentNaSparovanie[]; pohyby: PohybNaUcte[]; vsZmluv: string[] }> {
  const { data: vsetky } = await klient
    .from("financing_contracts")
    .select("id, name, kind, status, currency, bank_account_id, variable_symbol")
    .eq("company_id", companyId);
  const zmluvy = ((vsetky ?? []) as any[])
    .filter((z) => z.kind === "kontokorent" && z.status === "active" && z.bank_account_id)
    .map((z) => ({
      id: z.id,
      name: z.name,
      bank_account_id: z.bank_account_id,
      currency: z.currency || "EUR",
      status: z.status,
    }));
  // Symboly splátkových zmlúv: taký pohyb patrí do kalendára, nie ku kontokorentu.
  const vsZmluv = ((vsetky ?? []) as any[])
    .filter((z) => z.kind !== "kontokorent" && z.variable_symbol)
    .map((z) => String(z.variable_symbol));
  if (zmluvy.length === 0) return { zmluvy, pohyby: [], vsZmluv };

  const od = new Date(Date.now() - DNI_DOZADU * 86_400_000).toISOString().slice(0, 10);
  const ucty = [...new Set(zmluvy.map((z) => z.bank_account_id!))];

  const [txs, uzSparovane] = await Promise.all([
    vsetkyRiadky((a, b) =>
      klient
        .from("bank_transactions")
        .select(
          "id, bank_account_id, booking_date, amount, currency, variable_symbol, counterparty, description",
        )
        .eq("company_id", companyId)
        .in("bank_account_id", ucty)
        .is("matched_installment_id", null)
        .is("matched_invoice_id", null)
        .is("matched_purchase_invoice_id", null)
        .is("matched_expense_id", null)
        .lt("amount", 0)
        .gte("booking_date", od)
        .order("id", { ascending: true })
        .range(a, b),
    ),
    vsetkyRiadky((a, b) =>
      klient
        .from("financing_charges")
        .select("bank_transaction_id")
        .eq("company_id", companyId)
        .order("id", { ascending: true })
        .range(a, b),
    ),
  ]);
  const zabrate = new Set(uzSparovane.map((r) => r.bank_transaction_id as string));

  const pohyby: PohybNaUcte[] = txs
    .filter((t) => !zabrate.has(t.id))
    .map((t) => ({
      id: t.id,
      bank_account_id: t.bank_account_id,
      booking_date: t.booking_date,
      amount: cislo(t.amount),
      currency: t.currency || "EUR",
      variable_symbol: t.variable_symbol,
      counterparty: t.counterparty,
      description: t.description,
    }));
  return { zmluvy, pohyby, vsZmluv };
}

/**
 * Zapíše úrok alebo poplatok. Pohyb aj zmluva sa overia proti firme — pri
 * ručnom potvrdení chodia id z prehliadača.
 */
export async function zapisPoplatok(
  klient: any,
  companyId: string,
  z: { contractId: string; transactionId: string; druh: "urok" | "poplatok" },
  zdroj: "auto" | "rucne",
  userId: string | null,
): Promise<boolean> {
  const [{ data: pohyb }, { data: zmluva }] = await Promise.all([
    klient
      .from("bank_transactions")
      .select("id, booking_date, amount, currency, bank_account_id")
      .eq("id", z.transactionId)
      .eq("company_id", companyId)
      .maybeSingle(),
    klient
      .from("financing_contracts")
      .select("id, kind, bank_account_id")
      .eq("id", z.contractId)
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);
  if (!pohyb || !zmluva || zmluva.kind !== "kontokorent") return false;
  if (cislo(pohyb.amount) >= 0) return false;

  const { error } = await klient.from("financing_charges").insert({
    company_id: companyId,
    contract_id: z.contractId,
    bank_transaction_id: pohyb.id,
    kind: z.druh,
    amount: zaokruhli(Math.abs(cislo(pohyb.amount))),
    currency: pohyb.currency || "EUR",
    charged_on: pohyb.booking_date,
    source: zdroj,
    created_by: userId,
  });
  // Jedinečný index: pohyb už je zapísaný — opakované párovanie nič nepokazí.
  return !error;
}

export async function sparujPoplatkyFirmy(
  klient: any,
  companyId: string,
  zdroj: "auto" | "rucne",
  userId: string | null,
): Promise<{ zapisanych: number; navrhy: ZhodaPoplatku[]; pohybov: number }> {
  const { zmluvy, pohyby, vsZmluv } = await podkladyKontokorentu(klient, companyId);
  if (zmluvy.length === 0) return { zapisanych: 0, navrhy: [], pohybov: 0 };
  const { auto, navrhy } = sparujPoplatkyKontokorentu(pohyby, zmluvy, vsZmluv);
  let zapisanych = 0;
  for (const z of auto) {
    if (await zapisPoplatok(klient, companyId, z, zdroj, userId)) zapisanych++;
  }
  return { zapisanych, navrhy, pohybov: pohyby.length };
}

/**
 * Automatické párovanie po stiahnutí pohybov z banky (volá `bank-sync`).
 * Beží až po splátkach — čo si vzala splátka, kontokorent už nevidí.
 */
export async function sparujKontokorentyFirmyAutomaticky(
  companyId: string,
): Promise<{ zapisanych: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { zapisanych } = await sparujPoplatkyFirmy(supabaseAdmin, companyId, "auto", null);
  return { zapisanych };
}
