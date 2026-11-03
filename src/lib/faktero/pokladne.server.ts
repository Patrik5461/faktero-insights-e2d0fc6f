/**
 * Pokladne firmy pre export — skratky a meny podľa `pokladna_id` dokladu.
 * Číta sa tým klientom, ktorým volajúci číta aj doklady (RLS alebo servisný
 * kľúč po overení prístupu); filter na firmu je vždy výslovný.
 */
import { nastaveniaPokladni, type NastaveniaPokladni, type Pokladna } from "./pokladne";

export async function nacitajPokladne(supabase: any, companyId: string): Promise<Pokladna[]> {
  if (!companyId) return [];
  const { data, error } = await supabase
    .from("pokladne")
    .select("id, nazov, mena, kod_pohoda, predvolena, aktivna, poradie")
    .eq("company_id", companyId);
  // Bez tabuľky (stará DB) alebo bez práva sa export správa ako doteraz.
  if (error) return [];
  return (data ?? []) as Pokladna[];
}

export async function nastaveniaPokladniFirmy(
  supabase: any,
  companyId: string,
  skratkaFirmy?: string | null,
): Promise<NastaveniaPokladni> {
  return nastaveniaPokladni(await nacitajPokladne(supabase, companyId), skratkaFirmy);
}
