import { supabase } from "@/integrations/supabase/client";

/**
 * Cena paliva pre novú jazdu.
 *
 * Bez nej je náklad na dopravu vždy nula — a keďže to pole nikto ručne
 * nevypĺňal, doprava v zákazkách nevychádzala vôbec. Berie sa z posledného
 * tankovania: najprv toho istého vozidla, inak ktoréhokoľvek vo firme.
 */

export type ZaznamTankovania = { price_per_liter?: unknown };

/** Prvá použiteľná cena zo zoznamu zoradeného od najnovšieho. */
export function cenaZoZaznamov(zaznamy: ZaznamTankovania[] | null | undefined): number | null {
  for (const z of zaznamy ?? []) {
    const n = Number(z?.price_per_liter);
    // Nula je v tankovaní rovnako nepoužiteľná ako chýbajúca hodnota: náklad
    // by z nej vyšiel nula a tvárilo by sa to ako vyplnené.
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export async function poslednaCenaPaliva(
  companyId: string,
  vehicleId?: string | null,
): Promise<number | null> {
  if (!companyId) return null;

  if (vehicleId) {
    const { data } = await supabase
      .from("fuel_records")
      .select("price_per_liter")
      .eq("company_id", companyId)
      .eq("vehicle_id", vehicleId)
      .order("fuel_date", { ascending: false })
      .limit(5);
    const cena = cenaZoZaznamov(data);
    if (cena != null) return cena;
  }

  const { data } = await supabase
    .from("fuel_records")
    .select("price_per_liter")
    .eq("company_id", companyId)
    .order("fuel_date", { ascending: false })
    .limit(5);
  return cenaZoZaznamov(data);
}
