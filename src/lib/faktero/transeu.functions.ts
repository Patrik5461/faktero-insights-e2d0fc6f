import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHost, setCookie } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Trans.eu pre dopravcov — volania z nastavenia (Nastavenia → Trans.eu).
  Tokeny a kľúče číta a zapisuje len server (transeu.server.ts); prehliadač
  vidí len stav napojenia a stiahnuté objednávky.
*/

async function overClena(
  context: any,
  companyId: string,
  len: "spravca" | "clen" = "clen",
  zapis = false,
) {
  const { data } = await context.supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (!data) throw new Error("K tejto firme nemáte prístup.");
  if (len === "spravca" && !["owner", "admin"].includes(data.role))
    throw new Error("Napojenie môže nastaviť len majiteľ alebo admin firmy.");
  // Admin klient RLS obchádza — oblasť faktúr (vlastná rola) treba overiť tu.
  const { data: firmy } = await context.supabase.rpc("firmy_s_pravom", {
    _oblast: "faktury",
    _zapis: zapis,
  });
  if (!((firmy ?? []) as string[]).includes(companyId))
    throw new Error("Na faktúry nemáte v tejto firme oprávnenie.");
}

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const Firma = z.object({ company_id: z.string().uuid() });

export const stavTranseuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id);
    const { maAplikaciuFaktera, navratovaAdresa } = await import("./transeu.server");
    const a = await admin();
    const { data: n } = await a
      .from("transeu_napojenia")
      .select(
        "client_id, stav, firma_nazov, firma_vat_id, auto_sync, auto_od, posledna_sync_at, posledna_chyba, token_plati_do, refresh_token_sifrovany",
      )
      .eq("company_id", data.company_id)
      .maybeSingle();
    return {
      aplikaciaFaktera: maAplikaciuFaktera(),
      navratovaAdresa: navratovaAdresa(),
      napojenie: n
        ? {
            vlastnaAplikacia: Boolean(n.client_id),
            client_id: n.client_id,
            stav: n.stav as "caka" | "pripojene" | "chyba",
            prihlaseny: Boolean(n.refresh_token_sifrovany),
            firma_nazov: n.firma_nazov,
            firma_vat_id: n.firma_vat_id,
            auto_sync: n.auto_sync,
            auto_od: n.auto_od,
            posledna_sync_at: n.posledna_sync_at,
            posledna_chyba: n.posledna_chyba,
          }
        : null,
    };
  });

/** Vlastná aplikácia dopravcu v Trans.eu (Client ID, Client Secret, Api-key). */
export const ulozAplikaciuTranseuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    Firma.extend({
      client_id: z.string().trim().min(3).max(200),
      client_secret: z.string().trim().min(8).max(500),
      api_kluc: z.string().trim().min(8).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "spravca", true);
    const { encryptSecret } = await import("./payment-crypto.server");
    const a = await admin();
    const { error } = await a.from("transeu_napojenia").upsert({
      company_id: data.company_id,
      client_id: data.client_id,
      client_secret_sifrovany: encryptSecret(data.client_secret),
      api_kluc_sifrovany: encryptSecret(data.api_kluc),
      // Nová aplikácia = staré tokeny neplatia, prihlásiť treba znova.
      access_token_sifrovany: null,
      refresh_token_sifrovany: null,
      token_plati_do: null,
      stav: "caka",
      posledna_chyba: null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Začne prihlásenie: vráti adresu Trans.eu, kam prehliadač presmeruje. */
export const zacniPrihlasenieTranseuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "spravca", true);
    const a = await admin();
    const { data: n } = await a
      .from("transeu_napojenia")
      .select("company_id")
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!n) {
      const { error } = await a.from("transeu_napojenia").insert({
        company_id: data.company_id,
        stav: "caka",
        updated_by: context.userId,
      });
      if (error) throw new Error(error.message);
    }
    const { autorizacnaAdresa, COOKIE_TRANSEU, COOKIE_TRANSEU_NAVRAT, domenaCookie } =
      await import("./transeu.server");
    const { url, nonce } = await autorizacnaAdresa(data.company_id, context.userId);
    const host = getRequestHost();
    const volby = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/api/public/transeu",
      maxAge: 600,
      domain: domenaCookie(host),
    };
    // Callback prijme state len spolu s touto cookie — prihlásenie musí dokončiť ten istý prehliadač.
    setCookie(COOKIE_TRANSEU, nonce, volby);
    // Odkiaľ človek začal (faktero.sk / www) — callback ho vráti tam, kde je prihlásený.
    setCookie(
      COOKIE_TRANSEU_NAVRAT,
      String(host ?? "")
        .toLowerCase()
        .replace(/:\d+$/, ""),
      volby,
    );
    return { url };
  });

export const odpojTranseuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "spravca", true);
    const a = await admin();
    // Stiahnuté objednávky aj doklady z nich ostávajú; zahodia sa len prihlasovacie údaje.
    await a.from("transeu_napojenia").delete().eq("company_id", data.company_id);
    return { ok: true };
  });

export const nastavAutoSyncTranseuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.extend({ zapnut: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "spravca", true);
    const a = await admin();
    const { data: n } = await a
      .from("transeu_napojenia")
      .select("auto_sync, auto_od")
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!n) throw new Error("Trans.eu nie je pripojený.");
    const { error } = await a
      .from("transeu_napojenia")
      .update({
        auto_sync: data.zapnut,
        auto_od: data.zapnut && !n.auto_sync ? new Date().toISOString() : n.auto_od,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Stiahne prijaté objednávky za posledné dni. */
export const stiahniTranseuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    Firma.extend({ dni: z.number().int().min(1).max(365).default(60) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "clen", true);
    const { stiahniObjednavky } = await import("./transeu.server");
    const od = new Date(Date.now() - data.dni * 86_400_000).toISOString();
    return stiahniObjednavky(data.company_id, od);
  });

/** Stiahnuté objednávky s číslom prijatej objednávky a faktúry. */
export const objednavkyTranseuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id);
    const { data: rows, error } = await context.supabase
      .from("transeu_objednavky")
      .select(
        "id, transeu_id, cislo, referencia, stav, zakaznik_nazov, zakaznik_vat_id, nakladka, nakladka_od, vykladka, vykladka_do, vzdialenost_km, cena, mena, typ_ceny, ma_fakturu_v_transeu, faktura_odoslana_at, chyba, sales_order_id, invoice_id, sales_orders(order_number, deleted_at), invoices(invoice_number, status, deleted_at)",
      )
      .eq("company_id", data.company_id)
      .order("nakladka_od", { ascending: false, nullsFirst: false })
      .limit(300);
    if (error) throw new Error(error.message);
    /*
      Faktúra vystavená cez formulár z prijatej objednávky nemá väzbu na riadok
      Trans.eu — nájde sa cez objednávku (posledná nezmazaná).
    */
    const bezFaktury = (rows ?? [])
      .filter((r: any) => !r.invoice_id && r.sales_order_id)
      .map((r: any) => r.sales_order_id as string);
    const zObjednavky = new Map<string, any>();
    if (bezFaktury.length) {
      const { data: f } = await context.supabase
        .from("invoices")
        .select("id, invoice_number, status, sales_order_id, created_at")
        .eq("company_id", data.company_id)
        .in("sales_order_id", bezFaktury)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      for (const x of f ?? []) zObjednavky.set(x.sales_order_id as string, x);
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      objednavka:
        r.sales_orders && !r.sales_orders.deleted_at
          ? { id: r.sales_order_id as string, cislo: r.sales_orders.order_number as string }
          : null,
      faktura:
        r.invoices && !r.invoices.deleted_at
          ? {
              id: r.invoice_id as string,
              cislo: r.invoices.invoice_number as string,
              stav: r.invoices.status as string,
            }
          : zObjednavky.has(r.sales_order_id)
            ? {
                id: zObjednavky.get(r.sales_order_id).id as string,
                cislo: zObjednavky.get(r.sales_order_id).invoice_number as string,
                stav: zObjednavky.get(r.sales_order_id).status as string,
              }
            : null,
      sales_orders: undefined,
      invoices: undefined,
    }));
  });

const Akcia = Firma.extend({ id: z.string().uuid() });

async function zapisChybu(companyId: string, id: string, e: any) {
  const a = await admin();
  // Admin klient obchádza RLS — bez firmy by šlo zapísať chybu k cudzej objednávke.
  await a
    .from("transeu_objednavky")
    .update({ chyba: String(e?.message ?? e).slice(0, 300) })
    .eq("id", id)
    .eq("company_id", companyId);
}

export const zalozObjednavkuTranseuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Akcia.parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "clen", true);
    const { zalozObjednavku } = await import("./transeu.server");
    try {
      return await zalozObjednavku(context.supabase, data.company_id, context.userId, data.id);
    } catch (e) {
      await zapisChybu(data.company_id, data.id, e);
      throw e;
    }
  });

export const vystavFakturuTranseuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Akcia.parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "clen", true);
    const { vystavFakturu } = await import("./transeu.server");
    try {
      return await vystavFakturu(context.supabase, data.company_id, context.userId, data.id);
    } catch (e) {
      await zapisChybu(data.company_id, data.id, e);
      throw e;
    }
  });

export const odosliFakturuTranseuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Akcia.parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "clen", true);
    const { odosliFakturu } = await import("./transeu.server");
    try {
      return await odosliFakturu(context.supabase, data.company_id, data.id);
    } catch (e) {
      await zapisChybu(data.company_id, data.id, e);
      throw e;
    }
  });
