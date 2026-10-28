import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { overPristup } from "./over-pristup";

/*
  Detail bankového pohybu a jeho označenie bez dokladu („Pohyb nemá doklad“,
  „Transakčná daň“). Čítanie ide cez RLS prihláseného; zápis cez admin klienta
  až po overení prístupu k Banke — politika úprav pohybov pustí len správcu
  firmy, a účtovník s Bankou na úpravu by inak pohyb označiť nevedel.
*/

const Id = z.object({ company_id: z.string().uuid(), id: z.string().uuid() });

export type DokladPohybu = {
  druh: "faktura" | "prijata" | "doklad" | "splatka" | "poplatok";
  id: string;
  cislo: string | null;
  partner: string | null;
  suma: number;
  mena: string | null;
};

export const detailPohybuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Id.parse(d))
  .handler(async ({ data, context }) => {
    await overPristup(context as any, data.company_id, { oblast: "banka" });
    const sb = context.supabase as any;
    const { data: p, error } = await sb
      .from("bank_transactions")
      .select("*")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Pohyb sa nenašiel.");

    const [ucet, faktura, platby, prijata, doklad, splatka, poplatky, pravidlo] = await Promise.all(
      [
        p.bank_account_id
          ? sb
              .from("bank_accounts")
              .select("iban, account_name")
              .eq("id", p.bank_account_id)
              .maybeSingle()
          : { data: null },
        p.matched_invoice_id
          ? sb
              .from("invoices")
              .select("id, invoice_number, customer_name, total, currency")
              .eq("id", p.matched_invoice_id)
              .maybeSingle()
          : { data: null },
        p.matched_invoice_id
          ? sb.from("payments").select("amount").eq("bank_transaction_id", p.id)
          : { data: [] },
        p.matched_purchase_invoice_id
          ? sb
              .from("purchase_invoices")
              .select("id, invoice_number, supplier_name, amount_total, currency")
              .eq("id", p.matched_purchase_invoice_id)
              .maybeSingle()
          : { data: null },
        p.matched_expense_id
          ? sb
              .from("expense_documents")
              .select("id, document_number, supplier_name, total_amount, currency")
              .eq("id", p.matched_expense_id)
              .maybeSingle()
          : { data: null },
        p.matched_installment_id
          ? sb
              .from("financing_installments")
              .select(
                "id, number, amount, paid_amount, financing_contracts(name, provider_name, currency)",
              )
              .eq("id", p.matched_installment_id)
              .maybeSingle()
          : { data: null },
        sb
          .from("financing_charges")
          .select("id, kind, amount, currency, contract_id")
          .eq("bank_transaction_id", p.id),
        p.vybavenie_pravidlo_id
          ? sb
              .from("pravidla_uctovania")
              .select("id, nazov")
              .eq("id", p.vybavenie_pravidlo_id)
              .maybeSingle()
          : { data: null },
      ],
    );

    const doklady: DokladPohybu[] = [];
    const f = faktura.data;
    if (f) {
      // Čiastočná úhrada: z pohybu na faktúru išlo len toľko, koľko je v úhrade.
      const zPlatieb = ((platby.data ?? []) as { amount: number }[]).reduce(
        (s, x) => s + Number(x.amount || 0),
        0,
      );
      doklady.push({
        druh: "faktura",
        id: f.id,
        cislo: f.invoice_number,
        partner: f.customer_name,
        suma: zPlatieb || Number(f.total || 0),
        mena: f.currency,
      });
    }
    const pf = prijata.data;
    if (pf)
      doklady.push({
        druh: "prijata",
        id: pf.id,
        cislo: pf.invoice_number,
        partner: pf.supplier_name,
        suma: Number(pf.amount_total || 0),
        mena: pf.currency,
      });
    const d = doklad.data;
    if (d)
      doklady.push({
        druh: "doklad",
        id: d.id,
        cislo: d.document_number,
        partner: d.supplier_name,
        suma: Number(d.total_amount || 0),
        mena: d.currency,
      });
    const s = splatka.data;
    if (s)
      doklady.push({
        druh: "splatka",
        id: s.id,
        cislo: s.number != null ? String(s.number) : null,
        partner: s.financing_contracts?.provider_name ?? s.financing_contracts?.name ?? null,
        suma: Number(s.paid_amount ?? s.amount ?? 0),
        mena: s.financing_contracts?.currency ?? null,
      });
    for (const c of (poplatky.data ?? []) as any[])
      doklady.push({
        druh: "poplatok",
        id: c.contract_id,
        cislo: c.kind ?? null,
        partner: null,
        suma: Number(c.amount || 0),
        mena: c.currency ?? null,
      });

    return {
      pohyb: p as Record<string, any>,
      ucet: (ucet.data ?? null) as { iban: string | null; account_name: string | null } | null,
      doklady,
      pravidlo: (pravidlo.data ?? null) as { id: string; nazov: string } | null,
    };
  });

export const oznacPohybFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    Id.extend({
      vybavenie: z.enum(["bez_dokladu", "transakcna_dan"]).nullable(),
      poznamka: z.string().max(200).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await overPristup(context as any, data.company_id, { oblast: "banka", zapis: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin
      .from("bank_transactions")
      .select(
        "id, matched_invoice_id, matched_purchase_invoice_id, matched_expense_id, matched_installment_id",
      )
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!p) throw new Error("Pohyb sa nenašiel.");

    if (data.vybavenie) {
      const { count } = await supabaseAdmin
        .from("financing_charges")
        .select("id", { count: "exact", head: true })
        .eq("bank_transaction_id", p.id);
      if (
        p.matched_invoice_id ||
        p.matched_purchase_invoice_id ||
        p.matched_expense_id ||
        p.matched_installment_id ||
        (count ?? 0) > 0
      )
        throw new Error("Pohyb je spárovaný s dokladom — najprv zrušte párovanie.");
    }

    const poznamka = data.poznamka?.trim() || null;
    const { error } = await supabaseAdmin
      .from("bank_transactions")
      .update(
        data.vybavenie
          ? {
              vybavenie: data.vybavenie,
              vybavenie_poznamka: poznamka,
              vybavenie_pravidlo_id: null,
              vybavene_at: new Date().toISOString(),
              vybavil: (context as any).userId,
            }
          : {
              vybavenie: null,
              vybavenie_poznamka: null,
              vybavenie_pravidlo_id: null,
              vybavene_at: null,
              vybavil: null,
            },
      )
      .eq("id", p.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Uplatní pravidlá „Spárované bez dokladu“ na staršie nespárované pohyby firmy. */
export const uplatniPravidlaBankyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await overPristup(context as any, data.company_id, { oblast: "banka", zapis: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: n, error } = await (supabaseAdmin as any).rpc("faktero_vybav_pohyby_pravidlami", {
      _company: data.company_id,
    });
    if (error) throw new Error(error.message);
    return { vybavenych: Number(n ?? 0) };
  });
