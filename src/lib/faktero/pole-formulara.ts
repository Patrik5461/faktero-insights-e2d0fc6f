/*
  Ktoré pole formulára je prvok stránky — podľa popisu (aria-label alebo text
  v <label>), aj v nemčine a češtine. Spoločné pre výber hodnoty z dokladu
  (`NahladSVyberom`) a prepojenie zvýraznenia v náhľade s formulárom.
*/
import { preloz } from "@/lib/i18n/jazyk";
import { POLIA_VYBERU, polePodlaPopisu, type KlucPola } from "./vyber-z-dokladu";

/** Popis poľa formulára — aria-label, inak text nad ním v `<label>`. */
export function popisPola(el: Element | null): string | null {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;
  return (
    el.getAttribute("aria-label") || el.closest("label")?.querySelector("span")?.textContent || null
  );
}

/**
 * Pole podľa popisu — aj keď je formulár preložený do nemčiny či češtiny. Popisy
 * polí v `POLIA_VYBERU` sú slovenské; preložený popis sa preto najprv vráti na
 * slovenský (dlhší preklad má prednosť) a až potom sa porovná.
 */
export function poleZPopisu(popis: string | null): KlucPola | null {
  const priamo = polePodlaPopisu(popis);
  if (priamo || !popis) return priamo;
  const text = popis.trim().toLowerCase();
  let najlepsie: { sk: string; de: string } | null = null;
  for (const p of POLIA_VYBERU)
    for (const sk of p.popisy)
      for (const jazyk of ["de", "cs"] as const) {
        const de = preloz(jazyk, sk);
        if (de === sk) continue;
        const z = de.toLowerCase();
        if (
          (text === z || (text.startsWith(z) && !/[\p{L}\d]/u.test(text[z.length] ?? ""))) &&
          (!najlepsie || de.length > najlepsie.de.length)
        )
          najlepsie = { sk, de };
      }
  return najlepsie ? polePodlaPopisu(najlepsie.sk + popis.trim().slice(najlepsie.de.length)) : null;
}

/** Ktoré pole výberu je to, do ktorého človek klikol (null = žiadne). */
export function poleZPrvku(el: EventTarget | null): KlucPola | null {
  return poleZPopisu(popisPola(el as Element | null));
}
