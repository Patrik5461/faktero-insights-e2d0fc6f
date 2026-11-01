import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useStoredPageSize } from "@/components/faktero/ListControls";
import type { ListFilters } from "@/hooks/useListFilters";
import { obnovZKosa } from "@/lib/faktero/obnova-z-kosa";

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
  /** Pole hodnôt = ktorákoľvek z nich (`in`). */
  equals?: Record<string, string | number | boolean | null | string[]>;
  /**
   * Ďalšie podmienky dotazu (obdobie, len neexportované…). Dotaz sa
   * prepočíta, keď sa zmení `filterKey` — funkcia sama sa porovnávať nedá.
   */
  upravDotaz?: (q: any) => any;
  filterKey?: string;
  /**
   * Stav z adresy (`useListFilters`) — strana, počet na stranu, hľadanie
   * a zoradenie sa potom neriadia vnútorným stavom, ale adresou.
   */
  riadenie?: ListFilters;
  /**
   * Stĺpce pre `select` — predvolene všetky. Zoznam, ktorý číta len časť,
   * si tu povie, čo potrebuje (menšia stránka, rýchlejšie spracovanie).
   */
  stlpce?: string;
};

/** Zapamätané zoradenie zoznamu — nech si to klient nemusí prestavovať zakaždým. */
function nacitajZoradenie(kluc: string | undefined, vychodzie: Zoradenie): Zoradenie {
  if (!kluc || typeof window === "undefined") return vychodzie;
  try {
    const ulozene = window.localStorage.getItem(`faktero.sort.${kluc}`);
    if (!ulozene) return vychodzie;
    const p = JSON.parse(ulozene);
    return typeof p?.column === "string"
      ? { column: p.column, ascending: !!p.ascending }
      : vychodzie;
  } catch {
    return vychodzie;
  }
}

/** ID vybraných riadkov, ktoré sú v `rows` (v poradí zoznamu). */
export function vybraneZRiadkov(
  rows: { id: string }[],
  selected: Record<string, boolean>,
): string[] {
  return rows.filter((r) => selected[r.id]).map((r) => r.id);
}

export function usePagedList({
  resource,
  searchColumns = [],
  orderBy,
  sortKey,
  pageSizeKey,
  equals,
  upravDotaz,
  filterKey,
  riadenie,
  stlpce = "*",
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

  // Riadené adresou: hodnoty a nastavovače idú z `useListFilters`.
  const r = riadenie;
  const pageV = r ? r.page : page;
  const setPageV = r ? r.setPage : setPage;
  const pageSizeV = r ? r.size : pageSize;
  const setPageSizeV = r ? r.setSize : setPageSize;
  const searchV = r ? r.q : search;
  const setSearchV = r ? r.setQ : setSearch;
  const sortV = r ? (r.sort ?? vychodzieZoradenie) : sort;
  const setSortV = r ? r.setSort : setSort;

  // Reset to page 1 when filters change
  // Riadený zoznam vracia na prvú stranu sám `useListFilters` — tu by pri
  // načítaní stránky zahodil stranu z adresy.
  useEffect(() => {
    if (!r) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, showDeleted, pageSize, filterKey]);
  // Clear selection when page / filter / deleted toggle changes
  useEffect(() => {
    setSelected({});
  }, [pageV, pageSizeV, searchV, showDeleted, nonce, filterKey]);

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
      const from = (pageV - 1) * pageSizeV;
      const to = from + pageSizeV - 1;
      let q = supabase
        .from(resource as any)
        .select(stlpce, { count: "exact" })
        .eq("company_id", cid);
      if (equals) {
        for (const [k, v] of Object.entries(equals)) {
          q = v === null ? q.is(k, null) : Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
        }
      }
      q = showDeleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
      if (upravDotaz) q = upravDotaz(q);
      if (searchV.trim() && searchColumns.length) {
        const term = searchV.trim().replace(/[%_,]/g, "");
        q = q.or(searchColumns.map((c) => `${c}.ilike.%${term}%`).join(","));
      }
      // Prázdne hodnoty (napr. faktúra bez dátumu dodania) vždy na koniec.
      q = q.order(sortV.column, { ascending: !!sortV.ascending, nullsFirst: false });
      // Druhé kritérium drží poradie stabilné, keď má viac dokladov rovnaký
      // dátum — pri importe majú všetky rovnaký `created_at` až na mikrosekundy.
      if (sortV.column !== "created_at") q = q.order("created_at", { ascending: false });
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
    stlpce,
    pageV,
    pageSizeV,
    searchV,
    showDeleted,
    nonce,
    sortV.column,
    sortV.ascending,
    searchColumns.join(","),
    JSON.stringify(equals ?? {}),
    filterKey,
  ]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  /*
    Vybrané sú len riadky, ktoré sú práve v zozname. Hromadná akcia nesmie
    zasiahnuť doklad, ktorý človek nevidí — po prenačítaní so zmeneným
    filtrom by inak v `selected` ostali skryté ID.
  */
  const selectedIds = useMemo(() => vybraneZRiadkov(rows, selected), [rows, selected]);
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected[r.id]);

  function toggleSelect(id: string, on?: boolean) {
    setSelected((prev) => ({ ...prev, [id]: on ?? !prev[id] }));
  }
  /** „Vybrať všetko“ — zobrazené riadky stránky; `ids` obmedzí výber na tie, ktoré zoznam naozaj kreslí. */
  function toggleAllOnPage(on: boolean, ids?: string[]) {
    if (on) {
      const viditelne = ids ?? rows.map((r) => r.id as string);
      setSelected(Object.fromEntries(viditelne.map((id) => [id, true])));
    } else setSelected({});
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
    await obnovZKosa(resource, ids, cid);
    reload();
  }

  return {
    rows,
    total,
    loading,
    page: pageV,
    setPage: setPageV,
    pageSize: pageSizeV,
    setPageSize: setPageSizeV,
    search: searchV,
    setSearch: setSearchV,
    sort: sortV,
    setSort: setSortV,
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
