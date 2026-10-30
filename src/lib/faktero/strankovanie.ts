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

type StrankaSPoctom<T> = PromiseLike<{
  data: T[] | null;
  error?: { message: string } | null;
  count?: number | null;
}>;

/**
 * Všetky riadky ako `vsetkyRiadky`, ale stránky po prvej idú naraz. Prvá
 * stránka si vypýta aj počet (`spocitaj = true` → `select(…, { count: "exact" })`),
 * ostatné sa potom stiahnu súčasne — zoznam s 2 000 bločkami nečaká na tri
 * odpovede za sebou. Keď počet nepríde (alebo medzitým riadky pribudli),
 * dočíta sa zvyšok po starom.
 */
export async function vsetkyRiadkySubezne<T = any>(
  dotaz: (od: number, po: number, spocitaj: boolean) => StrankaSPoctom<T>,
  velkost = STRANKA,
): Promise<T[]> {
  const prva = await dotaz(0, velkost - 1, true);
  if (prva.error) throw new Error(prva.error.message);
  const out: T[] = [...(prva.data ?? [])];
  if (out.length < velkost) return out;
  const pocet = typeof prva.count === "number" ? prva.count : null;
  const zaciatky: number[] = [];
  if (pocet != null) for (let od = velkost; od < pocet; od += velkost) zaciatky.push(od);
  const stranky = await Promise.all(zaciatky.map((od) => dotaz(od, od + velkost - 1, false)));
  for (const s of stranky) {
    if (s.error) throw new Error(s.error.message);
    out.push(...(s.data ?? []));
  }
  // Posledná stránka plná (alebo počet neprišiel) — mohlo pribudnúť, dočítať.
  const posledna = stranky.length ? stranky[stranky.length - 1].data : prva.data;
  if ((posledna ?? []).length === velkost) {
    const dalsieOd = velkost * (zaciatky.length + 1);
    out.push(...(await vsetkyRiadky<T>((od, po) => dotaz(dalsieOd + od, dalsieOd + po, false), velkost)));
  }
  return out;
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
  const jedinecne = [...new Set(ids)];
  const kusy: string[][] = [];
  for (let i = 0; i < jedinecne.length; i += davka) kusy.push(jedinecne.slice(i, i + davka));
  // Dávky súčasne, nie jedna po druhej — 340 nezaplatených faktúr čakalo na
  // dve požiadavky za sebou, kým sa zoznam vôbec ukázal.
  const casti = await Promise.all(kusy.map((kus) => vsetkyRiadky<T>((od, po) => dotaz(kus, od, po))));
  return casti.flat();
}

/** To isté ako `vsetkyRiadky`, ale v tvare `{ data }` — dá sa vložiť do `Promise.all` namiesto dotazu. */
export async function vsetkoAkoData<T = any>(
  dotaz: (od: number, po: number) => Stranka<T>,
): Promise<{ data: T[]; error: null }> {
  return { data: await vsetkyRiadky<T>(dotaz), error: null };
}
