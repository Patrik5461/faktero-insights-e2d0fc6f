/**
 * Hromadný zápis po dávkach id — aj z prehliadača.
 *
 * PostgREST posiela hodnoty `.in("id", ids)` v URL; okolo 650 UUID je adresa
 * dlhšia, než ju server prijme, a celé hromadné mazanie či obnova skončí
 * chybou 400. Dávka 300 je ten istý strop ako `selectByIds` v batch.server.ts.
 */
export const DAVKA_ID = 300;

/** Spustí `fn` postupne pre každú dávku id; chyba dávky preruší ďalšie. */
export async function poDavkach<T>(
  ids: readonly string[],
  fn: (davka: string[]) => Promise<T>,
  velkost = DAVKA_ID,
): Promise<T[]> {
  const vysledky: T[] = [];
  for (let i = 0; i < ids.length; i += velkost) {
    vysledky.push(await fn(ids.slice(i, i + velkost)));
  }
  return vysledky;
}
