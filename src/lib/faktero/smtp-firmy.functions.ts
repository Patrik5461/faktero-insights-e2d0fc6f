import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Nastavenie vlastného SMTP servera firmy. Tabuľka `firma_smtp` je pre
  prehliadač zavretá — číta a zapisuje ju len tento server, a to len majiteľ
  alebo admin firmy. Heslo sa späť nikdy nevracia.
*/

async function overSpravcu(context: any, companyId: string) {
  const { data } = await context.supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (!data || !["owner", "admin"].includes(data.role)) {
    throw new Error("Odosielanie e-mailov môže nastaviť len majiteľ alebo admin firmy.");
  }
}

export type SmtpPrehlad = {
  aktivne: boolean;
  host: string;
  port: number;
  zabezpecenie: "ssl" | "starttls" | "ziadne";
  pouzivatel: string;
  maHeslo: boolean;
  od_email: string;
  od_meno: string;
  overene_at: string | null;
  posledna_chyba: string | null;
  posledna_chyba_at: string | null;
} | null;

export const nacitajSmtpFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<SmtpPrehlad> => {
    await overSpravcu(context, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r } = await supabaseAdmin
      .from("firma_smtp")
      .select("*")
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!r) return null;
    return {
      aktivne: r.aktivne,
      host: r.host,
      port: r.port,
      zabezpecenie: r.zabezpecenie as "ssl" | "starttls" | "ziadne",
      pouzivatel: r.pouzivatel ?? "",
      maHeslo: Boolean(r.heslo_sifrovane),
      od_email: r.od_email,
      od_meno: r.od_meno ?? "",
      overene_at: r.overene_at,
      posledna_chyba: r.posledna_chyba,
      posledna_chyba_at: r.posledna_chyba_at,
    };
  });

const Vstup = z.object({
  company_id: z.string().uuid(),
  host: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(/^[a-zA-Z0-9.-]+$/, "Server zadajte bez http:// a portu, napr. smtp.firma.sk"),
  port: z.number().int().min(1).max(65535),
  zabezpecenie: z.enum(["ssl", "starttls", "ziadne"]),
  pouzivatel: z.string().trim().max(200).optional().default(""),
  /** Prázdne = ponechať uložené heslo. */
  heslo: z.string().max(500).optional().default(""),
  od_email: z.string().trim().email("Adresa odosielateľa nie je platný e-mail."),
  od_meno: z.string().trim().max(120).optional().default(""),
});

/**
 * Uloží nastavenie a hneď ho overí skúšobným mailom na adresu prihláseného —
 * zapne sa len vtedy, keď skúška prejde. Zle nastavený server by inak potichu
 * posielal všetko cez Resend.
 */
export const ulozSmtpFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Vstup.parse(d))
  .handler(async ({ data, context }) => {
    await overSpravcu(context, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptSecret } = await import("./payment-crypto.server");
    const admin = supabaseAdmin;
    const { data: stare } = await admin
      .from("firma_smtp")
      .select("heslo_sifrovane")
      .eq("company_id", data.company_id)
      .maybeSingle();
    const heslo_sifrovane = data.heslo
      ? encryptSecret(data.heslo)
      : (stare?.heslo_sifrovane ?? null);
    const nastavenie = {
      company_id: data.company_id,
      host: data.host.toLowerCase(),
      port: data.port,
      zabezpecenie: data.zabezpecenie,
      pouzivatel: data.pouzivatel || null,
      heslo_sifrovane,
      od_email: data.od_email.toLowerCase(),
      od_meno: data.od_meno || null,
    };

    const { data: user } = await context.supabase.auth.getUser();
    const komu = user?.user?.email;
    if (!komu) throw new Error("Neviem, kam poslať skúšobný mail — účet nemá e-mail.");
    const { posliCezSmtp } = await import("./odoslanie-mailu.server");
    try {
      await posliCezSmtp({ ...nastavenie, aktivne: true } as any, {
        from: "",
        to: [komu],
        subject: "Faktero: skúška odosielania cez vlastný server",
        text: `Dobrý deň,\n\ntento mail prišiel cez váš SMTP server ${nastavenie.host}. Faktúry, upomienky a ponuky budú odberateľom chodiť z adresy ${nastavenie.od_email}.\n\nFaktero`,
      });
    } catch (e: any) {
      let chyba = String(e?.message ?? e).slice(0, 300);
      if (/timeout|ETIMEDOUT|ECONNREFUSED/i.test(chyba) && data.port !== 587)
        chyba += ` — port ${data.port} je zo servera Faktera nedostupný, skúste port 587 so STARTTLS.`;
      await admin.from("firma_smtp").upsert({
        ...nastavenie,
        aktivne: false,
        posledna_chyba: chyba,
        posledna_chyba_at: new Date().toISOString(),
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      });
      throw new Error(`Skúšobný mail neodišiel — vlastný server je vypnutý. ${chyba}`);
    }
    const { error } = await admin.from("firma_smtp").upsert({
      ...nastavenie,
      aktivne: true,
      overene_at: new Date().toISOString(),
      posledna_chyba: null,
      posledna_chyba_at: null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { komu };
  });

export const vypniSmtpFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), zmazat: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await overSpravcu(context, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    if (data.zmazat) await admin.from("firma_smtp").delete().eq("company_id", data.company_id);
    else
      await admin
        .from("firma_smtp")
        .update({ aktivne: false, updated_at: new Date().toISOString() })
        .eq("company_id", data.company_id);
    return { ok: true };
  });
