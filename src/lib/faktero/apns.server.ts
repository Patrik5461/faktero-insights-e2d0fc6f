/**
 * Odosielanie push notifikácií priamo do APNs.
 *
 * Potrebuje štyri premenné:
 *   APNS_KEY_ID       – id kľúča z Apple Developer → Keys
 *   APNS_TEAM_ID      – id tímu (vpravo hore v portáli)
 *   APNS_PRIVATE_KEY  – obsah .p8 súboru aj s riadkami BEGIN/END
 *   APNS_BUNDLE_ID    – sk.faktero.app
 * Voliteľne APNS_ENV=sandbox pre buildy z Xcode (ostré buildy idú na produkciu).
 *
 * APNs hovorí výhradne HTTP/2, takže sa nedá použiť `fetch` — ten v Node vie len
 * HTTP/1.1. Preto `node:http2`.
 */
import { connect } from "node:http2";
import { createSign } from "node:crypto";
import { apnsPayload, tokenJeMrtvy, type PushSprava } from "./apns";

const PLATNOST_TOKENU_MS = 45 * 60 * 1000; // Apple berie najviac hodinu

let cachovanyToken: { hodnota: string; do: number } | null = null;

export function jeApnsNastavene(): boolean {
  return Boolean(
    process.env.APNS_KEY_ID &&
      process.env.APNS_TEAM_ID &&
      process.env.APNS_PRIVATE_KEY &&
      process.env.APNS_BUNDLE_ID,
  );
}

function base64url(vstup: Buffer | string): string {
  return Buffer.from(vstup)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Autorizačný token pre APNs (JWT podpísaný ES256). Podpis musí byť v tvare
 * r||s, nie DER — preto `dsaEncoding`.
 */
export function vyrobJwt(args: {
  keyId: string;
  teamId: string;
  privateKey: string;
  teraz?: number;
}): string {
  const iat = Math.floor((args.teraz ?? Date.now()) / 1000);
  const hlavicka = base64url(JSON.stringify({ alg: "ES256", kid: args.keyId }));
  const telo = base64url(JSON.stringify({ iss: args.teamId, iat }));
  const podpisovane = `${hlavicka}.${telo}`;

  const sign = createSign("SHA256");
  sign.update(podpisovane);
  sign.end();
  const podpis = sign.sign({
    key: args.privateKey.replace(/\\n/g, "\n"),
    dsaEncoding: "ieee-p1363",
  });
  return `${podpisovane}.${base64url(podpis)}`;
}

function autorizacnyToken(): string {
  if (cachovanyToken && cachovanyToken.do > Date.now()) return cachovanyToken.hodnota;
  const hodnota = vyrobJwt({
    keyId: process.env.APNS_KEY_ID!,
    teamId: process.env.APNS_TEAM_ID!,
    privateKey: process.env.APNS_PRIVATE_KEY!,
  });
  cachovanyToken = { hodnota, do: Date.now() + PLATNOST_TOKENU_MS };
  return hodnota;
}

function adresa(): string {
  return process.env.APNS_ENV === "sandbox"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
}

export type VysledokPush = { ok: boolean; status?: number; error?: string; mrtvyToken?: boolean };

export async function posliCezApns(token: string, sprava: PushSprava): Promise<VysledokPush> {
  if (!jeApnsNastavene()) return { ok: false, error: "APNs nie je nastavené" };

  const telo = JSON.stringify(apnsPayload(sprava));
  const klient = connect(adresa());

  return await new Promise<VysledokPush>((resolve) => {
    let hotovo = false;
    const dokonci = (v: VysledokPush) => {
      if (hotovo) return;
      hotovo = true;
      klient.close();
      resolve(v);
    };

    klient.on("error", (e) => dokonci({ ok: false, error: String(e?.message ?? e) }));

    const poziadavka = klient.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${autorizacnyToken()}`,
      "apns-topic": process.env.APNS_BUNDLE_ID!,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(telo),
    });

    let stav = 0;
    let odpoved = "";
    poziadavka.on("response", (h) => {
      stav = Number(h[":status"] ?? 0);
    });
    poziadavka.setEncoding("utf8");
    poziadavka.on("data", (c) => {
      odpoved += c;
    });
    poziadavka.on("error", (e) => dokonci({ ok: false, error: String(e?.message ?? e) }));
    poziadavka.on("end", () => {
      if (stav === 200) return dokonci({ ok: true, status: 200 });
      let dovod: string | null = null;
      try {
        dovod = JSON.parse(odpoved)?.reason ?? null;
      } catch {
        /* APNs pri chybe nemusí vrátiť JSON */
      }
      dokonci({
        ok: false,
        status: stav,
        error: dovod ?? odpoved.slice(0, 200),
        mrtvyToken: tokenJeMrtvy(stav, dovod),
      });
    });

    poziadavka.end(telo);
  });
}
