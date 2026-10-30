import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Highlighter } from "lucide-react";
import type { UdajeNespracovaneho } from "@/lib/faktero/nespracovane";
import type { KlucPola, SlovoNahladu } from "@/lib/faktero/vyber-z-dokladu";
import { poleVyberu } from "@/lib/faktero/vyber-z-dokladu";
import { zvyrazneniaUdajov, type Zvyraznenie } from "@/lib/faktero/zvyraznenie-vytazenych";
import type { PolohaAi } from "@/lib/faktero/polohy-ai";
import { useT } from "@/lib/i18n/useT";

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

/** Obrázok dokladu s rámčekmi vyťažených údajov (polohy od AI). */
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
  if (!zvyraznenia.length) return <img src={url} alt={alt} className={className} />;
  return (
    <div ref={box} className="relative mx-auto w-fit max-w-full">
      <img src={url} alt={alt} className={`${className ?? ""} block`} />
      {zobrazit ? (
        <ZvyrazneniaStrany zvyraznenia={zvyraznenia} strana={0} aktivne={zvyraznenie?.aktivne} />
      ) : null}
    </div>
  );
}

/** Obrázok nemá textovú vrstvu — jedna strana bez slov (stála hodnota pre useMemo). */
const BEZ_SLOV: SlovoNahladu[][] = [[]];
