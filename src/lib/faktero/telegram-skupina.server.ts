/*
  Telegram — režim skupiny. Bot je v jednej skupine, kde účtovníci hlásia
  problémy; podpora si ich správy číta v Admin → Podpora → Telegram skupina.

  Pravidlá (skupinu číta veľa ľudí, nikto z nich nie je overený):
  - zo skupiny **nikdy** nevznikne požiadavka P-xxxx a bot do nej nepíše —
    jediná výnimka je potvrdenie úspešného spárovania;
  - ukladá sa len zo skupiny, ktorú spároval platform admin príkazom
    `/skupina <kód>` a ktorá je zapnutá. Z neznámej skupiny sa neuloží nič;
  - kto je admin, sa zisťuje podľa odosielateľa (`from.id`): musí mať
    spárovaný súkromný chat (`telegram_admin_chaty`, chat_id = id človeka)
    a byť stále v `platform_admins` (`adminChaty`). Kód musí patriť jemu.
    Kto sa takto nepreukáže, je ignorovaný a kód sa nespotrebuje;
  - neúspech spárovania sa adminovi oznámi do jeho súkromného chatu, nie do
    skupiny.
*/
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  KOS_PODPORY,
  MAX_PRILOHA_PODPORY,
  TYPY_PODPORY,
  obsahZodpovedaTypu,
  typPrilohyPodpory,
} from "./podpora-prilohy";
import {
  MAX_SUBOR_TELEGRAMU,
  PREDPONA_SKUPINY,
  StropNaChat,
  cistyTextTelegramu,
  menoZTelegramu,
  najvacsiaFotka,
  rozoberPrikaz,
} from "./telegram";
import {
  adminChaty,
  posliSpravuTelegram,
  pouziKodTelegram,
  pustiTelegram,
  stiahniSuborTelegram,
} from "./telegram.server";
import type { TgMessage, Vysledok } from "./telegram-webhook.server";

/** Správy zo skupiny: najviac 300 za 10 minút — aby sa skupinou nedalo zaplniť úložisko. */
const SPRAVY_SKUPINY = { max: 300, oknoMs: 10 * 60_000 };
const stropSkupiny = new StropNaChat(SPRAVY_SKUPINY.max, SPRAVY_SKUPINY.oknoMs);
/** Pokusy adminov o spárovanie skupiny. */
const PAROVANIE = { max: 5, oknoMs: 10 * 60_000 };
const stropParovania = new StropNaChat(PAROVANIE.max, PAROVANIE.oknoMs);

/** Príloha uložená pri správe (cesta v koši `podpora-prilohy`), alebo dôvod, prečo nie. */
export type PrilohaSkupiny = {
  nazov: string;
  mime: string | null;
  velkost: number | null;
  path?: string;
  chyba?: "typ" | "velky" | "stiahnutie" | "ulozenie";
};

/** Nazov skupiny z Telegramu (na jeden riadok). */
const nazovSkupiny = (v: unknown) => cistyTextTelegramu(v, 200).replace(/\s+/g, " ") || null;

/** Text správy; pri médiách bez textu aspoň čo prišlo, aby riadok nebol prázdny. */
function textSpravy(msg: TgMessage): string {
  const t = cistyTextTelegramu(msg.text ?? msg.caption);
  if (t) return t;
  if (msg.voice) return "[hlasová správa]";
  if (msg.video || msg.video_note) return "[video]";
  if (msg.audio) return "[zvuk]";
  if (msg.sticker) return "[nálepka]";
  return "";
}

type Kandidat = { fileId: string; nazov: string; mime: string; velkost: number | null };

function prilohaZoSpravy(msg: TgMessage): Kandidat | { privelka: true } | null {
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
  if (msg.photo?.length) return { privelka: true };
  return null;
}

/** Stiahne prílohu do súkromného koša; nikdy nevyhodí — vráti záznam s dôvodom. */
async function ulozPrilohu(chatId: number, msg: TgMessage): Promise<PrilohaSkupiny | null> {
  const k = prilohaZoSpravy(msg);
  if (!k) return null;
  if ("privelka" in k)
    return { nazov: "foto.jpg", mime: "image/jpeg", velkost: MAX_SUBOR_TELEGRAMU, chyba: "velky" };
  const zaklad = { nazov: k.nazov, mime: k.mime || null, velkost: k.velkost };
  // Kôš prijme len obrázky a PDF do 10 MB — ostatné zapíšeme len menom.
  const typ = typPrilohyPodpory(k.mime, k.nazov);
  if (!typ) return { ...zaklad, chyba: "typ" };
  if (k.velkost != null && k.velkost > MAX_PRILOHA_PODPORY) return { ...zaklad, chyba: "velky" };
  const subor = await stiahniSuborTelegram(k.fileId, MAX_PRILOHA_PODPORY);
  if (!subor) return { ...zaklad, chyba: "stiahnutie" };
  if (!obsahZodpovedaTypu(typ, subor.bajty)) return { ...zaklad, chyba: "typ" };
  const cesta = `${PREDPONA_SKUPINY}${chatId}/${crypto.randomUUID()}.${TYPY_PODPORY[typ] ?? "bin"}`;
  const { error } = await supabaseAdmin.storage
    .from(KOS_PODPORY)
    .upload(cesta, subor.bajty, { contentType: typ, upsert: false });
  if (error) {
    console.error("[telegram] príloha zo skupiny sa neuložila:", error.message);
    return { ...zaklad, chyba: "ulozenie" };
  }
  return { ...zaklad, mime: typ, velkost: subor.bajty.length, path: cesta };
}

/**
 * Správa (alebo jej úprava) zo skupiny / supergroup. Bot v skupine mlčí;
 * vracia len, čo sa stalo (pre testy a logy).
 */
export async function spracujSkupinu(msg: TgMessage, upravena: boolean): Promise<Vysledok> {
  const chatId = msg.chat.id;

  // Skupina prešla na supergroup — Telegram jej dal nové id; správy idú kaskádou.
  if (msg.migrate_to_chat_id) {
    await supabaseAdmin
      .from("telegram_skupiny")
      .update({ chat_id: msg.migrate_to_chat_id })
      .eq("chat_id", chatId);
    return "ignorovane";
  }
  if (!msg.from || msg.from.is_bot) return "ignorovane";

  const prikaz = rozoberPrikaz(msg.text ?? msg.caption);
  if (prikaz.druh === "skupina") return upravena ? "ignorovane" : parujSkupinu(msg, prikaz.kod);
  // Párovacie kódy sa do zoznamu neukladajú.
  if (prikaz.druh === "admin") return "ignorovane";

  const { data: skupina } = await supabaseAdmin
    .from("telegram_skupiny")
    .select("chat_id, aktivna")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (!skupina || !(skupina as { aktivna: boolean }).aktivna) return "ignorovane";

  if (msg.new_chat_title) {
    await supabaseAdmin
      .from("telegram_skupiny")
      .update({ nazov: nazovSkupiny(msg.new_chat_title) })
      .eq("chat_id", chatId);
    return "ignorovane";
  }

  if (upravena) {
    const { data } = await supabaseAdmin
      .from("telegram_skupiny_spravy")
      .update({
        text: textSpravy(msg) || null,
        upravene_at: new Date((msg.edit_date ?? Date.now() / 1000) * 1000).toISOString(),
      })
      .eq("chat_id", chatId)
      .eq("message_id", msg.message_id)
      .select("id");
    return (data ?? []).length ? "upravene" : "ignorovane";
  }

  const text = textSpravy(msg);
  const maPrilohu = !!(msg.document || msg.photo?.length);
  // Služobné správy (pridal sa člen, pripnutie…) neukladáme.
  if (!text && !maPrilohu) return "ignorovane";

  if (
    !(await pustiTelegram(
      chatId,
      "skupina",
      SPRAVY_SKUPINY.max,
      SPRAVY_SKUPINY.oknoMs,
      stropSkupiny,
    ))
  ) {
    console.warn(`[telegram] skupina ${chatId} prekročila strop správ`);
    return "strop";
  }

  const { meno, username } = menoZTelegramu(msg.from);
  const { data: riadok, error } = await supabaseAdmin
    .from("telegram_skupiny_spravy")
    .insert({
      chat_id: chatId,
      message_id: msg.message_id,
      od_id: msg.from.id,
      od_meno: meno,
      od_username: username,
      text: text || null,
      odpoved_na: msg.reply_to_message?.message_id ?? null,
      ...(msg.date ? { created_at: new Date(msg.date * 1000).toISOString() } : {}),
    })
    .select("id")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return "ignorovane";
    throw new Error(error.message);
  }

  if (maPrilohu) {
    const p = await ulozPrilohu(chatId, msg);
    if (p) {
      await supabaseAdmin
        .from("telegram_skupiny_spravy")
        .update({ prilohy: [p] })
        .eq("id", (riadok as { id: string }).id);
    }
  }
  return "ulozene";
}

async function parujSkupinu(msg: TgMessage, kod: string | null): Promise<Vysledok> {
  // Odosielateľ musí byť spárovaný admin — inak ticho a kód ostane nespotrebovaný.
  const admin = (await adminChaty()).find((c) => c.chat_id === msg.from!.id);
  if (!admin) return "ignorovane";
  if (
    !(await pustiTelegram(
      admin.chat_id,
      "parovanie_skupiny",
      PAROVANIE.max,
      PAROVANIE.oknoMs,
      stropParovania,
    ))
  )
    return "strop";
  const userId = await pouziKodTelegram(kod, "skupina");
  if (!userId || userId !== admin.user_id) {
    await posliSpravuTelegram(
      admin.chat_id,
      "Skupinu sa nepodarilo spárovať: kód neplatí, vypršal alebo patrí inému účtu. Vyrobte nový v Admin → Podpora → Telegram skupina.",
    );
    return "neplatny_kod";
  }
  const { error } = await supabaseAdmin.from("telegram_skupiny").upsert(
    {
      chat_id: msg.chat.id,
      nazov: nazovSkupiny(msg.chat.title),
      aktivna: true,
      sparoval: userId,
    },
    { onConflict: "chat_id" },
  );
  if (error) throw new Error(error.message);
  // Jediná správa, ktorú bot do skupiny pošle.
  await posliSpravuTelegram(
    msg.chat.id,
    "Skupina je prepojená s podporou Faktera. Správy z nej si prečítame; bot sem nebude odpovedať.",
  );
  return "sparovane";
}
