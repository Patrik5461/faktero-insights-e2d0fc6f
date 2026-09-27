/**
 * Zaplatené zálohy odberateľa, ktoré ešte nikto nezúčtoval.
 *
 * Keď sa na ne pri vyúčtovaní zabudne, firma vyfakturuje to isté plnenie
 * druhýkrát a zákazník zaplatí dvakrát — chyba, ktorá sa hľadá ťažko, lebo
 * oba doklady vyzerajú v poriadku. Účtovnícke programy preto na nezúčtovanú
 * zálohu pri fakturovaní upozorňujú; toto je to isté upozornenie.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Vstup = z.object({
  company_id: z.string().uuid(),
  customer_id: z.string().uuid(),
});

export type NezuctovanaZaloha = {
  id: string;
  invoice_number: string;
  issue_date: string;
  total: number;
  currency: string;
  /** Daňový doklad k prijatej platbe, ak už bol vystavený. */
  doklad_k_platbe: string | null;
};

export const nezuctovaneZalohyFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data, context }): Promise<NezuctovanaZaloha[]> => {
    const { supabase } = context as any;

    const { data: zalohy } = await supabase
      .from("invoices")
      .select("id, invoice_number, issue_date, total, currency")
      .eq("company_id", data.company_id)
      .eq("customer_id", data.customer_id)
      .eq("type", "proforma")
      .eq("status", "paid")
      .is("deleted_at", null)
      .order("issue_date", { ascending: true })
      .limit(20);
    if (!zalohy?.length) return [];

    /*
      Na zálohu sa vie odvolávať vyúčtovacia faktúra aj daňový doklad k
      prijatej platbe. Zúčtovanú ju robí len tá prvá — doklad k platbe zálohu
      nespotrebuje, len z nej prizná daň.
    */
    const ids = zalohy.map((z: any) => z.id);
    const [{ data: odpocty }, { data: doklad }] = await Promise.all([
      supabase
        .from("invoice_advances")
        .select("advance_invoice_id, amount")
        .in("advance_invoice_id", ids),
      supabase
        .from("invoices")
        .select("advance_invoice_id, invoice_number")
        .eq("type", "advance_payment")
        .in("advance_invoice_id", ids)
        .is("deleted_at", null),
    ]);

    /*
      Zúčtovaná je záloha, ktorú si už nejaká faktúra odpočítala — celú.
      Čiastočne odpočítaná ostáva v zozname so zvyškom, lebo práve na ten sa
      pri ďalšej faktúre zabúda.
    */
    const odpocitane = new Map<string, number>();
    for (const o of odpocty ?? []) {
      odpocitane.set(o.advance_invoice_id, (odpocitane.get(o.advance_invoice_id) ?? 0) + Number(o.amount));
    }
    const doklady = new Map<string, string>();
    for (const d of doklad ?? []) doklady.set(d.advance_invoice_id, d.invoice_number);

    return zalohy
      .map((z: any) => ({
        id: z.id,
        invoice_number: z.invoice_number,
        issue_date: z.issue_date,
        total: Math.round((Number(z.total) - (odpocitane.get(z.id) ?? 0)) * 100) / 100,
        currency: z.currency,
        doklad_k_platbe: doklady.get(z.id) ?? null,
      }))
      .filter((z: NezuctovanaZaloha) => z.total > 0);
  });
