import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { vycistiOpravnenia } from "./opravnenia";

// randomToken() (invitations.server) vydáva 48 hex znakov. Rozsah je zámerne voľnejší, aby prípadné
// staršie tokeny neprestali fungovať, ale odfiltruje vstupy, ktoré tokenom ani
// nemôžu byť — tie sa k DB dotazu vôbec nedostanú.
const tokenSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{32,128}$/, "Neplatný formát tokenu"),
});

type InviteRole = "admin" | "accountant" | "employee" | "custom";

export const createInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { company_id: string; email: string; role: InviteRole; permissions?: unknown }) => {
    // Typ v TypeScripte za behu nič nestráži — bez tejto kontroly sa dala poslať
    // pozvánka s rolou „owner" a pozvaný by sa stal majiteľom firmy.
    if (!["admin", "accountant", "employee", "custom"].includes(d?.role as string))
      throw new Error("Neplatná rola pozvánky.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const email = data.email.trim().toLowerCase();
    // Jedna adresa — „a@x.sk, b@y.sk" by poslalo pozvánku viacerým naraz.
    if (!z.string().email().max(255).safeParse(email).success) throw new Error("Neplatný email");

    const { data: admin } = await context.supabase.rpc("is_company_admin", {
      _company_id: data.company_id,
      _user_id: context.userId,
    });
    if (!admin) throw new Error("Nemáte oprávnenie pozývať používateľov");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { vytvorPozvanku } = await import("./invitations.server");
    return vytvorPozvanku(supabaseAdmin, {
      companyId: data.company_id,
      email,
      role: data.role,
      permissions: data.permissions,
      invitedBy: context.userId,
    });
  });

export const getInvitationByTokenFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("company_invitations")
      .select("id, company_id, email, role, expires_at, accepted_at, companies(name)")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { valid: false as const };
    if (inv.accepted_at) return { valid: false as const, reason: "already_accepted" };
    if (new Date(inv.expires_at) < new Date()) return { valid: false as const, reason: "expired" };
    return {
      valid: true as const,
      email: inv.email,
      role: inv.role,
      company_id: inv.company_id,
      company_name: (inv as any).companies?.name ?? "",
    };
  });

export const acceptInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("company_invitations")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) throw new Error("Pozvánka neexistuje");
    if (inv.accepted_at) throw new Error("Pozvánka už bola využitá");
    if (new Date(inv.expires_at) < new Date()) throw new Error("Pozvánka expirovala");

    // Odkaz je len doručenie — pozvánka patrí adrese, na ktorú išla. Bez tejto
    // kontroly sa s preposlaným (alebo od kolegu odkukaným) tokenom dal pripojiť
    // ktokoľvek a existujúci člen si ním vedel prepísať vlastnú rolu.
    const { data: ja } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const mojEmail = (ja?.user?.email ?? "").trim().toLowerCase();
    if (!mojEmail || mojEmail !== String(inv.email).trim().toLowerCase())
      throw new Error("Pozvánka je pre inú e-mailovú adresu. Prihláste sa účtom, na ktorý prišla.");

    // Pozvánku si najprv zaberieme — dve súbežné prijatia ju nesmú využiť obe.
    const { data: zabrata } = await supabaseAdmin
      .from("company_invitations")
      .update({ accepted_at: new Date().toISOString(), accepted_user_id: context.userId })
      .eq("id", inv.id)
      .is("accepted_at", null)
      .select("id");
    if (!zabrata?.length) throw new Error("Pozvánka už bola využitá");

    const { error: linkErr } = await supabaseAdmin
      .from("company_users")
      // Kto už vo firme je, tomu pozvánka rolu nemení — majiteľa by inak
      // prijatie pozvánky „používateľa" potichu zosadilo.
      .upsert(
        {
          company_id: inv.company_id,
          user_id: context.userId,
          role: inv.role,
          permissions: (inv as any).permissions ?? {},
        },
        { onConflict: "company_id,user_id", ignoreDuplicates: true },
      );
    if (linkErr) {
      await supabaseAdmin
        .from("company_invitations")
        .update({ accepted_at: null, accepted_user_id: null })
        .eq("id", inv.id);
      throw linkErr;
    }

    return { ok: true, company_id: inv.company_id };
  });

export const listInvitationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { company_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("company_invitations")
      .select("id, email, role, permissions, accepted_at, expires_at, created_at")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(50);
    return rows ?? [];
  });

export const revokeInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("company_invitations").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- členovia firmy ---------- */

type RolaClena = "owner" | "admin" | "accountant" | "employee" | "custom";

/** Rola volajúceho vo firme (filtrované na seba — RLS na company_users pustí celú firmu). */
async function mojaRola(context: any, companyId: string): Promise<string | null> {
  const { data } = await context.supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", context.userId)
    .maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

/** Rola člena, s ktorým sa niečo robí. */
async function rolaClena(admin: any, companyId: string, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

const ROLY_CLENA = ["owner", "admin", "accountant", "employee", "custom"];

/** Kto v tejto firme rozhoduje o prístupoch. */
async function overAdmina(context: any, companyId: string) {
  const { data: admin } = await context.supabase.rpc("is_company_admin", {
    _company_id: companyId,
    _user_id: context.userId,
  });
  if (!admin) throw new Error("Na správu prístupov nemáte oprávnenie.");
}

/**
 * Členovia firmy aj s e-mailom.
 *
 * E-maily sú v `profiles`, kam RLS pustí každého len k sebe — preto sa čítajú
 * servisným kľúčom až po overení, že pýtajúci je v tejto firme admin.
 */
export const listMembersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { company_id: string }) => d)
  .handler(async ({ data, context }) => {
    await overAdmina(context, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: clenovia, error } = await supabaseAdmin
      .from("company_users")
      .select(
        "user_id, role, permissions, created_at, cislo_zamestnanca, telefon, predvolena_zakazka_id, podpora_pristup_id",
      )
      .eq("company_id", data.company_id)
      .order("created_at");
    if (error) throw error;

    // Názvy predvolených zákaziek a do kedy má prístup technická podpora.
    const jobIds = [
      ...new Set((clenovia ?? []).map((c: any) => c.predvolena_zakazka_id).filter(Boolean)),
    ] as string[];
    const podporaIds = [
      ...new Set((clenovia ?? []).map((c: any) => c.podpora_pristup_id).filter(Boolean)),
    ] as string[];
    const [{ data: zakazky }, { data: podpora }] = await Promise.all([
      jobIds.length
        ? supabaseAdmin
            .from("jobs")
            .select("id, job_number, name")
            .eq("company_id", data.company_id)
            .in("id", jobIds)
        : Promise.resolve({ data: [] as any[] }),
      podporaIds.length
        ? supabaseAdmin
            .from("podpora_pristupy")
            .select("id, platne_do, rozsah")
            .eq("company_id", data.company_id)
            .in("id", podporaIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const zakazka = new Map((zakazky ?? []).map((j: any) => [j.id, j]));
    const pristup = new Map((podpora ?? []).map((p: any) => [p.id, p]));

    const ids = (clenovia ?? []).map((c) => c.user_id as string);
    const { data: profily } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", ids)
      : { data: [] as any[] };
    const podlaId = new Map((profily ?? []).map((p: any) => [p.id, p]));

    return (clenovia ?? []).map((c: any) => ({
      user_id: c.user_id as string,
      role: c.role as RolaClena,
      permissions: (c.permissions ?? {}) as Record<string, string>,
      created_at: c.created_at as string,
      email: podlaId.get(c.user_id)?.email ?? null,
      full_name: podlaId.get(c.user_id)?.full_name ?? null,
      je_to_ja: c.user_id === context.userId,
      cislo_zamestnanca: (c.cislo_zamestnanca ?? null) as string | null,
      telefon: (c.telefon ?? null) as string | null,
      predvolena_zakazka_id: (c.predvolena_zakazka_id ?? null) as string | null,
      zakazka_nazov: c.predvolena_zakazka_id
        ? ([zakazka.get(c.predvolena_zakazka_id)?.job_number, zakazka.get(c.predvolena_zakazka_id)?.name]
            .filter(Boolean)
            .join(" · ") || null)
        : null,
      /** Technická podpora Faktero s dočasným prístupom — do kedy. */
      podpora_do: c.podpora_pristup_id
        ? ((pristup.get(c.podpora_pristup_id)?.platne_do ?? null) as string | null)
        : null,
      podpora_pristup_id: (c.podpora_pristup_id ?? null) as string | null,
    }));
  });

/** Id prístupu, ak je člen technická podpora s dočasným prístupom. */
async function jePodpora(admin: any, companyId: string, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("company_users")
    .select("podpora_pristup_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.podpora_pristup_id as string | null) ?? null;
}

/**
 * Číslo zamestnanca, telefón a predvolená zákazka člena. Predvolenú zákazku
 * dostane každý jeho nový bloček a prijatá faktúra, kým ju na doklade
 * nezmení (dopĺňa ju spúšťač v databáze).
 */
export const upravUdajeClenaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        user_id: z.string().uuid(),
        cislo_zamestnanca: z.string().trim().max(40).nullable(),
        telefon: z.string().trim().max(40).nullable(),
        predvolena_zakazka_id: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await overAdmina(context, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (await jePodpora(supabaseAdmin, data.company_id, data.user_id))
      throw new Error("Technickej podpore sa údaje nevypĺňajú.");
    if (data.predvolena_zakazka_id) {
      // Zákazka musí byť z tej istej firmy — inak by sa doklady pripájali k cudzej.
      const { data: z0 } = await supabaseAdmin
        .from("jobs")
        .select("id")
        .eq("id", data.predvolena_zakazka_id)
        .eq("company_id", data.company_id)
        .maybeSingle();
      if (!z0) throw new Error("Zákazka sa nenašla.");
    }
    const { data: r, error } = await supabaseAdmin
      .from("company_users")
      .update({
        cislo_zamestnanca: data.cislo_zamestnanca || null,
        telefon: data.telefon || null,
        predvolena_zakazka_id: data.predvolena_zakazka_id,
      })
      .eq("company_id", data.company_id)
      .eq("user_id", data.user_id)
      .select("user_id");
    if (error) throw error;
    if (!r?.length) throw new Error("Používateľ sa nenašiel.");
    return { ok: true };
  });

/** Koľko majiteľov firme ostane, keď tomuto členovi rolu vezmeme. */
async function poslednyMajitel(admin: any, companyId: string, userId: string) {
  const { data: majitelia } = await admin
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("role", "owner");
  const zoznam = (majitelia ?? []).map((m: any) => m.user_id as string);
  return zoznam.length <= 1 && zoznam.includes(userId);
}

export const changeMemberRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { company_id: string; user_id: string; role: RolaClena; permissions?: unknown }) => d,
  )
  .handler(async ({ data, context }) => {
    await overAdmina(context, data.company_id);
    if (!ROLY_CLENA.includes(data.role)) throw new Error("Neplatná rola.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (await jePodpora(supabaseAdmin, data.company_id, data.user_id))
      throw new Error("Rozsah technickej podpory sa nemení — odoberte jej prístup a udeľte nový.");
    /*
      Majiteľa smie meniť a rolu majiteľa udeliť len majiteľ. Admin by si inak
      vedel sám pridať rolu majiteľa alebo zosadiť skutočného majiteľa (prevzatie firmy).
    */
    if ((await mojaRola(context, data.company_id)) !== "owner") {
      if (data.role === "owner") throw new Error("Rolu majiteľa môže udeliť len majiteľ.");
      if ((await rolaClena(supabaseAdmin, data.company_id, data.user_id)) === "owner")
        throw new Error("Rolu majiteľa môže zmeniť len majiteľ.");
    }
    // Firma bez majiteľa by ostala bez toho, kto ju vie zrušiť alebo platiť.
    if (
      data.role !== "owner" &&
      (await poslednyMajitel(supabaseAdmin, data.company_id, data.user_id))
    )
      throw new Error("Firma musí mať aspoň jedného majiteľa.");
    const { error } = await supabaseAdmin
      .from("company_users")
      .update({
        role: data.role,
        permissions: data.role === "custom" ? vycistiOpravnenia(data.permissions) : {},
      })
      .eq("company_id", data.company_id)
      .eq("user_id", data.user_id);
    if (error) throw error;
    return { ok: true };
  });

export const removeMemberFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { company_id: string; user_id: string }) => d)
  .handler(async ({ data, context }) => {
    await overAdmina(context, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (
      (await mojaRola(context, data.company_id)) !== "owner" &&
      (await rolaClena(supabaseAdmin, data.company_id, data.user_id)) === "owner"
    )
      throw new Error("Majiteľa môže z firmy odobrať len majiteľ.");
    if (await poslednyMajitel(supabaseAdmin, data.company_id, data.user_id))
      throw new Error("Posledného majiteľa firmy odobrať nemožno.");
    // Technická podpora: odobratie sa zapíše aj do histórie jej prístupov.
    const podpora = await jePodpora(supabaseAdmin, data.company_id, data.user_id);
    if (podpora) {
      const { odoberPristup } = await import("./podpora-pristup.server");
      await odoberPristup(supabaseAdmin, {
        companyId: data.company_id,
        id: podpora,
        userId: context.userId,
      });
      return { ok: true };
    }
    const { error } = await supabaseAdmin
      .from("company_users")
      .delete()
      .eq("company_id", data.company_id)
      .eq("user_id", data.user_id);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Mená členov firmy pre zobrazenie „kto to zapísal".
 *
 * Oproti `listMembersFn` to nie je správa prístupov, len menovka — stačí byť
 * členom firmy. E-maily aj mená sú v `profiles`, kam RLS pustí každého len
 * k sebe, preto sa čítajú servisným kľúčom až po overení členstva.
 */
export const menaClenovFirmy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { company_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: som } = await supabase
      .from("company_users")
      .select("user_id")
      .eq("company_id", data.company_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!som) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: clenovia } = await supabaseAdmin
      .from("company_users")
      .select("user_id")
      .eq("company_id", data.company_id);

    const ids = (clenovia ?? []).map((c: any) => c.user_id as string);
    if (!ids.length) return {} as Record<string, string>;

    const { data: profily } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);

    const mapa: Record<string, string> = {};
    for (const p of profily ?? []) {
      mapa[(p as any).id] = ((p as any).full_name || (p as any).email || "").trim() || "Neznámy";
    }
    return mapa;
  });
