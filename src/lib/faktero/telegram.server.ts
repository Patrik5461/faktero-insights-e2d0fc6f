/*
  Telegram Bot API — volania bota a upozornenia pre podporu.

  Token je v `TELEGRAM_BOT_TOKEN`. Kým nie je nastavený, všetko tu potichu
  nerobí nič: Telegram je doplnok k e-mailu a nikdy nesmie zhodiť pôvodnú
  akciu (uloženie požiadavky, odpoveď podpory).

  Správy idú bez `parse_mode` — holý text, takže meno či text zákazníka
  nemôže v Telegrame nič naformátovať ani podvrhnúť odkaz.
*/
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  PLATNOST_KODU_MIN,
  StropNaChat,
  dataTlacidla,
  novyKod,
  normalizujKod,
  textPreTelegram,
  type AkciaTlacidla,
} from "./telegram";

const API = "https://api.telegram.org";

export const tokenBota = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
export const menoBota = () =>
  process.env.TELEGRAM_BOT_USERNAME?.trim()
    .replace(/^@/, "")
    .replace(/[^A-Za-z0-9_]/g, "") || null;
export const jeTelegramNastaveny = () => !!tokenBota();

/** Volanie metódy Bot API. Vracia `result`, alebo `null`, keď to nevyšlo (zaloguje). */
export async function volajTelegram<T = any>(
  metoda: string,
  telo: Record<string, unknown>,
): Promise<T | null> {
  const token = tokenBota();
  if (!token) return null;
  try {
    const r = await fetch(`${API}/bot${token}/${metoda}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(telo),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json().catch(() => null)) as {
      ok?: boolean;
      result?: T;
      description?: string;
    } | null;
    if (!r.ok || !j?.ok) {
      console.error(
        `[telegram] ${metoda} zlyhal`,
        r.status,
        String(j?.description ?? "").slice(0, 200),
      );
      return null;
    }
    return (j.result ?? null) as T | null;
  } catch (e: any) {
    console.error(`[telegram] ${metoda} zlyhal:`, e?.message ?? e);
    return null;
  }
}

type Tlacidlo = { text: string; callback_data: string };

/** Správa do chatu; vráti `message_id` (alebo `null`). */
export async function posliSpravuTelegram(
  chatId: number,
  text: string,
  o: { tlacidla?: Tlacidlo[][]; odpovedNa?: number } = {},
): Promise<number | null> {
  const r = await volajTelegram<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: textPreTelegram(text),
    link_preview_options: { is_disabled: true },
    ...(o.tlacidla ? { reply_markup: { inline_keyboard: o.tlacidla } } : {}),
    ...(o.odpovedNa
      ? { reply_parameters: { message_id: o.odpovedNa, allow_sending_without_reply: true } }
      : {}),
  });
  return r?.message_id ?? null;
}

/** Stiahne súbor z Telegramu (getFile + /file/bot…). Väčší než `max` nestiahne. */
export async function stiahniSuborTelegram(
  fileId: string,
  max: number,
): Promise<{ bajty: Buffer; cesta: string } | null> {
  const token = tokenBota();
  if (!token) return null;
  const f = await volajTelegram<{ file_path?: string; file_size?: number }>("getFile", {
    file_id: fileId,
  });
  if (!f?.file_path || (f.file_size && f.file_size > max)) return null;
  try {
    const r = await fetch(`${API}/file/bot${token}/${f.file_path}`, {
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) return null;
    const bajty = Buffer.from(await r.arrayBuffer());
    if (!bajty.length || bajty.length > max) return null;
    return { bajty, cesta: f.file_path };
  } catch (e: any) {
    console.error("[telegram] sťahovanie súboru zlyhalo:", e?.message ?? e);
    return null;
  }
}

/* ------------------------------------------------------------ podpora */

const web = () => (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");

/** Chaty spárované s účtami, ktoré sú (stále) platform admin. */
export async function adminChaty(): Promise<{ chat_id: number; user_id: string; role: string }[]> {
  const { data: chaty } = await supabaseAdmin
    .from("telegram_admin_chaty")
    .select("chat_id, user_id")
    .limit(50);
  const zoznam = (chaty ?? []) as { chat_id: number; user_id: string }[];
  if (!zoznam.length) return [];
  const { data: admini } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id, role")
    .in(
      "user_id",
      zoznam.map((c) => c.user_id),
    );
  const rola = new Map(
    ((admini ?? []) as { user_id: string; role: string }[]).map((a) => [a.user_id, a.role]),
  );
  return zoznam
    .filter((c) => rola.has(c.user_id))
    .map((c) => ({ ...c, role: rola.get(c.user_id)! }));
}

/**
 * Upozornenie do spárovaných admin chatov. Správa si zapamätá požiadavku
 * (a návrh opravy) — Reply na ňu ide do tej požiadavky, tlačidlá k návrhu.
 * Zlyhanie sa len zaloguje.
 */
export async function upozorniAdminovTelegram(args: {
  text: string;
  poziadavkaId?: string | null;
  autoOpravaId?: string | null;
  tlacidla?: { text: string; akcia: AkciaTlacidla }[];
}): Promise<void> {
  if (!jeTelegramNastaveny()) return;
  try {
    const chaty = await adminChaty();
    for (const c of chaty) {
      const tlacidla =
        args.autoOpravaId && args.tlacidla?.length
          ? [
              args.tlacidla.map((t) => ({
                text: t.text,
                callback_data: dataTlacidla(t.akcia, args.autoOpravaId!),
              })),
            ]
          : undefined;
      const id = await posliSpravuTelegram(c.chat_id, args.text, { tlacidla });
      if (id && (args.poziadavkaId || args.autoOpravaId)) {
        await supabaseAdmin.from("telegram_spravy_bota").insert({
          chat_id: c.chat_id,
          message_id: id,
          poziadavka_id: args.poziadavkaId ?? null,
          auto_oprava_id: args.autoOpravaId ?? null,
        });
      }
    }
  } catch (e: any) {
    console.error("[telegram] upozornenie podpory zlyhalo:", e?.message ?? e);
  }
}

/** Odkaz do administrácie pod upozornenie. */
export const odkazAdmin = (poziadavkaId: string) => `${web()}/admin/podpora/${poziadavkaId}`;

/** Odpoveď podpory zákazníkovi do jeho chatu. Zlyhanie sa len zaloguje. */
export async function posliOdpovedZakaznikovi(args: {
  chatId: number;
  cislo: string;
  text: string;
}): Promise<boolean> {
  if (!jeTelegramNastaveny()) return false;
  const id = await posliSpravuTelegram(
    args.chatId,
    `Podpora Faktera (${args.cislo}):\n\n${args.text}`,
  );
  return id != null;
}

/* ------------------------------------------------------- párovacie kódy */

export const hashKodu = (kod: string) =>
  createHash("sha256").update(`telegram:${kod}`).digest("hex");

/** Nový jednorazový kód pre účet — starší kód toho istého účelu prestane platiť. */
export async function vytvorKodTelegram(
  userId: string,
  ucel: "admin" | "zakaznik",
): Promise<{ kod: string; platiDo: string }> {
  const kod = novyKod();
  const platiDo = new Date(Date.now() + PLATNOST_KODU_MIN * 60_000).toISOString();
  await supabaseAdmin.from("telegram_kody").delete().eq("user_id", userId).eq("ucel", ucel);
  const { error } = await supabaseAdmin
    .from("telegram_kody")
    .insert({ kod_hash: hashKodu(kod), ucel, user_id: userId, plati_do: platiDo });
  if (error) throw new Error(error.message);
  return { kod, platiDo };
}

/** Overí a spotrebuje kód. Vráti účet, alebo `null` (neplatný, cudzí účel, po lehote). */
export async function pouziKodTelegram(
  surovyKod: string | null,
  ucel: "admin" | "zakaznik",
): Promise<string | null> {
  const kod = normalizujKod(surovyKod);
  if (!kod) return null;
  const h = hashKodu(kod);
  /* Spotrebuje sa jedným príkazom (delete … returning): dva súbežné pokusy
     s tým istým kódom nemôžu oba prejsť. Spotrebuje sa vždy, aj keď nesedí
     účel — druhý pokus s ním nevyjde. */
  const { data } = await supabaseAdmin
    .from("telegram_kody")
    .delete()
    .eq("kod_hash", h)
    .select("user_id, ucel, plati_do")
    .maybeSingle();
  const r = data as { user_id: string; ucel: string; plati_do: string } | null;
  if (!r) return null;
  if (r.ucel !== ucel || new Date(r.plati_do).getTime() < Date.now()) return null;
  return r.user_id;
}

/* ------------------------------------------------------------- stropy */

/**
 * Strop v klzavom okne, držaný v databáze (`telegram_pusti`, atomicky so
 * zámkom) — prežije reštart a platí pre všetky procesy. Keď databáza
 * neodpovie, stráži aspoň `zaloha` v pamäti procesu.
 */
export async function pustiTelegram(
  chatId: number,
  druh: string,
  max: number,
  oknoMs: number,
  zaloha: StropNaChat,
): Promise<boolean> {
  try {
    const { data, error } = await (supabaseAdmin as any).rpc("telegram_pusti", {
      _chat_id: chatId,
      _druh: druh,
      _max: max,
      _okno_sekund: Math.ceil(oknoMs / 1000),
    });
    if (!error && typeof data === "boolean") return data;
    if (error) console.warn("[telegram] strop z databázy:", String(error.message ?? error));
  } catch (e: any) {
    console.warn("[telegram] strop z databázy:", e?.message ?? e);
  }
  return zaloha.pusti(chatId);
}
