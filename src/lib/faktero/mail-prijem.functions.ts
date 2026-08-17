import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { zostavLocalPart, celaAdresa, podomenaDokladov, overVlastnyLocalPart } from "./mail-prijem";

const CompanyInput = z.object({ company_id: z.string().uuid() });

async function assertMember(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export type StavPrijmuMailom = {
  adresa: string;
  local_part: string;
  active: boolean;
  last_received_at: string | null;
  podomena: string;
  spravy: Array<{
    id: string;
    from_email: string | null;
    subject: string | null;
    received_at: string;
    status: string;
    detail: string | null;
    created_invoice_ids: string[];
  }>;
};

/**
 * Adresa firmy pre tohto používateľa. Zakladá sa až keď o ňu prvýkrát požiada —
 * nemá zmysel rozdávať adresy firmám, ktoré doklady mailom neposielajú.
 */
export const stavPrijmuMailom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => CompanyInput.parse(input))
  .handler(async ({ data, context }): Promise<StavPrijmuMailom> => {
    const { supabase, userId } = context as any;
    await assertMember(supabase, userId, data.company_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let { data: adresa } = await supabaseAdmin
      .from("inbox_addresses")
      .select("id, local_part, active, last_received_at")
      .eq("company_id", data.company_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!adresa) {
      const { data: firma } = await supabaseAdmin
        .from("companies")
        .select("name")
        .eq("id", data.company_id)
        .maybeSingle();

      // Chvost je náhodný, takže zhoda je nepravdepodobná — ale nie nemožná.
      let posledna: any = null;
      for (let pokus = 0; pokus < 5 && !adresa; pokus++) {
        const local = zostavLocalPart(firma?.name ?? "firma");
        const { data: nova, error } = await supabaseAdmin
          .from("inbox_addresses")
          .insert({ company_id: data.company_id, user_id: userId, local_part: local })
          .select("id, local_part, active, last_received_at")
          .single();
        if (!error) adresa = nova;
        else posledna = error;
      }
      if (!adresa) throw new Error(posledna?.message ?? "Adresu sa nepodarilo založiť.");
    }

    const { data: spravy } = await supabaseAdmin
      .from("inbox_messages")
      .select("id, from_email, subject, received_at, status, detail, created_invoice_ids")
      .eq("address_id", adresa.id)
      .order("received_at", { ascending: false })
      .limit(10);

    const podomena = podomenaDokladov(process.env.MAIL_PRIJEM_DOMENA);
    return {
      adresa: celaAdresa(adresa.local_part, podomena),
      local_part: adresa.local_part,
      active: adresa.active,
      last_received_at: adresa.last_received_at,
      podomena,
      spravy: (spravy ?? []) as any,
    };
  });

/** Vypnutie a zapnutie adresy — mail na vypnutú adresu sa ticho zahodí. */
export const prepniPrijemMailom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => CompanyInput.extend({ active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertMember(supabase, userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("inbox_addresses")
      .update({ active: data.active })
      .eq("company_id", data.company_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Nová adresa namiesto starej. Používa sa, keď sa adresa dostane tam, kam nemala —
 * stará prestane platiť okamžite.
 */
export const obnovAdresuNaDoklady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => CompanyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertMember(supabase, userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: firma } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", data.company_id)
      .maybeSingle();

    for (let pokus = 0; pokus < 5; pokus++) {
      const local = zostavLocalPart(firma?.name ?? "firma");
      const { error } = await supabaseAdmin
        .from("inbox_addresses")
        .update({ local_part: local })
        .eq("company_id", data.company_id)
        .eq("user_id", userId);
      if (!error)
        return { adresa: celaAdresa(local, podomenaDokladov(process.env.MAIL_PRIJEM_DOMENA)) };
    }
    throw new Error("Novú adresu sa nepodarilo vyrobiť.");
  });

/**
 * Vlastná adresa namiesto generovanej.
 *
 * Adresa je zároveň heslo — kto ju pozná, vie firme podstrčiť doklad. Preto sa
 * predvolene generuje s náhodným chvostom. Vlastnú si používateľ nastaviť môže,
 * ale vedome; upozorňuje ho na to rozhranie a kedykoľvek sa dá vrátiť ku
 * generovanej cez „Vymeniť adresu".
 */
export const nastavVlastnuAdresu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ company_id: z.string().uuid(), local_part: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertMember(supabase, userId, data.company_id);

    const overene = overVlastnyLocalPart(data.local_part);
    if (!overene.ok) throw new Error(overene.chyba);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("inbox_addresses")
      .update({ local_part: overene.hodnota })
      .eq("company_id", data.company_id)
      .eq("user_id", userId);

    if (error) {
      // Jedinečnosť stráži index nad lower(local_part) — hlásiť to treba ľudsky.
      if (/duplicate key|23505/.test(error.message ?? ""))
        throw new Error("Túto adresu už niekto používa, skúste inú.");
      throw new Error(error.message);
    }

    return {
      adresa: celaAdresa(overene.hodnota, podomenaDokladov(process.env.MAIL_PRIJEM_DOMENA)),
      local_part: overene.hodnota,
    };
  });
