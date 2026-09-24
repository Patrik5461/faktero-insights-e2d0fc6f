import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "./active-company";
import { krajinaDane, type KrajinaDane } from "./vat-rates";
import { rezimFirmy, type RezimDph } from "./dph-rezim";
import { citaj, zapis } from "@/lib/mobile/trvale-ulozisko";

/**
 * Daňový režim aktívnej firmy — krajina sadzieb a postavenie k DPH.
 *
 * Potrebuje ho takmer každý formulár s položkami, ale načítavať kvôli dvom
 * poliam celú firmu na každej obrazovke by bol dotaz navyše pri každom
 * prekliku. Preto je odpoveď v pamäti a zároveň v úložisku: po obnovení
 * stránky sa tak česká firma nezobrazí na okamih so slovenskými sadzbami a
 * neplatiteľ na okamih s DPH.
 *
 * Predvolené SK nie je odhad — do zavedenia voľby krajiny bola jediná možnosť
 * a existujúce firmy nemajú v `country` nič iné.
 */

const KLUC = "faktero.krajina-dane";
const KLUC_REZIM = "faktero.rezim-dph";
const pamat = new Map<string, RezimDph>();
const bezi = new Map<string, Promise<RezimDph>>();

/*
  Kým sa firma načíta, počíta sa s platiteľom. Opačné predvolenie by na okamih
  skrylo DPH a človek by stihol vystaviť faktúru bez dane — chýbajúca daň je
  drahšia chyba než daň navyše, ktorú vidno hneď.
*/
const PREDVOLENY: RezimDph = rezimFirmy({ country: "SK", vat_payer: true, vat_scheme: "sk_4" });

function zUloziska(companyId: string): RezimDph | null {
  try {
    const s = citaj(`${KLUC_REZIM}.${companyId}`);
    if (!s) return null;
    const o = JSON.parse(s);
    return o && typeof o.schema === "string" ? (o as RezimDph) : null;
  } catch {
    return null;
  }
}

function uloz(companyId: string, r: RezimDph): void {
  try {
    zapis(`${KLUC_REZIM}.${companyId}`, JSON.stringify(r));
    // Kvôli staršej verzii appky, ktorá číta ešte len krajinu.
    zapis(`${KLUC}.${companyId}`, r.krajina);
  } catch {
    /* bez úložiska sa len načíta znova */
  }
}

export async function nacitajRezimDph(companyId: string): Promise<RezimDph> {
  const vpamati = pamat.get(companyId);
  if (vpamati) return vpamati;
  const prebiehajuci = bezi.get(companyId);
  if (prebiehajuci) return prebiehajuci;

  const p = (async () => {
    const { data } = await supabase
      .from("companies")
      .select("country, ic_dph, vat_payer, vat_scheme")
      .eq("id", companyId)
      .maybeSingle();
    const r = rezimFirmy(data ?? { country: null });
    pamat.set(companyId, r);
    uloz(companyId, r);
    return r;
  })();
  bezi.set(companyId, p);
  try {
    return await p;
  } finally {
    bezi.delete(companyId);
  }
}

export async function nacitajKrajinuDane(companyId: string): Promise<KrajinaDane> {
  return (await nacitajRezimDph(companyId)).krajina;
}

/** Zabudne zapamätaný režim — po zmene údajov firmy. */
export function zabudniRezimDph(companyId: string): void {
  pamat.delete(companyId);
  try {
    zapis(`${KLUC_REZIM}.${companyId}`, "");
    zapis(`${KLUC}.${companyId}`, "");
  } catch {
    /* nič */
  }
}

/** Ponechané pod pôvodným menom — volá sa po uložení firmy na viacerých miestach. */
export function zabudniKrajinuDane(companyId: string): void {
  zabudniRezimDph(companyId);
}

export function useRezimDph(): RezimDph {
  const [rezim, setRezim] = useState<RezimDph>(PREDVOLENY);

  useEffect(() => {
    const id = getActiveCompanyId();
    if (!id) return;
    const hned = pamat.get(id) ?? zUloziska(id);
    if (hned) {
      pamat.set(id, hned);
      setRezim(hned);
    }
    let zrusene = false;
    nacitajRezimDph(id)
      .then((r) => !zrusene && setRezim(r))
      .catch(() => {});
    return () => {
      zrusene = true;
    };
  }, []);

  return rezim;
}

export function useKrajinaDane(): KrajinaDane {
  return useRezimDph().krajina;
}

export { krajinaDane };
