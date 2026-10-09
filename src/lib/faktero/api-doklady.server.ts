/*
  Verejné API pre prijaté doklady (ako Doklado Public API v2): účtovný program
  či kancelária si prijaté faktúry a bločky stiahne, doptáva sa na zmeny a
  odovzdané označí — rovnako ako to robí konektor Pohody.
*/
import type { ApiCtx } from "./api-auth.server";
import { err, ok } from "./api-auth.server";

export type DruhApi = "prijata" | "blocek";

const TAB = { prijata: "purchase_invoices", blocek: "expense_documents" } as const;
const BUCKET = { prijata: "purchase-invoices", blocek: "expense-receipts" } as const;

const STL_PRIJATEJ = [
  "id",
  "invoice_number",
  "type",
  "status",
  "supplier_name",
  "supplier_ico",
  "supplier_dic",
  "supplier_ic_dph",
  "supplier_iban",
  "supplier_street",
  "supplier_city",
  "supplier_zip",
  "supplier_country",
  "issue_date",
  "delivery_date",
  "due_date",
  "received_date",
  "currency",
  "exchange_rate",
  "amount_without_vat",
  "vat_amount",
  "amount_total",
  "variable_symbol",
  "constant_symbol",
  "specific_symbol",
  "payment_method",
  "category",
  "pohoda_predkontacia",
  "pohoda_clenenie_dph",
  "kv_clenenie",
  "odpocet",
  "rozuctovanie",
  "note",
  "opravuje_cislo",
  "order_number",
  "delivery_note_number",
  "zauctovane_at",
  "exported_at",
  "pohoda_cislo",
  "file_path",
  "created_at",
  "updated_at",
].join(", ");
const STL_BLOCKU = [
  "id",
  "document_number",
  "status",
  "supplier_name",
  "supplier_ico",
  "supplier_ic_dph",
  "issue_date",
  "currency",
  "total_amount",
  "vat_amount",
  "vat_breakdown",
  "payment_method",
  "category",
  "pohoda_predkontacia",
  "pohoda_clenenie_dph",
  "kv_clenenie",
  "odpocet",
  "rozuctovanie",
  "note",
  "exported_at",
  "pohoda_cislo",
  "file_path",
  "created_at",
  "updated_at",
].join(", ");

const datum = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** Riadok na odpoveď — cesta k súboru nie, len či súbor je. */
function vystup(r: Record<string, any>, druh: DruhApi) {
  const { file_path, ...zvysok } = r;
  return {
    objekt: druh === "prijata" ? "purchase_invoice" : "receipt",
    ...zvysok,
    ma_subor: Boolean(file_path),
  };
}

export async function zoznamDokladov(ctx: ApiCtx, druh: DruhApi) {
  const url = new URL(ctx.request.url);
  const p = url.searchParams;
  const limit = Math.min(Math.max(parseInt(p.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(p.get("offset") ?? "0", 10) || 0, 0);
  let q = (ctx.supabase as any)
    .from(TAB[druh])
    .select(druh === "prijata" ? STL_PRIJATEJ : STL_BLOCKU)
    .eq("company_id", ctx.company_id);
  if (druh === "prijata") q = q.is("deleted_at", null);
  const zmenene = p.get("updated_since");
  if (zmenene) {
    if (Number.isNaN(Date.parse(zmenene)))
      return err("validation_error", "updated_since musí byť dátum a čas (ISO 8601).");
    q = q.gte("updated_at", new Date(zmenene).toISOString());
  }
  const od = datum(p.get("issued_from"));
  const doDna = datum(p.get("issued_to"));
  if (od) q = q.gte("issue_date", od);
  if (doDna) q = q.lte("issue_date", doDna);
  const exportovane = p.get("exported");
  if (exportovane === "true") q = q.not("exported_at", "is", null);
  if (exportovane === "false") q = q.is("exported_at", null);
  if (druh === "prijata" && p.get("booked") === "true") q = q.not("zauctovane_at", "is", null);
  // Stabilné poradie — pri stránkovaní sa nič nevynechá ani nezopakuje.
  const { data, error } = await q
    .order("updated_at", { ascending: true })
    .order("id")
    .range(offset, offset + limit);
  if (error) return err("db_error", error.message, 500);
  const riadky = (data ?? []) as Record<string, any>[];
  const dalsie = riadky.length > limit;
  return ok({
    data: riadky.slice(0, limit).map((r) => vystup(r, druh)),
    has_more: dalsie,
    next_offset: dalsie ? offset + limit : null,
  });
}

export async function detailDokladu(ctx: ApiCtx, druh: DruhApi, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return err("not_found", "Doklad sa nenašiel.", 404);
  let q = (ctx.supabase as any)
    .from(TAB[druh])
    .select(druh === "prijata" ? STL_PRIJATEJ : STL_BLOCKU)
    .eq("company_id", ctx.company_id)
    .eq("id", id);
  if (druh === "prijata") q = q.is("deleted_at", null);
  const { data: r, error } = await q.maybeSingle();
  if (error) return err("db_error", error.message, 500);
  if (!r) return err("not_found", "Doklad sa nenašiel.", 404);
  let subor_url: string | null = null;
  if (r.file_path) {
    const { data: s } = await ctx.supabase.storage
      .from(BUCKET[druh])
      .createSignedUrl(r.file_path, 3600);
    subor_url = s?.signedUrl ?? null;
  }
  const polozky =
    druh === "prijata"
      ? ((
          await (ctx.supabase as any)
            .from("purchase_invoices")
            .select("items")
            .eq("id", id)
            .maybeSingle()
        ).data?.items ?? null)
      : null;
  return ok({
    ...vystup(r, druh),
    polozky,
    subor_url,
    subor_url_plati_do: subor_url ? new Date(Date.now() + 3600_000).toISOString() : null,
  });
}

/** Označí doklad ako odovzdaný do účtovníctva (alebo to vráti) — ako „setexported" v Doklado. */
export async function oznacOdovzdany(ctx: ApiCtx, druh: DruhApi, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return err("not_found", "Doklad sa nenašiel.", 404);
  const b = (ctx.requestBody ?? {}) as { exported?: unknown; accounting_number?: unknown };
  const odovzdany = b.exported !== false;
  const cislo =
    typeof b.accounting_number === "string"
      ? b.accounting_number.trim().slice(0, 40) || null
      : null;
  const zmena: Record<string, unknown> = odovzdany
    ? { exported_at: new Date().toISOString(), ...(cislo ? { pohoda_cislo: cislo } : {}) }
    : { exported_at: null };
  let q = (ctx.supabase as any)
    .from(TAB[druh])
    .update(zmena)
    .eq("company_id", ctx.company_id)
    .eq("id", id);
  if (druh === "prijata") q = q.is("deleted_at", null);
  const { data, error } = await q.select("id, exported_at, pohoda_cislo").maybeSingle();
  if (error) return err("db_error", error.message, 500);
  if (!data) return err("not_found", "Doklad sa nenašiel.", 404);
  return ok(data);
}

const MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/xml",
  "text/xml",
];

/** Nahratie dokladu do Nespracovaných — Faktero ho prečíta ako pri nahratí v aplikácii. */
export async function nahrajNespracovany(ctx: ApiCtx) {
  const b = (ctx.requestBody ?? {}) as {
    file_name?: unknown;
    content_type?: unknown;
    content_base64?: unknown;
    note?: unknown;
  };
  const nazov = typeof b.file_name === "string" ? b.file_name.trim().slice(0, 200) : "";
  const mime =
    typeof b.content_type === "string" ? b.content_type.split(";")[0]!.trim().toLowerCase() : "";
  if (!nazov) return err("validation_error", "Chýba file_name.");
  if (!MIME.includes(mime))
    return err("validation_error", `content_type musí byť jeden z: ${MIME.join(", ")}.`);
  if (typeof b.content_base64 !== "string" || !b.content_base64)
    return err("validation_error", "Chýba content_base64.");
  const bajty = Buffer.from(b.content_base64, "base64");
  if (!bajty.length) return err("validation_error", "content_base64 nie je platný base64.");
  // 14 MB: v base64 je to ~19 MB a nginx púšťa požiadavky do 20 MB.
  if (bajty.length > 14 * 1024 * 1024) return err("too_large", "Súbor je väčší ako 14 MB.", 413);
  const { zalozNespracovany, vytazNespracovany } = await import("./nespracovane.server");
  const n = await zalozNespracovany(ctx.supabase, {
    companyId: ctx.company_id,
    userId: null,
    zdroj: "api",
    bajty,
    nazov,
    mime,
    poznamka: typeof b.note === "string" ? b.note.slice(0, 500) : null,
  });
  // Čítanie trvá desiatky sekúnd — beží na pozadí, stav je v GET /unprocessed-documents.
  void vytazNespracovany(n.id);
  return ok({ objekt: "unprocessed_document", id: n.id, stav: "cita" }, 201);
}

export async function zoznamNespracovanych(ctx: ApiCtx) {
  const { data, error } = await (ctx.supabase as any)
    .from("nespracovane_doklady")
    .select("id, zdroj, stav, druh, file_name, udaje, chyba, created_at")
    .eq("company_id", ctx.company_id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return err("db_error", error.message, 500);
  return ok({ data: (data ?? []).map((r: any) => ({ objekt: "unprocessed_document", ...r })) });
}

export async function bankovePohyby(ctx: ApiCtx) {
  const p = new URL(ctx.request.url).searchParams;
  const limit = Math.min(Math.max(parseInt(p.get("limit") ?? "100", 10) || 100, 1), 500);
  const offset = Math.max(parseInt(p.get("offset") ?? "0", 10) || 0, 0);
  let q = (ctx.supabase as any)
    .from("bank_transactions")
    .select(
      "id, bank_account_id, booking_date, amount, currency, variable_symbol, counterparty, description, transaction_reference, matched_invoice_id, matched_purchase_invoice_id, matched_expense_id, created_at",
    )
    .eq("company_id", ctx.company_id);
  const od = datum(p.get("date_from"));
  const doDna = datum(p.get("date_to"));
  if (od) q = q.gte("booking_date", od);
  if (doDna) q = q.lte("booking_date", doDna);
  const ucet = p.get("bank_account_id");
  if (ucet && /^[0-9a-f-]{36}$/i.test(ucet)) q = q.eq("bank_account_id", ucet);
  const { data, error } = await q
    .order("booking_date", { ascending: false })
    .order("id")
    .range(offset, offset + limit);
  if (error) return err("db_error", error.message, 500);
  const riadky = data ?? [];
  const dalsie = riadky.length > limit;
  return ok({
    data: riadky.slice(0, limit),
    has_more: dalsie,
    next_offset: dalsie ? offset + limit : null,
  });
}
