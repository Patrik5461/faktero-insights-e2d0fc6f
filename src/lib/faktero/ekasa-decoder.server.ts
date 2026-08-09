/**
 * Dekóder slovenských eKasa QR kódov (Finančná správa SR).
 *
 * Formát QR:
 *   - QR môže obsahovať priamo base64 payload alebo URL s payloadom
 *     v ceste či vo fragmente.
 *   - Payload je LZMA1 (raw) komprimovaný XML dokument `<Receipt>...</Receipt>`
 *     alebo `<PosCheck>...</PosCheck>`.
 *
 * Čítanie polí (dátum, sumy, položky) je v `./ekasa` — tam je aj sada testov.
 * Tu ostáva len to, čo potrebuje LZMA a sieť.
 */
import {
  isEkasaQr,
  kandidatiPayloadu,
  parseEkasaXml,
  type EkasaDecoded,
  type EkasaItem,
} from "./ekasa";

export { isEkasaQr, parseEkasaXml };
export type { EkasaDecoded, EkasaItem };

export type EkasaResult =
  | { ok: true; source: "lzma" | "online"; overeny: boolean; data: EkasaDecoded }
  | { ok: false; error: string; raw?: string };

/** Base64 (aj URL-safe) → Uint8Array */
function base64ToBytes(b64: string): Uint8Array {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 === 0 ? norm : norm + "=".repeat(4 - (norm.length % 4));
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** LZMA1 raw dekompresia cez lzma-js-simple-v2 (pure JS, worker-safe). */
async function lzmaDecompress(bytes: Uint8Array): Promise<string> {
  const mod: any = await import("lzma-js-simple-v2");
  const LZMA = mod.default ?? mod.LZMA ?? mod;
  return new Promise((resolve, reject) => {
    try {
      LZMA.decompress(Array.from(bytes), (result: any, err: any) => {
        if (err) return reject(err);
        if (typeof result === "string") return resolve(result);
        if (Array.isArray(result)) {
          const u = new Uint8Array(result);
          resolve(new TextDecoder("utf-8").decode(u));
        } else resolve(String(result));
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * LZMA dekódovanie eKasa QR → dekódovaný doklad.
 *
 * Kandidátov na payload je viac (URL-safe verzus base64 s lomkami), tak sa
 * skúšajú po jednom — na nezmysle LZMA zlyhá okamžite.
 */
export async function decodeEkasaQr(qrContent: string): Promise<EkasaDecoded | null> {
  for (const payload of kandidatiPayloadu(qrContent)) {
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(payload);
    } catch {
      continue;
    }
    try {
      const xml = await lzmaDecompress(bytes);
      if (!xml) continue;
      if (!xml.includes("<") && !xml.includes("Receipt") && !xml.includes("PosCheck")) continue;
      return parseEkasaXml(xml);
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Pokus o overenie dokladu na Finančnej správe.
 *
 * FS nemá verejné API, doklad sa dá pozrieť len v ich webovej aplikácii, kde
 * identifikátory sedia **vo fragmente adresy** (`…/#/opd/<kód>/<číslo>`).
 * Fragment sa na server nikdy neposiela, takže odpoveď je vždy tá istá prázdna
 * schránka aplikácie. Pôvodná verzia v nej hľadala slová „evidovaný"
 * a „platný" — tie sa v schránke pokojne vyskytnúť môžu, a doklad by sa tak
 * označil za overený bez toho, aby ho ktokoľvek overil.
 *
 * Preto sa za overenie považuje len odpoveď, ktorá naozaj obsahuje číslo
 * hľadaného dokladu. Dovtedy je to poctivé „neoverené".
 */
export async function verifyEkasaOnline(
  cisloDokladu: string,
  kodPokladnice: string,
): Promise<{ overeny: boolean; data: Record<string, unknown> }> {
  try {
    const url = `https://opd.financnasprava.sk/#/opd/${encodeURIComponent(kodPokladnice)}/${encodeURIComponent(cisloDokladu)}`;
    const res = await fetch(url, { headers: { Accept: "text/html" } });
    const html = await res.text();
    const najdenyDoklad = html.includes(cisloDokladu) && html.includes(kodPokladnice);
    const overeny = najdenyDoklad && (/evidovan[ýá]/i.test(html) || /platn[ýá]/i.test(html));
    return { overeny, data: { status: res.status, doklad_v_odpovedi: najdenyDoklad } };
  } catch {
    return { overeny: false, data: {} };
  }
}

/** Hlavná funkcia — dekóduj + (voliteľne) over online. */
export async function processEkasaQr(qrContent: string): Promise<EkasaResult> {
  const decoded = await decodeEkasaQr(qrContent);
  if (decoded && (decoded.cisloDokladu || decoded.suma || decoded.ico)) {
    let overeny = false;
    if (decoded.cisloDokladu && decoded.kodPokladnice) {
      try {
        const v = await verifyEkasaOnline(decoded.cisloDokladu, decoded.kodPokladnice);
        overeny = v.overeny;
      } catch {
        /* overenie je nepovinné, doklad sa uloží aj bez neho */
      }
    }
    return { ok: true, source: "lzma", overeny, data: decoded };
  }

  // Keď sa payload dekódovať nedá, z URL sa dajú aspoň prečítať identifikátory
  // dokladu. Doklad sa uloží ako neoverený — overiť ho zvonku nevieme.
  const urlMatch = qrContent.match(/opd\/([A-Za-z0-9-]+)\/([A-Za-z0-9-]+)/i);
  if (urlMatch) {
    const [, kod, cislo] = urlMatch;
    const v = await verifyEkasaOnline(cislo, kod);
    return {
      ok: true,
      source: "online",
      overeny: v.overeny,
      data: { cisloDokladu: cislo, kodPokladnice: kod, polozky: [] },
    };
  }

  return { ok: false, error: "Nepodarilo sa dekódovať QR kód", raw: qrContent };
}
