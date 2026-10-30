/*
  WhatsApp — čisté funkcie pre podporu cez WhatsApp Business Cloud API (bez
  siete a databázy), aby sa dali otestovať a zdieľať medzi webhookom,
  odpoveďami podpory a obrazovkami.

  Telefónne číslo zákazníka je osobný údaj: zobrazuje sa len maskované
  (`maskujCislo`), do logov nejde vôbec a stropy ho poznajú len ako hash.
  Text správ píše ktokoľvek s WhatsAppom — je to nedôveryhodný vstup,
  rovnako ako pri Telegrame (`cistyTextTelegramu`).
*/
import { cistyTextTelegramu, normalizujKod, rozoberPrikaz } from "./telegram";

/** Číslo podpory, ak `WHATSAPP_CISLO` nie je nastavené. */
export const PREDVOLENE_CISLO_PODPORY = "+421902101967";

/** Najdlhší text, ktorý Cloud API pošle v textovej správe. */
export const MAX_WHATSAPP_SPRAVA = 4096;

/** Koľko textu z jednej správy zákazníka uložíme do vlákna. */
export const MAX_TEXT_Z_WHATSAPPU = 4000;

/** Okno zákazníckej služby — voľný text sa dá poslať len do 24 h od poslednej správy zákazníka. */
export const OKNO_ZAKAZNICKEJ_SLUZBY_MS = 24 * 3600_000;

/** Rezerva pred koncom okna — správa odoslaná v poslednej minúte by mohla prísť neskoro. */
export const REZERVA_OKNA_MS = 60_000;

/** Platnosť kódu na prepojenie s účtom. */
export const PLATNOST_KODU_MIN = 10;

/** Najviac nových požiadaviek z jedného čísla za 24 hodín. */
export const MAX_NOVYCH_ZA_DEN = 5;

/** Najviac nových požiadaviek z WhatsAppu za hodinu zo všetkých čísel spolu. */
export const MAX_NOVYCH_ZA_HODINU_SPOLU = 30;

/** Text zo správy z WhatsAppu: bez riadiacich a neviditeľných znakov, orezaný. */
export function cistyTextWhatsAppu(v: unknown, max = MAX_TEXT_Z_WHATSAPPU): string {
  return cistyTextTelegramu(v, max);
}

/** Text pre odoslanie — Cloud API dlhšiu správu odmietne. */
export function textPreWhatsApp(v: string): string {
  const s = String(v ?? "");
  return s.length <= MAX_WHATSAPP_SPRAVA ? s : `${s.slice(0, MAX_WHATSAPP_SPRAVA - 1)}…`;
}

/** Len číslice (wa_id je číslo v medzinárodnom tvare bez „+“). `null`, ak to nie je číslo. */
export function cislaZWaId(v: unknown): string | null {
  const s = String(v ?? "").replace(/[^0-9]/g, "");
  return s.length >= 6 && s.length <= 20 ? s : null;
}

/** Predvoľby krajín, ktoré pri maskovaní necháme vidieť celé. */
const PREDVOLBY = ["421", "420", "49", "43", "36", "48", "44", "1"];

/**
 * Maskované číslo do administrácie a e-mailov: predvoľba a posledné tri
 * číslice, napr. `+421 ••• ••• 967`. Celé číslo sa nikde nezobrazuje.
 */
export function maskujCislo(waId: string | null | undefined): string {
  const c = cislaZWaId(waId);
  if (!c) return "WhatsApp";
  const predvolba = PREDVOLBY.find((p) => c.startsWith(p) && c.length > p.length + 4) ?? "";
  return `+${predvolba ? `${predvolba} ` : ""}••• ••• ${c.slice(-3)}`;
}

/** Meno z profilu WhatsAppu na jeden riadok; bez mena len maskované číslo. */
export function menoZWhatsAppu(profil: string | null | undefined, waId: string): string {
  const meno = cistyTextWhatsAppu(profil, 120).replace(/\s+/g, " ");
  const maska = maskujCislo(waId);
  return meno ? `${meno} · ${maska}` : maska;
}

/** Je ešte otvorené 24-hodinové okno zákazníckej služby? */
export function jeVOkne(
  poslednaOdZakaznika: string | Date | null | undefined,
  teraz = Date.now(),
): boolean {
  if (!poslednaOdZakaznika) return false;
  const t = new Date(poslednaOdZakaznika).getTime();
  if (!Number.isFinite(t)) return false;
  return teraz - t < OKNO_ZAKAZNICKEJ_SLUZBY_MS - REZERVA_OKNA_MS;
}

/** Do kedy platí okno (ISO), alebo `null`, keď zákazník ešte nepísal. */
export function koniecOkna(poslednaOdZakaznika: string | null | undefined): string | null {
  if (!poslednaOdZakaznika) return null;
  const t = new Date(poslednaOdZakaznika).getTime();
  return Number.isFinite(t) ? new Date(t + OKNO_ZAKAZNICKEJ_SLUZBY_MS).toISOString() : null;
}

/** Odkaz wa.me na číslo podpory s predvyplneným textom. */
export function odkazNaWhatsApp(cislo: string, text?: string | null): string {
  const c = String(cislo ?? "").replace(/[^0-9]/g, "");
  return `https://wa.me/${c}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Číslo podpory pekne na zobrazenie: `+421 902 101 967`. */
export function cisloNaZobrazenie(cislo: string): string {
  const c = String(cislo ?? "").replace(/[^0-9]/g, "");
  const m = c.match(/^(421|420)(\d{3})(\d{3})(\d{3})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${c}`;
}

/** Predvyplnený text správy, ktorá prepojí číslo s účtom. */
export const textPrepojenia = (kod: string) => `Prepojiť účet: ${kod}`;

export type PrikazWhatsApp =
  | { druh: "prepojit"; kod: string | null }
  | { druh: "nova" }
  | { druh: "chyba"; text: string }
  | { druh: "pomoc" }
  | { druh: "text"; text: string };

/**
 * Čo správa chce. WhatsApp nemá príkazy bota, ale ľudia, čo poznajú Telegram,
 * píšu `/nova`, `/chyba`, `/pomoc` — fungujú rovnako. Prepojenie s účtom
 * príde ako predvyplnený text `Prepojiť účet: ABCD-EFGH` (z wa.me odkazu)
 * alebo `/prepojit ABCD-EFGH`.
 */
export function rozoberPrikazWhatsApp(text: string | null | undefined): PrikazWhatsApp {
  const t = String(text ?? "").trim();
  const prepojenie = t.match(
    /^(?:\/prepojit|prepoji[tť]\s+[úu][čc]et|propojit\s+[úu][čc]et|konto\s+verbinden)\s*:?\s*([A-Za-z0-9 -]{8,12})$/i,
  );
  if (prepojenie) return { druh: "prepojit", kod: normalizujKod(prepojenie[1]) };
  const p = rozoberPrikaz(t);
  switch (p.druh) {
    case "nova":
    case "pomoc":
      return { druh: p.druh };
    case "chyba":
      return p;
    case "start":
      return p.kod ? { druh: "prepojit", kod: p.kod } : { druh: "pomoc" };
    case "admin":
      // Párovanie admina cez WhatsApp nie je — podpora odpovedá z administrácie.
      return { druh: "text", text: t };
    default:
      return { druh: "text", text: t };
  }
}

/* ------------------------------------------------------------- webhook */

/** Typy z webhooku Cloud API — len to, čo naozaj čítame. */
export type WaMedia = {
  id: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
  sha256?: string;
};
export type WaSprava = {
  from: string;
  id: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  image?: WaMedia;
  document?: WaMedia;
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  context?: { id?: string };
};
export type WaStatus = {
  id: string;
  status: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string }[];
};
export type WaHodnota = {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: WaSprava[];
  statuses?: WaStatus[];
};
export type WaUdalost = {
  object?: string;
  entry?: { id?: string; changes?: { field?: string; value?: WaHodnota }[] }[];
};

/** Z udalosti vytiahne prichádzajúce správy (s menom z kontaktov) a stavy — len pre naše číslo. */
export function rozbalUdalost(
  u: WaUdalost,
  nasePhoneNumberId: string | null,
): {
  spravy: { sprava: WaSprava; profil: string | null }[];
  stavy: WaStatus[];
} {
  const spravy: { sprava: WaSprava; profil: string | null }[] = [];
  const stavy: WaStatus[] = [];
  if (u?.object !== "whatsapp_business_account") return { spravy, stavy };
  for (const e of u.entry ?? []) {
    for (const ch of e.changes ?? []) {
      if (ch.field !== "messages" || !ch.value) continue;
      const v = ch.value;
      // Jedna aplikácia môže mať viac čísel — berieme len číslo podpory.
      if (nasePhoneNumberId && v.metadata?.phone_number_id !== nasePhoneNumberId) continue;
      const mena = new Map(
        (v.contacts ?? []).map((c) => [String(c.wa_id ?? ""), c.profile?.name ?? null]),
      );
      for (const s of v.messages ?? []) {
        if (!s?.id || !s.from) continue;
        spravy.push({ sprava: s, profil: mena.get(String(s.from)) ?? null });
      }
      for (const s of v.statuses ?? []) if (s?.id) stavy.push(s);
    }
  }
  return { spravy, stavy };
}

/** Text správy podľa typu (text, popis fotky/dokumentu, tlačidlo šablóny). */
export function textSpravy(s: WaSprava): string {
  switch (s.type) {
    case "text":
      return s.text?.body ?? "";
    case "image":
      return s.image?.caption ?? "";
    case "document":
      return s.document?.caption ?? "";
    case "button":
      return s.button?.text ?? "";
    case "interactive":
      return s.interactive?.button_reply?.title ?? s.interactive?.list_reply?.title ?? "";
    default:
      return "";
  }
}

/** Typy, na ktoré nereagujeme vôbec (reakcia na správu nie je nová správa). */
export const TICHE_TYPY = new Set(["reaction", "system", "ephemeral", "request_welcome"]);
