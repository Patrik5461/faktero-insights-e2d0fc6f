/**
 * Jeden pokus o doručenie webhooku — bez databázy, aby sa dal skúšať samostatne.
 *
 * Adresa sa overuje pri **každom** pokuse: medzi prvým pokusom a opakovaním o
 * deň neskôr sa môže DNS záznam prepnúť na vnútornú adresu.
 */
import { createHmac } from "crypto";
import { overAdresuWebhooku } from "./webhook-adresa.server";

export function podpisWebhooku(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Podpis s časovou pečiatkou (ochrana proti prehratiu): HMAC z `"<t>.<telo>"`,
 * hlavička `X-Faktero-Signature-V2: t=<unix s>,v1=<hex>`. Prijímateľ odmietne
 * starú pečiatku (odporúčame 5 min). Pôvodná `X-Faktero-Signature` ostáva kvôli
 * existujúcim odberateľom.
 */
export function podpisWebhookuV2(secret: string, body: string, casSekundy: number) {
  const v1 = createHmac("sha256", secret).update(`${casSekundy}.${body}`).digest("hex");
  return `t=${casSekundy},v1=${v1}`;
}

export type PokusWebhooku = {
  url: string;
  secret: string | null;
  event: string;
  body: string;
  /** Id záznamu doručenia — rovnaké pri každom opakovaní tej istej udalosti. */
  dorucenieId: string;
  pokus: number;
};

export type VysledokPokusu = {
  ok: boolean;
  status: number | null;
  body: string | null;
  chyba: string | null;
  trvanieMs: number;
};

/** Pošle jeden POST; nikdy nevyhodí — chyba ide do výsledku. */
export async function posliPokusWebhooku(
  p: PokusWebhooku,
  fetchFn: typeof fetch = fetch,
  teraz: () => number = Date.now,
): Promise<VysledokPokusu> {
  const casSekundy = Math.floor(teraz() / 1000);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-faktero-event": p.event,
    "user-agent": "Faktero-Webhooks/1.0",
    // Prijímateľ podľa neho spozná opakovanie tej istej udalosti a nespracuje ju dvakrát.
    "idempotency-key": p.dorucenieId,
    "x-faktero-delivery-id": p.dorucenieId,
    "x-faktero-attempt": String(p.pokus),
    // Čas odoslania tohto pokusu (nie udalosti) — v podpise V2.
    "x-faktero-timestamp": String(casSekundy),
  };
  if (p.secret) {
    headers["x-faktero-signature"] = podpisWebhooku(p.secret, p.body);
    headers["x-faktero-signature-v2"] = podpisWebhookuV2(p.secret, p.body, casSekundy);
  }
  const ctrl = new AbortController();
  const casovac = setTimeout(() => ctrl.abort(), 10_000);
  const t0 = Date.now();
  try {
    await overAdresuWebhooku(p.url);
    const res = await fetchFn(p.url, {
      method: "POST",
      headers,
      body: p.body,
      signal: ctrl.signal,
      // Presmerovanie by obišlo kontrolu adresy.
      redirect: "manual",
    });
    const text = await res.text().catch(() => "");
    const ok = res.status >= 200 && res.status < 300;
    return {
      ok,
      status: res.status,
      body: text.slice(0, 2000),
      chyba: ok ? null : `HTTP ${res.status}`,
      trvanieMs: Date.now() - t0,
    };
  } catch (e: any) {
    const chyba =
      e?.name === "AbortError" ? "Prijímateľ neodpovedal do 10 s." : String(e?.message ?? e);
    return {
      ok: false,
      status: null,
      body: null,
      chyba: chyba.slice(0, 500),
      trvanieMs: Date.now() - t0,
    };
  } finally {
    clearTimeout(casovac);
  }
}
