import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Zásahy do registrovaných účtov z administrácie.
 *
 * Doteraz sa dali spravovať firmy a predplatné, ale so samotným účtom sa nedalo
 * spraviť nič — na požiadanie o zmazanie sa čakalo štrnásť dní na plánovanú
 * úlohu a účet, ktorý sa mal prestať prihlasovať, sa zastaviť nedal vôbec.
 *
 * Tri veci, ktoré tu pribudli, sa vedome líšia mierou nezvratnosti:
 *
 * - **Zákaz prihlásenia** je vypínač. Dáta ostávajú, človek sa len nedostane
 *   dnu, a zapnúť sa to dá naspäť jedným ťuknutím.
 * - **Predplatné** sa mení tam, kde vzniklo — cez firmu, nie cez človeka;
 *   funkcie na to už existujú v `admin.functions.ts`.
 * - **Zmazanie účtu** je nezvratné a robí presne to, čo samoobslužné zrušenie
 *   (`zrusUcet`): zmaže firmy, kde bol človek jediným členom, aj s prílohami.
 *   Preto ho smie spustiť len superadmin a musí prepísať e-mail účtu.
 */

async function getAdmin(context: { userId: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw new Error("Overenie administrátora zlyhalo.");
  if (!data) throw new Error("Prístup zamietnutý: nie ste administrátor platformy.");
  return { supabaseAdmin, role: data.role as "admin" | "superadmin" };
}

async function logAudit(
  supabaseAdmin: any,
  adminUserId: string,
  action: string,
  entityId: string | null,
  metadata: Record<string, any> = {},
) {
  await supabaseAdmin.from("platform_audit_logs").insert({
    admin_user_id: adminUserId,
    action,
    entity_type: "user",
    entity_id: entityId,
    metadata,
  });
}

/** Zákaz prihlásenia nastavujeme na sto rokov — GoTrue nepozná „navždy". */
const NAVZDY = "876000h";

/**
 * Detail jedného účtu: stav prihlásenia, firmy s predplatným a to, čo by
 * zmazanie zobralo so sebou.
 */
export const adminDetailUctu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin, role } = await getAdmin(context);

    const { data: profil } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, created_at, updated_at, deletion_scheduled_for")
      .eq("id", data.userId)
      .maybeSingle();
    if (!profil) throw new Error("Taký účet neexistuje.");

    const { data: stavy } = await (supabaseAdmin as any).rpc("faktero_stav_prihlaseni", {
      _ids: [data.userId],
    });
    const stav = (stavy ?? [])[0] ?? {};

    const { data: clenstva } = await supabaseAdmin
      .from("company_users")
      .select("company_id, role, companies(id, name, ico, suspended_at)")
      .eq("user_id", data.userId);

    const idFiriem = (clenstva ?? []).map((m: any) => m.company_id);
    const [{ data: predplatne }, { data: vsetciClenovia }] = await Promise.all([
      idFiriem.length
        ? supabaseAdmin
            .from("subscriptions")
            .select(
              "company_id, plan, status, trial_ends_at, current_period_end, cancel_at_period_end, monthly_price_cents",
            )
            .in("company_id", idFiriem)
        : Promise.resolve({ data: [] as any[] }),
      idFiriem.length
        ? supabaseAdmin
            .from("company_users")
            .select("company_id, user_id")
            .in("company_id", idFiriem)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // Koľko ľudí má firma celkom — podľa toho sa pozná, čo by zmazanie účtu
    // zmazalo aj s dokladmi a čo by len osirelo o jedného člena.
    const pocty = new Map<string, Set<string>>();
    for (const c of (vsetciClenovia as any[]) ?? []) {
      const s = pocty.get(c.company_id) ?? new Set<string>();
      s.add(c.user_id);
      pocty.set(c.company_id, s);
    }
    const predplatneMapa = new Map(((predplatne as any[]) ?? []).map((s) => [s.company_id, s]));

    const firmy = ((clenstva as any[]) ?? []).map((m) => ({
      id: m.companies?.id ?? m.company_id,
      name: m.companies?.name ?? "—",
      ico: m.companies?.ico ?? null,
      suspended_at: m.companies?.suspended_at ?? null,
      rola: m.role,
      clenov: pocty.get(m.company_id)?.size ?? 1,
      /** Pri zmazaní účtu zanikne celá firma aj s dokladmi. */
      zanikneSUctom: (pocty.get(m.company_id)?.size ?? 1) <= 1,
      predplatne: predplatneMapa.get(m.company_id) ?? null,
    }));

    return {
      profil,
      // `banned_until` v ďalekej budúcnosti = prihlásenie je zakázané.
      zakazane: !!stav.banned_until && new Date(stav.banned_until) > new Date(),
      banned_until: stav.banned_until ?? null,
      posledne_prihlasenie: stav.last_sign_in_at ?? null,
      email_potvrdeny: !!stav.email_confirmed_at,
      firmy,
      mozeMazat: role === "superadmin",
      jeAdmin: await jeAdminUcet(supabaseAdmin, data.userId),
    };
  });

async function jeAdminUcet(supabaseAdmin: any, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/** Zakáže alebo povolí prihlásenie. Dáta sa nemenia, len sa nedá dnu. */
export const adminZakazPrihlasenie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        zakazat: z.boolean(),
        dovod: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    if (data.userId === context.userId) {
      throw new Error("Vlastné prihlásenie si zakázať nemôžete.");
    }
    if (data.zakazat && (await jeAdminUcet(supabaseAdmin, data.userId))) {
      throw new Error("Účet administrátora platformy sa deaktivovať nedá.");
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.zakazat ? NAVZDY : "none",
    });
    if (error) throw new Error(error.message || "Zmena sa nepodarila.");

    /*
      Relácie sa rušiť netreba: overené, že zákaz platí okamžite aj na už
      otvorenú reláciu — starý prístupový token vráti 403 a obnovenie relácie
      končí na „user_banned". Kto má appku otvorenú v telefóne, vypadne pri
      najbližšom volaní servera.
    */
    await logAudit(
      supabaseAdmin,
      context.userId,
      data.zakazat ? "zakaz_prihlasenia" : "povolenie_prihlasenia",
      data.userId,
      data.dovod ? { dovod: data.dovod } : {},
    );
    return { ok: true, zakazane: data.zakazat };
  });

/**
 * Zmaže účet natrvalo — vrátane firiem, kde bol človek jediným členom.
 *
 * Nezvratné, takže dve poistky: smie to len superadmin a musí prepísať e-mail
 * účtu. Administrátorský účet ani vlastný účet sa zmazať nedá.
 */
export const adminZmazUcet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ userId: z.string().uuid(), potvrdEmail: z.string().trim().min(3) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin, role } = await getAdmin(context);
    if (role !== "superadmin") throw new Error("Mazať účty smie len superadmin.");
    if (data.userId === context.userId) throw new Error("Vlastný účet takto zmazať nemôžete.");
    if (await jeAdminUcet(supabaseAdmin, data.userId)) {
      throw new Error("Účet administrátora platformy sa zmazať nedá.");
    }

    const { data: profil } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    if (!profil) throw new Error("Taký účet neexistuje.");
    if ((profil.email ?? "").trim().toLowerCase() !== data.potvrdEmail.toLowerCase()) {
      throw new Error("Prepísaný e-mail sa nezhoduje s účtom.");
    }

    // Zapíše sa **pred** zmazaním: potom už nebude odkiaľ zistiť, čí účet to bol.
    await logAudit(supabaseAdmin, context.userId, "zmazanie_uctu", data.userId, {
      email: profil.email,
    });

    const { zrusUcet } = await import("./ucet-zrusenie.server");
    const vysledok = await zrusUcet(data.userId);

    await logAudit(supabaseAdmin, context.userId, "zmazanie_uctu_hotovo", data.userId, {
      email: profil.email,
      zmazaneFirmy: vysledok.zmazaneFirmy,
      zmazaneSubory: vysledok.zmazaneSubory,
      opusteneFirmy: vysledok.opusteneFirmy,
    });
    return vysledok;
  });

/** Zruší naplánované samoobslužné zrušenie účtu — človek si to rozmyslel. */
export const adminZrusPlanovaneZrusenie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await getAdmin(context);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ deletion_scheduled_for: null, deletion_requested_at: null })
      .eq("id", data.userId);
    if (error) throw error;
    await logAudit(supabaseAdmin, context.userId, "odvolanie_zrusenia_uctu", data.userId, {});
    return { ok: true };
  });
