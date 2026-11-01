import { supabase } from "@/integrations/supabase/client";
import { overZapis } from "@/lib/faktero/over-zapis";

/** Text, keď číslo zmazaného dokladu medzitým dostal iný doklad. */
export const TEXT_CISLO_OBSADENE =
  "Číslo tohto dokladu už medzitým dostal iný doklad, preto sa nedá obnoviť. Zmeňte najprv číslo na tom novom.";

/**
 * Obnovenie z koša (`deleted_at = null`) — zoznam aj detail zmazanej faktúry
 * idú touto cestou. Odmietnutie cez RLS (0 riadkov) je chyba, nie tichý úspech.
 */
export async function obnovZKosa(
  tabulka: "invoices" | "quotes" | "recurring_invoices" | "customers" | "products",
  ids: string[],
  companyId: string,
): Promise<void> {
  if (!ids.length) return;
  const { data, error } = await supabase
    .from(tabulka as any)
    .update({ deleted_at: null } as any)
    .in("id", ids)
    .eq("company_id", companyId)
    .select("id");
  // Číslo zmazaného dokladu sa medzitým mohlo použiť pre nový — vtedy sa
  // pôvodný obnoviť nedá a hlásenie z databázy by nikomu nič nepovedalo.
  if (error?.code === "23505") throw new Error(TEXT_CISLO_OBSADENE);
  // 0 riadkov = RLS odmietla zápis; vráti `ChybaZapisu` (text cez `textChybyZapisu`).
  overZapis({ data, error });
}
