import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Vystavenie faktúry na jednu obrátku — číslo, hlavička, položky, webhook.
 *
 * Veľký formulár na webe si to robí sám v prehliadači, lebo potrebuje aj
 * zálohy, prenos daňovej povinnosti a sklad. Krátke cesty (telefón, rýchla
 * faktúra) to robiť po častiach nemajú prečo: keď medzi hlavičkou a položkami
 * vypadne spojenie, ostane faktúra bez riadkov, ktorá v prehľade vyzerá
 * platne a v PDF má prázdnu tabuľku. Preto sa pri chybe položiek maže aj
 * hlavička.
 *
 * Zápis ide cez klienta prihláseného používateľa, takže cudziu firmu odfiltruje
 * RLS a limity plánu ustráži ten istý DB trigger ako na webe.
 */

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

const Polozka = z.object({
  name: z.string().trim().min(1).max(255),
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().max(20).default("ks"),
  unit_price: z.number().nonnegative().max(10_000_000),
  vat_rate: z.number().min(0).max(100).default(23),
  product_id: z.string().uuid().nullable().optional(),
});

const NovaFaktura = z.object({
  company_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  issue_date: z.string().regex(DATUM),
  due_date: z.string().regex(DATUM),
  payment_method: z.enum(["bank_transfer", "cash", "card"]).default("bank_transfer"),
  currency: z.string().length(3).default("EUR"),
  notes: z.string().max(2000).nullable().optional(),
  // Rýchla faktúra zakladá návrh, mobil vystavuje rovno. Ďalšie stavy sem
  // nepatria — tie vznikajú až životom faktúry (odoslaná, uhradená).
  status: z.enum(["draft", "issued"]).default("issued"),
  items: z.array(Polozka).min(1).max(50),
  /**
   * Kľúč proti duplicite. Appka ho dáva odloženej faktúre — keď sa signál
   * pretrhne po zápise, ale pred doručením odpovede, fronta pošle to isté
   * znova a bez tohto by vznikli dve faktúry. Rovnaký mechanizmus ako vo
   * verejnom API.
   */
  external_id: z.string().max(120).optional().nullable(),
  /**
   * Číslo, ktoré si appka vypýtala dopredu, aby vedela vystaviť aj bez signálu.
   * Musí byť nepoužitá rezervácia tejto firmy — inak sa faktúra odmietne, nie
   * očísluje nanovo: ľudia už to číslo majú na papieri.
   */
  reserved_number: z.string().max(60).optional().nullable(),
});

export const vystavFakturuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => NovaFaktura.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Radšej zastaviť hneď než po vygenerovaní čísla — chybová hláška o
    // predplatnom je zrozumiteľnejšia než hláška z databázového triggera.
    const { assertCompanyActive } = await import("./active-check.server");
    await assertCompanyActive(data.company_id);

    // Už raz vystavená? Fronta v telefóne posiela dovtedy, kým nedostane
    // odpoveď — pri stratenej odpovedi by inak vznikla druhá faktúra.
    if (data.external_id) {
      const { data: uz } = await supabase
        .from("invoices")
        .select("id, invoice_number, total, currency, customer_id")
        .eq("company_id", data.company_id)
        .eq("external_id", data.external_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (uz) {
        const { data: odb } = uz.customer_id
          ? await supabase.from("customers").select("email").eq("id", uz.customer_id).maybeSingle()
          : { data: null };
        return {
          id: uz.id,
          invoice_number: uz.invoice_number,
          total: Number(uz.total),
          currency: uz.currency,
          customer_email: odb?.email ?? null,
          uz_existovala: true,
        };
      }
    }

    const { data: odberatel } = await supabase
      .from("customers")
      .select("id, name, email, ico, dic, ic_dph, street, city, zip, country")
      .eq("id", data.customer_id)
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!odberatel) throw new Error("Odberateľ sa nenašiel.");

    const { computeInvoiceTotals, nextInvoiceNumberDetailed } =
      await import("./invoice-numbering.server");
    const sucty = computeInvoiceTotals(
      data.items.map((i) => ({
        quantity: i.quantity,
        unit_price: i.unit_price,
        vat_rate: i.vat_rate,
      })),
    );
    // Číslo dáva RPC v transakcii — počítať ho z počtu faktúr alebo si ho
    // vymyslieť z času znamená duplicitu alebo dieru v rade. Výnimkou je
    // faktúra vystavená bez signálu: tá si číslo priniesla z rezervácie.
    let rezervacia: { id: string } | null = null;
    let invoice_number: string;
    let sequence_number: number;

    if (data.reserved_number) {
      const { data: r } = await supabase
        .from("invoice_number_reservations")
        .select("id, invoice_number, sequence_number, used_at, expires_at")
        .eq("company_id", data.company_id)
        .eq("invoice_number", data.reserved_number)
        .maybeSingle();
      if (!r) throw new Error(`Číslo ${data.reserved_number} nie je rezervované pre túto firmu.`);
      if (r.used_at) {
        throw new Error(`Číslo ${data.reserved_number} už bolo použité na inej faktúre.`);
      }
      rezervacia = { id: r.id };
      invoice_number = r.invoice_number;
      sequence_number = r.sequence_number;
    } else {
      const dalsie = await nextInvoiceNumberDetailed(data.company_id, data.issue_date);
      invoice_number = dalsie.invoice_number;
      sequence_number = dalsie.sequence_number;
    }

    const { data: faktura, error: chyba } = await supabase
      .from("invoices")
      .insert({
        company_id: data.company_id,
        created_by: userId,
        customer_id: odberatel.id,
        type: "regular" as const,
        status: data.status,
        invoice_number,
        sequence_number,
        // Variabilný symbol nesmie byť prázdny reťazec — z čísla faktúry
        // ostanú len číslice, presne ako to robí web aj API.
        variable_symbol: invoice_number.replace(/\D/g, "") || null,
        issue_date: data.issue_date,
        delivery_date: data.issue_date,
        due_date: data.due_date,
        currency: data.currency,
        payment_method: data.payment_method,
        customer_name: odberatel.name,
        customer_email: odberatel.email,
        customer_ico: odberatel.ico,
        customer_dic: odberatel.dic,
        customer_ic_dph: odberatel.ic_dph,
        customer_street: odberatel.street,
        customer_city: odberatel.city,
        customer_zip: odberatel.zip,
        customer_country: odberatel.country ?? "SK",
        subtotal: sucty.subtotal,
        vat_total: sucty.vat_total,
        total: sucty.total,
        notes: data.notes || null,
        external_id: data.external_id || null,
      })
      .select("id, invoice_number, total, currency, status, customer_id, external_id")
      .single();
    if (chyba || !faktura) {
      const { friendlyError } = await import("./plan-error");
      throw new Error(friendlyError(chyba, "Faktúru sa nepodarilo vystaviť."));
    }

    const riadky = data.items.map((it, i) => ({
      invoice_id: faktura.id,
      position: i,
      name: it.name,
      quantity: it.quantity,
      unit: it.unit || "ks",
      unit_price: it.unit_price,
      vat_rate: it.vat_rate,
      subtotal: sucty.enriched[i].subtotal,
      vat_amount: sucty.enriched[i].vat_amount,
      total: sucty.enriched[i].total,
      product_id: it.product_id ?? null,
    }));
    const { error: chybaRiadkov } = await supabase.from("invoice_items").insert(riadky);
    if (chybaRiadkov) {
      // Faktúra bez položiek je horšia než žiadna — v prehľade vyzerá platne
      // a v PDF je prázdna tabuľka.
      await supabase.from("invoices").delete().eq("id", faktura.id);
      throw new Error(chybaRiadkov.message);
    }

    // Rezervácia sa značí až tu. Keby sa značila pred zápisom a ten by zlyhal,
    // číslo by ostalo spálené — a človek ho má napísané na papieri.
    if (rezervacia) {
      await supabase
        .from("invoice_number_reservations")
        .update({ used_at: new Date().toISOString(), invoice_id: faktura.id })
        .eq("id", rezervacia.id);
    }

    try {
      const { triggerEvent, invoicePayload } = await import("./webhook-trigger.server");
      await triggerEvent({
        company_id: data.company_id,
        event: "invoice.created",
        data: invoicePayload(faktura),
      });
    } catch {
      // Webhook je doplnok — faktúra je vystavená a to je to podstatné.
    }

    return {
      id: faktura.id,
      invoice_number: faktura.invoice_number,
      total: Number(faktura.total),
      currency: faktura.currency,
      customer_email: odberatel.email,
    };
  });
