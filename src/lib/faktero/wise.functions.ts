import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Pripojenie účtu Wise a sťahovanie pohybov.
 *
 * Wise sa pripája inak než Tatra banka: nie presmerovaním a súhlasom, ale
 * osobným tokenom, ktorý si človek vygeneruje vo svojom účte. Token aj
 * súkromný kľúč na podpisovanie držíme **zašifrované** tým istým spôsobom ako
 * ostatné platobné tajomstvá; verejný kľúč sa ukáže na skopírovanie do Wise.
 *
 * Prečo kľúče vyrábame my: čítanie výpisu je vo Wise chránené silným overením
 * a to sa robí podpisom. Nechať človeka generovať pár kľúčov v termináli, aby
 * si pozrel zostatok, nie je nastavenie, ktoré niekto dokončí.
 */

const FirmaVstup = z.object({ company_id: z.string().uuid() });

async function overClena(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Do tejto firmy nemáte prístup.");
}

/** Spojenie aj s rozšifrovanými tajomstvami. Server-only. */
async function spojenieFirmy(companyId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: conn } = await supabaseAdmin
    .from("bank_connections")
    .select("*")
    .eq("company_id", companyId)
    .eq("provider", "wise")
    .maybeSingle();
  if (!conn) throw new Error("Wise nie je pripojený.");
  const { decryptSecret } = await import("./payment-crypto.server");
  const meta = (conn.metadata as any) ?? {};
  return {
    conn,
    supabaseAdmin,
    spojenie: {
      token: decryptSecret(conn.access_token as string),
      privateKeyPem: meta.private_key ? decryptSecret(meta.private_key) : null,
      profileId: meta.profile_id ?? null,
    },
  };
}

/**
 * Pripojí Wise podľa tokenu.
 *
 * Token sa hneď skúsi — bez toho by sa človek o preklepe dozvedel až pri
 * prvom sťahovaní a nevedel by, či je chyba v tokene alebo v kľúči.
 */
export const pripojWise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => FirmaVstup.extend({ token: z.string().trim().min(20).max(200) }).parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { nacitajProfil, vyrobKluce } = await import("./wise.server");
    const profil = await nacitajProfil(data.token);

    const { encryptSecret } = await import("./payment-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const kluce = vyrobKluce();

    // Jedno spojenie na firmu — druhý token by znamenal dva rovnaké účty.
    const { data: existuje } = await supabaseAdmin
      .from("bank_connections")
      .select("id")
      .eq("company_id", data.company_id)
      .eq("provider", "wise")
      .maybeSingle();

    const zaznam = {
      company_id: data.company_id,
      provider: "wise",
      status: "connected",
      access_token: encryptSecret(data.token),
      metadata: {
        profile_id: profil.id,
        profile_type: profil.typ,
        private_key: encryptSecret(kluce.sukromny),
        public_key: kluce.verejny,
      },
    };

    const { error } = existuje
      ? await supabaseAdmin.from("bank_connections").update(zaznam).eq("id", existuje.id)
      : await supabaseAdmin.from("bank_connections").insert(zaznam);
    if (error) throw new Error(error.message);

    return { ok: true, profil: profil.id, typ: profil.typ, verejnyKluc: kluce.verejny };
  });

/** Stav pripojenia — aj verejný kľúč, ktorý treba nahrať do Wise. */
export const stavWise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => FirmaVstup.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn } = await supabaseAdmin
      .from("bank_connections")
      .select("id, status, last_synced_at, metadata")
      .eq("company_id", data.company_id)
      .eq("provider", "wise")
      .maybeSingle();
    if (!conn) return { pripojene: false as const };
    const meta = (conn.metadata as any) ?? {};
    return {
      pripojene: true as const,
      id: conn.id,
      status: conn.status,
      last_synced_at: conn.last_synced_at,
      profil: meta.profile_id ?? null,
      // Zámerne aj po pripojení: kým kľúč nie je vo Wise, výpisy nechodia a
      // človek to musí mať kde skopírovať.
      verejnyKluc: meta.public_key ?? null,
    };
  });

/** Zostatky Wise ako účty vo Fakteri. */
export const synchronizujWiseUcty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => FirmaVstup.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { conn, supabaseAdmin, spojenie } = await spojenieFirmy(data.company_id);
    const { nacitajUcty } = await import("./wise.server");
    const ucty = await nacitajUcty(spojenie);

    const { upsertBankAccounts } = await import("./tatrabanka.server");
    await upsertBankAccounts(data.company_id, conn.id as string, ucty);
    await supabaseAdmin
      .from("bank_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);
    return { ok: true, pocet: ucty.length };
  });

/**
 * Pohyby všetkých zostatkov za posledný rok.
 *
 * Beží po účtoch a chybu jedného nenechá zhodiť ostatné: keď Wise pri jednej
 * mene odmietne podpis alebo nič nevráti, ostatné meny sa aj tak stiahnu a
 * povie sa, čo neprešlo.
 */
export const synchronizujWisePohyby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => FirmaVstup.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { conn, supabaseAdmin, spojenie } = await spojenieFirmy(data.company_id);

    const { nacitajPohyby } = await import("./wise.server");
    const { stiahniPohybyPripojenia } = await import("./bank-sync.server");
    const { vlozenych, problemy } = await stiahniPohybyPripojenia(
      supabaseAdmin,
      data.company_id,
      conn.id as string,
      (u) => nacitajPohyby(spojenie, u.external_account_id, u.currency),
    );

    if (!vlozenych && problemy.length) throw new Error(problemy.join(" · "));
    return { ok: true, vlozenych, problemy };
  });

/**
 * To isté, ale bez prihláseného človeka — pre nočný beh.
 *
 * Účty aj pohyby naraz: zostatok sa mení rovnako ako pohyby a sťahovať ich
 * zvlášť by znamenalo, že prehľad ukazuje starý zostatok k novým pohybom.
 */
export async function synchronizujWiseZoServera(companyId: string) {
  const { conn, supabaseAdmin, spojenie } = await spojenieFirmy(companyId);
  const { nacitajUcty, nacitajPohyby } = await import("./wise.server");
  const { upsertBankAccounts } = await import("./tatrabanka.server");
  const { stiahniPohybyPripojenia } = await import("./bank-sync.server");

  const ucty = await nacitajUcty(spojenie);
  await upsertBankAccounts(companyId, conn.id as string, ucty);
  const { vlozenych, problemy } = await stiahniPohybyPripojenia(
    supabaseAdmin,
    companyId,
    conn.id as string,
    (u) => nacitajPohyby(spojenie, u.external_account_id, u.currency),
  );
  return { accounts: ucty.length, inserted: vlozenych, problemy };
}

/** Odpojenie. Účty a pohyby ostávajú — sú to už zaúčtované dáta firmy. */
export const odpojWise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => FirmaVstup.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bank_connections")
      .update({ status: "disconnected", access_token: null, metadata: {} })
      .eq("company_id", data.company_id)
      .eq("provider", "wise");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
