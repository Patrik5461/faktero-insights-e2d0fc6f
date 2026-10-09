import { createServerFn } from "@tanstack/react-start";
import { overPristup } from "./over-pristup";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { zostavLocalPart, celaAdresa, podomenaDokladov, overVlastnyLocalPart } from "./mail-prijem";

const CompanyInput = z.object({ company_id: z.string().uuid() });

/**
 * Príjem dokladov mailom patrí do oblasti Prijaté faktúry a doklady. Číta sa
 * aj zapisuje cez admin klienta, preto oblasť overujeme tu, nie v RLS.
 */
async function assertMember(supabase: any, userId: string, companyId: string, zapis = false) {
  await overPristup({ supabase, userId }, companyId, { oblast: "doklady", zapis });
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
    created_other_ids: string[];
    created_nespracovane_ids?: string[];
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
      .select(
        "id, from_email, subject, received_at, status, detail, created_invoice_ids, created_other_ids, created_nespracovane_ids",
      )
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
    await assertMember(supabase, userId, data.company_id, true);
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
    await assertMember(supabase, userId, data.company_id, true);
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
    await assertMember(supabase, userId, data.company_id, true);

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

/** Text pôvodného e-mailu, z ktorého doklad vznikol (ako v Doklado). */
export const zdrojovyMailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    CompanyInput.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertMember(supabase, userId, data.company_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin
      .from("inbox_messages")
      .select("provider_email_id")
      .eq("id", data.id)
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!m?.provider_email_id) throw new Error("Mail sa nenašiel.");
    const apiKey = (process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY)?.trim();
    if (!apiKey) throw new Error("Príjem mailov nie je nastavený.");
    const { obsahMailu } = await import("./mail-prijem.server");
    const o = await obsahMailu(m.provider_email_id, apiKey);
    const text =
      String(o.text ?? "").trim() ||
      String(o.html ?? "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return { text: text.slice(0, 20000) || "(prázdny mail)" };
  });

/** Povolení odosielatelia — prázdne = ktokoľvek s adresou. */
export const povoleniOdosielateliaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    CompanyInput.extend({ zoznam: z.array(z.string().trim().max(120)).max(100).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertMember(supabase, userId, data.company_id, true);
    if (data.zoznam) {
      const zoznam = [...new Set(data.zoznam.map((x) => x.toLowerCase()).filter(Boolean))];
      const { error } = await supabase
        .from("companies")
        .update({ mail_povoleni_odosielatelia: zoznam })
        .eq("id", data.company_id);
      if (error) throw new Error(error.message);
    }
    const { data: f } = await supabase
      .from("companies")
      .select("mail_povoleni_odosielatelia")
      .eq("id", data.company_id)
      .maybeSingle();
    return { zoznam: ((f as any)?.mail_povoleni_odosielatelia ?? []) as string[] };
  });

export type StavRozdelovaca = {
  adresa: string;
  active: boolean;
  last_received_at: string | null;
  firmy: Array<{ id: string; name: string | null; ico: string | null }>;
  nepriradene: Array<{
    id: string;
    from_email: string | null;
    subject: string | null;
    received_at: string;
    status: string;
    detail: string | null;
    company_id: string | null;
    prilohy: Array<{
      id: string;
      nazov: string | null;
      odberatel: string | null;
      ico: string | null;
      ic_dph: string | null;
      dodavatel: string | null;
      suma: number | null;
      mena: string | null;
    }>;
  }>;
};

/**
 * Rozdeľovač (ako v Doklado): jedna adresa používateľa pre všetky jeho firmy.
 * Zakladá sa pri prvom otvorení, rovnako ako adresa firmy.
 */
export const rozdelovacFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ active: z.boolean().optional(), vymenit: z.boolean().optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<StavRozdelovaca> => {
    const { userId } = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { localPartRozdelovaca } = await import("./mail-rozdelovac");
    const { firmyPouzivatela } = await import("./mail-rozdelovac.server");

    let { data: r } = await supabaseAdmin
      .from("mail_rozdelovace")
      .select("local_part, active, last_received_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (!r || data.vymenit) {
      for (let pokus = 0; pokus < 5; pokus++) {
        const { data: novy, error } = await supabaseAdmin
          .from("mail_rozdelovace")
          .upsert({ user_id: userId, local_part: localPartRozdelovaca() }, { onConflict: "user_id" })
          .select("local_part, active, last_received_at")
          .single();
        if (!error) {
          r = novy;
          break;
        }
      }
      if (!r) throw new Error("Adresu rozdeľovača sa nepodarilo založiť.");
    }
    if (data.active !== undefined && data.active !== r.active) {
      await supabaseAdmin.from("mail_rozdelovace").update({ active: data.active }).eq("user_id", userId);
      r = { ...r, active: data.active };
    }

    const { data: nepriradene } = await supabaseAdmin
      .from("mail_nepriradene")
      .select("id, from_email, subject, received_at, status, detail, company_id, prilohy")
      .eq("user_id", userId)
      .neq("status", "zahodene")
      .order("received_at", { ascending: false })
      .limit(30);

    const firmy = await firmyPouzivatela(supabaseAdmin, userId);
    return {
      adresa: celaAdresa(r.local_part, podomenaDokladov(process.env.MAIL_PRIJEM_DOMENA)),
      active: r.active,
      last_received_at: r.last_received_at,
      firmy: firmy.map((f) => ({ id: f.id, name: f.name, ico: f.ico })),
      nepriradene: (nepriradene ?? []) as any,
    };
  });

/**
 * Ručné priradenie dokladu z rozdeľovača k firme. Spracovanie (stiahnutie a
 * čítanie AI) trvá dlhšie než 30 s strop nginxu, preto beží na pozadí a
 * stav sa zapíše do riadku.
 */
export const priradNepriradenyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        company_id: z.string().uuid().nullable(),
        zahodit: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin
      .from("mail_nepriradene")
      .select("id, provider_email_id, from_email, subject, prilohy, status")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!m) throw new Error("Doklad sa nenašiel.");

    if (data.zahodit) {
      await supabaseAdmin.from("mail_nepriradene").update({ status: "zahodene" }).eq("id", m.id);
      return { ok: true };
    }
    if (!data.company_id) throw new Error("Vyberte firmu.");
    if (m.status === "spracuva" || m.status === "priradene") throw new Error("Doklad sa už priraďuje.");
    await assertMember(supabase, userId, data.company_id, true);

    const lenPrilohy = ((m.prilohy as any[]) ?? []).map((p) => String(p.id)).filter(Boolean);
    if (!lenPrilohy.length) throw new Error("V maile nie je doklad na priradenie.");
    await supabaseAdmin
      .from("mail_nepriradene")
      .update({ status: "spracuva", company_id: data.company_id, detail: null })
      .eq("id", m.id);

    const companyId = data.company_id;
    void (async () => {
      try {
        const { adresaFirmyPouzivatela } = await import("./mail-rozdelovac.server");
        const { spracujPrijatyMail } = await import("./mail-prijem.server");
        const adresa = await adresaFirmyPouzivatela(supabaseAdmin, companyId, userId);
        const v = await spracujPrijatyMail(
          { email_id: m.provider_email_id, from: m.from_email, subject: m.subject },
          { adresa: { ...adresa, active: true }, lenPrilohy },
        );
        await supabaseAdmin
          .from("mail_nepriradene")
          .update({
            status: v.vytvorenych ? "priradene" : "chyba",
            detail: v.detail ?? (v.vytvorenych ? null : "Doklad sa nepodarilo založiť."),
          })
          .eq("id", m.id);
      } catch (e: any) {
        await supabaseAdmin
          .from("mail_nepriradene")
          .update({ status: "chyba", detail: String(e?.message ?? e).slice(0, 300) })
          .eq("id", m.id);
      }
    })();
    return { ok: true };
  });
