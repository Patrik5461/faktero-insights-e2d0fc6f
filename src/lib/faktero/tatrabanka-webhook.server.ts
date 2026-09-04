/**
 * Prijímač notifikácií od Tatra banky.
 *
 * Banka nám klope vždy, keď na účte pribudne pohyb — telo je len ťuknutie po
 * pleci, žiadne sumy v ňom nie sú:
 *
 *     {"events": {"transactionEvents": [{"consentId": "…", "eventType": "NEW",
 *      "accounts": [{"accountId": "…"}]}]}}
 *
 * Dokumentáciu k formátu sme nikdy nedostali a z hlavičiek naozajstných
 * notifikácií je vidieť, že banka **neposiela nijaký overovací údaj** —
 * `Authorization` chodí prázdna, `x-webhook-secret` ani `?s=` nie sú. Zdieľané
 * tajomstvo sme jej nemali ako odovzdať, takže sa nikdy netrafilo a všetkých
 * 101 notifikácií od augusta 2026 skončilo na 401.
 *
 * Preukazom je preto `consentId`: je to UUID, ktoré vzniklo pri udelení súhlasu
 * a pozná ho len banka a my. Notifikáciu prijmeme, keď aspoň jeden `consentId`
 * v nej sedí na naše živé pripojenie — alebo keď sedí tajomstvo, ak by nám ho
 * banka niekedy začala posielať.
 *
 * Z obsahu notifikácie sa **neberú žiadne dáta**. Jediné, čo vyvolá, je to isté
 * sťahovanie z API banky, aké robí nočný cron. Aj podvrhnutá notifikácia so
 * správne uhádnutým UUID by teda dosiahla nanajvýš to, že sa natiahneme o
 * chvíľu skôr.
 *
 * Odmietnutá notifikácia sa uloží ako diagnostika (`error_message` vyplnené,
 * `processed = false`) — z hlavičky `Authorization` si necháme len schému
 * (`Basic`, `Bearer`), nikdy samotný údaj.
 */

const MAX_BODY_BYTES = 64 * 1024;

/** Koľko odmietnutých notifikácií si za deň uložíme, aby sa tabuľka nedala zaplaviť. */
const MAX_ODMIETNUTYCH_ZA_DEN = 50;

/**
 * Okno sťahovania pri notifikácii. Kratšie než nočných 14 dní — notifikácia je
 * o pohybe, ktorý pribudol teraz, a odpoveď má byť rýchla.
 */
const DNI_PRI_NOTIFIKACII = 7;

/** Ako často najviac sa smie kvôli notifikáciám ťahať ten istý súhlas. */
const MIN_ODSTUP_MS = 60_000;

/** Kedy sme naposledy ťahali pre daný súhlas. Banka pošle aj niekoľko výziev za sebou. */
const poslednyBeh = new Map<string, number>();

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pozbiera `consentId` z tela notifikácie.
 *
 * Hľadá sa v celom strome, nie na pevnej ceste: formát nemáme popísaný a keď ho
 * banka preskupí, notifikácia sa nesmie stať neprečítateľnou. Zoberú sa len
 * hodnoty tvaru UUID a najviac desať — zvyšok je pokus o zahltenie.
 */
export function suhlasyZNotifikacie(payload: unknown): string[] {
  const najdene = new Set<string>();
  const prejdi = (uzol: unknown, hlbka: number): void => {
    if (najdene.size >= 10 || hlbka > 8 || !uzol || typeof uzol !== "object") return;
    if (Array.isArray(uzol)) {
      for (const p of uzol.slice(0, 100)) prejdi(p, hlbka + 1);
      return;
    }
    for (const [kluc, hodnota] of Object.entries(uzol)) {
      if (kluc.toLowerCase() === "consentid" && typeof hodnota === "string" && UUID.test(hodnota)) {
        najdene.add(hodnota);
      } else {
        prejdi(hodnota, hlbka + 1);
      }
    }
  };
  prejdi(payload, 0);
  return [...najdene];
}

/**
 * Ktoré zo súhlasov v notifikácii patria našim živým pripojeniam.
 *
 * Toto je celé overenie: `consentId` vzniklo pri udelení súhlasu a pozná ho len
 * banka a my. Neznáme sa ticho zahodí — banka posiela aj súhlasy, ktoré sme už
 * nahradili novšími, a nie je to chyba.
 */
async function znameSuhlasy(consentIds: string[]): Promise<string[]> {
  if (!consentIds.length) return [];
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("bank_connections")
      .select("consent_id")
      .eq("provider", "tatrabanka")
      .eq("status", "connected")
      .in("consent_id", consentIds);
    return (data ?? []).map((r: any) => r.consent_id).filter(Boolean);
  } catch (e: any) {
    // Keď sa nedá overiť, notifikáciu radšej odmietneme — prijať neoverenú
    // by znamenalo pustiť sťahovanie na cudzí podnet.
    console.error("[tatrabanka webhook] overenie súhlasu zlyhalo:", e?.message ?? e);
    return [];
  }
}

/**
 * Spustí sťahovanie pre súhlasy z notifikácie — mimo odpovede banke.
 *
 * Banka čaká na potvrdenie a nginx volanie po 30 sekundách preruší, kým celé
 * sťahovanie trvá dlhšie. Preto sa odpovie hneď a ťahá sa až potom; keby to
 * padlo, nočný cron to o pár hodín dobehne.
 */
function spustiSync(consentIds: string[]): void {
  const teraz = Date.now();
  const nato = consentIds.filter((c) => teraz - (poslednyBeh.get(c) ?? 0) >= MIN_ODSTUP_MS);
  if (!nato.length) {
    console.log("[tatrabanka webhook] sťahovanie preskočené — bolo pred chvíľou");
    return;
  }
  for (const c of nato) poslednyBeh.set(c, teraz);

  void (async () => {
    try {
      const { syncPodlaSuhlasov } = await import("./bank-sync.server");
      await syncPodlaSuhlasov(nato, DNI_PRI_NOTIFIKACII);
    } catch (e: any) {
      console.error("[tatrabanka webhook] sťahovanie zlyhalo:", e?.message ?? e);
    }
  })();
}

/** Uloží notifikáciu. `chyba` je vyplnená pri odmietnutej — tá je len diagnostika. */
async function ulozUdalost(args: {
  request: Request;
  path: string;
  raw: string;
  payload: unknown;
  chyba: string | null;
}): Promise<void> {
  const { request, path, raw, payload, chyba } = args;

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
      processed: !chyba,
      processed_at: chyba ? null : new Date().toISOString(),
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

  let payload: unknown = null;
  if ((request.headers.get("content-type") ?? "").includes("json")) {
    try {
      payload = JSON.parse(raw);
    } catch {
      // Neplatný JSON necháme len v raw_body, nie je to dôvod vrátiť chybu.
    }
  }

  const suhlasy = await znameSuhlasy(suhlasyZNotifikacie(payload));

  // Tajomstvo ostáva ako druhá cesta — keby nám ho banka niekedy začala posielať.
  const secret = process.env.TB_WEBHOOK_SECRET?.trim();
  const url = new URL(request.url);
  const supplied = url.searchParams.get("s") ?? request.headers.get("x-webhook-secret") ?? "";
  const tajomstvoSedi = !!secret && safeEqual(supplied, secret);

  if (!suhlasy.length && !tajomstvoSedi) {
    console.warn(`[tatrabanka webhook] odmietnuté – neznámy súhlas (path=${path})`);
    await ulozUdalost({ request, path, raw, payload, chyba: "odmietnuté – neznámy súhlas" });
    return new Response("unauthorized", { status: 401 });
  }

  await ulozUdalost({ request, path, raw, payload, chyba: null });
  if (suhlasy.length) spustiSync(suhlasy);
  return new Response("ok", { status: 200 });
}
