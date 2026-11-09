import { useEffect, useMemo, useRef } from "react";
import { ListPagination } from "@/components/faktero/ListControls";
import type { ListFilters } from "@/hooks/useListFilters";

/**
 * Stránkovanie zoznamu, ktorý sa načíta celý (súčty, výber všetkých, export
 * a hromadné akcie ďalej pracujú so všetkými riadkami) — kreslí sa len jedna
 * strana. Strana a počet na stranu (10/20/50/100) sú v adrese cez
 * `useListFilters`, počet si zoznam pamätá.
 *
 * Nahrádza postupné dokresľovanie (`usePostupneZobrazenie`) — Patrik 9. 11.:
 * „daj na jednu stranu 10 dokladov s možnosťou navoliť 10, 20, 50, 100“.
 *
 * `reset` je čokoľvek, čo mení obsah zoznamu mimo `useListFilters` (filtre
 * v stave stránky) — vtedy sa zoznam vráti na prvú stranu. `potrebneId` je
 * riadok, ktorý má byť pri návrate z detailu vidieť (naposledy otvorený).
 */
export function useStrankovanie<T extends { id?: unknown }>(
  riadky: T[],
  lf: ListFilters,
  o: { reset?: unknown; potrebneId?: unknown } = {},
) {
  const size = lf.size;
  const pocetStran = Math.max(1, Math.ceil(riadky.length / size));
  const page = Math.min(Math.max(1, lf.page), pocetStran);

  // Zmena filtra v stave stránky → prvá strana (filtre z adresy to robia samé).
  const resetKluc = JSON.stringify(o.reset ?? null);
  const prvyReset = useRef(true);
  useEffect(() => {
    if (prvyReset.current) {
      prvyReset.current = false;
      return;
    }
    if (lf.page > 1) lf.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKluc]);

  // Návrat z detailu: raz po načítaní skočí na stranu s naposledy otvoreným dokladom.
  const skocene = useRef(false);
  useEffect(() => {
    if (skocene.current || o.potrebneId == null || !riadky.length) return;
    skocene.current = true;
    const i = riadky.findIndex((r) => r.id === o.potrebneId);
    if (i < 0) return;
    const ciel = Math.floor(i / size) + 1;
    if (ciel !== page) lf.setPage(ciel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riadky, o.potrebneId]);

  const viditelne = useMemo(
    () => riadky.slice((page - 1) * size, page * size),
    [riadky, page, size],
  );

  /** Pätička so stránkami a výberom počtu na stranu. */
  function stranky() {
    if (!riadky.length) return null;
    return (
      <ListPagination
        page={page}
        pageSize={size}
        total={riadky.length}
        onPageChange={(p) => {
          lf.setPage(p);
          if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onPageSizeChange={lf.setSize}
      />
    );
  }

  return {
    viditelne,
    page,
    pocetStran,
    stranky,
    // Kompatibilita s `usePostupneZobrazenie` — pri stránkovaní niet čo dokresľovať.
    zostava: 0,
    zarazkaRiadok: (_stlpcov?: number) => null,
    zarazka: () => null,
  };
}
