/**
 * Pomôcky na hromadné spracovanie v cron hookoch.
 *
 * Cron hooky prechádzali stovky až tisíce záznamov v `for` slučke s `await`
 * vnútri — jeden request tak sekvenčne čakal na stovky DB a HTTP volaní.
 * Neobmedzený `Promise.all` je opačný extrém: otvoril by naraz toľko spojení,
 * koľko je záznamov. `runInBatches` je stred.
 *
 * `selectByIds` rieši dve pasce hromadných dotazov naraz:
 *  - PostgREST posiela hodnoty `.in()` v URL, takže tisíce UUID ju pretiahnu,
 *  - a vracia najviac 1000 riadkov, aj keď ich existuje viac. Neúplná odpoveď
 *    by tu bola horšia než pomalý kód: napr. v upomienkach by chýbajúci riadok
 *    znamenal, že sa už odoslaná upomienka pošle druhýkrát.
 */

/** Rozdelí zoznam na kusy. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Koľko ID naraz do jedného `.in()` dotazu (limit dĺžky URL). */
const ID_CHUNK = 300;
/** Veľkosť stránky pri čítaní výsledkov (limit PostgRESTu). */
const PAGE = 1000;

/**
 * Načíta všetky riadky pre zoznam ID — po kusoch podľa ID a v každom kuse
 * stránkovane, kým odpoveď nie je kratšia než stránka.
 *
 * `fetcher` musí použiť dodaný rozsah cez `.range(from, to)`.
 */
export async function selectByIds<T>(
  ids: readonly string[],
  fetcher: (idsChunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunk(ids, ID_CHUNK)) {
    let offset = 0;
    for (;;) {
      const { data } = await fetcher(part, offset, offset + PAGE - 1);
      const rows = data ?? [];
      out.push(...rows);
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
  }
  return out;
}

/**
 * Načíta všetky riadky dotazu bez `.in()` — stránkovane, kým odpoveď nie je
 * kratšia než stránka. Bez toho by sa pri viac než 1000 riadkoch potichu
 * spracovala len prvá tisícka.
 */
export async function selectAll<T>(
  fetcher: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const { data } = await fetcher(offset, offset + PAGE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

export async function runInBatches<T, R>(
  items: readonly T[],
  size: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (size < 1) throw new Error("runInBatches: size musí byť aspoň 1");
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    const settled = await Promise.all(slice.map((item, j) => fn(item, i + j)));
    out.push(...settled);
  }
  return out;
}
