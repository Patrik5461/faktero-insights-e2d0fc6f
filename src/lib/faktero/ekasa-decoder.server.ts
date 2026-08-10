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
  identifikatoryZQr,
  isEkasaQr,
  kandidatiPayloadu,
  mapujFsDoklad,
  parseEkasaXml,
  type EkasaDecoded,
  type EkasaHladanie,
  type EkasaItem,
} from "./ekasa";

export { isEkasaQr, parseEkasaXml, identifikatoryZQr };
export type { EkasaDecoded, EkasaItem, EkasaHladanie };

export type EkasaResult =
  | { ok: true; source: "ekasa" | "lzma" | "qr"; overeny: boolean; data: EkasaDecoded }
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
 * Vyhľadanie dokladu vo Finančnej správe.
 *
 * Je to to isté rozhranie, na ktorom stojí ich vlastná aplikácia „Overenie
 * pokladničného dokladu" (opd.financnasprava.sk) — teda ten istý zdroj, z
 * ktorého čerpajú aj ostatné slovenské aplikácie na skenovanie bločkov.
 * Vracia celý doklad vrátane položiek, takže sa nič nemusí hádať z fotky.
 *
 * Predošlá verzia sťahovala HTML tej aplikácie a hľadala v ňom slová. Bola to
 * márna práca: identifikátory sedia vo fragmente adresy, ktorý sa na server
 * neposiela, takže odpoveď bola vždy tá istá prázdna schránka.
 */
const FS_API = "https://ekasa.financnasprava.sk/mdu/api/v1/opd/receipt/find";

export async function najdiDokladVEkase(
  hladanie: EkasaHladanie,
): Promise<{ ok: true; data: EkasaDecoded } | { ok: false; dovod: string }> {
  // Rozhranie je za ochranou, ktorá odmieta požiadavky bez hlavičiek
  // prehliadača — bez nich vráti stránku „Request Rejected", nie JSON.
  const telo =
    "receiptId" in hladanie
      ? { receiptId: hladanie.receiptId }
      : {
          okp: hladanie.okp,
          cashRegisterCode: hladanie.cashRegisterCode,
          issueDateFormatted: hladanie.issueDate,
          receiptNumber: hladanie.receiptNumber,
          totalAmount: hladanie.totalAmount,
        };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(FS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=utf-8",
        Accept: "application/json, text/plain, */*",
        Origin: "https://opd.financnasprava.sk",
        Referer: "https://opd.financnasprava.sk/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      },
      body: JSON.stringify(telo),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, dovod: `Finančná správa odpovedala ${res.status}` };

    const json: any = await res.json().catch(() => null);
    if (!json) return { ok: false, dovod: "Finančná správa vrátila neplatnú odpoveď" };
    if (!json.receipt) {
      // `notification` hovorí, prečo doklad nie je — napríklad že ešte nebol
      // zaevidovaný alebo že je mimo rozsahu.
      return {
        ok: false,
        dovod: json.notification
          ? `Doklad sa vo Finančnej správe nenašiel (${json.notification})`
          : "Doklad sa vo Finančnej správe nenašiel",
      };
    }
    return { ok: true, data: mapujFsDoklad(json.receipt) };
  } catch (e: any) {
    return {
      ok: false,
      dovod: e?.name === "AbortError" ? "Finančná správa neodpovedala včas" : "Spojenie zlyhalo",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Hlavná funkcia — z QR kódu spraviť doklad.
 *
 * Poradie je zámerné: najprv Finančná správa, lebo tá vydá doklad taký, aký je
 * naozaj zaevidovaný — aj s položkami a názvom predajcu, ktoré v QR nikdy nie
 * sú. Až keď sa doklad nenájde, skúsi sa dekódovať obsah samotného QR.
 */
export async function processEkasaQr(qrContent: string): Promise<EkasaResult> {
  const hladanie = identifikatoryZQr(qrContent);
  if (hladanie) {
    const r = await najdiDokladVEkase(hladanie);
    if (r.ok) return { ok: true, source: "ekasa", overeny: true, data: r.data };
    // Doklad sa nenašiel — nižšie ešte skúsime prečítať samotný QR.
  }

  const decoded = await decodeEkasaQr(qrContent);
  if (decoded && (decoded.cisloDokladu || decoded.suma || decoded.ico)) {
    return { ok: true, source: "lzma", overeny: false, data: decoded };
  }

  // Aspoň identifikátory, nech sa doklad dá dohľadať ručne.
  if (hladanie) {
    return {
      ok: true,
      source: "qr",
      overeny: false,
      data:
        "receiptId" in hladanie
          ? { uid: hladanie.receiptId, polozky: [] }
          : {
              ocpId: hladanie.okp,
              kodPokladnice: hladanie.cashRegisterCode,
              datum: hladanie.issueDate,
              cisloDokladu: hladanie.receiptNumber,
              suma: hladanie.totalAmount,
              polozky: [],
            },
    };
  }

  return { ok: false, error: "Nepodarilo sa prečítať QR kód", raw: qrContent };
}
