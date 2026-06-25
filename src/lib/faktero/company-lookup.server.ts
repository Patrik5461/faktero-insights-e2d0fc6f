// Thin wrapper over the FinStat registry that also writes a row to
// company_lookup_logs for each call (mapped fields + raw response).
import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupCompany, isRegistryConfigured, type NormalizedCompany } from "./company-registry.server";

export type LookupResult =
  | { status: "ok"; data: NormalizedCompany; provider: "finstat"; cached: boolean }
  | { status: "not_found"; provider: "finstat"; cached: boolean }
  | { status: "error"; message: string; provider: "finstat" };

export function isCompanyLookupConfigured(): boolean {
  return isRegistryConfigured();
}

export async function lookupCompanyByIco(
  icoInput: string,
  opts?: { supabase?: SupabaseClient<any>; userId?: string; companyId?: string | null },
): Promise<LookupResult> {
  const started = Date.now();
  const ico = (icoInput ?? "").replace(/\s+/g, "").trim();
  const res = await lookupCompany(ico);
  const duration = Date.now() - started;

  if (opts?.supabase && opts.userId) {
    try {
      const mapped = res.status === "ok" ? res.data : null;
      await opts.supabase.from("company_lookup_logs").insert({
        ico: ico || icoInput || "",
        user_id: opts.userId,
        company_id: opts.companyId ?? null,
        provider: "finstat",
        status: res.status,
        cached: "cached" in res ? !!res.cached : false,
        error_message: res.status === "error" ? res.message : null,
        duration_ms: duration,
        mapped_company_name: mapped?.name ?? null,
        mapped_dic: mapped?.dic ?? null,
        mapped_ic_dph: mapped?.ic_dph ?? null,
        raw_response: res.raw ?? null,
      });
    } catch (e) {
      console.warn("[company-lookup] log insert failed", e);
    }
  }

  if (res.status === "ok") return { status: "ok", data: res.data, provider: "finstat", cached: res.cached };
  if (res.status === "not_found") return { status: "not_found", provider: "finstat", cached: res.cached };
  return { status: "error", message: res.message, provider: "finstat" };
}