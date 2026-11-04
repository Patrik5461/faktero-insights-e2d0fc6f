import { useCallback, useRef, useState } from "react";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  OZNACENIE_V_NAHLADE,
  poslednyOtvoreny,
  zapamatajOtvoreny,
  type ZoznamDokladov,
} from "@/lib/faktero/posledny-otvoreny";

export interface VlastnostiRiadku {
  ref?: (el: HTMLElement | null) => void;
  className: string;
  "aria-current"?: true;
}

/**
 * Jadro bez hookov (kvôli testom): vlastnosti riadka/karty dokladu `x`.
 *
 * - `vybrany` = doklad práve v bočnom náhľade → neutrálne `OZNACENIE_V_NAHLADE`
 *   a `aria-current`. Je to výsledok kliknutia a náhľad je otvorený.
 * - `posledny` = naposledy otvorený doklad → len ref na jednorazové
 *   dorolovanie, bez akejkoľvek farby. Zelený pruh, ktorý tu býval, ostával
 *   na „náhodnom“ riadku aj naprieč návštevami a vyzeral ako zaseknutá myš.
 */
export function vlastnostiRiadku(
  x: string,
  posledny: string | null,
  vybrany: string | null | undefined,
  naRiadok: (el: HTMLElement | null) => void,
): VlastnostiRiadku {
  const p: VlastnostiRiadku = { className: "" };
  if (x === posledny) p.ref = naRiadok;
  if (vybrany && x === vybrany) {
    p.className = OZNACENIE_V_NAHLADE;
    p["aria-current"] = true;
  }
  return p;
}

/**
 * Naposledy otvorený doklad v zozname. `ref(id)` daj na riadok aj na kartu —
 * zoznam doroluje k tej, ktorá je naozaj vidieť (tabuľka a karty sa
 * striedajú podľa šírky obrazovky), a len raz.
 */
export function usePoslednyOtvoreny(zoznam: ZoznamDokladov) {
  const [id, setId] = useState(() => poslednyOtvoreny(zoznam, getActiveCompanyId()));
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
    (x: string) => {
      zapamatajOtvoreny(zoznam, getActiveCompanyId(), x);
      setId(x);
    },
    [zoznam],
  );
  return {
    id,
    zapamataj,
    /** Vlastnosti riadka tabuľky; `vybrany` = doklad v bočnom náhľade (ak je zapnutý). */
    riadok: (x: string, vybrany?: string | null) => vlastnostiRiadku(x, id, vybrany, naRiadok),
    /** To isté pre kartu na mobile. */
    karta: (x: string, vybrany?: string | null) => vlastnostiRiadku(x, id, vybrany, naRiadok),
  };
}
