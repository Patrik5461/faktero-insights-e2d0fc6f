/*
  Telegram — čisté funkcie pre bota podpory (bez siete a databázy), aby sa
  dali otestovať a zdieľať medzi webhookom, upozorneniami a obrazovkami.

  Text zo správ píše ktokoľvek, kto bota nájde — je to nedôveryhodný vstup.
  Do databázy ide len očistený a orezaný, do Telegramu bez `parse_mode`
  (holý text, žiadne HTML ani Markdown, ktoré by sa dalo zneužiť).
*/

/** Najdlhšia správa, ktorú Telegram pošle (sendMessage). */
export const MAX_TELEGRAM_SPRAVA = 4096;

/** Koľko textu z jednej správy zákazníka uložíme do vlákna. */
export const MAX_TEXT_Z_TELEGRAMU = 4000;

/** Telegram cez getFile vydá súbor najviac do 20 MB. */
export const MAX_SUBOR_TELEGRAMU = 20 * 1024 * 1024;

/** Platnosť párovacieho kódu. */
export const PLATNOST_KODU_MIN = 10;

/*
  Riadiace znaky (okrem nového riadku a tabulátora) a znaky, ktoré otáčajú
  smer textu alebo sú neviditeľné — nimi sa v administrácii dá schovať iný
  text, než aký sa zobrazí.
*/
const NEBEZPECNE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁩﻿]/g;

/** Text zo správy z Telegramu: bez nebezpečných znakov, s orezanou dĺžkou. */
export function cistyTextTelegramu(v: unknown, max = MAX_TEXT_Z_TELEGRAMU): string {
  const s = String(v ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(NEBEZPECNE, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Meno z Telegramu na jeden riadok (do `meno` požiadavky a hlavičky upozornenia). */
export function menoZTelegramu(
  from:
    | {
        first_name?: string;
        last_name?: string;
        username?: string;
      }
    | null
    | undefined,
): { meno: string; username: string | null } {
  const cele = cistyTextTelegramu(
    [from?.first_name, from?.last_name].filter(Boolean).join(" "),
    120,
  ).replace(/\s+/g, " ");
  const u =
    String(from?.username ?? "")
      .replace(/[^A-Za-z0-9_]/g, "")
      .slice(0, 64) || null;
  const meno = cele || (u ? `@${u}` : "Telegram");
  return { meno: u && cele ? `${cele} (@${u})` : meno, username: u };
}

/** Text pre sendMessage — Telegram dlhšiu správu odmietne. */
export function textPreTelegram(v: string): string {
  const s = String(v ?? "");
  return s.length <= MAX_TELEGRAM_SPRAVA ? s : `${s.slice(0, MAX_TELEGRAM_SPRAVA - 1)}…`;
}

export type Prikaz =
  | { druh: "start"; kod: string | null }
  | { druh: "admin"; kod: string | null }
  | { druh: "nova" }
  | { druh: "chyba"; text: string }
  | { druh: "pomoc" }
  | { druh: "text"; text: string };

/**
 * Čo správa chce. Príkazy majú tvar `/prikaz argument` (aj `/prikaz@MenoBota`).
 * Deep link `t.me/<bot>?start=<kod>` príde ako `/start <kod>`; párovanie
 * admina z odkazu má predponu `admin_`.
 */
export function rozoberPrikaz(text: string | null | undefined): Prikaz {
  const t = String(text ?? "").trim();
  const m = t.match(/^\/([a-z_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (!m) return { druh: "text", text: t };
  const prikaz = m[1]!.toLowerCase();
  const arg = (m[2] ?? "").trim();
  switch (prikaz) {
    case "start": {
      if (/^admin_/i.test(arg)) return { druh: "admin", kod: normalizujKod(arg.slice(6)) };
      return { druh: "start", kod: arg ? normalizujKod(arg) : null };
    }
    case "admin":
      return { druh: "admin", kod: arg ? normalizujKod(arg) : null };
    case "nova":
      return { druh: "nova" };
    case "chyba":
      return { druh: "chyba", text: arg };
    case "pomoc":
    case "help":
      return { druh: "pomoc" };
    default:
      // Neznámy príkaz berieme ako obyčajný text — človek mohol napísať „/“ omylom.
      return { druh: "text", text: t };
  }
}

/* ---------------------------------------------------------- párovacie kódy */

/** Bez znakov, ktoré sa dajú zameniť (0/O, 1/I/L). */
const ABECEDA_KODU = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Náhodný kód na spárovanie, napr. `K7QM-XW3P`. */
export function novyKod(nahoda: Uint8Array = crypto.getRandomValues(new Uint8Array(8))): string {
  const z = Array.from(nahoda.slice(0, 8), (b) => ABECEDA_KODU[b % ABECEDA_KODU.length]).join("");
  return `${z.slice(0, 4)}-${z.slice(4, 8)}`;
}

/** Kód tak, ako ho človek napíše (malé písmená, bez pomlčky, s medzerami) → `ABCD-EFGH`. */
export function normalizujKod(v: string | null | undefined): string | null {
  const z = String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (z.length !== 8 || [...z].some((c) => !ABECEDA_KODU.includes(c))) return null;
  return `${z.slice(0, 4)}-${z.slice(4)}`;
}

/** Kód do deep linku (`?start=`) — len písmená a číslice, pomlčka by sa ľahko stratila. */
export function kodDoOdkazu(kod: string): string {
  return kod.replace(/[^A-Za-z0-9]/g, "");
}

/* ------------------------------------------------------- tlačidlá opravy */

export type AkciaTlacidla = "schvalit" | "zamietnut";

/**
 * Dáta tlačidla (callback_data, najviac 64 bajtov) nesú len akciu a id návrhu
 * v DB. Kto smie čo urobiť, rozhoduje server podľa spárovaného chatu a roly
 * v `platform_admins` — nikdy nie obsah tlačidla.
 */
export function dataTlacidla(akcia: AkciaTlacidla, autoOpravaId: string): string {
  return `ao:${akcia === "schvalit" ? "s" : "z"}:${autoOpravaId}`;
}

export function rozoberDataTlacidla(
  d: string | null | undefined,
): { akcia: AkciaTlacidla; id: string } | null {
  const m = String(d ?? "").match(
    /^ao:([sz]):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
  );
  if (!m) return null;
  return { akcia: m[1] === "s" ? "schvalit" : "zamietnut", id: m[2]! };
}

/* --------------------------------------------------------------- prílohy */

type FotkaTelegramu = { file_id: string; file_size?: number; width?: number; height?: number };

/** Telegram posiela fotku vo viacerých veľkostiach — berieme najväčšiu, čo sa zmestí. */
export function najvacsiaFotka(
  fotky: FotkaTelegramu[] | null | undefined,
  max: number,
): FotkaTelegramu | null {
  const vhodne = (fotky ?? []).filter((f) => !f.file_size || f.file_size <= max);
  if (!vhodne.length) return null;
  return vhodne.reduce((a, b) =>
    (b.file_size ?? (b.width ?? 0) * (b.height ?? 0)) >
    (a.file_size ?? (a.width ?? 0) * (a.height ?? 0))
      ? b
      : a,
  );
}

/* ------------------------------------------------------------ obmedzenia */

/**
 * Strop správ na chat v klzavom okne — aby niekto botom nezahltil help desk.
 * Hlavný strop drží databáza (`pustiTelegram`); tento v pamäti procesu je
 * záloha, keď databáza neodpovie.
 */
export class StropNaChat {
  private historia = new Map<number, number[]>();
  constructor(
    private max: number,
    private oknoMs: number,
  ) {}

  /** `true` = správa smie prejsť (a zaráta sa), `false` = strop je vyčerpaný. */
  pusti(chatId: number, teraz = Date.now()): boolean {
    const h = (this.historia.get(chatId) ?? []).filter((t) => teraz - t < this.oknoMs);
    if (h.length >= this.max) {
      this.historia.set(chatId, h);
      return false;
    }
    h.push(teraz);
    this.historia.set(chatId, h);
    if (this.historia.size > 5000) {
      for (const [k, v] of this.historia)
        if (v.every((t) => teraz - t >= this.oknoMs)) this.historia.delete(k);
    }
    return true;
  }
}

/** Najviac nových požiadaviek z jedného chatu za 24 hodín. */
export const MAX_NOVYCH_ZA_DEN = 5;

/**
 * Najviac nových požiadaviek z Telegramu za hodinu zo všetkých chatov spolu —
 * proti zaplaveniu help desku z mnohých účtov naraz.
 */
export const MAX_NOVYCH_ZA_HODINU_SPOLU = 30;
