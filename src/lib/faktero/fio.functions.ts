import { createServerFn } from "@tanstack/react-start";
import { overPristup } from "./over-pristup";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Pripojenie Fio banky tokenom a sťahovanie pohybov.
 *
 * Jeden token patrí jednému účtu, preto môže mať firma Fio pripojení viac
 * (korunový a eurový účet). Token držíme zašifrovaný ako ostatné bankové
 * tajomstvá. Pripojiť a odpojiť smie len majiteľ alebo admin (kto vymení
 * token, tomu chodia do Faktera pohyby z jeho účtu); synchronizácia chce
 * zápis v oblasti Banka.
 */

const FirmaVstup = z.object({ company_id: z.string().uuid() });
const PripojenieVstup = FirmaVstup.extend({ connection_id: z.string().uuid() });

async function overClena(
  supabase: any,
  userId: string,
  companyId: string,
  uroven: "citat" | "zapis" | "spravca" = "citat",
) {
  await overPristup({ supabase, userId }, companyId, {
    oblast: "banka",
    zapis: uroven !== "citat",
    spravca: uroven === "spravca",
  });
}

/**
 * Pripojí účet podľa tokenu. Token sa hneď skúsi a stiahnuté pohyby sa rovno
 * zapíšu — ďalšie volanie by Fio pustilo až o 30 sekúnd.
 */
export const pripojFio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    FirmaVstup.extend({
      token: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9]{20,128}$/, "Token z Fio má len písmená a číslice."),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id, "spravca");
    const { stiahniFio, zapisVypisFio } = await import("./fio.server");
    const vypis = await stiahniFio(data.token);

    const { encryptSecret } = await import("./payment-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ten istý účet znova = výmena tokenu, nie druhé pripojenie.
    const { data: existujuce } = await supabaseAdmin
      .from("bank_connections")
      .select("id, metadata")
      .eq("company_id", data.company_id)
      .eq("provider", "fio");
    const rovnaky = (existujuce ?? []).find(
      (c: any) => String(c.metadata?.account_id ?? "") === vypis.ucet.external_account_id,
    );

    const zaznam = {
      company_id: data.company_id,
      provider: "fio",
      status: "connected",
      access_token: encryptSecret(data.token),
      metadata: {
        account_id: vypis.ucet.external_account_id,
        iban: vypis.ucet.iban,
        currency: vypis.ucet.currency,
      },
    };
    let connectionId: string;
    if (rovnaky) {
      const { error } = await supabaseAdmin
        .from("bank_connections")
        .update(zaznam)
        .eq("id", rovnaky.id);
      if (error) throw new Error(error.message);
      connectionId = rovnaky.id as string;
    } else {
      const { data: novy, error } = await supabaseAdmin
        .from("bank_connections")
        .insert(zaznam)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      connectionId = novy.id as string;
    }

    const r = await zapisVypisFio(supabaseAdmin, data.company_id, connectionId, vypis);
    return {
      ok: true,
      ucet: vypis.ucet.account_name,
      iban: vypis.ucet.iban,
      vlozenych: r.inserted,
      problemy: r.problemy,
    };
  });

/** Pripojené účty Fio firmy. */
export const stavFio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => FirmaVstup.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("bank_connections")
      .select("id, status, last_synced_at, metadata")
      .eq("company_id", data.company_id)
      .eq("provider", "fio")
      .eq("status", "connected");
    return {
      ucty: (rows ?? []).map((c: any) => ({
        id: c.id as string,
        cislo: (c.metadata?.account_id as string) ?? null,
        iban: (c.metadata?.iban as string) ?? null,
        mena: (c.metadata?.currency as string) ?? null,
        last_synced_at: c.last_synced_at as string | null,
      })),
    };
  });

/** Zostatok a pohyby jedného účtu (jedno volanie do Fio). */
export const synchronizujFio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => PripojenieVstup.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id, "zapis");
    const { spojenieFio, stiahniFio, zapisVypisFio } = await import("./fio.server");
    const { conn, supabaseAdmin, token } = await spojenieFio(data.connection_id, data.company_id);
    const vypis = await stiahniFio(token);
    const r = await zapisVypisFio(supabaseAdmin, data.company_id, conn.id as string, vypis);
    return { ok: true, vlozenych: r.inserted, problemy: r.problemy };
  });

/** Odpojenie. Účet a pohyby ostávajú — sú to už zaúčtované dáta firmy. */
export const odpojFio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => PripojenieVstup.parse(d))
  .handler(async ({ context, data }) => {
    await overClena(context.supabase, context.userId, data.company_id, "spravca");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bank_connections")
      .update({ status: "disconnected", access_token: null })
      .eq("id", data.connection_id)
      .eq("company_id", data.company_id)
      .eq("provider", "fio");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
