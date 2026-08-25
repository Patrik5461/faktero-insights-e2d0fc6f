/**
 * Načítanie už použitých čísel jednej rady.
 *
 * Šesť rád (ponuky, prijaté aj vydané objednávky, zákazky, pokladňa) si to
 * predtým robilo každá po svojom a všetky rovnako: `.limit(5000)` **bez
 * zoradenia**. Nad päťtisíc dokladov za rok by PostgREST vrátil ľubovoľných
 * päťtisíc, najvyššie číslo by v nich nemuselo byť a rada by sa zopakovala.
 *
 * Zoradiť to a vziať prvé nejde: `poradieZCisla` pripúšťa čísla so 4 až 6
 * číslicami a abecedne je `OBJ202610000` menšie než `OBJ20269999`. Preto sa
 * číta všetko, po dávkach — inú cestu PostgREST neponúka.
 */

/** PostgREST viac než tisíc riadkov naraz rozumne nedá. */
const DAVKA = 1000;

/**
 * Poistka proti nekonečnému cyklu, keby dopyt vracal stále to isté. Milión
 * dokladov jednej rady za rok je mimo akejkoľvek reality, takže sa o strop
 * nikto nezasekne — a keby áno, je to chyba inde.
 */
const MAX_DAVIEK = 1000;

export async function nacitajPouziteCisla(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tabulka: string,
  stlpec: string,
  companyId: string,
  prefix: string,
): Promise<string[]> {
  const cisla: string[] = [];
  for (let davka = 0; davka < MAX_DAVIEK; davka++) {
    const od = davka * DAVKA;
    const { data, error } = await supabase
      .from(tabulka)
      .select(stlpec)
      .eq("company_id", companyId)
      .like(stlpec, `${prefix}%`)
      // Bez zoradenia nie je stránkovanie stabilné a niektorý riadok by sa
      // mohol preskočiť alebo prísť dvakrát.
      .order(stlpec, { ascending: true })
      .range(od, od + DAVKA - 1);
    if (error) throw new Error(error.message);
    const riadky = data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of riadky as any[]) cisla.push(r[stlpec]);
    if (riadky.length < DAVKA) break;
  }
  return cisla;
}
