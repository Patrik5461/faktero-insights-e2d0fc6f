/*
  Serverová časť oznamu o e-fakturácii: pozvánka účtovníkovi.

  Účtovník so splnomocnením na Portáli finančnej správy vyberie za firmu
  Faktero ako poskytovateľa eFaktúry. Pozvánka je e-mail s odkazom na verejnú
  stránku /aktivacia-efaktury/<token>, kde je návod krok za krokom.

  E-mail ide cez `posliMailFirmy`, teda cez strážcu odosielania (stropy pre
  nové firmy, kontrola obsahu, pozastavenie) — adresu zadáva používateľ a bez
  strážcu by sa dal okno zneužiť na rozosielanie. Keď mail neodíde, pozvánka
  ostane v DB a aplikácia ukáže odkaz na skopírovanie.

  Volá sa len zo serverových funkcií po `overPristup(..., { spravca: true })`.
*/
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { escHtml, menoOdosielatela } from "@/lib/bezpecny-text";
import { dicPrePortal, PLATNOST_POZVANKY_DNI } from "./efaktura-oznam";

/** Najviac toľko pozvánok účtovníkovi za 24 h na firmu (nad stropy strážcu). */
export const POZVANOK_ZA_DEN = 5;

function nahodnyToken(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function odkazPozvanky(token: string): string {
  const base = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
  return `${base}/aktivacia-efaktury/${token}`;
}

export type VysledokPozvanky = {
  id: string;
  odkaz: string;
  email: string;
  expires_at: string;
  emailOdoslany: boolean;
  chybaEmailu: string | null;
};

export async function vytvorPozvankuUctovnika(o: {
  companyId: string;
  userId: string;
  email: string;
}): Promise<VysledokPozvanky> {
  const email = o.email.trim().toLowerCase();

  const odDna = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await supabaseAdmin
    .from("efaktura_aktivacia_pozvanky")
    .select("id", { count: "exact", head: true })
    .eq("company_id", o.companyId)
    .gte("created_at", odDna);
  if ((count ?? 0) >= POZVANOK_ZA_DEN) {
    throw new Error(
      "Za posledných 24 hodín ste poslali priveľa pozvánok. Skopírujte odkaz z existujúcej pozvánky alebo to skúste zajtra.",
    );
  }

  const { data: firma, error: chybaFirmy } = await supabaseAdmin
    .from("companies")
    .select("name, dic, ico, email_sender_name, email_reply_to, email")
    .eq("id", o.companyId)
    .maybeSingle();
  if (chybaFirmy || !firma) throw new Error("Firmu sa nepodarilo načítať.");

  // Platí vždy jedna pozvánka — staršie sa zrušia, aby v obehu neostali dva odkazy.
  const teraz = new Date().toISOString();
  await supabaseAdmin
    .from("efaktura_aktivacia_pozvanky")
    .update({ zrusena_at: teraz })
    .eq("company_id", o.companyId)
    .is("zrusena_at", null);

  const token = nahodnyToken();
  const expires = new Date(Date.now() + PLATNOST_POZVANKY_DNI * 86_400_000).toISOString();
  const { data: poz, error } = await supabaseAdmin
    .from("efaktura_aktivacia_pozvanky")
    .insert({
      company_id: o.companyId,
      invited_by: o.userId,
      email,
      token,
      expires_at: expires,
    })
    .select("id")
    .single();
  if (error || !poz) throw new Error(error?.message ?? "Pozvánku sa nepodarilo uložiť.");

  await supabaseAdmin
    .from("efaktura_oznam")
    .upsert(
      {
        company_id: o.companyId,
        user_id: o.userId,
        accountant_invited_at: teraz,
        updated_at: teraz,
      },
      { onConflict: "company_id,user_id" },
    );

  const odkaz = odkazPozvanky(token);
  let emailOdoslany = false;
  let chybaEmailu: string | null = null;
  try {
    const { data: ja } = await supabaseAdmin.auth.admin.getUserById(o.userId);
    const replyTo = firma.email_reply_to || ja?.user?.email || firma.email || null;
    const nazov = menoOdosielatela(firma.name, "Vaša firma");
    const dic = dicPrePortal(firma.dic) ?? firma.dic ?? "—";
    const predmet = `Aktivácia e-fakturácie pre ${nazov}`;
    const text = [
      `Dobrý deň,`,
      ``,
      `${nazov} (DIČ ${dic}) vás žiada o aktiváciu e-fakturácie na Portáli finančnej správy.`,
      `Stačí za firmu vybrať Faktero ako poskytovateľa doručovacej služby pre eFaktúry. Návod krok za krokom:`,
      odkaz,
      ``,
      `Odkaz platí ${PLATNOST_POZVANKY_DNI} dní. Od 1. 1. 2027 je e-fakturácia povinná.`,
      ``,
      `Faktero`,
    ].join("\n");
    const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.55;color:#111;max-width:560px">
      <p>Dobrý deň,</p>
      <p>firma <strong>${escHtml(nazov)}</strong> (DIČ ${escHtml(dic)}) vás žiada o aktiváciu e-fakturácie na Portáli finančnej správy.
      Stačí za firmu vybrať <strong>Faktero</strong> ako poskytovateľa doručovacej služby pre eFaktúry — zaberie to pár minút.</p>
      <p><a href="${escHtml(odkaz)}" style="background:#12734f;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">Otvoriť návod na aktiváciu</a></p>
      <p style="color:#555;font-size:12px">Alebo skopírujte odkaz: ${escHtml(odkaz)}<br/>Odkaz platí ${PLATNOST_POZVANKY_DNI} dní. Od 1. 1. 2027 je e-fakturácia povinná.</p>
      <p style="color:#555;font-size:12px">Faktero — fakturácia a eFaktúra v jednom</p>
    </div>`;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "faktury@faktero.sk";
    const odosielatel = menoOdosielatela(`${nazov} cez Faktero`);
    const { posliMailFirmy } = await import("./odoslanie-mailu.server");
    await posliMailFirmy(o.companyId, {
      from: `${odosielatel} <${fromEmail}>`,
      fromName: odosielatel,
      to: [email],
      subject: predmet,
      text,
      html,
      reply_to: replyTo,
      ochrana: {
        userId: o.userId,
        druh: "pozvanka",
        sprava: "",
      },
    });
    emailOdoslany = true;
  } catch (e: any) {
    console.error("[efaktura-oznam] pozvánka", String(e?.message ?? e).slice(0, 300));
    chybaEmailu = String(e?.message ?? "E-mail sa nepodarilo odoslať.").slice(0, 300);
  }

  await supabaseAdmin
    .from("efaktura_aktivacia_pozvanky")
    .update(
      emailOdoslany
        ? { email_odoslany_at: new Date().toISOString(), email_chyba: null }
        : { email_chyba: chybaEmailu },
    )
    .eq("id", poz.id);

  return { id: poz.id, odkaz, email, expires_at: expires, emailOdoslany, chybaEmailu };
}

/** Údaje pre verejnú stránku účtovníka — len to, čo potrebuje na portáli FS. */
export async function pozvankaPodlaTokenu(token: string) {
  const { data: p } = await supabaseAdmin
    .from("efaktura_aktivacia_pozvanky")
    .select("id, company_id, expires_at, zrusena_at, otvorena_at, hotovo_at")
    .eq("token", token)
    .maybeSingle();
  if (!p) return { platna: false as const, dovod: "neexistuje" as const };
  if (p.zrusena_at) return { platna: false as const, dovod: "zrusena" as const };
  if (Date.parse(p.expires_at) < Date.now())
    return { platna: false as const, dovod: "vyprsala" as const };

  const [{ data: firma }, { data: profil }] = await Promise.all([
    supabaseAdmin
      .from("companies")
      .select("name, ico, dic, ic_dph, street, city, zip")
      .eq("id", p.company_id)
      .maybeSingle(),
    supabaseAdmin
      .from("efaktura_profiles")
      .select("enabled, epostak_firm_id")
      .eq("company_id", p.company_id)
      .maybeSingle(),
  ]);
  if (!p.otvorena_at) {
    await supabaseAdmin
      .from("efaktura_aktivacia_pozvanky")
      .update({ otvorena_at: new Date().toISOString() })
      .eq("id", p.id);
  }
  const { jeEfakturaAktivovana } = await import("./efaktura-oznam");
  return {
    platna: true as const,
    firma: {
      nazov: firma?.name ?? "",
      ico: firma?.ico ?? null,
      dic: dicPrePortal(firma?.dic) ?? firma?.dic ?? null,
      icDph: firma?.ic_dph ?? null,
      adresa: [firma?.street, [firma?.zip, firma?.city].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", "),
    },
    aktivovana: jeEfakturaAktivovana(profil),
    hotovoAt: p.hotovo_at,
    expiresAt: p.expires_at,
  };
}

export async function oznacPozvankuHotovu(token: string) {
  const { data } = await supabaseAdmin
    .from("efaktura_aktivacia_pozvanky")
    .update({ hotovo_at: new Date().toISOString() })
    .eq("token", token)
    .is("zrusena_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (!data) throw new Error("Pozvánka už neplatí.");
  return { ok: true };
}
