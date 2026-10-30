/**
 * Názov skladu, ktorý Faktero firme založí samo pri prvom pohybe.
 *
 * Česká firma dostávala „Hlavný sklad“ po slovensky, hoci jej rozhranie
 * hlásilo „Vytvořen sklad 'Hlavní sklad'“ (test 30. 10. 2026). Na serveri sa
 * jazyk berie z krajiny firmy, v prehliadači z jazyka rozhrania.
 */
const NAZVY: Record<string, string> = {
  sk: "Hlavný sklad",
  cs: "Hlavní sklad",
  de: "Hauptlager",
};

const JAZYK_KRAJINY: Record<string, string> = { SK: "sk", CZ: "cs", DE: "de", AT: "de" };

/** `kod` je jazyk (sk/cs/de) alebo krajina firmy (SK/CZ/DE/AT). */
export function nazovHlavnehoSkladu(kod?: string | null): string {
  const k = String(kod ?? "").trim();
  const jazyk = JAZYK_KRAJINY[k.toUpperCase()] ?? k.toLowerCase();
  return NAZVY[jazyk] ?? NAZVY.sk;
}

/** Názov podľa krajiny firmy — pre zakladanie skladu na serveri. */
export async function nazovHlavnehoSkladuFirmy(supabase: any, companyId: string): Promise<string> {
  const { data } = await supabase
    .from("companies")
    .select("country")
    .eq("id", companyId)
    .maybeSingle();
  return nazovHlavnehoSkladu(data?.country ?? null);
}
