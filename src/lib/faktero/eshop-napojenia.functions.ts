import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Napojenie na Shoptet (objednávky → faktúry) a Zásielkovňu (zásielka z faktúry).
  Tokeny sú pre prehliadač zavreté: číta a zapisuje ich len server.
*/

async function overClena(
  context: any,
  companyId: string,
  len: "spravca" | "clen" = "clen",
  oblast?: { nazov: "faktury"; zapis: boolean },
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
  /*
    Vlastná rola (custom) má práva po oblastiach. Objednávky a zásielky čítame
    cez admin klienta (token je pre prehliadač zavretý), takže oblasť treba
    overiť tu — RLS by ju pri admin klientovi nestrážila.
  */
  if (oblast) {
    const { data: firmy } = await context.supabase.rpc("firmy_s_pravom", {
      _oblast: oblast.nazov,
      _zapis: oblast.zapis,
    });
    if (!((firmy ?? []) as string[]).includes(companyId))
      throw new Error("Na faktúry nemáte v tejto firme oprávnenie.");
  }
}

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

/* ------------------------------ Shoptet ------------------------------ */

export const stavNapojeniFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id);
    const a = await admin();
    const [{ data: s }, { data: z2 }] = await Promise.all([
      a
        .from("shoptet_napojenia")
        .select(
          "eshop_nazov, eshop_url, posledny_import_at, posledna_chyba, auto_import, auto_stavy, auto_od, stavy",
        )
        .eq("company_id", data.company_id)
        .maybeSingle(),
      a
        .from("zasielkovna_napojenia")
        .select("odosielatel, api_kluc, posledna_chyba")
        .eq("company_id", data.company_id)
        .maybeSingle(),
    ]);
    return {
      shoptet: s ?? null,
      zasielkovna: z2
        ? { odosielatel: z2.odosielatel, apiKluc: z2.api_kluc, posledna_chyba: z2.posledna_chyba }
        : null,
    };
  });

export const pripojShoptetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), token: z.string().trim().min(20).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "spravca");
    const { shoptetApi } = await import("./shoptet.server");
    // Overenie tokenu: údaje e-shopu a prístup k objednávkam.
    const eshop = await shoptetApi<any>(data.token, "/api/eshop?include=orderStatuses");
    await shoptetApi<any>(data.token, "/api/orders?itemsPerPage=1");
    const { encryptSecret } = await import("./payment-crypto.server");
    const nazov = eshop?.contactInformation?.eshopName ?? null;
    const url = eshop?.contactInformation?.url ?? null;
    const a = await admin();
    const { error } = await a.from("shoptet_napojenia").upsert({
      company_id: data.company_id,
      token_sifrovany: encryptSecret(data.token),
      eshop_nazov: nazov,
      eshop_url: url,
      stavy: (eshop?.orderStatuses?.statuses ?? []).map((x: any) => ({ id: x.id, name: x.name })),
      posledna_chyba: null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { nazov, url };
  });

export const odpojNapojenieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), co: z.enum(["shoptet", "zasielkovna"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "spravca");
    const a = await admin();
    await a
      .from(data.co === "shoptet" ? "shoptet_napojenia" : "zasielkovna_napojenia")
      .delete()
      .eq("company_id", data.company_id);
    return { ok: true };
  });

/** Objednávky z obchodu za posledné dni, s príznakom, či už majú faktúru. */
export const objednavkyShoptetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ company_id: z.string().uuid(), dni: z.number().int().min(1).max(180).default(30) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "clen", { nazov: "faktury", zapis: false });
    const { shoptetApi, tokenShoptetu } = await import("./shoptet.server");
    const t = await tokenShoptetu(data.company_id);
    if (!t) throw new Error("Shoptet nie je pripojený.");
    const od = new Date(Date.now() - data.dni * 86400000).toISOString().slice(0, 19) + "+0000";
    const objednavky: any[] = [];
    for (let strana = 1; strana <= 10; strana++) {
      const d = await shoptetApi<any>(
        t.token,
        `/api/orders?creationTimeFrom=${encodeURIComponent(od)}&itemsPerPage=50&page=${strana}`,
      );
      objednavky.push(...(d?.orders ?? []));
      if (!d?.paginator || strana >= d.paginator.pageCount) break;
    }
    const kody = objednavky.map((o) => `shoptet:${o.code}`);
    const { data: faktury } = kody.length
      ? await context.supabase
          .from("invoices")
          .select("id, invoice_number, external_id")
          .eq("company_id", data.company_id)
          .in("external_id", kody)
      : { data: [] };
    const fakt = new Map((faktury ?? []).map((f: any) => [f.external_id, f]));
    return objednavky.map((o) => ({
      kod: String(o.code),
      vytvorena: o.creationTime ?? null,
      zakaznik: o.company || o.fullName || o.email || null,
      stav: o.status?.name ?? null,
      platba: o.paymentMethod?.name ?? null,
      zaplatena: o.paid === true,
      suma: Number(o.price?.withVat ?? 0),
      mena: o.price?.currencyCode ?? "EUR",
      faktura: (fakt.get(`shoptet:${o.code}`) as any) ?? null,
    }));
  });

/** Z vybraných objednávok vystaví faktúry (rovnako ako faktúra z API). */
export const fakturujShoptetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        kody: z.array(z.string().min(1).max(60)).min(1).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "clen", { nazov: "faktury", zapis: true });
    const { shoptetApi, tokenShoptetu } = await import("./shoptet.server");
    const { fakturaZObjednavky } = await import("./shoptet");
    const { vytvorFakturu } = await import("./vytvor-fakturu.server");
    const t = await tokenShoptetu(data.company_id);
    if (!t) throw new Error("Shoptet nie je pripojený.");
    const vysledky: {
      kod: string;
      ok: boolean;
      faktura?: string;
      nova?: boolean;
      chyba?: string;
    }[] = [];
    for (const kod of data.kody) {
      try {
        const o = await shoptetApi<any>(t.token, `/api/orders/${encodeURIComponent(kod)}`);
        const vstup = fakturaZObjednavky(o.order);
        if (!vstup.items.length) throw new Error("objednávka nemá žiadnu položku s cenou");
        // Číta a zapisuje klient prihláseného — RLS stráži firmu.
        const v = await vytvorFakturu(context.supabase, data.company_id, vstup);
        if (!v.ok) throw new Error(v.sprava);
        if (v.nova && o.order?.paid === true)
          await context.supabase
            .from("invoices")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", v.faktura.id);
        vysledky.push({ kod, ok: true, faktura: v.faktura.invoice_number, nova: v.nova });
      } catch (e: any) {
        vysledky.push({ kod, ok: false, chyba: String(e?.message ?? e).slice(0, 200) });
      }
    }
    const a = await admin();
    await a
      .from("shoptet_napojenia")
      .update({
        posledny_import_at: new Date().toISOString(),
        posledna_chyba: vysledky.find((v) => !v.ok)?.chyba ?? null,
      })
      .eq("company_id", data.company_id);
    return vysledky;
  });

/* ---------------------------- Zásielkovňa ---------------------------- */

export const pripojZasielkovnuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        heslo: z
          .string()
          .trim()
          .regex(/^[0-9a-f]{32}$/i, "API heslo Zásielkovne má 32 znakov (0–9, a–f)."),
        odosielatel: z.string().trim().max(60).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "spravca");
    const { overHeslo } = await import("./zasielkovna.server");
    await overHeslo(data.heslo);
    const { encryptSecret } = await import("./payment-crypto.server");
    const a = await admin();
    const { error } = await a.from("zasielkovna_napojenia").upsert({
      company_id: data.company_id,
      heslo_sifrovane: encryptSecret(data.heslo.toLowerCase()),
      api_kluc: data.heslo.slice(0, 16).toLowerCase(),
      odosielatel: data.odosielatel || null,
      posledna_chyba: null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Zásielka z faktúry — výdajné miesto alebo doručenie na adresu (id dopravcu). */
export const vytvorZasielkuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        invoice_id: z.string().uuid(),
        miesto_id: z.number().int().positive(),
        na_adresu: z.boolean().default(false),
        hmotnost: z.number().positive().max(100),
        dobierka: z.boolean(),
        telefon: z.string().trim().max(30).optional().default(""),
        email: z.string().trim().max(120).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "clen", { nazov: "faktury", zapis: true });
    const { hesloZasielkovne, volajZasielkovnu } = await import("./zasielkovna.server");
    const { rozdelMeno, xmlVytvorZasielku, vysledokPola } = await import("./zasielkovna");
    const n = await hesloZasielkovne(data.company_id);
    if (!n)
      throw new Error(
        "Zásielkovňa nie je pripojená — nastavte ju v Nastavenia → E-shop a doprava.",
      );
    const { data: f } = await context.supabase
      .from("invoices")
      .select(
        "id, invoice_number, variable_symbol, total, currency, customer_name, customer_email, customer_street, customer_city, customer_zip, zasielkovna_id",
      )
      .eq("id", data.invoice_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!f) throw new Error("Faktúra sa nenašla.");
    if (f.zasielkovna_id)
      throw new Error(`Zásielka k tejto faktúre už existuje (${f.zasielkovna_id}).`);
    const { data: firma } = await context.supabase
      .from("companies")
      .select("name")
      .eq("id", data.company_id)
      .maybeSingle();
    const { meno, priezvisko } = rozdelMeno(f.customer_name ?? "");
    const ulica = String(f.customer_street ?? "");
    const m = /^(.*?)[\s,]+(\d+[\w/-]*)$/.exec(ulica.trim());
    const suma = Math.abs(Number(f.total ?? 0));
    const o = await volajZasielkovnu(
      xmlVytvorZasielku(n.heslo, {
        cislo: String(f.variable_symbol || f.invoice_number),
        meno,
        priezvisko,
        email: data.email || f.customer_email,
        telefon: data.telefon || null,
        miestoId: data.miesto_id,
        dobierka: data.dobierka ? suma : null,
        mena: f.currency ?? "EUR",
        hodnota: suma,
        hmotnost: data.hmotnost,
        odosielatel: n.odosielatel || firma?.name || "Faktero",
        ...(data.na_adresu
          ? {
              ulica: m ? m[1] : ulica,
              cisloDomu: m ? m[2] : null,
              mesto: f.customer_city,
              psc: f.customer_zip,
            }
          : {}),
      }),
    );
    if (!o.ok) throw new Error(o.chyba);
    const id = vysledokPola(o.vysledok, "id");
    const cislo = vysledokPola(o.vysledok, "barcodeText") || vysledokPola(o.vysledok, "barcode");
    await context.supabase
      .from("invoices")
      .update({
        zasielkovna_id: id,
        zasielkovna_cislo: cislo,
        zasielkovna_stav: "Podaná",
        zasielkovna_stav_at: new Date().toISOString(),
      })
      .eq("id", f.id);
    return { id, cislo };
  });

export const stitokZasielkyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), invoice_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "clen", { nazov: "faktury", zapis: false });
    const { hesloZasielkovne, volajZasielkovnu } = await import("./zasielkovna.server");
    const { xmlStitok } = await import("./zasielkovna");
    const n = await hesloZasielkovne(data.company_id);
    const { data: f } = await context.supabase
      .from("invoices")
      .select("zasielkovna_id, invoice_number")
      .eq("id", data.invoice_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!n || !f?.zasielkovna_id) throw new Error("Faktúra nemá zásielku.");
    const o = await volajZasielkovnu(xmlStitok(n.heslo, f.zasielkovna_id));
    if (!o.ok) throw new Error(o.chyba);
    return { base64: o.vysledok.trim(), nazov: `stitok-${f.invoice_number}.pdf` };
  });

export const stavZasielkyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), invoice_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "clen", { nazov: "faktury", zapis: true });
    const { hesloZasielkovne, volajZasielkovnu } = await import("./zasielkovna.server");
    const { xmlStav, vysledokPola } = await import("./zasielkovna");
    const n = await hesloZasielkovne(data.company_id);
    const { data: f } = await context.supabase
      .from("invoices")
      .select("zasielkovna_id")
      .eq("id", data.invoice_id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!n || !f?.zasielkovna_id) throw new Error("Faktúra nemá zásielku.");
    const o = await volajZasielkovnu(xmlStav(n.heslo, f.zasielkovna_id));
    if (!o.ok) throw new Error(o.chyba);
    const stav =
      vysledokPola(o.vysledok, "codeText") || vysledokPola(o.vysledok, "statusText") || "neznámy";
    await context.supabase
      .from("invoices")
      .update({ zasielkovna_stav: stav, zasielkovna_stav_at: new Date().toISOString() })
      .eq("id", data.invoice_id);
    return { stav, ulozenaDo: vysledokPola(o.vysledok, "storedUntil") || null };
  });

/** Zapne či vypne automatický import; po zapnutí berie objednávky až od tejto chvíle. */
export const nastavAutoImportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        zapnut: z.boolean(),
        stavy: z.array(z.number().int()).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await overClena(context, data.company_id, "spravca");
    if (data.zapnut && !data.stavy.length)
      throw new Error("Vyberte aspoň jeden stav objednávky, ktorý sa má fakturovať.");
    const a = await admin();
    const { data: n } = await a
      .from("shoptet_napojenia")
      .select("auto_import, auto_od")
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!n) throw new Error("Shoptet nie je pripojený.");
    const { error } = await a
      .from("shoptet_napojenia")
      .update({
        auto_import: data.zapnut,
        auto_stavy: data.stavy,
        // Pri zapnutí sa staršie objednávky nefakturujú — tie sa dajú vystaviť ručne.
        auto_od: data.zapnut
          ? n.auto_import && n.auto_od
            ? n.auto_od
            : new Date().toISOString()
          : n.auto_od,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
