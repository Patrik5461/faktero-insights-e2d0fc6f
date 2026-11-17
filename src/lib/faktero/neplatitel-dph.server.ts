/**
 * Je firma neplatiteľ DPH? Načíta režim firmy z databázy a rozhodne
 * `jeNeplatitel` (podľa `vat_scheme`) — pozri `neplatitel-dph.ts`.
 */
import type { FirmaDph } from "./dph-rezim";
import { STLPCE_REZIMU_DPH } from "./neplatitel-dph";
import { jeNeplatitel } from "./uctovanie-agenda";

/** Riadok firmy pre rozhodnutie o DPH (krajina + režim); bez firmy null. */
export async function firmaPreDph(
  db: any,
  companyId: string | null | undefined,
): Promise<FirmaDph | null> {
  if (!companyId) return null;
  const { data } = await db.from("companies").select(STLPCE_REZIMU_DPH).eq("id", companyId).maybeSingle();
  return (data as FirmaDph | null) ?? null;
}

/** Firma je neplatiteľ DPH — prijatý doklad bez odpočtu a bez kontroly rozpisu. */
export async function firmaJeNeplatitel(db: any, companyId: string | null | undefined): Promise<boolean> {
  return jeNeplatitel(await firmaPreDph(db, companyId));
}
