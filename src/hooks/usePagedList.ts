import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useStoredPageSize } from "@/components/faktero/ListControls";

type SoftDeletable = "invoices" | "quotes" | "recurring_invoices" | "customers" | "products";

export type Zoradenie = { column: string; ascending?: boolean };

export type PagedListOptions = {
  resource: SoftDeletable;
  searchColumns?: string[]; // ilike OR search
  /** Predvolené zoradenie. Používateľ si ho môže prestaviť cez `setSort`. */
  orderBy?: Zoradenie;
  /** Kľúč, pod ktorým sa zapamätá voľba zoradenia. Bez neho sa nepamätá. */
  sortKey?: string;
  pageSizeKey?: string; // localStorage key suffix
  equals?: Record<string, string | number | boolean | null>;
};

/** Zapamätané zoradenie zoznamu — nech si to klient nemusí prestavovať zakaždým. */
function nacitajZoradenie(kluc: string | undefined, vychodzie: Zoradenie): Zoradenie {
  if (!kluc || typeof window === "undefined") return vychodzie;
  try {
    const ulozene = window.localStorage.getItem(`faktero.sort.${kluc}`);
    if (!ulozene) return vychodzie;
    const p = JSON.parse(ulozene);
    return typeof p?.column === "string" ? { column: p.column, ascending: !!p.ascending } : vychodzie;
  } catch {
    return vychodzie;
  }
}

export function usePagedList({
  resource,
  searchColumns = [],
  orderBy,
  sortKey,
  pageSizeKey,
  equals,
}: PagedListOptions) {
  const [pageSize, setPageSize] = useStoredPageSize(pageSizeKey ?? resource);
  const vychodzieZoradenie = orderBy ?? { column: "created_at", ascending: false };
  const [sort, setSortStav] = useState<Zoradenie>(() =>
    nacitajZoradenie(sortKey, vychodzieZoradenie),
  );
  const setSort = useCallback(
    (z: Zoradenie) => {
      setSortStav(z);
      setPage(1);
      if (sortKey && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(`faktero.sort.${sortKey}`, JSON.stringify(z));
        } catch {
          /* súkromný režim prehliadača — voľba sa jednoducho nezapamätá */
        }
      }
    },
    [sortKey],
  );
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [nonce, setNonce] = useState(0);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, showDeleted, pageSize]);
  // Clear selection when page / filter / deleted toggle changes
  useEffect(() => {
    setSelected({});
  }, [page, pageSize, search, showDeleted, nonce]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cid = getActiveCompanyId();
      if (!cid) {
        setLoading(false);
        setRows([]);
        setTotal(0);
        return;
      }
      setLoading(true);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from(resource as any)
        .select("*", { count: "exact" })
        .eq("company_id", cid);
      if (equals) {
        for (const [k, v] of Object.entries(equals)) {
          q = v === null ? q.is(k, null) : q.eq(k, v);
        }
      }
      q = showDeleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
      if (search.trim() && searchColumns.length) {
        const term = search.trim().replace(/[%_,]/g, "");
        q = q.or(searchColumns.map((c) => `${c}.ilike.%${term}%`).join(","));
      }
      q = q.order(sort.column, { ascending: !!sort.ascending });
      // Druhé kritérium drží poradie stabilné, keď má viac dokladov rovnaký
      // dátum — pri importe majú všetky rovnaký `created_at` až na mikrosekundy.
      if (sort.column !== "created_at") q = q.order("created_at", { ascending: false });
      q = q.range(from, to);
      const { data, error, count } = await q;
      if (cancelled) return;
      if (error) {
        console.error(`[usePagedList:${resource}]`, error);
        setRows([]);
        setTotal(0);
      } else {
        setRows(data ?? []);
        setTotal(count ?? 0);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    resource,
    page,
    pageSize,
    search,
    showDeleted,
    nonce,
    sort.column,
    sort.ascending,
    searchColumns.join(","),
    JSON.stringify(equals ?? {}),
  ]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const selectedIds = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, v]) => v)
        .map(([k]) => k),
    [selected],
  );
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected[r.id]);

  function toggleSelect(id: string, on?: boolean) {
    setSelected((prev) => ({ ...prev, [id]: on ?? !prev[id] }));
  }
  function toggleAllOnPage(on: boolean) {
    if (on)
      setSelected((prev) => ({ ...prev, ...Object.fromEntries(rows.map((r) => [r.id, true])) }));
    else setSelected({});
  }
  function clearSelection() {
    setSelected({});
  }

  async function softDelete(ids: string[]) {
    if (!ids.length) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    const { error } = await supabase
      .from(resource as any)
      .update({ deleted_at: new Date().toISOString() } as any)
      .in("id", ids)
      .eq("company_id", cid);
    if (error) throw error;
    reload();
  }
  /**
   * Nenávratné zmazanie z koša. Položky dokladu, upomienky a e-mailové záznamy
   * odídu s ním (cudzie kľúče majú kaskádu), väzby z bankových transakcií a
   * exportov sa uvoľnia.
   */
  async function hardDelete(ids: string[]) {
    if (!ids.length) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    const { error } = await supabase
      .from(resource as any)
      .delete()
      .in("id", ids)
      .eq("company_id", cid)
      // Poistka: natrvalo sa maže len to, čo už je v koši.
      .not("deleted_at", "is", null);
    if (error) throw error;
    reload();
  }

  async function restore(ids: string[]) {
    if (!ids.length) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    const { error } = await supabase
      .from(resource as any)
      .update({ deleted_at: null } as any)
      .in("id", ids)
      .eq("company_id", cid);
    if (error) throw error;
    reload();
  }

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
    sort,
    setSort,
    showDeleted,
    setShowDeleted,
    selected,
    selectedIds,
    allOnPageSelected,
    toggleSelect,
    toggleAllOnPage,
    clearSelection,
    reload,
    softDelete,
    hardDelete,
    restore,
  };
}
