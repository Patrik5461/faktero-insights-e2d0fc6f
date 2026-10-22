import { useCallback, useRef, useState } from "react";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  poslednyOtvoreny,
  zapamatajOtvoreny,
  ZVYRAZNENIE_KARTY,
  ZVYRAZNENIE_RIADKA,
  type ZoznamDokladov,
} from "@/lib/faktero/posledny-otvoreny";

/**
 * Zvýraznenie naposledy otvoreného dokladu v zozname. `ref(id)` daj na
 * riadok aj na kartu — zoznam doroluje k tej, ktorá je naozaj vidieť
 * (tabuľka a karty sa striedajú podľa šírky obrazovky), a len raz.
 */
export function usePoslednyOtvoreny(zoznam: ZoznamDokladov) {
  const [id] = useState(() => poslednyOtvoreny(zoznam, getActiveCompanyId()));
  const dorolovane = useRef(false);
  const naRiadok = useCallback((el: HTMLElement | null) => {
    if (!el || dorolovane.current || el.offsetParent === null) return;
    dorolovane.current = true;
    requestAnimationFrame(() => {
      try {
        el.scrollIntoView({ block: "center" });
      } catch {
        /* starý prehliadač */
      }
    });
  }, []);
  const zapamataj = useCallback(
    (x: string) => zapamatajOtvoreny(zoznam, getActiveCompanyId(), x),
    [zoznam],
  );
  return {
    id,
    zapamataj,
    /** Vlastnosti riadka tabuľky: trieda zvýraznenia a ref na dorolovanie. */
    riadok: (x: string) =>
      x === id
        ? { ref: naRiadok, className: ZVYRAZNENIE_RIADKA, "aria-current": true as const }
        : { className: "" },
    karta: (x: string) =>
      x === id
        ? { ref: naRiadok, className: ZVYRAZNENIE_KARTY, "aria-current": true as const }
        : { className: "" },
  };
}
