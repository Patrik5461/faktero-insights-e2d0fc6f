import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Administrácia eFaktúry: žiadosti z Portálu FS (firmy, ktoré si vybrali
  Faktero) a odbery webhookov ePoštáka. Tabuľky sú len pre servisný kľúč,
  preto sa najprv overí `platform_admins`. Token z FS sa von nikdy nevracia.
*/

async function admin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: not a platform admin");
  return supabaseAdmin as any;
}

export type ZiadostFsAdmin = {
  id: string;
  prijate_at: string;
  dic: string;
  nazov: string | null;
  email: string | null;
  telefon: string | null;
  stav: string;
  company_id: string | null;
  firma: string | null;
  peppol_id: string | null;
  chyba: string | null;
  pokusov: number;
  pozvanka_odoslana_at: string | null;
  ma_token: boolean;
};

export type WebhookAdmin = {
  company_id: string;
  firma: string | null;
  epostak_firm_id: string;
  webhook_id: string | null;
  stav: string;
  chyba: string | null;
  vytvorene_at: string;
  posledna_udalost_at: string | null;
};

export type EfakturaPrehlad = {
  nastavene: { pdsTajomstvo: boolean; epostakProdukcia: boolean };
  ziadosti: ZiadostFsAdmin[];
  webhooky: WebhookAdmin[];
};

export const adminEfakturaPrehladFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EfakturaPrehlad> => {
    const db = await admin((context as { userId: string }).userId);
    const [{ data: ziadosti }, { data: webhooky }] = await Promise.all([
      db
        .from("efaktura_pds_ziadosti")
        .select(
          "id, prijate_at, dic, nazov, email, telefon, stav, company_id, peppol_id, chyba, pokusov, pozvanka_odoslana_at, token_sifrovany, companies(name)",
        )
        .order("prijate_at", { ascending: false })
        .limit(300),
      db
        .from("efaktura_webhooky")
        .select("company_id, epostak_firm_id, webhook_id, stav, chyba, vytvorene_at, posledna_udalost_at, companies(name)")
        .order("vytvorene_at", { ascending: false })
        .limit(300),
    ]);
    return {
      nastavene: {
        pdsTajomstvo: Boolean(process.env.EFAKTURA_PDS_SECRET),
        epostakProdukcia: (process.env.EPOSTAK_ENV ?? "sandbox").toLowerCase() === "production",
      },
      ziadosti: (ziadosti ?? []).map(
        (z: any): ZiadostFsAdmin => ({
          id: z.id,
          prijate_at: z.prijate_at,
          dic: z.dic,
          nazov: z.nazov,
          email: z.email,
          telefon: z.telefon,
          stav: z.stav,
          company_id: z.company_id,
          firma: z.companies?.name ?? null,
          peppol_id: z.peppol_id,
          chyba: z.chyba,
          pokusov: z.pokusov ?? 0,
          pozvanka_odoslana_at: z.pozvanka_odoslana_at,
          ma_token: Boolean(z.token_sifrovany),
        }),
      ),
      webhooky: (webhooky ?? []).map((w: any): WebhookAdmin => ({
        company_id: w.company_id as string,
        firma: (w.companies?.name ?? null) as string | null,
        epostak_firm_id: w.epostak_firm_id as string,
        webhook_id: (w.webhook_id ?? null) as string | null,
        stav: w.stav as string,
        chyba: (w.chyba ?? null) as string | null,
        vytvorene_at: w.vytvorene_at as string,
        posledna_udalost_at: (w.posledna_udalost_at ?? null) as string | null,
      })),
    };
  });

/** Zopakuje registráciu žiadosti u ePoštáka (napr. po vybavení White Label). */
export const adminZopakujZiadostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin((context as { userId: string }).userId);
    await db.from("efaktura_pds_ziadosti").update({ pokusov: 0 }).eq("id", data.id);
    const { spracujZiadost } = await import("./efaktura/webhooky-obsluha.server");
    return { stav: await spracujZiadost(data.id) };
  });

/** Priradí registrovanú žiadosť firme vo Fakteri a zapne jej eFaktúru. */
export const adminPriradZiadostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), company_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin((context as { userId: string }).userId);
    const { data: zz } = await db
      .from("efaktura_pds_ziadosti")
      .select("id, dic, stav, epostak_firm_id, peppol_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!zz) throw new Error("Žiadosť sa nenašla.");
    const { data: firma } = await db.from("companies").select("id, dic").eq("id", data.company_id).maybeSingle();
    if (!firma) throw new Error("Firma sa nenašla.");
    if (firma.dic && firma.dic !== zz.dic) {
      throw new Error(`Firma má DIČ ${firma.dic}, žiadosť je pre ${zz.dic}.`);
    }
    await db.from("efaktura_pds_ziadosti").update({ company_id: firma.id }).eq("id", zz.id);
    if (zz.stav === "registrovana" && zz.epostak_firm_id) {
      const { error } = await db.from("efaktura_profiles").upsert(
        {
          company_id: firma.id,
          epostak_firm_id: zz.epostak_firm_id,
          peppol_provider: "epostak",
          peppol_participant_id: zz.peppol_id,
          peppol_scheme: zz.peppol_id?.split(":")[0] ?? "0245",
          enabled: true,
          activated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Zapne webhooky ePoštáka všetkým spárovaným firmám, ktoré ich nemajú. */
export const adminZapniWebhookyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await admin((context as { userId: string }).userId);
    const { zapniWebhookyFiriem } = await import("./efaktura/webhooky-obsluha.server");
    return zapniWebhookyFiriem();
  });

/** Zmaže záznam o odbere (napr. chybný) — nočná úloha ho skúsi založiť znova. */
export const adminZmazWebhookFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin((context as { userId: string }).userId);
    await db.from("efaktura_webhooky").delete().eq("company_id", data.company_id);
    return { ok: true };
  });
