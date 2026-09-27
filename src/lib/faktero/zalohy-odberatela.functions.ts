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
    const { data: odkazy } = await supabase
      .from("invoices")
      .select("advance_invoice_id, type, invoice_number")
      .in("advance_invoice_id", ids)
      .is("deleted_at", null);

    const zuctovane = new Set<string>();
    const doklady = new Map<string, string>();
    for (const o of odkazy ?? []) {
      if (o.type === "regular") zuctovane.add(o.advance_invoice_id);
      if (o.type === "advance_payment") doklady.set(o.advance_invoice_id, o.invoice_number);
    }

    return zalohy
      .filter((z: any) => !zuctovane.has(z.id))
      .map((z: any) => ({
        id: z.id,
        invoice_number: z.invoice_number,
        issue_date: z.issue_date,
        total: Number(z.total),
        currency: z.currency,
        doklad_k_platbe: doklady.get(z.id) ?? null,
      }));
  });
