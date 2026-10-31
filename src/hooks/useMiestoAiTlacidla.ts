import { useEffect, useState } from "react";
import {
  ODSTUP,
  VELKOST,
  pisaciePole,
  zdvihTlacidla,
  type Prekazka,
} from "@/lib/faktero/ai-tlacidlo-miesto";

/**
 * Plávajúce tlačidlo AI na úzkej obrazovke (bez odtiahnutia):
 * - `main` dostane rezervu na spodku (`html[data-ai-tlacidlo]`), takže
 *   posledné ovládače stránky sa dajú odrolovať nad tlačidlo;
 * - nad pevnú/prilepenú lištu pri spodku sa tlačidlo zdvihne (`zdvih` v px);
 * - kým sa píše do poľa (otvorená klávesnica), je skryté (`skryte`).
 */
export function useMiestoAiTlacidla(aktivne: boolean): { zdvih: number; skryte: boolean } {
  const [zdvih, setZdvih] = useState(0);
  const [skryte, setSkryte] = useState(false);

  useEffect(() => {
    if (!aktivne || typeof window === "undefined") {
      setZdvih(0);
      setSkryte(false);
      return;
    }
    const html = document.documentElement;
    html.dataset.aiTlacidlo = "";

    let ramec = 0;
    const prepocitaj = () => {
      ramec = 0;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const l = w - ODSTUP - VELKOST;
      const t = h - ODSTUP - VELKOST;
      const body: Array<[number, number]> = [
        [l + VELKOST / 2, t + VELKOST / 2],
        [l + 4, t + 4],
        [l + VELKOST - 4, t + 4],
        [l + 4, t + VELKOST - 4],
        [l + VELKOST - 4, t + VELKOST - 4],
      ];
      const videne = new Set<Element>();
      const prekazky: Prekazka[] = [];
      for (const [x, y] of body) {
        for (const el of document.elementsFromPoint(x, y)) {
          if (el.closest("[data-plavajuce]")) continue;
          for (
            let a: Element | null = el;
            a && a !== document.body && a !== html;
            a = a.parentElement
          ) {
            if (videne.has(a)) break;
            videne.add(a);
            // Len lišty prilepené k spodku: `sticky` s `bottom`, `fixed` pri spodnom okraji.
            // Prilepená hlavička tabuľky alebo karta s `sticky top-…` nie je prekážka.
            const st = getComputedStyle(a);
            const kSpodku = st.bottom !== "auto";
            if (st.position === "sticky" || st.position === "fixed") {
              const r = a.getBoundingClientRect();
              if (kSpodku || (st.position === "fixed" && r.bottom >= h - 2))
                prekazky.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
            }
          }
        }
      }
      setZdvih(zdvihTlacidla(prekazky, { sirka: w, vyska: h }));
    };
    const naplanuj = () => {
      if (!ramec) ramec = requestAnimationFrame(prepocitaj);
    };
    const fokus = () => setSkryte(pisaciePole(document.activeElement));
    // Pri presune fokusu medzi poliami je activeElement chvíľu body — počká sa.
    const odchod = () => setTimeout(fokus, 0);

    prepocitaj();
    fokus();
    window.addEventListener("scroll", naplanuj, { capture: true, passive: true });
    window.addEventListener("resize", naplanuj);
    document.addEventListener("focusin", fokus);
    document.addEventListener("focusout", odchod);
    const sledovac = new MutationObserver(naplanuj);
    sledovac.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => {
      delete html.dataset.aiTlacidlo;
      if (ramec) cancelAnimationFrame(ramec);
      window.removeEventListener("scroll", naplanuj, { capture: true });
      window.removeEventListener("resize", naplanuj);
      document.removeEventListener("focusin", fokus);
      document.removeEventListener("focusout", odchod);
      sledovac.disconnect();
    };
  }, [aktivne]);

  return { zdvih, skryte };
}
