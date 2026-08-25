/**
 * Prijímač notifikácií od Tatra banky.
 *
 * POZOR — provizórny stav. Tatra banka nám zatiaľ nedodala dokumentáciu k formátu
 * notifikácií (aké hlavičky posiela, či a ako telo podpisuje, aká je štruktúra
 * payloadu). Preto tento handler notifikáciu **iba prijme, overí zdieľané tajomstvo
 * a uloží** — zámerne z nej nič neodvodzuje a nespúšťa žiadnu synchronizáciu.
 * Konať na základe neautentizovaného obsahu by bola diera; keď dorazí dokumentácia,
 * doplní sa overenie podpisu a spracovanie uložených záznamov.
 *
 * Banka nám notifikácie naozaj posiela (brána `Layer7-SecureSpan-Gateway`), ale
 * naše zdieľané tajomstvo nepozná — nikdy sme jej ho nemali ako odovzdať. Všetky
 * volania preto padali na 401 a nezostala po nich žiadna stopa okrem riadku v logu.
 * Odmietnutú notifikáciu teraz uložíme ako diagnostiku (`error_message` vyplnené,
 * `processed = false`), aby bolo z čoho zistiť, čím sa banka autentizuje — z
 * hlavičky `Authorization` si necháme **len schému** (`Basic`, `Bearer`), nikdy
 * samotný údaj. Stále vraciame 401 a stále z obsahu nič neodvodzujeme.
 */

const MAX_BODY_BYTES = 64 * 1024;

/** Koľko odmietnutých notifikácií si za deň uložíme, aby sa tabuľka nedala zaplaviť. */
const MAX_ODMIETNUTYCH_ZA_DEN = 50;

/** Porovnanie odolné voči časovej analýze. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Hlavičky, ktorých hodnota sa neukladá nikdy — nesú prihlasovacie údaje.
 * Ich názov v zázname ostane (s hodnotou `(vynechané)`), lebo práve to, či ich
 * banka posiela, potrebujeme vedieť.
 */
const CITLIVE_HLAVICKY = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-webhook-secret",
];

/**
 * Zo `Authorization` sa uloží **len schéma** — teda slovo `Basic` alebo
 * `Bearer`, nikdy to, čo za ním nasleduje.
 *
 * Bez toho sa nedá zistiť, čím sa banka vlastne autentizuje: v tabuľke bolo
 * vidieť len to, že hlavička prišla. Schéma je verejná časť hlavičky (posiela
 * ju každý server v `WWW-Authenticate`), údaj za ňou nie — preto sa berie iba
 * prvé slovo, a aj to len keď za ním naozaj niečo je a vyzerá ako názov
 * schémy. Hlavička bez medzery je celá jeden údaj a nesmie sa z nej uložiť nič.
 */
const SCHEMA = /^[A-Za-z][A-Za-z0-9._-]{0,20}$/;

export function schemaAutorizacie(hodnota: string): string | null {
  const medzera = hodnota.indexOf(" ");
  if (medzera <= 0) return null;
  const slovo = hodnota.slice(0, medzera);
  if (!SCHEMA.test(slovo)) return null;
  // Za schémou musí byť aj samotný údaj — inak je „slovo" celá hodnota.
  if (!hodnota.slice(medzera + 1).trim()) return null;
  return slovo;
}

/**
 * Popis tvaru tajomstva — bez tajomstva samotného.
 *
 * Zo záznamov bolo vidieť len to, že `Authorization` prišla, a keďže nemá tvar
 * `Schéma Údaj`, nedala sa z nej prečítať ani schéma. Bez toho sa nedá povedať,
 * čo vlastne overovať. Odtlačok hovorí, ako hodnota vyzerá — dĺžka a trieda
 * znakov — a nič z nej nezverejňuje.
 *
 * Dĺžka sa ukladá presná zámerne: bez nej sa nerozozná 32-znakový hex od JWT
 * a práve to potrebujeme vedieť. Sú to naše vlastné diagnostické záznamy,
 * do ktorých sa dostane len správca.
 */
export function odtlacokTajomstva(hodnota: string): string {
  const h = hodnota.trim();
  if (!h) return "prázdne";
  const medzery = (h.match(/ /g) ?? []).length;
  return [`dĺžka ${h.length}`, medzery ? `medzier ${medzery}` : "bez medzery", tvarHodnoty(h)].join(
    ", ",
  );
}

function tvarHodnoty(h: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(h)) return "UUID";
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(h)) return "JWT";
  if (/^[0-9a-fA-F]+$/.test(h) && h.length % 2 === 0) return "hex";
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(h) && h.length % 4 === 0) {
    /*
      Base64, v ktorom je po dekódovaní dvojbodka, je takmer isto `meno:heslo`
      — teda Basic poslaný bez slova „Basic". To je odpoveď na otázku, čím sa
      banka autentizuje, a dá sa zistiť bez toho, aby sa čokoľvek z obsahu
      uložilo.
    */
    try {
      const dekodovane = Buffer.from(h, "base64").toString("utf8");
      const citatelne = /^[\x20-\x7e]+$/.test(dekodovane);
      if (citatelne && dekodovane.includes(":")) {
        return "base64 s dvojbodkou (vyzerá ako Basic bez slova Basic)";
      }
      if (citatelne) return "base64 (čitateľný text)";
    } catch {
      /* nedekódovateľné je stále base64-tvar, viac vedieť netreba */
    }
    return "base64";
  }
  const triedy = [
    /[a-z]/.test(h) && "malé",
    /[A-Z]/.test(h) && "veľké",
    /[0-9]/.test(h) && "číslice",
    /[^A-Za-z0-9]/.test(h) && "aj iné znaky",
  ].filter(Boolean);
  return triedy.length ? triedy.join("+") : "neznámy tvar";
}

function pickHeaders(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    const kluc = name.toLowerCase();
    if (!CITLIVE_HLAVICKY.includes(kluc)) {
      out[kluc] = value.slice(0, 500);
      return;
    }
    const schema = kluc.endsWith("authorization") ? schemaAutorizacie(value) : null;
    // Keď schéma je, odtlačok sa robí z toho, čo za ňou nasleduje — inak
    // z celej hodnoty, lebo celá je vtedy jeden údaj.
    const zvysok = schema ? value.slice(schema.length + 1) : value;
    out[kluc] = `${schema ? `${schema} ` : ""}(vynechané; ${odtlacokTajomstva(zvysok)})`;
  });
  return out;
}

function clientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim().slice(0, 64);
  return request.headers.get("x-real-ip")?.slice(0, 64) ?? null;
}

/** Uloží notifikáciu. `chyba` je vyplnená pri odmietnutej — tá je len diagnostika. */
async function ulozUdalost(args: {
  request: Request;
  path: string;
  raw: string;
  chyba: string | null;
}): Promise<void> {
  const { request, path, raw, chyba } = args;

  let payload: unknown = null;
  if ((request.headers.get("content-type") ?? "").includes("json")) {
    try {
      payload = JSON.parse(raw);
    } catch {
      // Neplatný JSON necháme len v raw_body, nie je to dôvod vrátiť chybu.
    }
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (chyba) {
      // Odmietnutú notifikáciu môže poslať ktokoľvek, takže si ich za deň
      // uložíme len obmedzený počet. Na zistenie, čím sa banka autentizuje,
      // stačí zopár vzoriek.
      const od = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("bank_webhook_events")
        .select("id", { count: "exact", head: true })
        .not("error_message", "is", null)
        .gte("created_at", od);
      if ((count ?? 0) >= MAX_ODMIETNUTYCH_ZA_DEN) return;
    }

    const { error } = await supabaseAdmin.from("bank_webhook_events").insert({
      provider: "tatrabanka",
      path,
      method: request.method,
      headers: pickHeaders(request),
      payload: payload as any,
      raw_body: raw || null,
      source_ip: clientIp(request),
      error_message: chyba,
    });
    if (error) throw new Error(error.message);
  } catch (e: any) {
    // Chybu zalogujeme, ale banke vrátime pôvodnú odpoveď — inak by notifikáciu
    // donekonečna opakovala kvôli našej internej chybe.
    console.error("[tatrabanka webhook] uloženie zlyhalo:", e?.message ?? e);
  }
}

export async function handleTatraWebhook(request: Request, path: string): Promise<Response> {
  // Banka aj portál si endpoint overujú obyčajným GETom — nech vidia, že žije.
  if (request.method === "GET" || request.method === "HEAD") {
    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  }
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const secret = process.env.TB_WEBHOOK_SECRET?.trim();
  const url = new URL(request.url);
  const supplied = url.searchParams.get("s") ?? request.headers.get("x-webhook-secret") ?? "";

  if (!secret) {
    // Bez nastaveného tajomstva by ktokoľvek na internete vedel plniť tabuľku.
    // Notifikáciu preto potvrdíme, ale neukladáme – len zalogujeme, že prišla.
    console.warn(
      `[tatrabanka webhook] TB_WEBHOOK_SECRET nie je nastavený – notifikácia prijatá a zahodená (path=${path})`,
    );
    return new Response("ok", { status: 200 });
  }

  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return new Response("bad body", { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    console.warn(`[tatrabanka webhook] telo príliš veľké (${raw.length} B), orezané`);
    raw = raw.slice(0, MAX_BODY_BYTES);
  }

  if (!safeEqual(supplied, secret)) {
    console.warn(`[tatrabanka webhook] odmietnuté – nesedí tajomstvo (path=${path})`);
    await ulozUdalost({ request, path, raw, chyba: "odmietnuté – nesedí tajomstvo" });
    return new Response("unauthorized", { status: 401 });
  }

  await ulozUdalost({ request, path, raw, chyba: null });
  return new Response("ok", { status: 200 });
}
