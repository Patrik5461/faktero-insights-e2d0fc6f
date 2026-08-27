import { useCallback, useEffect, useState } from "react";
import { nacitajJazyk, ulozJazyk, locale, tvar, type Jazyk, type Tvary } from "../jazyk";
import { prelozit, type Kluc } from "./index";

/**
 * Jazyk pre komponenty.
 *
 * Bez kontextu naschvál: appka je jeden strom a jazyk sa mení zriedka, takže
 * lacnejšie je povedať oknu, nech sa prekreslí, než ťahať poskytovateľa cez
 * všetky obrazovky. Zmena jazyka rozošle udalosť, na ktorú si každý hook
 * siahne sám.
 */

const UDALOST = "faktero:jazyk-zmeneny";

export function nastavJazyk(j: Jazyk): void {
  ulozJazyk(j);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(UDALOST));
}

export function usePreklad() {
  /* Na serveri sa vykresľuje po slovensky — úložisko tam neexistuje a znenie
     by sa s prehliadačom nezhodlo. */
  const [jazyk, setJazyk] = useState<Jazyk>("sk");

  useEffect(() => {
    setJazyk(nacitajJazyk());
    const naZmenu = () => setJazyk(nacitajJazyk());
    window.addEventListener(UDALOST, naZmenu);
    return () => window.removeEventListener(UDALOST, naZmenu);
  }, []);

  const t = useCallback(
    (kluc: Kluc, premenne?: Record<string, string | number>) => prelozit(jazyk, kluc, premenne),
    [jazyk],
  );

  const mnozne = useCallback((pocet: number, tvary: Tvary) => tvar(jazyk, pocet, tvary), [jazyk]);

  return { t, jazyk, locale: locale(jazyk), mnozne, nastavJazyk };
}
