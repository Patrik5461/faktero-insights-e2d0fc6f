import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/useT";
import { slovaStranyPdf } from "@/lib/faktero/pdf-slova";
import type { SlovoNahladu } from "@/lib/faktero/vyber-z-dokladu";
import {
  usePosunNaAktivne,
  useZvyraznenia,
  ZvyrazneniaStrany,
  type ZvyraznenieNahladu,
} from "./ZvyraznenieVytazenych";

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
 * S `zvyraznenie` (nespracovaný doklad) sa prečíta aj textová vrstva a nad
 * plátnom sa vyznačia miesta, odkiaľ sa vzali vyťažené údaje.
 *
 * Knižnica sa načíta až keď je čo ukázať — do hlavného balíka nepatrí.
 */

/** Viac strán ako toto sa do náhľadu nekreslí; na prezretie stačí a pamäť to ušetrí. */
const MAX_STRAN = 10;
/** Šírka vykreslenia. Väčšie plátno pri dlhom doklade zbytočne žerie pamäť. */
const SIRKA = 1100;

type Stav = "citam" | "hotovo" | "zlyhalo";
type Strana = { cislo: number; pomer: number; platno: HTMLCanvasElement };

export function NahladPdf({
  url,
  className,
  zvyraznenie,
}: {
  url: string;
  className?: string;
  zvyraznenie?: ZvyraznenieNahladu;
}) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const [stav, setStav] = useState<Stav>("citam");
  const [stran, setStran] = useState(0);
  const [strany, setStrany] = useState<Strana[]>([]);
  const [slova, setSlova] = useState<SlovoNahladu[][]>([]);
  const citatText = Boolean(zvyraznenie);

  useEffect(() => {
    let zrusene = false;
    setStav("citam");
    setStran(0);
    setStrany([]);
    setSlova([]);

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
        const meradlo = citatText ? document.createElement("canvas").getContext("2d") : null;

        for (let i = 1; i <= Math.min(dokument.numPages, MAX_STRAN); i++) {
          const strana = await dokument.getPage(i);
          if (zrusene) return;
          const zaklad = strana.getViewport({ scale: 1 });
          const viewport = strana.getViewport({ scale: SIRKA / zaklad.width });
          const platno = document.createElement("canvas");
          platno.width = Math.floor(viewport.width);
          platno.height = Math.floor(viewport.height);
          platno.className = "block h-full w-full";
          const kontext = platno.getContext("2d");
          if (!kontext) throw new Error("Plátno sa nedá pripraviť.");
          await strana.render({ canvas: platno, canvasContext: kontext, viewport }).promise;
          if (zrusene) return;
          setStrany((pred) => [
            ...pred,
            { cislo: i, pomer: viewport.height / viewport.width, platno },
          ]);
          if (citatText) {
            const s = await slovaStranyPdf(pdfjs, strana, viewport, meradlo);
            if (zrusene) return;
            setSlova((pred) => {
              const n = [...pred];
              n[i - 1] = s;
              return n;
            });
          }
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
  }, [url, citatText]);

  const vsetky = useZvyraznenia(slova, zvyraznenie);
  const zobrazit = Boolean(zvyraznenie?.zobrazit);
  usePosunNaAktivne(box, zvyraznenie?.aktivne, vsetky, zobrazit);

  return (
    <div className={className}>
      {stav === "citam" && strany.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {t("Načítavam náhľad…")}
        </div>
      )}
      {stav === "zlyhalo" && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {t("Náhľad sa nepodarilo vykresliť.")}{" "}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {t("Otvoriť doklad")}
          </a>
        </div>
      )}
      <div ref={box} className="max-h-[70vh] overflow-auto bg-muted/20">
        {strany.map((s, i) => (
          <StranaPdf key={s.cislo} strana={s}>
            {zobrazit ? (
              <ZvyrazneniaStrany zvyraznenia={vsetky} strana={i} aktivne={zvyraznenie?.aktivne} />
            ) : null}
          </StranaPdf>
        ))}
      </div>
      {stav === "hotovo" && stran > MAX_STRAN && (
        <div className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
          {t(
            "Náhľad ukazuje prvých {max} strán z {stran}. Celý doklad otvoríte tlačidlom Stiahnuť.",
            {
              max: MAX_STRAN,
              stran,
            },
          )}
        </div>
      )}
    </div>
  );
}

/** Jedna strana — plátno v obale s pevným pomerom, aby rámčeky zvýraznenia sedeli. */
function StranaPdf({ strana, children }: { strana: Strana; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.replaceChildren(strana.platno);
  }, [strana.platno]);
  return (
    <div
      className="relative mx-auto w-full max-w-full border-b border-border last:border-b-0"
      style={{ aspectRatio: `1 / ${strana.pomer}` }}
    >
      <div ref={ref} className="absolute inset-0" />
      {children}
    </div>
  );
}
