/*
  Zápis systémovej chyby do `systemove_chyby` (Admin → Chyby).

  Pravidlá, ktoré sa nesmú porušiť:
  - zápis nikdy nezhodí požiadavku ani ju nespomalí — `zaznamenajChybu` je
    synchrónna, nič nevracia, nič nehodí a samotný zápis beží až po odpovedi;
  - strop počtu zápisov za minútu na zdroj (chyba v slučke nezahltí databázu);
  - do databázy ide len text po `bezTajomstiev` (tokeny, kľúče, heslá, e-maily);
  - zlyhanie zápisu sa nikdy nezapisuje ako ďalšia chyba (žiadna slučka).

  Pri novej chybe (alebo znovu otvorenej po „vyriešené“) príde upozornenie do
  spárovaných admin chatov v Telegrame — najviac raz za hodinu na odtlačok,
  ten strop drží databáza (`posledne_upozornenie_at`).
*/
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jeOdpojenieKlienta } from "@/lib/odpojenie-klienta";
import {
  StropZapisov,
  bezTajomstiev,
  cistaTrasa,
  cistyStack,
  odtlacokChyby,
  rozoberChybu,
  type UrovenChyby,
  type ZdrojChyby,
} from "./spolocne";

export type VstupChyby = {
  zdroj: ZdrojChyby;
  uroven?: UrovenChyby;
  chyba?: unknown;
  sprava?: string;
  stack?: string | null;
  /** Doplnkové miesto do odtlačku — meno server funkcie, cesta hooku. */
  kde?: string | null;
  trasa?: string | null;
  metoda?: string | null;
  httpStatus?: number | null;
  companyId?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  vydanie?: string | null;
};

const strop = new StropZapisov(60, 10_000);

let _vydanie: string | null | undefined;
/** Commit bežiaceho vydania — `.output/.build-commit` alebo premenná prostredia. */
export function vydanieServera(): string | null {
  if (_vydanie !== undefined) return _vydanie;
  let v: string | null = null;
  try {
    v = readFileSync(join(process.cwd(), ".output", ".build-commit"), "utf8").trim() || null;
  } catch {
    v = null;
  }
  v ??= process.env.BUILD_COMMIT || process.env.GIT_COMMIT || null;
  _vydanie = v ? v.slice(0, 12) : null;
  return _vydanie;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidAleboNull = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);

/**
 * Používateľ z prístupového tokenu v hlavičke — **neoverený**, len štítok
 * pre admina (overenie by stálo volanie do Auth pri každej chybe).
 */
export function pouzivatelZHlaviciek(h: { get(n: string): string | null } | null | undefined) {
  try {
    const auth = h?.get("authorization") ?? "";
    const m = /^Bearer\s+[^.]+\.([^.]+)\./i.exec(auth);
    if (!m) return null;
    const telo = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
    return uuidAleboNull(telo?.sub);
  } catch {
    return null;
  }
}

/** Pripraví riadok pre RPC — všetko vyčistené a orezané. Exportované pre testy. */
export function pripravRiadok(v: VstupChyby) {
  const r = v.chyba !== undefined ? rozoberChybu(v.chyba) : null;
  const sprava = bezTajomstiev(v.sprava ?? r?.sprava ?? "(bez správy)");
  const stack = cistyStack(v.stack ?? r?.stack ?? null);
  const uroven = v.uroven ?? "chyba";
  return {
    odtlacok: odtlacokChyby({ zdroj: v.zdroj, uroven, sprava, stack, kde: v.kde }),
    zdroj: v.zdroj,
    uroven,
    sprava,
    stack,
    trasa: cistaTrasa(v.trasa),
    metoda: v.metoda ? String(v.metoda).slice(0, 10).toUpperCase() : null,
    http_status: typeof v.httpStatus === "number" ? v.httpStatus : null,
    company_id: uuidAleboNull(v.companyId),
    user_id: uuidAleboNull(v.userId),
    user_agent: v.userAgent ? bezTajomstiev(v.userAgent, 300) : null,
    vydanie: v.vydanie ? bezTajomstiev(v.vydanie, 60) : vydanieServera(),
  };
}

let poslednaChybaZapisu = 0;

async function zapis(riadok: ReturnType<typeof pripravRiadok>, pocet: number): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("zapis_systemovu_chybu", {
      p: riadok,
      p_pocet: pocet,
    });
    if (error) throw new Error(error.message);
    const vysledok = Array.isArray(data) ? data[0] : data;
    if (vysledok?.upozornit) void upozorni(riadok, vysledok.nova === true);
  } catch (e: any) {
    // Najviac jeden riadok za minútu do pm2 logu; do tabuľky nikdy (slučka).
    if (Date.now() - poslednaChybaZapisu > 60_000) {
      poslednaChybaZapisu = Date.now();
      console.warn("[systemove-chyby] zápis zlyhal:", String(e?.message ?? e).slice(0, 200));
    }
  }
}

const NAZOV_ZDROJA: Record<ZdrojChyby, string> = {
  server: "server",
  prehliadac: "prehliadač",
  appka: "appka",
  cron: "cron",
  hook: "hook",
};

async function upozorni(r: ReturnType<typeof pripravRiadok>, nova: boolean) {
  try {
    const { upozorniAdminovTelegram } = await import("@/lib/faktero/telegram.server");
    const web = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
    const text = [
      `${nova ? "Nová" : "Znovu sa objavila"} chyba (${NAZOV_ZDROJA[r.zdroj]})`,
      r.sprava.slice(0, 400),
      [r.metoda, r.trasa, r.http_status].filter(Boolean).join(" ") || null,
      `${web}/admin/errors`,
    ]
      .filter(Boolean)
      .join("\n");
    await upozorniAdminovTelegram({ text });
  } catch {
    /* upozornenie je doplnok — chyba sa už zapísala */
  }
}

/**
 * Zaznamená chybu. Nikdy nehodí výnimku a nečaká na databázu.
 * Vráti `true`, keď sa chyba zaradila na zápis (pre testy a logy).
 */
export function zaznamenajChybu(v: VstupChyby): boolean {
  try {
    // Klient odišiel (zavrel kartu, prešiel inam) — nie je to chyba aplikácie.
    // Server funkcie ho hlásia ako AbortError/„aborted“ cez middleware, nie cez server.ts.
    if (jeOdpojenieKlienta(v.chyba)) return false;
    const riadok = pripravRiadok(v);
    const pocet = strop.pust(riadok.zdroj, riadok.odtlacok);
    if (pocet == null) return false;
    // Až po odoslaní odpovede — požiadavka na zápis nečaká.
    setImmediate(() => void zapis(riadok, pocet));
    return true;
  } catch {
    return false;
  }
}

/** Zdroj podľa cesty — hooky volané z pg_cron sa v admine ukazujú pri cronoch. */
export function zdrojPodlaCesty(cesta: string): ZdrojChyby {
  return cesta.startsWith("/api/public/hooks/") ? "hook" : "server";
}

/**
 * Chyba server funkcie. Očakávané chyby (zlá vstupná hodnota, chýbajúce
 * prihlásenie, presmerovanie) sa nezapisujú; obyčajná `Error` so slovenskou
 * hláškou pre používateľa ide ako „varovanie“ (bez upozornenia), programové
 * chyby (TypeError, ReferenceError…) a chyby databázy ako „chyba“.
 */
export function urovenChybyFunkcie(e: unknown): UrovenChyby | null {
  if (e == null) return null;
  if (typeof Response !== "undefined" && e instanceof Response) return null;
  const o = e as { name?: unknown; message?: unknown; statusCode?: unknown; isNotFound?: unknown };
  if (o.isNotFound) return null;
  if (typeof o.statusCode === "number" && o.statusCode < 500) return null;
  const meno = typeof o.name === "string" ? o.name : "";
  const sprava = typeof o.message === "string" ? o.message : "";
  if (meno === "ZodError") return "varovanie";
  if (
    /^(Unauthorized|Forbidden|Not authenticated|Invalid JWT|JWT expired|Auth session missing)/i.test(
      sprava,
    )
  )
    return null;
  if (/^(TypeError|ReferenceError|RangeError|SyntaxError|EvalError|URIError)$/.test(meno))
    return "chyba";
  if (
    /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|PGRST|violates|duplicate key|permission denied|does not exist/i.test(
      sprava,
    )
  )
    return "chyba";
  return "varovanie";
}
