import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Administrácia eFaktúry: žiadosti z Portálu FS (firmy, ktoré si vybrali
  Faktero) a odbery webhookov ePoštáka. Tabuľky sú len pre servisný kľúč,
  preto sa najprv overí `platform_admins`. Token z FS sa von nikdy nevracia.
*/

async function overAdmina(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: not a platform admin");
  return { db: supabaseAdmin as any, role: data.role as "admin" | "superadmin" };
}

async function admin(userId: string) {
  return (await overAdmina(userId)).db;
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
  /** false = podpis FS nesedel, žiadosť prešla len na ručné schválenie. */
  podpis_overeny: boolean;
  via: string | null;
  /** Kto firmu v Peppole drží (O= z certifikátu v SMP), ak sa to zistilo. */
  cudzi_poskytovatel: string | null;
  /** Rozbehnuté prevzatie migračným kódom (kód je uložený zašifrovaný). */
  migracia_bezi: boolean;
  migracia_at: string | null;
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

/** Onboarding „len odosielanie“ (send_only) jednej firmy. Kľúč firmy sa von nevracia. */
export type OdosielanieAdmin = {
  company_id: string;
  firma: string | null;
  pds_ziadost_id: string | null;
  dic: string;
  stav: string;
  epostak_stav: string | null;
  next_action: string | null;
  client_message_sk: string | null;
  relationship_mode: string;
  payer_mode: string | null;
  contact_email: string | null;
  prijem_poskytovatel: string | null;
  epostak_firm_id: string | null;
  ma_kluc: boolean;
  kluc_chyba: string | null;
  chyba: string | null;
  pokusov: number;
  vytvorene_at: string;
  aktivovane_at: string | null;
};

export type EfakturaPrehlad = {
  nastavene: { pdsTajomstvo: boolean; epostakProdukcia: boolean };
  /** Partnerský onboarding webhook ePoštáka (pre „len odosielanie“). */
  onboardingWebhook: { nastaveny: boolean; url: string | null; chyba: string | null };
  odosielanie: OdosielanieAdmin[];
  /** Prevzatie firmy migračným kódom smie len superadmin. */
  smieMigrovat: boolean;
  ziadosti: ZiadostFsAdmin[];
  odmietnute: OdmietnutaFsAdmin[];
  webhooky: WebhookAdmin[];
};

export type OdmietnutaFsAdmin = {
  id: string;
  prijate_at: string;
  dovod: string;
  overene: boolean;
  firmy: { nazov: string | null; dic: string; email: string | null; telefon: string | null }[];
  chyba: string | null;
  ip: string | null;
};

export const adminEfakturaPrehladFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EfakturaPrehlad> => {
    const { db, role } = await overAdmina((context as { userId: string }).userId);
    const [
      { data: ziadosti },
      { data: webhooky },
      { data: odmietnute },
      { data: odosielanie },
      { data: onboardingWebhook },
    ] = await Promise.all([
      db
        .from("efaktura_pds_ziadosti")
        .select(
          "id, prijate_at, dic, nazov, email, telefon, stav, company_id, peppol_id, chyba, pokusov, pozvanka_odoslana_at, token_sifrovany, podpis_overeny, via, cudzi_poskytovatel, migracny_kod_sifrovany, migracia_at, companies(name)",
        )
        .order("prijate_at", { ascending: false })
        .limit(300),
      db
        .from("efaktura_webhooky")
        .select(
          "company_id, epostak_firm_id, webhook_id, stav, chyba, vytvorene_at, posledna_udalost_at, companies(name)",
        )
        .order("vytvorene_at", { ascending: false })
        .limit(300),
      db
        .from("efaktura_pds_odmietnute")
        .select("id, prijate_at, dovod, overene, firmy, chyba, ip")
        .order("prijate_at", { ascending: false })
        .limit(100),
      db
        .from("efaktura_odosielanie_ziadosti")
        .select(
          "company_id, pds_ziadost_id, dic, stav, epostak_stav, next_action, client_message_sk, relationship_mode, payer_mode, contact_email, prijem_poskytovatel, epostak_firm_id, kluc_sifrovany, kluc_chyba, chyba, pokusov, vytvorene_at, aktivovane_at, companies(name)",
        )
        .order("vytvorene_at", { ascending: false })
        .limit(300),
      db
        .from("efaktura_epostak_nastavenie")
        .select("url, tajomstvo_sifrovane, chyba")
        .eq("kluc", "onboarding_webhook")
        .maybeSingle(),
    ]);
    return {
      nastavene: {
        pdsTajomstvo: Boolean(process.env.EFAKTURA_PDS_SECRET),
        epostakProdukcia: (process.env.EPOSTAK_ENV ?? "sandbox").toLowerCase() === "production",
      },
      smieMigrovat: role === "superadmin",
      onboardingWebhook: {
        nastaveny: Boolean(
          onboardingWebhook?.tajomstvo_sifrovane || process.env.EPOSTAK_ONBOARDING_WEBHOOK_SECRET,
        ),
        url: onboardingWebhook?.url ?? null,
        chyba: onboardingWebhook?.chyba ?? null,
      },
      odosielanie: (odosielanie ?? []).map((o: any): OdosielanieAdmin => ({
        company_id: o.company_id,
        firma: o.companies?.name ?? null,
        pds_ziadost_id: o.pds_ziadost_id ?? null,
        dic: o.dic,
        stav: o.stav,
        epostak_stav: o.epostak_stav ?? null,
        next_action: o.next_action ?? null,
        client_message_sk: o.client_message_sk ?? null,
        relationship_mode: o.relationship_mode,
        payer_mode: o.payer_mode ?? null,
        contact_email: o.contact_email ?? null,
        prijem_poskytovatel: o.prijem_poskytovatel ?? null,
        epostak_firm_id: o.epostak_firm_id ?? null,
        // Kľúč sám sa von nevracia — len to, že je uložený.
        ma_kluc: Boolean(o.kluc_sifrovany),
        kluc_chyba: o.kluc_chyba ?? null,
        chyba: o.chyba ?? null,
        pokusov: o.pokusov ?? 0,
        vytvorene_at: o.vytvorene_at,
        aktivovane_at: o.aktivovane_at ?? null,
      })),
      ziadosti: (ziadosti ?? []).map((z: any): ZiadostFsAdmin => ({
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
        podpis_overeny: z.podpis_overeny !== false,
        via: z.via ?? null,
        cudzi_poskytovatel: z.cudzi_poskytovatel ?? null,
        // Kód sám sa von nevracia — len to, že je uložený.
        migracia_bezi: Boolean(z.migracny_kod_sifrovany),
        migracia_at: z.migracia_at ?? null,
      })),
      odmietnute: (odmietnute ?? []) as OdmietnutaFsAdmin[],
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

/** Schváli žiadosť s nesediacim podpisom a spustí registráciu cez ePošták. */
export const adminSchvalZiadostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin((context as { userId: string }).userId);
    const { error } = await db
      .from("efaktura_pds_ziadosti")
      .update({ stav: "prijata", pokusov: 0, chyba: null })
      .eq("id", data.id)
      .eq("stav", "na_schvalenie");
    if (error) throw new Error(error.message);
    const { spracujZiadost } = await import("./efaktura/webhooky-obsluha.server");
    return { stav: await spracujZiadost(data.id) };
  });

/**
 * Prevezme firmu od iného poskytovateľa migračným kódom (ePošták White Label
 * migrácia). Len superadmin. Kód sa uloží zašifrovaný, kým migrácia nedobehne
 * (cron ju dopytuje), po konečnom výsledku sa zmaže; do auditu ani logu nejde.
 */
export const adminMigrujZiadostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        kod: z.string().trim().min(1, "Zadaj migračný kód.").max(4096),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const { db, role } = await overAdmina(userId);
    if (role !== "superadmin") throw new Error("Prevziať firmu smie len superadmin.");
    const { prevezmiMigracnymKodom } = await import("./efaktura/migracia.server");
    return prevezmiMigracnymKodom(db, { id: data.id, kod: data.kod, adminUserId: userId });
  });

/** Zamietne neoverenú žiadosť — token sa zahodí. */
export const adminZamietniZiadostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin((context as { userId: string }).userId);
    const { error } = await db
      .from("efaktura_pds_ziadosti")
      .update({ stav: "zamietnuta", token_sifrovany: null, chyba: "Zamietnuté ručne v admine." })
      .eq("id", data.id)
      .eq("stav", "na_schvalenie");
    if (error) throw new Error(error.message);
    return { ok: true };
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
    const { data: firma } = await db
      .from("companies")
      .select("id, dic")
      .eq("id", data.company_id)
      .maybeSingle();
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

/**
 * eFaktúra „len odosielanie“ pre firmu, ktorú v Peppole drží iný poskytovateľ
 * (žiadosť FS v stave `cudzi_poskytovatel`). Príjem ostáva u neho, Faktero
 * len odosiela. Len superadmin; zapisuje sa do auditu.
 */
export const adminLenOdosielanieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        relationship_mode: z.literal("managed_service").default("managed_service"),
        email: z.string().trim().email().max(255).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const { db, role } = await overAdmina(userId);
    if (role !== "superadmin") throw new Error("Len odosielanie smie zapnúť len superadmin.");
    const { data: zz } = await db
      .from("efaktura_pds_ziadosti")
      .select("id, dic, nazov, email, stav, company_id, cudzi_poskytovatel")
      .eq("id", data.id)
      .maybeSingle();
    if (!zz) throw new Error("Žiadosť sa nenašla.");
    if (zz.stav !== "cudzi_poskytovatel") {
      throw new Error("Len odosielanie sa zapína pri žiadosti v stave „u iného poskytovateľa“.");
    }
    if (!zz.company_id) {
      throw new Error("Žiadosť nemá firmu vo Fakteri — najprv ju priraď (firma musí mať účet).");
    }
    const { data: firma } = await db
      .from("companies")
      .select("id, dic, email")
      .eq("id", zz.company_id)
      .maybeSingle();
    if (!firma) throw new Error("Firma sa nenašla.");
    if (firma.dic && String(firma.dic).replace(/\s+/g, "") !== zz.dic) {
      throw new Error(`Firma má DIČ ${firma.dic}, žiadosť je pre ${zz.dic}.`);
    }
    const email = data.email || zz.email || firma.email;
    if (!email) throw new Error("Chýba kontaktný e-mail firmy.");

    const { vytvorOnboardingLenOdosielanie } = await import("./efaktura/len-odosielanie.server");
    const r = await vytvorOnboardingLenOdosielanie(firma.id, email, data.relationship_mode, {
      pdsZiadostId: zz.id,
      prijemPoskytovatel: zz.cudzi_poskytovatel ?? null,
      adminUserId: userId,
    });
    await db.from("platform_audit_logs").insert({
      admin_user_id: userId,
      action: "efaktura_len_odosielanie",
      entity_type: "efaktura_pds_ziadosti",
      entity_id: zz.id,
      metadata: {
        dic: zz.dic,
        nazov: zz.nazov,
        company_id: firma.id,
        relationship_mode: data.relationship_mode,
        prijem_poskytovatel: zz.cudzi_poskytovatel ?? null,
        vysledok: r.stav,
        chyba: r.chyba,
      },
    });
    return r;
  });

/** Dopyt stavu onboardingu „len odosielanie“ u ePoštáka. */
export const adminObnovOdosielanieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin((context as { userId: string }).userId);
    const { data: r } = await db
      .from("efaktura_odosielanie_ziadosti")
      .select("*")
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!r) throw new Error("Žiadosť o len odosielanie sa nenašla.");
    const m = await import("./efaktura/len-odosielanie.server");
    if (r.stav === "active") {
      if (r.epostak_firm_id) await m.aktivujLenOdosielanie(r);
      return { stav: r.stav as string };
    }
    if (!r.epostak_request_id)
      throw new Error("Žiadosť u ePoštáka ešte nevznikla — zopakuj ju tlačidlom Len odosielanie.");
    return m.obnovOnboarding(r);
  });

/** Nastaví partnerský onboarding webhook u ePoštáka (PUT). Len superadmin. */
export const adminNastavOnboardingWebhookFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ znova: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const { db, role } = await overAdmina(userId);
    if (role !== "superadmin") throw new Error("Webhook u ePoštáka smie nastaviť len superadmin.");
    const { nastavWebhookOnboardingu } = await import("./efaktura/len-odosielanie.server");
    const r = await nastavWebhookOnboardingu(data.znova);
    await db.from("platform_audit_logs").insert({
      admin_user_id: userId,
      action: "efaktura_onboarding_webhook",
      entity_type: "efaktura_epostak_nastavenie",
      entity_id: null,
      metadata: { url: r.url, udalosti: r.udalosti, znova: data.znova },
    });
    return r;
  });

/**
 * PDF „Firmy na eFaktúre“: ktoré firmy sú u nás cez eFaktúru a čo presne
 * majú — odosielanie aj prijímanie, len odosielanie, alebo či sú v procese.
 */
export const adminEfakturaPrehladPdfFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ base64: string; nazov: string }> => {
    const db = await admin((context as { userId: string }).userId);
    const [{ data: profily }, { data: pds }, { data: sendOnly }] = await Promise.all([
      db
        .from("efaktura_profiles")
        .select("company_id, peppol_participant_id, activated_at, created_at")
        .limit(5000),
      db
        .from("efaktura_pds_ziadosti")
        .select("company_id, dic, nazov, stav, peppol_id, cudzi_poskytovatel, prijate_at")
        .order("prijate_at", { ascending: false })
        .limit(5000),
      db
        .from("efaktura_odosielanie_ziadosti")
        .select("company_id, dic, stav, prijem_poskytovatel, vytvorene_at, aktivovane_at")
        .order("vytvorene_at", { ascending: false })
        .limit(5000),
    ]);
    // Posledná žiadosť každej firmy (zoznamy sú zoradené od najnovšej).
    const prva = <T extends { company_id: string | null }>(rows: T[] | null) => {
      const m = new Map<string, T>();
      for (const r of rows ?? []) if (r.company_id && !m.has(r.company_id)) m.set(r.company_id, r);
      return m;
    };
    const pdsFirmy = prva(pds as any[]);
    const sendFirmy = prva(sendOnly as any[]);
    const profilFirmy = new Map(((profily ?? []) as any[]).map((p) => [p.company_id as string, p]));
    const ids = [...new Set([...profilFirmy.keys(), ...pdsFirmy.keys(), ...sendFirmy.keys()])];

    const { data: firmy } = ids.length
      ? await db.from("companies").select("id, name, ico, dic").in("id", ids)
      : { data: [] as any[] };
    const pocet = async (tabulka: string, id: string) => {
      const { count } = await db
        .from(tabulka)
        .select("id", { count: "exact", head: true })
        .eq("company_id", id);
      return count ?? 0;
    };
    const { rozsahFirmy } = await import("./efaktura-rozsah-firiem");
    const riadky = await Promise.all(
      ((firmy ?? []) as any[]).map(async (f) => {
        const p = pdsFirmy.get(f.id) as any;
        const s = sendFirmy.get(f.id) as any;
        const prof = profilFirmy.get(f.id) as any;
        const { rozsah, poznamka } = rozsahFirmy({
          pdsStav: p?.stav ?? null,
          cudziPoskytovatel: p?.cudzi_poskytovatel ?? null,
          sendOnlyStav: s?.stav ?? null,
          prijemPoskytovatel: s?.prijem_poskytovatel ?? null,
          maProfil: Boolean(prof),
        });
        const od =
          rozsah === "len_odosielanie"
            ? (s?.aktivovane_at ?? s?.vytvorene_at ?? null)
            : (prof?.activated_at ?? p?.prijate_at ?? prof?.created_at ?? null);
        const [odoslanych, prijatych] = await Promise.all([
          pocet("efaktura_deliveries", f.id),
          pocet("efaktura_received_documents", f.id),
        ]);
        return {
          firma: f.name as string,
          ico: f.ico ?? null,
          dic: f.dic ?? p?.dic ?? s?.dic ?? null,
          peppolId: prof?.peppol_participant_id ?? p?.peppol_id ?? null,
          rozsah,
          poznamka,
          od,
          odoslanych,
          prijatych,
        };
      }),
    );
    const { prehladEfakturyPdf } = await import("./efaktura-prehlad-pdf.server");
    // Testovacie napojenia (bez výberu na portáli FS) do prehľadu nepatria.
    const pdf = await prehladEfakturyPdf(riadky.filter((r) => r.rozsah !== "bez_portalu"));
    return {
      base64: Buffer.from(pdf).toString("base64"),
      nazov: `firmy-efaktura-${new Date().toISOString().slice(0, 10)}.pdf`,
    };
  });
