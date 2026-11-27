import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Odstavka } from "@/lib/faktero/odstavky";

/*
  Admin → Odstávky inštitúcií (FAK-523). Návrhy zo sťahovania zdrojov admin
  schváli alebo zamietne, opraví text a časy, prípadne odstávku zadá ručne.
  Zápis ide cez servisný kľúč, preto každé volanie najprv overí, že volajúci
  je v `platform_admins` (rovnako ako podpora-admin.functions.ts).
  POZOR: z tohto súboru sa exportujú len createServerFn — iný export zhodí build.
*/

async function admin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Admin check failed");
  if (!data) throw new Error("Forbidden: not a platform admin");
  // Od ADMIN_2FA_POVINNE_OD len s reláciou aal2 (admin-dvojfaktor.ts).
  (await import("@/lib/faktero/admin-dvojfaktor.server")).vyzadujAal2Admina();
  // Tabuľka ešte nie je v generovaných typoch databázy.
  return supabaseAdmin as any;
}

const STLPCE =
  "id, zdroj, guid, institucia, sluzba, nazov, popis, url, zaciatok, koniec, stav, automaticky, created_at, updated_at, schvalene_at";

const ZDROJE_RUCNE = ["rucne", "fs", "upvs", "sp", "vszp", "dovera", "union"] as const;

/** Čas ako ISO reťazec (klient prepočíta datetime-local z Bratislavy). */
const cas = z
  .string()
  .max(40)
  .refine((s) => Number.isFinite(Date.parse(s)), "Neplatný dátum a čas.");

const volitelnyText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => (s ? s : null));

const odkaz = z
  .string()
  .trim()
  .max(1000)
  .nullish()
  .transform((s) => (s ? s : null))
  .refine((s) => s == null || /^https?:\/\//i.test(s), "Odkaz musí začínať http:// alebo https://.");

const obsah = z
  .object({
    institucia: z.string().trim().min(1, "Zadajte inštitúciu.").max(120),
    sluzba: volitelnyText(200),
    nazov: z.string().trim().min(1, "Zadajte názov.").max(300),
    popis: volitelnyText(4000),
    url: odkaz,
    zaciatok: cas,
    koniec: cas.nullish().transform((s) => s ?? null),
  })
  .refine((d) => d.koniec == null || Date.parse(d.koniec) >= Date.parse(d.zaciatok), {
    message: "Koniec nesmie byť pred začiatkom.",
    path: ["koniec"],
  });

type ObsahOdstavky = z.infer<typeof obsah>;

function riadokObsahu(d: ObsahOdstavky) {
  return {
    institucia: d.institucia,
    sluzba: d.sluzba,
    nazov: d.nazov,
    popis: d.popis,
    url: d.url,
    zaciatok: new Date(d.zaciatok).toISOString(),
    koniec: d.koniec ? new Date(d.koniec).toISOString() : null,
  };
}

type OdstavkaAdmin = Odstavka & {
  updated_at: string;
  schvalene_at: string | null;
};

/** Všetky stavy: návrhy hore, potom podľa začiatku zostupne, najviac 200. */
export const adminOdstavkyZoznamFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context.userId);
    const [navrhy, ostatne] = await Promise.all([
      db
        .from("odstavky_institucii")
        .select(STLPCE)
        .eq("stav", "navrh")
        .order("zaciatok", { ascending: false, nullsFirst: true })
        .limit(200),
      db
        .from("odstavky_institucii")
        .select(STLPCE)
        .neq("stav", "navrh")
        .order("zaciatok", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (navrhy.error) throw new Error(navrhy.error.message);
    if (ostatne.error) throw new Error(ostatne.error.message);
    return [...(navrhy.data ?? []), ...(ostatne.data ?? [])].slice(0, 200) as OdstavkaAdmin[];
  });

/** Schváliť alebo zamietnuť (aj vrátiť zamietnutú späť medzi schválené). */
export const adminOdstavkaStavFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), stav: z.enum(["schvalene", "zamietnute"]) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const db = await admin(context.userId);
    const teraz = new Date().toISOString();
    const { error } = await db
      .from("odstavky_institucii")
      .update({ stav: data.stav, schvalil: context.userId, schvalene_at: teraz, updated_at: teraz })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Oprava textu, časov a inštitúcie (zdroj a stav ostávajú). */
export const adminOdstavkaUpravFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), odstavka: obsah }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const db = await admin(context.userId);
    const { error } = await db
      .from("odstavky_institucii")
      .update({ ...riadokObsahu(data.odstavka), updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Ručne zadaná odstávka — rovno schválená. */
export const adminOdstavkaPridajFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ zdroj: z.enum(ZDROJE_RUCNE), odstavka: obsah }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const db = await admin(context.userId);
    const teraz = new Date().toISOString();
    const { data: riadok, error } = await db
      .from("odstavky_institucii")
      .insert({
        ...riadokObsahu(data.odstavka),
        zdroj: data.zdroj,
        stav: "schvalene",
        automaticky: false,
        schvalil: context.userId,
        schvalene_at: teraz,
        updated_at: teraz,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: riadok.id as string };
  });

export const adminOdstavkaZmazFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = await admin(context.userId);
    /*
      Oznam stiahnutý zo zdroja (má guid) by cron o hodinu založil znova —
      namiesto zmazania sa zamietne. Zmaže sa len ručne zadaný.
    */
    const { data: r } = await db.from("odstavky_institucii").select("guid").eq("id", data.id).maybeSingle();
    if (r?.guid) {
      const { error } = await db
        .from("odstavky_institucii")
        .update({ stav: "zamietnute", schvalil: context.userId, schvalene_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, zamietnute: true };
    }
    const { error } = await db.from("odstavky_institucii").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
