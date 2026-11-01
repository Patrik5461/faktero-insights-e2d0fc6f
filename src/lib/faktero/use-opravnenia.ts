/*
  Oprávnenia prihláseného človeka v aktívnej firme — pre tlačidlá v UI.

  Databáza zápis stráži sama (`firmy_s_pravom`, `is_company_admin`); tu ide
  len o to, aby UI neukazovalo tlačidlá, ktoré by skončili chybou alebo —
  horšie — tichým „uložené“ bez zmeny (pozri `overZapis`).

  Rola sa číta z vlastného riadku `company_users` (vždy s `user_id`, inak RLS
  vráti riadky kolegov) a drží sa v pamäti na firmu. Po `oznamZmenuFiriem()`
  sa načíta znova.
*/
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FIRMY_ZMENENE, getActiveCompanyId } from "./active-company";
import { jeAdminRola, mozeUpravovat, type Oblast } from "./opravnenia";

export type Clenstvo = { rola: string | null; opravnenia: Record<string, string> };

const NIC: Clenstvo = { rola: null, opravnenia: {} };
const pamat = new Map<string, Promise<Clenstvo>>();

/** Rola a oprávnenia prihláseného v danej firme (`rola: null` = nie je člen / nie je prihlásený). */
export function nacitajClenstvo(companyId: string): Promise<Clenstvo> {
  const hotove = pamat.get(companyId);
  if (hotove) return hotove;
  const p = (async () => {
    const { data: auth } = await supabase.auth.getSession();
    const uid = auth.session?.user?.id;
    if (!uid) return NIC;
    const { data, error } = await supabase
      .from("company_users")
      .select("role, permissions")
      .eq("company_id", companyId)
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NIC;
    return {
      rola: (data as any).role ?? null,
      opravnenia: ((data as any).permissions ?? {}) as Record<string, string>,
    };
  })();
  pamat.set(companyId, p);
  // Chyba sa nedrží — ďalší pokus sa opýta znova.
  p.catch(() => pamat.delete(companyId));
  return p;
}

/** Zahodí zapamätané členstvá (po zmene roly, odhlásení…). */
export function zabudniClenstvo(companyId?: string) {
  if (companyId) pamat.delete(companyId);
  else pamat.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener(FIRMY_ZMENENE, () => zabudniClenstvo());
}

/** Členstvo v aktívnej firme; `nacitane: false`, kým neprišla odpoveď. */
export function useClenstvoFirmy(): Clenstvo & { nacitane: boolean } {
  const firma = getActiveCompanyId();
  const [stav, setStav] = useState<Clenstvo & { nacitane: boolean; firma: string | null }>({
    ...NIC,
    nacitane: false,
    firma: null,
  });

  useEffect(() => {
    if (!firma) return;
    let zrusene = false;
    const nacitaj = () =>
      nacitajClenstvo(firma)
        .then((c) => !zrusene && setStav({ ...c, nacitane: true, firma }))
        .catch(() => !zrusene && setStav({ ...NIC, nacitane: true, firma }));
    nacitaj();
    window.addEventListener(FIRMY_ZMENENE, nacitaj);
    return () => {
      zrusene = true;
      window.removeEventListener(FIRMY_ZMENENE, nacitaj);
    };
  }, [firma]);

  // Stav z inej firmy (po prepnutí) neplatí.
  if (stav.firma !== firma) return { ...NIC, nacitane: false };
  return { rola: stav.rola, opravnenia: stav.opravnenia, nacitane: stav.nacitane };
}

/**
 * Smie človek v oblasti zakladať/upravovať/mazať? Kým sa rola nenačíta,
 * vráti `false` (tlačidlá sa ukážu až po načítaní, nie naopak).
 */
export function useMozeUpravovat(oblast: Oblast): boolean {
  const c = useClenstvoFirmy();
  return c.nacitane && mozeUpravovat(c.rola, c.opravnenia, oblast);
}

/** Majiteľ alebo administrátor aktívnej firmy (bankové účty, platby, API, používatelia). */
export function useJeAdminFirmy(): boolean {
  const c = useClenstvoFirmy();
  return c.nacitane && jeAdminRola(c.rola);
}
