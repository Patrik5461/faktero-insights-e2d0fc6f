/*
  Zápis cez verejné API: prijaté faktúry, bločky, hromadný prenos kontaktov,
  produkty, firmy a pozvánky, bankové účty a ich pohyby.

  Endpointy v routes/api/v1 sú len tenké obaly — overenie, mapovanie a zápis
  sú tu, aby ich zdieľali REST aj MCP (nástroje MCP volajú to isté REST API).
  Všetko ide cez `ctx.supabase` (servisný klient) a vždy s filtrom firmy.
*/
import { z } from "zod";
import { vsPrijatejNaUlozenie } from "@/lib/faktero/variabilny-symbol";
import type { ApiCtx } from "./api-auth.server";
import { err, ok } from "./api-auth.server";
import { ZnackyVstup, maZnacky } from "./api-evidencia";
import { chybaDb, riadokZnaciek, strazZamku } from "./api-evidencia.server";

type Odpoved = { status: number; body: any };
const r2 = (n: number) => Math.round(n * 100) / 100;
const lenCislice = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const jeUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const DATUM = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum v tvare RRRR-MM-DD");


/* ---------------- spoločné časti ---------------- */

const Partner = z.object({
  name: z.string().trim().min(1).max(255),
  ico: z.string().max(32).nullish(),
  dic: z.string().max(32).nullish(),
  ic_dph: z.string().max(32).nullish(),
  iban: z.string().max(42).nullish(),
  street: z.string().max(255).nullish(),
  city: z.string().max(120).nullish(),
  zip: z.string().max(20).nullish(),
  country: z.string().length(2).nullish(),
  email: z.string().email().max(255).nullish(),
});
type PartnerVstup = z.infer<typeof Partner>;

const Subor = z.object({
  file_name: z.string().trim().min(1).max(200),
  content_type: z.string().max(100),
  content_base64: z.string().min(4),
});
const MIME_SUBORU = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

const Zauctovanie = z
  .object({
    predkontacia: z.string().max(60).nullish(),
    clenenie_dph: z.string().max(30).nullish(),
    kv_clenenie: z.string().max(10).nullish(),
    stredisko: z.string().max(60).nullish(),
    cinnost: z.string().max(60).nullish(),
    /** true = doklad je zaúčtovaný (autopilot ho nemení). */
    booked: z.boolean().optional(),
  })
  .partial();

const PolozkaPrijatej = z.object({
  name: z.string().trim().min(1).max(500),
  quantity: z.number().default(1),
  unit: z.string().max(20).nullish(),
  /** Jednotková cena bez DPH. */
  unit_price: z.number(),
  vat_rate: z.number().min(0).max(100).default(0),
});

const UHRADA: Record<string, "prevod" | "hotovost" | "karta"> = {
  prevod: "prevod",
  bank_transfer: "prevod",
  transfer: "prevod",
  hotovost: "hotovost",
  cash: "hotovost",
  karta: "karta",
  card: "karta",
};
const uhrada = (v: string | null | undefined) => (v ? (UHRADA[v.toLowerCase()] ?? null) : null);

/** Kontakt v adresári firmy — podľa IČO, bez IČO podľa mena. Chýbajúci sa založí. */
export async function partnerId(
  ctx: ApiCtx,
  p: PartnerVstup,
  rola: "odberatel" | "dodavatel",
): Promise<string | null> {
  const db = ctx.supabase as any;
  const ico = lenCislice(p.ico);
  let q = db
    .from("customers")
    .select("id, odberatel, dodavatel, iban")
    .eq("company_id", ctx.company_id)
    .is("deleted_at", null)
    .limit(1);
  q = ico ? q.eq("ico", ico) : q.ilike("name", p.name.trim().replace(/[%_\\]/g, (m) => `\\${m}`));
  const { data: uz } = await q.maybeSingle();
  if (uz) {
    const zmena: Record<string, unknown> = {};
    if (!uz[rola]) zmena[rola] = true;
    if (rola === "dodavatel" && p.iban && !uz.iban) zmena.iban = p.iban;
    if (Object.keys(zmena).length)
      await db.from("customers").update(zmena).eq("id", uz.id).eq("company_id", ctx.company_id);
    return uz.id;
  }
  const { data, error } = await db
    .from("customers")
    .insert({
      company_id: ctx.company_id,
      name: p.name.trim(),
      ico: ico || null,
      dic: p.dic ?? null,
      ic_dph: p.ic_dph ?? null,
      street: p.street ?? null,
      city: p.city ?? null,
      zip: p.zip ?? null,
      country: p.country?.toUpperCase() ?? "SK",
      email: p.email ?? null,
      iban: rola === "dodavatel" ? (p.iban ?? null) : null,
      odberatel: rola === "odberatel",
      dodavatel: rola === "dodavatel",
    })
    .select("id")
    .single();
  return error ? null : data.id;
}

/** Súbor dokladu z base64 do koša firmy. */
async function ulozSubor(ctx: ApiCtx, kos: string, s: z.infer<typeof Subor>) {
  const mime = s.content_type.split(";")[0]!.trim().toLowerCase();
  if (!MIME_SUBORU.includes(mime))
    throw new Error(`file.content_type musí byť jeden z: ${MIME_SUBORU.join(", ")}.`);
  const bajty = Buffer.from(s.content_base64, "base64");
  if (!bajty.length) throw new Error("file.content_base64 nie je platný base64.");
  if (bajty.length > 14 * 1024 * 1024) throw new Error("Súbor je väčší ako 14 MB.");
  const pripona = (s.file_name.split(".").pop() ?? "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
  const cesta = `${ctx.company_id}/${crypto.randomUUID()}.${pripona || "pdf"}`;
  const { error } = await ctx.supabase.storage
    .from(kos)
    .upload(cesta, bajty, { contentType: mime, upsert: false });
  if (error) throw new Error(`Súbor sa nepodarilo uložiť: ${error.message}`);
  return { file_path: cesta, file_mime: mime, file_size: bajty.length };
}

/** Súčty z položiek; zadané súčty majú prednosť, ale musia so položkami sedieť. */
function sucty(
  polozky: z.infer<typeof PolozkaPrijatej>[] | undefined,
  zadane: { zaklad?: number | null; dph?: number | null; spolu?: number | null },
) {
  const riadky = (polozky ?? []).map((p) => {
    const zaklad = r2(p.unit_price * p.quantity);
    const dph = r2((zaklad * p.vat_rate) / 100);
    return { ...p, zaklad, dph, spolu: r2(zaklad + dph) };
  });
  const zP = r2(riadky.reduce((s, x) => s + x.zaklad, 0));
  const dP = r2(riadky.reduce((s, x) => s + x.dph, 0));
  let zaklad = zadane.zaklad ?? (riadky.length ? zP : null);
  let dph = zadane.dph ?? (riadky.length ? dP : null);
  let spolu = zadane.spolu ?? (zaklad != null && dph != null ? r2(zaklad + dph) : null);
  if (spolu != null && zaklad != null && dph == null) dph = r2(spolu - zaklad);
  if (spolu != null && dph != null && zaklad == null) zaklad = r2(spolu - dph);
  if (spolu != null && zaklad == null && dph == null) {
    zaklad = spolu;
    dph = 0;
  }
  return { riadky, zaklad, dph, spolu };
}

/* ---------------- prijaté faktúry ---------------- */

const PrijataVstup = z.object({
  external_id: z.string().trim().max(120).nullish(),
  invoice_number: z.string().trim().min(1).max(80),
  type: z.enum(["regular", "proforma"]).default("regular"),
  supplier: Partner,
  issue_date: DATUM,
  delivery_date: DATUM.nullish(),
  due_date: DATUM.nullish(),
  received_date: DATUM.nullish(),
  currency: z.string().length(3).default("EUR"),
  exchange_rate: z.number().positive().nullish(),
  variable_symbol: z.string().max(20).nullish(),
  constant_symbol: z.string().max(10).nullish(),
  specific_symbol: z.string().max(20).nullish(),
  payment_method: z.string().max(20).nullish(),
  items: z.array(PolozkaPrijatej).max(500).optional(),
  amount_without_vat: z.number().nullish(),
  vat_amount: z.number().nullish(),
  amount_total: z.number().nullish(),
  reverse_charge: z.boolean().optional(),
  reverse_charge_type: z.enum(["domestic_69", "eu_b2b"]).nullish(),
  dph_rezim: z.enum(["tuzemsko", "samozdanenie", "nadobudnutie", "dovoz", "bez_dane"]).nullish(),
  opravuje_cislo: z.string().max(80).nullish(),
  order_number: z.string().max(80).nullish(),
  delivery_note_number: z.string().max(80).nullish(),
  note: z.string().max(4000).nullish(),
  /** Dátum úhrady — faktúra bude zaplatená. */
  payment_date: DATUM.nullish(),
  accounting: Zauctovanie.optional(),
  file: Subor.optional(),
}).merge(ZnackyVstup);

function riadokPrijatej(d: Partial<z.infer<typeof PrijataVstup>>, teraz: string) {
  const s = sucty(d.items, {
    zaklad: d.amount_without_vat,
    dph: d.vat_amount,
    spolu: d.amount_total,
  });
  const a = d.accounting ?? {};
  const r: Record<string, unknown> = {};
  const nastav = (k: string, v: unknown) => {
    if (v !== undefined) r[k] = v;
  };
  if (d.supplier) {
    nastav("supplier_name", d.supplier.name.trim());
    nastav("supplier_ico", lenCislice(d.supplier.ico) || null);
    nastav("supplier_dic", d.supplier.dic ?? null);
    nastav("supplier_ic_dph", d.supplier.ic_dph ?? null);
    nastav("supplier_iban", d.supplier.iban ?? null);
    nastav("supplier_street", d.supplier.street ?? null);
    nastav("supplier_city", d.supplier.city ?? null);
    nastav("supplier_zip", d.supplier.zip ?? null);
    nastav("supplier_country", d.supplier.country?.toUpperCase() ?? null);
    nastav("supplier_email", d.supplier.email ?? null);
  }
  nastav("invoice_number", d.invoice_number);
  nastav("type", d.type);
  nastav("issue_date", d.issue_date);
  nastav("delivery_date", d.delivery_date);
  nastav("received_date", d.received_date ?? d.issue_date);
  nastav("due_date", d.due_date ?? d.issue_date);
  nastav("currency", d.currency?.toUpperCase());
  nastav("exchange_rate", d.exchange_rate);
  nastav("variable_symbol", d.variable_symbol);
  nastav("constant_symbol", d.constant_symbol);
  nastav("specific_symbol", d.specific_symbol);
  if (d.payment_method !== undefined) nastav("payment_method", uhrada(d.payment_method));
  if (d.items || d.amount_total != null || d.amount_without_vat != null || d.vat_amount != null) {
    r.amount_without_vat = s.zaklad ?? 0;
    r.vat_amount = s.dph ?? 0;
    r.amount_total = s.spolu ?? 0;
  }
  if (d.items)
    r.items = s.riadky.map((x) => ({
      name: x.name,
      quantity: x.quantity,
      unit_price: x.unit_price,
      vat_rate: x.vat_rate,
      total: x.spolu,
      unit: x.unit ?? null,
    }));
  nastav("reverse_charge", d.reverse_charge);
  nastav("reverse_charge_type", d.reverse_charge_type);
  nastav("dph_rezim", d.dph_rezim);
  nastav("opravuje_cislo", d.opravuje_cislo);
  nastav("order_number", d.order_number);
  nastav("delivery_note_number", d.delivery_note_number);
  nastav("note", d.note);
  if (d.payment_date !== undefined) {
    r.payment_date = d.payment_date;
    if (d.payment_date) r.status = "paid";
  }
  if (d.accounting) {
    nastav("pohoda_predkontacia", a.predkontacia);
    nastav("pohoda_clenenie_dph", a.clenenie_dph);
    nastav("kv_clenenie", a.kv_clenenie);
    nastav("stredisko", a.stredisko);
    nastav("cinnost", a.cinnost);
    if (a.booked === true) {
      r.zauctovane_at = teraz;
      r.zauctovanie_zdroj = "manual";
      if (!r.status) r.status = "booked";
    }
    if (a.booked === false) r.zauctovane_at = null;
  }
  return { riadok: r, sumy: s };
}

const STL_PRIJATEJ =
  "id, external_id, invoice_number, type, status, supplier_name, supplier_ico, issue_date, due_date, payment_date, currency, amount_without_vat, vat_amount, amount_total, stav_id, stitky, komentar, int_poznamka, pohoda_predkontacia, pohoda_clenenie_dph, kv_clenenie, zauctovane_at, exported_at, source, created_at, updated_at";

export async function zalozPrijatu(ctx: ApiCtx): Promise<Odpoved> {
  const v = PrijataVstup.safeParse(ctx.requestBody);
  if (!v.success)
    return err("validation_error", "Neplatná prijatá faktúra.", 400, v.error.flatten());
  const d = v.data;
  const db = ctx.supabase as any;
  if (d.external_id) {
    const { data: uz } = await db
      // aj-zmazane: idempotencia podľa external_id — jedinečný index platí aj pre zmazané
      .from("purchase_invoices")
      .select(STL_PRIJATEJ)
      .eq("company_id", ctx.company_id)
      .eq("external_id", d.external_id)
      .maybeSingle();
    if (uz) return ok({ objekt: "purchase_invoice", ...uz, existovala: true }, 200);
  }
  const teraz = new Date().toISOString();
  const { riadok, sumy: s } = riadokPrijatej(d, teraz);
  if (s.spolu == null)
    return err("validation_error", "Zadajte položky (items) alebo sumy (amount_total).");
  // Bez external_id: tá istá faktúra (dodávateľ + číslo + suma) sa druhýkrát nezaloží.
  const ico = lenCislice(d.supplier.ico);
  if (!d.external_id && ico) {
    const { data: dup } = await db
      .from("purchase_invoices")
      .select("id")
      .eq("company_id", ctx.company_id)
      .eq("supplier_ico", ico)
      .eq("invoice_number", d.invoice_number)
      .eq("amount_total", s.spolu)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (dup) return err("duplicate", "Táto prijatá faktúra už existuje.", 409, { id: dup.id });
  }
  let subor = {};
  if (d.file) {
    try {
      subor = await ulozSubor(ctx, "purchase-invoices", d.file);
    } catch (e: any) {
      return err("validation_error", e.message);
    }
  }
  const zn = await riadokZnaciek(ctx, d, []);
  if (!zn.ok) return zn.odpoved;
  const customer_id = await partnerId(ctx, d.supplier, "dodavatel");
  // Cudzia mena: kurz ECB/ČNB hneď do riadku, inak by ho exporty vynechali.
  const kurz = await (await import("./kurz-dokladu.server")).doplnovacKurzov(ctx.company_id)(
    "purchase_invoices",
    riadok,
  );
  const { data, error } = await db
    .from("purchase_invoices")
    .insert({
      ...riadok,
      ...kurz,
      ...zn.riadok,
      variable_symbol: vsPrijatejNaUlozenie(d.variable_symbol, d.invoice_number),
      status: riadok.status ?? "received",
      company_id: ctx.company_id,
      customer_id,
      external_id: d.external_id ?? null,
      source: "api",
      ...subor,
    })
    .select(STL_PRIJATEJ)
    .single();
  if (error) return chybaDb(error);
  return ok({ objekt: "purchase_invoice", ...data }, 201);
}

export async function upravPrijatu(ctx: ApiCtx, id: string): Promise<Odpoved> {
  if (!jeUuid(id)) return err("not_found", "Prijatá faktúra sa nenašla.", 404);
  const v = PrijataVstup.omit({ external_id: true }).partial().safeParse(ctx.requestBody);
  if (!v.success) return err("validation_error", "Neplatné údaje.", 400, v.error.flatten());
  const { riadok } = riadokPrijatej(v.data, new Date().toISOString());
  const { data: stary } = await (ctx.supabase as any)
    .from("purchase_invoices")
    .select("*")
    .eq("company_id", ctx.company_id)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!stary) return err("not_found", "Prijatá faktúra sa nenašla.", 404);
  if (maZnacky(v.data)) {
    const zn = await riadokZnaciek(ctx, v.data, stary.stitky ?? []);
    if (!zn.ok) return zn.odpoved;
    Object.assign(riadok, zn.riadok);
  }
  // Zámok odovzdaného dokladu: servisný kľúč spúšťač púšťa, stráži ho API.
  const zamok = strazZamku("purchase_invoices", stary, riadok);
  if (zamok) return zamok;
  if (v.data.file) {
    try {
      Object.assign(riadok, await ulozSubor(ctx, "purchase-invoices", v.data.file));
    } catch (e: any) {
      return err("validation_error", e.message);
    }
  }
  if (!Object.keys(riadok).length) return err("validation_error", "Nič na zmenu.");
  const { data, error } = await (ctx.supabase as any)
    .from("purchase_invoices")
    .update(riadok)
    .eq("company_id", ctx.company_id)
    .eq("id", id)
    .is("deleted_at", null)
    .select(STL_PRIJATEJ)
    .maybeSingle();
  if (error) return chybaDb(error);
  if (!data) return err("not_found", "Prijatá faktúra sa nenašla.", 404);
  return ok({ objekt: "purchase_invoice", ...data });
}

/* ---------------- bločky ---------------- */

const BlocekVstup = z.object({
  external_id: z.string().trim().max(120).nullish(),
  document_number: z.string().max(120).nullish(),
  supplier: Partner.partial({ name: true }).extend({ name: z.string().max(255).nullish() }),
  issue_date: DATUM,
  currency: z.string().length(3).default("EUR"),
  total_amount: z.number(),
  vat_breakdown: z
    .array(z.object({ rate: z.number().min(0).max(100), base: z.number(), vat: z.number() }))
    .max(10)
    .optional(),
  items: z.array(PolozkaPrijatej).max(300).optional(),
  payment_method: z.string().max(20).default("karta"),
  /** Hotovosť sa započíta do pokladne; false = mimo pokladne. */
  cash_register: z.boolean().default(true),
  category: z.string().max(60).nullish(),
  note: z.string().max(4000).nullish(),
  accounting: Zauctovanie.optional(),
  file: Subor.optional(),
}).merge(ZnackyVstup);

function riadokBlocku(d: Partial<z.infer<typeof BlocekVstup>>, teraz: string) {
  const r: Record<string, unknown> = {};
  const nastav = (k: string, v: unknown) => {
    if (v !== undefined) r[k] = v;
  };
  if (d.supplier) {
    nastav("supplier_name", d.supplier.name ?? null);
    nastav("supplier_ico", lenCislice(d.supplier.ico) || null);
    nastav("supplier_ic_dph", d.supplier.ic_dph ?? null);
  }
  nastav("document_number", d.document_number);
  nastav("issue_date", d.issue_date);
  nastav("currency", d.currency?.toUpperCase());
  if (d.total_amount !== undefined) {
    const rozpis = d.vat_breakdown ?? [];
    const dph = r2(rozpis.reduce((s, x) => s + x.vat, 0));
    r.total_amount = d.total_amount;
    r.vat_amount = dph;
    r.net_amount = r2(d.total_amount - dph);
    r.vat_breakdown = rozpis.length
      ? rozpis.map((x) => ({ sadzba: x.rate, zaklad: x.base, dph: x.vat }))
      : null;
    r.vat_rate = rozpis.length === 1 ? rozpis[0]!.rate : null;
  }
  if (d.items) {
    const s = sucty(d.items, {});
    r.items = s.riadky.map((x) => ({
      name: x.name,
      quantity: x.quantity,
      unit_price: x.unit_price,
      vat_rate: x.vat_rate,
      total: x.spolu,
    }));
  }
  if (d.payment_method !== undefined) {
    const u = uhrada(d.payment_method) ?? "karta";
    r.payment_method = u;
    r.mimo_pokladne = u === "hotovost" && d.cash_register === false;
  }
  nastav("category", d.category);
  nastav("note", d.note);
  if (d.accounting) {
    const a = d.accounting;
    nastav("pohoda_predkontacia", a.predkontacia);
    nastav("pohoda_clenenie_dph", a.clenenie_dph);
    nastav("kv_clenenie", a.kv_clenenie);
    nastav("stredisko", a.stredisko);
    nastav("cinnost", a.cinnost);
    if (a.booked === true) {
      r.zauctovane_at = teraz;
      r.zauctovanie_zdroj = "manual";
    }
    if (a.booked === false) r.zauctovane_at = null;
  }
  return r;
}

const STL_BLOCKU =
  "id, external_id, document_number, status, supplier_name, supplier_ico, issue_date, currency, total_amount, vat_amount, net_amount, vat_breakdown, payment_method, mimo_pokladne, stav_id, stitky, komentar, int_poznamka, pohoda_predkontacia, pohoda_clenenie_dph, kv_clenenie, zauctovane_at, exported_at, source, created_at, updated_at";

export async function zalozBlocek(ctx: ApiCtx): Promise<Odpoved> {
  const v = BlocekVstup.safeParse(ctx.requestBody);
  if (!v.success) return err("validation_error", "Neplatný bloček.", 400, v.error.flatten());
  const d = v.data;
  const db = ctx.supabase as any;
  if (d.external_id) {
    const { data: uz } = await db
      .from("expense_documents")
      .select(STL_BLOCKU)
      .eq("company_id", ctx.company_id)
      .eq("external_id", d.external_id)
      .maybeSingle();
    if (uz) return ok({ objekt: "receipt", ...uz, existoval: true }, 200);
  }
  let subor = {};
  if (d.file) {
    try {
      subor = await ulozSubor(ctx, "expense-receipts", d.file);
    } catch (e: any) {
      return err("validation_error", e.message);
    }
  }
  const zn = await riadokZnaciek(ctx, d, []);
  if (!zn.ok) return zn.odpoved;
  const teraz = new Date().toISOString();
  const blocek = riadokBlocku(d, teraz);
  const kurz = await (await import("./kurz-dokladu.server")).doplnovacKurzov(ctx.company_id)(
    "expense_documents",
    blocek,
  );
  const { data, error } = await db
    .from("expense_documents")
    .insert({
      ...blocek,
      ...kurz,
      ...zn.riadok,
      company_id: ctx.company_id,
      external_id: d.external_id ?? null,
      source: "api",
      status: "processed",
      processed_at: teraz,
      ...subor,
    })
    .select(STL_BLOCKU)
    .single();
  if (error) return chybaDb(error);
  return ok({ objekt: "receipt", ...data }, 201);
}

export async function upravBlocek(ctx: ApiCtx, id: string): Promise<Odpoved> {
  if (!jeUuid(id)) return err("not_found", "Bloček sa nenašiel.", 404);
  const v = BlocekVstup.omit({ external_id: true }).partial().safeParse(ctx.requestBody);
  if (!v.success) return err("validation_error", "Neplatné údaje.", 400, v.error.flatten());
  const riadok = riadokBlocku(v.data, new Date().toISOString());
  const { data: stary } = await (ctx.supabase as any)
    .from("expense_documents")
    .select("*")
    .eq("company_id", ctx.company_id)
    .eq("id", id)
    .maybeSingle();
  if (!stary) return err("not_found", "Bloček sa nenašiel.", 404);
  if (maZnacky(v.data)) {
    const zn = await riadokZnaciek(ctx, v.data, stary.stitky ?? []);
    if (!zn.ok) return zn.odpoved;
    Object.assign(riadok, zn.riadok);
  }
  const zamok = strazZamku("expense_documents", stary, riadok);
  if (zamok) return zamok;
  if (v.data.file) {
    try {
      Object.assign(riadok, await ulozSubor(ctx, "expense-receipts", v.data.file));
    } catch (e: any) {
      return err("validation_error", e.message);
    }
  }
  if (!Object.keys(riadok).length) return err("validation_error", "Nič na zmenu.");
  const { data, error } = await (ctx.supabase as any)
    .from("expense_documents")
    .update(riadok)
    .eq("company_id", ctx.company_id)
    .eq("id", id)
    .select(STL_BLOCKU)
    .maybeSingle();
  if (error) return chybaDb(error);
  if (!data) return err("not_found", "Bloček sa nenašiel.", 404);
  return ok({ objekt: "receipt", ...data });
}

/* ---------------- hromadný prenos kontaktov ---------------- */

export const KontaktVstup = z.object({
  external_id: z.string().max(120).nullish(),
  name: z.string().trim().min(1).max(255),
  ico: z.string().max(32).nullish(),
  dic: z.string().max(32).nullish(),
  ic_dph: z.string().max(32).nullish(),
  street: z.string().max(255).nullish(),
  city: z.string().max(120).nullish(),
  zip: z.string().max(20).nullish(),
  country: z.string().length(2).nullish(),
  email: z.string().email().max(255).nullish(),
  phone: z.string().max(40).nullish(),
  contact_person: z.string().max(120).nullish(),
  iban: z.string().max(42).nullish(),
  swift: z.string().max(11).nullish(),
  notes: z.string().max(4000).nullish(),
  typ: z.enum(["firma", "fyzicka"]).nullish(),
  /** Rola v adresári — predvolene odberateľ. */
  customer: z.boolean().optional(),
  supplier: z.boolean().optional(),
});

const ImportKontaktov = z.object({
  contacts: z.array(z.unknown()).min(1).max(1000),
  /** true = prepíše existujúce polia zadanými hodnotami; inak doplní len prázdne. */
  update_existing: z.boolean().default(false),
});

const POLIA_KONTAKTU = [
  "name",
  "dic",
  "ic_dph",
  "street",
  "city",
  "zip",
  "country",
  "email",
  "phone",
  "contact_person",
  "iban",
  "swift",
  "notes",
  "typ",
] as const;

const menoKluc = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Prenos adresára (napr. z iného programu). Páruje podľa external_id, IČO,
 * bez IČO podľa mena. Existujúci kontakt sa predvolene len doplní —
 * prepíše sa iba s `update_existing: true`. Webhooky sa pri prenose neposielajú.
 */
export async function importKontaktov(ctx: ApiCtx): Promise<Odpoved> {
  const v = ImportKontaktov.safeParse(ctx.requestBody);
  if (!v.success)
    return err(
      "validation_error",
      "Pošlite { contacts: [...] } (1 až 1000 kontaktov).",
      400,
      v.error.flatten(),
    );
  const db = ctx.supabase as any;
  const existujuce: any[] = [];
  for (let od = 0; ; od += 1000) {
    const { data, error } = await db
      .from("customers")
      .select("id, external_id, ico, name, odberatel, dodavatel, " + POLIA_KONTAKTU.join(", "))
      .eq("company_id", ctx.company_id)
      .is("deleted_at", null)
      .order("id")
      .range(od, od + 999);
    if (error) return chybaDb(error);
    existujuce.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const podlaExt = new Map(existujuce.filter((c) => c.external_id).map((c) => [c.external_id, c]));
  const podlaIco = new Map(existujuce.filter((c) => c.ico).map((c) => [lenCislice(c.ico), c]));
  const podlaMena = new Map(existujuce.filter((c) => !c.ico).map((c) => [menoKluc(c.name), c]));

  const vysledok = { created: 0, updated: 0, unchanged: 0, errors: [] as any[] };
  const vysledky: { index: number; id: string | null; akcia: string }[] = [];
  for (const [i, surovy] of v.data.contacts.entries()) {
    const k = KontaktVstup.safeParse(surovy);
    if (!k.success) {
      vysledok.errors.push({ index: i, chyba: k.error.issues.map((x) => x.message).join("; ") });
      vysledky.push({ index: i, id: null, akcia: "error" });
      continue;
    }
    const c = k.data;
    const ico = lenCislice(c.ico);
    const uz =
      (c.external_id ? podlaExt.get(c.external_id) : undefined) ??
      (ico ? podlaIco.get(ico) : podlaMena.get(menoKluc(c.name)));
    const odberatel = c.customer ?? !c.supplier;
    const dodavatel = c.supplier ?? false;
    if (uz) {
      const zmena: Record<string, unknown> = {};
      for (const p of POLIA_KONTAKTU) {
        const nova = (c as any)[p];
        if (nova == null || nova === "") continue;
        if (v.data.update_existing ? uz[p] !== nova : !uz[p]) zmena[p] = nova;
      }
      if (odberatel && !uz.odberatel) zmena.odberatel = true;
      if (dodavatel && !uz.dodavatel) zmena.dodavatel = true;
      if (c.external_id && !uz.external_id) zmena.external_id = c.external_id;
      if (!Object.keys(zmena).length) {
        vysledok.unchanged++;
        vysledky.push({ index: i, id: uz.id, akcia: "unchanged" });
        continue;
      }
      const { error } = await db
        .from("customers")
        .update(zmena)
        .eq("id", uz.id)
        .eq("company_id", ctx.company_id);
      if (error) {
        vysledok.errors.push({ index: i, chyba: error.message });
        vysledky.push({ index: i, id: uz.id, akcia: "error" });
      } else {
        Object.assign(uz, zmena);
        vysledok.updated++;
        vysledky.push({ index: i, id: uz.id, akcia: "updated" });
      }
      continue;
    }
    const { data, error } = await db
      .from("customers")
      .insert({
        company_id: ctx.company_id,
        external_id: c.external_id ?? null,
        name: c.name,
        ico: ico || null,
        ...Object.fromEntries(
          POLIA_KONTAKTU.filter((p) => p !== "name").map((p) => [p, (c as any)[p] ?? null]),
        ),
        country: c.country?.toUpperCase() ?? "SK",
        typ: c.typ ?? "firma",
        odberatel,
        dodavatel,
      })
      .select("id, external_id, ico, name, odberatel, dodavatel")
      .single();
    if (error) {
      vysledok.errors.push({ index: i, chyba: error.message });
      vysledky.push({ index: i, id: null, akcia: "error" });
      continue;
    }
    // Ďalší riadok s tým istým IČO v tej istej dávke sa už spáruje.
    if (data.external_id) podlaExt.set(data.external_id, data);
    if (ico) podlaIco.set(ico, data);
    else podlaMena.set(menoKluc(c.name), data);
    vysledok.created++;
    vysledky.push({ index: i, id: data.id, akcia: "created" });
  }
  return ok({ ...vysledok, results: vysledky });
}

/* ---------------- produkty (cenník) ---------------- */

const ProduktVstup = z.object({
  external_id: z.string().max(120).nullish(),
  name: z.string().trim().min(1).max(255),
  code: z.string().max(60).nullish(),
  description: z.string().max(4000).nullish(),
  unit: z.string().max(20).default("ks"),
  /** Cena bez DPH. */
  unit_price: z.number().default(0),
  vat_rate: z.number().min(0).max(100).default(23),
  active: z.boolean().default(true),
  colny_kod: z
    .string()
    .regex(/^\d{6,10}$/)
    .nullish(),
  krajina_povodu: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullish(),
  hmotnost_kg: z.number().nonnegative().nullish(),
});
const STL_PRODUKTU =
  "id, external_id, name, code, description, unit, unit_price, vat_rate, active, colny_kod, krajina_povodu, hmotnost_kg, created_at, updated_at";

export async function zoznamProduktov(ctx: ApiCtx): Promise<Odpoved> {
  const p = new URL(ctx.request.url).searchParams;
  const limit = Math.min(Math.max(parseInt(p.get("limit") ?? "100", 10) || 100, 1), 500);
  const offset = Math.max(parseInt(p.get("offset") ?? "0", 10) || 0, 0);
  let q = (ctx.supabase as any)
    .from("products")
    .select(STL_PRODUKTU)
    .eq("company_id", ctx.company_id)
    .is("deleted_at", null);
  if (p.get("active") === "true") q = q.eq("active", true);
  const hladaj = p.get("q");
  if (hladaj)
    q = q.or(
      `name.ilike.%${hladaj.replace(/[%,()]/g, "")}%,code.ilike.%${hladaj.replace(/[%,()]/g, "")}%`,
    );
  const { data, error } = await q
    .order("name")
    .order("id")
    .range(offset, offset + limit);
  if (error) return chybaDb(error);
  const riadky = (data ?? []) as any[];
  return ok({
    data: riadky.slice(0, limit),
    has_more: riadky.length > limit,
    next_offset: riadky.length > limit ? offset + limit : null,
  });
}

export async function zalozProdukt(ctx: ApiCtx): Promise<Odpoved> {
  const v = ProduktVstup.safeParse(ctx.requestBody);
  if (!v.success) return err("validation_error", "Neplatný produkt.", 400, v.error.flatten());
  const db = ctx.supabase as any;
  if (v.data.external_id) {
    const { data: uz } = await db
      // aj-zmazane: idempotencia podľa external_id — jedinečný index platí aj pre zmazané
      .from("products")
      .select(STL_PRODUKTU)
      .eq("company_id", ctx.company_id)
      .eq("external_id", v.data.external_id)
      .maybeSingle();
    if (uz) return ok({ objekt: "product", ...uz, existoval: true }, 200);
  }
  const { data, error } = await db
    .from("products")
    .insert({ ...v.data, company_id: ctx.company_id })
    .select(STL_PRODUKTU)
    .single();
  if (error) return chybaDb(error);
  return ok({ objekt: "product", ...data }, 201);
}

export async function detailProduktu(ctx: ApiCtx, id: string): Promise<Odpoved> {
  if (!jeUuid(id)) return err("not_found", "Produkt sa nenašiel.", 404);
  const { data, error } = await (ctx.supabase as any)
    .from("products")
    .select(STL_PRODUKTU)
    .eq("company_id", ctx.company_id)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return chybaDb(error);
  if (!data) return err("not_found", "Produkt sa nenašiel.", 404);
  return ok({ objekt: "product", ...data });
}

export async function upravProdukt(ctx: ApiCtx, id: string): Promise<Odpoved> {
  if (!jeUuid(id)) return err("not_found", "Produkt sa nenašiel.", 404);
  const v = ProduktVstup.omit({ external_id: true }).partial().strict().safeParse(ctx.requestBody);
  if (!v.success) return err("validation_error", "Neplatné údaje.", 400, v.error.flatten());
  const { data, error } = await (ctx.supabase as any)
    .from("products")
    .update(v.data)
    .eq("company_id", ctx.company_id)
    .eq("id", id)
    .is("deleted_at", null)
    .select(STL_PRODUKTU)
    .maybeSingle();
  if (error) return chybaDb(error);
  if (!data) return err("not_found", "Produkt sa nenašiel.", 404);
  return ok({ objekt: "product", ...data });
}

/* ---------------- bankové účty a pohyby ---------------- */

const UcetVstup = z.object({
  iban: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, "").toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/, "Neplatný IBAN")),
  name: z.string().max(120).nullish(),
  currency: z.string().length(3).default("EUR"),
  /** Zostatok k dátumu `balance_date` (napr. počiatočný stav pri prenose). */
  balance: z.number().nullish(),
});

/**
 * Bankový účet bez priameho napojenia na banku — pohyby doň posiela API
 * (prenos z iného programu, banka, ku ktorej sa Faktero nepripojí). Napojenie
 * je len obal typu `import`, ako pri nahratom výpise; nočná synchronizácia ho obchádza.
 */
export async function zalozBankovyUcet(ctx: ApiCtx): Promise<Odpoved> {
  const v = UcetVstup.safeParse(ctx.requestBody);
  if (!v.success) return err("validation_error", "Neplatný účet.", 400, v.error.flatten());
  const db = ctx.supabase as any;
  const { data: uz } = await db
    .from("bank_accounts")
    .select("id")
    .eq("company_id", ctx.company_id)
    .eq("iban", v.data.iban)
    .limit(1)
    .maybeSingle();
  if (uz) return err("duplicate", "Účet s týmto IBAN už vo firme je.", 409, { id: uz.id });
  const { data: spojenie, error: e1 } = await db
    .from("bank_connections")
    .insert({
      company_id: ctx.company_id,
      provider: "import",
      status: "connected",
      metadata: { zdroj: "api" },
    })
    .select("id")
    .single();
  if (e1) return chybaDb(e1);
  const { data, error } = await db
    .from("bank_accounts")
    .insert({
      company_id: ctx.company_id,
      bank_connection_id: spojenie.id,
      iban: v.data.iban,
      account_name: v.data.name ?? v.data.iban,
      currency: v.data.currency.toUpperCase(),
      balance: v.data.balance ?? 0,
      booked_balance: v.data.balance ?? null,
      last_synced_at: v.data.balance != null ? new Date().toISOString() : null,
    })
    .select("id, iban, account_name, currency, balance")
    .single();
  if (error) {
    await db.from("bank_connections").delete().eq("id", spojenie.id);
    return chybaDb(error);
  }
  return ok({ objekt: "bank_account", ...data, source: "api" }, 201);
}

const Pohyb = z.object({
  booking_date: DATUM,
  /** Kladná = príjem, záporná = výdaj. */
  amount: z.number().refine((n) => n !== 0, "Suma nesmie byť 0"),
  currency: z.string().length(3).nullish(),
  variable_symbol: z.string().max(20).nullish(),
  counterparty: z.string().max(255).nullish(),
  counterparty_iban: z.string().max(42).nullish(),
  description: z.string().max(1000).nullish(),
  /** Jedinečná referencia pohybu (z banky/programu) — podľa nej sa nič nezdvojí. */
  reference: z.string().max(200).nullish(),
});
const DavkaPohybov = z.object({
  transactions: z.array(Pohyb).min(1).max(2000),
  /** Zostatok účtu po týchto pohyboch (nepovinné). */
  balance: z.number().nullish(),
});

/** Referencia, keď ju zdroj nemá: z dátumu, sumy, VS a protistrany — opakovaný prenos nič nezdvojí. */
async function odvodReferenciu(p: z.infer<typeof Pohyb>, i: number) {
  const zdroj = [
    p.booking_date,
    p.amount.toFixed(2),
    p.variable_symbol ?? "",
    p.counterparty ?? "",
    p.counterparty_iban ?? "",
    p.description ?? "",
    i,
  ].join("|");
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(zdroj));
  return `api-${Array.from(new Uint8Array(h).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

export async function prenesPohyby(ctx: ApiCtx, ucetId: string): Promise<Odpoved> {
  if (!jeUuid(ucetId)) return err("not_found", "Účet sa nenašiel.", 404);
  const v = DavkaPohybov.safeParse(ctx.requestBody);
  if (!v.success)
    return err(
      "validation_error",
      "Pošlite { transactions: [...] } (1 až 2000 pohybov).",
      400,
      v.error.flatten(),
    );
  const db = ctx.supabase as any;
  const { data: ucet } = await db
    .from("bank_accounts")
    .select("id, currency, bank_connections(provider)")
    .eq("company_id", ctx.company_id)
    .eq("id", ucetId)
    .maybeSingle();
  if (!ucet) return err("not_found", "Účet sa nenašiel.", 404);
  // Účet napojený na banku vedie banka — pohyby z API by sa zdvojili s jej pohybmi.
  if (ucet.bank_connections?.provider !== "import")
    return err(
      "bank_synced",
      "Tento účet sa sťahuje priamo z banky; pohyby cez API sa dajú posielať len na účet založený cez API alebo z nahratého výpisu.",
      409,
    );
  // Rovnaké pohyby v jednej dávke (rovnaký deň, suma, VS…) sa rozlíšia poradím.
  const videne = new Map<string, number>();
  const riadky = [];
  for (const p of v.data.transactions) {
    const zaklad = [
      p.booking_date,
      p.amount,
      p.variable_symbol,
      p.counterparty,
      p.description,
    ].join("|");
    const n = videne.get(zaklad) ?? 0;
    videne.set(zaklad, n + 1);
    riadky.push({
      company_id: ctx.company_id,
      bank_account_id: ucet.id,
      booking_date: p.booking_date,
      amount: p.amount,
      currency: (p.currency ?? ucet.currency ?? "EUR").toUpperCase(),
      variable_symbol: p.variable_symbol ?? null,
      counterparty:
        [p.counterparty, p.counterparty_iban].filter(Boolean).join(" · ").slice(0, 255) || null,
      // Vlastný stĺpec kvôli pravidlám „Spárované bez dokladu“ podľa IBAN-u protistrany.
      counterparty_iban: p.counterparty_iban
        ? p.counterparty_iban.replace(/\s+/g, "").toUpperCase()
        : null,
      description: p.description ?? null,
      transaction_reference: p.reference ?? (await odvodReferenciu(p, n)),
    });
  }
  const { vlozPohyby } = await import("./bank-sync.server");
  const vlozenych = await vlozPohyby(db, riadky);
  if (v.data.balance != null) {
    await db
      .from("bank_accounts")
      .update({
        balance: v.data.balance,
        booked_balance: v.data.balance,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", ucet.id)
      .eq("company_id", ctx.company_id);
  }
  return ok({ inserted: vlozenych, skipped: riadky.length - vlozenych });
}

/* ---------------- firmy a pozvánky ---------------- */

const FirmaVstup = z.object({
  name: z.string().trim().min(1).max(255),
  ico: z.string().max(20).nullish(),
  dic: z.string().max(20).nullish(),
  ic_dph: z.string().max(20).nullish(),
  street: z.string().max(255).nullish(),
  city: z.string().max(120).nullish(),
  zip: z.string().max(20).nullish(),
  country: z.enum(["SK", "CZ", "DE"]).default("SK"),
  email: z.string().email().max(255).nullish(),
  phone: z.string().max(40).nullish(),
  website: z.string().max(255).nullish(),
  iban: z.string().max(42).nullish(),
  swift: z.string().max(11).nullish(),
  vat_payer: z.boolean().optional(),
  default_currency: z.string().length(3).optional(),
});
const STL_FIRMY =
  "id, name, ico, dic, ic_dph, street, city, zip, country, email, phone, website, iban, swift, vat_payer, default_currency, created_at";

type Kluc = { id: string; company_id: string; ucet_user_id: string | null; firmy: string[] | null };

async function klucPoziadavky(ctx: ApiCtx): Promise<Kluc | null> {
  const { data } = await (ctx.supabase as any)
    .from("api_keys")
    .select("id, company_id, ucet_user_id, firmy")
    .eq("id", ctx.api_key_id)
    .maybeSingle();
  return (data as Kluc) ?? null;
}

/** Smie kľúč k firme (a pri kľúči účtu je jeho majiteľ vlastník/admin)? */
async function smieKFirme(ctx: ApiCtx, k: Kluc, companyId: string) {
  if (!k.ucet_user_id) return k.company_id === companyId;
  const { firmyKluca } = await import("./api-auth.server");
  const firmy = await firmyKluca(k as any);
  return firmy.some((f) => f.id === companyId);
}

/**
 * Nová firma pod účtom majiteľa kľúča. Len kľúč účtu (kľúč pre viac firiem) —
 * firemný kľúč patrí jednej firme a ďalšie zakladať nemá.
 */
export async function zalozFirmu(ctx: ApiCtx): Promise<Odpoved> {
  const k = await klucPoziadavky(ctx);
  if (!k?.ucet_user_id)
    return err(
      "account_key_required",
      "Firmu založí len kľúč pre viac firiem (API kľúče → Kľúč pre viac firiem).",
      403,
    );
  const v = FirmaVstup.safeParse(ctx.requestBody);
  if (!v.success) return err("validation_error", "Neplatná firma.", 400, v.error.flatten());
  const db = ctx.supabase as any;
  const ico = lenCislice(v.data.ico);
  if (ico) {
    const { data: clen } = await db
      .from("company_users")
      .select("company_id, companies!inner(id, ico)")
      .eq("user_id", k.ucet_user_id)
      .eq("companies.ico", ico)
      .limit(1);
    if (clen?.length)
      return err("duplicate", "Firmu s týmto IČO už máte.", 409, { id: clen[0].company_id });
  }
  const { data: f, error } = await db
    .from("companies")
    .insert({ ...v.data, ico: ico || null, created_by: k.ucet_user_id })
    .select(STL_FIRMY)
    .single();
  if (error) return chybaDb(error);
  const { error: e2 } = await db
    .from("company_users")
    .insert({ company_id: f.id, user_id: k.ucet_user_id, role: "owner" });
  if (e2) {
    await db.from("companies").delete().eq("id", f.id);
    return chybaDb(e2);
  }
  // Kľúč pre vybrané firmy dostane aj novú — inak by k nej hneď po založení nesmel.
  if (Array.isArray(k.firmy))
    await db
      .from("api_keys")
      .update({ firmy: [...k.firmy, f.id] })
      .eq("id", k.id);
  return ok({ objekt: "company", ...f }, 201);
}

export async function detailFirmy(ctx: ApiCtx, id: string): Promise<Odpoved> {
  const k = await klucPoziadavky(ctx);
  if (!jeUuid(id) || !k || !(await smieKFirme(ctx, k, id)))
    return err("not_found", "Firma sa nenašla.", 404);
  const { data, error } = await (ctx.supabase as any)
    .from("companies")
    .select(STL_FIRMY)
    .eq("id", id)
    .maybeSingle();
  if (error) return chybaDb(error);
  if (!data) return err("not_found", "Firma sa nenašla.", 404);
  return ok({ objekt: "company", ...data });
}

export async function upravFirmu(ctx: ApiCtx, id: string): Promise<Odpoved> {
  const k = await klucPoziadavky(ctx);
  if (!jeUuid(id) || !k || !(await smieKFirme(ctx, k, id)))
    return err("not_found", "Firma sa nenašla.", 404);
  const v = FirmaVstup.partial().strict().safeParse(ctx.requestBody);
  if (!v.success) return err("validation_error", "Neplatné údaje.", 400, v.error.flatten());
  const zmena: Record<string, unknown> = { ...v.data };
  if (v.data.ico !== undefined) zmena.ico = lenCislice(v.data.ico) || null;
  if (!Object.keys(zmena).length) return err("validation_error", "Nič na zmenu.");
  const { data, error } = await (ctx.supabase as any)
    .from("companies")
    .update(zmena)
    .eq("id", id)
    .select(STL_FIRMY)
    .maybeSingle();
  if (error) return chybaDb(error);
  return ok({ objekt: "company", ...data });
}

/** Členovia firmy — e-mail a rola (kľúč účtu aj kľúč firmy). */
export async function clenoviaFirmy(ctx: ApiCtx, id: string): Promise<Odpoved> {
  const k = await klucPoziadavky(ctx);
  if (!jeUuid(id) || !k || !(await smieKFirme(ctx, k, id)))
    return err("not_found", "Firma sa nenašla.", 404);
  const db = ctx.supabase as any;
  const { data, error } = await db
    .from("company_users")
    .select("user_id, role, created_at")
    .eq("company_id", id);
  if (error) return chybaDb(error);
  const clenovia = [];
  for (const c of (data ?? []) as any[]) {
    const { data: u } = await ctx.supabase.auth.admin.getUserById(c.user_id);
    clenovia.push({ email: u?.user?.email ?? null, role: c.role, since: c.created_at });
  }
  const { data: poz } = await db
    .from("company_invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("company_id", id)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString());
  return ok({ data: clenovia, pending_invitations: poz ?? [] });
}

const PozvankaVstup = z.object({
  email: z.string().trim().email().max(255),
  role: z.enum(["admin", "accountant", "employee"]),
});

/**
 * Pozvánka do firmy — rovnaká ako z aplikácie (e-mail s odkazom, 14 dní).
 * Len kľúč účtu, ktorého majiteľ je vo firme vlastník alebo admin: firemný
 * kľúč môže mať aj externý integrátor a ten si používateľov pridávať nemá.
 */
export async function pozviDoFirmy(ctx: ApiCtx, id: string): Promise<Odpoved> {
  const k = await klucPoziadavky(ctx);
  if (!k?.ucet_user_id)
    return err("account_key_required", "Pozývať smie len kľúč pre viac firiem.", 403);
  if (!jeUuid(id) || !(await smieKFirme(ctx, k, id)))
    return err("not_found", "Firma sa nenašla.", 404);
  const v = PozvankaVstup.safeParse(ctx.requestBody);
  if (!v.success) return err("validation_error", "Neplatná pozvánka.", 400, v.error.flatten());
  const { vytvorPozvanku } = await import("./invitations.server");
  try {
    const r = await vytvorPozvanku(ctx.supabase, {
      companyId: id,
      email: v.data.email,
      role: v.data.role,
      permissions: {},
      invitedBy: k.ucet_user_id,
    });
    return ok(
      {
        objekt: "invitation",
        id: r.id,
        email: v.data.email.toLowerCase(),
        role: v.data.role,
        email_sent: r.emailOdoslany,
        email_error: r.chybaEmailu,
        accept_url: r.odkaz,
      },
      201,
    );
  } catch (e: any) {
    return err("invitation_failed", e?.message ?? "Pozvánku sa nepodarilo vytvoriť.", 400);
  }
}
