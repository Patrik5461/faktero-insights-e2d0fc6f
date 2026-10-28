/*
  Poradie firiem v prepínači a v zozname firiem. Účtovná kancelária má aj
  stovku firiem a abecedný zoznam ju nútil zakaždým hľadať tie isté tri —
  preto idú hore naposledy použité, potom zvyšok abecedne.
*/
import { filtrujFirmy } from "@/lib/faktero/hladanie-firiem";

type Firma = { id: string; name: string; ico?: string | null };

/** Koľko naposledy použitých firiem si pamätáme a ukazujeme hore. */
export const POSLEDNE_MAX = 5;

const KLUC_POSLEDNE = "faktero.posledne_firmy";

/** Zoznam naposledy použitých po prepnutí na `id` — najnovšia prvá, bez opakovania. */
export function pridajMedziPosledne(posledne: string[], id: string, max = POSLEDNE_MAX): string[] {
  return [id, ...posledne.filter((x) => x !== id)].slice(0, max);
}

export type ZoradeneFirmy<F> = {
  /** Naposledy použité (aktívna prvá), len tie, ktoré zodpovedajú dotazu. */
  posledne: F[];
  /** Ostatné abecedne. */
  ostatne: F[];
  /** Oboje za sebou — v tomto poradí chodia šípky. */
  vsetky: F[];
};

/**
 * Firmy zodpovedajúce dotazu: aktívna a naposledy použité hore, potom
 * abecedne. Hľadá sa v názve aj IČO bez ohľadu na diakritiku (`filtrujFirmy`).
 * Pri jedinej alebo pár firmách sa skupina „naposledy“ neoddeľuje — pri
 * krátkom zozname by len zavadzala.
 */
export function zoradFirmy<F extends Firma>(
  firmy: F[],
  dotaz: string,
  aktivnaId: string | null | undefined,
  posledne: string[],
  oddelitOd = 8,
): ZoradeneFirmy<F> {
  const abecedne = filtrujFirmy(firmy, dotaz);
  if (firmy.length < oddelitOd) {
    const vsetky = filtrujFirmy(firmy, dotaz, aktivnaId);
    return { posledne: [], ostatne: vsetky, vsetky };
  }
  const poradie = aktivnaId ? pridajMedziPosledne(posledne, aktivnaId, POSLEDNE_MAX + 1) : posledne;
  const podlaId = new Map(abecedne.map((f) => [f.id, f]));
  const hore = poradie.map((id) => podlaId.get(id)).filter((f): f is F => Boolean(f));
  const horeIds = new Set(hore.map((f) => f.id));
  const ostatne = abecedne.filter((f) => !horeIds.has(f.id));
  return { posledne: hore, ostatne, vsetky: [...hore, ...ostatne] };
}

/** Naposledy použité firmy z prehliadača — pohodlie, nie dáta; pri chybe prázdne. */
export function citajPosledneFirmy(): string[] {
  try {
    if (typeof window === "undefined") return [];
    const v = JSON.parse(window.localStorage.getItem(KLUC_POSLEDNE) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function zapamatajPouzituFirmu(id: string) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      KLUC_POSLEDNE,
      JSON.stringify(pridajMedziPosledne(citajPosledneFirmy(), id)),
    );
  } catch {
    /* súkromné okno alebo zablokované úložisko — poradie ostane abecedné */
  }
}
