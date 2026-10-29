/*
  Verejné API — čo pribudlo v aplikácii 28. 10. 2026:
  - úhrady prijatých faktúr (aj čiastočné, `purchase_invoice_payments`),
  - vlastné stavy dokladov, štítky, komentár a účtovná poznámka,
  - vystavená faktúra: dodací list, pečiatka, účtovné kódy,
  - číselník predkontácií a predlohy zaúčtovania (len čítanie),
  - vybavenie bankových pohybov bez dokladu (transakčná daň, „nemá doklad“).

  Ako `api-zapis.server.ts`: routes sú tenké obaly, MCP volá to isté REST.
  Všetko cez `ctx.supabase` (servisný klient) a vždy s filtrom firmy. Servisný
  kľúč spúšťače zámku odovzdaných dokladov púšťajú, preto zámok stráži API
  samo (`zamknuteZmeny`).
*/
import { z } from "zod";
import type { ApiCtx } from "./api-auth.server";
import { err, ok } from "./api-auth.server";
import {
  SPRAVA_ZAMKU,
  STAVY_POHYBU,
  UhradaVstup,
  VybavenieVstup,
  ZnackyVstup,
  dovodZamkuApi,
  jeSparovany,
  normalizujStitky,
  sposobUhradyPrijatej,
  stitkyPoZmene,
  suhrnUhrad,
  textyZnaciek,
  uhradaVystup,
  zamknuteZmeny,
  type TabulkaDokladu,
  type ZnackyVstupT,
} from "./api-evidencia";
import { normalizePaymentMethod } from "./payment-method";
import { zalohaPrijatej } from "./uhrady-prijatej";

type Odpoved = { status: number; body: any };
const jeUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** Chyba z databázy do zrozumiteľnej odpovede (zámok obdobia, odovzdaný doklad…). */
export function chybaDb(
  e: { message?: string; code?: string } | null,
  sprava = "Zápis sa nepodaril.",
) {
  const m = e?.message ?? sprava;
  if (e?.code === "23505") return err("conflict", `Záznam už existuje: ${m}`, 409);
  if (/zamknut|locked|odovzdan|uzamk/i.test(m)) return err("locked", m, 409);
  if (/FAKTERO_PLAN_BLOCK/.test(m))
    return err("plan_limit", "Predplatné firmy zápis nedovoľuje.", 402);
  return err("db_error", m, 500);
}

/* ---------------- stav, štítky, komentár, účtovná poznámka ---------------- */

/**
 * Značky zo vstupu do stĺpcov dokladu (`stav_id`, `stitky`, `komentar`,
 * `int_poznamka`). Stav podľa názvu sa hľadá v číselníku firmy, cudzí stav
 * neprejde. Nový štítok sa zapíše aj do číselníka štítkov firmy — ako v aplikácii.
 */
export async function riadokZnaciek(
  ctx: ApiCtx,
  v: ZnackyVstupT,
  povodneStitky: string[] | null = null,
): Promise<{ ok: true; riadok: Record<string, unknown> } | { ok: false; odpoved: Odpoved }> {
  const db = ctx.supabase as any;
  const riadok: Record<string, unknown> = { ...textyZnaciek(v) };

  if (v.stav_id !== undefined || v.stav !== undefined) {
    if (v.stav_id === null || v.stav === null || (v.stav !== undefined && !v.stav)) {
      riadok.stav_id = null;
    } else {
      let q = db
        .from("stavy_dokladov")
        .select("id, nazov")
        .eq("company_id", ctx.company_id)
        .limit(1);
      q = v.stav_id
        ? q.eq("id", v.stav_id)
        : q.ilike(
            "nazov",
            String(v.stav).replace(/[%_\\]/g, (m) => `\\${m}`),
          );
      const { data: s, error } = await q.maybeSingle();
      if (error) return { ok: false, odpoved: chybaDb(error) };
      if (!s) {
        const { data: vsetky } = await db
          .from("stavy_dokladov")
          .select("id, nazov")
          .eq("company_id", ctx.company_id)
          .eq("aktivne", true)
          .order("poradie");
        return {
          ok: false,
          odpoved: err(
            "unknown_state",
            "Taký stav dokladu firma nemá — zoznam je v GET /api/v1/document-states.",
            400,
            { states: vsetky ?? [] },
          ),
        };
      }
      riadok.stav_id = s.id;
    }
  }

  let nove: string[] | null = null;
  if (v.stitky !== undefined) {
    const n = normalizujStitky(v.stitky);
    if (!n.ok) return { ok: false, odpoved: err("validation_error", n.sprava) };
    nove = n.stitky;
  }
  if (v.stitky_pridat !== undefined || v.stitky_odobrat !== undefined) {
    const n = stitkyPoZmene(nove ?? povodneStitky, v.stitky_pridat, v.stitky_odobrat);
    if (!n.ok) return { ok: false, odpoved: err("validation_error", n.sprava) };
    nove = n.stitky;
  }
  if (nove) {
    riadok.stitky = nove;
    const pred = new Set((povodneStitky ?? []).map((s) => s.toLowerCase()));
    const pridane = nove.filter((s) => !pred.has(s.toLowerCase()));
    if (pridane.length)
      await db.from("stitky_firmy").upsert(
        pridane.map((nazov) => ({ company_id: ctx.company_id, nazov })),
        { onConflict: "company_id,nazov", ignoreDuplicates: true },
      );
  }
  return { ok: true, riadok };
}

/**
 * Zámok odovzdaného / zamknutého dokladu pre úpravu cez API. Vráti chybu 409,
 * keď by zmena siahla na účtovný údaj; pracovné značky a úhrada prejdú.
 */
export function strazZamku(
  tab: TabulkaDokladu,
  stary: Record<string, unknown>,
  zmena: Record<string, unknown>,
): Odpoved | null {
  const dovod = dovodZamkuApi(tab, stary as any);
  if (!dovod) return null;
  const stlpce = zamknuteZmeny(tab, stary, zmena);
  if (!stlpce.length) return null;
  return err("locked", SPRAVA_ZAMKU[dovod], 409, { reason: dovod, fields: stlpce });
}

export async function zoznamStavov(ctx: ApiCtx): Promise<Odpoved> {
  const { data, error } = await (ctx.supabase as any)
    .from("stavy_dokladov")
    .select("id, nazov, farba, poradie, aktivne")
    .eq("company_id", ctx.company_id)
    .order("poradie")
    .order("nazov");
  if (error) return chybaDb(error);
  return ok({ data: (data ?? []).map((r: any) => ({ objekt: "document_state", ...r })) });
}

export async function zoznamStitkov(ctx: ApiCtx): Promise<Odpoved> {
  const { data, error } = await (ctx.supabase as any)
    .from("stitky_firmy")
    .select("id, nazov, farba")
    .eq("company_id", ctx.company_id)
    .order("nazov");
  if (error) return chybaDb(error);
  return ok({ data: (data ?? []).map((r: any) => ({ objekt: "tag", ...r })) });
}

/* ---------------- číselník predkontácií a predlohy ---------------- */

const DRUHY_CISELNIKA = ["predkontacia", "clenenie_dph", "stredisko", "cinnost", "ciselny_rad"];

/**
 * Číselník predkontácií a členení (aj strediská, činnosti, rady Pohody).
 * `document_type` / `payment_type` vrátia kódy pre ten typ dokladu či platby
 * a tie, ktoré typ neurčujú. Stránkovanie `limit` + `offset` (najviac 1000).
 */
export async function zoznamPredkontacii(ctx: ApiCtx): Promise<Odpoved> {
  const p = new URL(ctx.request.url).searchParams;
  const limit = Math.min(Math.max(parseInt(p.get("limit") ?? "500", 10) || 500, 1), 1000);
  const offset = Math.max(parseInt(p.get("offset") ?? "0", 10) || 0, 0);
  let q = (ctx.supabase as any)
    .from("predkontacie")
    .select(
      "id, druh, kod, popis, agenda, ucet_md, ucet_d, typ_dokladu, typ_platby, druhy_dokladov, kategoria, aktivne, zdroj, updated_at",
    )
    .eq("company_id", ctx.company_id);
  const druh = p.get("kind");
  if (druh) {
    if (!DRUHY_CISELNIKA.includes(druh))
      return err("validation_error", `kind musí byť jeden z: ${DRUHY_CISELNIKA.join(", ")}.`);
    q = q.eq("druh", druh);
  }
  const typ = p.get("document_type");
  if (typ) {
    if (!["faktura", "blocek"].includes(typ))
      return err("validation_error", "document_type musí byť faktura alebo blocek.");
    q = q.or(`typ_dokladu.is.null,typ_dokladu.eq.${typ}`);
  }
  const platba = p.get("payment_type");
  if (platba) {
    if (!["hotovost", "karta", "prevod"].includes(platba))
      return err("validation_error", "payment_type musí byť hotovost, karta alebo prevod.");
    q = q.or(`typ_platby.is.null,typ_platby.eq.${platba}`);
  }
  if (p.get("active") !== "all") q = q.eq("aktivne", p.get("active") !== "false");
  const { data, error } = await q
    .order("druh")
    .order("kod")
    .order("id")
    .range(offset, offset + limit);
  if (error) return chybaDb(error);
  const riadky = (data ?? []) as any[];
  const dalsie = riadky.length > limit;
  return ok({
    data: riadky.slice(0, limit).map((r) => ({ objekt: "accounting_code", ...r })),
    has_more: dalsie,
    next_offset: dalsie ? offset + limit : null,
  });
}

/** Predlohy zaúčtovania — pomenované šablóny (predkontácia, členenie, KV, pokladňa, rad, poznámka). */
export async function zoznamPredloh(ctx: ApiCtx): Promise<Odpoved> {
  const p = new URL(ctx.request.url).searchParams;
  let q = (ctx.supabase as any)
    .from("predlohy_uctovania")
    .select(
      "id, nazov, druh, predkontacia, clenenie_dph, kv_clenenie, pokladna, rad, poznamka, poradie, updated_at",
    )
    .eq("company_id", ctx.company_id);
  const druh = p.get("document_kind");
  if (druh) {
    if (!["blocek", "prijata", "vystavena"].includes(druh))
      return err("validation_error", "document_kind musí byť blocek, prijata alebo vystavena.");
    q = q.or(`druh.is.null,druh.eq.${druh}`);
  }
  const { data, error } = await q.order("poradie").order("nazov").limit(1000);
  if (error) return chybaDb(error);
  return ok({ data: (data ?? []).map((r: any) => ({ objekt: "accounting_template", ...r })) });
}

/* ---------------- úhrady prijatých faktúr ---------------- */

const STL_UHRADY =
  "id, external_id, amount, currency, paid_at, method, zdroj, bank_transaction_id, note, created_at";

async function prijataNaUhrady(ctx: ApiCtx, id: string) {
  const { data } = await (ctx.supabase as any)
    .from("purchase_invoices")
    .select("id, status, amount_total, currency, payment_method, advance_invoice_id, advance_amount")
    .eq("company_id", ctx.company_id)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data as Record<string, any> | null;
}

/** Úhrady faktúry so súhrnom (koľko zostáva, stav uhradená / čiastočne / neuhradená). */
async function uhradySoSuhrnom(ctx: ApiCtx, f: Record<string, any>) {
  const db = ctx.supabase as any;
  const [{ data: uhrady, error }, zaloha] = await Promise.all([
    db
      .from("purchase_invoice_payments")
      .select(STL_UHRADY)
      .eq("company_id", ctx.company_id)
      .eq("purchase_invoice_id", f.id)
      .order("paid_at")
      .order("created_at")
      .limit(1000),
    f.advance_invoice_id
      ? db
          .from("purchase_invoices")
          .select("amount_total, status")
          .eq("company_id", ctx.company_id)
          .eq("id", f.advance_invoice_id)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (error) throw new Error(error.message);
  const z = zaloha?.data;
  const zalohaSuma = zalohaPrijatej(
    (f as any).advance_amount,
    z?.status === "paid" ? Number(z.amount_total ?? 0) : 0,
  );
  return {
    purchase_invoice_id: f.id,
    ...suhrnUhrad(f, uhrady ?? [], zalohaSuma),
    data: (uhrady ?? []).map(uhradaVystup),
  };
}

export async function uhradyPrijatej(ctx: ApiCtx, id: string): Promise<Odpoved> {
  if (!jeUuid(id)) return err("not_found", "Prijatá faktúra sa nenašla.", 404);
  const f = await prijataNaUhrady(ctx, id);
  if (!f) return err("not_found", "Prijatá faktúra sa nenašla.", 404);
  try {
    return ok(await uhradySoSuhrnom(ctx, f));
  } catch (e: any) {
    return err("db_error", e?.message ?? "Úhrady sa nepodarilo načítať.", 500);
  }
}

/**
 * Pridá úhradu (aj čiastočnú). Stav „uhradená“ a dátum úhrady prepočíta
 * spúšťač zo súčtu úhrad. Úhrada nie je zamknutá odovzdaním ani uzávierkou.
 */
export async function pridajUhradu(ctx: ApiCtx, id: string): Promise<Odpoved> {
  if (!jeUuid(id)) return err("not_found", "Prijatá faktúra sa nenašla.", 404);
  const v = UhradaVstup.safeParse(ctx.requestBody);
  if (!v.success) return err("validation_error", "Neplatná úhrada.", 400, v.error.flatten());
  const d = v.data;
  const db = ctx.supabase as any;
  const f = await prijataNaUhrady(ctx, id);
  if (!f) return err("not_found", "Prijatá faktúra sa nenašla.", 404);
  if (d.external_id) {
    const { data: uz } = await db
      .from("purchase_invoice_payments")
      .select(STL_UHRADY + ", purchase_invoice_id")
      .eq("company_id", ctx.company_id)
      .eq("external_id", d.external_id)
      .maybeSingle();
    if (uz) {
      if (uz.purchase_invoice_id !== id)
        return err("conflict", "Úhrada s týmto external_id patrí inej faktúre.", 409, {
          purchase_invoice_id: uz.purchase_invoice_id,
        });
      return ok({ ...uhradaVystup(uz), existovala: true }, 200);
    }
  }
  if (f.status === "cancelled")
    return err("invalid_state", "Stornovaná faktúra sa neuhrádza.", 409);
  if (f.status === "draft")
    return err("invalid_state", "Koncept faktúry sa neuhrádza — najprv ho dokončite.", 409);
  const metoda = sposobUhradyPrijatej(d.method) ?? sposobUhradyPrijatej(f.payment_method);
  const { data, error } = await db
    .from("purchase_invoice_payments")
    .insert({
      company_id: ctx.company_id,
      purchase_invoice_id: id,
      amount: Math.round(d.amount * 100) / 100,
      currency: f.currency ?? "EUR",
      paid_at: d.paid_at ?? new Date().toISOString().slice(0, 10),
      method: metoda,
      zdroj: "rucne",
      note: d.note?.trim() || null,
      external_id: d.external_id ?? null,
    })
    .select(STL_UHRADY)
    .single();
  if (error) return chybaDb(error);
  const suhrn = await uhradySoSuhrnom(ctx, f).catch(() => null);
  const { data: _uhrady, ...bezZoznamu } = suhrn ?? ({} as any);
  return ok({ ...uhradaVystup(data), invoice: suhrn ? bezZoznamu : null }, 201);
}

/** Zmaže ručne pridanú úhradu. Úhradu z banky zruší len zrušenie spárovania pohybu. */
export async function zmazUhradu(ctx: ApiCtx, id: string, uhradaId: string): Promise<Odpoved> {
  if (!jeUuid(id) || !jeUuid(uhradaId)) return err("not_found", "Úhrada sa nenašla.", 404);
  const db = ctx.supabase as any;
  const f = await prijataNaUhrady(ctx, id);
  if (!f) return err("not_found", "Prijatá faktúra sa nenašla.", 404);
  const { data: u } = await db
    .from("purchase_invoice_payments")
    .select("id, bank_transaction_id")
    .eq("company_id", ctx.company_id)
    .eq("purchase_invoice_id", id)
    .eq("id", uhradaId)
    .maybeSingle();
  if (!u) return err("not_found", "Úhrada sa nenašla.", 404);
  if (u.bank_transaction_id)
    return err(
      "bank_payment",
      "Úhrada prišla zo spárovaného bankového pohybu — zruší ju len zrušenie spárovania v aplikácii.",
      409,
      { bank_transaction_id: u.bank_transaction_id },
    );
  const { error } = await db
    .from("purchase_invoice_payments")
    .delete()
    .eq("company_id", ctx.company_id)
    .eq("id", uhradaId);
  if (error) return chybaDb(error);
  const suhrn = await uhradySoSuhrnom(ctx, f).catch(() => null);
  const { data: _uhrady, ...bezZoznamu } = suhrn ?? ({} as any);
  return ok({ deleted: true, id: uhradaId, invoice: suhrn ? bezZoznamu : null });
}

/* ---------------- vystavená faktúra: úprava ---------------- */

const ZauctovanieFaktury = z
  .object({
    predkontacia: z.string().max(60).nullish(),
    clenenie_dph: z.string().max(30).nullish(),
    kv_clenenie: z.string().max(10).nullish(),
    stredisko: z.string().max(60).nullish(),
    cinnost: z.string().max(60).nullish(),
    /** true = faktúra je zaúčtovaná (autopilot ju nemení). */
    booked: z.boolean().optional(),
  })
  .strict();

/** Polia faktúry, ktoré pribudli 28. 10. 2026 — pri vystavení aj úprave. */
export const DoplnkyFaktury = ZnackyVstup.extend({
  /** Faktúra slúži zároveň ako dodací list (iný nadpis a podpisy v PDF). */
  dodaci_list: z.boolean().optional(),
  /** Pečiatka a podpis v PDF; null = podľa nastavenia firmy. */
  zobrazit_peciatku: z.boolean().nullish(),
  accounting: ZauctovanieFaktury.optional(),
});
export type DoplnkyFakturyT = z.infer<typeof DoplnkyFaktury>;

/** Doplnky do riadku `invoices` (bez značiek — tie rieši `riadokZnaciek`). */
export function riadokDoplnkovFaktury(d: DoplnkyFakturyT, teraz: string) {
  const r: Record<string, unknown> = {};
  if (d.dodaci_list !== undefined) r.dodaci_list = d.dodaci_list;
  if (d.zobrazit_peciatku !== undefined) r.zobrazit_peciatku = d.zobrazit_peciatku;
  const a = d.accounting;
  if (a) {
    if (a.predkontacia !== undefined) r.pohoda_predkontacia = a.predkontacia?.trim() || null;
    if (a.clenenie_dph !== undefined) r.pohoda_clenenie_dph = a.clenenie_dph?.trim() || null;
    if (a.kv_clenenie !== undefined) r.kv_clenenie = a.kv_clenenie?.trim() || null;
    if (a.stredisko !== undefined) r.stredisko = a.stredisko?.trim() || null;
    if (a.cinnost !== undefined) r.cinnost = a.cinnost?.trim() || null;
    if (a.booked === true) {
      r.zauctovane_at = teraz;
      r.zauctovanie_zdroj = "manual";
    }
    if (a.booked === false) r.zauctovane_at = null;
  }
  return r;
}

/** Doplnky novej faktúry (POST /invoices) — do insertu vo `vytvorFakturu`. */
export async function doplnkyNovejFaktury(
  ctx: ApiCtx,
  telo: unknown,
): Promise<{ ok: true; riadok: Record<string, unknown> } | { ok: false; odpoved: Odpoved }> {
  const v = DoplnkyFaktury.safeParse(telo ?? {});
  if (!v.success)
    return {
      ok: false,
      odpoved: err("validation_error", "Neplatné dáta faktúry.", 400, v.error.flatten()),
    };
  const z = await riadokZnaciek(ctx, v.data, []);
  if (!z.ok) return z;
  return {
    ok: true,
    riadok: { ...riadokDoplnkovFaktury(v.data, new Date().toISOString()), ...z.riadok },
  };
}

const UpravaFaktury = DoplnkyFaktury.extend({
  notes: z.string().max(5000).nullable().optional(),
  due_date: z.string().optional(),
  variable_symbol: z.string().max(40).nullable().optional(),
  payment_method: z.string().max(40).optional(),
}).strict();

/** PUT /invoices/{id} — poznámka, splatnosť, VS, úhrada, doplnky a značky; so zámkom odovzdania. */
export async function upravFakturu(ctx: ApiCtx, id: string): Promise<Odpoved> {
  if (!jeUuid(id)) return err("not_found", "Faktúra nenájdená.", 404);
  const v = UpravaFaktury.safeParse(ctx.requestBody);
  if (!v.success) return err("validation_error", "Neplatné dáta.", 400, v.error.flatten());
  const { notes, due_date, variable_symbol, payment_method, ...doplnky } = v.data;
  const db = ctx.supabase as any;
  const { data: stary, error: e1 } = await db
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("company_id", ctx.company_id)
    .maybeSingle();
  if (e1) return chybaDb(e1);
  if (!stary) return err("not_found", "Faktúra nenájdená.", 404);
  const patch: Record<string, unknown> = {
    ...riadokDoplnkovFaktury(doplnky, new Date().toISOString()),
  };
  if (notes !== undefined) patch.notes = notes;
  if (due_date !== undefined) patch.due_date = due_date;
  if (variable_symbol !== undefined) patch.variable_symbol = variable_symbol;
  if (payment_method !== undefined) patch.payment_method = normalizePaymentMethod(payment_method);
  const zn = await riadokZnaciek(ctx, doplnky, stary.stitky ?? []);
  if (!zn.ok) return zn.odpoved;
  Object.assign(patch, zn.riadok);
  if (!Object.keys(patch).length) return err("validation_error", "Nič na zmenu.");
  const zamok = strazZamku("invoices", stary, patch);
  if (zamok) return zamok;
  const { data, error } = await db
    .from("invoices")
    .update(patch)
    .eq("id", id)
    .eq("company_id", ctx.company_id)
    .select()
    .maybeSingle();
  if (error) return chybaDb(error);
  if (!data) return err("not_found", "Faktúra nenájdená.", 404);
  return ok(data);
}

/* ---------------- bankové pohyby: vybavenie bez dokladu ---------------- */

/**
 * Označí pohyb ako vybavený bez dokladu („Pohyb nemá doklad“, transakčná
 * daň) alebo označenie zruší (`resolution: null`). Spárovaný pohyb sa označiť
 * nedá — najprv treba zrušiť párovanie (ako v aplikácii).
 */
export async function vybavPohyb(ctx: ApiCtx, id: string): Promise<Odpoved> {
  if (!jeUuid(id)) return err("not_found", "Pohyb sa nenašiel.", 404);
  const v = VybavenieVstup.safeParse(ctx.requestBody);
  if (!v.success)
    return err(
      "validation_error",
      'Pošlite { resolution: "bez_dokladu" | "transakcna_dan" | null, note? }.',
      400,
      v.error.flatten(),
    );
  const db = ctx.supabase as any;
  const { data: p } = await db
    .from("bank_transactions")
    .select(
      "id, matched_invoice_id, matched_purchase_invoice_id, matched_expense_id, matched_installment_id",
    )
    .eq("company_id", ctx.company_id)
    .eq("id", id)
    .maybeSingle();
  if (!p) return err("not_found", "Pohyb sa nenašiel.", 404);
  if (v.data.resolution) {
    const { count } = await db
      .from("financing_charges")
      .select("id", { count: "exact", head: true })
      .eq("bank_transaction_id", p.id);
    if (jeSparovany(p, count ?? 0))
      return err(
        "already_matched",
        "Pohyb je spárovaný s dokladom — najprv zrušte párovanie.",
        409,
      );
  }
  const poznamka = v.data.note?.trim() || null;
  const zmena = v.data.resolution
    ? {
        vybavenie: v.data.resolution,
        vybavenie_poznamka: poznamka,
        vybavenie_pravidlo_id: null,
        vybavene_at: new Date().toISOString(),
        vybavil: null,
      }
    : {
        vybavenie: null,
        vybavenie_poznamka: null,
        vybavenie_pravidlo_id: null,
        vybavene_at: null,
        vybavil: null,
      };
  const { data, error } = await db
    .from("bank_transactions")
    .update(zmena)
    .eq("company_id", ctx.company_id)
    .eq("id", p.id)
    .select(
      "id, booking_date, amount, currency, counterparty, vybavenie, vybavenie_poznamka, vybavene_at",
    )
    .maybeSingle();
  if (error) return chybaDb(error);
  return ok({
    objekt: "bank_transaction",
    ...data,
    stav: data?.vybavenie ?? "nesparovany",
  });
}

export { STAVY_POHYBU };
