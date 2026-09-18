import { sk, type Kluc } from "./sk";
import { cs } from "./cs";
import { en } from "./en";
import { de } from "./de";
import { hu } from "./hu";
import type { Jazyk } from "../jazyk";
import { JE_KNIHA_JAZD } from "../apka";

export type { Kluc };

const SLOVNIKY: Record<Jazyk, Partial<Record<Kluc, string>>> = { sk, cs, en, de, hu };

/**
 * Text, ktorý má v Knihe jázd znieť inak.
 *
 * Appky sú dve a niektoré vety menujú tú svoju: „Faktero je zamknuté" vs
 * „Kniha jázd je zamknutá". Obyčajná náhrada mena by nestačila — v slovenčine
 * aj češtine sa s menom mení rod, takže „Kniha jázd je zamknuté" by bolo
 * zmrzačené. Premenná v texte ten problém nerieši, prekladá sa celá veta.
 *
 * Preto stačí ku kľúču dopísať slovník s príponou `Jazdy`. Keď existuje,
 * použije sa v Knihe jázd; inak platí spoločný text a nikde sa nič nevetví.
 * Volajúci o tom nevie — `t("app.zamknute")` je v oboch appkách to isté
 * volanie.
 */
function pouzitelnyKluc(kluc: Kluc): Kluc {
  if (!JE_KNIHA_JAZD) return kluc;
  const jazdovy = `${kluc}Jazdy` as Kluc;
  return sk[jazdovy] != null ? jazdovy : kluc;
}

/**
 * Preklad jedného kľúča.
 *
 * Náhradou je vždy slovenčina, nie kľúč — nepreložený text má vyzerať ako
 * text, nie ako `panel.jazyk`. Kľúč, ktorý v slovníku nie je vôbec, sa vráti
 * tak, ako prišiel; to je chyba v kóde a má byť vidieť.
 */
export function prelozit(jazyk: Jazyk, kluc: Kluc, premenne?: Record<string, string | number>) {
  const pouzity = pouzitelnyKluc(kluc);
  const text = SLOVNIKY[jazyk]?.[pouzity] ?? sk[pouzity] ?? sk[kluc] ?? kluc;
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
