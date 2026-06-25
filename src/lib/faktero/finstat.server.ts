import { createHash } from "crypto";

export type NormalizedCompany = {
  ico: string;
  name: string;
  dic: string | null;
  ic_dph: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string;
};

const FINSTAT_BASE: Record<"sk" | "cz", string> = {
  sk: "https://www.finstat.sk/api",
  cz: "https://www.finstat.cz/api",
};
const HASH_SALT = "SomeSalt";
export type FinstatRegion = "sk" | "cz";

export function isFinstatConfigured(): boolean {
  return !!process.env.FINSTAT_PUBLIC_KEY && !!process.env.FINSTAT_PRIVATE_KEY;
}

function buildHash(apiKey: string, privateKey: string, param: string): string {
  return createHash("sha256")
    .update(`${HASH_SALT}+${apiKey}+${privateKey}++${param}+ended`)
    .digest("hex");
}

export type FinstatSuggestion = {
  ico: string;
  name: string;
  address: string | null;
  city: string | null;
};

export type FinstatAutocompleteResult =
  | { status: "ok"; data: FinstatSuggestion[] }
  | { status: "error"; message: string };

export async function finstatAutocomplete(query: string, region: FinstatRegion = "sk"): Promise<FinstatAutocompleteResult> {
  const apiKey = process.env.FINSTAT_PUBLIC_KEY;
  const privateKey = process.env.FINSTAT_PRIVATE_KEY;
  if (!apiKey || !privateKey) {
    return { status: "error", message: "FinStat API nie je nakonfigurované." };
  }
  const q = (query ?? "").trim();
  if (q.length < 3) return { status: "ok", data: [] };

  const hash = buildHash(apiKey, privateKey, q);
  const url = `${FINSTAT_BASE[region]}/autocomplete?${new URLSearchParams({ query: q, apiKey, Hash: hash }).toString()}`;
  console.log("[finstat-ac] region =", region, "query length =", q.length);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json, application/xml;q=0.9, */*;q=0.5" },
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(t);
    console.warn("[finstat-ac] network error", e);
    return { status: "error", message: "network" };
  }
  clearTimeout(t);
  console.log("[finstat-ac] status =", res.status);

  const text = await res.text();
  if (res.status === 402 || res.status === 403) {
    return { status: "error", message: "Autorizácia FinStat API zlyhala. Skontrolujte API kľúče alebo spôsob generovania hash." };
  }
  if (!res.ok) return { status: "error", message: `http_${res.status}` };

  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  let parsed: any = null;
  if (ct.includes("json") || text.trim().startsWith("[") || text.trim().startsWith("{")) {
    try { parsed = JSON.parse(text); } catch {}
  }
  if (!parsed && (ct.includes("xml") || text.trim().startsWith("<"))) {
    parsed = parseAutocompleteXml(text);
  }
  if (!parsed) return { status: "error", message: "invalid_response" };

  // Response shape can be an array directly, or { Results: [...] }, or wrapped.
  const rows: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.Results) ? parsed.Results
    : Array.isArray(parsed?.results) ? parsed.results
    : Array.isArray(parsed?.SuggestResult) ? parsed.SuggestResult
    : [];

  const data: FinstatSuggestion[] = rows.map((r) => {
    const idx = buildIndex(r);
    const street = pickFrom(idx, "Street", "StreetName");
    const houseNum = pickFrom(idx, "StreetNumber", "HouseNumber");
    const fullStreet = [street, houseNum].filter(Boolean).join(" ").trim() || pickFrom(idx, "Address");
    return {
      ico: String(pickFrom(idx, "Ico", "ICO", "Id") ?? "").trim(),
      name: String(pickFrom(idx, "Name", "CompanyName", "FullName", "Value") ?? "").trim(),
      address: fullStreet ?? null,
      city: pickFrom(idx, "City", "Municipality", "Town"),
    };
  }).filter((r) => r.ico && r.name).slice(0, 10);

  return { status: "ok", data };
}

function parseAutocompleteXml(xml: string): any[] | null {
  if (!xml || typeof xml !== "string") return null;
  // Pull each <SuggestionItem> / <Suggestion> / <Item> block, then parse flat tags inside.
  const blockRe = /<(SuggestionItem|Suggestion|Item|Result)\b[^>]*>([\s\S]*?)<\/\1>/g;
  const rows: any[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const inner = m[2];
    const obj: Record<string, string> = {};
    const tagRe = /<([A-Za-z_][A-Za-z0-9_]*)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
    let t: RegExpExecArray | null;
    while ((t = tagRe.exec(inner)) !== null) {
      const v = decodeEntities(t[2] ?? "").trim();
      if (v && !(t[1] in obj)) obj[t[1]] = v;
    }
    if (Object.keys(obj).length) rows.push(obj);
  }
  return rows.length ? rows : null;
}

export type FinstatResult =
  | { status: "ok"; data: NormalizedCompany; raw: any }
  | { status: "not_found"; raw: any | null }
  | { status: "error"; message: string; raw: any | null };

export async function finstatLookup(ico: string, region: FinstatRegion = "sk"): Promise<FinstatResult> {
  const apiKey = process.env.FINSTAT_PUBLIC_KEY;
  const privateKey = process.env.FINSTAT_PRIVATE_KEY;
  console.log("[finstat] public key loaded =", apiKey ? "yes" : "no");
  console.log("[finstat] private key loaded =", privateKey ? "yes" : "no");
  console.log("[finstat] public key length =", apiKey?.length ?? 0);
  console.log("[finstat] private key length =", privateKey?.length ?? 0);
  if (!apiKey || !privateKey) {
    return { status: "error", message: "FinStat API nie je nakonfigurované.", raw: null };
  }

  // Official FinStat verification hash (per FinStat API docs / official clients):
  // SHA256("SomeSalt+{apiKey}+{privateKey}++{ico}+ended")
  const hash = createHash("sha256")
    .update(`${HASH_SALT}+${apiKey}+${privateKey}++${ico}+ended`)
    .digest("hex");

  const url = `${FINSTAT_BASE[region]}/detail?${new URLSearchParams({ ico, apiKey, Hash: hash }).toString()}`;
  console.log("[finstat] region =", region, "endpoint =", `${FINSTAT_BASE[region]}/detail`);
  console.log("[finstat] ico =", ico);
  console.log("[finstat] hash length =", hash.length);
  console.log("[finstat] hash method = SHA256('SomeSalt+'+apiKey+'+'+privateKey+'++'+ico+'+ended')");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json, application/xml;q=0.9, */*;q=0.5" },
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(t);
    console.warn("[finstat] network error", e);
    return { status: "error", message: "network", raw: null };
  }
  clearTimeout(t);

  console.log("[finstat] response status =", res.status);

  if (res.status === 404) return { status: "not_found", raw: null };

  const text = await res.text();
  console.log("[finstat] raw response body =", text.slice(0, 2000));
  if (res.status === 402 || res.status === 403) {
    return {
      status: "error",
      message: "Autorizácia FinStat API zlyhala. Skontrolujte API kľúče alebo spôsob generovania hash.",
      raw: text,
    };
  }
  if (!res.ok) {
    return { status: "error", message: `http_${res.status}`, raw: text };
  }

  // Try JSON first, fall back to XML.
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  let parsed: any = null;
  if (ct.includes("json") || text.trim().startsWith("{")) {
    try { parsed = JSON.parse(text); } catch {}
  }
  if (!parsed && (ct.includes("xml") || text.trim().startsWith("<"))) {
    parsed = parseFinstatXml(text);
  }
  if (!parsed) return { status: "error", message: "invalid_response", raw: text };

  if (parsed && typeof parsed === "object" && parsed.Error) {
    const msg = String(parsed.Error ?? "").toLowerCase();
    if (msg.includes("not found") || msg.includes("nenájd")) return { status: "not_found", raw: parsed };
    return { status: "error", message: String(parsed.Error), raw: parsed };
  }
  try { console.log("[finstat] keys:", Object.keys(parsed)); } catch {}
  return { status: "ok", data: normalize(parsed, ico, region), raw: parsed };
}

// Lightweight XML parser for the flat FinStat detail response: pulls every
// <Tag>value</Tag> at any depth into a flat object. Good enough for the
// fields we map (Name, Ico, Dic, IcDph, Street, City, Zip, Country, etc.).
function parseFinstatXml(xml: string): Record<string, string> | null {
  if (!xml || typeof xml !== "string") return null;
  const out: Record<string, string> = {};
  const re = /<([A-Za-z_][A-Za-z0-9_]*)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const key = m[1];
    const val = decodeEntities(m[2] ?? "").trim();
    if (val && !(key in out)) out[key] = val;
  }
  return Object.keys(out).length ? out : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// Build a case-insensitive view over the response so we don't depend on the
// provider's exact casing. Recursively look one level into nested Address.
function buildIndex(d: any): Map<string, any> {
  const map = new Map<string, any>();
  if (d && typeof d === "object") {
    for (const [k, v] of Object.entries(d)) {
      map.set(k.toLowerCase(), v);
    }
    const addr = (d as any).Address ?? (d as any).address;
    if (addr && typeof addr === "object") {
      for (const [k, v] of Object.entries(addr)) {
        const key = k.toLowerCase();
        if (!map.has(key)) map.set(key, v);
      }
    }
  }
  return map;
}

function pickFrom(idx: Map<string, any>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = idx.get(k.toLowerCase());
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s === "" || s === "0") continue;
    return s;
  }
  return null;
}

function normalize(d: any, ico: string, region: FinstatRegion = "sk"): NormalizedCompany {
  const idx = buildIndex(d);
  const street = pickFrom(idx, "Street", "StreetName", "Address");
  const houseNum = pickFrom(idx, "StreetNumber", "HouseNumber", "OrientationNumber");
  const fullStreet = [street, houseNum].filter(Boolean).join(" ").trim() || null;
  const zipRaw = pickFrom(idx, "Zip", "ZipCode", "PostalCode", "Psc");
  const zip = zipRaw ? zipRaw.replace(/\s+/g, "").replace(/(\d{3})(\d{2})/, "$1 $2") : null;
  return {
    ico,
    name: pickFrom(idx, "Name", "CompanyName", "FullName") ?? "",
    dic: pickFrom(idx, "Dic", "DIC", "TaxId", "TaxID"),
    ic_dph: pickFrom(idx, "IcDph", "IcDPH", "IcDPh", "VatId", "VATId", "VATNumber", "VatNumber"),
    street: fullStreet,
    city: pickFrom(idx, "City", "Municipality", "Town"),
    zip,
    country: pickFrom(idx, "Country", "CountryCode") ?? (region === "cz" ? "CZ" : "SK"),
  };
}