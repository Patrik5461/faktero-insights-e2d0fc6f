import { execFile } from "child_process";
import { createSign, generateKeyPairSync } from "crypto";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import {
  jeZivy,
  oknoPohybov,
  pohybyZRevolutu,
  ucetZRevolutu,
  type RevolutTransakcia,
  type RevolutUcet,
} from "./revolut";

/**
 * Komunikácia s Revolut Business.
 *
 * Tretí rôzny spôsob prihlasovania v jednej aplikácii, a ani jeden sa nedá
 * nahradiť tým druhým:
 *
 * - Wise: osobný token,
 * - Wallester: podpísaný JWT ku každej požiadavke,
 * - **Revolut: OAuth s certifikátom.** Firma nahrá v Revolute verejný
 *   certifikát, dostane `client_id`, potvrdí prístup v prehliadači a my
 *   vymeníme kód za tokeny. Vzájomné certifikáty (mTLS) tu nie sú — súkromný
 *   kľúč podpisuje len tvrdenie pri výmene tokenu, samotné volania idú
 *   s bežným prístupovým tokenom.
 *
 * Dve veci, na ktoré treba myslieť pri prevádzke: **prístupový token platí asi
 * 40 minút** (obnovuje sa sám z obnovovacieho) a **súhlas vyprší asi po 90
 * dňoch** — vtedy musí človek potvrdenie zopakovať.
 *
 * Server-only.
 */

const spusti = promisify(execFile);

export type Prostredie = "sandbox" | "produkcia";

export function adresy(prostredie: Prostredie) {
  return prostredie === "sandbox"
    ? {
        api: "https://sandbox-b2b.revolut.com/api/1.0",
        potvrdenie: "https://sandbox-business.revolut.com",
      }
    : { api: "https://b2b.revolut.com/api/1.0", potvrdenie: "https://business.revolut.com" };
}

export type RevolutSpojenie = {
  clientId: string;
  privateKeyPem: string;
  /** Musí sedieť s adresou zaregistrovanou v Revolute; z nej sa berie `iss`. */
  redirectUri: string;
  prostredie: Prostredie;
};

const TYP_TVRDENIA = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

function base64url(b: Buffer | string): string {
  return Buffer.from(b)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Vyrobí pár kľúčov a k nemu vlastnoručne podpísaný certifikát.
 *
 * Revolut chce do portálu **certifikát X.509**, nie holý verejný kľúč, a ten
 * sa v Node vyrobiť nedá — preto sa volá `openssl`, ktorý je na serveri.
 * Súkromný kľúč vzniká v Node a do súboru ide len na tú chvíľu, čo `openssl`
 * potrebuje; adresár sa hneď maže.
 */
export async function vyrobCertifikat(): Promise<{ sukromny: string; certifikat: string }> {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

  const priecinok = await mkdtemp(join(tmpdir(), "faktero-revolut-"));
  try {
    const kluc = join(priecinok, "private.pem");
    const cert = join(priecinok, "public.cer");
    await writeFile(kluc, privateKey, { mode: 0o600 });
    await spusti("openssl", [
      "req",
      "-new",
      "-x509",
      "-key",
      kluc,
      "-out",
      cert,
      "-days",
      "1825",
      "-subj",
      "/CN=faktero",
    ]);
    return { sukromny: privateKey, certifikat: await readFile(cert, "utf8") };
  } finally {
    await rm(priecinok, { recursive: true, force: true });
  }
}

/** `iss` musí byť hostiteľ návratovej adresy — inak Revolut tvrdenie odmietne. */
export function issZAdresy(redirectUri: string): string {
  try {
    return new URL(redirectUri).host;
  } catch {
    return redirectUri;
  }
}

/** Krátkodobé tvrdenie, ktorým sa podpisuje výmena aj obnova tokenu. */
export function vyrobTvrdenie(s: RevolutSpojenie, platnostSekund = 300): string {
  const teraz = Math.floor(Date.now() / 1000);
  const hlavicka = { alg: "RS256", typ: "JWT" };
  const obsah = {
    iss: issZAdresy(s.redirectUri),
    sub: s.clientId,
    aud: "https://revolut.com",
    iat: teraz,
    exp: teraz + platnostSekund,
  };
  const zaklad = `${base64url(JSON.stringify(hlavicka))}.${base64url(JSON.stringify(obsah))}`;
  const podpis = createSign("RSA-SHA256");
  podpis.update(zaklad);
  podpis.end();
  return `${zaklad}.${base64url(podpis.sign(s.privateKeyPem))}`;
}

/** Adresa, na ktorej človek potvrdí prístup. */
export function adresaPotvrdenia(s: RevolutSpojenie): string {
  const p = new URLSearchParams({
    client_id: s.clientId,
    redirect_uri: s.redirectUri,
    response_type: "code",
  });
  return `${adresy(s.prostredie).potvrdenie}/app-confirm?${p}`;
}

export type Tokeny = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

async function tokenovyDotaz(s: RevolutSpojenie, telo: URLSearchParams): Promise<Tokeny> {
  telo.set("client_id", s.clientId);
  telo.set("client_assertion_type", TYP_TVRDENIA);
  telo.set("client_assertion", vyrobTvrdenie(s));

  const r = await fetch(`${adresy(s.prostredie).api}/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: telo.toString(),
  });
  if (!r.ok) {
    const text = (await r.text().catch(() => "")).slice(0, 300);
    if (/invalid_grant/.test(text)) {
      throw new Error(
        "Revolut kód alebo súhlas neprijal. Kód platí len pár minút — spustite potvrdenie znova.",
      );
    }
    if (/invalid_client|unauthorized/.test(text) || r.status === 401) {
      throw new Error(
        "Revolut odmietol podpis. Skontrolujte client ID a či je v portáli nahratý ten certifikát, ktorý ukazuje Faktero.",
      );
    }
    throw new Error(`Revolut odpovedal ${r.status}. ${text}`);
  }
  return (await r.json()) as Tokeny;
}

/** Výmena kódu z potvrdenia za tokeny. */
export function vymenKod(s: RevolutSpojenie, kod: string): Promise<Tokeny> {
  return tokenovyDotaz(s, new URLSearchParams({ grant_type: "authorization_code", code: kod }));
}

/** Obnova prístupového tokenu. Obnovovací token v odpovedi zvyčajne nie je. */
export function obnovToken(s: RevolutSpojenie, refreshToken: string): Promise<Tokeny> {
  return tokenovyDotaz(
    s,
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  );
}

async function volaj<T>(s: RevolutSpojenie, accessToken: string, cesta: string): Promise<T> {
  const r = await fetch(`${adresy(s.prostredie).api}${cesta}`, {
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
  });
  if (!r.ok) {
    const text = (await r.text().catch(() => "")).slice(0, 300);
    if (r.status === 401) throw new Error("Prístup do Revolutu vypršal. Potvrďte ho znova.");
    throw new Error(`Revolut odpovedal ${r.status}. ${text}`);
  }
  return (await r.json()) as T;
}

export async function nacitajUcty(s: RevolutSpojenie, accessToken: string) {
  const ucty = await volaj<RevolutUcet[]>(s, accessToken, "/accounts");
  return (ucty ?? []).filter(jeZivy).map(ucetZRevolutu);
}

/**
 * Pohyby jedného účtu za posledný rok.
 *
 * Revolut vracia transakcie firmy, nie účtu — na účet sa filtruje až u nás
 * podľa nôh. Stránkuje sa cez `from`, lebo `count` má strop.
 */
export async function nacitajPohyby(
  s: RevolutSpojenie,
  accessToken: string,
  accountId: string,
  teraz: Date = new Date(),
) {
  const { od, do: doKedy } = oknoPohybov(teraz);
  const p = new URLSearchParams({ from: od, to: doKedy, count: "1000", account: accountId });
  const transakcie = await volaj<RevolutTransakcia[]>(s, accessToken, `/transactions?${p}`);
  return pohybyZRevolutu(transakcie, accountId);
}
