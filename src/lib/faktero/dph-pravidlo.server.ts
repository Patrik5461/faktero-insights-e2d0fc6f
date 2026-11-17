/**
 * Serverová kontrola DPH pred zápisom prijatej faktúry alebo bločku —
 * pravidlo z `dph-pravidlo.ts` s krajinou firmy z databázy. Databáza má to
 * isté pravidlo ako spúšťač; táto kontrola tu je, aby chyba prišla skôr
 * (pred nahratím súboru) a s jasnou vetou.
 */
import { popisChybDph, skontrolujDphDokladu, type ChybaDph, type TabulkaDph } from "./dph-pravidlo";
import { bezKontrolyRozpisuDph, prijataVPreneseni } from "./neplatitel-dph";
import { firmaPreDph } from "./neplatitel-dph.server";
import { jeNeplatitel } from "./uctovanie-agenda";

/** Krajina firmy (`companies.country`); bez nej null (= SK). */
export async function krajinaFirmyPreDph(db: any, companyId: string): Promise<string | null> {
  const { data } = await db.from("companies").select("country").eq("id", companyId).maybeSingle();
  return (data?.country as string | null | undefined) ?? null;
}

/**
 * Chyby DPH zapisovaného riadku; [] = smie sa zapísať. Neplatiteľa DPH
 * (bez prenesenia) sadzby nezastavia — DPH si neodpočíta, celá suma je
 * náklad (`neplatitel-dph.ts`, spúšťač v databáze to isté).
 */
export async function overDphZapisu(
  db: any,
  companyId: string,
  tabulka: TabulkaDph,
  zmena: Record<string, unknown>,
  stary?: Record<string, unknown> | null,
): Promise<ChybaDph[]> {
  const firma = await firmaPreDph(db, companyId);
  const prenesenie = tabulka === "purchase_invoices" && prijataVPreneseni({ ...(stary ?? {}), ...zmena });
  if (bezKontrolyRozpisuDph(jeNeplatitel(firma), prenesenie)) return [];
  return skontrolujDphDokladu(tabulka, zmena, (firma?.country as string | null | undefined) ?? null, stary);
}

/** Ako `overDphZapisu`, ale pri chybe hodí Error s vetou pre človeka. */
export async function strazDphZapisu(
  db: any,
  companyId: string,
  tabulka: TabulkaDph,
  zmena: Record<string, unknown>,
  stary?: Record<string, unknown> | null,
): Promise<void> {
  const chyby = await overDphZapisu(db, companyId, tabulka, zmena, stary);
  if (chyby.length) throw new Error(popisChybDph(chyby));
}
