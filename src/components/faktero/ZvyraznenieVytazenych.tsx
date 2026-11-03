import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Highlighter } from "lucide-react";
import type { UdajeNespracovaneho } from "@/lib/faktero/nespracovane";
import type { KlucPola, SlovoNahladu } from "@/lib/faktero/vyber-z-dokladu";
import { poleVyberu } from "@/lib/faktero/vyber-z-dokladu";
import {
  hodnotaPola,
  POLIA_ZVYRAZNENIA,
  polePopisuDetailu,
  zvyrazneniaUdajov,
  type Zvyraznenie,
} from "@/lib/faktero/zvyraznenie-vytazenych";
import type { PolohaAi } from "@/lib/faktero/polohy-ai";
import { useT } from "@/lib/i18n/useT";
import { slovaZoZvyrazneni } from "@/lib/faktero/textova-vrstva";
import { SlovaSkenu, useNapovedaSkenu } from "./TextovaVrstvaPdf";

/*
  Zvýraznenie vyťažených údajov v náhľade dokladu — rámčeky okolo miest,
  odkiaľ sa vzali hodnoty polí. Hľadajú sa v textovej vrstve PDF; na obrázku,
  skene a pri poliach, ktoré sa v texte nenašli, pomôže poloha, ktorú vrátila
  AI. Pole, do ktorého človek klikne alebo na ktoré ukáže myšou, sa zvýrazní
  silnejšie a náhľad sa posunie na jeho miesto.
*/

/** Čo náhľad potrebuje na zvýraznenie. */
export type ZvyraznenieNahladu = {
  udaje: UdajeNespracovaneho;
  /** Polia, ktoré formulár ukazuje (iné sa nezvýrazňujú). */
  polia?: KlucPola[];
  /** Prepínač „zobraziť zvýraznenie". */
  zobrazit: boolean;
  /** Pole, na ktorom je práve kurzor. */
  aktivne?: KlucPola | null;
  /** Polohy údajov od AI (prázdne = len textová vrstva PDF). */
  polohy?: PolohaAi[];
};

const KLUC_ULOZENIA = "faktero.nespracovane.zvyraznenie";

/** Prepínač zobrazenia — pamätá sa v prehliadači (len pohodlie, nie dôležitý stav). */
export function useZobrazitZvyraznenie(): [boolean, () => void] {
  const [zap, setZap] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(KLUC_ULOZENIA) === "0") setZap(false);
    } catch {
      /* úložisko nie je k dispozícii — ostane zapnuté */
    }
  }, []);
  const prepni = useCallback(() => {
    setZap((z) => {
      try {
        window.localStorage.setItem(KLUC_ULOZENIA, z ? "0" : "1");
      } catch {
        /* nevadí */
      }
      return !z;
    });
  }, []);
  return [zap, prepni];
}

/** Zvýraznenia pre slová strán — prepočítajú sa len pri zmene údajov alebo slov. */
export function useZvyraznenia(
  strany: SlovoNahladu[][],
  z: ZvyraznenieNahladu | undefined,
): Zvyraznenie[] {
  const udaje = z?.udaje;
  const polohy = z?.polohy;
  // Zoznam polí býva pri každom vykreslení nové pole — porovnáva sa obsah.
  const polia = z?.polia?.join(",");
  return useMemo(
    () =>
      udaje && (strany.some((s) => s.length) || polohy?.length)
        ? zvyrazneniaUdajov(
            strany,
            udaje,
            polia ? (polia.split(",") as KlucPola[]) : undefined,
            polohy,
          )
        : [],
    [strany, udaje, polia, polohy],
  );
}

/** Najbližší predok, ktorý sa naozaj posúva (nie okno). */
function posuvniPredkovia(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let p = el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const s = getComputedStyle(p);
    if (
      /(auto|scroll)/.test(s.overflowY + s.overflowX) &&
      (p.scrollHeight > p.clientHeight || p.scrollWidth > p.clientWidth)
    )
      out.push(p);
    p = p.parentElement;
  }
  return out;
}

/**
 * Posunie náhľad na zvýraznenie aktívneho poľa. Posúva len rámy náhľadu, nie
 * celú stránku — pole formulára, do ktorého človek práve klikol, musí ostať
 * na mieste.
 */
export function usePosunNaAktivne(
  kontajner: RefObject<HTMLElement | null>,
  aktivne: KlucPola | null | undefined,
  zvyraznenia: Zvyraznenie[],
  zobrazit: boolean,
) {
  const ma = Boolean(aktivne && zobrazit && zvyraznenia.some((z) => z.kluc === aktivne));
  useEffect(() => {
    if (!ma || !aktivne) return;
    const el = kontajner.current?.querySelector<HTMLElement>(
      `[data-zvyraznenie="${CSS.escape(aktivne)}"]`,
    );
    if (!el) return;
    for (const r of posuvniPredkovia(el)) {
      const a = el.getBoundingClientRect();
      const b = r.getBoundingClientRect();
      r.scrollBy({
        top: a.top + a.height / 2 - (b.top + b.height / 2),
        left:
          a.left < b.left || a.right > b.right ? a.left + a.width / 2 - (b.left + b.width / 2) : 0,
        behavior: "smooth",
      });
    }
  }, [ma, aktivne, kontajner]);
}

/** Rámčeky zvýraznenia jednej strany (vrstva nad plátnom, neprekáža klikaniu). */
export function ZvyrazneniaStrany({
  zvyraznenia,
  strana,
  aktivne,
}: {
  zvyraznenia: Zvyraznenie[];
  strana: number;
  aktivne?: KlucPola | null;
}) {
  const { t } = useT();
  return (
    <>
      {zvyraznenia
        .filter((z) => z.strana === strana)
        .flatMap((z, i) =>
          z.r.map((r, j) => {
            const akt = z.kluc === aktivne;
            return (
              <div
                key={`${z.kluc}-${i}-${j}`}
                data-zvyraznenie={j === 0 ? z.kluc : undefined}
                aria-hidden="true"
                title={t(poleVyberu(z.kluc).nazov)}
                className={`pointer-events-none absolute rounded-sm transition-colors ${
                  akt
                    ? "z-10 bg-sky-400/30 ring-2 ring-sky-600"
                    : "bg-sky-400/10 ring-1 ring-sky-500/70"
                }`}
                style={{
                  left: `calc(${r.x * 100}% - 2px)`,
                  top: `calc(${r.y * 100}% - 1px)`,
                  width: `calc(${r.w * 100}% + 4px)`,
                  height: `calc(${r.h * 100}% + 2px)`,
                }}
              />
            );
          }),
        )}
    </>
  );
}

/** Tlačidlo zobraziť/skryť zvýraznenie. */
export function PrepinacZvyraznenia({
  zap,
  onPrepni,
  className = "rounded-md p-2 hover:bg-secondary",
}: {
  zap: boolean;
  onPrepni: () => void;
  className?: string;
}) {
  const { t } = useT();
  const popis = zap ? t("Skryť zvýraznenie vyťažených údajov") : t("Zvýrazniť vyťažené údaje");
  return (
    <button
      type="button"
      aria-pressed={zap}
      title={popis}
      aria-label={popis}
      onClick={onPrepni}
      className={`${className} ${zap ? "text-sky-600 dark:text-sky-400" : ""}`}
    >
      <Highlighter className="h-4 w-4" />
    </button>
  );
}

/**
 * Pole formulára pod myšou — zvýraznenie jeho miesta v náhľade bez kliknutia.
 * `poleZ` je prevod prvku na kľúč poľa (`poleZPrvku` z NahladSVyberom).
 */
export function useHoverPola(poleZ: (el: EventTarget | null) => KlucPola | null) {
  const [pole, setPole] = useState<KlucPola | null>(null);
  const posledne = useRef<KlucPola | null>(null);
  const casovac = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (casovac.current && clearTimeout(casovac.current)), []);
  /*
    S krátkym oneskorením — myš idúca cez formulár by inak náhľad posúvala
    pri každom poli, ktoré len prejde.
  */
  const nastav = (k: KlucPola | null) => {
    if (posledne.current === k) return;
    posledne.current = k;
    if (casovac.current) clearTimeout(casovac.current);
    casovac.current = setTimeout(() => setPole(k), k ? 150 : 0);
  };
  return {
    pole,
    onMouseOver: (e: { target: EventTarget | null }) => {
      const el = e.target as Element | null;
      // Popis aj pole sú v jednom <label> — myš na popise ukazuje na to isté pole.
      const vstup =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
          ? el
          : (el?.closest?.("label")?.querySelector("input, textarea") ?? null);
      nastav(vstup ? poleZ(vstup) : null);
    },
    onMouseLeave: () => nastav(null),
  };
}

/**
 * Pole detailu dokladu pod myšou alebo naposledy kliknuté — rámčeky `Hodnota`
 * a `Pole` nesú popis v `data-hodnota`. Náhľad sa potom posunie na miesto
 * údaja ako v Nespracovaných (tam to robí `useHoverPola` nad formulárom).
 * Počúva na celom dokumente — panel s údajmi je súrodenec náhľadu a detail
 * je na stránke jeden, tak ho netreba nič učiť.
 */
export function useAktivnePoleDetailu(zapnute: boolean): KlucPola | null {
  const [klik, setKlik] = useState<KlucPola | null>(null);
  const [hover, setHover] = useState<KlucPola | null>(null);
  useEffect(() => {
    if (!zapnute) return;
    let posledne: KlucPola | null = null;
    let casovac: ReturnType<typeof setTimeout> | null = null;
    const poleZ = (el: EventTarget | null) => {
      const r = el instanceof Element ? el.closest("[data-hodnota]") : null;
      return r ? polePopisuDetailu(r.getAttribute("data-hodnota")) : null;
    };
    const nad = (e: Event) => {
      const k = poleZ(e.target);
      if (posledne === k) return;
      posledne = k;
      if (casovac) clearTimeout(casovac);
      casovac = setTimeout(() => setHover(k), k ? 150 : 0);
    };
    const vyber = (e: Event) => {
      const k = poleZ(e.target);
      if (k) setKlik(k);
    };
    document.addEventListener("mouseover", nad);
    document.addEventListener("focusin", vyber);
    document.addEventListener("click", vyber);
    return () => {
      if (casovac) clearTimeout(casovac);
      document.removeEventListener("mouseover", nad);
      document.removeEventListener("focusin", vyber);
      document.removeEventListener("click", vyber);
    };
  }, [zapnute]);
  return hover ?? klik;
}

/**
 * Zvýraznenie údajov uloženého dokladu (detail prijatej faktúry, bločku…) —
 * prepínač je spoločný s Nespracovanými (zapamätaný, predvolene zapnutý).
 */
export function useZvyraznenieDokladu(udaje: UdajeNespracovaneho | null | undefined) {
  const [zap, prepni] = useZobrazitZvyraznenie();
  /*
    Údaje sa smú podať aj nanovo pri každom vykreslení (`udajeZPrijatej(row)`)
    — drží sa posledný objekt, kým sa nezmení niektorá zvýrazňovaná hodnota,
    aby sa hľadanie v texte neopakovalo zbytočne.
  */
  const kluc = udaje
    ? POLIA_POLOH_KLUCE.map((k) => String(hodnotaPola(udaje, k) ?? "")).join("\u0001")
    : "";
  const drzane = useRef<{ kluc: string; udaje: UdajeNespracovaneho } | null>(null);
  if (!udaje) drzane.current = null;
  else if (drzane.current?.kluc !== kluc) drzane.current = { kluc, udaje };
  const stale = drzane.current?.udaje;
  const zvyraznenie = useMemo(
    () => (stale ? { udaje: stale, zobrazit: zap } : undefined),
    [stale, zap],
  );
  return { zvyraznenie, zap, prepni };
}

/**
 * Obrázok dokladu s rámčekmi vyťažených údajov (polohy od AI). Obrázok nemá
 * text — hodnoty od AI sa nad ním dajú označiť a skopírovať, inak pri pokuse
 * o označenie ukáže krátku nápovedu.
 */
export function ObrazokSoZvyraznenim({
  url,
  alt,
  className,
  zvyraznenie,
}: {
  url: string;
  alt: string;
  className?: string;
  zvyraznenie?: ZvyraznenieNahladu;
}) {
  const box = useRef<HTMLDivElement>(null);
  const zvyraznenia = useZvyraznenia(BEZ_SLOV, zvyraznenie);
  const zobrazit = Boolean(zvyraznenie?.zobrazit);
  usePosunNaAktivne(box, zvyraznenie?.aktivne, zvyraznenia, zobrazit);
  const slova = useMemo(
    () => slovaZoZvyrazneni(zvyraznenia, zvyraznenie?.udaje, 0),
    [zvyraznenia, zvyraznenie?.udaje],
  );
  const { handlers, napoveda } = useNapovedaSkenu(!slova.length);
  if (!zvyraznenia.length)
    return (
      <div className="relative" {...handlers}>
        <img src={url} alt={alt} className={className} draggable={false} />
        {napoveda}
      </div>
    );
  return (
    <div ref={box} className="relative mx-auto w-fit max-w-full" {...handlers}>
      <img src={url} alt={alt} className={`${className ?? ""} block`} draggable={false} />
      {zobrazit ? (
        <ZvyrazneniaStrany zvyraznenia={zvyraznenia} strana={0} aktivne={zvyraznenie?.aktivne} />
      ) : null}
      <SlovaSkenu slova={slova} />
      {napoveda}
    </div>
  );
}

/** Hodnoty, od ktorých zvýraznenie závisí (aj názov dodávateľa — poloha od AI). */
const POLIA_POLOH_KLUCE = [...POLIA_ZVYRAZNENIA, "dodavatel.nazov"] as KlucPola[];

/** Obrázok nemá textovú vrstvu — jedna strana bez slov (stála hodnota pre useMemo). */
const BEZ_SLOV: SlovoNahladu[][] = [[]];
