import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "./active-company";
import { krajinaDane, type KrajinaDane } from "./vat-rates";
import { citaj, zapis } from "@/lib/mobile/trvale-ulozisko";

/**
 * Krajina dane aktívnej firmy — a teda režim sadzieb DPH.
 *
 * Sadzby potrebuje takmer každý formulár s položkami, ale načítavať kvôli
 * jednému poľu celú firmu na každej obrazovke by bol dotaz navyše pri každom
 * preklikoch. Preto je odpoveď v pamäti a zároveň v úložisku: po obnovení
 * stránky sa tak česká firma nezobrazí na okamih so slovenskými sadzbami.
 *
 * Predvolené SK nie je odhad — do zavedenia tejto voľby bola jediná možnosť a
 * existujúce firmy nemajú v `country` nič iné.
 */

const KLUC = "faktero.krajina-dane";
const pamat = new Map<string, KrajinaDane>();
const bezi = new Map<string, Promise<KrajinaDane>>();

function zUloziska(companyId: string): KrajinaDane | null {
  try {
    const s = citaj(`${KLUC}.${companyId}`);
    return s === "CZ" || s === "SK" ? s : null;
  } catch {
    return null;
  }
}

export async function nacitajKrajinuDane(companyId: string): Promise<KrajinaDane> {
  const vpamati = pamat.get(companyId);
  if (vpamati) return vpamati;
  const prebiehajuci = bezi.get(companyId);
  if (prebiehajuci) return prebiehajuci;

  const p = (async () => {
    const { data } = await supabase
      .from("companies")
      .select("country")
      .eq("id", companyId)
      .maybeSingle();
    const k = krajinaDane(data?.country);
    pamat.set(companyId, k);
    try {
      zapis(`${KLUC}.${companyId}`, k);
    } catch {
      /* bez úložiska sa len načíta znova */
    }
    return k;
  })();
  bezi.set(companyId, p);
  try {
    return await p;
  } finally {
    bezi.delete(companyId);
  }
}

/** Zabudne zapamätanú krajinu — po zmene údajov firmy. */
export function zabudniKrajinuDane(companyId: string): void {
  pamat.delete(companyId);
  try {
    zapis(`${KLUC}.${companyId}`, "");
  } catch {
    /* nič */
  }
}

export function useKrajinaDane(): KrajinaDane {
  const [krajina, setKrajina] = useState<KrajinaDane>("SK");

  useEffect(() => {
    const id = getActiveCompanyId();
    if (!id) return;
    const hned = pamat.get(id) ?? zUloziska(id);
    if (hned) {
      pamat.set(id, hned);
      setKrajina(hned);
    }
    let zrusene = false;
    nacitajKrajinuDane(id)
      .then((k) => !zrusene && setKrajina(k))
      .catch(() => {});
    return () => {
      zrusene = true;
    };
  }, []);

  return krajina;
}
