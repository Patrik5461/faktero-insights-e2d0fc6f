import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Podklady } from "./ceny";

/**
 * Cenník — cenové skupiny, dohodnuté ceny a cenové akcie.
 *
 * Všetko ide cez klienta viazaného na prihláseného používateľa, takže členstvo
 * vo firme vynúti RLS. Že cena neukazuje na produkt ani odberateľa z cudzej
 * firmy, stráži trigger `guard_price_row_company` — kontrola v aplikácii by sa
 * dala obísť priamym volaním PostgREST.
 */

const CompanyScoped = z.object({ company_id: z.string().uuid() });

const prazdneNaNull = (v: unknown) => (v === "" || v === undefined ? null : v);

/* ---------- cenové skupiny ---------- */

export const listPriceGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("price_groups")
      .select("*")
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .order("name");
    if (error) throw new Error(error.message);

    const skupiny = rows ?? [];
    if (!skupiny.length) return [];

    // Koľko odberateľov a koľko dohodnutých cien skupina má — bez toho sa
    // nedá povedať, či sa dá bezpečne zmazať.
    const ids = skupiny.map((s) => s.id);
    const [{ data: odberatelia }, { data: ceny }] = await Promise.all([
      context.supabase
        .from("customers")
        .select("price_group_id")
        .eq("company_id", data.company_id)
        .is("deleted_at", null)
        .in("price_group_id", ids),
      context.supabase
        .from("product_prices")
        .select("price_group_id")
        .eq("company_id", data.company_id)
        .in("price_group_id", ids),
    ]);

    const spocitaj = (rows: any[] | null, kluc: string) => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) m.set(r[kluc], (m.get(r[kluc]) ?? 0) + 1);
      return m;
    };
    const poctyOdberatelov = spocitaj(odberatelia, "price_group_id");
    const poctyCien = spocitaj(ceny, "price_group_id");

    return skupiny.map((s) => ({
      ...s,
      pocet_odberatelov: poctyOdberatelov.get(s.id) ?? 0,
      pocet_cien: poctyCien.get(s.id) ?? 0,
    }));
  });

export const savePriceGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1, "Zadajte názov cenovej skupiny."),
      discount_percent: z.coerce.number().min(0).max(100).default(0),
      note: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const zapis = {
      company_id: data.company_id,
      name: data.name,
      discount_percent: data.discount_percent,
      note: data.note ?? null,
    };
    const q = data.id
      ? context.supabase
          .from("price_groups")
          .update(zapis)
          .eq("id", data.id)
          .eq("company_id", data.company_id)
          .select("id")
          .single()
      : context.supabase.from("price_groups").insert(zapis).select("id").single();
    const { data: row, error } = await q;
    if (error) {
      if (error.code === "23505") throw new Error("Cenová skupina s týmto názvom už existuje.");
      throw new Error(error.message);
    }
    return { id: row.id };
  });

export const deletePriceGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Skupinu netreba mazať natvrdo — odberatelia by prišli o väzbu ticho.
    // `deleted_at` ju schová a ceny aj priradenia ostanú v histórii.
    const { error } = await context.supabase
      .from("price_groups")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    // Odberateľov treba odviazať, inak by ďalej dedili zľavu zo schovanej skupiny.
    await context.supabase
      .from("customers")
      .update({ price_group_id: null })
      .eq("company_id", data.company_id)
      .eq("price_group_id", data.id);
    return { ok: true };
  });

/* ---------- dohodnuté ceny ---------- */

export const listProductPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      product_id: z.string().uuid().optional(),
      customer_id: z.string().uuid().optional(),
      price_group_id: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("product_prices")
      .select(
        "*, products(name, unit, unit_price), customers(name), price_groups(name, discount_percent)",
      )
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.product_id) q = q.eq("product_id", data.product_id);
    if (data.customer_id) q = q.eq("customer_id", data.customer_id);
    if (data.price_group_id) q = q.eq("price_group_id", data.price_group_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveProductPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      id: z.string().uuid().optional(),
      product_id: z.string().uuid({ message: "Vyberte produkt." }),
      customer_id: z.preprocess(prazdneNaNull, z.string().uuid().nullable().optional()),
      price_group_id: z.preprocess(prazdneNaNull, z.string().uuid().nullable().optional()),
      unit_price: z.coerce.number().min(0),
      min_quantity: z.coerce.number().min(0).default(0),
      note: z.string().nullable().optional(),
    })
      .refine((v) => !!v.customer_id !== !!v.price_group_id, {
        message: "Cena musí patriť buď odberateľovi, alebo cenovej skupine — nie obom naraz.",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const zapis = {
      company_id: data.company_id,
      product_id: data.product_id,
      customer_id: data.customer_id ?? null,
      price_group_id: data.price_group_id ?? null,
      unit_price: data.unit_price,
      min_quantity: data.min_quantity,
      note: data.note ?? null,
    };
    const q = data.id
      ? context.supabase
          .from("product_prices")
          .update(zapis)
          .eq("id", data.id)
          .eq("company_id", data.company_id)
          .select("id")
          .single()
      : context.supabase.from("product_prices").insert(zapis).select("id").single();
    const { data: row, error } = await q;
    if (error) {
      if (error.code === "23505")
        throw new Error("Pre tento produkt a toto množstvo už dohodnutá cena existuje.");
      throw new Error(error.message);
    }
    return { id: row.id };
  });

export const deleteProductPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("product_prices")
      .delete()
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- cenové akcie ---------- */

export const listPriceActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("price_actions")
      .select("*, price_action_products(id, product_id, unit_price, products(name, unit_price))")
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .order("valid_from", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const savePriceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1, "Zadajte názov akcie."),
      valid_from: z.string().min(1, "Zadajte začiatok akcie."),
      valid_to: z.preprocess(prazdneNaNull, z.string().nullable().optional()),
      discount_percent: z.coerce.number().min(0).max(100).default(0),
      applies_to_all: z.boolean().default(false),
      active: z.boolean().default(true),
      note: z.string().nullable().optional(),
      produkty: z
        .array(
          z.object({
            product_id: z.string().uuid(),
            unit_price: z.preprocess(prazdneNaNull, z.coerce.number().min(0).nullable().optional()),
          }),
        )
        .default([]),
    })
      .refine((v) => !v.valid_to || v.valid_to >= v.valid_from, {
        message: "Koniec akcie nemôže byť skôr ako jej začiatok.",
      })
      .refine((v) => v.applies_to_all || v.produkty.length > 0, {
        message: "Vyberte produkty, na ktoré akcia platí — alebo ju nastavte na celý sortiment.",
      })
      .refine((v) => v.discount_percent > 0 || v.produkty.some((p) => p.unit_price != null), {
        message: "Akcia bez zľavy aj bez akciovej ceny by cenu nezmenila.",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const zapis = {
      company_id: data.company_id,
      name: data.name,
      valid_from: data.valid_from,
      valid_to: data.valid_to ?? null,
      discount_percent: data.discount_percent,
      applies_to_all: data.applies_to_all,
      active: data.active,
      note: data.note ?? null,
    };
    const q = data.id
      ? context.supabase
          .from("price_actions")
          .update(zapis)
          .eq("id", data.id)
          .eq("company_id", data.company_id)
          .select("id")
          .single()
      : context.supabase.from("price_actions").insert(zapis).select("id").single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);

    // Zoznam produktov sa prepisuje celý — je krátky a párovanie zmien podľa
    // id by prinieslo viac stavov než úžitku.
    await context.supabase
      .from("price_action_products")
      .delete()
      .eq("price_action_id", row.id)
      .eq("company_id", data.company_id);

    if (data.produkty.length) {
      const { error: e2 } = await context.supabase.from("price_action_products").insert(
        data.produkty.map((p) => ({
          company_id: data.company_id,
          price_action_id: row.id,
          product_id: p.product_id,
          unit_price: p.unit_price ?? null,
        })),
      );
      if (e2) throw new Error(e2.message);
    }
    return { id: row.id };
  });

export const deletePriceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CompanyScoped.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("price_actions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- výpočet cien pre doklad ---------- */

/**
 * Podklady na výpočet cien pre jeden doklad — dohodnuté ceny odberateľa a jeho
 * skupiny plus akcie platné k dátumu dokladu. Formulár si ich vypýta raz a
 * cenu každého riadku počíta sám cez `cenaZPodkladov`.
 *
 * Prečo sa cena neposiela už spočítaná: množstevná cena závisí od množstva na
 * riadku, ktoré server v tej chvíli nepozná. Spočítaná „pre jeden kus" by
 * veľkoodberateľovi nikdy nezabrala.
 */
export const getPriceContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    CompanyScoped.extend({
      customer_id: z.preprocess(prazdneNaNull, z.string().uuid().nullable().optional()),
      datum: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<Podklady & { maCennik: boolean }> => {
    const datum = data.datum;

    let odberatel: any = null;
    if (data.customer_id) {
      const { data: c } = await context.supabase
        .from("customers")
        .select("id, discount_percent, price_group_id, price_groups(discount_percent)")
        .eq("id", data.customer_id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      odberatel = c;
    }

    // Dohodnuté ceny sa sťahujú len tie, ktoré sa tohto odberateľa môžu týkať.
    let ceny: any[] = [];
    if (odberatel) {
      const filtre = [`customer_id.eq.${odberatel.id}`];
      if (odberatel.price_group_id) filtre.push(`price_group_id.eq.${odberatel.price_group_id}`);
      const { data: rows } = await context.supabase
        .from("product_prices")
        .select("product_id, customer_id, price_group_id, unit_price, min_quantity")
        .eq("company_id", data.company_id)
        .or(filtre.join(","))
        .limit(5000);
      ceny = rows ?? [];
    }

    // `valid_to.is.null` musí byť v tom istom `or` ako horná hranica, inak by
    // akcia bez konca vypadla — otvorené obdobie je bežný prípad.
    const { data: akcieRows } = await context.supabase
      .from("price_actions")
      .select(
        "id, name, valid_from, valid_to, discount_percent, applies_to_all, active, price_action_products(product_id, unit_price)",
      )
      .eq("company_id", data.company_id)
      .is("deleted_at", null)
      .eq("active", true)
      .lte("valid_from", datum)
      .or(`valid_to.is.null,valid_to.gte.${datum}`)
      .limit(500);

    const akcie = (akcieRows ?? []).map((a: any) => ({
      id: a.id,
      name: a.name,
      valid_from: a.valid_from,
      valid_to: a.valid_to,
      discount_percent: a.discount_percent,
      active: a.active,
      applies_to_all: a.applies_to_all,
      produkty: (a.price_action_products ?? []).map((p: any) => ({
        product_id: p.product_id,
        unit_price: p.unit_price,
      })),
    }));

    return {
      customer_id: odberatel?.id ?? null,
      price_group_id: odberatel?.price_group_id ?? null,
      zlavaOdberatela: odberatel?.discount_percent ?? null,
      zlavaSkupiny: odberatel?.price_groups?.discount_percent ?? null,
      datum,
      ceny,
      akcie,
      // Aby formulár vedel, či má vôbec ukazovať stĺpec s dôvodom ceny.
      maCennik:
        ceny.length > 0 ||
        akcie.length > 0 ||
        Number(odberatel?.discount_percent ?? 0) > 0 ||
        Number(odberatel?.price_groups?.discount_percent ?? 0) > 0,
    };
  });
