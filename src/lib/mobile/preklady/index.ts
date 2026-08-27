import { sk, type Kluc } from "./sk";
import { cs } from "./cs";
import { en } from "./en";
import { de } from "./de";
import { hu } from "./hu";
import type { Jazyk } from "../jazyk";

export type { Kluc };

const SLOVNIKY: Record<Jazyk, Partial<Record<Kluc, string>>> = { sk, cs, en, de, hu };

/**
 * Preklad jedného kľúča.
 *
 * Náhradou je vždy slovenčina, nie kľúč — nepreložený text má vyzerať ako
 * text, nie ako `panel.jazyk`. Kľúč, ktorý v slovníku nie je vôbec, sa vráti
 * tak, ako prišiel; to je chyba v kóde a má byť vidieť.
 */
export function prelozit(jazyk: Jazyk, kluc: Kluc, premenne?: Record<string, string | number>) {
  const text = SLOVNIKY[jazyk]?.[kluc] ?? sk[kluc] ?? kluc;
  if (!premenne) return text;
  return String(text).replace(/\{(\w+)\}/g, (celok, meno) =>
    meno in premenne ? String(premenne[meno]) : celok,
  );
}

/** Koľko z kľúčov jazyk naozaj pokrýva — do prehľadu, nie do behu appky. */
export function pokrytie(jazyk: Jazyk): { prelozene: number; spolu: number } {
  const kluce = Object.keys(sk) as Kluc[];
  const s = SLOVNIKY[jazyk] ?? {};
  return { prelozene: kluce.filter((k) => s[k] != null).length, spolu: kluce.length };
}
