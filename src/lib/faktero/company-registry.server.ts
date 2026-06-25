// Single-provider registry: FinStat only. No fallback to ORSR/RPO/mock.
// If FinStat fails, surface the error — never load partial data from elsewhere.

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
  | { status: "ok"; provider: "finstat"; data: NormalizedCompany; raw: any; cached: boolean }
  | { status: "not_found"; provider: "finstat"; raw: any | null; cached: boolean }
  | { status: "error"; provider: "finstat"; message: string; raw: any | null; cached: false };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
type CacheEntry = { at: number; value: Awaited<ReturnType<typeof finstatLookup>> };
const cache = new Map<string, CacheEntry>();

const NAME_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
type NameCacheEntry = { at: number; value: FinstatSuggestion[] };
const nameCache = new Map<string, NameCacheEntry>();

export function isRegistryConfigured(): boolean {
  if (process.env.DISABLE_COMPANY_LOOKUP === "1") return false;
  return isFinstatConfigured();
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

  const hit = cache.get(padded);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    if (hit.value.status === "ok") {
      return { status: "ok", provider: "finstat", data: hit.value.data, raw: hit.value.raw, cached: true };
    }
    if (hit.value.status === "not_found") {
      return { status: "not_found", provider: "finstat", raw: hit.value.raw, cached: true };
    }
  }

  // Try SK first, fall back to CZ when SK doesn't know the company.
  let value = await finstatLookup(padded, "sk");
  if (value.status !== "ok") {
    const cz = await finstatLookup(padded, "cz");
    if (cz.status === "ok") value = cz;
    else if (value.status === "not_found" && cz.status === "not_found") value = cz;
    else if (value.status === "error" && cz.status !== "error") value = cz;
  }
  if (value.status === "ok") {
    cache.set(padded, { at: Date.now(), value });
    return { status: "ok", provider: "finstat", data: value.data, raw: value.raw, cached: false };
  }
  if (value.status === "not_found") {
    cache.set(padded, { at: Date.now(), value });
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
  // Query SK and CZ in parallel, merge results (dedup by ICO, SK first).
  const [sk, cz] = await Promise.all([
    finstatAutocomplete(q, "sk"),
    finstatAutocomplete(q, "cz"),
  ]);
  if (sk.status !== "ok" && cz.status !== "ok") {
    return { status: "error", provider: "finstat", message: sk.status === "error" ? sk.message : (cz as any).message };
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