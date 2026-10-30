/**
 * Vydané faktúry do mesačného balíka tak, aby jedna zlá nezhodila celý balík.
 *
 * Generátor Pohody hodí chybu, keď sa z výberu nedá vyviezť nič (napr. jediná
 * faktúra v cudzej mene bez kurzu), alebo keď ho položí jedna faktúra. Balík
 * za mesiac ale nesie aj prijaté doklady, pokladňu a PDF — tie musia odísť
 * aj tak. Preto sa pri chybe faktúry skúsia po jednej: tie, ktoré neprejdú,
 * idú do vynechaných s dôvodom, ostatné do XML.
 */
export type ZostavFaktur<T> = (
  vyber: T[],
) =>
  { content: string; preskocene?: string[] } | Promise<{ content: string; preskocene?: string[] }>;

const PREDPONA = /^Do .+? sa nedá vyviezť nič z vybraného:\s*/;

/** Dôvod v tvare „číslo — dôvod“, ktorý čaká `oznacOdovzdane`. */
export function dovodChyby(cislo: string, chyba: unknown): string {
  const text = String((chyba as Error)?.message ?? chyba ?? "")
    .replace(PREDPONA, "")
    .trim();
  if (text.startsWith(`${cislo} — `)) return text;
  return `${cislo} — ${text || "nepodarilo sa vytvoriť"}`;
}

export async function fakturyDoBalika<T>(
  faktury: T[],
  cislo: (f: T) => string,
  zostav: ZostavFaktur<T>,
): Promise<{ content: string; preskocene: string[] }> {
  if (!faktury.length) return { content: "", preskocene: [] };
  try {
    const v = await zostav(faktury);
    return { content: v.content, preskocene: [...(v.preskocene ?? [])] };
  } catch {
    // Nájsť, ktoré faktúry to spôsobili — každú zvlášť.
  }
  const dobre: T[] = [];
  const zle: string[] = [];
  for (const f of faktury) {
    try {
      await zostav([f]);
      dobre.push(f);
    } catch (e) {
      zle.push(dovodChyby(cislo(f), e));
    }
  }
  if (!dobre.length) return { content: "", preskocene: zle };
  try {
    const v = await zostav(dobre);
    return { content: v.content, preskocene: [...(v.preskocene ?? []), ...zle] };
  } catch (e) {
    // Po jednej prešli, spolu nie — radšej bez XML faktúr než bez balíka.
    return { content: "", preskocene: [...dobre.map((f) => dovodChyby(cislo(f), e)), ...zle] };
  }
}

/** Bloček, ktorý ešte nik nespracoval (`new`), do balíka nepatrí. */
export function dokladDoBalika(d: { status?: string | null }): boolean {
  return d?.status !== "new";
}
