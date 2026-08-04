import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useStoredPageSize } from "@/components/faktero/ListControls";

/**
 * Generic read-only paginated query for log/list tables.
 *
 * - Server-side pagination (Supabase `range` + `count: exact`).
 * - Optional case-insensitive OR-search across `searchColumns` (ilike).
 * - Optional equality filters (status, type, provider…).
 * - Optional date range against a single column.
 * - Scopes to the active company unless `companyScoped: false`.
 * - Persists page size in localStorage per `pageSizeKey`.
 *
 * Tables wired here are read-only logs — no soft delete, no selection state.
 */
export type LogFilters = Record<string, string | null | undefined>;

export type PagedLogsOptions = {
  resource: string;
  /** ilike OR-search across these columns. */
  searchColumns?: string[];
  /** Equality filters; null/empty values are ignored. */
  filters?: LogFilters;
  /** Column for the date range filter. Defaults to created_at. */
  dateColumn?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  orderBy?: { column: string; ascending?: boolean };
  pageSizeKey?: string;
  /** Extra column projection. */
  select?: string;
  /** Override company scoping (default true). When the table has no company_id, set false. */
  companyScoped?: boolean;
  /** Optional override for the company column name (default company_id). */
  companyColumn?: string;
  /** Manually scope to an arbitrary equality (e.g. recurring_invoice_id). */
  scope?: { column: string; value: string | null | undefined };
  /** Disable the query (e.g. while a required scope id is unresolved). */
  enabled?: boolean;
};

export function usePagedLogs(opts: PagedLogsOptions) {
  const {
    resource,
    searchColumns = [],
    filters,
    dateColumn = "created_at",
    dateFrom,
    dateTo,
    orderBy,
    pageSizeKey,
    select = "*",
    companyScoped = true,
    companyColumn = "company_id",
    scope,
    enabled = true,
  } = opts;

  const [pageSize, setPageSize] = useStoredPageSize(pageSizeKey ?? resource);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const filterSignature = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(1);
  }, [search, pageSize, filterSignature, dateFrom, dateTo, scope?.value]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setRows([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const cid = companyScoped ? getActiveCompanyId() : null;
      if (companyScoped && !cid) {
        setLoading(false);
        setRows([]);
        setTotal(0);
        return;
      }
      if (scope && !scope.value) {
        setLoading(false);
        setRows([]);
        setTotal(0);
        return;
      }
      setLoading(true);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = supabase.from(resource as any).select(select, { count: "exact" });
      if (companyScoped && cid) q = q.eq(companyColumn, cid);
      if (scope?.value) q = q.eq(scope.column, scope.value);
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if (v == null || v === "" || v === "all") continue;
          q = q.eq(k, v);
        }
      }
      if (dateFrom) q = q.gte(dateColumn, dateFrom);
      if (dateTo) {
        // inclusive end-of-day
        const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateTo);
        q = q.lte(dateColumn, isDateOnly ? `${dateTo}T23:59:59` : dateTo);
      }
      const term = search.trim().replace(/[%_,()]/g, "");
      if (term && searchColumns.length) {
        q = q.or(searchColumns.map((c) => `${c}.ilike.%${term}%`).join(","));
      }
      const ord = orderBy ?? { column: "created_at", ascending: false };
      q = q.order(ord.column, { ascending: !!ord.ascending });
      q = q.range(from, to);
      const { data, error, count } = await q;
      if (cancelled) return;
      if (error) {
        // Don't spam console with expected RLS / empty company scenarios.
        console.warn(`[usePagedLogs:${resource}]`, error.message);
        setRows([]);
        setTotal(0);
      } else {
        setRows((data as any[]) ?? []);
        setTotal(count ?? 0);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    resource,
    select,
    page,
    pageSize,
    search,
    filterSignature,
    dateFrom,
    dateTo,
    dateColumn,
    orderBy?.column,
    orderBy?.ascending,
    searchColumns.join(","),
    companyScoped,
    companyColumn,
    scope?.column,
    scope?.value,
    nonce,
  ]);

  const reload = () => setNonce((n) => n + 1);

  return {
    rows,
    total,
    loading,
    page,
    setPage,
    pageSize,
    setPageSize,
    search,
    setSearch,
    reload,
  };
}
