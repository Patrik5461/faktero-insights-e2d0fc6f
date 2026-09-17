import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Pripojenie Wallesteru.
 *
 * Postup má dva kroky a to je jeho podstata: Wallester najprv potrebuje **náš
 * verejný kľúč** a až potom vydá údaje, ktorými sa dá volať. Preto sa spojenie
 * zakladá prázdne — len s kľúčmi — a doplní sa, keď od nich prídu tri hodnoty.
 *
 * Bez toho by človek musel niekde bokom generovať kľúče a čakať s nimi
 * v mailoch; takto má hneď čo poslať a Faktero si pamätá, kde skončil.
 */

const Firma = z.object({ company_id: z.string().uuid() });

async function overClena(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Do tejto firmy nemáte prístup.");
}

async function spojenieFirmy(companyId: string, musiBytUplne = true) {
  const { spojenieFirmy: zoServera } = await import("./wallester.server");
  return zoServera(companyId, musiBytUplne);
}

/** Prvý krok: vyrobí pár kľúčov, aby bolo čo poslať Wallesteru. */
export const zacniWallester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Firma.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existuje } = await supabaseAdmin
      .from("bank_connections")
      .select("id, metadata")
      .eq("company_id", data.company_id)
      .eq("provider", "wallester")
      .maybeSingle();

    // Kľúče sa nevyrábajú znova, keď už raz vznikli — človek ich medzitým
    // poslal Wallesteru a nový pár by celé nastavenie zneplatnil.
    if (existuje && (existuje.metadata as any)?.public_key) {
      return { ok: true, verejnyKluc: (existuje.metadata as any).public_key as string };
    }

    const { vyrobKluce } = await import("./wallester.server");
    const { encryptSecret } = await import("./payment-crypto.server");
    const kluce = vyrobKluce();
    const metadata = {
      ...((existuje?.metadata as any) ?? {}),
      public_key: kluce.verejny,
      private_key: encryptSecret(kluce.sukromny),
    };

    const { error } = existuje
      ? await supabaseAdmin.from("bank_connections").update({ metadata }).eq("id", existuje.id)
      : await supabaseAdmin.from("bank_connections").insert({
          company_id: data.company_id,
          provider: "wallester",
          status: "pending",
          metadata,
        });
    if (error) throw new Error(error.message);
    return { ok: true, verejnyKluc: kluce.verejny };
  });

/** Druhý krok: to, čo Wallester poslal späť. Hneď sa aj skúsi. */
export const dokonciWallester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    Firma.extend({
      issuer_id: z.string().trim().min(8).max(100),
      audience_id: z.string().trim().min(8).max(100),
      product_code: z.string().trim().min(1).max(60),
      max_exp_seconds: z.number().int().min(30).max(3600).default(60),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { conn, supabaseAdmin, meta } = await spojenieFirmy(data.company_id, false);
    if (!meta.private_key) throw new Error("Chýba kľúč. Začnite pripojenie odznova.");

    const { decryptSecret } = await import("./payment-crypto.server");
    const { overSpojenie } = await import("./wallester.server");
    // Skúsi sa ešte pred uložením — inak by sa preklep v issuer ID prejavil až
    // pri sťahovaní a vyzeral by ako chyba Wallesteru.
    await overSpojenie({
      issuerId: data.issuer_id,
      audienceId: data.audience_id,
      privateKeyPem: decryptSecret(meta.private_key),
      productCode: data.product_code,
      maxPlatnostSekund: data.max_exp_seconds,
    });

    const { error } = await supabaseAdmin
      .from("bank_connections")
      .update({
        status: "connected",
        metadata: {
          ...meta,
          issuer_id: data.issuer_id,
          audience_id: data.audience_id,
          product_code: data.product_code,
          max_exp_seconds: data.max_exp_seconds,
        },
      })
      .eq("id", conn.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const stavWallester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Firma.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn } = await supabaseAdmin
      .from("bank_connections")
      .select("id, status, last_synced_at, metadata")
      .eq("company_id", data.company_id)
      .eq("provider", "wallester")
      .maybeSingle();
    if (!conn) return { stav: "ziadne" as const };
    const meta = (conn.metadata as any) ?? {};
    return {
      stav: (conn.status === "connected" ? "pripojene" : "caka") as "pripojene" | "caka",
      id: conn.id,
      last_synced_at: conn.last_synced_at,
      verejnyKluc: (meta.public_key as string) ?? null,
      issuer_id: (meta.issuer_id as string) ?? null,
      product_code: (meta.product_code as string) ?? null,
    };
  });

export const synchronizujWallesterUcty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Firma.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { conn, supabaseAdmin, spojenie } = await spojenieFirmy(data.company_id);
    const { nacitajUcty } = await import("./wallester.server");
    const ucty = await nacitajUcty(spojenie);
    const { upsertBankAccounts } = await import("./tatrabanka.server");
    await upsertBankAccounts(data.company_id, conn.id as string, ucty);
    await supabaseAdmin
      .from("bank_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);
    return { ok: true, pocet: ucty.length };
  });

export const synchronizujWallesterPohyby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Firma.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { conn, supabaseAdmin, spojenie } = await spojenieFirmy(data.company_id);
    const { nacitajPohyby } = await import("./wallester.server");
    const { stiahniPohybyPripojenia } = await import("./bank-sync.server");
    const { vlozenych, problemy } = await stiahniPohybyPripojenia(
      supabaseAdmin,
      data.company_id,
      conn.id as string,
      (u) => nacitajPohyby(spojenie, u.external_account_id),
    );
    if (!vlozenych && problemy.length) throw new Error(problemy.join(" · "));
    return { ok: true, vlozenych, problemy };
  });

/** Odpojenie. Účty aj pohyby ostávajú — sú to už zaúčtované dáta firmy. */
export const odpojWallester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Firma.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bank_connections")
      .update({ status: "disconnected", metadata: {} })
      .eq("company_id", data.company_id)
      .eq("provider", "wallester");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
