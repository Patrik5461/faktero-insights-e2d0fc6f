import { useEffect, useRef } from "react";
import { drzFokusVOkne, vrchneOkno } from "@/lib/faktero/fokus-okna";

/** Okná, ktorých fokus už niekto drží (otvorené skôr, pod novým oknom). */
const drzane = new WeakSet<HTMLElement>();

/**
 * Zavrie ručne kreslené modálne okno klávesou Esc.
 *
 * Väčšina okien v aplikácii je z Radixu a Esc zvláda sama. Časť je ale
 * nakreslená ručne (`fixed inset-0` + panel) a tie sa Escapom nezatvárali —
 * pri niektorých nezaberalo ani kliknutie mimo, takže jediná cesta von bolo
 * trafiť tlačidlo Zrušiť. Hook je zámerne bez väzby na Radix, aby sa dal pridať
 * bez prestavby tých okien.
 *
 * Obsluha sa drží v refe, takže sa poslucháč nepridáva a neodoberá pri každom
 * prekreslení — volajúci môže pokojne posielať novú šípkovú funkciu. `null`
 * (alebo `undefined`) znamená „okno je zavreté, nepočúvaj"; hook sa tak dá
 * volať nepodmienene aj nad zavretým dialógom a poradie hookov ostane rovnaké.
 *
 * Používa sa spolu s `role="dialog"` a `aria-modal="true"` na paneli — bez toho
 * o okne nevie čítačka obrazovky ani testy. Také okno hook navyše drží vo
 * fokuse (Tab neodíde pod okno, po zatvorení sa fokus vráti), pozri
 * `fokus-okna.ts`. Plávajúce panely bez `aria-modal` fokus nedržia.
 */
export function useZatvorNaEscape(onClose: (() => void) | undefined | null) {
  const drzak = useRef(onClose);
  drzak.current = onClose;
  const aktivne = !!onClose;

  useEffect(() => {
    if (!aktivne) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") drzak.current?.();
    };
    window.addEventListener("keydown", h);
    const okno = vrchneOkno();
    let uvolni: (() => void) | null = null;
    if (okno && !drzane.has(okno)) {
      drzane.add(okno);
      uvolni = drzFokusVOkne(okno);
    }
    return () => {
      window.removeEventListener("keydown", h);
      if (okno && uvolni) {
        drzane.delete(okno);
        uvolni();
      }
    };
  }, [aktivne]);
}
