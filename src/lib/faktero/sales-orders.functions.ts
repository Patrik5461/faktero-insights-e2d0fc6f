import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dalsieCisloDokladu } from "./cislovanie";
import {
  centy,
  cislo,
  novoVybavene,
  polozkyNaFakturu,
  stavPodlaVybavenia,
  suctyObjednavky,
  type StavPrijatejObjednavky,
} from "./objednavky-odberatel";

/**
 * Prijaté objednávky od odberateľov.
 *
 * Všetko ide cez klienta viazaného na prihláseného používateľa, takže členstvo
 * vynúti RLS. Že objednávka neukazuje na odberateľa, zákazku ani produkt z
 * cudzej firmy, stráži trigger `guard_sales_order_company` — kontrola v
 * aplikácii by sa dala obísť priamym volaním PostgREST.
 */

const CompanyScoped = z.object({ company_id: z.string().uuid() });
const prazdneNaNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const Polozka = z.object({
  product_id: z.preprocess(prazdneNaNull, z.string().uuid().nullable().optional()),
  stock_item_id: z.preprocess(prazdneNaNull, z.string().uuid().nullable().optional()),
  name: z.string().trim().min(1, "Položka musí mať názov."),
  description: z.string().nullable().optional(),
  quantity: z.coerce.number().positive("Množstvo musí byť väčšie ako nula."),
  unit: z.string().default("ks"),
  unit_price: z.coerce.number().min(0).default(0),
  vat_rate: z.coerce.number().min(0).max(100).default(23),
});

/** Číslovanie OBJ{rok}{poradie} — rovnaký tvar ako ponuky a zákazky. */
async function dalsieCislo(supabase: any, companyId: string, rok: number): Promise<string> {
  const prefix = `OBJ${rok}`;
  const { data: rows } = await supabase
    .from("sales_orders")
    .select("order_number")
    .eq("company_id", companyId)
    .like("order_number", `${prefix}%`)
    .limit(5000);
  return dalsieCisloDokladu(
    prefix,
    (rows ?? []).map((r: any) => r.order_number),
  );
}

async function nacitajObjednavku(supabase: any, companyId: string, id: string) {
  const { data } = await supabase
    .from("sales_orders")
    .select("*, sales_order_items(*), customers(name, email), jobs(job_number, name)")
    .eq("id", id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new Error("Objednávka sa nenašla.");
  return data;
}

/** Prepočítané súčty a stav — jedno miesto, aby sa zoznam a detail nerozišli. */
function doplnVypocty(o: any) {
  const polozky = o.sales_order_items ?? [];
  const sucty = suctyObjednavky(polozky);
  return {
    ...o,
    ...sucty,
    stav_vypocitany: stavPodlaVybavenia(polozky, o.status as StavPrijatejObjednavky),
  };
}

export const listSalesOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      status: z
        .enum(["draft", "confirmed", "partially_invoiced", "completed", "cancelled"])
        .optional(),
      otvorene: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("sales_orders")
      .select(
        "*, sales_order_items(quantity, invoiced_quantity, unit_price, vat_rate), customers(name)",
      )
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .order("order_date", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    // „Otvorené" je stav, nie filter dátumu — vybavené a zrušené sa vynechajú.
    if (data.otvorene) q = q.in("status", ["draft", "confirmed", "partially_invoiced"]);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map(doplnVypocty);
  });

export const getSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const o = await nacitajObjednavku(context.supabase, data.company_id, data.id);
    const { data: faktury } = await context.supabase
      .from("invoices")
      .select("id, invoice_number, issue_date, status, total, deleted_at")
      .eq("company_id", data.company_id)
      .eq("sales_order_id", data.id)
      .order("issue_date", { ascending: false });
    return {
      ...doplnVypocty(o),
      sales_order_items: [...(o.sales_order_items ?? [])].sort(
        (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
      ),
      faktury: (faktury ?? []).filter((f: any) => !f.deleted_at),
    };
  });

const Ulozenie = CompanyScoped.extend({
  id: z.string().uuid().optional(),
  customer_id: z.preprocess(prazdneNaNull, z.string().uuid().nullable().optional()),
  customer_order_number: z.string().nullable().optional(),
  order_date: z.string().min(1, "Zadajte dátum objednávky."),
  requested_date: z.preprocess(prazdneNaNull, z.string().nullable().optional()),
  currency: z.string().default("EUR"),
  job_id: z.preprocess(prazdneNaNull, z.string().uuid().nullable().optional()),
  quote_id: z.preprocess(prazdneNaNull, z.string().uuid().nullable().optional()),
  reserve_stock: z.boolean().default(false),
  note: z.string().nullable().optional(),
  polozky: z.array(Polozka).min(1, "Objednávka musí mať aspoň jednu položku."),
}).refine((v) => !v.requested_date || v.requested_date >= v.order_date, {
  message: "Požadovaný termín nemôže byť skôr ako dátum objednávky.",
});

export const saveSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Ulozenie.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    let odberatel: any = null;
    if (data.customer_id) {
      const { data: c } = await sb
        .from("customers")
        .select("name, ico, email")
        .eq("id", data.customer_id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      odberatel = c;
    }

    const sucty = suctyObjednavky(data.polozky);
    const hlavicka: any = {
      company_id: data.company_id,
      customer_id: data.customer_id ?? null,
      customer_name: odberatel?.name ?? null,
      customer_ico: odberatel?.ico ?? null,
      customer_email: odberatel?.email ?? null,
      customer_order_number: data.customer_order_number || null,
      order_date: data.order_date,
      requested_date: data.requested_date ?? null,
      currency: data.currency,
      job_id: data.job_id ?? null,
      quote_id: data.quote_id ?? null,
      reserve_stock: data.reserve_stock,
      note: data.note || null,
      subtotal: sucty.subtotal,
      vat_total: sucty.vat_total,
      total: sucty.total,
    };

    let id = data.id;
    if (id) {
      const { data: stara } = await sb
        .from("sales_orders")
        .select("status")
        .eq("id", id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      // Vybavenú ani zrušenú objednávku už meniť nedáva zmysel — faktúry z nej
      // sú vystavené a zmena položiek by rozbila prepočet vybavenia.
      if (stara && (stara.status === "completed" || stara.status === "cancelled")) {
        throw new Error("Vybavenú ani zrušenú objednávku už meniť nemožno.");
      }
      const { error } = await sb
        .from("sales_orders")
        .update(hlavicka)
        .eq("id", id)
        .eq("company_id", data.company_id);
      if (error) throw new Error(error.message);
    } else {
      hlavicka.order_number = await dalsieCislo(
        sb,
        data.company_id,
        Number(data.order_date.slice(0, 4)) || new Date().getFullYear(),
      );
      hlavicka.created_by = context.userId;
      const { data: row, error } = await sb
        .from("sales_orders")
        .insert(hlavicka)
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505")
          throw new Error("Objednávka s týmto číslom už existuje, skúste uložiť znova.");
        throw new Error(error.message);
      }
      id = row.id;
    }

    // Vyfakturované množstvá sa pri prepise položiek musia zachovať, inak by
    // úprava objednávky vynulovala jej vybavenie a faktúry by sa dali vystaviť
    // druhýkrát.
    const { data: povodne } = await sb
      .from("sales_order_items")
      .select("id, name, product_id, invoiced_quantity")
      .eq("sales_order_id", id!);
    const vybavene = new Map<string, number>();
    for (const p of povodne ?? []) {
      vybavene.set(`${p.product_id ?? ""}|${p.name}`, cislo(p.invoiced_quantity));
    }

    await sb.from("sales_order_items").delete().eq("sales_order_id", id!);
    const { error: e2 } = await sb.from("sales_order_items").insert(
      data.polozky.map((p, i) => ({
        sales_order_id: id!,
        product_id: p.product_id ?? null,
        stock_item_id: p.stock_item_id ?? null,
        position: i,
        name: p.name,
        description: p.description ?? null,
        quantity: p.quantity,
        invoiced_quantity: Math.min(
          vybavene.get(`${p.product_id ?? ""}|${p.name}`) ?? 0,
          p.quantity,
        ),
        unit: p.unit,
        unit_price: p.unit_price,
        vat_rate: p.vat_rate,
      })),
    );
    if (e2) throw new Error(e2.message);

    return { id: id! };
  });

export const setSalesOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      id: z.string().uuid(),
      status: z.enum(["draft", "confirmed", "cancelled"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const zapis: any = { status: data.status };
    if (data.status === "confirmed") zapis.confirmed_at = new Date().toISOString();
    const { error } = await sb
      .from("sales_orders")
      .update(zapis)
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);

    // Potvrdením sa tovar rezervuje, aby ho medzitým nepredal niekto iný.
    // Rezervuje sa len to, čo má skladovú kartu a sleduje sa na sklade.
    if (data.status === "confirmed") {
      const o = await nacitajObjednavku(sb, data.company_id, data.id);
      if (o.reserve_stock) {
        const idProduktov = (o.sales_order_items ?? [])
          .map((p: any) => p.product_id)
          .filter(Boolean);
        const [{ data: karty }, { data: sklad }] = await Promise.all([
          idProduktov.length
            ? sb
                .from("stock_items")
                .select("id, product_id")
                .eq("company_id", data.company_id)
                .eq("track_stock", true)
                .in("product_id", idProduktov)
                .is("archived_at", null)
            : Promise.resolve({ data: [] as any[] }),
          sb
            .from("warehouses")
            .select("id")
            .eq("company_id", data.company_id)
            .eq("active", true)
            .order("created_at")
            .limit(1)
            .maybeSingle(),
        ]);
        const podlaProduktu = new Map<string, string>();
        (karty ?? []).forEach((k: any) => podlaProduktu.set(k.product_id, k.id));

        if (sklad?.id) {
          for (const p of o.sales_order_items ?? []) {
            const kartaId = p.product_id ? podlaProduktu.get(p.product_id) : null;
            const mnozstvo = cislo(p.quantity) - cislo(p.invoiced_quantity);
            if (!kartaId || mnozstvo <= 0) continue;
            // Duplicitu odmietne jedinečný index; ticho ju preskočíme, aby
            // opakované potvrdenie objednávky nespadlo.
            await sb.from("stock_reservations").insert({
              company_id: data.company_id,
              stock_item_id: kartaId,
              warehouse_id: sklad.id,
              quantity: mnozstvo,
              source_document_type: "sales_order",
              source_document_id: data.id,
              status: "active",
              expires_at: null,
              note: `Objednávka ${o.order_number}`,
              created_by: context.userId,
            });
          }
        }
      }
    }

    // Zrušená objednávka nesmie ďalej držať tovar zarezervovaný.
    if (data.status === "cancelled") {
      await sb
        .from("stock_reservations")
        .update({ status: "cancelled" })
        .eq("company_id", data.company_id)
        .eq("source_document_type", "sales_order")
        .eq("source_document_id", data.id)
        .eq("status", "active");
    }
    return { ok: true };
  });

export const deleteSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: o } = await context.supabase
      .from("sales_orders")
      .select("status")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!o) throw new Error("Objednávka sa nenašla.");
    // Potvrdená objednávka je záväzok voči odberateľovi — tá sa ruší, nie maže.
    if (o.status !== "draft") {
      throw new Error("Zmazať sa dá len rozpracovaná objednávka. Potvrdenú zrušte.");
    }
    const { error } = await context.supabase
      .from("sales_orders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Podklady na faktúru — len to, čo ešte zostáva vybaviť. */
export const getSalesOrderForInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const o = await nacitajObjednavku(context.supabase, data.company_id, data.id);
    const polozky = polozkyNaFakturu(
      [...(o.sales_order_items ?? [])].sort(
        (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
      ),
    );
    return {
      order_number: o.order_number,
      customer_id: o.customer_id,
      customer_order_number: o.customer_order_number,
      job_id: o.job_id,
      currency: o.currency,
      note: o.note,
      polozky: polozky.map((p: any) => ({
        product_id: p.product_id,
        stock_item_id: p.stock_item_id,
        name: p.name,
        description: p.description,
        quantity: p.quantity,
        unit: p.unit,
        unit_price: cislo(p.unit_price),
        vat_rate: cislo(p.vat_rate),
      })),
    };
  });

/**
 * Zapíše, že z objednávky bola vystavená faktúra, a posunie vybavenie položiek.
 * Volá sa až po tom, čo faktúra naozaj vznikla — inak by objednávka vyzerala
 * vybavená bez toho, aby existoval doklad.
 */
export const markSalesOrderInvoiced = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      id: z.string().uuid(),
      invoice_id: z.string().uuid(),
      polozky: z
        .array(
          z.object({
            name: z.string(),
            product_id: z.preprocess(prazdneNaNull, z.string().uuid().nullable().optional()),
            quantity: z.coerce.number().min(0),
          }),
        )
        .default([]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const o = await nacitajObjednavku(sb, data.company_id, data.id);

    // Riadky faktúry sa na položky objednávky páruje podľa produktu a názvu —
    // faktúru mohol používateľ pred uložením ešte upraviť.
    const fakturovane = new Map<string, number>();
    for (const p of data.polozky) {
      const kluc = `${p.product_id ?? ""}|${p.name}`;
      fakturovane.set(kluc, (fakturovane.get(kluc) ?? 0) + cislo(p.quantity));
    }

    const nove: { id: string; invoiced_quantity: number }[] = [];
    for (const p of o.sales_order_items ?? []) {
      const kluc = `${p.product_id ?? ""}|${p.name}`;
      const f = fakturovane.get(kluc);
      if (!f) continue;
      nove.push({ id: p.id, invoiced_quantity: novoVybavene(p, f) });
    }

    for (const n of nove) {
      await sb
        .from("sales_order_items")
        .update({ invoiced_quantity: n.invoiced_quantity })
        .eq("id", n.id)
        .eq("sales_order_id", data.id);
    }

    // Stav sa počíta z čerstvých množstiev, nie z tých, s ktorými sme prišli.
    const poUprave = (o.sales_order_items ?? []).map((p: any) => {
      const zmena = nove.find((n) => n.id === p.id);
      return zmena ? { ...p, invoiced_quantity: zmena.invoiced_quantity } : p;
    });
    const stav = stavPodlaVybavenia(poUprave, o.status as StavPrijatejObjednavky);

    await sb
      .from("sales_orders")
      .update({ status: stav })
      .eq("id", data.id)
      .eq("company_id", data.company_id);

    await sb
      .from("invoices")
      .update({ sales_order_id: data.id })
      .eq("id", data.invoice_id)
      .eq("company_id", data.company_id);

    // Vybavená objednávka už tovar držať nemusí — je vyskladnený faktúrou.
    if (stav === "completed") {
      await sb
        .from("stock_reservations")
        .update({ status: "released" })
        .eq("company_id", data.company_id)
        .eq("source_document_type", "sales_order")
        .eq("source_document_id", data.id)
        .eq("status", "active");
    }

    return { status: stav };
  });

/** Objednávka z prijatej ponuky — zachová položky aj ceny, ktoré odberateľ videl. */
export const createSalesOrderFromQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ quote_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: q } = await sb
      .from("quotes")
      .select("*, quote_items(*)")
      .eq("id", data.quote_id)
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!q) throw new Error("Ponuka sa nenašla.");

    const polozky = [...(q.quote_items ?? [])].sort(
      (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
    );
    if (!polozky.length) throw new Error("Ponuka nemá žiadne položky.");

    const dnes = new Date();
    const datum = `${dnes.getFullYear()}-${String(dnes.getMonth() + 1).padStart(2, "0")}-${String(dnes.getDate()).padStart(2, "0")}`;

    const sucty = suctyObjednavky(polozky);
    const { data: row, error } = await sb
      .from("sales_orders")
      .insert({
        company_id: data.company_id,
        order_number: await dalsieCislo(sb, data.company_id, dnes.getFullYear()),
        customer_id: q.customer_id,
        customer_name: q.customer_name,
        customer_ico: q.customer_ico,
        customer_email: q.customer_email,
        order_date: datum,
        currency: q.currency,
        job_id: q.job_id,
        quote_id: q.id,
        reserve_stock: q.reserve_stock,
        note: q.notes,
        subtotal: sucty.subtotal,
        vat_total: sucty.vat_total,
        total: sucty.total,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: e2 } = await sb.from("sales_order_items").insert(
      polozky.map((p: any, i: number) => ({
        sales_order_id: row.id,
        product_id: p.product_id ?? null,
        position: i,
        name: p.name,
        description: p.description ?? null,
        quantity: cislo(p.quantity),
        unit: p.unit ?? "ks",
        unit_price: centy(cislo(p.unit_price)),
        vat_rate: cislo(p.vat_rate),
      })),
    );
    if (e2) throw new Error(e2.message);

    return { id: row.id };
  });
