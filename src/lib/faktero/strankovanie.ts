/*
  Supabase (PostgREST) vráti na jeden dotaz najviac 1 000 riadkov — aj keď si
  dotaz povie `.limit(5000)`. Zvyšok ticho chýba: výkaz bez dokladov, export
  bez položiek, zoznam „už odoslané" bez polovice a konektor potom posiela
  druhýkrát. Tu sú dve pomôcky, ktoré načítajú naozaj všetko.
*/

type Stranka<T> = PromiseLike<{ data: T[] | null; error?: { message: string } | null }>;

/** Veľkosť stránky — rovná sa stropu servera, menšia by len pridala dotazy. */
export const STRANKA = 1000;

/**
 * Všetky riadky dotazu po stránkach. `dotaz(od, po)` musí vrátiť nový dotaz
 * s `.range(od, po)` a so stabilným poradím (napr. `.order("id")`), inak sa
 * riadky medzi stránkami môžu zopakovať alebo vynechať.
 */
export async function vsetkyRiadky<T = any>(
  dotaz: (od: number, po: number) => Stranka<T>,
  velkost = STRANKA,
): Promise<T[]> {
  const out: T[] = [];
  for (let od = 0; ; od += velkost) {
    const { data, error } = await dotaz(od, od + velkost - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < velkost) return out;
  }
}

/**
 * Riadky pre veľký zoznam id: po dávkach (URL s tisíckami id by bola pridlhá)
 * a v každej dávke po stránkach (položiek býva viac než faktúr).
 */
export async function riadkyPreIds<T = any>(
  ids: string[],
  dotaz: (kus: string[], od: number, po: number) => Stranka<T>,
  davka = 200,
): Promise<T[]> {
  const out: T[] = [];
  const jedinecne = [...new Set(ids)];
  for (let i = 0; i < jedinecne.length; i += davka) {
    const kus = jedinecne.slice(i, i + davka);
    out.push(...(await vsetkyRiadky<T>((od, po) => dotaz(kus, od, po))));
  }
  return out;
}

/** To isté ako `vsetkyRiadky`, ale v tvare `{ data }` — dá sa vložiť do `Promise.all` namiesto dotazu. */
export async function vsetkoAkoData<T = any>(
  dotaz: (od: number, po: number) => Stranka<T>,
): Promise<{ data: T[]; error: null }> {
  return { data: await vsetkyRiadky<T>(dotaz), error: null };
}
