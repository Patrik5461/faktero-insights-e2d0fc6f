import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useStoredPageSize } from "@/components/faktero/ListControls";

/**
 * Stav zoznamu dokladov v adrese — hľadanie, filtre, zoradenie, strana a počet
 * na stranu. Odkaz sa dá poslať kolegovi a prežije obnovenie stránky.
 *
 * Každá trasa so zoznamom musí tieto kľúče pustiť cez `validateSearch`
 * (`...zoznamSearch(s)`), inak ich smerovač z adresy zahodí.
 */
export type ListSearch = {
  q?: string;
  /** Zoradenie ako `stlpec:asc` / `stlpec:desc`. */
  sort?: string;
  page?: number;
  size?: number;
  /** Filtre stránky — kľúč → hodnota. Rozsah dátumu je `<kluc>_od` a `<kluc>_do`. */
  f?: Record<string, string>;
};

export const VELKOSTI_STRANY = [5, 25, 50, 100] as const;

/** Rozparsovanie kľúčov zoznamu z adresy — rozprestrie sa do `validateSearch` trasy. */
export function zoznamSearch(s: Record<string, unknown>): ListSearch {
  const out: ListSearch = {};
  if (typeof s.q === "string" && s.q.trim()) out.q = s.q;
  if (typeof s.sort === "string" && /^[\w.]+:(asc|desc)$/.test(s.sort)) out.sort = s.sort;
  const page = Number(s.page);
  if (Number.isInteger(page) && page > 1) out.page = page;
  const size = Number(s.size);
  if ((VELKOSTI_STRANY as readonly number[]).includes(size)) out.size = size;
  if (s.f && typeof s.f === "object" && !Array.isArray(s.f)) {
    const f: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.f as Record<string, unknown>)) {
      if (
        /^[\w-]{1,40}$/.test(k) &&
        (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      ) {
        const h = String(v);
        if (h && h.length <= 200) f[k] = h;
      }
    }
    if (Object.keys(f).length) out.f = f;
  }
  return out;
}

export type Zoradenie = { column: string; ascending?: boolean };

export const zoradenieNaKluc = (z: Zoradenie) => `${z.column}:${z.ascending ? "asc" : "desc"}`;
export function klucNaZoradenie(k: string | undefined | null): Zoradenie | null {
  const m = /^([\w.]+):(asc|desc)$/.exec(k ?? "");
  return m ? { column: m[1]!, ascending: m[2] === "asc" } : null;
}

export function useListFilters(
  opts: {
    /** Kľúč pre zapamätaný počet na stranu (ako doteraz v `usePagedList`). */
    pageSizeKey?: string;
    defaultSort?: Zoradenie;
  } = {},
) {
  const search = useSearch({ strict: false }) as ListSearch & Record<string, unknown>;
  const navigate = useNavigate();
  const [ulozenaVelkost, setUlozenaVelkost] = useStoredPageSize(opts.pageSizeKey ?? "zoznam");

  /** Zapíše zmenu do adresy; zmena čohokoľvek okrem strany vráti zoznam na prvú stranu. */
  const zapis = useCallback(
    (zmena: Partial<ListSearch>) => {
      void navigate({
        to: ".",
        replace: true,
        search: (prev: Record<string, unknown>) => {
          const n: Record<string, unknown> = { ...prev, ...zmena };
          if (!("page" in zmena)) delete n.page;
          for (const k of Object.keys(n)) {
            const v = n[k];
            if (
              v === undefined ||
              v === "" ||
              (typeof v === "object" && v && !Object.keys(v).length)
            )
              delete n[k];
          }
          return n;
        },
      } as any);
    },
    [navigate],
  );

  const filters = useMemo(() => search.f ?? {}, [search.f]);
  const sort = klucNaZoradenie(search.sort) ?? opts.defaultSort ?? null;
  const size = search.size ?? ulozenaVelkost;

  const setFilter = useCallback(
    (key: string, value: string | boolean | null | undefined) => {
      const f = { ...filters };
      const h = value === true ? "1" : value === false || value == null ? "" : String(value);
      if (h) f[key] = h;
      else delete f[key];
      zapis({ f });
    },
    [filters, zapis],
  );

  const setFilters = useCallback(
    (zmena: Record<string, string | boolean | null | undefined>) => {
      const f = { ...filters };
      for (const [key, value] of Object.entries(zmena)) {
        const h = value === true ? "1" : value === false || value == null ? "" : String(value);
        if (h) f[key] = h;
        else delete f[key];
      }
      zapis({ f });
    },
    [filters, zapis],
  );

  return {
    q: search.q ?? "",
    setQ: (q: string) => zapis({ q: q || undefined }),
    sort,
    setSort: (z: Zoradenie) => zapis({ sort: zoradenieNaKluc(z) }),
    page: search.page ?? 1,
    setPage: (p: number) => zapis({ page: p > 1 ? p : undefined }),
    size,
    setSize: (n: number) => {
      setUlozenaVelkost(n);
      zapis({ size: n });
    },
    filters,
    filter: (key: string) => filters[key] ?? "",
    zapnute: (key: string) => filters[key] === "1",
    setFilter,
    setFilters,
    clearFilters: () => zapis({ f: undefined }),
    /** Rozsah dátumu filtra typu dateRange. */
    rozsah: (key: string) => ({ od: filters[`${key}_od`] ?? "", do: filters[`${key}_do`] ?? "" }),
  };
}

export type ListFilters = ReturnType<typeof useListFilters>;
