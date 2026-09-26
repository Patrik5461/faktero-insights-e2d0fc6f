/**
 * Správa účtov, ktoré majú plán natrvalo zadarmo.
 *
 * Zoznam drží e-maily zakladateľov firiem. Pravidlo sa uplatní dvakrát: pri
 * zakladaní novej firmy (trigger v databáze) a tu, keď sa účet pridá — vtedy
 * sa prepnú aj firmy, ktoré už existujú. Bez toho druhého by sa na staré firmy
 * zabudlo presne tak, ako sa na ne zabúdalo, kým sa to robilo ručne.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: admin } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!admin) throw new Error("Forbidden");
  return supabaseAdmin;
}

export type UcetZdarma = {
  email: string;
  plan_slug: string;
  note: string | null;
  created_at: string;
  /** Koľko firiem tohto účtu pravidlo drží. */
  firiem: number;
  /** Účet v aplikácii existuje — inak je to len zápis do budúcna. */
  ucet_existuje: boolean;
};

export const zoznamUctovZdarma = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UcetZdarma[]> => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { data: ucty } = await supabaseAdmin
      .from("platform_free_accounts")
      .select("email, plan_slug, note, created_at")
      .order("email");

    const vysledok: UcetZdarma[] = [];
    for (const u of ucty ?? []) {
      const { data: pouzivatel } = await supabaseAdmin.rpc("pouzivatel_podla_emailu" as any, {
        p_email: u.email,
      });
      const userId = (pouzivatel as any) ?? null;
      let firiem = 0;
      if (userId) {
        const { count } = await supabaseAdmin
          .from("companies")
          .select("id", { count: "exact", head: true })
          .eq("created_by", userId);
        firiem = count ?? 0;
      }
      vysledok.push({
        email: u.email,
        plan_slug: u.plan_slug,
        note: u.note,
        created_at: u.created_at,
        firiem,
        ucet_existuje: Boolean(userId),
      });
    }
    return vysledok;
  });

const PridajInput = z.object({
  email: z.string().trim().email().max(255),
  plan_slug: z.enum(["starter", "premium", "enterprise"]).default("enterprise"),
  note: z.string().trim().max(500).optional().nullable(),
});

export const pridajUcetZdarma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PridajInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const email = data.email.toLowerCase();
    const { error } = await supabaseAdmin.from("platform_free_accounts").upsert({
      email,
      plan_slug: data.plan_slug,
      note: data.note || null,
    });
    if (error) throw new Error(error.message);

    // Firmy, ktoré účet už má, sa prepnú hneď — inak by pravidlo platilo len
    // pre tie budúce a staré by ďalej čakali na platbu.
    const { data: prepnute, error: chyba } = await supabaseAdmin.rpc(
      "zrovnaj_ucty_zdarma" as any,
      { p_email: email },
    );
    if (chyba) throw new Error(chyba.message);
    return { ok: true, prepnute: Number(prepnute ?? 0) };
  });

const OdoberInput = z.object({ email: z.string().trim().email().max(255) });

export const odoberUcetZdarma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => OdoberInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("platform_free_accounts")
      .delete()
      .eq("email", data.email.toLowerCase());
    if (error) throw new Error(error.message);
    /*
      Predplatné firiem sa zámerne nemení. Odobratie zo zoznamu znamená „od
      teraz sa to neobnovuje samo", nie „vypni im to". Komu sa má začať
      účtovať, tomu sa plán nastaví v Predplatnom.
    */
    return { ok: true };
  });
