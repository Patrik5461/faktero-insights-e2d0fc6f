import { createHmac, randomBytes, timingSafeEqual } from "crypto";
/*
  Trans.eu — volania API, OAuth a prevod prepravných objednávok na doklady.
  Len server: tokeny a kľúče aplikácie nikdy neodchádzajú do prehliadača.

  Prihlasovacie údaje aplikácie (Client ID, Client Secret, Api-key) vydáva
  Trans.eu na žiadosť (formulár pre poskytovateľov softvéru). Faktero má svoje
  v premenných TRANSEU_CLIENT_ID / TRANSEU_CLIENT_SECRET / TRANSEU_API_KEY;
  dopravca, ktorý si vybavil vlastné, ich uloží v nastavení (zašifrované) a
  potom platia tie jeho.
*/
import {
  TRANSEU_API,
  autorizacnaUrl,
  cestaZoznamu,
  chybaTranseu,
  daSaFakturovat,
  den,
  icDphZakaznika,
  nazovPolozky,
  popisPolozky,
  riadokObjednavky,
  teloFaktury,
  teloTokenu,
  type TranseuObjednavka,
} from "./transeu";

type Klient = any;

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

export type KonfigTranseu = {
  clientId: string;
  clientSecret: string;
  apiKey: string;
  redirectUri: string;
  vlastna: boolean;
};

/** Adresa, na ktorú Trans.eu vráti používateľa po prihlásení. */
export function navratovaAdresa(): string {
  if (process.env.TRANSEU_REDIRECT_URI) return process.env.TRANSEU_REDIRECT_URI;
  const base = (process.env.APP_PUBLIC_URL ?? "https://www.faktero.sk").replace(/\/+$/, "");
  return `${base}/api/public/transeu/callback`;
}

/** Údaje aplikácie: vlastné od dopravcu, inak Faktera. */
export async function konfigTranseu(companyId: string): Promise<KonfigTranseu> {
  const a = await admin();
  const { data } = await a
    .from("transeu_napojenia")
    .select("client_id, client_secret_sifrovany, api_kluc_sifrovany")
    .eq("company_id", companyId)
    .maybeSingle();
  if (data?.client_id && data.client_secret_sifrovany && data.api_kluc_sifrovany) {
    const { decryptSecret } = await import("./payment-crypto.server");
    return {
      clientId: data.client_id,
      clientSecret: decryptSecret(data.client_secret_sifrovany),
      apiKey: decryptSecret(data.api_kluc_sifrovany),
      redirectUri: navratovaAdresa(),
      vlastna: true,
    };
  }
  const id = process.env.TRANSEU_CLIENT_ID;
  const secret = process.env.TRANSEU_CLIENT_SECRET;
  const key = process.env.TRANSEU_API_KEY;
  if (!id || !secret || !key)
    throw new Error(
      "Faktero zatiaľ nemá od Trans.eu pridelenú aplikáciu. Zadajte vlastné Client ID, Client Secret a Api-key z Trans.eu.",
    );
  return {
    clientId: id,
    clientSecret: secret,
    apiKey: key,
    redirectUri: navratovaAdresa(),
    vlastna: false,
  };
}

/** Má Faktero vlastnú aplikáciu v Trans.eu (premenné prostredia)? */
export function maAplikaciuFaktera(): boolean {
  return Boolean(
    process.env.TRANSEU_CLIENT_ID &&
    process.env.TRANSEU_CLIENT_SECRET &&
    process.env.TRANSEU_API_KEY,
  );
}

/* ------------------------------ OAuth state ------------------------------ */

function kluc(): string {
  const k = process.env.PAYMENT_SECRETS_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("Chýba kľúč na podpis.");
  return k;
}

/** Cookie, ktorá viaže prihlásenie na prehliadač, v ktorom začalo (ochrana pred CSRF). */
export const COOKIE_TRANSEU = "faktero_transeu_oauth";
const PLATNOST_STAVU_MS = 10 * 60 * 1000;

export type StavTranseu = { companyId: string; userId: string; nonce: string };

/**
 * Podpísaný `state` s firmou, používateľom a náhodným `nonce`; platí 10 minút
 * (kód z Trans.eu aj tak len minútu). Ten istý `nonce` dostane prehliadač do
 * httpOnly cookie — callback prijme len state z prehliadača, ktorý prihlásenie
 * začal. Inak by útočník mohol poslať obeti svoj odkaz na prihlásenie a jej
 * účet Trans.eu by sa pripojil k firme útočníka (OAuth login CSRF).
 */
export function podpisanyStavTranseu(
  companyId: string,
  userId: string,
  nonce = randomBytes(16).toString("hex"),
): string {
  const telo = `${companyId}.${userId}.${Date.now()}.${nonce}`;
  const mac = createHmac("sha256", kluc()).update(`transeu.${telo}`).digest("hex").slice(0, 32);
  return Buffer.from(`${telo}.${mac}`).toString("base64url");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function overStavTranseu(stav: string): StavTranseu | null {
  const surovy = Buffer.from(String(stav ?? ""), "base64url").toString("utf8");
  const casti = surovy.split(".");
  if (casti.length !== 5) return null;
  const [companyId, userId, ts, nonce, mac] = casti;
  const ocakavany = createHmac("sha256", kluc())
    .update(`transeu.${companyId}.${userId}.${ts}.${nonce}`)
    .digest("hex")
    .slice(0, 32);
  const a = Buffer.from(mac);
  const b = Buffer.from(ocakavany);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const vek = Date.now() - Number(ts);
  if (!Number.isFinite(vek) || vek < 0 || vek > PLATNOST_STAVU_MS) return null;
  if (!UUID.test(companyId) || !UUID.test(userId) || !/^[0-9a-f]{32}$/.test(nonce)) return null;
  return { companyId, userId, nonce };
}

/** Zhoduje sa nonce z cookie s tým v `state`? (porovnanie v konštantnom čase) */
export function cookieSedi(cookie: string | null | undefined, nonce: string): boolean {
  if (!cookie) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(nonce);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Hodnota cookie z hlavičky `Cookie`. */
export function cookieZPoziadavky(hlavicka: string | null, meno = COOKIE_TRANSEU): string | null {
  for (const c of String(hlavicka ?? "").split(";")) {
    const i = c.indexOf("=");
    if (i > 0 && c.slice(0, i).trim() === meno) return c.slice(i + 1).trim();
  }
  return null;
}

/**
 * Doména cookie: na faktero.sk aj www.faktero.sk tá istá, lebo návratová
 * adresa je pevná (www) a človek mohol začať aj na adrese bez www.
 */
export function domenaCookie(host: string | null | undefined): string | undefined {
  const h = String(host ?? "")
    .toLowerCase()
    .replace(/:\d+$/, "");
  return h === "faktero.sk" || h.endsWith(".faktero.sk") ? "faktero.sk" : undefined;
}

/** Cookie s adresou, z ktorej človek prihlásenie začal — tam sa po ňom vráti. */
export const COOKIE_TRANSEU_NAVRAT = "faktero_transeu_navrat";

/** Adresy, na ktoré sa po prihlásení smie vrátiť (inak by cookie bola otvorené presmerovanie). */
const NAVRATOVE_HOSTY = new Set(["faktero.sk", "www.faktero.sk"]);

/**
 * Kam sa vrátiť po prihlásení do Trans.eu. Návratová adresa pre Trans.eu je
 * pevná (www), ale prihlásenie do Faktera drží prehliadač zvlášť pre každú
 * adresu — kto začal na faktero.sk bez www, by sa po návrate na www ocitol
 * odhlásený. Preto späť tam, kde začal; cudziu adresu z cookie neprijme.
 */
export function navratovyHost(zCookie: string | null | undefined, callback: string): string {
  const h = String(zCookie ?? "")
    .trim()
    .toLowerCase();
  return NAVRATOVE_HOSTY.has(h) && domenaCookie(callback) === "faktero.sk" ? h : callback;
}

export async function autorizacnaAdresa(
  companyId: string,
  userId: string,
): Promise<{ url: string; nonce: string }> {
  const k = await konfigTranseu(companyId);
  const nonce = randomBytes(16).toString("hex");
  return {
    url: autorizacnaUrl(k.clientId, k.redirectUri, podpisanyStavTranseu(companyId, userId, nonce)),
    nonce,
  };
}

/**
 * Kto prihlásenie začal, musí byť vo firme stále majiteľ alebo admin — state
 * platí 10 minút a medzitým ho mohli z firmy odobrať.
 */
export async function smiePripojit(companyId: string, userId: string): Promise<boolean> {
  const a = await admin();
  const { data } = await a
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data && ["owner", "admin"].includes(String(data.role)));
}

/** Chyba prihlásenia pri napojení — ukáže sa v Nastavenia → Trans.eu. */
export async function zapisChybuPrihlasenia(companyId: string, sprava: string) {
  const a = await admin();
  await a
    .from("transeu_napojenia")
    .update({ posledna_chyba: sprava.slice(0, 300), updated_at: new Date().toISOString() })
    .eq("company_id", companyId);
}

type Tokeny = { access_token: string; refresh_token?: string; expires_in?: number };

async function ziadostOToken(k: KonfigTranseu, telo: string): Promise<Tokeny> {
  const r = await fetch(`${TRANSEU_API}/ext/auth-api/accounts/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "Api-key": k.apiKey,
    },
    body: telo,
    signal: AbortSignal.timeout(20_000),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new Error(chybaTranseu(r.status, j));
  return j as Tokeny;
}

async function ulozTokeny(companyId: string, t: Tokeny, stareObnovenie?: string | null) {
  const { encryptSecret } = await import("./payment-crypto.server");
  const a = await admin();
  // Trans.eu pri obnove posiela nový refresh token — vždy platí ten najnovší.
  const obnova = t.refresh_token ?? stareObnovenie ?? null;
  const { data, error } = await a
    .from("transeu_napojenia")
    .update({
      access_token_sifrovany: encryptSecret(t.access_token),
      refresh_token_sifrovany: obnova ? encryptSecret(obnova) : null,
      token_plati_do: new Date(Date.now() + (t.expires_in ?? 21_599) * 1000).toISOString(),
      stav: "pripojene",
      posledna_chyba: null,
      obnova_zamok_do: null,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("company_id", companyId)
    .select("company_id");
  if (error) throw new Error(error.message);
  // Napojenie medzitým niekto odpojil — tokeny nemajú kam patriť.
  if (!data?.length) throw new Error("Napojenie na Trans.eu medzitým zrušili — pripojte ho znova.");
}

/** Výmena kódu z presmerovania za tokeny (callback). */
export async function dokonciPrihlasenie(companyId: string, code: string): Promise<void> {
  const k = await konfigTranseu(companyId);
  const t = await ziadostOToken(
    k,
    teloTokenu({ druh: "kod", code, redirectUri: k.redirectUri }, k.clientId, k.clientSecret),
  );
  await ulozTokeny(companyId, t);
  // Názov a IČ DPH vlastnej firmy — na kontrolu, že je pripojený správny účet.
  try {
    const firma = await transeuApi<any>(companyId, "/ext/companies-api/v1/companies");
    const a = await admin();
    await a
      .from("transeu_napojenia")
      .update({ firma_nazov: firma?.legal_name ?? null, firma_vat_id: firma?.vat_id ?? null })
      .eq("company_id", companyId);
  } catch (e) {
    console.warn("[transeu] údaje firmy", (e as Error)?.message);
  }
}

type TokenyRiadok = {
  access_token_sifrovany: string | null;
  refresh_token_sifrovany: string | null;
  token_plati_do: string | null;
  obnova_zamok_do: string | null;
  stav: string | null;
  posledna_chyba: string | null;
};

async function nacitajTokeny(companyId: string): Promise<TokenyRiadok | null> {
  const a = await admin();
  const { data } = await a
    .from("transeu_napojenia")
    .select(
      "access_token_sifrovany, refresh_token_sifrovany, token_plati_do, obnova_zamok_do, stav, posledna_chyba",
    )
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as TokenyRiadok | null) ?? null;
}

/** Obnovy, ktoré práve bežia v tomto procese — druhé volanie počká na prvé. */
const obnovyBezia = new Map<string, Promise<string>>();
/** Ako dlho drží obnova zámok v databáze (pád procesu ho tak neblokuje navždy). */
const ZAMOK_OBNOVY_MS = 30_000;

/**
 * Platný access token. Trans.eu pri obnove refresh token vymení a starý
 * zneplatní — keby dve volania (cron + klik, dve karty, dva procesy) obnovovali
 * naraz, druhé pošle už neplatný token, dostane invalid_grant a napojenie by
 * spadlo do „treba sa prihlásiť znova“. Obnova preto beží len raz: v procese
 * cez `obnovyBezia`, medzi procesmi cez zámok `obnova_zamok_do` v databáze;
 * ostatní počkajú na nový token.
 */
async function platnyToken(companyId: string, vynutitObnovu = false, zlyToken?: string) {
  const data = await nacitajTokeny(companyId);
  if (!data?.access_token_sifrovany) throw new Error("Trans.eu nie je pripojený.");
  const { decryptSecret } = await import("./payment-crypto.server");
  const plati = data.token_plati_do ? Date.parse(data.token_plati_do) - Date.now() > 60_000 : false;
  if (plati && !vynutitObnovu) return decryptSecret(data.access_token_sifrovany);
  // Po 401: ak token medzitým vymenil niekto iný, stačí ten nový.
  if (plati && zlyToken) {
    const aktualny = decryptSecret(data.access_token_sifrovany);
    if (aktualny !== zlyToken) return aktualny;
  }
  const bezi = obnovyBezia.get(companyId);
  if (bezi) return bezi;
  const p = obnovToken(companyId, data).finally(() => obnovyBezia.delete(companyId));
  obnovyBezia.set(companyId, p);
  return p;
}

async function obnovToken(companyId: string, data: TokenyRiadok, pokus = 0): Promise<string> {
  if (!data.refresh_token_sifrovany)
    throw new Error("Prihlásenie do Trans.eu vypršalo — pripojte účet znova.");
  const a = await admin();
  const teraz = new Date().toISOString();
  // Zámok dostane len ten, kto ešte vidí ten istý refresh token a nikto iný ho nedrží.
  const { data: zamok, error } = await a
    .from("transeu_napojenia")
    .update({ obnova_zamok_do: new Date(Date.now() + ZAMOK_OBNOVY_MS).toISOString() } as any)
    .eq("company_id", companyId)
    .eq("refresh_token_sifrovany", data.refresh_token_sifrovany)
    .or(`obnova_zamok_do.is.null,obnova_zamok_do.lt.${teraz}`)
    .select("company_id");
  if (error) throw new Error(error.message);
  if (!zamok?.length) return pockajNaObnovu(companyId, data.refresh_token_sifrovany, pokus);

  const { decryptSecret } = await import("./payment-crypto.server");
  const k = await konfigTranseu(companyId);
  const stary = decryptSecret(data.refresh_token_sifrovany);
  try {
    const t = await ziadostOToken(
      k,
      teloTokenu({ druh: "obnova", refreshToken: stary }, k.clientId, k.clientSecret),
    );
    await ulozTokeny(companyId, t, stary);
    return t.access_token;
  } catch (e: any) {
    await a
      .from("transeu_napojenia")
      .update({
        stav: "chyba",
        posledna_chyba: String(e?.message ?? e).slice(0, 300),
        obnova_zamok_do: null,
      } as any)
      .eq("company_id", companyId);
    throw e;
  }
}

/** Obnovu robí iný proces — počká na nový token (alebo na uvoľnenie zámku). */
async function pockajNaObnovu(companyId: string, staryRefresh: string, pokus: number) {
  const { decryptSecret } = await import("./payment-crypto.server");
  const koniec = Date.now() + ZAMOK_OBNOVY_MS + 5_000;
  while (Date.now() < koniec) {
    await new Promise((r) => setTimeout(r, 250));
    const d = await nacitajTokeny(companyId);
    if (!d?.access_token_sifrovany) throw new Error("Trans.eu nie je pripojený.");
    if (d.refresh_token_sifrovany !== staryRefresh) {
      if (d.stav === "chyba" || !d.refresh_token_sifrovany)
        throw new Error(
          d.posledna_chyba ?? "Prihlásenie do Trans.eu vypršalo — pripojte účet znova.",
        );
      return decryptSecret(d.access_token_sifrovany);
    }
    const drzany = d.obnova_zamok_do && Date.parse(d.obnova_zamok_do) > Date.now();
    if (!drzany) {
      // Ten druhý skončil bez nového tokenu.
      if (d.stav === "chyba")
        throw new Error(
          d.posledna_chyba ?? "Prihlásenie do Trans.eu vypršalo — pripojte účet znova.",
        );
      if (pokus >= 2) break;
      return obnovToken(companyId, d, pokus + 1);
    }
  }
  throw new Error("Trans.eu neodpovedá — obnova prihlásenia trvá príliš dlho.");
}

/**
 * Volanie API s platným tokenom. Pri 401 raz obnoví token, pri chybe servera
 * (5xx) to raz skúsi znova.
 */
export async function transeuApi<T = any>(
  companyId: string,
  cesta: string,
  init: { method?: string; body?: BodyInit; json?: unknown } = {},
): Promise<T> {
  const k = await konfigTranseu(companyId);
  let token = await platnyToken(companyId);
  for (let pokus = 0; pokus < 3; pokus++) {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Api-key": k.apiKey,
    };
    let body = init.body;
    if (init.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.json);
    } else if (!body) headers["Content-Type"] = "application/json";
    const r = await fetch(TRANSEU_API + cesta, {
      method: init.method ?? "GET",
      headers,
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await r.text();
    let j: any = null;
    try {
      j = text ? JSON.parse(text) : null;
    } catch {
      j = null;
    }
    if (r.ok) return j as T;
    if (r.status === 401 && pokus === 0) {
      token = await platnyToken(companyId, true, token);
      continue;
    }
    if (r.status >= 500 && pokus < 2) continue;
    throw new Error(chybaTranseu(r.status, j));
  }
  throw new Error("Trans.eu neodpovedá.");
}

/* ---------------------------- Objednávky ---------------------------- */

const MAX_STRAN = 10; // 30 objednávok na stranu → najviac 300 za jedno stiahnutie

/** Stiahne prijaté objednávky vytvorené po `od` a uloží ich (prepojenia na doklady ostanú). */
export async function stiahniObjednavky(
  companyId: string,
  od: string | null,
): Promise<{ stiahnute: number }> {
  const a = await admin();
  let stiahnute = 0;
  try {
    for (let strana = 1; strana <= MAX_STRAN; strana++) {
      const d = await transeuApi<any>(companyId, cestaZoznamu(od, strana));
      const zoznam: TranseuObjednavka[] = (
        Array.isArray(d) ? d : (d?.items ?? d?.data ?? [])
      ).filter((o: any) => o && typeof o.id === "string");
      if (!zoznam.length) break;
      const teraz = new Date().toISOString();
      const { error } = await a.from("transeu_objednavky").upsert(
        zoznam.map((o) => ({
          company_id: companyId,
          ...riadokObjednavky(o),
          data: o as any,
          stiahnuta_at: teraz,
          updated_at: teraz,
        })),
        { onConflict: "company_id,transeu_id" },
      );
      if (error) throw new Error(error.message);
      stiahnute += zoznam.length;
      if (zoznam.length < 30) break;
    }
    await a
      .from("transeu_napojenia")
      .update({ posledna_sync_at: new Date().toISOString(), posledna_chyba: null })
      .eq("company_id", companyId);
  } catch (e: any) {
    await a
      .from("transeu_napojenia")
      .update({ posledna_chyba: String(e?.message ?? e).slice(0, 300) })
      .eq("company_id", companyId);
    throw e;
  }
  return { stiahnute };
}

/** Adresa a e-mail zadávateľa zo zoznamu partnerov (ak ho dopravca má medzi partnermi). */
async function partnerPodlaVat(companyId: string, vatId: string): Promise<any | null> {
  const cislo = vatId.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cislo.length < 4) return null;
  try {
    const filter = JSON.stringify({ vat_id: { $regex: cislo.replace(/^[A-Z]{2}/, "") } });
    const d = await transeuApi<any>(
      companyId,
      `/ext/partners-api/v1/partners?filter=${encodeURIComponent(filter)}`,
    );
    return d?.partners?.[0]?.company ?? null;
  } catch {
    return null;
  }
}

/** Odberateľ podľa IČ DPH; ak ho firma ešte nemá, založí ho. */
async function odberatel(sb: Klient, companyId: string, r: any): Promise<any> {
  const partner = r.zakaznik_vat_id ? await partnerPodlaVat(companyId, r.zakaznik_vat_id) : null;
  const ic = icDphZakaznika(r.zakaznik_vat_id, partner?.address?.country);
  const holeCislo = (ic.ic_dph ?? String(r.zakaznik_vat_id ?? "")).replace(/^[A-Z]{2}/i, "");
  if (holeCislo) {
    // Len písmená a číslice — hodnota ide do filtra PostgREST.
    const bezpecne = holeCislo.replace(/[^A-Za-z0-9]/g, "");
    const { data: kandidati } = await sb
      .from("customers")
      .select("id, name, ic_dph, dic, ico, country")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .or(`ic_dph.ilike.%${bezpecne},dic.eq.${bezpecne},ico.eq.${bezpecne}`)
      .limit(5);
    const zhoda = (kandidati ?? [])[0];
    if (zhoda) return zhoda;
  }
  const a = partner?.address ?? {};
  const ulica = [a.street, a.number].filter(Boolean).join(" ") || null;
  const { data: novy, error } = await sb
    .from("customers")
    .insert({
      company_id: companyId,
      name: r.zakaznik_nazov || partner?.name || "Zákazník z Trans.eu",
      ic_dph: ic.ic_dph,
      country: ic.krajina ?? (a.country ? String(a.country).toUpperCase() : null),
      street: ulica,
      city: a.locality ?? null,
      zip: a.postal_code ?? null,
      email: partner?.email ?? null,
      phone: partner?.telephone ?? null,
      typ: "firma",
      odberatel: true,
      dodavatel: false,
      notes: "Založený z objednávky Trans.eu",
    })
    .select("id, name, ic_dph, dic, ico, country")
    .single();
  if (error) throw new Error(error.message);
  return novy;
}

async function riadok(sb: Klient, companyId: string, id: string) {
  const { data } = await sb
    .from("transeu_objednavky")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) throw new Error("Objednávka z Trans.eu sa nenašla.");
  return data;
}

/**
 * Sadzba DPH položky prepravy podľa návrhu režimu (`rezim-odberatela.ts`).
 * Preprava je služba: firma s IČ DPH iného štátu EÚ → miesto dodania u nej
 * (§ 15 ods. 1), bez DPH s prenesením; mimo EÚ tiež bez DPH. Inak základná
 * sadzba krajiny firmy. Na faktúre potom režim určí to isté pravidlo.
 */
async function sadzbaPrepravy(sb: Klient, companyId: string, zakaznik: any, datum: string) {
  const { data: firma } = await sb
    .from("companies")
    .select("vat_payer, country")
    .eq("id", companyId)
    .maybeSingle();
  const { krajinaDane, zakladnaSadzba } = await import("./vat-rates");
  const { navrhRezimuDph } = await import("./rezim-odberatela");
  const platitel = firma?.vat_payer !== false;
  const navrh = navrhRezimuDph({
    krajinaFirmy: krajinaDane(firma?.country),
    platitel,
    odberatel: zakaznik,
    plnenie: "sluzba",
  });
  if (!platitel || navrh.druh === "eu_b2b" || navrh.druh === "mimo_eu")
    return { sadzba: 0, navrh: navrh.druh };
  return { sadzba: zakladnaSadzba(krajinaDane(firma?.country), datum), navrh: navrh.druh };
}

/** Akcie nad jednou objednávkou Trans.eu, ktoré práve bežia v tomto procese. */
const akcieBezia = new Map<string, Promise<unknown>>();

/**
 * Akcie nad tou istou objednávkou idú po sebe. Dvojklik (alebo dve karty) na
 * novú objednávku by inak naraz zakladali dve prijaté objednávky — druhá
 * skončila chybou čísla z radu namiesto toho, aby vrátila tú istú faktúru.
 * Druhé volanie počká na prvé a potom už nájde hotovú objednávku aj faktúru.
 * Medzi procesmi stráži to isté podmienený zápis `sales_order_id` nižšie.
 */
async function poJednom<T>(companyId: string, id: string, fn: () => Promise<T>): Promise<T> {
  const kluc = `${companyId}:${id}`;
  const pred = akcieBezia.get(kluc) ?? Promise.resolve();
  const p = pred.catch(() => undefined).then(fn);
  akcieBezia.set(kluc, p);
  try {
    return await p;
  } finally {
    if (akcieBezia.get(kluc) === p) akcieBezia.delete(kluc);
  }
}

/** Prijatá objednávka (Fakturácia → Prijaté objednávky) z objednávky Trans.eu. */
export function zalozObjednavku(
  sb: Klient,
  companyId: string,
  userId: string,
  id: string,
): Promise<{ sales_order_id: string; nova: boolean }> {
  return poJednom(companyId, id, () => zalozObjednavkuTeraz(sb, companyId, userId, id));
}

async function zalozObjednavkuTeraz(
  sb: Klient,
  companyId: string,
  userId: string,
  id: string,
): Promise<{ sales_order_id: string; nova: boolean }> {
  const r = await riadok(sb, companyId, id);
  if (r.sales_order_id) {
    const { data: so } = await sb
      .from("sales_orders")
      .select("id")
      .eq("id", r.sales_order_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (so) return { sales_order_id: so.id, nova: false };
  }
  if (!daSaFakturovat(r.stav))
    throw new Error("Objednávku ste v Trans.eu ešte neprijali (alebo je zrušená).");
  if (!(Number(r.cena) > 0)) throw new Error("Objednávka v Trans.eu nemá cenu.");
  const zakaznik = await odberatel(sb, companyId, r);
  const datum = den(r.nakladka_od) ?? new Date().toISOString().slice(0, 10);
  const objednane = den(r.data?.created_at) ?? datum;
  const { sadzba } = await sadzbaPrepravy(sb, companyId, zakaznik, datum);
  const { cisloZRadu } = await import("./cislo-z-radu.server");
  const { suctyObjednavky } = await import("./objednavky-odberatel");
  const polozka = {
    name: nazovPolozky(r),
    description: popisPolozky(r) || null,
    quantity: 1,
    unit: "ks",
    unit_price: Number(r.cena),
    vat_rate: sadzba,
  };
  const sucty = suctyObjednavky([polozka]);
  const cislo = await cisloZRadu(sb, companyId, "sales_order", {
    datum: `${objednane.slice(0, 4)}-01-01`,
  });
  const vykladka = den(r.vykladka_do);
  const { data: so, error } = await sb
    .from("sales_orders")
    .insert({
      company_id: companyId,
      order_number: cislo.cislo,
      number_series_id: cislo.seriesId,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      customer_id: zakaznik.id,
      customer_name: zakaznik.name,
      customer_ico: zakaznik.ico ?? null,
      customer_order_number: r.cislo ?? null,
      order_date: objednane,
      requested_date: vykladka && vykladka >= objednane ? vykladka : null,
      currency: r.mena || "EUR",
      reserve_stock: false,
      note: `Trans.eu ${r.cislo ?? r.transeu_id}${r.referencia ? `, ref. ${r.referencia}` : ""}`,
      subtotal: sucty.subtotal,
      vat_total: sucty.vat_total,
      total: sucty.total,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const { error: e2 } = await sb
    .from("sales_order_items")
    .insert({ sales_order_id: so.id, position: 0, ...polozka });
  if (e2) throw new Error(e2.message);
  const a = await admin();
  /*
    Podmienený zápis: keď objednávku medzitým založilo iné volanie (iný
    proces), vyhráva to prvé — naša sa zmaže a vráti sa tá jeho.
  */
  const podmienka = a
    .from("transeu_objednavky")
    .update({ sales_order_id: so.id, chyba: null, updated_at: new Date().toISOString() })
    .eq("id", r.id);
  const { data: zapisane } = await (
    r.sales_order_id
      ? podmienka.eq("sales_order_id", r.sales_order_id)
      : podmienka.is("sales_order_id", null)
  ).select("id");
  if (!zapisane?.length) {
    const { data: teraz } = await a
      .from("transeu_objednavky")
      .select("sales_order_id")
      .eq("id", r.id)
      .maybeSingle();
    if (teraz?.sales_order_id && teraz.sales_order_id !== so.id) {
      await sb
        .from("sales_orders")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", so.id)
        .eq("company_id", companyId);
      return { sales_order_id: teraz.sales_order_id, nova: false };
    }
  }
  return { sales_order_id: so.id, nova: true };
}

/**
 * Faktúra jedným klikom: založí (alebo použije) prijatú objednávku a vystaví
 * z nej faktúru so zvyškom, ktorý ešte nie je vyfakturovaný. Rovnaká cesta
 * ako pri e-shope (`vytvorFakturu`), takže číslovanie, kurz aj režim DPH sa
 * správajú všade rovnako. Tá istá objednávka druhú faktúru nedostane
 * (`external_id = transeu:<id>`).
 */
export function vystavFakturu(
  sb: Klient,
  companyId: string,
  userId: string,
  id: string,
): Promise<{ invoice_id: string; invoice_number: string; nova: boolean }> {
  return poJednom(companyId, id, () => vystavFakturuTeraz(sb, companyId, userId, id));
}

async function vystavFakturuTeraz(
  sb: Klient,
  companyId: string,
  userId: string,
  id: string,
): Promise<{ invoice_id: string; invoice_number: string; nova: boolean }> {
  const { sales_order_id } = await zalozObjednavkuTeraz(sb, companyId, userId, id);
  const r = await riadok(sb, companyId, id);
  const { data: so } = await sb
    .from("sales_orders")
    .select("*, sales_order_items(*)")
    .eq("id", sales_order_id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!so) throw new Error("Prijatá objednávka sa nenašla.");
  const { polozkyNaFakturu, novoVybavene, stavPodlaVybavenia } =
    await import("./objednavky-odberatel");
  const polozkyObj = [...(so.sales_order_items ?? [])].sort(
    (x: any, y: any) => (x.position ?? 0) - (y.position ?? 0),
  );
  const naFakturu = polozkyNaFakturu(polozkyObj);
  const externe = `transeu:${r.transeu_id}`;
  if (!naFakturu.length) {
    // Objednávka je vyfakturovaná — vráť faktúru, ktorá z nej vznikla.
    const { data: f } = await sb
      .from("invoices")
      .select("id, invoice_number")
      .eq("company_id", companyId)
      .eq("external_id", externe)
      .is("deleted_at", null)
      .maybeSingle();
    if (f) return { invoice_id: f.id, invoice_number: f.invoice_number, nova: false };
    throw new Error("Objednávka je už celá vyfakturovaná.");
  }
  const { dnesBratislava, posunDni } = await import("./datum-vystavenia");
  const dnes = dnesBratislava();
  const { vytvorFakturu } = await import("./vytvor-fakturu.server");
  const v = await vytvorFakturu(sb, companyId, {
    customer_id: so.customer_id,
    external_id: externe,
    issue_date: dnes,
    // Dodaním prepravy je jej skončenie (vykládka); budúci termín neplatí.
    delivery_date: [den(r.vykladka_do), dnes].filter(Boolean).sort()[0] ?? dnes,
    due_date: posunDni(dnes, r.splatnost_dni ?? 14),
    order_number: r.cislo ?? so.customer_order_number ?? null,
    currency: so.currency,
    payment_method: "bank_transfer",
    eu_plnenie: "sluzba",
    items: naFakturu.map((p: any) => ({
      name: p.name,
      description: p.description ?? null,
      quantity: Number(p.quantity),
      unit: p.unit ?? "ks",
      unit_price: Number(p.unit_price),
      vat_rate: Number(p.vat_rate),
    })),
    doplnky: { sales_order_id },
  });
  if (!v.ok) throw new Error(v.sprava);
  if (v.nova) {
    // Vybavenie sa posúva až po tom, čo faktúra naozaj vznikla.
    const nove = polozkyObj.map((p: any) => {
      const f = naFakturu.find((x: any) => x.id === p.id);
      return f ? { ...p, invoiced_quantity: novoVybavene(p, f.quantity) } : p;
    });
    for (const p of nove)
      await sb
        .from("sales_order_items")
        .update({ invoiced_quantity: p.invoiced_quantity })
        .eq("id", p.id)
        .eq("sales_order_id", sales_order_id);
    await sb
      .from("sales_orders")
      .update({ status: stavPodlaVybavenia(nove, so.status) })
      .eq("id", sales_order_id)
      .eq("company_id", companyId);
  }
  const a = await admin();
  await a
    .from("transeu_objednavky")
    .update({ invoice_id: v.faktura.id, chyba: null, updated_at: new Date().toISOString() })
    .eq("id", r.id);
  return { invoice_id: v.faktura.id, invoice_number: v.faktura.invoice_number, nova: v.nova };
}

/** Pošle PDF vystavenej faktúry k objednávke v Trans.eu (najprv súbor, potom údaje). */
export async function odosliFakturu(
  sb: Klient,
  companyId: string,
  id: string,
): Promise<{ media_id: string }> {
  const r = await riadok(sb, companyId, id);
  /*
    Faktúra vystavená cez formulár („upraviť pred vystavením“) visí len na
    prijatej objednávke — vezmeme poslednú nezmazanú.
  */
  let invoiceId: string | null = r.invoice_id;
  if (!invoiceId && r.sales_order_id) {
    const { data: zObj } = await sb
      .from("invoices")
      .select("id")
      .eq("company_id", companyId)
      .eq("sales_order_id", r.sales_order_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    invoiceId = zObj?.id ?? null;
  }
  if (!invoiceId) throw new Error("K objednávke ešte nie je vystavená faktúra.");
  const { data: f } = await sb
    .from("invoices")
    .select(
      "id, invoice_number, issue_date, delivery_date, due_date, currency, subtotal, total, reverse_charge, status, deleted_at",
    )
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!f || f.deleted_at) throw new Error("Faktúra sa nenašla.");
  if (f.status === "draft") throw new Error("Koncept faktúry sa do Trans.eu neposiela.");
  const { data: polozky } = await sb
    .from("invoice_items")
    .select("vat_rate")
    .eq("invoice_id", f.id);
  const { ensureInvoicePdf } = await import("./invoice-pdf.server");
  const { path, fileName } = await ensureInvoicePdf(f.id);
  const a = await admin();
  const { data: blob, error } = await a.storage.from("invoice-pdfs").download(path);
  if (error || !blob) throw new Error("PDF faktúry sa nepodarilo pripraviť.");
  const form = new FormData();
  form.append("file", new Blob([await blob.arrayBuffer()], { type: "application/pdf" }), fileName);
  const subor = await transeuApi<any>(companyId, "/ext/media-storage-api/v1/assets", {
    method: "PUT",
    body: form,
  });
  const mediaId = String(subor?.id ?? "");
  if (!mediaId) throw new Error("Trans.eu nevrátil identifikátor nahratého súboru.");
  await transeuApi(
    companyId,
    `/ext/orders-api/v1/orders/${encodeURIComponent(r.transeu_id)}/invoice`,
    {
      method: "POST",
      json: teloFaktury(
        f,
        (polozky ?? []).map((p: any) => p.vat_rate),
        mediaId,
        fileName,
      ),
    },
  );
  await a
    .from("transeu_objednavky")
    .update({
      invoice_id: f.id,
      faktura_odoslana_at: new Date().toISOString(),
      faktura_media_id: mediaId,
      ma_fakturu_v_transeu: true,
      chyba: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", r.id);
  return { media_id: mediaId };
}

/* ------------------------------- Hook ------------------------------- */

/**
 * Pravidelné stiahnutie objednávok pre firmy so zapnutým `auto_sync`. Doklady
 * nevznikajú samy — o prijatej objednávke a faktúre rozhoduje dopravca.
 * Stav starších objednávok sa obnovuje 60 dní dozadu (napr. „doručenie potvrdené“).
 */
export async function spustiSyncTranseu(): Promise<{
  firmy: number;
  objednavky: number;
  chyby: number;
}> {
  const a = await admin();
  const { data: napojenia } = await a
    .from("transeu_napojenia")
    .select("company_id, auto_od")
    .eq("auto_sync", true)
    .eq("stav", "pripojene");
  let objednavky = 0;
  let chyby = 0;
  for (const n of napojenia ?? []) {
    try {
      const pred60 = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const od = n.auto_od && n.auto_od > pred60 ? n.auto_od : pred60;
      const v = await stiahniObjednavky(n.company_id, new Date(od).toISOString());
      objednavky += v.stiahnute;
    } catch (e: any) {
      chyby++;
      console.warn("[transeu-sync]", n.company_id, e?.message ?? e);
    }
  }
  return { firmy: napojenia?.length ?? 0, objednavky, chyby };
}
