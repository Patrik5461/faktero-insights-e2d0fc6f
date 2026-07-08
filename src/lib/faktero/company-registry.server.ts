// Single-provider registry: FinStat only. No fallback to ORSR/RPO/mock.
// Persistent cache lives in public.company_cache (24h TTL). A small
// in-process memo layer avoids duplicate DB roundtrips inside a single
// worker instance.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  finstatLookup,
  finstatAutocomplete,
  isFinstatConfigured,
  type NormalizedCompany,
  type FinstatSuggestion,
} from "./finstat.server";

export type { NormalizedCompany } from "./finstat.server";
export type { FinstatSuggestion } from "./finstat.server";

export type RegistryLookupResult =
  | { status: "ok"; provider: "finstat"; data: NormalizedCompany; raw: unknown; cached: boolean }
  | { status: "not_found"; provider: "finstat"; raw: unknown | null; cached: boolean }
  | { status: "error"; provider: "finstat"; message: string; raw: unknown | null; cached: false };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type MemoEntry = {
  at: number;
  status: "ok" | "not_found";
  data: NormalizedCompany | null;
  raw: unknown;
};
const memo = new Map<string, MemoEntry>();

const NAME_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
type NameCacheEntry = { at: number; value: FinstatSuggestion[] };
const nameCache = new Map<string, NameCacheEntry>();

export function isRegistryConfigured(): boolean {
  if (process.env.DISABLE_COMPANY_LOOKUP === "1") return false;
  return isFinstatConfigured();
}

type CacheRow = {
  ico: string;
  region: string;
  status: string;
  data: unknown;
  raw: unknown;
  fetched_at: string;
};

async function readCache(ico: string): Promise<MemoEntry | null> {
  const now = Date.now();
  const hit = memo.get(ico);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit;

  try {
    const { data, error } = await supabaseAdmin
      .from("company_cache")
      .select("ico, region, status, data, raw, fetched_at")
      .eq("ico", ico)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as unknown as CacheRow;
    const at = new Date(row.fetched_at).getTime();
    if (!Number.isFinite(at) || now - at >= CACHE_TTL_MS) return null;
    if (row.status !== "ok" && row.status !== "not_found") return null;
    const entry: MemoEntry = {
      at,
      status: row.status,
      data: (row.data as NormalizedCompany | null) ?? null,
      raw: row.raw ?? null,
    };
    memo.set(ico, entry);
    return entry;
  } catch (e) {
    console.warn("[company-cache] read failed", e);
    return null;
  }
}

async function writeCache(
  ico: string,
  region: string,
  status: "ok" | "not_found",
  data: NormalizedCompany | null,
  raw: unknown,
): Promise<void> {
  const entry: MemoEntry = { at: Date.now(), status, data, raw };
  memo.set(ico, entry);
  try {
    await supabaseAdmin
      .from("company_cache")
      .upsert(
        {
          ico,
          region,
          status,
          data: data as unknown as never,
          raw: raw as unknown as never,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "ico,region" },
      );
  } catch (e) {
    console.warn("[company-cache] write failed", e);
  }
}

/** Debug helper: drop cache for a single IČO (memo + DB). */
export async function clearCompanyCache(icoInput: string): Promise<void> {
  const ico = String(icoInput ?? "").replace(/\s+/g, "").trim();
  if (!ico) return;
  const padded = ico.padStart(8, "0");
  memo.delete(ico);
  memo.delete(padded);
  try {
    await supabaseAdmin
      .from("company_cache")
      .delete()
      .in("ico", [ico, padded]);
  } catch (e) {
    console.warn("[company-cache] clear failed", e);
  }
}

export async function lookupCompany(icoInput: string): Promise<RegistryLookupResult> {
  const ico = (icoInput ?? "").replace(/\s+/g, "").trim();
  if (!/^\d{6,8}$/.test(ico)) {
    return { status: "error", provider: "finstat", message: "invalid_ico", raw: null, cached: false };
  }
  const padded = ico.padStart(8, "0");

  if (!isFinstatConfigured()) {
    return { status: "error", provider: "finstat", message: "FinStat API nie je nakonfigurované.", raw: null, cached: false };
  }

  const hit = await readCache(padded);
  if (hit) {
    if (hit.status === "ok" && hit.data) {
      return { status: "ok", provider: "finstat", data: hit.data, raw: hit.raw, cached: true };
    }
    if (hit.status === "not_found") {
      return { status: "not_found", provider: "finstat", raw: hit.raw, cached: true };
    }
  }

  // Try SK first, fall back to CZ.
  let value = await finstatLookup(padded, "sk");
  let region: "sk" | "cz" = "sk";
  if (value.status !== "ok") {
    const cz = await finstatLookup(padded, "cz");
    if (cz.status === "ok") { value = cz; region = "cz"; }
    else if (value.status === "not_found" && cz.status === "not_found") { value = cz; region = "cz"; }
    else if (value.status === "error" && cz.status !== "error") { value = cz; region = "cz"; }
  }

  if (value.status === "ok") {
    await writeCache(padded, region, "ok", value.data, value.raw);
    return { status: "ok", provider: "finstat", data: value.data, raw: value.raw, cached: false };
  }
  if (value.status === "not_found") {
    await writeCache(padded, region, "not_found", null, value.raw);
    return { status: "not_found", provider: "finstat", raw: value.raw, cached: false };
  }
  return { status: "error", provider: "finstat", message: value.message, raw: value.raw, cached: false };
}

export type RegistrySearchResult =
  | { status: "ok"; provider: "finstat"; data: FinstatSuggestion[]; cached: boolean }
  | { status: "error"; provider: "finstat"; message: string };

export async function searchCompaniesByName(queryInput: string): Promise<RegistrySearchResult> {
  const q = (queryInput ?? "").trim();
  if (q.length < 3) return { status: "ok", provider: "finstat", data: [], cached: false };
  if (!isFinstatConfigured()) {
    return { status: "error", provider: "finstat", message: "FinStat API nie je nakonfigurované." };
  }
  const key = q.toLowerCase();
  const hit = nameCache.get(key);
  if (hit && Date.now() - hit.at < NAME_CACHE_TTL_MS) {
    return { status: "ok", provider: "finstat", data: hit.value, cached: true };
  }
  const [sk, cz] = await Promise.all([
    finstatAutocomplete(q, "sk"),
    finstatAutocomplete(q, "cz"),
  ]);
  if (sk.status !== "ok" && cz.status !== "ok") {
    return { status: "error", provider: "finstat", message: sk.status === "error" ? sk.message : cz.message };
  }
  const merged: FinstatSuggestion[] = [];
  const seen = new Set<string>();
  for (const r of (sk.status === "ok" ? sk.data : [])) {
    if (r.ico && !seen.has(r.ico)) { seen.add(r.ico); merged.push(r); }
  }
  for (const r of (cz.status === "ok" ? cz.data : [])) {
    if (r.ico && !seen.has(r.ico)) { seen.add(r.ico); merged.push(r); }
  }
  const data = merged.slice(0, 10);
  nameCache.set(key, { at: Date.now(), value: data });
  return { status: "ok", provider: "finstat", data, cached: false };
}
