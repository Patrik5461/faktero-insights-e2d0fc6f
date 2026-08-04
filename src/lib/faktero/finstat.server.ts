import { createHash } from "crypto";

/**
 * FinStat Premium API client (server-only).
 *
 * Env:
 *   FINSTAT_API_KEY       (falls back to FINSTAT_PUBLIC_KEY for backwards compat)
 *   FINSTAT_PRIVATE_KEY
 *
 * Hash for /detail:
 *   sha256_hex_lowercase("SomeSalt+" + apiKey + "+" + privateKey + "++" + ico + "+ended")
 *
 * Detail URL:
 *   https://www.finstat.sk/api/detail?apikey={apiKey}&ico={ico}&hash={hash}
 *
 * NEVER log real keys or the raw hash base. Diagnostics mask both.
 */

export type VatStatus = "Áno" | "Nie" | "Nedostupné";

export type FinancialsSummary = {
  year?: number | null;
  revenue?: number | null;
  profit?: number | null;
  employees?: number | null;
} | null;

export type StatutoryRepresentative = {
  name: string;
  function?: string | null;
  from?: string | null;
};

export type RiskIndicators = {
  debtor?: boolean;
  paidVat?: boolean;
  inLiquidation?: boolean;
  bankrupt?: boolean;
  score?: number;
  suspended?: string;
};

export type NormalizedCompany = {
  ico: string;
  name: string;
  dic: string | null;
  ic_dph: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string;
  legalForm: string | null;
  registrationNumber: string | null;
  registrationDate: string | null;
  vatStatus: VatStatus;
  financials: FinancialsSummary;
  riskIndicators: RiskIndicators | null;
  statutoryRepresentatives: StatutoryRepresentative[];
};

const FINSTAT_BASE: Record<"sk" | "cz", string> = {
  sk: "https://www.finstat.sk/api",
  cz: "https://www.finstat.cz/api",
};
const HASH_SALT = "SomeSalt";

export type FinstatRegion = "sk" | "cz";

function readEnv(name: string): string | null {
  const v = process.env[name];
  if (typeof v !== "string") return null;
  const trimmed = v.replace(/^\s+|\s+$/g, "");
  return trimmed.length ? trimmed : null;
}

function readApiKey(): string | null {
  return readEnv("FINSTAT_API_KEY") ?? readEnv("FINSTAT_PUBLIC_KEY");
}

function readPrivateKey(): string | null {
  return readEnv("FINSTAT_PRIVATE_KEY");
}

export function isFinstatConfigured(): boolean {
  return !!(readApiKey() && readPrivateKey());
}

function maskSecret(s: string): string {
  if (!s) return "";
  if (s.length <= 8) return "*".repeat(s.length);
  return `${s.slice(0, 4)}…${s.slice(-4)} (len=${s.length})`;
}

function buildHash(apiKey: string, privateKey: string, param: string): string {
  return createHash("sha256")
    .update(`${HASH_SALT}+${apiKey}+${privateKey}++${param}+ended`, "utf8")
    .digest("hex");
}

function isDev(): boolean {
  const env = process.env.NODE_ENV;
  return env !== "production";
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

export async function finstatAutocomplete(
  query: string,
  region: FinstatRegion = "sk",
): Promise<FinstatAutocompleteResult> {
  const apiKey = readApiKey();
  const privateKey = readPrivateKey();
  if (!apiKey || !privateKey) {
    return { status: "error", message: "FinStat API nie je nakonfigurované." };
  }
  const q = (query ?? "").trim();
  if (q.length < 3) return { status: "ok", data: [] };

  const hash = buildHash(apiKey, privateKey, q);
  // GET /api/autocomplete?query=...&apikey=...&hash=...&json=true
  // Hash base: SomeSalt+{apiKey}+{privateKey}++{query}+ended  (SHA-256 lowercase hex)
  const url = `${FINSTAT_BASE[region]}/autocomplete?${new URLSearchParams({
    query: q,
    apikey: apiKey,
    hash,
    json: "true",
  }).toString()}`;

  console.log(
    `[finstat-ac] → region=${region} query=${JSON.stringify(q)} url=${FINSTAT_BASE[region]}/autocomplete?query=${encodeURIComponent(q)}&apikey=${maskSecret(apiKey)}&hash=${hash.slice(0, 8)}…&json=true`,
  );

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

  const text = await res.text();
  console.log(
    `[finstat-ac] ← region=${region} status=${res.status} ct="${res.headers.get("content-type") ?? ""}" bytes=${text.length} preview=${JSON.stringify(text.slice(0, 300))}`,
  );

  if (!res.ok) {
    if (res.status === 402 || res.status === 403) {
      return { status: "error", message: "autocomplete_not_entitled" };
    }
    if (res.status === 404) return { status: "ok", data: [] };
    return { status: "error", message: `http_${res.status}` };
  }

  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  let parsed: unknown = null;
  if (ct.includes("json") || text.trim().startsWith("[") || text.trim().startsWith("{")) {
    try {
      parsed = JSON.parse(text);
    } catch {
      /* fall through */
    }
  }
  if (!parsed && (ct.includes("xml") || text.trim().startsWith("<"))) {
    parsed = parseAutocompleteXml(text);
  }
  if (!parsed) {
    console.warn(
      `[finstat-ac] invalid_response region=${region} ct="${ct}" preview=${JSON.stringify(text.slice(0, 200))}`,
    );
    return { status: "error", message: "invalid_response" };
  }

  const rows: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { Results?: unknown[] }).Results)
      ? (parsed as { Results: unknown[] }).Results
      : Array.isArray((parsed as { results?: unknown[] }).results)
        ? (parsed as { results: unknown[] }).results
        : Array.isArray((parsed as { SuggestResult?: unknown[] }).SuggestResult)
          ? (parsed as { SuggestResult: unknown[] }).SuggestResult
          : [];

  console.log(
    `[finstat-ac] parsed region=${region} rowKeys=${!Array.isArray(parsed) && parsed && typeof parsed === "object" ? Object.keys(parsed as object).join(",") : "(array)"} rows=${rows.length} firstRow=${JSON.stringify(rows[0] ?? null).slice(0, 300)}`,
  );

  const data: FinstatSuggestion[] = rows
    .map((r) => {
      const idx = buildIndex(r);
      const street = pickFrom(idx, "Street", "StreetName");
      const houseNum = pickFrom(idx, "StreetNumber", "HouseNumber");
      const fullStreet =
        [street, houseNum].filter(Boolean).join(" ").trim() || pickFrom(idx, "Address");
      return {
        ico: String(pickFrom(idx, "Ico", "ICO", "Id") ?? "").trim(),
        name: String(pickFrom(idx, "Name", "CompanyName", "FullName", "Value") ?? "").trim(),
        address: fullStreet ?? null,
        city: pickFrom(idx, "City", "Municipality", "Town"),
      };
    })
    .filter((r) => r.ico && r.name)
    .slice(0, 10);

  console.log(`[finstat-ac] result region=${region} suggestions=${data.length}`);
  return { status: "ok", data };
}

function parseAutocompleteXml(xml: string): Array<Record<string, string>> | null {
  if (!xml || typeof xml !== "string") return null;
  const blockRe = /<(SuggestionItem|Suggestion|Item|Result)\b[^>]*>([\s\S]*?)<\/\1>/g;
  const rows: Array<Record<string, string>> = [];
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
  | { status: "ok"; data: NormalizedCompany; raw: unknown }
  | { status: "not_found"; raw: unknown | null }
  | { status: "error"; message: string; raw: unknown | null; diagnostics?: FinstatDiagnostics };

export type FinstatDiagnostics = {
  hashBaseMasked: string;
  hash: string;
  urlMasked: string;
  httpStatus: number;
  responsePreview: string;
};

export async function finstatLookup(
  icoInput: string,
  region: FinstatRegion = "sk",
): Promise<FinstatResult> {
  const apiKey = readApiKey();
  const privateKey = readPrivateKey();
  if (!apiKey || !privateKey) {
    return { status: "error", message: "FinStat API nie je nakonfigurované.", raw: null };
  }

  // Use the raw IČO in the hash — do NOT URL-encode or normalize casing.
  const ico = String(icoInput ?? "").replace(/^\s+|\s+$/g, "");
  if (!ico) {
    return { status: "error", message: "invalid_ico", raw: null };
  }

  const hash = buildHash(apiKey, privateKey, ico);
  const url = `${FINSTAT_BASE[region]}/detail?${new URLSearchParams({
    apikey: apiKey,
    ico,
    hash,
  }).toString()}`;

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

  if (res.status === 404) return { status: "not_found", raw: null };

  const text = await res.text();

  if (res.status === 402 || res.status === 403) {
    const diagnostics: FinstatDiagnostics = {
      hashBaseMasked: `SomeSalt+${maskSecret(apiKey)}+${maskSecret(privateKey)}++${ico}+ended`,
      hash,
      urlMasked: `${FINSTAT_BASE[region]}/detail?apikey=${maskSecret(apiKey)}&ico=${ico}&hash=${hash}`,
      httpStatus: res.status,
      responsePreview: text.slice(0, 500),
    };
    if (isDev()) {
      console.warn("[finstat] verification failed", diagnostics);
    } else {
      console.warn("[finstat] verification failed status =", res.status);
    }
    return {
      status: "error",
      message:
        "Autorizácia FinStat API zlyhala. Skontrolujte API kľúče alebo spôsob generovania hash.",
      raw: text,
      diagnostics: isDev() ? diagnostics : undefined,
    };
  }
  if (!res.ok) {
    return { status: "error", message: `http_${res.status}`, raw: text };
  }

  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  let parsed: unknown = null;
  if (ct.includes("json") || text.trim().startsWith("{")) {
    try {
      parsed = JSON.parse(text);
    } catch {
      /* fall through */
    }
  }
  if (!parsed && (ct.includes("xml") || text.trim().startsWith("<"))) {
    parsed = parseFinstatXml(text);
  }
  if (!parsed) return { status: "error", message: "invalid_response", raw: text };

  if (parsed && typeof parsed === "object" && "Error" in (parsed as Record<string, unknown>)) {
    const err = (parsed as Record<string, unknown>).Error;
    const msg = String(err ?? "").toLowerCase();
    if (msg.includes("not found") || msg.includes("nenájd")) {
      return { status: "not_found", raw: parsed };
    }
    return { status: "error", message: String(err), raw: parsed };
  }

  return { status: "ok", data: normalize(parsed, ico, region), raw: parsed };
}

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
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Case-insensitive index over the response; also flattens Address.*.
function buildIndex(d: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (isRecord(d)) {
    for (const [k, v] of Object.entries(d)) {
      map.set(k.toLowerCase(), v);
    }
    const addr = (d as Record<string, unknown>).Address ?? (d as Record<string, unknown>).address;
    if (isRecord(addr)) {
      for (const [k, v] of Object.entries(addr)) {
        const key = k.toLowerCase();
        if (!map.has(key)) map.set(key, v);
      }
    }
  }
  return map;
}

function pickFrom(idx: Map<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = idx.get(k.toLowerCase());
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s === "" || s === "0") continue;
    return s;
  }
  return null;
}

function pickBool(idx: Map<string, unknown>, ...keys: string[]): boolean | null {
  for (const k of keys) {
    const v = idx.get(k.toLowerCase());
    if (v === null || v === undefined) continue;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (["true", "1", "yes", "áno", "ano"].includes(s)) return true;
    if (["false", "0", "no", "nie"].includes(s)) return false;
  }
  return null;
}

function pickNumber(idx: Map<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = idx.get(k.toLowerCase());
    if (v === null || v === undefined) continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickArray(idx: Map<string, unknown>, ...keys: string[]): unknown[] | null {
  for (const k of keys) {
    const v = idx.get(k.toLowerCase());
    if (Array.isArray(v)) return v;
    if (isRecord(v)) {
      // Some XML->JSON shapes wrap arrays as { item: [...] } or single obj.
      for (const child of Object.values(v)) {
        if (Array.isArray(child)) return child;
      }
      return [v];
    }
  }
  return null;
}

function mapStatutories(idx: Map<string, unknown>): StatutoryRepresentative[] {
  const raw = pickArray(
    idx,
    "StatutoryRepresentatives",
    "Statutories",
    "Statutary",
    "statutoryRepresentatives",
  );
  if (!raw) return [];
  const out: StatutoryRepresentative[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const sub = buildIndex(item);
    const name = pickFrom(sub, "Name", "FullName", "PersonName") ?? "";
    if (!name) continue;
    out.push({
      name,
      function: pickFrom(sub, "Function", "Role", "Position"),
      from: pickFrom(sub, "From", "Since", "ValidFrom"),
    });
  }
  return out;
}

function mapFinancials(idx: Map<string, unknown>): FinancialsSummary {
  const raw = idx.get("financials") ?? idx.get("financialdata") ?? idx.get("lastfinancialdata");
  if (isRecord(raw)) {
    const sub = buildIndex(raw);
    return {
      year: pickNumber(sub, "Year"),
      revenue: pickNumber(sub, "Revenue", "Sales", "Turnover"),
      profit: pickNumber(sub, "Profit", "NetIncome", "EAT"),
      employees: pickNumber(sub, "Employees", "EmployeeCount"),
    };
  }
  // Flat fallback fields on the root.
  const year = pickNumber(idx, "FinancialYear", "LastFinancialYear");
  const revenue = pickNumber(idx, "Sales", "Revenue", "Turnover");
  const profit = pickNumber(idx, "Profit", "NetIncome", "EAT");
  const employees = pickNumber(idx, "Employees", "EmployeeCount");
  if (year || revenue || profit || employees) {
    return { year, revenue, profit, employees };
  }
  return null;
}

function mapRiskIndicators(idx: Map<string, unknown>): RiskIndicators | null {
  const out: RiskIndicators = {};
  const debtor = pickBool(idx, "IsDebtor", "Debtor");
  const paidVat = pickBool(idx, "IsPaidVat", "IsVatPayer");
  const inLiquidation = pickBool(idx, "InLiquidation", "IsInLiquidation");
  const bankrupt = pickBool(idx, "IsBankrupt", "Bankrupt", "InBankruptcy");
  const score = pickNumber(idx, "Score", "FinstatScore", "RiskScore");
  if (debtor !== null) out.debtor = debtor;
  if (paidVat !== null) out.paidVat = paidVat;
  if (inLiquidation !== null) out.inLiquidation = inLiquidation;
  if (bankrupt !== null) out.bankrupt = bankrupt;
  if (score !== null) out.score = score;
  const suspended = pickFrom(idx, "SuspendedFrom", "SuspendedTo");
  if (suspended) out.suspended = suspended;
  return Object.keys(out).length ? out : null;
}

/**
 * VAT status accuracy rule:
 * - Non-empty IC DPH → "Áno"
 * - Explicit non-payer flag from FinStat → "Nie"
 * - Otherwise (missing/unclear) → "Nedostupné"
 *
 * NEVER infer "Nie" from a missing IC DPH alone.
 */
function computeVatStatus(idx: Map<string, unknown>, icDph: string | null): VatStatus {
  if (icDph && icDph.trim().length > 0) return "Áno";
  const explicit = pickBool(idx, "IsVatPayer", "IsPaidVat", "VatPayer");
  if (explicit === false) return "Nie";
  if (explicit === true) return "Áno";
  return "Nedostupné";
}

function normalize(d: unknown, ico: string, region: FinstatRegion = "sk"): NormalizedCompany {
  const idx = buildIndex(d);
  const street = pickFrom(idx, "Street", "StreetName", "Address");
  const houseNum = pickFrom(idx, "StreetNumber", "HouseNumber", "OrientationNumber");
  const fullStreet = [street, houseNum].filter(Boolean).join(" ").trim() || null;
  const zipRaw = pickFrom(idx, "Zip", "ZipCode", "PostalCode", "Psc");
  const zip = zipRaw ? zipRaw.replace(/\s+/g, "").replace(/(\d{3})(\d{2})/, "$1 $2") : null;
  const icDph = pickFrom(
    idx,
    "IcDph",
    "IcDPH",
    "IcDPh",
    "ICDPH",
    "Icdph",
    "VatId",
    "VATId",
    "VATNumber",
    "VatNumber",
  );
  return {
    ico,
    name: pickFrom(idx, "Name", "CompanyName", "FullName", "obchodneMeno") ?? "",
    dic: pickFrom(idx, "Dic", "DIC", "TaxId", "TaxID"),
    ic_dph: icDph,
    street: fullStreet,
    city: pickFrom(idx, "City", "Municipality", "Town"),
    zip,
    country: pickFrom(idx, "Country", "CountryCode") ?? (region === "cz" ? "CZ" : "SK"),
    legalForm: pickFrom(idx, "LegalFormText", "LegalForm", "legalForm"),
    registrationNumber: pickFrom(
      idx,
      "RegistrationNumberText",
      "RegistrationNumber",
      "registrationNumber",
    ),
    registrationDate: pickFrom(
      idx,
      "RegistrationDate",
      "Created",
      "IncorporationDate",
      "EstablishedOn",
    ),
    vatStatus: computeVatStatus(idx, icDph),
    financials: mapFinancials(idx),
    riskIndicators: mapRiskIndicators(idx),
    statutoryRepresentatives: mapStatutories(idx),
  };
}
