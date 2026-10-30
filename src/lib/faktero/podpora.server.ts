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
  // Zákazník z Telegramu či WhatsAppu bez účtu e-mail nemá — odpoveď dostane len do chatu.
  if (!kluc || !args.komu) return;
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

/**
 * Upozornenie do schránky podpory (platform admini) — napr. že firma udelila
 * dočasný prístup. Bez vlákna help desku; zlyhanie mailu nič nezhodí.
 */
export async function oznamPodpore(args: {
  predmet: string;
  text: string;
  odkaz?: { cesta: string; popis: string };
}): Promise<void> {
  await posliMail({
    komu: schrankaPodpory(),
    predmet: args.predmet,
    riadky: [],
    text: args.text,
    odkaz: args.odkaz ? { url: `${web()}${args.odkaz.cesta}`, popis: args.odkaz.popis } : undefined,
  });
}

export type NovaPoziadavka = {
  userId: string | null;
  companyId?: string | null;
  email: string;
  meno?: string | null;
  predmet: string;
  kategoria: KategoriaPoziadavky;
  zdroj: "aplikacia" | "mobil" | "web" | "telegram" | "whatsapp";
  text: string;
  /** Požiadavka z Telegramu — odpoveď podpory pôjde aj do tohto chatu. */
  telegramChatId?: number | null;
  /** Požiadavka z WhatsAppu (`whatsapp_chaty.id`) — odpoveď podpory pôjde aj tam. */
  whatsappChatId?: string | null;
  url?: string | null;
  userAgent?: string | null;
  /** Prílohy sa nahrávajú až po založení — e-mail podpore len povie, koľko ich príde. */
  pocetPriloh?: number;
  /** Kontaktný formulár si posiela vlastný e-mail — dvakrát netreba. */
  bezUpozornenia?: boolean;
};

export async function zalozPoziadavku(n: NovaPoziadavka): Promise<{ id: string; cislo: number }> {
  const { data: p, error } = await supabaseAdmin
    .from("podpora_poziadavky")
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
      telegram_chat_id: n.telegramChatId ?? null,
      whatsapp_chat_id: n.whatsappChatId ?? null,
      posledna_od: "zakaznik",
      zakaznik_videl_at: new Date().toISOString(),
    })
    .select("id, cislo, odpoved_token")
    .single();
  if (error) throw new Error(error.message);
  const poz = p as unknown as { id: string; cislo: number; odpoved_token: string };

  const { error: e2 } = await supabaseAdmin.from("podpora_spravy").insert({
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
        `Od: ${n.meno ? (n.email ? `${n.meno} <${n.email}>` : n.meno) : n.email}`,
        n.zdroj === "telegram" ? "Zdroj: Telegram (odpoveď z administrácie odíde do chatu)" : "",
        // Telefónne číslo zo WhatsAppu je v `meno` len maskované.
        n.zdroj === "whatsapp"
          ? "Zdroj: WhatsApp (odpoveď z administrácie odíde do WhatsAppu)"
          : "",
        firma ? `Firma: ${firma}` : "",
        n.url ? `Stránka: ${n.url}` : "",
        n.userAgent ? `Prehliadač: ${n.userAgent}` : "",
        n.pocetPriloh ? `Prílohy: ${n.pocetPriloh} (v administrácii)` : "",
      ].filter(Boolean),
      text: n.text,
      odkaz: { url: `${web()}/admin/podpora/${poz.id}`, popis: `Otvoriť ${c} v administrácii` },
      // Odpoveď z pošty podpory ide do vlákna a odtiaľ zákazníkovi.
      odpovedatNa: adresaPreOdpoved(poz.odpoved_token),
    });
    // Potvrdenie zákazníkovi z appky — vie, že správa neodišla do prázdna.
    // Z Telegramu a WhatsAppu sa potvrdzuje priamo v chate.
    if (n.userId && n.email && n.zdroj !== "telegram" && n.zdroj !== "whatsapp") {
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
  // Upozornenie aj do Telegramu (ak je spárovaný) — aj pri kontaktnom formulári.
  await upozorniTelegram({
    text: [
      `Nová požiadavka ${cisloPoziadavky(poz.cislo)} · ${nazovKategorie(n.kategoria)}${
        n.zdroj === "telegram" ? " · z Telegramu" : n.zdroj === "whatsapp" ? " · z WhatsAppu" : ""
      }`,
      // Do Telegramu bez e-mailu zákazníka — Telegram je ďalší sprostredkovateľ údajov.
      `Od: ${n.meno || "zákazník"}`,
      `Predmet: ${n.predmet}`,
      n.pocetPriloh ? `Prílohy: ${n.pocetPriloh}` : "",
      "",
      uryvok(n.text),
    ],
    poziadavkaId: poz.id,
  });
  return { id: poz.id, cislo: poz.cislo };
}

/** Do Telegramu len krátky úryvok — celý text je v administrácii. */
const uryvok = (t: string) => (t.length > 400 ? `${t.slice(0, 399)}…` : t);

/**
 * Upozornenie podpore do Telegramu. Pod ním je výzva na Reply a odkaz do
 * administrácie. Nikdy nič nezhodí — Telegram je len doplnok k e-mailu.
 */
async function upozorniTelegram(args: { text: string[]; poziadavkaId: string }): Promise<void> {
  try {
    const { upozorniAdminovTelegram, odkazAdmin } = await import("./telegram.server");
    await upozorniAdminovTelegram({
      text: [
        ...args.text,
        "",
        "Odpovedzte cez Reply na túto správu — odíde zákazníkovi.",
        odkazAdmin(args.poziadavkaId),
      ].join("\n"),
      poziadavkaId: args.poziadavkaId,
    });
  } catch (e: any) {
    console.error("[podpora] upozornenie do Telegramu zlyhalo:", e?.message ?? e);
  }
}

type Poziadavka = {
  id: string;
  cislo: number;
  user_id: string | null;
  /** Prázdny pri požiadavke z Telegramu bez prepojeného účtu. */
  email: string;
  predmet: string;
  stav: StavPoziadavky;
  odpoved_token: string;
  telegram_chat_id?: number | null;
  whatsapp_chat_id?: string | null;
  meno?: string | null;
};

export async function nacitajPoziadavku(id: string): Promise<Poziadavka | null> {
  const { data } = await supabaseAdmin
    .from("podpora_poziadavky")
    .select(
      "id, cislo, user_id, email, predmet, stav, odpoved_token, telegram_chat_id, whatsapp_chat_id, meno",
    )
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
}): Promise<{ zapisana: boolean; upozornenie?: string }> {
  const { poziadavka: p, od } = args;
  const interna = od === "podpora" && !!args.interna;
  const { data: zapisana, error } = await supabaseAdmin
    .from("podpora_spravy")
    .insert({
      poziadavka_id: p.id,
      autor_id: args.autorId,
      od_podpory: od === "podpora",
      interna,
      text: args.text.slice(0, 10000),
      provider_email_id: args.providerEmailId ?? null,
      cez_email: !!args.providerEmailId,
    })
    .select("created_at")
    .single();
  // Tá istá odpoveď z opakovaného webhooku — už je vo vlákne, nič ďalšie.
  if (error && (error as any).code === "23505" && args.providerEmailId) return { zapisana: false };
  if (error) throw new Error(error.message);

  const teraz = new Date().toISOString();
  // Interná poznámka nemení nič, čo vidí zákazník.
  if (interna) {
    await supabaseAdmin
      .from("podpora_poziadavky")
      .update({ podpora_videla_at: teraz, updated_at: teraz })
      .eq("id", p.id);
    return { zapisana: true };
  }
  const stav = stavPoSprave(od, p.stav);
  await supabaseAdmin
    .from("podpora_poziadavky")
    .update({
      stav,
      posledna_od: od,
      posledna_sprava_at: teraz,
      ...(od === "podpora" ? { podpora_videla_at: teraz } : { zakaznik_videl_at: teraz }),
      updated_at: teraz,
    })
    .eq("id", p.id);

  const c = cisloPoziadavky(p.cislo);
  let upozornenie: string | undefined;
  if (od === "podpora") {
    /*
      Požiadavka z WhatsAppu: voľný text len v 24 h okne od poslednej správy
      zákazníka, mimo neho schválená šablóna. Čo neodíde, admin uvidí ako
      upozornenie a doručí sa, keď zákazník znova napíše.
    */
    if (p.whatsapp_chat_id) {
      try {
        const { posliOdpovedWhatsApp } = await import("./whatsapp.server");
        const r = await posliOdpovedWhatsApp({
          chatId: p.whatsapp_chat_id,
          poziadavkaId: p.id,
          cislo: c,
          text: args.text,
          // Čas správy z databázy — od neho sa nedoručené odpovede pošlú neskôr.
          casSpravy: (zapisana as { created_at: string } | null)?.created_at ?? teraz,
        });
        if (r.stav === "nedorucene")
          upozornenie = p.email ? `${r.dovod} Odpoveď odišla e-mailom.` : r.dovod;
        else if (r.stav === "sablona")
          upozornenie =
            "Zákazník nepísal viac ako 24 hodín — do WhatsAppu odišla len šablóna s číslom požiadavky. Text odpovede dostane, keď odpíše.";
      } catch (e: any) {
        console.error("[podpora] odpoveď do WhatsAppu zlyhala:", e?.message ?? e);
        upozornenie = "Odpoveď do WhatsAppu zlyhala.";
      }
    }
    // Požiadavka z Telegramu: odpoveď ide zákazníkovi aj do jeho chatu.
    if (p.telegram_chat_id) {
      try {
        const { posliOdpovedZakaznikovi } = await import("./telegram.server");
        await posliOdpovedZakaznikovi({ chatId: p.telegram_chat_id, cislo: c, text: args.text });
      } catch (e: any) {
        console.error("[podpora] odpoveď do Telegramu zlyhala:", e?.message ?? e);
      }
    }
    if (p.email) {
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
    }
  } else {
    const kto = p.email || p.meno || (p.whatsapp_chat_id ? "z WhatsAppu" : "z Telegramu");
    await posliMail({
      komu: schrankaPodpory(),
      predmet: `Re: [${c}] ${p.predmet}`,
      riadky: [`Zákazník ${kto} odpísal na ${c}.`],
      text: args.text,
      odkaz: { url: `${web()}/admin/podpora/${p.id}`, popis: `Otvoriť ${c} v administrácii` },
      odpovedatNa: adresaPreOdpoved(p.odpoved_token),
    });
    await upozorniTelegram({
      text: [
        `Nová správa v ${c} od ${p.meno || "zákazníka"}`,
        `Predmet: ${p.predmet}`,
        "",
        uryvok(args.text),
      ],
      poziadavkaId: p.id,
    });
  }
  return { zapisana: true, ...(upozornenie ? { upozornenie } : {}) };
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
    .from("podpora_poziadavky")
    .select(
      "id, cislo, user_id, email, predmet, stav, odpoved_token, telegram_chat_id, whatsapp_chat_id, meno",
    )
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
    /*
      Adresu odosielateľa si vie ktokoľvek napísať. Za podporu (a za zákazníka)
      sa správa ráta len vtedy, keď ju doména odosielateľa podpísala — Resend
      výsledok DMARC posiela v `authentication`. Inak ide do vlákna ako
      interná poznámka, ktorú zákazník nevidí ani nedostane mailom.
    */
    const dmarc = String((obsah as any)?.authentication?.dmarc ?? "").toLowerCase();
    let od: "zakaznik" | "podpora" = "zakaznik";
    let autorId: string | null = null;
    let interna = false;
    let telo = text;
    if (dmarc === "fail") {
      od = "podpora";
      interna = true;
      telo = `E-mail od ${odosielatelMailu || "neznámeho odosielateľa"} neprešiel overením odosielateľa (DMARC) — môže byť podvrhnutý:\n\n${text}`;
    } else if (p.email && odosielatelMailu === p.email.toLowerCase()) {
      autorId = p.user_id;
    } else {
      const { data: profil } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", odosielatelMailu)
        .maybeSingle();
      const { data: admin } = profil
        ? await supabaseAdmin
            .from("platform_admins")
            .select("user_id")
            .eq("user_id", profil.id)
            .maybeSingle()
        : { data: null };
      if ((admin || odosielatelMailu === schrankaPodpory().toLowerCase()) && dmarc === "pass") {
        od = "podpora";
        autorId = profil?.id ?? null;
      } else if (admin || odosielatelMailu === schrankaPodpory().toLowerCase()) {
        od = "podpora";
        interna = true;
        telo = `E-mail z adresy podpory ${odosielatelMailu} bez overenia odosielateľa (DMARC: ${dmarc || "chýba"}) — zákazníkovi sa neposlal:\n\n${text}`;
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
