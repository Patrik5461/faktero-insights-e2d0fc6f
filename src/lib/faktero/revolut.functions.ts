import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Pripojenie Revolut Business.
 *
 * Postup má tri kroky, lebo Revolut ich v tomto poradí vyžaduje: najprv
 * certifikát, potom `client_id`, ktoré vydá až po jeho nahratí, a nakoniec
 * potvrdenie v prehliadači. Faktero si preto pamätá, kde človek skončil, a
 * ukazuje vždy len ten ďalší krok.
 *
 * Návratová adresa je pre všetkých rovnaká — `/bankove-ucty/revolut` na tomto
 * webe. Z nej sa odvodzuje `iss` v podpísanom tvrdení, takže sa nesmie líšiť
 * od toho, čo má človek zaregistrované v portáli.
 */

const Firma = z.object({ company_id: z.string().uuid() });

/** Návratová adresa. Musí byť verejná HTTPS — Revolut `localhost` odmieta. */
export function navratovaAdresa(): string {
  return `${process.env.APP_PUBLIC_URL || "https://www.faktero.sk"}/bankove-ucty/revolut`;
}

async function overClena(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Do tejto firmy nemáte prístup.");
}

async function spojenieFirmy(companyId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: conn } = await supabaseAdmin
    .from("bank_connections")
    .select("*")
    .eq("company_id", companyId)
    .eq("provider", "revolut")
    .maybeSingle();
  if (!conn) throw new Error("Revolut nie je pripojený.");
  const meta = (conn.metadata as any) ?? {};
  const { decryptSecret } = await import("./payment-crypto.server");
  return {
    conn,
    meta,
    supabaseAdmin,
    spojenie: {
      clientId: meta.client_id ?? "",
      privateKeyPem: decryptSecret(meta.private_key),
      redirectUri: meta.redirect_uri ?? navratovaAdresa(),
      prostredie: (meta.prostredie ?? "produkcia") as "sandbox" | "produkcia",
    },
  };
}

/**
 * Platný prístupový token.
 *
 * Revolutu platí asi 40 minút, takže sa obnovuje pri každom použití, keď je
 * blízko konca. Minúta rezervy je tam preto, že medzi kontrolou a odpoveďou
 * servera čas beží ďalej.
 */
async function platnyToken(companyId: string) {
  const { conn, meta, supabaseAdmin, spojenie } = await spojenieFirmy(companyId);
  const { decryptSecret, encryptSecret } = await import("./payment-crypto.server");
  const vyprsi = conn.token_expires_at ? Date.parse(conn.token_expires_at as string) : 0;
  if (conn.access_token && vyprsi - 60_000 > Date.now()) {
    return {
      spojenie,
      token: decryptSecret(conn.access_token as string),
      conn,
      supabaseAdmin,
      meta,
    };
  }
  if (!conn.refresh_token) {
    throw new Error("Prístup do Revolutu vypršal. Potvrďte ho znova.");
  }

  const { obnovToken } = await import("./revolut.server");
  const nove = await obnovToken(spojenie, decryptSecret(conn.refresh_token as string));
  await supabaseAdmin
    .from("bank_connections")
    .update({
      access_token: encryptSecret(nove.access_token),
      token_expires_at: new Date(Date.now() + nove.expires_in * 1000).toISOString(),
      // Obnovovací token v odpovedi zvyčajne nie je — starý ostáva platný.
      ...(nove.refresh_token ? { refresh_token: encryptSecret(nove.refresh_token) } : {}),
    })
    .eq("id", conn.id);
  return { spojenie, token: nove.access_token, conn, supabaseAdmin, meta };
}

/** Krok 1: certifikát na nahratie do portálu Revolutu. */
export const zacniRevolut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    Firma.extend({ prostredie: z.enum(["sandbox", "produkcia"]).default("produkcia") }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existuje } = await supabaseAdmin
      .from("bank_connections")
      .select("id, metadata")
      .eq("company_id", data.company_id)
      .eq("provider", "revolut")
      .maybeSingle();

    // Certifikát sa nevyrába znova — človek ho už nahral do portálu a nový by
    // prihlásenie zneplatnil.
    const staraMeta = (existuje?.metadata as any) ?? {};
    if (staraMeta.certificate) {
      return {
        certifikat: staraMeta.certificate as string,
        redirect_uri: staraMeta.redirect_uri ?? navratovaAdresa(),
      };
    }

    const { vyrobCertifikat } = await import("./revolut.server");
    const { encryptSecret } = await import("./payment-crypto.server");
    const { sukromny, certifikat } = await vyrobCertifikat();
    const metadata = {
      ...staraMeta,
      certificate: certifikat,
      private_key: encryptSecret(sukromny),
      redirect_uri: navratovaAdresa(),
      prostredie: data.prostredie,
    };

    const { error } = existuje
      ? await supabaseAdmin.from("bank_connections").update({ metadata }).eq("id", existuje.id)
      : await supabaseAdmin.from("bank_connections").insert({
          company_id: data.company_id,
          provider: "revolut",
          status: "pending",
          metadata,
        });
    if (error) throw new Error(error.message);
    return { certifikat, redirect_uri: navratovaAdresa() };
  });

/** Krok 2: client ID z portálu. Vráti adresu, na ktorej sa potvrdí prístup. */
export const ulozClientIdRevolut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Firma.extend({ client_id: z.string().trim().min(6).max(120) }).parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { conn, meta, supabaseAdmin, spojenie } = await spojenieFirmy(data.company_id);
    const { error } = await supabaseAdmin
      .from("bank_connections")
      .update({ metadata: { ...meta, client_id: data.client_id } })
      .eq("id", conn.id);
    if (error) throw new Error(error.message);

    const { adresaPotvrdenia } = await import("./revolut.server");
    return { adresa: adresaPotvrdenia({ ...spojenie, clientId: data.client_id }) };
  });

/** Krok 3: kód z návratovej adresy sa vymení za tokeny. */
export const dokonciRevolut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Firma.extend({ code: z.string().trim().min(6).max(500) }).parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { conn, meta, supabaseAdmin, spojenie } = await spojenieFirmy(data.company_id);
    if (!spojenie.clientId) throw new Error("Chýba client ID z portálu Revolutu.");

    const { vymenKod } = await import("./revolut.server");
    const { encryptSecret } = await import("./payment-crypto.server");
    const tokeny = await vymenKod(spojenie, data.code);

    const { error } = await supabaseAdmin
      .from("bank_connections")
      .update({
        status: "connected",
        access_token: encryptSecret(tokeny.access_token),
        refresh_token: tokeny.refresh_token ? encryptSecret(tokeny.refresh_token) : null,
        token_expires_at: new Date(Date.now() + tokeny.expires_in * 1000).toISOString(),
        // Súhlas Revolutu platí asi 90 dní; podľa toho vieme upozorniť dopredu.
        metadata: {
          ...meta,
          consent_until: new Date(Date.now() + 90 * 86400_000).toISOString(),
        },
      })
      .eq("id", conn.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const stavRevolut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Firma.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn } = await supabaseAdmin
      .from("bank_connections")
      .select("id, status, last_synced_at, metadata")
      .eq("company_id", data.company_id)
      .eq("provider", "revolut")
      .maybeSingle();
    if (!conn) return { stav: "ziadne" as const, redirect_uri: navratovaAdresa() };
    const meta = (conn.metadata as any) ?? {};
    return {
      stav: (conn.status === "connected"
        ? "pripojene"
        : meta.client_id
          ? "caka_potvrdenie"
          : "caka_client_id") as "pripojene" | "caka_potvrdenie" | "caka_client_id",
      id: conn.id,
      last_synced_at: conn.last_synced_at,
      certifikat: (meta.certificate as string) ?? null,
      redirect_uri: (meta.redirect_uri as string) ?? navratovaAdresa(),
      client_id: (meta.client_id as string) ?? null,
      prostredie: (meta.prostredie as string) ?? "produkcia",
      consent_until: (meta.consent_until as string) ?? null,
    };
  });

export const synchronizujRevolutUcty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Firma.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { spojenie, token, conn, supabaseAdmin } = await platnyToken(data.company_id);
    const { nacitajUcty } = await import("./revolut.server");
    const ucty = await nacitajUcty(spojenie, token);
    const { upsertBankAccounts } = await import("./tatrabanka.server");
    await upsertBankAccounts(data.company_id, conn.id as string, ucty);
    await supabaseAdmin
      .from("bank_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);
    return { ok: true, pocet: ucty.length };
  });

export const synchronizujRevolutPohyby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Firma.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { spojenie, token, conn, supabaseAdmin } = await platnyToken(data.company_id);
    const { data: ucty } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, external_account_id, currency")
      .eq("bank_connection_id", conn.id);

    const { nacitajPohyby } = await import("./revolut.server");
    const { znameReferencie, vlozPohyby } = await import("./bank-sync.server");
    const odDna = new Date(Date.now() - 366 * 86400_000).toISOString().slice(0, 10);

    let vlozenych = 0;
    const problemy: string[] = [];
    for (const u of (ucty as any[]) ?? []) {
      if (!u.external_account_id) continue;
      try {
        const pohyby = await nacitajPohyby(spojenie, token, u.external_account_id);
        const zname = await znameReferencie(supabaseAdmin, u.id, odDna);
        const nove = pohyby.filter((p) => !zname.has(p.external_id));
        if (!nove.length) continue;
        vlozenych += await vlozPohyby(
          supabaseAdmin,
          nove.map((p) => ({
            company_id: data.company_id,
            bank_account_id: u.id,
            booking_date: p.booking_date,
            amount: p.amount,
            currency: p.currency,
            variable_symbol: p.variable_symbol,
            counterparty: p.counterparty,
            description: p.description,
            transaction_reference: p.external_id,
          })),
        );
      } catch (e: any) {
        problemy.push(`${u.currency}: ${e?.message ?? "nepodarilo sa"}`);
      }
    }

    await supabaseAdmin
      .from("bank_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);
    if (!vlozenych && problemy.length) throw new Error(problemy.join(" · "));
    return { ok: true, vlozenych, problemy };
  });

export const odpojRevolut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Firma.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bank_connections")
      .update({
        status: "disconnected",
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        metadata: {},
      })
      .eq("company_id", data.company_id)
      .eq("provider", "revolut");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
