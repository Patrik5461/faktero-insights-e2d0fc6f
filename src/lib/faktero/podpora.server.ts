/*
  Help desk — zápis požiadaviek a správ a e-maily k nim. Používajú ho
  zákaznícke aj administrátorské serverové funkcie, „Nahlásiť chybu" v appke
  aj kontaktný formulár na webe, aby všetko skončilo v jednej schránke.
*/
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { podomenaDokladov } from "./mail-prijem";
import {
  adresaOdpovede,
  cisloPoziadavky,
  emailOdosielatela,
  nazovKategorie,
  orezCitaciu,
  stavPoSprave,
  type KategoriaPoziadavky,
  type StavPoziadavky,
} from "./podpora";

const web = () => (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
/** Kam chodia nové požiadavky — tá istá servisná adresa ako doteraz hlásenia chýb. */
const schrankaPodpory = () => process.env.FEEDBACK_TO_EMAIL || "servis@faktero.sk";
const odosielatel = () => process.env.RESEND_FROM_NOREPLY || "noreply@faktero.sk";
/*
  Na každý e-mail help desku sa dá odpovedať priamo z pošty: odpoveď príde na
  tajnú adresu požiadavky a zapíše sa do vlákna (`prijmiOdpovedEmailom`).
*/
const adresaPreOdpoved = (token: string) =>
  adresaOdpovede(token, podomenaDokladov(process.env.MAIL_PRIJEM_DOMENA));

function html(v: string): string {
  return v.replace(
    /[<>&"]/g,
    (z) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[z] ?? z,
  );
}

async function posliMail(args: {
  komu: string;
  predmet: string;
  riadky: string[];
  text: string;
  odkaz?: { url: string; popis: string };
  odpovedatNa?: string | null;
}) {
  const kluc = process.env.RESEND_API_KEY;
  if (!kluc) return;
  const telo =
    `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;line-height:1.5">` +
    (args.riadky.length ? `<p style="color:#555">${args.riadky.map(html).join("<br>")}</p>` : "") +
    `<div style="white-space:pre-wrap;border-left:3px solid #12734f;padding-left:12px;margin:12px 0">${html(args.text)}</div>` +
    (args.odkaz
      ? `<p><a href="${html(args.odkaz.url)}" style="color:#12734f;font-weight:600">${html(args.odkaz.popis)}</a></p>`
      : "") +
    `</div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${kluc}` },
      body: JSON.stringify({
        from: `Faktero podpora <${odosielatel()}>`,
        to: [args.komu],
        ...(args.odpovedatNa ? { reply_to: args.odpovedatNa } : {}),
        subject: args.predmet,
        text: [
          ...args.riadky,
          "",
          args.text,
          args.odkaz ? `\n${args.odkaz.popis}: ${args.odkaz.url}` : "",
        ].join("\n"),
        html: telo,
      }),
    });
    if (!r.ok) console.error("[podpora] Resend odmietol", r.status, (await r.text()).slice(0, 200));
  } catch (e: any) {
    // E-mail je upozornenie navyše — požiadavka je uložená aj bez neho.
    console.error("[podpora] e-mail zlyhal:", e?.message ?? e);
  }
}

export type NovaPoziadavka = {
  userId: string | null;
  companyId?: string | null;
  email: string;
  meno?: string | null;
  predmet: string;
  kategoria: KategoriaPoziadavky;
  zdroj: "aplikacia" | "mobil" | "web";
  text: string;
  url?: string | null;
  userAgent?: string | null;
  /** Kontaktný formulár si posiela vlastný e-mail — dvakrát netreba. */
  bezUpozornenia?: boolean;
};

export async function zalozPoziadavku(n: NovaPoziadavka): Promise<{ id: string; cislo: number }> {
  const { data: p, error } = await supabaseAdmin
    .from("podpora_poziadavky" as any)
    .insert({
      user_id: n.userId,
      company_id: n.companyId ?? null,
      email: n.email,
      meno: n.meno ?? null,
      predmet: n.predmet.slice(0, 200),
      kategoria: n.kategoria,
      zdroj: n.zdroj,
      url: n.url ?? null,
      user_agent: n.userAgent ?? null,
      posledna_od: "zakaznik",
      zakaznik_videl_at: new Date().toISOString(),
    })
    .select("id, cislo, odpoved_token")
    .single();
  if (error) throw new Error(error.message);
  const poz = p as unknown as { id: string; cislo: number; odpoved_token: string };

  const { error: e2 } = await supabaseAdmin.from("podpora_spravy" as any).insert({
    poziadavka_id: poz.id,
    autor_id: n.userId,
    od_podpory: false,
    text: n.text.slice(0, 10000),
  });
  if (e2) throw new Error(e2.message);

  if (!n.bezUpozornenia) {
    let firma: string | null = null;
    if (n.companyId) {
      const { data } = await supabaseAdmin
        .from("companies")
        .select("name")
        .eq("id", n.companyId)
        .maybeSingle();
      firma = (data as any)?.name ?? null;
    }
    const c = cisloPoziadavky(poz.cislo);
    await posliMail({
      komu: schrankaPodpory(),
      predmet: `[${c}] ${nazovKategorie(n.kategoria)}: ${n.predmet}`,
      riadky: [
        `Od: ${n.meno ? `${n.meno} <${n.email}>` : n.email}`,
        firma ? `Firma: ${firma}` : "",
        n.url ? `Stránka: ${n.url}` : "",
        n.userAgent ? `Prehliadač: ${n.userAgent}` : "",
      ].filter(Boolean),
      text: n.text,
      odkaz: { url: `${web()}/admin/podpora/${poz.id}`, popis: `Otvoriť ${c} v administrácii` },
      // Odpoveď z pošty podpory ide do vlákna a odtiaľ zákazníkovi.
      odpovedatNa: adresaPreOdpoved(poz.odpoved_token),
    });
    // Potvrdenie zákazníkovi z appky — vie, že správa neodišla do prázdna.
    if (n.userId) {
      await posliMail({
        komu: n.email,
        predmet: `Prijali sme vašu požiadavku ${c}`,
        riadky: [
          `Ďakujeme, požiadavku ${c} sme prijali. Odpoveď uvidíte vo Fakteri aj v e-maile.`,
          "Ak chcete niečo doplniť, stačí odpovedať na tento e-mail.",
        ],
        text: n.text,
        odkaz: { url: `${web()}/podpora/${poz.id}`, popis: "Zobraziť požiadavku" },
        odpovedatNa: adresaPreOdpoved(poz.odpoved_token),
      });
    }
  }
  return { id: poz.id, cislo: poz.cislo };
}

type Poziadavka = {
  id: string;
  cislo: number;
  user_id: string | null;
  email: string;
  predmet: string;
  stav: StavPoziadavky;
  odpoved_token: string;
};

export async function nacitajPoziadavku(id: string): Promise<Poziadavka | null> {
  const { data } = await supabaseAdmin
    .from("podpora_poziadavky" as any)
    .select("id, cislo, user_id, email, predmet, stav, odpoved_token")
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as Poziadavka) ?? null;
}

/** Nová správa vo vlákne; postará sa o stav, „prečítané" aj e-mail druhej strane. */
export async function pridajSpravu(args: {
  poziadavka: Poziadavka;
  autorId: string | null;
  od: "zakaznik" | "podpora";
  text: string;
  interna?: boolean;
  /** Id mailu od Resendu, keď správa prišla e-mailom — opakovaný webhook ju nezdvojí. */
  providerEmailId?: string | null;
}): Promise<{ zapisana: boolean }> {
  const { poziadavka: p, od } = args;
  const interna = od === "podpora" && !!args.interna;
  const { error } = await supabaseAdmin.from("podpora_spravy" as any).insert({
    poziadavka_id: p.id,
    autor_id: args.autorId,
    od_podpory: od === "podpora",
    interna,
    text: args.text.slice(0, 10000),
    provider_email_id: args.providerEmailId ?? null,
    cez_email: !!args.providerEmailId,
  });
  // Tá istá odpoveď z opakovaného webhooku — už je vo vlákne, nič ďalšie.
  if (error && (error as any).code === "23505" && args.providerEmailId) return { zapisana: false };
  if (error) throw new Error(error.message);

  const teraz = new Date().toISOString();
  // Interná poznámka nemení nič, čo vidí zákazník.
  if (interna) {
    await supabaseAdmin
      .from("podpora_poziadavky" as any)
      .update({ podpora_videla_at: teraz, updated_at: teraz })
      .eq("id", p.id);
    return { zapisana: true };
  }
  const stav = stavPoSprave(od, p.stav);
  await supabaseAdmin
    .from("podpora_poziadavky" as any)
    .update({
      stav,
      posledna_od: od,
      posledna_sprava_at: teraz,
      ...(od === "podpora" ? { podpora_videla_at: teraz } : { zakaznik_videl_at: teraz }),
      updated_at: teraz,
    })
    .eq("id", p.id);

  const c = cisloPoziadavky(p.cislo);
  if (od === "podpora") {
    await posliMail({
      komu: p.email,
      predmet: `Re: [${c}] ${p.predmet}`,
      riadky: [`Podpora Faktera odpovedala na vašu požiadavku ${c}.`],
      text: args.text,
      odkaz: p.user_id
        ? { url: `${web()}/podpora/${p.id}`, popis: "Zobraziť vo Fakteri" }
        : undefined,
      // Odpovedať sa dá rovno na e-mail — príde do vlákna.
      odpovedatNa: adresaPreOdpoved(p.odpoved_token),
    });
  } else {
    await posliMail({
      komu: schrankaPodpory(),
      predmet: `Re: [${c}] ${p.predmet}`,
      riadky: [`Zákazník ${p.email} odpísal na ${c}.`],
      text: args.text,
      odkaz: { url: `${web()}/admin/podpora/${p.id}`, popis: `Otvoriť ${c} v administrácii` },
      odpovedatNa: adresaPreOdpoved(p.odpoved_token),
    });
  }
  return { zapisana: true };
}

/** Holý text z HTML tela, keď mail textovú časť nemá. */
function htmlNaText(h: string): string {
  return h
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<blockquote[\s\S]*$/i, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ");
}

/**
 * Odpoveď e-mailom na tajnú adresu požiadavky. Kto píše, rozhoduje odosielateľ:
 * e-mail požiadavky je zákazník, servisná schránka alebo platform admin je
 * podpora. Ktokoľvek iný (preposlaný mail, kolega zákazníka) sa zapíše ako
 * interná poznámka — podpora ho uvidí, zákazníkovi sa nič neodošle.
 */
export async function prijmiOdpovedEmailom(args: {
  emailId: string;
  od: string | null;
  token: string;
}): Promise<"hotovo" | "neznama_adresa" | "chyba"> {
  const { data } = await supabaseAdmin
    .from("podpora_poziadavky" as any)
    .select("id, cislo, user_id, email, predmet, stav, odpoved_token")
    .eq("odpoved_token", args.token)
    .maybeSingle();
  const p = data as unknown as Poziadavka | null;
  if (!p) return "neznama_adresa";

  try {
    const kluc = (process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY)?.trim();
    if (!kluc) throw new Error("RESEND_INBOUND_API_KEY ani RESEND_API_KEY nie je nastavený");
    const { obsahMailu } = await import("./mail-prijem.server");
    const { rozbalTelo } = await import("./mail-potvrdenie");
    const obsah = await obsahMailu(args.emailId, kluc);
    const surovy = rozbalTelo(obsah.text) || htmlNaText(rozbalTelo(obsah.html));
    const text = orezCitaciu(surovy);
    if (!text) {
      console.warn(`[podpora] prázdna odpoveď e-mailom na ${cisloPoziadavky(p.cislo)}`);
      return "hotovo";
    }

    const odosielatelMailu = emailOdosielatela(args.od);
    let od: "zakaznik" | "podpora" = "zakaznik";
    let autorId: string | null = null;
    let interna = false;
    let telo = text;
    if (odosielatelMailu === p.email.toLowerCase()) {
      autorId = p.user_id;
    } else {
      const { data: profil } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", odosielatelMailu)
        .maybeSingle();
      const { data: admin } = profil
        ? await supabaseAdmin
            .from("platform_admins")
            .select("user_id")
            .eq("user_id", profil.id)
            .maybeSingle()
        : { data: null };
      if (admin || odosielatelMailu === schrankaPodpory().toLowerCase()) {
        od = "podpora";
        autorId = profil?.id ?? null;
      } else {
        od = "podpora";
        interna = true;
        telo = `E-mail od ${odosielatelMailu || "neznámeho odosielateľa"} (nie je to zákazník ani podpora):\n\n${text}`;
      }
    }
    await pridajSpravu({
      poziadavka: p,
      autorId,
      od,
      text: telo,
      interna,
      providerEmailId: args.emailId,
    });
    return "hotovo";
  } catch (e: any) {
    console.error(
      `[podpora] odpoveď e-mailom na ${cisloPoziadavky(p.cislo)} zlyhala:`,
      e?.message ?? e,
    );
    return "chyba";
  }
}
