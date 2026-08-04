/**
 * Dekóder slovenských eKasa QR kódov (Finančná správa SR).
 *
 * Formát QR:
 *   - QR môže obsahovať priamo base64 payload alebo URL s payloadom
 *     v ceste, napr. `https://ekasa.financnasprava.sk/mdu/qr/<base64>`.
 *   - Payload je LZMA1 (raw) komprimovaný XML dokument `<Receipt>...</Receipt>`
 *     alebo `<PosCheck>...</PosCheck>` obsahujúci pokladničný doklad.
 *
 * Poznámka: Finančná správa nemá verejné REST API. Overenie sa robí
 * cez `https://opd.financnasprava.sk` (HTML formulár). Implementujeme
 * best-effort fetch a rozpoznanie "doklad je evidovaný" v HTML odpovedi.
 */

export type EkasaItem = {
  name: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  total: number;
};

export type EkasaDecoded = {
  ico?: string;
  dic?: string;
  ic_dph?: string;
  suma?: number;
  dph?: number;
  mena?: string;
  datum?: string; // YYYY-MM-DD
  cisloDokladu?: string;
  kodPokladnice?: string;
  ocpId?: string; // OKP alebo overovací kód
  polozky: EkasaItem[];
  raw_xml?: string;
};

export type EkasaResult =
  | { ok: true; source: "lzma" | "online"; overeny: boolean; data: EkasaDecoded }
  | { ok: false; error: string; raw?: string };

/** Vytiahne base64 payload z QR obsahu (URL alebo raw string). */
function extractPayload(qr: string): string {
  const trimmed = qr.trim();
  // URL s payloadom v ceste alebo hash (napr. /#/opd/<b64>)
  const urlMatch = trimmed.match(/[?&#/]([A-Za-z0-9+/=_-]{40,})$/);
  if (trimmed.startsWith("http") && urlMatch) return urlMatch[1];
  return trimmed;
}

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

/** Najjednoduchší XML parser - vyťahuje polia bez závislostí. */
function pick(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim();
}

function parseNumber(s?: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function parseEkasaXml(xml: string): EkasaDecoded {
  const items: EkasaItem[] = [];
  const itemRe = /<(?:Item|Polozka)[^>]*>([\s\S]*?)<\/(?:Item|Polozka)>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const chunk = m[1];
    items.push({
      name: pick(chunk, "Name") ?? pick(chunk, "Nazov") ?? "",
      quantity: parseNumber(pick(chunk, "Quantity") ?? pick(chunk, "Mnozstvo")) ?? 1,
      unit_price: parseNumber(pick(chunk, "UnitPrice") ?? pick(chunk, "JednotkovaCena")) ?? 0,
      vat_rate: parseNumber(pick(chunk, "VatRate") ?? pick(chunk, "SadzbaDPH")) ?? 0,
      total: parseNumber(pick(chunk, "Price") ?? pick(chunk, "Suma")) ?? 0,
    });
  }

  const dateRaw = pick(xml, "IssueDate") ?? pick(xml, "Datum") ?? pick(xml, "CreateDate");
  let datum: string | undefined;
  if (dateRaw) {
    const d = new Date(dateRaw);
    if (!isNaN(d.getTime())) datum = d.toISOString().slice(0, 10);
    else {
      const md = dateRaw.match(/(\d{4})[-./](\d{2})[-./](\d{2})/);
      if (md) datum = `${md[1]}-${md[2]}-${md[3]}`;
    }
  }

  return {
    ico: pick(xml, "Ico") ?? pick(xml, "ICO"),
    dic: pick(xml, "Dic") ?? pick(xml, "DIC"),
    ic_dph: pick(xml, "IcDph") ?? pick(xml, "IC_DPH") ?? pick(xml, "VatId"),
    suma: parseNumber(pick(xml, "TotalPrice") ?? pick(xml, "SumaCelkom") ?? pick(xml, "Amount")),
    dph: parseNumber(pick(xml, "TotalVat") ?? pick(xml, "DPH")),
    mena: pick(xml, "Currency") ?? pick(xml, "Mena") ?? "EUR",
    datum,
    cisloDokladu:
      pick(xml, "ReceiptNumber") ?? pick(xml, "CisloDokladu") ?? pick(xml, "InvoiceNumber"),
    kodPokladnice:
      pick(xml, "CashRegisterCode") ?? pick(xml, "KodPokladnice") ?? pick(xml, "OrpCode"),
    ocpId: pick(xml, "Okp") ?? pick(xml, "OkpCode") ?? pick(xml, "VerificationCode"),
    polozky: items,
    raw_xml: xml.length < 20000 ? xml : xml.slice(0, 20000),
  };
}

/** LZMA dekódovanie eKasa QR → dekódovaný doklad. */
export async function decodeEkasaQr(qrContent: string): Promise<EkasaDecoded | null> {
  const payload = extractPayload(qrContent);
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(payload);
  } catch {
    return null;
  }
  try {
    const xml = await lzmaDecompress(bytes);
    if (!xml || (!xml.includes("<") && !xml.includes("Receipt") && !xml.includes("PosCheck")))
      return null;
    return parseEkasaXml(xml);
  } catch {
    return null;
  }
}

/**
 * Overenie na Finančnej správe (HTML endpoint).
 * FS nemá verejné API — best-effort, môže sa v čase meniť.
 */
export async function verifyEkasaOnline(
  cisloDokladu: string,
  kodPokladnice: string,
): Promise<{ overeny: boolean; data: Record<string, unknown> }> {
  try {
    const url = `https://opd.financnasprava.sk/#/opd/${encodeURIComponent(kodPokladnice)}/${encodeURIComponent(cisloDokladu)}`;
    const res = await fetch(url, { headers: { Accept: "text/html" } });
    const html = await res.text();
    const overeny = /evidovan[ýá]/i.test(html) || /platn[ýá]/i.test(html);
    return { overeny, data: { status: res.status } };
  } catch {
    return { overeny: false, data: {} };
  }
}

/** Hlavná funkcia — dekóduj + (voliteľne) over online. */
export async function processEkasaQr(qrContent: string): Promise<EkasaResult> {
  // 1) LZMA dekódovanie
  const decoded = await decodeEkasaQr(qrContent);
  if (decoded && (decoded.cisloDokladu || decoded.suma || decoded.ico)) {
    // 2) Ak máme identifikátory, skúsime online overenie (nepovinné, non-fatal)
    let overeny = false;
    if (decoded.cisloDokladu && decoded.kodPokladnice) {
      try {
        const v = await verifyEkasaOnline(decoded.cisloDokladu, decoded.kodPokladnice);
        overeny = v.overeny;
      } catch {
        /* ignore */
      }
    }
    return { ok: true, source: "lzma", overeny, data: decoded };
  }

  // 3) Ak LZMA zlyhá, ale QR má štruktúru s URL, skús vytiahnuť ID z URL a overiť online
  const urlMatch = qrContent.match(/opd\/([A-Za-z0-9-]+)\/([A-Za-z0-9-]+)/i);
  if (urlMatch) {
    const [, kod, cislo] = urlMatch;
    const v = await verifyEkasaOnline(cislo, kod);
    if (v.overeny) {
      return {
        ok: true,
        source: "online",
        overeny: true,
        data: { cisloDokladu: cislo, kodPokladnice: kod, polozky: [] },
      };
    }
  }

  return { ok: false, error: "Nepodarilo sa dekódovať QR kód", raw: qrContent };
}

/** Rozpozná, či QR patrí eKasa (Finančná správa SR). */
export function isEkasaQr(qr: string): boolean {
  const t = qr.trim();
  if (/financnasprava\.sk/i.test(t)) return true;
  if (/opd\/[A-Za-z0-9]+\/[A-Za-z0-9]+/i.test(t)) return true;
  // Base64-like payload aspoň 80 znakov (typická dĺžka LZMA payloadu)
  if (/^[A-Za-z0-9+/=_-]{80,}$/.test(t)) return true;
  return false;
}
