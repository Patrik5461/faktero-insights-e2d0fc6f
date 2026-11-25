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
  | {
      status: "ok";
      provider: "finstat";
      data: NormalizedCompany;
      raw: unknown;
      cached: boolean;
      /**
       * To isté IČO má firma aj v druhej krajine (SK aj CZ čísla sa prekrývajú —
       * 45274649 je na Slovensku ABC - servis, v Česku ČEZ). Bez určenej krajiny
       * sa vráti slovenská a táto ako druhá možnosť na výber.
       */
      alternativa?: NormalizedCompany;
    }
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

async function readCache(ico: string, region: "sk" | "cz"): Promise<MemoEntry | null> {
  const now = Date.now();
  const kluc = `${region}:${ico}`;
  const hit = memo.get(kluc);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit;

  try {
    const { data, error } = await supabaseAdmin
      .from("company_cache")
      .select("ico, region, status, data, raw, fetched_at")
      .eq("ico", ico)
      .eq("region", region)
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
    memo.set(kluc, entry);
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
  memo.set(`${region}:${ico}`, entry);
  try {
    await supabaseAdmin.from("company_cache").upsert(
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
  const ico = String(icoInput ?? "")
    .replace(/\s+/g, "")
    .trim();
  if (!ico) return;
  const padded = ico.padStart(8, "0");
  for (const r of ["sk", "cz"]) {
    memo.delete(`${r}:${ico}`);
    memo.delete(`${r}:${padded}`);
  }
  try {
    await supabaseAdmin.from("company_cache").delete().in("ico", [ico, padded]);
  } catch (e) {
    console.warn("[company-cache] clear failed", e);
  }
}

/**
 * Česká firma: FinStat CZ nedáva DIČ ani platiteľstvo DPH a krajinu vracia
 * slovom. ARES (verejný register, bez kľúča) to vie — údaje sa ním doplnia,
 * a keď FinStat firmu nepozná, zostaví sa celá z ARES. Slovenské firmy idú
 * ďalej len cez FinStat.
 */
export async function lookupCompany(
  icoInput: string,
  krajina?: "SK" | "CZ" | null,
): Promise<RegistryLookupResult> {
  const r = await lookupCompanyBezRezimu(icoInput, krajina);
  return sRezimomDph(r);
}

/** Na odpoveď registra sa nečaká dlhšie — formulár sa vyplní aj bez režimu DPH. */
const CAKANIE_NA_REZIM_MS = 8000;

/**
 * Doplní režim DPH (paragraf registrácie) z registra FS SR alebo z Registra
 * plátců DPH. FinStat a ARES povedia len IČ DPH, z ktorého sa platiteľstvo
 * odvodiť nedá (§ 7, § 7a, identifikovaná osoba). Výpadok registra lookup
 * nezhodí — režim potom ostane prázdny a vyberie ho človek.
 */
async function sRezimomDph(r: RegistryLookupResult): Promise<RegistryLookupResult> {
  if (r.status !== "ok") return r;
  try {
    const { overVRegistri } = await import("./platitel-dph.server");
    const krajina = /^(CZ|ČESK|CESK|CZECH)/i.test(String(r.data.country ?? "")) ? "CZ" : "SK";
    const v = await Promise.race([
      overVRegistri({
        country: krajina,
        ico: r.data.ico,
        dic: r.data.dic,
        ic_dph: r.data.ic_dph,
      }),
      new Promise<null>((res) => setTimeout(() => res(null), CAKANIE_NA_REZIM_MS)),
    ]);
    if (!v || v.stav === "chyba" || !v.schema) return r;
    return {
      ...r,
      data: {
        ...r.data,
        vatScheme: v.schema,
        ic_dph: r.data.ic_dph || v.icDph,
        vatStatus: v.stav === "platitel" ? "Áno" : r.data.vatStatus,
      },
    };
  } catch (e) {
    console.warn("[company-registry] režim DPH:", String((e as Error)?.message ?? e));
    return r;
  }
}

/**
 * Firma podľa IČO (25. 11.: české firmy sa načítavali zle — slovenské a české
 * IČO sa prekrývajú a Slovensko sa skúšalo prvé, takže 45274649 dalo
 * slovenskú ABC - servis namiesto ČEZ).
 *
 * Pýtajú sa obe krajiny naraz: Slovensko cez FinStat SK, Česko cez ARES
 * (FinStat CZ len keď ARES firmu nepozná). Keď firma existuje v oboch, vráti
 * sa tá z preferovanej krajiny (krajina vo formulári, predvolene SK) a druhá
 * ide do `alternativa` — formulár ju ponúkne jedným klikom.
 */
async function lookupCompanyBezRezimu(
  icoInput: string,
  krajina?: "SK" | "CZ" | null,
): Promise<RegistryLookupResult> {
  const [sk, cz] = await Promise.all([lookupCompanyFinstat(icoInput, "sk"), lookupCz(icoInput)]);
  const [hlavna, druha] = krajina === "CZ" ? [cz, sk] : [sk, cz];
  if (hlavna.status === "ok" && druha.status === "ok") return { ...hlavna, alternativa: druha.data };
  if (hlavna.status === "ok") return hlavna;
  if (druha.status === "ok") return druha;
  return hlavna.status === "error" && druha.status !== "error" ? druha : hlavna;
}

/**
 * Česká firma: najprv ARES (oficiálny register, zadarmo — názov, sídlo, DIČ,
 * platiteľ DPH). FinStat CZ (platený) sa pýta len vtedy, keď ARES firmu
 * nepozná alebo neodpovedá.
 */
async function lookupCz(icoInput: string): Promise<RegistryLookupResult> {
  const ico = (icoInput ?? "").replace(/\s+/g, "").trim();
  if (/^\d{6,8}$/.test(ico)) {
    const { firmaZAres } = await import("./ares.server");
    const ares = await firmaZAres(ico.padStart(8, "0"));
    if (ares?.nazov) {
      const dic = ares.dic
        ? ares.dic.toUpperCase().startsWith("CZ")
          ? ares.dic.toUpperCase()
          : `CZ${ares.dic}`
        : null;
      return {
        status: "ok",
        provider: "finstat",
        cached: false,
        raw: { zdroj: "ares" },
        data: {
          ico: ico.padStart(8, "0"),
          name: ares.nazov,
          dic,
          ic_dph: ares.platitelDph && dic ? dic : null,
          vatStatus: ares.platitelDph ? "Áno" : "Nie",
          country: "CZ",
          street: ares.ulica ?? null,
          city: ares.mesto ?? null,
          zip: ares.psc ?? null,
          legalForm: null,
          registrationNumber: null,
          registrationDate: null,
          financials: null as any,
          riskIndicators: null,
          statutoryRepresentatives: [],
        } as NormalizedCompany,
      };
    }
  }
  const fin = await lookupCompanyFinstat(icoInput, "cz");
  if (fin.status === "ok") return { ...fin, data: { ...fin.data, country: "CZ" } };
  return fin;
}

async function lookupCompanyFinstat(icoInput: string, region: "sk" | "cz"): Promise<RegistryLookupResult> {
  const ico = (icoInput ?? "").replace(/\s+/g, "").trim();
  if (!/^\d{6,8}$/.test(ico)) {
    return {
      status: "error",
      provider: "finstat",
      message: "invalid_ico",
      raw: null,
      cached: false,
    };
  }
  const padded = ico.padStart(8, "0");

  if (!isFinstatConfigured()) {
    return {
      status: "error",
      provider: "finstat",
      message: "FinStat API nie je nakonfigurované.",
      raw: null,
      cached: false,
    };
  }

  const hit = await readCache(padded, region);
  if (hit) {
    if (hit.status === "ok" && hit.data) {
      return { status: "ok", provider: "finstat", data: hit.data, raw: hit.raw, cached: true };
    }
    if (hit.status === "not_found") {
      return { status: "not_found", provider: "finstat", raw: hit.raw, cached: true };
    }
  }

  const value = await finstatLookup(padded, region);

  if (value.status === "ok") {
    await writeCache(padded, region, "ok", value.data, value.raw);
    return { status: "ok", provider: "finstat", data: value.data, raw: value.raw, cached: false };
  }
  if (value.status === "not_found") {
    await writeCache(padded, region, "not_found", null, value.raw);
    return { status: "not_found", provider: "finstat", raw: value.raw, cached: false };
  }
  return {
    status: "error",
    provider: "finstat",
    message: value.message,
    raw: value.raw,
    cached: false,
  };
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
  const [sk, cz, ares] = await Promise.all([
    finstatAutocomplete(q, "sk"),
    finstatAutocomplete(q, "cz"),
    hladajVAres(q),
  ]);
  if (sk.status !== "ok" && cz.status !== "ok" && !ares.length) {
    return {
      status: "error",
      provider: "finstat",
      message: sk.status === "error" ? sk.message : cz.status === "error" ? cz.message : "error",
    };
  }
  // Kľúč je krajina + IČO — to isté číslo môže byť na Slovensku aj v Česku iná firma.
  const merged: FinstatSuggestion[] = [];
  const seen = new Set<string>();
  const pridaj = (r: FinstatSuggestion, krajina: "SK" | "CZ") => {
    const k = `${krajina}:${r.ico}`;
    if (r.ico && !seen.has(k)) {
      seen.add(k);
      merged.push({ ...r, krajina });
    }
  };
  // Slovenské a české návrhy sa striedajú — inak by desať slovenských
  // „Cez…“ vytlačilo ČEZ z Česka. V českých ide ARES (oficiálny register) pred FinStat CZ.
  const skL = sk.status === "ok" ? sk.data : [];
  const czL = [...ares, ...(cz.status === "ok" ? cz.data : [])];
  for (let i = 0; i < Math.max(skL.length, czL.length); i++) {
    if (skL[i]) pridaj(skL[i], "SK");
    if (czL[i]) pridaj(czL[i], "CZ");
  }
  const data = merged.slice(0, 10);
  nameCache.set(key, { at: Date.now(), value: data });
  return { status: "ok", provider: "finstat", data, cached: false };
}

/** Hľadanie v ARES podľa názvu (celé slová, napr. „alza“). Výpadok nič nezhodí. */
async function hladajVAres(q: string): Promise<FinstatSuggestion[]> {
  try {
    const r = await fetch("https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ obchodniJmeno: q, pocet: 8, start: 0 }),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];
    const d: any = await r.json();
    return (Array.isArray(d?.ekonomickeSubjekty) ? d.ekonomickeSubjekty : [])
      .filter((x: any) => x?.ico && x?.obchodniJmeno)
      .map((x: any) => ({
        ico: String(x.ico).padStart(8, "0"),
        name: String(x.obchodniJmeno),
        address: x?.sidlo?.textovaAdresa ?? null,
        city: x?.sidlo?.nazevObce ?? null,
      }));
  } catch {
    return [];
  }
}

/**
 * Firma z registra bez dotazu na režim DPH (ten čaká až 8 s) — pre doplnenie
 * adresy dodávateľa pri exporte bločkov (`blocek-pohoda.server.ts`).
 */
export function firmaZRegistraBezRezimu(icoInput: string): Promise<RegistryLookupResult> {
  return lookupCompanyBezRezimu(icoInput);
}
