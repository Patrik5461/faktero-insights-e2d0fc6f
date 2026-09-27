/**
 * Daňový doklad k prijatej platbe.
 *
 * Zálohová faktúra daňový doklad nie je — daňová povinnosť vzniká **prijatím
 * platby** (§ 19 ods. 4 zákona o DPH) a platiteľ dane musí do 15 dní od jej
 * prijatia vyhotoviť faktúru k tejto platbe (§ 73 ods. 2). Faktero vedelo
 * zálohovú faktúru a vyúčtovanie, medzičlánok chýbal: DPH z prijatej zálohy
 * sa priznávala mimo aplikácie.
 *
 * Doklad vzniká zo zaplatenej zálohovej faktúry, dedí jej položky a sadzby a
 * dátumom dodania je **deň prijatia platby** — podľa neho patrí do priznania.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Vstup = z.object({
  /** Zálohová faktúra, ktorú odberateľ uhradil. */
  proforma_id: z.string().uuid(),
  /** Deň prijatia platby; podľa neho vzniká daňová povinnosť. */
  datum_platby: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /**
   * Prijatá suma vrátane dane. Keď chýba, berie sa celá záloha; čiastočná
   * platba sa rozpočíta na položky rovnakým pomerom, aby sedeli sadzby.
   */
  suma: z.number().positive().max(10_000_000).optional(),
});

export const vystavDokladKPlatbeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: zf, error: chybaZf } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", data.proforma_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (chybaZf) throw chybaZf;
    if (!zf) throw new Error("Zálohová faktúra sa nenašla.");
    if (zf.type !== "proforma") {
      throw new Error("Daňový doklad k platbe sa vystavuje k zálohovej faktúre.");
    }

    /*
      Jedna záloha, jeden doklad. Druhý by tú istú daň priznal dvakrát —
      čiastočné platby sa riešia sumou, nie ďalším dokladom.
    */
    const { data: uz } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("company_id", zf.company_id)
      .eq("type", "advance_payment")
      .eq("advance_invoice_id", zf.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (uz) {
      throw new Error(`K tejto zálohe už doklad existuje (${uz.invoice_number}).`);
    }

    const { data: polozky } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", zf.id)
      .order("position");
    if (!polozky?.length) throw new Error("Zálohová faktúra nemá položky.");

    const celok = Number(zf.total ?? 0);
    const prijate = Math.min(data.suma ?? celok, celok);
    if (!(prijate > 0)) throw new Error("Prijatá suma musí byť kladná.");
    // Čiastočná platba: položky sa zmenšia rovnakým pomerom, nech sedí rozpis
    // po sadzbách aj celok.
    const pomer = celok > 0 ? prijate / celok : 1;

    const { nextInvoiceNumberDetailed, computeInvoiceTotals } = await import(
      "./invoice-numbering.server"
    );
    const cislo = await nextInvoiceNumberDetailed(
      zf.company_id,
      data.datum_platby,
      "advance_payment",
    );

    type NovaPolozka = {
      name: string;
      description: string | null;
      quantity: number;
      unit: string;
      unit_price: number;
      vat_rate: number;
      position: number;
      product_id: string | null;
    };
    const novePolozky: NovaPolozka[] = polozky.map((p: any, i: number) => ({
      name: p.name,
      description: p.description ?? null,
      quantity: Number(p.quantity),
      unit: p.unit || "ks",
      unit_price: Math.round(Number(p.unit_price) * pomer * 100000) / 100000,
      vat_rate: Number(p.vat_rate),
      position: i,
      product_id: p.product_id ?? null,
      // Zo zálohy sa tovar zo skladu neodpisuje — ten odíde až dodaním.
    }));
    const sumy = computeInvoiceTotals(
      novePolozky.map((p) => ({
        quantity: p.quantity,
        unit_price: p.unit_price,
        vat_rate: p.vat_rate,
      })),
    );

    const { data: doklad, error: chyba } = await supabase
      .from("invoices")
      .insert({
        company_id: zf.company_id,
        created_by: userId,
        customer_id: zf.customer_id,
        type: "advance_payment",
        // Doklad vzniká až po zaplatení, takže je uhradený od prvej chvíle.
        status: "paid",
        invoice_number: cislo.invoice_number,
        sequence_number: cislo.sequence_number,
        variable_symbol: cislo.invoice_number.replace(/\D/g, "") || null,
        issue_date: data.datum_platby,
        delivery_date: data.datum_platby,
        due_date: data.datum_platby,
        paid_at: data.datum_platby,
        currency: zf.currency,
        payment_method: zf.payment_method,
        customer_name: zf.customer_name,
        customer_email: zf.customer_email,
        customer_ico: zf.customer_ico,
        customer_dic: zf.customer_dic,
        customer_ic_dph: zf.customer_ic_dph,
        customer_street: zf.customer_street,
        customer_city: zf.customer_city,
        customer_zip: zf.customer_zip,
        customer_country: zf.customer_country,
        reverse_charge: zf.reverse_charge,
        reverse_charge_type: zf.reverse_charge_type,
        eu_plnenie: zf.eu_plnenie,
        oss: zf.oss,
        oss_country: zf.oss_country,
        subtotal: sumy.subtotal,
        vat_total: sumy.vat_total,
        total: sumy.total,
        advance_invoice_id: zf.id,
        advance_amount: prijate,
        notes: `Daňový doklad k platbe prijatej ${data.datum_platby} k zálohovej faktúre ${zf.invoice_number}.`,
      })
      .select("id, invoice_number, total, currency")
      .single();
    if (chyba || !doklad) throw new Error(chyba?.message ?? "Doklad sa nepodarilo vystaviť.");

    const { error: chybaPoloziek } = await supabase.from("invoice_items").insert(
      novePolozky.map((p, i) => ({
        ...p,
        invoice_id: doklad.id,
        subtotal: sumy.enriched[i].subtotal,
        vat_amount: sumy.enriched[i].vat_amount,
        total: sumy.enriched[i].total,
      })),
    );
    if (chybaPoloziek) {
      // Doklad bez položiek by vyzeral platne a v PDF bol prázdny.
      await supabase.from("invoices").delete().eq("id", doklad.id);
      throw new Error(chybaPoloziek.message);
    }

    return {
      id: doklad.id,
      invoice_number: doklad.invoice_number,
      total: Number(doklad.total),
      currency: doklad.currency,
    };
  });

/** Doklad k platbe, ktorý už k zálohovej faktúre existuje (alebo nič). */
export const dokladKPlatbeFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ proforma_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: doklad } = await supabase
      .from("invoices")
      .select("id, invoice_number, issue_date, total, currency")
      .eq("type", "advance_payment")
      .eq("advance_invoice_id", data.proforma_id)
      .is("deleted_at", null)
      .maybeSingle();
    return doklad ?? null;
  });
