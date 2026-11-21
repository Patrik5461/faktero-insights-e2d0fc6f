/**
 * Partnerský program pre účtovníkov — serverové funkcie.
 *
 * Tabuľky `partneri_uctovnici`, `partner_firmy`, `partner_provizie` čítajú
 * cez RLS len vlastník a platform admin; zapisuje sa iba tu, servisným
 * kľúčom, po kontrole. Priradenie podľa členstva a vznik provízie robia
 * spúšťače v databáze (migrácia `partnersky_program_uctovnikov`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StavPartnera, StavProvizie, ZdrojPriradenia } from "@/lib/faktero/partner-program";

export type PartnerUctovnik = {
  id: string;
  user_id: string;
  nazov: string;
  ico: string | null;
  kontakt_meno: string | null;
  email: string;
  telefon: string | null;
  web: string | null;
  iban: string | null;
  pocet_klientov: string | null;
  poznamka: string | null;
  kod: string | null;
  provizia_pct: number;
  stav: StavPartnera;
  poznamka_admin: string | null;
  schvalene_at: string | null;
  created_at: string;
};

export type FirmaPartnera = {
  company_id: string;
  nazov: string;
  ico: string | null;
  zdroj: ZdrojPriradenia;
  od: string;
  plan: string | null;
  stav_predplatneho: string | null;
  zadarmo: boolean;
};

export type ProviziaPartnera = {
  id: string;
  company_id: string | null;
  firma: string | null;
  zaklad_cents: number;
  provizia_pct: number;
  provizia_cents: number;
  mena: string;
  zaplatene_at: string;
  stav: StavProvizie;
  vyplatene_at: string | null;
};

const STLPCE_PARTNERA =
  "id, user_id, nazov, ico, kontakt_meno, email, telefon, web, iban, pocet_klientov, poznamka, kod, provizia_pct, stav, poznamka_admin, schvalene_at, created_at";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertPlatformAdmin(userId: string, lenSuperadmin = false) {
  const sb = await admin();
  const { data } = await sb
    .from("platform_admins" as any)
    .select("user_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
  if (lenSuperadmin && (data as any).role !== "superadmin")
    throw new Error("Túto akciu smie urobiť len superadmin.");
  (await import("@/lib/faktero/admin-dvojfaktor.server")).vyzadujAal2Admina();
  return sb;
}

/** Provízie staršie ako 30 dní prepne z `caka` na `na_vyplatu` (bez cronu, pri čítaní). */
async function posunCakajuce(sb: any, partnerId?: string) {
  const { DNI_CAKANIA_PROVIZIE } = await import("@/lib/faktero/partner-program");
  const hranica = new Date(Date.now() - DNI_CAKANIA_PROVIZIE * 864e5).toISOString();
  let q = sb
    .from("partner_provizie")
    .update({ stav: "na_vyplatu" })
    .eq("stav", "caka")
    .lte("zaplatene_at", hranica);
  if (partnerId) q = q.eq("partner_id", partnerId);
  await q;
}

async function firmyPartnera(sb: any, partnerId: string): Promise<FirmaPartnera[]> {
  const { data: pf } = await sb
    .from("partner_firmy")
    .select("company_id, zdroj, created_at, company:companies(name, ico)")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .range(0, 4999);
  const ids = (pf ?? []).map((r: any) => r.company_id);
  const predplatne = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data: sub } = await sb
      .from("subscriptions")
      .select("company_id, plan, status, free_forever")
      .in("company_id", ids.slice(i, i + 500));
    for (const s of sub ?? []) predplatne.set(s.company_id, s);
  }
  return (pf ?? []).map((r: any) => {
    const s = predplatne.get(r.company_id);
    return {
      company_id: r.company_id,
      nazov: r.company?.name ?? "—",
      ico: r.company?.ico ?? null,
      zdroj: r.zdroj,
      od: r.created_at,
      plan: s?.plan ?? null,
      stav_predplatneho: s?.status ?? null,
      zadarmo: Boolean(s?.free_forever),
    };
  });
}

async function proviziePartnera(sb: any, partnerId: string): Promise<ProviziaPartnera[]> {
  const { data } = await sb
    .from("partner_provizie")
    .select(
      "id, company_id, zaklad_cents, provizia_pct, provizia_cents, mena, zaplatene_at, stav, vyplatene_at, company:companies(name)",
    )
    .eq("partner_id", partnerId)
    .order("zaplatene_at", { ascending: false })
    .range(0, 4999);
  return (data ?? []).map((p: any) => ({
    id: p.id,
    company_id: p.company_id,
    firma: p.company?.name ?? null,
    zaklad_cents: p.zaklad_cents,
    provizia_pct: Number(p.provizia_pct),
    provizia_cents: p.provizia_cents,
    mena: p.mena,
    zaplatene_at: p.zaplatene_at,
    stav: p.stav,
    vyplatene_at: p.vyplatene_at,
  }));
}

/* ───────────────────────── Účtovník ───────────────────────── */

/** Môj stav v programe: žiadny záznam, žiadosť, alebo aktívny s firmami a províziami. */
export const mojPartnerskyProgramFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      partner: PartnerUctovnik | null;
      firmy: FirmaPartnera[];
      provizie: ProviziaPartnera[];
    }> => {
      const sb = await admin();
      const { data } = await sb
        .from("partneri_uctovnici" as any)
        .select(STLPCE_PARTNERA)
        .eq("user_id", context.userId)
        .maybeSingle();
      const partner = (data as unknown as PartnerUctovnik) ?? null;
      if (!partner || partner.stav === "ziadost" || partner.stav === "zamietnuty")
        return { partner, firmy: [], provizie: [] };
      await posunCakajuce(sb, partner.id);
      const [firmy, provizie] = await Promise.all([
        firmyPartnera(sb, partner.id),
        proviziePartnera(sb, partner.id),
      ]);
      return { partner, firmy, provizie };
    },
  );

const PrihlaskaInput = z.object({
  nazov: z.string().trim().min(2).max(200),
  ico: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable()
    .transform((v) => v || null),
  kontakt_meno: z.string().trim().max(200).optional().nullable(),
  telefon: z.string().trim().max(50).optional().nullable(),
  web: z.string().trim().max(300).optional().nullable(),
  iban: z.string().trim().max(50).optional().nullable(),
  pocet_klientov: z.string().trim().max(50).optional().nullable(),
  poznamka: z.string().trim().max(2000).optional().nullable(),
});

/** Prihláška do programu (alebo jej úprava, kým nie je schválená; IBAN aj potom). */
export const prihlasitDoPartnerskehoProgramuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PrihlaskaInput.parse(d))
  .handler(async ({ context, data }) => {
    const { normalizujIban, jePlatnyIban } = await import("@/lib/faktero/partner-program");
    const iban = normalizujIban(data.iban);
    if (iban && !jePlatnyIban(iban)) throw new Error("IBAN nie je platný — skontrolujte ho.");
    const sb = await admin();
    const email = String((context.claims as any)?.email ?? "").trim();
    if (!email) throw new Error("Účet nemá e-mail.");
    const { data: existujuci } = await sb
      .from("partneri_uctovnici" as any)
      .select("id, stav")
      .eq("user_id", context.userId)
      .maybeSingle();
    const ex = existujuci as { id: string; stav: StavPartnera } | null;

    if (ex && ex.stav !== "ziadost") {
      // Schválený partner si mení už len kontakt a IBAN — názov a IČO strážia výplaty.
      const { error } = await sb
        .from("partneri_uctovnici" as any)
        .update({
          kontakt_meno: data.kontakt_meno || null,
          telefon: data.telefon || null,
          web: data.web || null,
          iban,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ex.id);
      if (error) throw new Error(error.message);
      return { ok: true, nova: false };
    }

    const riadok = {
      user_id: context.userId,
      nazov: data.nazov,
      ico: data.ico,
      kontakt_meno: data.kontakt_meno || null,
      email,
      telefon: data.telefon || null,
      web: data.web || null,
      iban,
      pocet_klientov: data.pocet_klientov || null,
      poznamka: data.poznamka || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = ex
      ? await sb
          .from("partneri_uctovnici" as any)
          .update(riadok)
          .eq("id", ex.id)
      : await sb.from("partneri_uctovnici" as any).insert(riadok);
    if (error) throw new Error(error.message);

    if (!ex) {
      try {
        const { upozorniAdminovTelegram } = await import("@/lib/faktero/telegram.server");
        await upozorniAdminovTelegram({
          text: `Nová prihláška do partnerského programu: ${data.nazov}${data.ico ? ` (IČO ${data.ico})` : ""}, klientov: ${data.pocet_klientov || "neuvedené"}. Schváliť v Admin → Partnerský program.`,
        });
      } catch (e: any) {
        console.error("[partner] upozornenie admina zlyhalo:", e?.message ?? e);
      }
    }
    return { ok: true, nova: !ex };
  });

/**
 * Firma založená po registrácii cez odkaz partnera. Volá sa hneď po
 * `create_company_with_owner`; priradí len firmu, kde je volajúci majiteľ,
 * len aktívnemu partnerovi a len ak firma ešte partnera nemá.
 */
export const priradPartneraFirmeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid(), kod: z.string().trim().max(20) }).parse(d),
  )
  .handler(async ({ context, data }): Promise<{ priradene: boolean }> => {
    const { normalizujKodPartnera } = await import("@/lib/faktero/partner-program");
    const kod = normalizujKodPartnera(data.kod);
    if (!kod) return { priradene: false };
    const sb = await admin();
    const { data: clen } = await sb
      .from("company_users")
      .select("role")
      .eq("company_id", data.companyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!clen || clen.role !== "owner") return { priradene: false };
    const { data: partner } = await sb
      .from("partneri_uctovnici" as any)
      .select("id, user_id")
      .eq("kod", kod)
      .eq("stav", "aktivny")
      .maybeSingle();
    const p = partner as { id: string; user_id: string } | null;
    // Vlastnú firmu si partner cez svoj odkaz nepriradí (tú drží členstvo).
    if (!p || p.user_id === context.userId) return { priradene: false };
    const { error } = await sb
      .from("partner_firmy" as any)
      .insert({ company_id: data.companyId, partner_id: p.id, zdroj: "odkaz" });
    // 23505 = firma už partnera má (prvý vyhráva).
    if (error && (error as any).code !== "23505") throw new Error(error.message);
    return { priradene: !error };
  });

/** Nový, ešte nepoužitý kód partnera. */
async function volnyKod(sb: any): Promise<string> {
  const { novyKodPartnera } = await import("@/lib/faktero/partner-program");
  const { randomBytes } = await import("node:crypto");
  for (let pokus = 0; pokus < 10; pokus++) {
    const kod = novyKodPartnera(new Uint8Array(randomBytes(6)));
    const { count } = await sb
      .from("partneri_uctovnici")
      .select("id", { count: "exact", head: true })
      .eq("kod", kod);
    if (!count) return kod;
  }
  throw new Error("Nepodarilo sa vytvoriť kód partnera, skúste znova.");
}

/** Priradí partnerovi firmy, v ktorých už je členom (spúšťač chytá len nové členstvá). */
async function priradClenstva(sb: any, partnerId: string, userId: string): Promise<number> {
  const { data: clenstva } = await sb
    .from("company_users")
    .select("company_id, company:companies(testovacia_pre)")
    .eq("user_id", userId)
    .range(0, 4999);
  const riadky = (clenstva ?? [])
    .filter((c: any) => !c.company?.testovacia_pre)
    .map((c: any) => ({ company_id: c.company_id, partner_id: partnerId, zdroj: "clen" }));
  if (!riadky.length) return 0;
  const { data: vlozene } = await sb
    .from("partner_firmy")
    .upsert(riadky, { onConflict: "company_id", ignoreDuplicates: true })
    .select("company_id");
  return vlozene?.length ?? 0;
}

/* ───────────────────────── Admin ───────────────────────── */

export type PartnerVAdmine = PartnerUctovnik & {
  firiem: number;
  platiacich: number;
  naVyplatuCents: number;
  vyplateneCents: number;
};

export const zoznamPartnerovUctovnikovFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PartnerVAdmine[]> => {
    const sb = await assertPlatformAdmin(context.userId);
    await posunCakajuce(sb);
    const { data } = await sb
      .from("partneri_uctovnici" as any)
      .select(STLPCE_PARTNERA)
      .order("created_at", { ascending: false });
    const partneri = (data ?? []) as unknown as PartnerUctovnik[];
    const out: PartnerVAdmine[] = [];
    for (const p of partneri) {
      const firmy = p.stav === "ziadost" ? [] : await firmyPartnera(sb, p.id);
      const { data: prov } = await sb
        .from("partner_provizie" as any)
        .select("stav, provizia_cents")
        .eq("partner_id", p.id)
        .in("stav", ["na_vyplatu", "vyplatene"])
        .range(0, 9999);
      let naVyplatuCents = 0;
      let vyplateneCents = 0;
      for (const r of (prov ?? []) as any[]) {
        if (r.stav === "na_vyplatu") naVyplatuCents += r.provizia_cents;
        else vyplateneCents += r.provizia_cents;
      }
      out.push({
        ...p,
        provizia_pct: Number(p.provizia_pct),
        firiem: firmy.length,
        platiacich: firmy.filter((f) => f.stav_predplatneho === "active" && !f.zadarmo).length,
        naVyplatuCents,
        vyplateneCents,
      });
    }
    return out;
  });

export const detailPartneraUctovnikaFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = await assertPlatformAdmin(context.userId);
    await posunCakajuce(sb, data.id);
    const [firmy, provizie] = await Promise.all([
      firmyPartnera(sb, data.id),
      proviziePartnera(sb, data.id),
    ]);
    return { firmy, provizie };
  });

/**
 * Schválenie, pozastavenie, zamietnutie a zmena provízie. Pri prvom
 * schválení dostane partner kód a priradia sa mu firmy, kde už je členom
 * (spúšťač chytá len nové členstvá).
 */
export const upravPartneraUctovnikaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        stav: z.enum(["ziadost", "aktivny", "pozastaveny", "zamietnuty"]).optional(),
        provizia_pct: z.number().min(0).max(100).optional(),
        poznamka_admin: z.string().trim().max(2000).optional().nullable(),
        priraditClenstva: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = await assertPlatformAdmin(context.userId, true);
    const { data: p } = await sb
      .from("partneri_uctovnici" as any)
      .select("id, user_id, kod, stav, schvalene_at")
      .eq("id", data.id)
      .maybeSingle();
    const partner = p as {
      id: string;
      user_id: string;
      kod: string | null;
      schvalene_at: string | null;
    } | null;
    if (!partner) throw new Error("Partner neexistuje.");

    const zmena: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.stav) zmena.stav = data.stav;
    if (data.provizia_pct != null) zmena.provizia_pct = data.provizia_pct;
    if (data.poznamka_admin !== undefined) zmena.poznamka_admin = data.poznamka_admin || null;
    if (data.stav === "aktivny" && !partner.schvalene_at)
      zmena.schvalene_at = new Date().toISOString();

    if (data.stav === "aktivny" && !partner.kod) zmena.kod = await volnyKod(sb);

    const { error } = await sb
      .from("partneri_uctovnici" as any)
      .update(zmena)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const priradenych =
      data.stav === "aktivny" && data.priraditClenstva !== false
        ? await priradClenstva(sb, data.id, partner.user_id)
        : 0;

    await sb.from("platform_audit_logs" as any).insert({
      admin_user_id: context.userId,
      action: "partner_uprava",
      entity_type: "partner_uctovnik",
      entity_id: data.id,
      metadata: { ...zmena, priradenych },
    });
    return { ok: true, priradenych };
  });

/** Ručné priradenie / odobratie firmy partnerovi (admin). */
export const priradFirmuPartneroviAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid(), partnerId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = await assertPlatformAdmin(context.userId, true);
    if (!data.partnerId) {
      await sb
        .from("partner_firmy" as any)
        .delete()
        .eq("company_id", data.companyId);
    } else {
      const { error } = await sb
        .from("partner_firmy" as any)
        .upsert(
          { company_id: data.companyId, partner_id: data.partnerId, zdroj: "admin" },
          { onConflict: "company_id" },
        );
      if (error) throw new Error(error.message);
    }
    await sb.from("platform_audit_logs" as any).insert({
      admin_user_id: context.userId,
      action: "partner_firma",
      entity_type: "company",
      entity_id: data.companyId,
      metadata: { partner_id: data.partnerId },
    });
    return { ok: true };
  });

/** Označí provízie na výplatu ako vyplatené (po bankovom prevode). */
export const oznacProvizieVyplateneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ partnerId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = await assertPlatformAdmin(context.userId, true);
    // Bez posunu čakajúcich: označí sa presne to, čo admin videl „na výplatu“ pri načítaní.
    const { data: zmenene, error } = await sb
      .from("partner_provizie" as any)
      .update({ stav: "vyplatene", vyplatene_at: new Date().toISOString() })
      .eq("partner_id", data.partnerId)
      .eq("stav", "na_vyplatu")
      .select("provizia_cents");
    if (error) throw new Error(error.message);
    const sumaCents = (zmenene ?? []).reduce((s: number, r: any) => s + r.provizia_cents, 0);
    await sb.from("platform_audit_logs" as any).insert({
      admin_user_id: context.userId,
      action: "partner_vyplata",
      entity_type: "partner_uctovnik",
      entity_id: data.partnerId,
      metadata: { pocet: zmenene?.length ?? 0, suma_cents: sumaCents },
    });
    return { pocet: zmenene?.length ?? 0, sumaCents };
  });

/**
 * Účet podľa e-mailu pre ručné pridanie partnera: existuje? je už partner?
 * a jeho firmy (na predvyplnenie názvu a IČO kancelárie).
 */
export const najdiUcetPrePartneraFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().email().max(255) }).parse(d))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      existuje: boolean;
      uzPartner: boolean;
      meno: string | null;
      firmy: { nazov: string; ico: string | null; rola: string }[];
    }> => {
      const sb = await assertPlatformAdmin(context.userId);
      const { data: uid } = await sb.rpc("pouzivatel_podla_emailu" as any, {
        p_email: data.email.toLowerCase(),
      });
      const userId = (uid as unknown as string | null) ?? null;
      if (!userId) return { existuje: false, uzPartner: false, meno: null, firmy: [] };
      const [{ data: partner }, { data: clenstva }, { data: profil }] = await Promise.all([
        sb
          .from("partneri_uctovnici" as any)
          .select("id")
          .eq("user_id", userId)
          .maybeSingle(),
        sb
          .from("company_users")
          .select("role, company:companies(name, ico, testovacia_pre)")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .range(0, 49),
        sb
          .from("profiles" as any)
          .select("full_name")
          .eq("id", userId)
          .maybeSingle(),
      ]);
      return {
        existuje: true,
        uzPartner: Boolean(partner),
        meno: ((profil as any)?.full_name as string | null) ?? null,
        firmy: (clenstva ?? [])
          .filter((c: any) => c.company && !c.company.testovacia_pre)
          .map((c: any) => ({ nazov: c.company.name, ico: c.company.ico ?? null, rola: c.role })),
      };
    },
  );

/**
 * Ručné pridanie partnera adminom — účet musí existovať (registrácia). Partner
 * môže byť rovno aktívny (dostane kód a priradia sa mu firmy, kde je členom).
 */
export const pridajPartneraAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        nazov: z.string().trim().min(2).max(200),
        ico: z.string().trim().max(20).optional().nullable(),
        kontakt_meno: z.string().trim().max(200).optional().nullable(),
        telefon: z.string().trim().max(50).optional().nullable(),
        iban: z.string().trim().max(50).optional().nullable(),
        provizia_pct: z.number().min(0).max(100).default(20),
        poznamka_admin: z.string().trim().max(2000).optional().nullable(),
        aktivovat: z.boolean().default(true),
        priraditClenstva: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = await assertPlatformAdmin(context.userId, true);
    const { normalizujIban, jePlatnyIban } = await import("@/lib/faktero/partner-program");
    const iban = normalizujIban(data.iban);
    if (iban && !jePlatnyIban(iban)) throw new Error("IBAN nie je platný — skontrolujte ho.");
    const email = data.email.toLowerCase();
    const { data: uid } = await sb.rpc("pouzivatel_podla_emailu" as any, { p_email: email });
    const userId = (uid as unknown as string | null) ?? null;
    if (!userId)
      throw new Error(
        "Účet s týmto e-mailom vo Fakteri neexistuje. Nech sa najprv zaregistruje (môže zvoliť „Účtovník alebo kancelária“).",
      );
    const { data: ex } = await sb
      .from("partneri_uctovnici" as any)
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (ex) throw new Error("Tento účet už v partnerskom programe je — nájdete ho v zozname.");

    const teraz = new Date().toISOString();
    const riadok: Record<string, unknown> = {
      user_id: userId,
      nazov: data.nazov,
      ico: data.ico || null,
      kontakt_meno: data.kontakt_meno || null,
      email,
      telefon: data.telefon || null,
      iban,
      provizia_pct: data.provizia_pct,
      poznamka_admin: data.poznamka_admin || null,
      stav: data.aktivovat ? "aktivny" : "ziadost",
      updated_at: teraz,
    };
    if (data.aktivovat) {
      riadok.kod = await volnyKod(sb);
      riadok.schvalene_at = teraz;
    }
    const { data: vlozeny, error } = await sb
      .from("partneri_uctovnici" as any)
      .insert(riadok)
      .select("id, kod")
      .single();
    if (error) throw new Error(error.message);
    const id = (vlozeny as any).id as string;
    const priradenych =
      data.aktivovat && data.priraditClenstva ? await priradClenstva(sb, id, userId) : 0;

    await sb.from("platform_audit_logs" as any).insert({
      admin_user_id: context.userId,
      action: "partner_pridany_adminom",
      entity_type: "partner_uctovnik",
      entity_id: id,
      metadata: { email, aktivovat: data.aktivovat, provizia_pct: data.provizia_pct, priradenych },
    });
    return { id, kod: ((vlozeny as any).kod as string | null) ?? null, priradenych };
  });
