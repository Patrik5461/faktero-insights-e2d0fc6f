/*
  WhatsApp Business Cloud API (Meta Graph API) — odosielanie správ podpory,
  sťahovanie príloh, kódy na prepojenie a stropy.

  Premenné prostredia (bez prvých dvoch je všetko vypnuté a nič sa nezobrazuje):
  - WHATSAPP_TOKEN — trvalý token systémového používateľa;
  - WHATSAPP_PHONE_NUMBER_ID — id čísla podpory v Cloud API;
  - WHATSAPP_APP_SECRET — tajomstvo aplikácie, overenie podpisu webhooku;
  - WHATSAPP_VERIFY_TOKEN — overovací token pri nastavení webhooku (GET);
  - WHATSAPP_CISLO — zobrazované číslo (predvolené +421902101967);
  - WHATSAPP_SABLONA — schválená šablóna na odpoveď mimo 24 h okna
    (napr. `odpoved_podpory`); kým nie je nastavená, mimo okna odíde len e-mail;
  - WHATSAPP_SABLONA_JAZYK — jazyk šablóny (predvolene `sk`);
  - WHATSAPP_GRAPH_VERSION — verzia Graph API (predvolene v25.0).

  Hodnoty sa nikdy nevypisujú ani neposielajú na frontend. Do logov nejde
  ani telefónne číslo zákazníka — len kód chyby z Meta.

  WhatsApp je doplnok k e-mailu: zlyhanie nikdy nezhodí pôvodnú akciu.
*/
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { novyKod, normalizujKod } from "./telegram";
import {
  PLATNOST_KODU_MIN,
  PREDVOLENE_CISLO_PODPORY,
  cislaZWaId,
  jeVOkne,
  textPreWhatsApp,
} from "./whatsapp";

const env = (k: string) => process.env[k]?.trim() || null;

export const tokenWhatsApp = () => env("WHATSAPP_TOKEN");
export const phoneNumberId = () => {
  const v = env("WHATSAPP_PHONE_NUMBER_ID");
  return v && /^[0-9]{5,30}$/.test(v) ? v : null;
};
export const cisloPodpory = () => {
  const c = cislaZWaId(env("WHATSAPP_CISLO") ?? PREDVOLENE_CISLO_PODPORY);
  return `+${c ?? cislaZWaId(PREDVOLENE_CISLO_PODPORY)}`;
};
export const sablonaOdpovede = () => {
  const v = env("WHATSAPP_SABLONA");
  return v && /^[a-z0-9_]{1,512}$/.test(v) ? v : null;
};
const jazykSablony = () => env("WHATSAPP_SABLONA_JAZYK") ?? "sk";
const verzia = () => {
  const v = env("WHATSAPP_GRAPH_VERSION");
  return v && /^v\d{2,3}\.\d$/.test(v) ? v : "v25.0";
};
const GRAPH = () => `https://graph.facebook.com/${verzia()}`;

/** Zapnuté = dá sa prijímať aj odosielať. Bez toho sa nič nezobrazuje. */
export const jeWhatsAppZapnuty = () => !!tokenWhatsApp() && !!phoneNumberId();

/* ------------------------------------------------------------- podpis */

/**
 * Overí `X-Hub-Signature-256` (HMAC-SHA256 surového tela tajomstvom
 * aplikácie) v konštantnom čase. Bez tajomstva vždy `false`.
 */
export function overPodpis(
  teloSurove: string | Buffer,
  hlavicka: string | null | undefined,
  tajomstvo: string | null | undefined = env("WHATSAPP_APP_SECRET"),
): boolean {
  if (!tajomstvo || !hlavicka) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(hlavicka.trim());
  if (!m) return false;
  const ocakavany = createHmac("sha256", tajomstvo).update(teloSurove).digest();
  const prijaty = Buffer.from(m[1]!, "hex");
  return prijaty.length === ocakavany.length && timingSafeEqual(prijaty, ocakavany);
}

/* ------------------------------------------------------------ Graph API */

export type ChybaGraph = { kod: number | null; popis: string };

/** Volanie Graph API s tokenom. Vracia telo, alebo chybu (kód z Meta, bez citlivých údajov). */
async function volajGraph<T = any>(
  cesta: string,
  telo?: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; chyba: ChybaGraph }> {
  const token = tokenWhatsApp();
  if (!token) return { ok: false, chyba: { kod: null, popis: "WhatsApp nie je nastavený" } };
  try {
    const r = await fetch(`${GRAPH()}/${cesta}`, {
      method: telo ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(telo ? { "content-type": "application/json" } : {}),
      },
      ...(telo ? { body: JSON.stringify(telo) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json().catch(() => null)) as any;
    if (!r.ok || j?.error) {
      const kod = typeof j?.error?.code === "number" ? j.error.code : null;
      const popis = String(j?.error?.message ?? `HTTP ${r.status}`).slice(0, 200);
      console.error(`[whatsapp] Graph API zlyhalo: ${r.status} kód ${kod ?? "?"}`);
      return { ok: false, chyba: { kod, popis } };
    }
    return { ok: true, data: j as T };
  } catch (e: any) {
    console.error("[whatsapp] Graph API zlyhalo:", String(e?.name ?? "chyba"));
    return { ok: false, chyba: { kod: null, popis: "Spojenie s WhatsAppom zlyhalo" } };
  }
}

/** Kód chyby „mimo 24 h okna“ (re-engagement message). */
export const KOD_MIMO_OKNA = 131047;

/** Textová správa zákazníkovi; vráti wamid, alebo chybu. */
export async function posliTextWhatsApp(
  waId: string,
  text: string,
): Promise<{ wamid: string } | { chyba: ChybaGraph }> {
  const id = phoneNumberId();
  if (!id || !tokenWhatsApp()) return { chyba: { kod: null, popis: "WhatsApp nie je nastavený" } };
  const r = await volajGraph<{ messages?: { id: string }[] }>(`${id}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: waId,
    type: "text",
    // Bez náhľadu odkazov — text píše aj zákazník a podpora ho len cituje.
    text: { body: textPreWhatsApp(text), preview_url: false },
  });
  if (!r.ok) return { chyba: r.chyba };
  const wamid = r.data.messages?.[0]?.id;
  return wamid ? { wamid } : { chyba: { kod: null, popis: "WhatsApp nevrátil id správy" } };
}

/**
 * Schválená šablóna `WHATSAPP_SABLONA` s jediným parametrom v tele (číslo
 * požiadavky). Mimo 24 h okna sa dá poslať len ona.
 */
export async function posliSablonuWhatsApp(
  waId: string,
  cislo: string,
): Promise<{ wamid: string } | { chyba: ChybaGraph }> {
  const id = phoneNumberId();
  const sablona = sablonaOdpovede();
  if (!id || !tokenWhatsApp() || !sablona)
    return { chyba: { kod: null, popis: "Šablóna nie je nastavená" } };
  const r = await volajGraph<{ messages?: { id: string }[] }>(`${id}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: waId,
    type: "template",
    template: {
      name: sablona,
      language: { code: jazykSablony() },
      components: [{ type: "body", parameters: [{ type: "text", text: cislo }] }],
    },
  });
  if (!r.ok) return { chyba: r.chyba };
  const wamid = r.data.messages?.[0]?.id;
  return wamid ? { wamid } : { chyba: { kod: null, popis: "WhatsApp nevrátil id správy" } };
}

/**
 * Stiahne prílohu (media API: najprv URL podľa id, potom súbor s tokenom).
 * Väčšiu než `max` nestiahne.
 */
export async function stiahniMediaWhatsApp(
  mediaId: string,
  max: number,
): Promise<{ bajty: Buffer; mime: string } | null> {
  const token = tokenWhatsApp();
  if (!token || !/^[0-9A-Za-z_.-]{1,128}$/.test(mediaId)) return null;
  const info = await volajGraph<{ url?: string; mime_type?: string; file_size?: number }>(
    encodeURIComponent(mediaId),
  );
  if (!info.ok || !info.data.url) return null;
  if (info.data.file_size && info.data.file_size > max) return null;
  let url: URL;
  try {
    url = new URL(info.data.url);
  } catch {
    return null;
  }
  // Token posielame len na servery Meta — nie na adresu, ktorú by niekto podvrhol.
  if (
    url.protocol !== "https:" ||
    !/(^|\.)(fbsbx\.com|fbcdn\.net|facebook\.com|whatsapp\.net)$/.test(url.hostname)
  )
    return null;
  try {
    const r = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) return null;
    const dlzka = Number(r.headers.get("content-length") ?? 0);
    if (dlzka && dlzka > max) return null;
    const bajty = Buffer.from(await r.arrayBuffer());
    if (!bajty.length || bajty.length > max) return null;
    return { bajty, mime: info.data.mime_type ?? r.headers.get("content-type") ?? "" };
  } catch (e: any) {
    console.error("[whatsapp] sťahovanie prílohy zlyhalo:", String(e?.name ?? "chyba"));
    return null;
  }
}

/* ------------------------------------------------------- odpoveď podpory */

type ChatRiadok = {
  id: string;
  wa_id: string;
  posledna_od_zakaznika_at: string | null;
  nedorucene_od: string | null;
};

export type VysledokOdpovede =
  | { stav: "odoslane" }
  | { stav: "sablona" }
  | { stav: "nedorucene"; dovod: string }
  | { stav: "vypnute" };

async function zapisChybu(chatId: string, dovod: string) {
  const teraz = new Date().toISOString();
  await supabaseAdmin
    .from("whatsapp_chaty")
    .update({ posledna_chyba: dovod.slice(0, 300), updated_at: teraz })
    .eq("id", chatId);
  await supabaseAdmin
    .from("whatsapp_stav")
    .update({ posledna_chyba: dovod.slice(0, 300), posledna_chyba_at: teraz })
    .eq("id", 1);
}

/** Text odpovede podpory tak, ako ho dostane zákazník. */
export const textOdpovede = (cislo: string, text: string) =>
  `Podpora Faktera (${cislo}):\n\n${text}`;

/**
 * Odpoveď podpory do WhatsAppu. V 24 h okne ide voľný text; mimo okna
 * schválená šablóna (ak je nastavená) a samotný text sa doručí, keď zákazník
 * znova napíše (`nedorucene_od`). Zlyhanie sa zaloguje a vráti dôvod pre admina.
 */
export async function posliOdpovedWhatsApp(args: {
  chatId: string;
  poziadavkaId: string;
  cislo: string;
  text: string;
  /** Kedy sa odpoveď zapísala do vlákna (`podpora_spravy.created_at`). */
  casSpravy: string;
  teraz?: number;
}): Promise<VysledokOdpovede> {
  if (!jeWhatsAppZapnuty()) return { stav: "vypnute" };
  const { data } = await supabaseAdmin
    .from("whatsapp_chaty")
    .select("id, wa_id, posledna_od_zakaznika_at, nedorucene_od")
    .eq("id", args.chatId)
    .maybeSingle();
  const chat = data as ChatRiadok | null;
  if (!chat) return { stav: "nedorucene", dovod: "Konverzácia vo WhatsAppe sa nenašla." };
  const teraz = args.teraz ?? Date.now();
  const terazIso = new Date(teraz).toISOString();

  const oznacNedorucene = async () => {
    if (!chat.nedorucene_od)
      await supabaseAdmin
        .from("whatsapp_chaty")
        .update({ nedorucene_od: args.casSpravy, updated_at: terazIso })
        .eq("id", chat.id);
  };

  if (jeVOkne(chat.posledna_od_zakaznika_at, teraz)) {
    const r = await posliTextWhatsApp(chat.wa_id, textOdpovede(args.cislo, args.text));
    if ("wamid" in r) {
      await supabaseAdmin.from("whatsapp_odoslane").insert({
        wamid: r.wamid,
        chat_id: chat.id,
        poziadavka_id: args.poziadavkaId,
        druh: "text",
      });
      await supabaseAdmin
        .from("whatsapp_chaty")
        .update({ posledna_chyba: null, updated_at: terazIso })
        .eq("id", chat.id);
      return { stav: "odoslane" };
    }
    // Okno sa medzitým zavrelo (napr. hodiny Meta) — pokračuje sa ako mimo okna.
    if (r.chyba.kod !== KOD_MIMO_OKNA) {
      const dovod = `WhatsApp odpoveď neprijal (kód ${r.chyba.kod ?? "?"}).`;
      await zapisChybu(chat.id, dovod);
      await oznacNedorucene();
      return { stav: "nedorucene", dovod };
    }
  }

  await oznacNedorucene();
  if (!sablonaOdpovede()) {
    const dovod =
      "Zákazník nepísal viac ako 24 hodín a šablóna WhatsAppu nie je schválená — odpoveď sa doručí, keď znova napíše.";
    await zapisChybu(chat.id, dovod);
    return { stav: "nedorucene", dovod };
  }
  const s = await posliSablonuWhatsApp(chat.wa_id, args.cislo);
  if ("wamid" in s) {
    await supabaseAdmin.from("whatsapp_odoslane").insert({
      wamid: s.wamid,
      chat_id: chat.id,
      poziadavka_id: args.poziadavkaId,
      druh: "sablona",
    });
    return { stav: "sablona" };
  }
  const dovod = `Šablóna WhatsAppu neodišla (kód ${s.chyba.kod ?? "?"}) — odpoveď sa doručí, keď zákazník znova napíše.`;
  await zapisChybu(chat.id, dovod);
  return { stav: "nedorucene", dovod };
}

/* ------------------------------------------------------- párovacie kódy */

export const hashKodu = (kod: string) =>
  createHash("sha256").update(`whatsapp:${kod}`).digest("hex");

/** Kľúč stropu — hash čísla, aby v tabuľke stropov nebolo telefónne číslo. */
export const klucCisla = (waId: string) =>
  createHash("sha256").update(`whatsapp-strop:${waId}`).digest("hex").slice(0, 32);

/** Nový jednorazový kód pre účet — starší kód toho istého účtu prestane platiť. */
export async function vytvorKodWhatsApp(userId: string): Promise<{ kod: string; platiDo: string }> {
  const kod = novyKod();
  const platiDo = new Date(Date.now() + PLATNOST_KODU_MIN * 60_000).toISOString();
  await supabaseAdmin.from("whatsapp_kody").delete().eq("user_id", userId);
  const { error } = await supabaseAdmin
    .from("whatsapp_kody")
    .insert({ kod_hash: hashKodu(kod), user_id: userId, plati_do: platiDo });
  if (error) throw new Error(error.message);
  return { kod, platiDo };
}

/** Overí a spotrebuje kód (atomicky, delete … returning). Vráti účet, alebo `null`. */
export async function pouziKodWhatsApp(surovyKod: string | null): Promise<string | null> {
  const kod = normalizujKod(surovyKod);
  if (!kod) return null;
  const { data } = await supabaseAdmin
    .from("whatsapp_kody")
    .delete()
    .eq("kod_hash", hashKodu(kod))
    .select("user_id, plati_do")
    .maybeSingle();
  const r = data as { user_id: string; plati_do: string } | null;
  if (!r || new Date(r.plati_do).getTime() < Date.now()) return null;
  return r.user_id;
}

/* ------------------------------------------------------------- stropy */

/** Záloha stropu v pamäti procesu, keď databáza neodpovie. */
export class StropVPamati {
  private historia = new Map<string, number[]>();
  constructor(
    private max: number,
    private oknoMs: number,
  ) {}
  pusti(kluc: string, teraz = Date.now()): boolean {
    const h = (this.historia.get(kluc) ?? []).filter((t) => teraz - t < this.oknoMs);
    if (h.length >= this.max) {
      this.historia.set(kluc, h);
      return false;
    }
    h.push(teraz);
    this.historia.set(kluc, h);
    if (this.historia.size > 5000)
      for (const [k, v] of this.historia)
        if (v.every((t) => teraz - t >= this.oknoMs)) this.historia.delete(k);
    return true;
  }
}

/** Strop v klzavom okne v databáze (`whatsapp_pusti`, atomicky so zámkom). */
export async function pustiWhatsApp(
  kluc: string,
  druh: string,
  max: number,
  oknoMs: number,
  zaloha: StropVPamati,
): Promise<boolean> {
  try {
    const { data, error } = await (supabaseAdmin as any).rpc("whatsapp_pusti", {
      _kluc: kluc,
      _druh: druh,
      _max: max,
      _okno_sekund: Math.ceil(oknoMs / 1000),
    });
    if (!error && typeof data === "boolean") return data;
    if (error) console.warn("[whatsapp] strop z databázy:", String(error.message ?? error));
  } catch (e: any) {
    console.warn("[whatsapp] strop z databázy:", e?.message ?? e);
  }
  return zaloha.pusti(kluc);
}
