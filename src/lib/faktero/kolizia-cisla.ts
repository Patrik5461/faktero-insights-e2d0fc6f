/*
  Súbežné vystavenie dvoch faktúr v tom istom rade.

  `faktero_next_invoice_number` vráti prvé voľné číslo, ale faktúru zapisuje
  až ďalší dotaz. Keď si dve vystavenia (dve karty, opakované faktúry z cronu
  a človek, e-shop cez API) vypýtajú číslo naraz, dostanú to isté — a druhé
  vloženie odmietne unikátny index `invoices_cislo_uniq` (overené 30. 10.:
  z piatich súbežných vystavení prešlo jedno). Duplicita teda nevznikne, ale
  vystavenie zlyhá. Riešenie je vypýtať si číslo znova: medzitým je už prvé
  obsadené, takže generátor vráti nasledujúce.
*/

/** Odmietol vloženie unikátny index čísla faktúry? */
export function jeKoliziaCislaFaktury(chyba: unknown): boolean {
  if (!chyba) return false;
  const e = chyba as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${String(e.message ?? chyba)} ${String(e.details ?? "")}`;
  return /invoices_cislo_uniq/.test(text) && (e.code === undefined || e.code === "23505");
}

/**
 * Zavolá `pokus` a keď vloženie narazí na obsadené číslo, skúsi to znova
 * (najviac `pokusov`-krát). `pokus` si číslo zakaždým vypýta nanovo.
 */
export async function sOpakovanimPriKoliziiCisla<T, E extends { message?: string } | null = any>(
  pokus: (poradie: number) => PromiseLike<{ data: T | null; error: E }>,
  pokusov = 5,
): Promise<{ data: T | null; error: E | null }> {
  let posledny: { data: T | null; error: E | null } = { data: null, error: null };
  for (let i = 0; i < pokusov; i++) {
    posledny = await pokus(i);
    if (!jeKoliziaCislaFaktury(posledny.error)) return posledny;
    // Krátky rozptyl, nech sa súperiace vystavenia znova nezrazia v tej istej chvíli.
    if (i < pokusov - 1) await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (i + 1)));
  }
  return posledny;
}
