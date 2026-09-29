import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { DruhRadu } from "./ciselne-rady";

type SupabaseKlient = SupabaseClient<Database>;

/**
 * Číslo dokladu z číselného radu.
 *
 * Ponuky, objednávky aj pokladničné doklady si číslo dovtedy skladali samy z
 * predpony zadrôtovanej v kóde (`Q2026`, `OBJ2026`, `PD2026`). Teraz o tvare
 * rozhoduje rad, ktorý si firma nastaví — a keď žiadny nemá, databáza ho pri
 * prvom doklade založí presne z pôvodnej predpony, takže sa nič neprečísluje.
 *
 * Beží cez klienta prihláseného používateľa: cudziu firmu odfiltruje RLS a
 * funkcia si členstvo overuje sama.
 */
export async function cisloZRadu(
  /*
    Klient prihláseného používateľa. Typ je voľný zámerne — volá sa to z
    miest, kde je klient už pretypovaný na `any`, a presný typ RPC funkcií
    generovaný Supabase tu nič nestráži (názov funkcie je náš).
  */
  supabase: SupabaseKlient,
  companyId: string,
  druh: DruhRadu,
  volby: { seriesId?: string | null; datum?: string | null } = {},
): Promise<{ cislo: string; seriesId: string | null }> {
  const { data, error } = await supabase.rpc("faktero_next_series_number", {
    _company_id: companyId,
    _kind: druh,
    _series_id: volby.seriesId ?? null,
    _date: volby.datum ?? null,
  });
  if (error) throw new Error(error.message);
  const row = data as { number?: string; series_id?: string | null } | null;
  if (!row?.number) throw new Error("Nepodarilo sa vygenerovať číslo dokladu.");
  return { cislo: row.number, seriesId: row.series_id ?? null };
}
