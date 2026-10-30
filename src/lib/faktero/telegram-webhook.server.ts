/*
  Webhook bota podpory v Telegrame (`/api/public/telegram/webhook`).

  Kto píše:
  - **Spárovaný admin chat** (`telegram_admin_chaty`, párovanie `/admin <kód>`
    z Admin → Podpora): Reply na upozornenie bota je odpoveď podpory v tej
    požiadavke, tlačidlá pri návrhu opravy ho schvália / zamietnu.
  - **Ktokoľvek iný** je zákazník: prvá správa založí požiadavku P-xxxx
    (zdroj `telegram`), ďalšie idú do toho istého vlákna — rovnako ako
    odpovede e-mailom (`prijmiOdpovedEmailom`). Fotky a súbory sú prílohy
    požiadavky v koši `podpora-prilohy`.

  Telegram sa preukazuje len hlavičkou `X-Telegram-Bot-Api-Secret-Token`
  (nastavená cez setWebhook, `scripts/telegram-nastav.mjs`). Text správ píše
  hocikto — rola sa vždy berie z databázy podľa chat_id, nikdy z obsahu.
*/
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isValidCronToken } from "./cron-auth.server";
import { preloz, type Jazyk } from "@/lib/i18n/jazyk";
import { cisloPoziadavky, predmetZoSpravy, type KategoriaPoziadavky } from "./podpora";
import {
  KOS_PODPORY,
  MAX_PRILOHA_PODPORY,
  MAX_PRILOH_NA_POZIADAVKU,
  cestaPrilohyPodpory,
  typPrilohyPodpory,
} from "./podpora-prilohy";
import {
  MAX_NOVYCH_ZA_DEN,
  MAX_NOVYCH_ZA_HODINU_SPOLU,
  MAX_SUBOR_TELEGRAMU,
  StropNaChat,
  cistyTextTelegramu,
  menoZTelegramu,
  najvacsiaFotka,
  rozoberDataTlacidla,
  rozoberPrikaz,
} from "./telegram";
import {
  posliSpravuTelegram,
  pouziKodTelegram,
  pustiTelegram,
  stiahniSuborTelegram,
  volajTelegram,
} from "./telegram.server";

/* Typy z Bot API — len to, čo naozaj čítame. */
type TgUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};
type TgMessage = {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  caption?: string;
  photo?: { file_id: string; file_size?: number; width?: number; height?: number }[];
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  reply_to_message?: { message_id: number };
};
type TgCallback = {
  id: string;
  from: TgUser;
  data?: string;
  message?: { message_id: number; chat: { id: number } };
};
export type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: TgCallback };

/*
  Stropy držia v databáze (`pustiTelegram`); objekty v pamäti sú len záloha,
  keď databáza neodpovie.
*/
/** Správy zákazníka: najviac 20 za 10 minút na chat. */
const SPRAVY = { max: 20, oknoMs: 10 * 60_000 };
const stropSprav = new StropNaChat(SPRAVY.max, SPRAVY.oknoMs);
/** Pokusy o spárovanie: 5 za 10 minút — kód sa nedá skúšať naslepo. */
const PAROVANIE = { max: 5, oknoMs: 10 * 60_000 };
const stropParovania = new StropNaChat(PAROVANIE.max, PAROVANIE.oknoMs);
/** Nové požiadavky zo všetkých chatov spolu za hodinu (chat 0 = spolu). */
const stropNovychSpolu = new StropNaChat(MAX_NOVYCH_ZA_HODINU_SPOLU, 3_600_000);

/** Jazyk odpovedí bota podľa nastavenia Telegramu; inak slovenčina. */
function jazyk(from?: TgUser): Jazyk {
  const k = String(from?.language_code ?? "").toLowerCase();
  if (k.startsWith("cs")) return "cs";
  if (k.startsWith("de")) return "de";
  return "sk";
}

const odpovedz = (msg: TgMessage, text: string) =>
  posliSpravuTelegram(msg.chat.id, text, { odpovedNa: msg.message_id });

/* -------------------------------------------------------------- vstup */

/** Správy jedného chatu sa spracúvajú po poradí — album fotiek nezaloží päť požiadaviek. */
const fronty = new Map<number, Promise<unknown>>();

function doFronty(chatId: number, praca: () => Promise<unknown>): Promise<unknown> {
  const predosla = fronty.get(chatId) ?? Promise.resolve();
  const dalsia = predosla.then(praca, praca);
  fronty.set(chatId, dalsia);
  void dalsia.finally(() => {
    if (fronty.get(chatId) === dalsia) fronty.delete(chatId);
  });
  return dalsia;
}

export async function prijmiWebhookTelegramu(
  request: Request,
  o: { cakat?: boolean } = {},
): Promise<Response> {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const tajomstvo = request.headers.get("x-telegram-bot-api-secret-token");
  if (!isValidCronToken(tajomstvo, process.env.TELEGRAM_WEBHOOK_SECRET?.trim())) {
    console.warn("[telegram] odmietnuté – nesedí tajomstvo webhooku");
    return new Response("unauthorized", { status: 401 });
  }
  let u: TgUpdate;
  try {
    u = JSON.parse(await request.text());
  } catch {
    return new Response("bad body", { status: 400 });
  }
  if (typeof u?.update_id !== "number") return new Response("bad body", { status: 400 });

  // Telegram pri chybe doručuje znova — tá istá správa sa spracuje len raz.
  const { error } = await supabaseAdmin.from("telegram_updaty").insert({ update_id: u.update_id });
  if (error) {
    if ((error as { code?: string }).code === "23505") return new Response("ok", { status: 200 });
    console.error("[telegram] update_id sa nepodarilo zapísať:", error.message);
    return new Response("error", { status: 500 });
  }

  // Občas upratať — na zdvojenie stačí pamätať si posledný týždeň.
  if (Math.random() < 0.01) {
    void supabaseAdmin
      .from("telegram_updaty")
      .delete()
      .lt("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .then(({ error: e }) => e && console.warn("[telegram] upratanie update_id:", e.message));
  }

  const chatId = u.message?.chat?.id ?? u.callback_query?.message?.chat?.id ?? 0;
  const praca = doFronty(chatId, () => spracujUpdate(u)).catch((e) =>
    console.error("[telegram] spracovanie zlyhalo:", e?.message ?? e),
  );
  // Telegram čaká na odpoveď krátko; sťahovanie príloh beží na pozadí.
  if (o.cakat) await praca;
  return new Response("ok", { status: 200 });
}

export type Vysledok =
  | "ignorovane"
  | "strop"
  | "sparovane"
  | "neplatny_kod"
  | "nova_poziadavka"
  | "do_vlakna"
  | "odpoved_podpory"
  | "info"
  | "odmietnute"
  | "rozhodnute";

export async function spracujUpdate(u: TgUpdate): Promise<Vysledok> {
  if (u.callback_query) return spracujTlacidlo(u.callback_query);
  const msg = u.message;
  // Len súkromné chaty s človekom — skupiny a kanály ignorujeme.
  if (!msg || msg.chat?.type !== "private" || !msg.from || msg.from.is_bot) return "ignorovane";
  const chatId = msg.chat.id;
  const prikaz = rozoberPrikaz(msg.text ?? msg.caption);

  if (prikaz.druh === "admin") {
    if (!(await pustiTelegram(chatId, "parovanie", PAROVANIE.max, PAROVANIE.oknoMs, stropParovania)))
      return "strop";
    return parujAdmina(msg, prikaz.kod);
  }

  const { data: admin } = await supabaseAdmin
    .from("telegram_admin_chaty")
    .select("chat_id, user_id")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (admin) return spracujAdmina(msg, (admin as { user_id: string }).user_id);

  if (!(await pustiTelegram(chatId, "spravy", SPRAVY.max, SPRAVY.oknoMs, stropSprav))) {
    console.warn(`[telegram] chat ${chatId} prekročil strop správ`);
    return "strop";
  }
  return spracujZakaznika(msg, prikaz);
}

/* --------------------------------------------------------------- admin */

async function jePlatformAdmin(userId: string): Promise<{ role: string } | null> {
  const { data } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role: string } | null) ?? null;
}

async function parujAdmina(msg: TgMessage, kod: string | null): Promise<Vysledok> {
  const j = jazyk(msg.from);
  const userId = await pouziKodTelegram(kod, "admin");
  if (!userId || !(await jePlatformAdmin(userId))) {
    await odpovedz(
      msg,
      preloz(j, "Kód neplatí alebo vypršal. Vyrobte nový v Admin → Podpora → Telegram."),
    );
    return "neplatny_kod";
  }
  const { meno, username } = menoZTelegramu(msg.from);
  const { error } = await supabaseAdmin
    .from("telegram_admin_chaty")
    .upsert({ chat_id: msg.chat.id, user_id: userId, meno, username }, { onConflict: "chat_id" });
  if (error) throw new Error(error.message);
  // Ten istý chat už nie je zákazník — správy z neho idú ako odpovede podpory.
  await supabaseAdmin.from("telegram_chaty").delete().eq("chat_id", msg.chat.id);
  await odpovedz(
    msg,
    preloz(
      j,
      "Spárované. Sem budú chodiť nové požiadavky, správy zákazníkov a návrhy automatických opráv. Na upozornenie odpovedzte cez Reply — odpoveď odíde zákazníkovi.",
    ),
  );
  return "sparovane";
}

async function spracujAdmina(msg: TgMessage, userId: string): Promise<Vysledok> {
  const j = jazyk(msg.from);
  // Účet medzitým prestal byť adminom — chat už nič nesmie.
  if (!(await jePlatformAdmin(userId))) {
    await supabaseAdmin.from("telegram_admin_chaty").delete().eq("chat_id", msg.chat.id);
    await odpovedz(msg, preloz(j, "Tento chat už nie je spárovaný s administrátorom."));
    return "odmietnute";
  }
  const naSpravu = msg.reply_to_message?.message_id;
  if (!naSpravu) {
    await odpovedz(
      msg,
      preloz(
        j,
        "Na odpoveď zákazníkovi použite Reply na upozornenie k požiadavke. Celé vlákno je v Admin → Podpora.",
      ),
    );
    return "info";
  }
  const { data: vazba } = await supabaseAdmin
    .from("telegram_spravy_bota")
    .select("poziadavka_id")
    .eq("chat_id", msg.chat.id)
    .eq("message_id", naSpravu)
    .maybeSingle();
  const poziadavkaId = (vazba as { poziadavka_id: string | null } | null)?.poziadavka_id;
  if (!poziadavkaId) {
    await odpovedz(msg, preloz(j, "K tejto správe nepatrí žiadna požiadavka."));
    return "info";
  }
  const text = cistyTextTelegramu(msg.text ?? msg.caption, 10000);
  if (!text) {
    await odpovedz(
      msg,
      preloz(j, "Odpoveď musí obsahovať text. Prílohy pridajte v administrácii."),
    );
    return "info";
  }
  const { nacitajPoziadavku, pridajSpravu } = await import("./podpora.server");
  const p = await nacitajPoziadavku(poziadavkaId);
  if (!p) {
    await odpovedz(msg, preloz(j, "Požiadavka sa nenašla."));
    return "info";
  }
  await pridajSpravu({ poziadavka: p, autorId: userId, od: "podpora", text });
  await odpovedz(
    msg,
    preloz(j, "Odoslané zákazníkovi ({cislo}).", { cislo: cisloPoziadavky(p.cislo) }),
  );
  return "odpoved_podpory";
}

async function spracujTlacidlo(cq: TgCallback): Promise<Vysledok> {
  const j = jazyk(cq.from);
  const odpoved = (text: string) =>
    volajTelegram("answerCallbackQuery", {
      callback_query_id: cq.id,
      text: text.slice(0, 190),
      show_alert: true,
    });
  const chatId = cq.message?.chat?.id;
  const data = rozoberDataTlacidla(cq.data);
  /*
    Tlačidlo platí len v súkromnom chate spárovaného admina (chat_id = id
    človeka, ktorý klikol) a len na správe, ktorú bot k tomu návrhu poslal.
  */
  const { data: admin } =
    chatId && chatId === cq.from?.id
      ? await supabaseAdmin
          .from("telegram_admin_chaty")
          .select("user_id")
          .eq("chat_id", chatId)
          .maybeSingle()
      : { data: null };
  const userId = (admin as { user_id: string } | null)?.user_id;
  if (!data || !userId || !cq.message) {
    await odpoved(preloz(j, "Tento chat nie je spárovaný s administrátorom."));
    return "odmietnute";
  }
  const { data: vazba } = await supabaseAdmin
    .from("telegram_spravy_bota")
    .select("auto_oprava_id")
    .eq("chat_id", chatId!)
    .eq("message_id", cq.message.message_id)
    .maybeSingle();
  if ((vazba as { auto_oprava_id: string | null } | null)?.auto_oprava_id !== data.id) {
    await odpoved(preloz(j, "Toto tlačidlo už neplatí."));
    return "odmietnute";
  }

  // Schválenie (nasadenie kódu) len v administrácii s 2FA a rozdielom v kóde.
  if (data.akcia === "schvalit") {
    await odpoved(
      preloz(j, "Schváliť a nasadiť sa dá len v administrácii (Admin → Podpora), kde vidíte zmeny v kóde."),
    );
    return "odmietnute";
  }
  const { rozhodniOAutoOprave, ChybaRozhodnutia } =
    await import("./auto-oprava-rozhodnutie.server");
  try {
    await rozhodniOAutoOprave({ userId, id: data.id, akcia: data.akcia });
  } catch (e) {
    if (e instanceof ChybaRozhodnutia) {
      await odpoved(preloz(j, e.message));
      return "odmietnute";
    }
    throw e;
  }
  const hotovo = preloz(j, "Návrh opravy je zamietnutý.");
  await odpoved(hotovo);
  // Tlačidlá zmiznú, aby sa nedalo kliknúť druhýkrát.
  await volajTelegram("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: cq.message.message_id,
    reply_markup: { inline_keyboard: [] },
  });
  await posliSpravuTelegram(chatId!, hotovo, { odpovedNa: cq.message.message_id });
  return "rozhodnute";
}

/* ------------------------------------------------------------ zákazník */

type ChatZakaznika = { chat_id: number; user_id: string | null; poziadavka_id: string | null };

type Priloha = { fileId: string; nazov: string; mime: string; velkost: number | null };

/** Fotka alebo dokument zo správy (bez stiahnutia). */
function prilohaZoSpravy(msg: TgMessage): Priloha | null {
  if (msg.document) {
    return {
      fileId: msg.document.file_id,
      nazov: cistyTextTelegramu(msg.document.file_name || "subor", 200) || "subor",
      mime: msg.document.mime_type ?? "",
      velkost: msg.document.file_size ?? null,
    };
  }
  const f = najvacsiaFotka(msg.photo, MAX_PRILOHA_PODPORY);
  if (f) {
    return {
      fileId: f.file_id,
      nazov: `telegram-${msg.message_id}.jpg`,
      mime: "image/jpeg",
      velkost: f.file_size ?? null,
    };
  }
  // Fotka, z ktorej sa nezmestí ani najmenšia veľkosť.
  if (msg.photo?.length) {
    return { fileId: "", nazov: "foto.jpg", mime: "image/jpeg", velkost: MAX_SUBOR_TELEGRAMU };
  }
  return null;
}

const UVITANIE =
  "Dobrý deň, toto je podpora Faktera. Napíšte nám otázku alebo popis problému — založíme požiadavku a odpoveď vám príde sem. Poslať môžete aj snímku obrazovky alebo PDF.\n\n/chyba — nahlásiť chybu v aplikácii\n/nova — začať novú požiadavku\n\nAk máte účet vo Fakteri, chat si prepojte v Pomoc a podpora → Napíšte nám na Telegram.";

async function spracujZakaznika(
  msg: TgMessage,
  prikaz: ReturnType<typeof rozoberPrikaz>,
): Promise<Vysledok> {
  const j = jazyk(msg.from);
  const chatId = msg.chat.id;
  const { meno, username } = menoZTelegramu(msg.from);

  const { data: existujuci } = await supabaseAdmin
    .from("telegram_chaty")
    .select("chat_id, user_id, poziadavka_id")
    .eq("chat_id", chatId)
    .maybeSingle();
  let chat = existujuci as ChatZakaznika | null;
  if (chat) {
    await supabaseAdmin
      .from("telegram_chaty")
      .update({ meno, username, updated_at: new Date().toISOString() })
      .eq("chat_id", chatId);
  } else {
    const { error } = await supabaseAdmin
      .from("telegram_chaty")
      .insert({ chat_id: chatId, meno, username });
    if (error) throw new Error(error.message);
    chat = { chat_id: chatId, user_id: null, poziadavka_id: null };
  }

  if (prikaz.druh === "start" && prikaz.kod) {
    const userId = await pouziKodTelegram(prikaz.kod, "zakaznik");
    if (!userId) {
      await odpovedz(
        msg,
        preloz(
          j,
          "Kód na prepojenie neplatí alebo vypršal. Vyrobte nový vo Fakteri v Pomoc a podpora.",
        ),
      );
      return "neplatny_kod";
    }
    await supabaseAdmin.from("telegram_chaty").update({ user_id: userId }).eq("chat_id", chatId);
    await odpovedz(
      msg,
      preloz(
        j,
        "Chat je prepojený s vaším účtom vo Fakteri. Napíšte nám, s čím potrebujete pomôcť.",
      ),
    );
    return "sparovane";
  }
  if (prikaz.druh === "start" || prikaz.druh === "pomoc") {
    await odpovedz(msg, preloz(j, UVITANIE));
    return "info";
  }
  if (prikaz.druh === "nova") {
    await supabaseAdmin
      .from("telegram_chaty")
      .update({ poziadavka_id: null })
      .eq("chat_id", chatId);
    await odpovedz(msg, preloz(j, "Dobre. Ďalšia správa založí novú požiadavku."));
    return "info";
  }

  const text = cistyTextTelegramu("text" in prikaz ? prikaz.text : "");
  const priloha = prilohaZoSpravy(msg);
  const kategoria: KategoriaPoziadavky = prikaz.druh === "chyba" ? "chyba" : "otazka";

  const { nacitajPoziadavku, pridajSpravu, zalozPoziadavku } = await import("./podpora.server");
  const otvorena = chat.poziadavka_id ? await nacitajPoziadavku(chat.poziadavka_id) : null;
  const vlakno =
    otvorena && otvorena.stav !== "vyriesena" && otvorena.telegram_chat_id === chatId
      ? otvorena
      : null;

  // „/chyba“ bez textu v otvorenej požiadavke ju len preradí — uvidí ju automatická oprava.
  if (prikaz.druh === "chyba" && !text && !priloha) {
    if (vlakno) {
      await supabaseAdmin
        .from("podpora_poziadavky")
        .update({ kategoria: "chyba", updated_at: new Date().toISOString() })
        .eq("id", vlakno.id)
        .eq("kategoria", "otazka");
      await odpovedz(
        msg,
        preloz(j, "Požiadavku {cislo} sme označili ako chybu v aplikácii.", {
          cislo: cisloPoziadavky(vlakno.cislo),
        }),
      );
    } else {
      await odpovedz(msg, preloz(j, "Popíšte chybu: čo ste robili, čo sa stalo a čo ste čakali."));
    }
    return "info";
  }
  if (!text && !priloha) {
    await odpovedz(msg, preloz(j, "Pošlite nám text, fotku alebo súbor (obrázok alebo PDF)."));
    return "info";
  }
  const telo = text || "(príloha z Telegramu)";

  let poziadavkaId: string;
  let cislo: number;
  let vysledok: Vysledok;
  if (vlakno) {
    await pridajSpravu({ poziadavka: vlakno, autorId: vlakno.user_id, od: "zakaznik", text: telo });
    if (prikaz.druh === "chyba") {
      await supabaseAdmin
        .from("podpora_poziadavky")
        .update({ kategoria: "chyba" })
        .eq("id", vlakno.id)
        .eq("kategoria", "otazka");
    }
    poziadavkaId = vlakno.id;
    cislo = vlakno.cislo;
    vysledok = "do_vlakna";
  } else {
    const odVcera = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await supabaseAdmin
      .from("podpora_poziadavky")
      .select("id", { count: "exact", head: true })
      .eq("telegram_chat_id", chatId)
      .gte("created_at", odVcera);
    if ((count ?? 0) >= MAX_NOVYCH_ZA_DEN) {
      await odpovedz(
        msg,
        preloz(
          j,
          "Za posledný deň ste založili veľa požiadaviek. Skúste to prosím neskôr alebo nám napíšte na servis@faktero.sk.",
        ),
      );
      return "strop";
    }
    if (
      !(await pustiTelegram(0, "nove_spolu", MAX_NOVYCH_ZA_HODINU_SPOLU, 3_600_000, stropNovychSpolu))
    ) {
      console.warn("[telegram] prekročený spoločný strop nových požiadaviek za hodinu");
      await odpovedz(
        msg,
        preloz(
          j,
          "Práve prijímame veľa požiadaviek naraz. Skúste to prosím o chvíľu znova alebo nám napíšte na servis@faktero.sk.",
        ),
      );
      return "strop";
    }
    const { data: profil } = chat.user_id
      ? await supabaseAdmin
          .from("profiles")
          .select("email, full_name")
          .eq("id", chat.user_id)
          .maybeSingle()
      : { data: null };
    const pr = profil as { email: string | null; full_name: string | null } | null;
    const nova = await zalozPoziadavku({
      userId: chat.user_id,
      email: pr?.email ?? "",
      meno: pr?.full_name ? `${pr.full_name} · ${meno}` : meno,
      predmet: predmetZoSpravy(telo),
      kategoria,
      zdroj: "telegram",
      text: telo,
      url: username ? `https://t.me/${username}` : null,
      userAgent: "Telegram",
      telegramChatId: chatId,
      pocetPriloh: priloha ? 1 : 0,
    });
    await supabaseAdmin
      .from("telegram_chaty")
      .update({ poziadavka_id: nova.id, updated_at: new Date().toISOString() })
      .eq("chat_id", chatId);
    poziadavkaId = nova.id;
    cislo = nova.cislo;
    vysledok = "nova_poziadavka";
  }

  let chybaPrilohy: string | null = null;
  if (priloha) chybaPrilohy = await ulozPrilohu(poziadavkaId, priloha, chat.user_id, j);

  const c = cisloPoziadavky(cislo);
  const riadky =
    vysledok === "nova_poziadavka"
      ? [
          preloz(
            j,
            "Ďakujeme, založili sme požiadavku {cislo}. Odpoveď vám príde sem. Ďalšie správy pridáme do tej istej požiadavky, novú začnete príkazom /nova.",
            { cislo: c },
          ),
          kategoria === "otazka" ? preloz(j, "Ak ide o chybu v aplikácii, pošlite /chyba.") : "",
        ]
      : [];
  if (chybaPrilohy) riadky.push(chybaPrilohy);
  const odpoved = riadky.filter(Boolean).join("\n\n");
  if (odpoved) await odpovedz(msg, odpoved);
  return vysledok;
}

/** Uloží prílohu k poslednej správe zákazníka. Vráti dôvod odmietnutia pre zákazníka, alebo `null`. */
async function ulozPrilohu(
  poziadavkaId: string,
  p: Priloha,
  userId: string | null,
  j: Jazyk,
): Promise<string | null> {
  const typ = typPrilohyPodpory(p.mime, p.nazov);
  if (!typ)
    return preloz(j, "Súbor {nazov} sme neuložili — prijímame obrázky a PDF.", { nazov: p.nazov });
  if (!p.fileId || (p.velkost != null && p.velkost > MAX_PRILOHA_PODPORY))
    return preloz(j, "Súbor {nazov} je väčší než 10 MB, neuložili sme ho.", { nazov: p.nazov });

  const { count } = await supabaseAdmin
    .from("podpora_prilohy")
    .select("id", { count: "exact", head: true })
    .eq("poziadavka_id", poziadavkaId);
  if ((count ?? 0) >= MAX_PRILOH_NA_POZIADAVKU)
    return preloz(j, "K požiadavke sa dá priložiť najviac {max} súborov.", {
      max: MAX_PRILOH_NA_POZIADAVKU,
    });

  const subor = await stiahniSuborTelegram(p.fileId, MAX_PRILOHA_PODPORY);
  if (!subor)
    return preloz(j, "Súbor {nazov} sa nepodarilo stiahnuť. Skúste ho poslať znova.", {
      nazov: p.nazov,
    });

  const { data: sprava } = await supabaseAdmin
    .from("podpora_spravy")
    .select("id")
    .eq("poziadavka_id", poziadavkaId)
    .eq("od_podpory", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cesta = cestaPrilohyPodpory(poziadavkaId, typ);
  const { error: chybaUlozenia } = await supabaseAdmin.storage
    .from(KOS_PODPORY)
    .upload(cesta, subor.bajty, { contentType: typ, upsert: false });
  if (chybaUlozenia) {
    console.error("[telegram] príloha sa neuložila:", chybaUlozenia.message);
    return preloz(j, "Súbor {nazov} sa nepodarilo uložiť. Skúste ho poslať znova.", {
      nazov: p.nazov,
    });
  }
  const { error } = await supabaseAdmin.from("podpora_prilohy").insert({
    poziadavka_id: poziadavkaId,
    sprava_id: (sprava as { id: string } | null)?.id ?? null,
    path: cesta,
    name: p.nazov,
    mime: typ,
    size: subor.bajty.length,
    created_by: userId,
  });
  if (error) {
    await supabaseAdmin.storage.from(KOS_PODPORY).remove([cesta]);
    console.error("[telegram] riadok prílohy sa neuložil:", error.message);
    return preloz(j, "Súbor {nazov} sa nepodarilo uložiť. Skúste ho poslať znova.", {
      nazov: p.nazov,
    });
  }
  return null;
}
