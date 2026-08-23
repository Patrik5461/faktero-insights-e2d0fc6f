import { createHash, createSign, generateKeyPairSync } from "crypto";
import {
  oknoPohybov,
  pohybyZWallesteru,
  ucetZWallesteru,
  type WallesterPohyb,
  type WallesterUcet,
} from "./wallester";

/**
 * Komunikácia s Wallesterom.
 *
 * Prihlasovanie je iné než všade inde: **každá jedna požiadavka nesie vlastný
 * podpísaný JWT**. Nie je to token, ktorý sa vydá a chvíľu platí — vyrába sa
 * znova pri každom volaní a obsahuje aj odtlačok tela požiadavky (`rbh`),
 * takže ho nemá zmysel odchytiť a použiť inde.
 *
 * Údaje, ktoré k tomu treba, dáva Wallester po výmene kľúčov: *issuer ID* (kto
 * volá), *audience ID* (koho volá) a maximálnu platnosť tokenu. Pár kľúčov
 * vyrábame my a súkromný držíme zašifrovaný — verejný pošle človek im.
 *
 * Server-only.
 */

const ZAKLAD = process.env.WALLESTER_API_URL || "https://api.wallester.com";

export type WallesterSpojenie = {
  issuerId: string;
  audienceId: string;
  privateKeyPem: string;
  /** Kód produktu, ktorý Wallester vyžaduje v hlavičke každej požiadavky. */
  productCode: string;
  /** Najviac koľko sekúnd smie token platiť. Wallester dlhší odmietne. */
  maxPlatnostSekund: number;
};

export function vyrobKluce(): { verejny: string; sukromny: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { verejny: publicKey, sukromny: privateKey };
}

function base64url(b: Buffer | string): string {
  return Buffer.from(b)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Odtlačok tela požiadavky.
 *
 * Musí to byť base64 z **binárneho** SHA-256, nie z jeho zápisu v šestnástkovej
 * sústave — na tomto sa integrácie s Wallesterom najčastejšie lámu. Pri GET je
 * telo prázdne a odtlačok sa počíta z prázdneho reťazca.
 */
export function odtlacokTela(telo: string): string {
  return createHash("sha256").update(telo, "utf8").digest("base64");
}

/** JWT pre jednu požiadavku. Podpisuje sa RS256. */
export function vyrobToken(s: WallesterSpojenie, telo = ""): string {
  const hlavicka = { alg: "RS256", typ: "JWT" };
  const teraz = Math.floor(Date.now() / 1000);
  const obsah = {
    iss: s.issuerId,
    aud: s.audienceId,
    sub: "api-request",
    // O sekundu menej než dovolené maximum: kým požiadavka doletí, čas beží.
    exp: teraz + Math.max(30, s.maxPlatnostSekund - 1),
    rbh: odtlacokTela(telo),
  };
  const zaklad = `${base64url(JSON.stringify(hlavicka))}.${base64url(JSON.stringify(obsah))}`;
  const podpis = createSign("RSA-SHA256");
  podpis.update(zaklad);
  podpis.end();
  return `${zaklad}.${base64url(podpis.sign(s.privateKeyPem))}`;
}

class WallesterChyba extends Error {
  constructor(
    public stav: number,
    sprava: string,
  ) {
    super(sprava);
    this.name = "WallesterChyba";
  }
}

async function volaj<T>(s: WallesterSpojenie, cesta: string): Promise<T> {
  const r = await fetch(`${ZAKLAD}${cesta}`, {
    headers: {
      authorization: `Bearer ${vyrobToken(s)}`,
      "content-type": "application/json",
      // Wallester ich vyžaduje pri každom volaní; bez nich odpovie 400.
      "X-Product-Code": s.productCode,
      "X-Audit-Source-Type": "Api",
      "X-Audit-User-Id": s.issuerId,
    },
  });

  if (!r.ok) {
    const telo = (await r.text().catch(() => "")).slice(0, 300);
    if (r.status === 401 || r.status === 403) {
      throw new WallesterChyba(
        r.status,
        "Wallester odmietol podpis. Skontrolujte issuer ID, audience ID a to, či majú nahratý ten verejný kľúč, ktorý ukazuje Faktero.",
      );
    }
    if (r.status === 400 && /product/i.test(telo)) {
      throw new WallesterChyba(400, "Wallester nepozná zadaný kód produktu.");
    }
    throw new WallesterChyba(r.status, `Wallester odpovedal ${r.status}. ${telo}`);
  }
  return (await r.json()) as T;
}

/** Overenie údajov ešte pred uložením — zoznam účtov je najlacnejšie volanie. */
export async function overSpojenie(s: WallesterSpojenie): Promise<number> {
  const odpoved = await volaj<{ accounts?: WallesterUcet[] }>(
    s,
    "/v1/accounts?from_record=0&records_count=1",
  );
  return (odpoved.accounts ?? []).length;
}

export async function nacitajUcty(s: WallesterSpojenie) {
  const odpoved = await volaj<{ accounts?: WallesterUcet[] }>(
    s,
    "/v1/accounts?from_record=0&records_count=200",
  );
  return (odpoved.accounts ?? []).map(ucetZWallesteru);
}

/**
 * Pohyby jedného účtu za posledný rok.
 *
 * Wallester stránkuje povinne, takže sa berie po dávkach, kým odpovede
 * neprestanú prichádzať. Strop je tam preto, aby chyba na ich strane
 * nezacyklila sťahovanie donekonečna.
 */
export async function nacitajPohyby(
  s: WallesterSpojenie,
  accountId: string,
  teraz: Date = new Date(),
) {
  const { od, do: doKedy } = oknoPohybov(teraz);
  const DAVKA = 200;
  const STROP = 50;
  const vsetky: WallesterPohyb[] = [];

  for (let strana = 0; strana < STROP; strana++) {
    const parametre = new URLSearchParams({
      from_date: od,
      to_date: doKedy,
      from_record: String(strana * DAVKA),
      records_count: String(DAVKA),
    });
    const odpoved = await volaj<{ transactions?: WallesterPohyb[]; total_records_number?: number }>(
      s,
      `/v1/accounts/${accountId}/transactions?${parametre}`,
    );
    const davka = odpoved.transactions ?? [];
    vsetky.push(...davka);
    if (davka.length < DAVKA) break;
  }

  return pohybyZWallesteru(vsetky);
}
