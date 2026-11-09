import { useEffect, useRef, useState, type ReactNode } from "react";
import { moznostiPdf } from "@/lib/faktero/pdfjs-moznosti";
import { useT } from "@/lib/i18n/useT";
import { slovaStranyPdf } from "@/lib/faktero/pdf-slova";
import { maStranaText, slovaZoZvyrazneni, type SlovoSkenu } from "@/lib/faktero/textova-vrstva";
import { SlovaSkenu, TextovaVrstvaPdf, useNapovedaSkenu } from "./TextovaVrstvaPdf";
import type { SlovoNahladu } from "@/lib/faktero/vyber-z-dokladu";
import {
  LegendaZvyraznenia,
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
 * Nad plátnom leží priehľadná textová vrstva pdf.js — text dokladu sa dá
 * myšou označiť a skopírovať (`TextovaVrstvaPdf`). Sken bez textu ukáže
 * hodnoty od AI (ak sú) alebo pri pokuse o označenie krátku nápovedu.
 *
 * So `zvyraznenie` sa nad plátnom vyznačia miesta, odkiaľ sa vzali vyťažené
 * údaje (nespracovaný doklad, detail prijatej faktúry, bločku).
 *
 * Knižnica sa načíta až keď je čo ukázať — do hlavného balíka nepatrí.
 */

/** Viac strán ako toto sa do náhľadu nekreslí; na prezretie stačí a pamäť to ušetrí. */
const MAX_STRAN = 10;
/** Šírka vykreslenia. Väčšie plátno pri dlhom doklade zbytočne žerie pamäť. */
const SIRKA = 1100;

type Stav = "citam" | "hotovo" | "zlyhalo";
type Strana = {
  cislo: number;
  pomer: number;
  platno: HTMLCanvasElement;
  /** Strana pdf.js — pre textovú vrstvu. */
  pdf: any;
  /** Obsah textovej vrstvy (`getTextContent`); kým sa číta, `undefined`. */
  obsah?: any;
  /** Má strana text? `false` = sken. */
  maText?: boolean;
};

export function NahladPdf({
  url,
  className,
  zvyraznenie,
  textovaVrstva = true,
}: {
  url: string;
  className?: string;
  zvyraznenie?: ZvyraznenieNahladu;
  /** Priehľadný text nad plátnom na označenie a kopírovanie (predvolene zapnutý). */
  textovaVrstva?: boolean;
}) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const [stav, setStav] = useState<Stav>("citam");
  const [stran, setStran] = useState(0);
  const [strany, setStrany] = useState<Strana[]>([]);
  const [slova, setSlova] = useState<SlovoNahladu[][]>([]);
  const [pdfjsModul, setPdfjsModul] = useState<any>(null);

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
        if (!zrusene) setPdfjsModul(() => pdfjs);

        const dokument = await pdfjs.getDocument(moznostiPdf(url)).promise;
        if (zrusene) return;
        setStran(dokument.numPages);
        const meradlo = document.createElement("canvas").getContext("2d");

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
            { cislo: i, pomer: viewport.height / viewport.width, platno, pdf: strana },
          ]);
          /*
            Text sa číta bokom — kreslenie ďalšej strany naň nečaká. Ten istý
            obsah slúži textovej vrstve (kopírovanie) aj zvýrazneniu údajov.
          */
          void strana
            .getTextContent()
            .then(async (obsah: any) => {
              if (zrusene) return;
              const maText = maStranaText(obsah);
              setStrany((pred) =>
                pred.map((s) => (s.cislo === i ? { ...s, obsah, maText } : s)),
              );
              if (!maText) return;
              const s = await slovaStranyPdf(pdfjs, strana, viewport, meradlo, obsah);
              if (zrusene) return;
              setSlova((pred) => {
                const n = [...pred];
                n[i - 1] = s;
                return n;
              });
            })
            .catch((e: unknown) => {
              if (zrusene) return;
              console.warn("[nahlad] text strany sa nepodarilo prečítať:", e);
              setStrany((pred) => pred.map((s) => (s.cislo === i ? { ...s, maText: false } : s)));
            });
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
      {/*
        Bez vlastného posuvníka a stropu výšky — roluje rodič (PanelNahladu,
        okno, stránka). Posun na aktívne zvýraznenie hľadá rolovacieho predka sám.
      */}
      {zobrazit && vsetky.length ? (
        <LegendaZvyraznenia zvyraznenia={vsetky} className="px-1 pb-2" />
      ) : null}
      <div ref={box} className="bg-muted/20">
        {strany.map((s, i) => (
          <StranaPdf
            key={s.cislo}
            strana={s}
            pdfjs={textovaVrstva ? pdfjsModul : null}
            slovaSkenu={
              s.maText === false ? slovaZoZvyrazneni(vsetky, zvyraznenie?.udaje, i) : undefined
            }
          >
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

/**
 * Jedna strana — plátno v obale s pevným pomerom, aby rámčeky zvýraznenia
 * sedeli; nad ním textová vrstva (kopírovanie), pri skene hodnoty od AI
 * alebo nápoveda, že sa tu nedá nič označiť.
 */
function StranaPdf({
  strana,
  pdfjs,
  slovaSkenu,
  children,
}: {
  strana: Strana;
  pdfjs: any;
  slovaSkenu?: SlovoSkenu[];
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.replaceChildren(strana.platno);
  }, [strana.platno]);
  const sken = Boolean(pdfjs) && strana.maText === false;
  const { handlers, napoveda } = useNapovedaSkenu(sken && !slovaSkenu?.length);
  return (
    <div
      className="relative mx-auto w-full max-w-full border-b border-border last:border-b-0"
      style={{ aspectRatio: `1 / ${strana.pomer}` }}
      data-strana-pdf={strana.cislo}
      {...handlers}
    >
      <div ref={ref} className="absolute inset-0" />
      {children}
      {pdfjs && strana.maText && strana.obsah ? (
        <TextovaVrstvaPdf pdfjs={pdfjs} strana={strana.pdf} obsah={strana.obsah} />
      ) : null}
      {sken && slovaSkenu?.length ? <SlovaSkenu slova={slovaSkenu} /> : null}
      {napoveda}
    </div>
  );
}
