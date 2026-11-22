/**
 * Údaje firmy pre rozbalenie v Správe firiem (šípka pri firme): adresa,
 * identifikátory, bankové účty, kontakty, zápis v registri, konateľ
 * a majiteľ účtu vo Fakteri. Konateľ sa, kým nie je uložený, ponúkne
 * z registra (FinStat/RPO podľa IČO).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UdajeFirmy = {
  nazov: string;
  ulica: string | null;
  mesto: string | null;
  psc: string | null;
  krajina: string | null;
  ico: string | null;
  dic: string | null;
  icDph: string | null;
  email: string | null;
  telefon: string | null;
  web: string | null;
  registracia: string | null;
  ucty: { nazov: string | null; iban: string; swift: string | null; mena: string | null }[];
  konatel: { meno: string | null; telefon: string | null; email: string | null };
  /** Konatelia z registra (len návrh, kým nie je meno uložené). */
  konateliaZRegistra: string[];
  majitelia: { meno: string | null; email: string | null }[];
  smieUpravit: boolean;
};

export const udajeFirmyFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<UdajeFirmy> => {
    const supabase = context.supabase as any;
    const { overPristup } = await import("./over-pristup");
    const rola = await overPristup({ supabase, userId: context.userId }, data.companyId);
    const { data: f, error } = await supabase
      .from("companies")
      .select(
        "name, street, city, zip, country, ico, dic, ic_dph, email, phone, website, iban, swift, registracia_text, konatel_meno, konatel_telefon, konatel_email",
      )
      .eq("id", data.companyId)
      .maybeSingle();
    if (error || !f) throw new Error(error?.message ?? "Firma sa nenašla.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ucty } = await supabaseAdmin
      .from("bank_accounts")
      .select("name, iban, swift, currency")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: true })
      .range(0, 49);
    const zoznamUctov = ((ucty ?? []) as any[])
      .filter((u) => u.iban)
      .map((u) => ({ nazov: u.name ?? null, iban: u.iban, swift: u.swift ?? null, mena: u.currency ?? null }));
    if (f.iban && !zoznamUctov.some((u) => u.iban.replace(/\s/g, "") === String(f.iban).replace(/\s/g, "")))
      zoznamUctov.unshift({ nazov: null, iban: f.iban, swift: f.swift ?? null, mena: null });

    const { data: maj } = await supabaseAdmin
      .from("company_users")
      .select("user_id")
      .eq("company_id", data.companyId)
      .eq("role", "owner");
    const ids = ((maj ?? []) as any[]).map((m) => m.user_id);
    const { data: prof } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] as any[] };

    let konateliaZRegistra: string[] = [];
    if (!f.konatel_meno && f.ico && /^\d{6,8}$/.test(String(f.ico).replace(/\s/g, ""))) {
      try {
        const { firmaZRegistraBezRezimu } = await import("./company-registry.server");
        const r = await Promise.race([
          firmaZRegistraBezRezimu(String(f.ico)),
          new Promise<null>((res) => setTimeout(() => res(null), 6000)),
        ]);
        if (r && r.status === "ok")
          konateliaZRegistra = (r.data.statutoryRepresentatives ?? [])
            .map((s: any) => [s.name, s.function].filter(Boolean).join(" — "))
            .filter(Boolean)
            .slice(0, 5);
      } catch {
        /* register nedostupný — konateľ ostane na doplnenie */
      }
    }

    const { jeAdminRola } = await import("./opravnenia");
    return {
      nazov: f.name,
      ulica: f.street ?? null,
      mesto: f.city ?? null,
      psc: f.zip ?? null,
      krajina: f.country ?? null,
      ico: f.ico ?? null,
      dic: f.dic ?? null,
      icDph: f.ic_dph ?? null,
      email: f.email ?? null,
      telefon: f.phone ?? null,
      web: f.website ?? null,
      registracia: f.registracia_text ?? null,
      ucty: zoznamUctov,
      konatel: { meno: f.konatel_meno ?? null, telefon: f.konatel_telefon ?? null, email: f.konatel_email ?? null },
      konateliaZRegistra,
      majitelia: ((prof ?? []) as any[]).map((p) => ({ meno: p.full_name ?? null, email: p.email ?? null })),
      smieUpravit: jeAdminRola(rola),
    };
  });

export const ulozKonatelaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        meno: z.string().trim().max(200).nullable(),
        telefon: z.string().trim().max(50).nullable(),
        email: z.string().trim().max(255).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { overPristup } = await import("./over-pristup");
    await overPristup({ supabase, userId: context.userId }, data.companyId, { spravca: true });
    if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) throw new Error("E-mail konateľa nie je platný.");
    const { error } = await supabase
      .from("companies")
      .update({
        konatel_meno: data.meno || null,
        konatel_telefon: data.telefon || null,
        konatel_email: data.email || null,
      })
      .eq("id", data.companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
