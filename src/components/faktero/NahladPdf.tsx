import { useEffect, useRef, useState } from "react";

/**
 * Náhľad PDF vykreslený do plátna.
 *
 * Predtým tu bol `<object data=… type="application/pdf">`, čo prenecháva prácu
 * zabudovanému prehliadaču PDF. Ten na počítači býva, ale v mobilnom
 * prehliadači ani vo WebView appky nie — a vtedy z náhľadu ostane len veta
 * „Váš prehliadač náhľad PDF nezobrazí" a pod ňou pol obrazovky prázdna.
 * Doklad sa teda vykresľuje sám, cez pdf.js: rovnako v prehliadači, v telefóne
 * aj v appke.
 *
 * Knižnica sa načíta až keď je čo ukázať — do hlavného balíka nepatrí.
 */

/** Viac strán ako toto sa do náhľadu nekreslí; na prezretie stačí a pamäť to ušetrí. */
const MAX_STRAN = 10;
/** Šírka vykreslenia. Väčšie plátno pri dlhom doklade zbytočne žerie pamäť. */
const SIRKA = 1100;

type Stav = "citam" | "hotovo" | "zlyhalo";

export function NahladPdf({ url, className }: { url: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [stav, setStav] = useState<Stav>("citam");
  const [stran, setStran] = useState(0);

  useEffect(() => {
    let zrusene = false;
    const kontajner = box.current;
    if (!kontajner) return;
    kontajner.replaceChildren();
    setStav("citam");
    setStran(0);

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        /*
         * Worker sa musí adresovať cez `import.meta.url`, inak si ho Vite
         * nezabalí a v produkcii sa pýta súbor, ktorý tam nie je.
         */
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const dokument = await pdfjs.getDocument({ url }).promise;
        if (zrusene) return;
        setStran(dokument.numPages);

        for (let i = 1; i <= Math.min(dokument.numPages, MAX_STRAN); i++) {
          const strana = await dokument.getPage(i);
          if (zrusene) return;
          const zaklad = strana.getViewport({ scale: 1 });
          const viewport = strana.getViewport({ scale: SIRKA / zaklad.width });
          const platno = document.createElement("canvas");
          platno.width = Math.floor(viewport.width);
          platno.height = Math.floor(viewport.height);
          platno.className =
            "mx-auto block w-full max-w-full border-b border-border last:border-b-0";
          const kontext = platno.getContext("2d");
          if (!kontext) throw new Error("Plátno sa nedá pripraviť.");
          kontajner.appendChild(platno);
          await strana.render({ canvas: platno, canvasContext: kontext, viewport }).promise;
          if (zrusene) return;
        }
        setStav("hotovo");
      } catch (e) {
        if (!zrusene) {
          console.warn("[nahlad] PDF sa nepodarilo vykresliť:", e);
          setStav("zlyhalo");
        }
      }
    })();

    return () => {
      zrusene = true;
    };
  }, [url]);

  return (
    <div className={className}>
      {stav === "citam" && (
        <div className="p-8 text-center text-sm text-muted-foreground">Načítavam náhľad…</div>
      )}
      {stav === "zlyhalo" && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Náhľad sa nepodarilo vykresliť.{" "}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Otvoriť doklad
          </a>
        </div>
      )}
      <div ref={box} className="max-h-[70vh] overflow-auto bg-muted/20" />
      {stav === "hotovo" && stran > MAX_STRAN && (
        <div className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
          Náhľad ukazuje prvých {MAX_STRAN} strán z {stran}. Celý doklad otvoríte tlačidlom
          Stiahnuť.
        </div>
      )}
    </div>
  );
}
