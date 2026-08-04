import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import * as XLSX from "xlsx";

// =========================================================
// Lightweight CSV parser (semicolon / comma autodetect, RFC4180-ish)
// =========================================================
export function parseCsv(text: string): Record<string, string>[] {
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // detect separator from first non-quoted line
  const sep = detectSeparator(text);
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === sep) {
        cur.push(field);
        field = "";
      } else if (c === "\n") {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else if (c === "\r") {
        /* skip */
      } else field += c;
    }
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0].trim() === "") continue;
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = (row[i] ?? "").trim();
    });
    out.push(rec);
  }
  return out;
}

function detectSeparator(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ";": 0, ",": 0, "\t": 0 };
  let inQ = false;
  for (const c of firstLine) {
    if (c === '"') inQ = !inQ;
    else if (!inQ && c in counts) counts[c as keyof typeof counts]++;
  }
  const best = (Object.entries(counts) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ";";
}

// =========================================================
// Source extraction (CSV / XML / ZIP -> tables)
// =========================================================
export type ParsedTable = {
  name: string;
  format: "csv" | "xml";
  rows: Record<string, string>[];
  headers: string[];
};

export async function extractTables(
  fileBytes: Uint8Array,
  fileName: string,
): Promise<ParsedTable[]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return parseXlsx(fileBytes, fileName);
  }
  if (lower.endsWith(".zip")) {
    const unzipped = unzipSync(fileBytes);
    const tables: ParsedTable[] = [];
    for (const [path, bytes] of Object.entries(unzipped)) {
      const l = path.toLowerCase();
      if (l.endsWith("/") || l.startsWith("__macosx/")) continue;
      if (l.endsWith(".csv")) {
        const rows = parseCsv(strFromU8(bytes));
        if (rows.length)
          tables.push({ name: path, format: "csv", rows, headers: Object.keys(rows[0]) });
      } else if (l.endsWith(".xml")) {
        const rows = parseXmlRows(strFromU8(bytes));
        if (rows.length)
          tables.push({ name: path, format: "xml", rows, headers: Object.keys(rows[0]) });
      } else if (l.endsWith(".xlsx") || l.endsWith(".xls")) {
        tables.push(...parseXlsx(bytes, path));
      }
    }
    return tables;
  }
  if (lower.endsWith(".xml")) {
    const rows = parseXmlRows(new TextDecoder().decode(fileBytes));
    return rows.length
      ? [{ name: fileName, format: "xml", rows, headers: Object.keys(rows[0]) }]
      : [];
  }
  // default: CSV (covers .csv, .txt, no-ext)
  const rows = parseCsv(new TextDecoder().decode(fileBytes));
  return rows.length
    ? [{ name: fileName, format: "csv", rows, headers: Object.keys(rows[0]) }]
    : [];
}

// =========================================================
// XLSX → tables. Detects header row even when SuperFaktúra
// inserts a few title/blank rows at the top of the sheet.
// =========================================================
function parseXlsx(bytes: Uint8Array, fileName: string): ParsedTable[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: "array", cellDates: false, raw: false });
  } catch {
    return [];
  }
  const out: ParsedTable[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      defval: "",
      raw: false,
    }) as unknown[][];
    if (!matrix.length) continue;

    // Pick the row with the most non-empty cells from the first 10 rows as header.
    const scan = Math.min(matrix.length, 10);
    let headerIdx = 0,
      headerScore = -1;
    for (let i = 0; i < scan; i++) {
      const score = (matrix[i] ?? []).filter((c) => String(c ?? "").trim() !== "").length;
      if (score > headerScore) {
        headerScore = score;
        headerIdx = i;
      }
    }
    if (headerScore <= 0) continue;

    const rawHeaders = (matrix[headerIdx] ?? []).map((h) => String(h ?? "").trim());
    // Ensure unique non-empty headers
    const seen = new Map<string, number>();
    const headers = rawHeaders.map((h, idx) => {
      const base = h || `col_${idx + 1}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return n === 1 ? base : `${base}_${n}`;
    });

    const rows: Record<string, string>[] = [];
    for (let r = headerIdx + 1; r < matrix.length; r++) {
      const row = matrix[r] ?? [];
      const rec: Record<string, string> = {};
      let any = false;
      for (let c = 0; c < headers.length; c++) {
        const v = row[c];
        const s = v == null ? "" : String(v).trim();
        if (s) any = true;
        rec[headers[c]] = s;
      }
      if (any) rows.push(rec);
    }
    if (rows.length) {
      out.push({ name: `${fileName}#${sheetName}`, format: "csv", rows, headers });
    }
  }
  return out;
}

function parseXmlRows(xml: string): Record<string, string>[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    textNodeName: "#text",
  });
  const obj = parser.parse(xml);
  // Find first array of records (heuristic for SF XML exports).
  const found = findRowsArray(obj);
  if (!found) return [];
  return found.map((r) => flattenRow(r));
}

function findRowsArray(node: any): any[] | null {
  if (!node || typeof node !== "object") return null;
  for (const v of Object.values(node)) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
    const nested = findRowsArray(v);
    if (nested) return nested;
  }
  return null;
}

function flattenRow(node: any, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (node == null) return out;
  if (typeof node !== "object") {
    out[prefix || "value"] = String(node);
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v == null) out[key] = "";
    else if (typeof v === "object" && !Array.isArray(v)) Object.assign(out, flattenRow(v, key));
    else out[key] = String(v);
  }
  return out;
}

// =========================================================
// Heuristic mapping suggestion
// =========================================================
export type FieldKey =
  | "invoice_number"
  | "variable_symbol"
  | "issue_date"
  | "due_date"
  | "delivery_date"
  | "status"
  | "currency"
  | "subtotal"
  | "vat_total"
  | "total"
  | "notes"
  | "external_id"
  | "customer_name"
  | "customer_ico"
  | "customer_dic"
  | "customer_ic_dph"
  | "customer_email"
  | "customer_phone"
  | "customer_street"
  | "customer_city"
  | "customer_zip"
  | "customer_country"
  | "item_name"
  | "item_description"
  | "item_quantity"
  | "item_unit"
  | "item_unit_price"
  | "item_vat_rate"
  | "item_total";

const HEURISTICS: Record<FieldKey, RegExp[]> = {
  invoice_number: [/^(invoice_)?number$/i, /\bfakt(u|ú)ra\b/i, /^cislo/i, /\bnumber\b/i],
  variable_symbol: [/variable.?symbol|^vs$|variabiln/i],
  issue_date: [/issue.?date|datum.?vystav|date.?created/i],
  due_date: [/due.?date|splatnost/i],
  delivery_date: [/delivery.?date|datum.?dodan/i],
  status: [/^status$|^stav$/i],
  currency: [/currency|mena/i],
  subtotal: [/subtotal|bez.?dph|netto/i],
  vat_total: [/vat.?total|dph.?spolu|^vat$|^dph$/i],
  total: [/^total$|spolu|s.?dph|brutto/i],
  notes: [/note|poznam/i],
  external_id: [/^id$|^external/i],
  customer_name: [/(customer|client|odberat).*(name|nazov|meno)|^name$|^nazov$/i],
  customer_ico: [/(ico|company.?id)/i],
  customer_dic: [/^dic$|tax.?id/i],
  customer_ic_dph: [/ic.?dph|vat.?id/i],
  customer_email: [/email/i],
  customer_phone: [/phone|telef/i],
  customer_street: [/street|ulic/i],
  customer_city: [/city|mesto/i],
  customer_zip: [/zip|psc|postal/i],
  customer_country: [/country|krajin/i],
  item_name: [/(item|polozka).*(name|nazov)|description$/i],
  item_description: [/description|popis/i],
  item_quantity: [/quantity|mnozstvo|qty/i],
  item_unit: [/^unit$|^mj$/i],
  item_unit_price: [/unit.?price|cena.?jedn/i],
  item_vat_rate: [/vat.?rate|sadzba.?dph/i],
  item_total: [/item.?total|polozka.*spolu/i],
};

export function suggestMapping(headers: string[]): Partial<Record<FieldKey, string>> {
  const result: Partial<Record<FieldKey, string>> = {};
  for (const [field, patterns] of Object.entries(HEURISTICS) as [FieldKey, RegExp[]][]) {
    const match = headers.find((h) => patterns.some((p) => p.test(h)));
    if (match) result[field] = match;
  }
  return result;
}

// =========================================================
// Smart auto-detection with synonyms + sample-value inference + confidence
// =========================================================
function normKey(s: string): string {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SYNONYMS: Record<FieldKey, string[]> = {
  invoice_number: [
    "cislo faktury",
    "cislo",
    "faktura",
    "doklad",
    "invoice number",
    "invoice no",
    "number",
    "cislo dokladu",
  ],
  variable_symbol: ["variabilny symbol", "vs", "var symbol", "variable symbol"],
  issue_date: [
    "datum vystavenia",
    "vystavene",
    "datum vystavenia faktury",
    "issue date",
    "date issued",
    "datum",
  ],
  due_date: ["datum splatnosti", "splatnost", "due date", "splatne do"],
  delivery_date: ["datum dodania", "dodanie", "tax date", "datum dodania tovaru"],
  status: ["stav", "status", "uhradene", "zaplatene", "stav uhrady"],
  currency: ["mena", "currency"],
  subtotal: ["zaklad dane", "bez dph", "subtotal", "netto", "suma bez dph", "cena bez dph"],
  vat_total: ["dph spolu", "vat", "dph", "vat total", "dan"],
  total: [
    "celkom",
    "suma",
    "spolu",
    "total",
    "cena spolu",
    "suma s dph",
    "spolu s dph",
    "k uhrade",
  ],
  notes: ["poznamka", "note", "popis faktury"],
  external_id: ["id", "external id", "povodne id"],
  customer_name: [
    "odberatel",
    "zakaznik",
    "firma",
    "nazov odberatela",
    "customer",
    "client",
    "obchodne meno",
    "nazov firmy",
    "name",
  ],
  customer_ico: ["ico", "company id"],
  customer_dic: ["dic", "tax id"],
  customer_ic_dph: ["ic dph", "vat id", "vat"],
  customer_email: ["email", "e mail", "mail"],
  customer_phone: ["telefon", "phone", "tel"],
  customer_street: ["ulica", "street", "adresa"],
  customer_city: ["mesto", "city"],
  customer_zip: ["psc", "zip", "postal"],
  customer_country: ["krajina", "country", "stat"],
  item_name: ["polozka", "nazov polozky", "item name", "item"],
  item_description: ["popis", "description", "popis polozky"],
  item_quantity: ["mnozstvo", "quantity", "qty", "pocet"],
  item_unit: ["mj", "jednotka", "unit"],
  item_unit_price: ["cena", "cena za mj", "unit price", "cena jednotkova"],
  item_vat_rate: ["sadzba dph", "vat rate", "dph %"],
  item_total: ["polozka spolu", "item total", "cena spolu polozka"],
};

function fuzzyScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  // token overlap
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  let hit = 0;
  ta.forEach((t) => {
    if (tb.has(t)) hit++;
  });
  const union = new Set([...ta, ...tb]).size;
  return union ? hit / union : 0;
}

function sampleValues(rows: Record<string, string>[], header: string, n = 20): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const v = (r[header] ?? "").trim();
    if (v) out.push(v);
    if (out.length >= n) break;
  }
  return out;
}

function valueLooksLike(values: string[]): Set<FieldKey> {
  const tags = new Set<FieldKey>();
  if (!values.length) return tags;
  const isDate =
    values.filter((v) => /^\d{1,4}[.\/-]\d{1,2}[.\/-]\d{1,4}/.test(v)).length / values.length;
  const isEmail = values.filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)).length / values.length;
  const isIco =
    values.filter((v) => /^\d{6,10}$/.test(v.replace(/\s/g, ""))).length / values.length;
  const isIcDph =
    values.filter((v) => /^(SK|CZ)\d{8,12}$/i.test(v.replace(/\s/g, ""))).length / values.length;
  const isMoney =
    values.filter((v) => /^-?\d[\d\s.,]*$/.test(v) && /[.,]\d{2}\b/.test(v)).length / values.length;
  const isNumber =
    values.filter((v) => /^-?\d+([.,]\d+)?$/.test(v.replace(/\s/g, ""))).length / values.length;
  if (isDate > 0.6) {
    tags.add("issue_date");
    tags.add("due_date");
    tags.add("delivery_date");
  }
  if (isEmail > 0.6) tags.add("customer_email");
  if (isIcDph > 0.5) tags.add("customer_ic_dph");
  if (isIco > 0.6) tags.add("customer_ico");
  if (isMoney > 0.5) {
    tags.add("total");
    tags.add("subtotal");
    tags.add("vat_total");
    tags.add("item_total");
    tags.add("item_unit_price");
  }
  if (isNumber > 0.6) tags.add("item_quantity");
  return tags;
}

export type DetectionResult = {
  mapping: Partial<Record<FieldKey, string>>;
  perField: Partial<Record<FieldKey, { header: string; score: number }>>;
  confidence: number; // 0..1
  confidenceLabel: "high" | "medium" | "low";
  detectedSource: "superfaktura" | "generic";
  detectedColumns: string[];
};

// Fields considered "required" for a good import.
const CORE_FIELDS: FieldKey[] = ["invoice_number", "issue_date", "total", "customer_name"];
const NICE_FIELDS: FieldKey[] = [
  "due_date",
  "variable_symbol",
  "currency",
  "subtotal",
  "vat_total",
  "customer_ico",
  "customer_email",
  "status",
];

export function detectMapping(headers: string[], rows: Record<string, string>[]): DetectionResult {
  const normHeaders = headers.map((h) => ({ raw: h, norm: normKey(h) }));
  const perField: DetectionResult["perField"] = {};

  const valueTagsByHeader = new Map<string, Set<FieldKey>>();
  for (const h of headers) valueTagsByHeader.set(h, valueLooksLike(sampleValues(rows, h)));

  for (const field of Object.keys(SYNONYMS) as FieldKey[]) {
    const syns = SYNONYMS[field].map(normKey);
    let best: { header: string; score: number } | null = null;
    for (const { raw, norm } of normHeaders) {
      let s = 0;
      for (const syn of syns) s = Math.max(s, fuzzyScore(norm, syn));
      // bonus if sample values match expected type for this field
      const tags = valueTagsByHeader.get(raw);
      if (tags?.has(field)) s = Math.min(1, s + 0.15);
      // legacy regex fallback
      if (s < 0.5 && HEURISTICS[field].some((p) => p.test(raw))) s = Math.max(s, 0.55);
      if (s > (best?.score ?? 0)) best = { header: raw, score: s };
    }
    if (best && best.score >= 0.5) perField[field] = best;
  }

  // Resolve conflicts (same header picked for multiple fields): keep highest-scoring assignment
  const used = new Map<string, FieldKey>();
  for (const field of [...CORE_FIELDS, ...NICE_FIELDS, ...(Object.keys(SYNONYMS) as FieldKey[])]) {
    const entry = perField[field];
    if (!entry) continue;
    const prev = used.get(entry.header);
    if (!prev) used.set(entry.header, field);
    else {
      const prevScore = perField[prev]?.score ?? 0;
      if (entry.score > prevScore) {
        delete perField[prev];
        used.set(entry.header, field);
      } else delete perField[field];
    }
  }

  const mapping: Partial<Record<FieldKey, string>> = {};
  for (const [f, v] of Object.entries(perField) as [
    FieldKey,
    { header: string; score: number },
  ][]) {
    mapping[f] = v.header;
  }

  // Confidence: weighted on core (70%) + nice (30%)
  const coreHits = CORE_FIELDS.filter((f) => perField[f]).length;
  const niceHits = NICE_FIELDS.filter((f) => perField[f]).length;
  const confidence = Math.min(
    1,
    (coreHits / CORE_FIELDS.length) * 0.7 + (niceHits / NICE_FIELDS.length) * 0.3,
  );
  const confidenceLabel: DetectionResult["confidenceLabel"] =
    confidence >= 0.75 ? "high" : confidence >= 0.45 ? "medium" : "low";

  // Source detection: SuperFaktúra exports include certain headers / "SuperFaktúra" branding
  const all = normHeaders.map((h) => h.norm).join(" | ");
  const detectedSource: DetectionResult["detectedSource"] =
    /superfaktura|sf id|sf cislo|invoice number/.test(all) ||
    ((perField.invoice_number && perField.customer_name && perField.total
      ? "superfaktura"
      : "generic") as any);

  return {
    mapping,
    perField,
    confidence,
    confidenceLabel,
    detectedSource: detectedSource === "superfaktura" ? "superfaktura" : "generic",
    detectedColumns: Object.keys(perField),
  };
}

// =========================================================
// Build preview from rows + mapping
// =========================================================
function num(v: string | undefined): number {
  if (v == null || v === "") return 0;
  const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function pick(
  row: Record<string, string>,
  mapping: Partial<Record<FieldKey, string>>,
  key: FieldKey,
): string {
  const h = mapping[key];
  return h ? (row[h] ?? "").trim() : "";
}
function normDate(v: string): string | null {
  if (!v) return null;
  // Accept DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export type ImportPreview = {
  invoicesCount: number;
  customersCount: number;
  itemsCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  totalValue: number;
  currency: string;
  sampleInvoices: Array<{
    invoice_number: string;
    customer_name: string;
    total: number;
    issue_date: string | null;
  }>;
};

export function buildPreview(
  rows: Record<string, string>[],
  mapping: Partial<Record<FieldKey, string>>,
): ImportPreview {
  const invoicesByNumber = new Map<
    string,
    { total: number; issue_date: string | null; customer_name: string; currency: string }
  >();
  const customerKeys = new Set<string>();
  let items = 0;
  let dateFrom: string | null = null,
    dateTo: string | null = null,
    totalValue = 0;
  let currency = "EUR";
  for (const row of rows) {
    const invNo = pick(row, mapping, "invoice_number");
    const total = num(pick(row, mapping, "total")) || num(pick(row, mapping, "item_total"));
    const cust = pick(row, mapping, "customer_name");
    const ico = pick(row, mapping, "customer_ico");
    const issue = normDate(pick(row, mapping, "issue_date"));
    const curr = pick(row, mapping, "currency") || "EUR";
    if (cust || ico) customerKeys.add((ico || "").toLowerCase() + "|" + cust.toLowerCase());
    items++;
    if (invNo && !invoicesByNumber.has(invNo)) {
      invoicesByNumber.set(invNo, {
        total,
        issue_date: issue,
        customer_name: cust,
        currency: curr,
      });
      totalValue += total;
      currency = curr;
      if (issue) {
        if (!dateFrom || issue < dateFrom) dateFrom = issue;
        if (!dateTo || issue > dateTo) dateTo = issue;
      }
    }
  }
  const sample = Array.from(invoicesByNumber.entries())
    .slice(0, 5)
    .map(([invoice_number, v]) => ({
      invoice_number,
      customer_name: v.customer_name,
      total: v.total,
      issue_date: v.issue_date,
    }));
  return {
    invoicesCount: invoicesByNumber.size,
    customersCount: customerKeys.size,
    itemsCount: items,
    dateFrom,
    dateTo,
    totalValue,
    currency,
    sampleInvoices: sample,
  };
}

// =========================================================
// Execute import (server-side, RLS bypassed via admin, scoped by company_id)
// =========================================================
export type ImportOptions = {
  updateExisting?: boolean;
  customersOnly?: boolean;
  invoicesOnly?: boolean;
  generatePdfs?: boolean;
  triggerWebhooks?: boolean;
};

export type ImportResult = {
  imported_customers: number;
  imported_invoices: number;
  failed_rows: number;
  duplicates: number;
};

export async function runImport(args: {
  jobId: string;
  companyId: string;
  rows: Record<string, string>[];
  mapping: Partial<Record<FieldKey, string>>;
  options: ImportOptions;
}): Promise<ImportResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { jobId, companyId, rows, mapping, options } = args;

  const result: ImportResult = {
    imported_customers: 0,
    imported_invoices: 0,
    failed_rows: 0,
    duplicates: 0,
  };

  // Pre-fetch existing customers + invoices for dup detection
  const { data: existingCustomers } = await supabaseAdmin
    .from("customers")
    .select("id, name, ico, email")
    .eq("company_id", companyId);
  const { data: existingInvoices } = await supabaseAdmin
    .from("invoices")
    .select("id, invoice_number, original_external_id")
    .eq("company_id", companyId);

  const custByIco = new Map<string, string>();
  const custByEmail = new Map<string, string>();
  const custByName = new Map<string, string>();
  for (const c of existingCustomers ?? []) {
    if (c.ico) custByIco.set(c.ico.toLowerCase(), c.id);
    if (c.email) custByEmail.set(c.email.toLowerCase(), c.id);
    if (c.name) custByName.set(c.name.toLowerCase(), c.id);
  }
  const invByNumber = new Map<string, string>();
  const invByExternal = new Map<string, string>();
  for (const i of existingInvoices ?? []) {
    if (i.invoice_number) invByNumber.set(i.invoice_number, i.id);
    if (i.original_external_id) invByExternal.set(i.original_external_id, i.id);
  }

  // Group rows by invoice_number so multiple item-rows roll up into one invoice
  const groups = new Map<string, Record<string, string>[]>();
  rows.forEach((r) => {
    const invNo = pick(r, mapping, "invoice_number") || `__r${groups.size + 1}`;
    if (!groups.has(invNo)) groups.set(invNo, []);
    groups.get(invNo)!.push(r);
  });

  let rowNum = 0;
  for (const [invNo, group] of groups) {
    rowNum++;
    try {
      const head = group[0];

      // ===== Customer upsert =====
      let customerId: string | null = null;
      const custName = pick(head, mapping, "customer_name");
      const custIco = pick(head, mapping, "customer_ico");
      const custEmail = pick(head, mapping, "customer_email");
      const lookupKey = custIco
        ? custByIco.get(custIco.toLowerCase())
        : custEmail
          ? custByEmail.get(custEmail.toLowerCase())
          : custName
            ? custByName.get(custName.toLowerCase())
            : undefined;
      if (lookupKey) {
        customerId = lookupKey;
      } else if (custName || custIco) {
        const { data: ins, error } = await supabaseAdmin
          .from("customers")
          .insert({
            company_id: companyId,
            name: custName || custIco || "Neznámy odberateľ",
            ico: custIco || null,
            dic: pick(head, mapping, "customer_dic") || null,
            ic_dph: pick(head, mapping, "customer_ic_dph") || null,
            email: custEmail || null,
            phone: pick(head, mapping, "customer_phone") || null,
            street: pick(head, mapping, "customer_street") || null,
            city: pick(head, mapping, "customer_city") || null,
            zip: pick(head, mapping, "customer_zip") || null,
            country: pick(head, mapping, "customer_country") || "SK",
          })
          .select("id")
          .single();
        if (error) throw new Error(`Odberateľ: ${error.message}`);
        customerId = ins!.id;
        result.imported_customers++;
        if (custIco) custByIco.set(custIco.toLowerCase(), customerId);
        if (custEmail) custByEmail.set(custEmail.toLowerCase(), customerId);
        if (custName) custByName.set(custName.toLowerCase(), customerId);
        await logRow(
          supabaseAdmin,
          jobId,
          companyId,
          rowNum,
          "customer",
          "success",
          `Vytvorený odberateľ ${custName || custIco}`,
          head,
        );
      }

      if (options.customersOnly) continue;

      // ===== Invoice =====
      const externalId = pick(head, mapping, "external_id");
      const existingId =
        invByNumber.get(invNo) || (externalId ? invByExternal.get(externalId) : undefined);
      if (existingId && !options.updateExisting) {
        result.duplicates++;
        await logRow(
          supabaseAdmin,
          jobId,
          companyId,
          rowNum,
          "invoice",
          "duplicate",
          `Faktúra ${invNo} už existuje — preskočená`,
          head,
        );
        continue;
      }

      // Build items: prefer per-row item mapping; else synthesize a single line from totals
      const items = group
        .map((r) => buildItem(r, mapping))
        .filter((it) => it.quantity > 0 || it.unit_price > 0 || it.total > 0);
      let subtotal = num(pick(head, mapping, "subtotal"));
      let vatTotal = num(pick(head, mapping, "vat_total"));
      let total = num(pick(head, mapping, "total"));
      if (items.length === 0) {
        items.push({
          name: `Položky faktúry ${invNo}`,
          description: null,
          quantity: 1,
          unit: "ks",
          unit_price: subtotal || total || 0,
          vat_rate:
            total > 0 && subtotal > 0 ? Math.round(((total - subtotal) / subtotal) * 100) : 23,
          subtotal: subtotal || total || 0,
          vat_amount: vatTotal || total - subtotal || 0,
          total: total || subtotal || 0,
        });
      }
      if (subtotal === 0) subtotal = items.reduce((s, i) => s + i.subtotal, 0);
      if (vatTotal === 0) vatTotal = items.reduce((s, i) => s + i.vat_amount, 0);
      if (total === 0) total = items.reduce((s, i) => s + i.total, 0);

      const issueDate =
        normDate(pick(head, mapping, "issue_date")) || new Date().toISOString().slice(0, 10);
      const dueDate = normDate(pick(head, mapping, "due_date")) || issueDate;
      const deliveryDate = normDate(pick(head, mapping, "delivery_date"));
      const status = (pick(head, mapping, "status") || "issued").toLowerCase();
      const ALLOWED = ["draft", "issued", "sent", "paid", "cancelled", "overdue"] as const;
      type InvStatus = (typeof ALLOWED)[number];
      const knownStatus: InvStatus = (ALLOWED as readonly string[]).includes(status)
        ? (status as InvStatus)
        : "issued";

      const payload = {
        company_id: companyId,
        customer_id: customerId,
        customer_name: custName || null,
        customer_ico: custIco || null,
        customer_dic: pick(head, mapping, "customer_dic") || null,
        customer_ic_dph: pick(head, mapping, "customer_ic_dph") || null,
        customer_email: custEmail || null,
        customer_street: pick(head, mapping, "customer_street") || null,
        customer_city: pick(head, mapping, "customer_city") || null,
        customer_zip: pick(head, mapping, "customer_zip") || null,
        customer_country: pick(head, mapping, "customer_country") || "SK",
        invoice_number: invNo,
        variable_symbol: pick(head, mapping, "variable_symbol") || invNo.replace(/\D/g, "") || null,
        issue_date: issueDate,
        due_date: dueDate,
        delivery_date: deliveryDate,
        currency: pick(head, mapping, "currency") || "EUR",
        status: knownStatus,
        subtotal,
        vat_total: vatTotal,
        total,
        notes: pick(head, mapping, "notes") || null,
        import_source: "SuperFaktúra",
        imported_at: new Date().toISOString(),
        original_external_id: externalId || null,
      };

      let invoiceId: string;
      if (existingId && options.updateExisting) {
        const { error } = await supabaseAdmin.from("invoices").update(payload).eq("id", existingId);
        if (error) throw new Error(`Faktúra: ${error.message}`);
        await supabaseAdmin.from("invoice_items").delete().eq("invoice_id", existingId);
        invoiceId = existingId;
      } else {
        const { data: ins, error } = await supabaseAdmin
          .from("invoices")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw new Error(`Faktúra: ${error.message}`);
        invoiceId = ins!.id;
      }

      const itemRows = items.map((it, idx) => ({
        invoice_id: invoiceId,
        position: idx + 1,
        name: it.name,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        vat_rate: it.vat_rate,
        subtotal: it.subtotal,
        vat_amount: it.vat_amount,
        total: it.total,
      }));
      if (itemRows.length) {
        const { error: itErr } = await supabaseAdmin.from("invoice_items").insert(itemRows);
        if (itErr) throw new Error(`Položky: ${itErr.message}`);
      }

      result.imported_invoices++;
      invByNumber.set(invNo, invoiceId);
      await logRow(
        supabaseAdmin,
        jobId,
        companyId,
        rowNum,
        "invoice",
        "success",
        `Faktúra ${invNo} importovaná`,
        head,
      );
    } catch (e: any) {
      result.failed_rows++;
      await logRow(
        supabaseAdmin,
        jobId,
        companyId,
        rowNum,
        "invoice",
        "error",
        String(e?.message ?? e),
        group[0],
      );
    }
  }

  return result;
}

function buildItem(row: Record<string, string>, mapping: Partial<Record<FieldKey, string>>) {
  const quantity = num(pick(row, mapping, "item_quantity"));
  const unit_price = num(pick(row, mapping, "item_unit_price"));
  const vat_rate = num(pick(row, mapping, "item_vat_rate")) || 23;
  const total = num(pick(row, mapping, "item_total"));
  const subtotal = quantity * unit_price || (total ? total / (1 + vat_rate / 100) : 0);
  const vat_amount = subtotal * (vat_rate / 100);
  return {
    name: pick(row, mapping, "item_name") || "Položka",
    description: pick(row, mapping, "item_description") || null,
    quantity: quantity || (subtotal || total ? 1 : 0),
    unit: "ks",
    unit_price: unit_price || subtotal,
    vat_rate,
    subtotal,
    vat_amount,
    total: total || subtotal + vat_amount,
  };
}

async function logRow(
  admin: any,
  jobId: string,
  companyId: string,
  rowNumber: number,
  entity: string,
  status: string,
  message: string,
  raw: any,
) {
  try {
    await admin.from("import_logs").insert({
      import_job_id: jobId,
      company_id: companyId,
      row_number: rowNumber,
      entity_type: entity,
      status,
      message,
      raw_data: raw,
    });
  } catch {
    /* ignore log failures */
  }
}
