import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useStoredPageSize } from "@/components/faktero/ListControls";

type SoftDeletable =
  | "invoices" | "quotes" | "recurring_invoices" | "customers" | "products";

export type PagedListOptions = {
  resource: SoftDeletable;
  searchColumns?: string[]; // ilike OR search
  orderBy?: { column: string; ascending?: boolean };
  pageSizeKey?: string; // localStorage key suffix
  equals?: Record<string, string | number | boolean | null>;
};

export function usePagedList({ resource, searchColumns = [], orderBy, pageSizeKey, equals }: PagedListOptions) {
  const [pageSize, setPageSize] = useStoredPageSize(pageSizeKey ?? resource);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [nonce, setNonce] = useState(0);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, showDeleted, pageSize]);
  // Clear selection when page / filter / deleted toggle changes
  useEffect(() => { setSelected({}); }, [page, pageSize, search, showDeleted, nonce]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cid = getActiveCompanyId();
      if (!cid) { setLoading(false); setRows([]); setTotal(0); return; }
      setLoading(true);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from(resource as any)
        .select("*", { count: "exact" })
        .eq("company_id", cid);
      q = showDeleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
      if (search.trim() && searchColumns.length) {
        const term = search.trim().replace(/[%_,]/g, "");
        q = q.or(searchColumns.map((c) => `${c}.ilike.%${term}%`).join(","));
      }
      const ord = orderBy ?? { column: "created_at", ascending: false };
      q = q.order(ord.column, { ascending: !!ord.ascending });
      q = q.range(from, to);
      const { data, error, count } = await q;
      if (cancelled) return;
      if (error) {
        console.error(`[usePagedList:${resource}]`, error);
        setRows([]); setTotal(0);
      } else {
        setRows(data ?? []);
        setTotal(count ?? 0);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [resource, page, pageSize, search, showDeleted, nonce, orderBy?.column, orderBy?.ascending, searchColumns.join(",")]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([k]) => k), [selected]);
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected[r.id]);

  function toggleSelect(id: string, on?: boolean) {
    setSelected((prev) => ({ ...prev, [id]: on ?? !prev[id] }));
  }
  function toggleAllOnPage(on: boolean) {
    if (on) setSelected((prev) => ({ ...prev, ...Object.fromEntries(rows.map((r) => [r.id, true])) }));
    else setSelected({});
  }
  function clearSelection() { setSelected({}); }

  async function softDelete(ids: string[]) {
    if (!ids.length) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    const { error } = await supabase.from(resource as any)
      .update({ deleted_at: new Date().toISOString() } as any)
      .in("id", ids).eq("company_id", cid);
    if (error) throw error;
    reload();
  }
  async function restore(ids: string[]) {
    if (!ids.length) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    const { error } = await supabase.from(resource as any)
      .update({ deleted_at: null } as any)
      .in("id", ids).eq("company_id", cid);
    if (error) throw error;
    reload();
  }

  return {
    rows, total, loading,
    page, setPage, pageSize, setPageSize,
    search, setSearch,
    showDeleted, setShowDeleted,
    selected, selectedIds, allOnPageSelected, toggleSelect, toggleAllOnPage, clearSelection,
    reload, softDelete, restore,
  };
}