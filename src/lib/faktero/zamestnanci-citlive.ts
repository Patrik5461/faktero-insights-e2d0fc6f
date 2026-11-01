/**
 * Z-01: čo poslať serveru pri úprave rodného čísla a čísla OP.
 *
 * Server (`nastavCitliveUdaje`) berie `undefined` = nemeniť, prázdny reťazec =
 * vymazať. Karta ukazuje údaje len po „Zobraziť“, takže bez neho sú polia
 * prázdne – a prázdne pole nesmie zmazať údaj, ktorý človek ani nevidel.
 *
 * - údaje sú načítané (`nacitane`): posiela sa len pole, ktoré sa zmenilo
 *   (vrátane vedomého vymazania);
 * - údaje načítané nie sú: prázdne pole = nemeniť, vyplnené = nová hodnota.
 */
export type CitliveHodnoty = { rodne_cislo: string | null; op_cislo: string | null };
export type CitliveZmeny = { rodne_cislo?: string; op_cislo?: string };

export function citliveNaUlozenie(
  vstup: { rodne_cislo: string; op_cislo: string },
  nacitane: CitliveHodnoty | null,
): CitliveZmeny {
  const vysledok: CitliveZmeny = {};
  for (const k of ["rodne_cislo", "op_cislo"] as const) {
    const nove = vstup[k].trim();
    if (nacitane) {
      if (nove !== (nacitane[k] ?? "").trim()) vysledok[k] = nove;
    } else if (nove) {
      vysledok[k] = nove;
    }
  }
  return vysledok;
}

/**
 * Z-02: založí zamestnanca a potom zvlášť jeho citlivé údaje. Keď zlyhá až
 * druhý krok, zamestnanec už existuje – vráti jeho `id` s `citliveUlozene:
 * false`, aby volajúci neostal na formulári (ďalšie odoslanie by ho založilo
 * druhýkrát). Chyba prvého kroku sa prehodí ďalej.
 */
export async function zalozZamestnanca(
  zaloz: () => Promise<{ id: string }>,
  ulozCitlive: (id: string, zmeny: CitliveZmeny) => Promise<unknown>,
  vstup: { rodne_cislo: string; op_cislo: string },
): Promise<{ id: string; citliveUlozene: boolean }> {
  const { id } = await zaloz();
  const zmeny = citliveNaUlozenie(vstup, null);
  if (Object.keys(zmeny).length === 0) return { id, citliveUlozene: true };
  try {
    await ulozCitlive(id, zmeny);
    return { id, citliveUlozene: true };
  } catch {
    return { id, citliveUlozene: false };
  }
}
