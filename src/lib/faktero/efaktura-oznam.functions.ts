import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Oznam o e-fakturácii 2027 (okno po prihlásení, pás pri pozvanom účtovníkovi)
  a verejná stránka účtovníka. Logika zobrazenia je v `efaktura-oznam.ts`,
  pozvánka a e-mail v `efaktura-oznam.server.ts`.
*/

const Firma = z.object({ company_id: z.string().uuid() });
const Token = z.object({ token: z.string().regex(/^[a-f0-9]{48}$/, "Neplatný odkaz.") });

/** Fakty pre rozhodnutie o okne. Rozhoduje `coZobrazitOznam` v prehliadači (podľa cesty). */
export const stavOznamuEfakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: clen } = await supabase
      .from("company_users")
      .select("role")
      .eq("company_id", data.company_id)
      .eq("user_id", userId)
      .maybeSingle();
    const rola = (clen?.role as string | undefined) ?? null;
    if (rola !== "owner" && rola !== "admin") return { rola, relevantne: false as const };

    const [{ data: firma }, { data: profil }, { data: oznam }, { data: pozvanky }] =
      await Promise.all([
        supabase.from("companies").select("country, dic").eq("id", data.company_id).maybeSingle(),
        supabase
          .from("efaktura_profiles")
          .select("enabled, epostak_firm_id")
          .eq("company_id", data.company_id)
          .maybeSingle(),
        supabase
          .from("efaktura_oznam")
          .select("dismissed_at, cta_clicked, cta_clicked_at, accountant_invited_at")
          .eq("company_id", data.company_id)
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("efaktura_aktivacia_pozvanky")
          .select(
            "id, email, token, expires_at, created_at, email_odoslany_at, email_chyba, otvorena_at, hotovo_at, zrusena_at",
          )
          .eq("company_id", data.company_id)
          .is("zrusena_at", null)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

    const { jeEfakturaAktivovana, jePozvankaPlatna } = await import("./efaktura-oznam");
    const { odkazPozvanky } = await import("./efaktura-oznam.server");
    const p = (pozvanky ?? [])[0] ?? null;
    const platna = jePozvankaPlatna(p);
    return {
      rola,
      relevantne: true as const,
      krajina: (firma?.country as string | null) ?? "SK",
      dic: (firma?.dic as string | null) ?? null,
      aktivovana: jeEfakturaAktivovana(profil),
      dismissedAt: (oznam?.dismissed_at as string | null) ?? null,
      ctaClickedAt: (oznam?.cta_clicked_at as string | null) ?? null,
      pozvanka:
        p && platna
          ? {
              id: p.id as string,
              email: p.email as string,
              odkaz: odkazPozvanky(p.token),
              createdAt: p.created_at as string,
              expiresAt: p.expires_at as string,
              emailOdoslany: !!p.email_odoslany_at,
              chybaEmailu: (p.email_chyba as string | null) ?? null,
              otvorenaAt: (p.otvorena_at as string | null) ?? null,
              hotovoAt: (p.hotovo_at as string | null) ?? null,
            }
          : null,
    };
  });

/** Zatvorenie okna krížikom, alebo klik na „Pokračovať na prepojenie". */
export const zaznamenajOznamEfakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.extend({ akcia: z.enum(["zatvorit", "pokracovat"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const teraz = new Date().toISOString();
    // Zápis cez klienta používateľa — RLS pustí len vlastný riadok majiteľa/admina.
    const zmena =
      data.akcia === "zatvorit"
        ? { dismissed_at: teraz }
        : { cta_clicked: true, cta_clicked_at: teraz };
    const { error } = await supabase
      .from("efaktura_oznam")
      .upsert(
        { company_id: data.company_id, user_id: userId, ...zmena, updated_at: teraz },
        { onConflict: "company_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const pozviUctovnikaEfakturyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.extend({ email: z.string().max(254) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    const { jePlatnyEmail } = await import("./efaktura-oznam");
    if (!jePlatnyEmail(data.email)) throw new Error("Zadajte platný e-mail účtovníka.");
    const { overPristup } = await import("./over-pristup");
    await overPristup(ctx, data.company_id, { spravca: true, oblast: "faktury", zapis: true });
    const { vytvorPozvankuUctovnika } = await import("./efaktura-oznam.server");
    return vytvorPozvankuUctovnika({
      companyId: data.company_id,
      userId: ctx.userId,
      email: data.email,
    });
  });

export const zrusPozvankuUctovnikaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Firma.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    const { overPristup } = await import("./over-pristup");
    await overPristup(ctx, data.company_id, { spravca: true, oblast: "faktury", zapis: true });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("efaktura_aktivacia_pozvanky")
      .update({ zrusena_at: new Date().toISOString() })
      .eq("company_id", data.company_id)
      .is("zrusena_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- verejná stránka účtovníka (bez prihlásenia) ---------- */

export const aktivaciaPodlaTokenuFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => Token.parse(d))
  .handler(async ({ data }) => {
    const { pozvankaPodlaTokenu } = await import("./efaktura-oznam.server");
    return pozvankaPodlaTokenu(data.token);
  });

export const oznacAktivaciuHotovuFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => Token.parse(d))
  .handler(async ({ data }) => {
    const { oznacPozvankuHotovu } = await import("./efaktura-oznam.server");
    return oznacPozvankuHotovu(data.token);
  });
