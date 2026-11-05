import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Highlighter } from "lucide-react";
import type { UdajeNespracovaneho } from "@/lib/faktero/nespracovane";
import type { KlucPola, SlovoNahladu } from "@/lib/faktero/vyber-z-dokladu";
import { poleVyberu } from "@/lib/faktero/vyber-z-dokladu";
import {
  jeAktivne,
  NAZVY_SKUPIN,
  polePopisuDetailu,
  SKUPINY_ZVYRAZNENIA,
  udajeNaZvyraznenie,
  zvyrazneniaUdajov,
  type SkupinaZvyraznenia,
  type Zvyraznenie,
} from "@/lib/faktero/zvyraznenie-vytazenych";
import type { DoplnokZvyraznenia, PolohaAi } from "@/lib/faktero/polohy-ai";
import { poleZPrvku } from "@/lib/faktero/pole-formulara";
import { useT } from "@/lib/i18n/useT";
import { slovaZoZvyrazneni } from "@/lib/faktero/textova-vrstva";
import { SlovaSkenu, useNapovedaSkenu } from "./TextovaVrstvaPdf";

/*
  Zvýraznenie vyťažených údajov v náhľade dokladu — rámčeky okolo miest,
  odkiaľ sa vzali hodnoty: dodávateľ, odberateľ, čísla a dátumy, každá suma,
  každý riadok rozpisu DPH, položky a platobné údaje. Hľadajú sa v textovej
  vrstve PDF; na obrázku, skene a pri údajoch, ktoré sa v texte nenašli,
  pomôže poloha, ktorú vrátila AI.

  Skupiny sa líšia farbou a čiarou rámčeka (len tokeny dizajnu, legenda pod
  lištou). Myš nad rámčekom ukáže bublinu — čo je to za údaj, hodnota a pole
  formulára; klik pole vo formulári nájde a zabliká. Pole formulára, do
  ktorého človek klikne alebo na ktoré ukáže myšou, sa v náhľade zvýrazní
  silnejšie a náhľad sa posunie na jeho miesto.
*/

/** Čo náhľad potrebuje na zvýraznenie. */
export type ZvyraznenieNahladu = {
  udaje: UdajeNespracovaneho;
  /** Polia, ktoré formulár ukazuje (iné sa nezvýrazňujú). */
  polia?: KlucPola[];
  /** Prepínač „zobraziť zvýraznenie". */
  zobrazit: boolean;
  /** Pole formulára (`KlucPola`) alebo údaj (`rozpis.0.zaklad`), na ktorom je práve kurzor. */
  aktivne?: string | null;
  /** Polohy údajov od AI (prázdne = len textová vrstva PDF). */
  polohy?: PolohaAi[];
  /** Údaje z AI, ktoré formulár nemá (odberateľ, SWIFT, záloha…). */
  doplnok?: DoplnokZvyraznenia;
};

/** Farba a čiara rámčeka podľa skupiny — len farby dizajnu (oklch premenné). */
export const STYL_SKUPINY: Record<
  SkupinaZvyraznenia,
  { farba: string; ciara: "solid" | "dashed" | "dotted" }
> = {
  dodavatel: { farba: "var(--primary)", ciara: "solid" },
  odberatel: { farba: "var(--chart-5)", ciara: "solid" },
  doklad: { farba: "var(--muted-foreground)", ciara: "solid" },
  datumy: { farba: "var(--muted-foreground)", ciara: "dashed" },
  sumy: { farba: "var(--warning)", ciara: "solid" },
  dph: { farba: "var(--warning)", ciara: "dashed" },
  platba: { farba: "var(--chart-5)", ciara: "dashed" },
  polozky: { farba: "var(--chart-2)", ciara: "dotted" },
};

/*
  Štítok pri rámčeku len pri aktívnom údaji — stále štítky rozpisu DPH (9 px) prekrývali
  čísla zmenšeného dokladu, na mobile celé stĺpce rekapitulácie (kontrola 5. 11. 2026).
  Sadzbu a kategóriu ukáže bublina a legenda.
*/

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
  const doplnok = z?.doplnok;
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
            doplnok,
          )
        : [],
    [strany, udaje, polia, polohy, doplnok],
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
  aktivne: string | null | undefined,
  zvyraznenia: Zvyraznenie[],
  zobrazit: boolean,
) {
  const ciel = zobrazit && aktivne ? zvyraznenia.find((z) => jeAktivne(z, aktivne)) : undefined;
  const kluc = ciel?.kluc ?? null;
  useEffect(() => {
    if (!kluc) return;
    const el = kontajner.current?.querySelector<HTMLElement>(
      `[data-zvyraznenie="${CSS.escape(kluc)}"]`,
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
  }, [kluc, kontajner]);
}

/** Kam vo formulári patrí údaj — veta do bubliny. */
function poleFormulara(z: Zvyraznenie, t: ReturnType<typeof useT>["t"]): string {
  const m = z.kluc.match(/^(rozpis|polozky)\.(\d+)\./);
  if (m)
    return m[1] === "rozpis"
      ? t("Pole formulára: Sumy podľa sadzieb DPH, riadok {n}", { n: Number(m[2]) + 1 })
      : t("Pole formulára: Položky, riadok {n}", { n: Number(m[2]) + 1 });
  if (z.pole) return t("Pole formulára: {pole}", { pole: t(poleVyberu(z.pole).nazov) });
  if (z.kluc === "bezDph" || z.kluc === "dph") return t("Súčet rozpisu DPH vo formulári");
  if (z.skupina === "odberatel") return t("Len na doklade — odberateľ je vaša firma");
  return t("Len na doklade — vo formulári nie je");
}

/** Prvok formulára alebo detailu, ktorý údaj predstavuje (na zablikanie). */
function prvokUdaja(z: Zvyraznenie): HTMLElement | null {
  const priamo = document.querySelector<HTMLElement>(`[data-vytazene="${CSS.escape(z.kluc)}"]`);
  if (priamo) return priamo;
  if (z.pole) {
    const vstup = [...document.querySelectorAll<HTMLElement>("input, textarea")].find(
      (el) => poleZPrvku(el) === z.pole && el.offsetParent !== null,
    );
    if (vstup) return vstup;
  }
  return (
    [...document.querySelectorAll<HTMLElement>("[data-hodnota]")].find((el) => {
      const p = polePopisuDetailu(el.getAttribute("data-hodnota"));
      return p != null && (p === z.pole || p === z.kluc);
    }) ?? null
  );
}

/** Nájde pole vo formulári, posunie sa naň (len keď nie je vidno) a zabliká ním. */
function ukazVoFormulari(z: Zvyraznenie): boolean {
  const el = prvokUdaja(z);
  if (!el) return false;
  el.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  const farba = STYL_SKUPINY[z.skupina].farba;
  el.animate?.(
    [
      { boxShadow: `0 0 0 3px color-mix(in oklch, ${farba} 70%, transparent)` },
      { boxShadow: `0 0 0 0 color-mix(in oklch, ${farba} 0%, transparent)` },
    ],
    { duration: 1400, easing: "ease-out" },
  );
  return true;
}

type Bublina = { z: Zvyraznenie; x: number; y: number; spodok: number };

/**
 * Rámčeky zvýraznenia jednej strany (vrstva nad plátnom, neprekáža klikaniu).
 * Myš sa sleduje na strane (rámčeky myš nechytajú, aby išlo označovať text),
 * pod kurzorom sa ukáže bublina; klik nájde pole vo formulári.
 */
export function ZvyrazneniaStrany({
  zvyraznenia,
  strana,
  aktivne,
  klik = true,
}: {
  zvyraznenia: Zvyraznenie[];
  strana: number;
  aktivne?: string | null;
  /** Klik na rámček ukáže pole vo formulári (vypnúť počas výberu hodnoty z dokladu). */
  klik?: boolean;
}) {
  const { t } = useT();
  const kotva = useRef<HTMLSpanElement>(null);
  const [bublina, setBublina] = useState<Bublina | null>(null);
  const [pripnute, setPripnute] = useState<string | null>(null);
  const naStrane = useMemo(
    () => zvyraznenia.filter((z) => z.strana === strana),
    [zvyraznenia, strana],
  );

  useEffect(() => {
    const plocha = kotva.current?.parentElement;
    if (!plocha || !naStrane.length) return;
    let snimka = 0;
    /*
      Ktorý rámček je pod bodom — podľa jeho polohy na obrazovke, takže to
      sedí aj pri otočenom a priblíženom náhľade. Menší rámček má prednosť
      (suma v riadku pred celým názvom).
    */
    const podBodom = (x: number, y: number): Bublina | null => {
      let naj: { z: Zvyraznenie; plocha: number; r: DOMRect } | null = null;
      for (const el of plocha.querySelectorAll<HTMLElement>("[data-zv-index]")) {
        const r = el.getBoundingClientRect();
        if (x < r.left - 2 || x > r.right + 2 || y < r.top - 2 || y > r.bottom + 2) continue;
        const z = naStrane[Number(el.dataset.zvIndex)];
        if (!z) continue;
        const p = r.width * r.height;
        if (!naj || p < naj.plocha) naj = { z, plocha: p, r };
      }
      return naj ? { z: naj.z, x: naj.r.left, y: naj.r.top, spodok: naj.r.bottom } : null;
    };
    const pohyb = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      cancelAnimationFrame(snimka);
      const { clientX, clientY } = e;
      snimka = requestAnimationFrame(() => {
        const b = podBodom(clientX, clientY);
        setBublina((s) => (s?.z === b?.z ? s : b));
      });
    };
    const odchod = () => {
      cancelAnimationFrame(snimka);
      setBublina(null);
    };
    const klikNa = (e: MouseEvent) => {
      if (!klik) return;
      const b = podBodom(e.clientX, e.clientY);
      setPripnute(b?.z.kluc ?? null);
      if (b) {
        setBublina(b);
        ukazVoFormulari(b.z);
      }
    };
    plocha.addEventListener("pointermove", pohyb);
    plocha.addEventListener("pointerleave", odchod);
    plocha.addEventListener("click", klikNa);
    return () => {
      cancelAnimationFrame(snimka);
      plocha.removeEventListener("pointermove", pohyb);
      plocha.removeEventListener("pointerleave", odchod);
      plocha.removeEventListener("click", klikNa);
    };
  }, [naStrane, klik]);

  const silne = (z: Zvyraznenie) =>
    jeAktivne(z, aktivne) || z.kluc === pripnute || z.kluc === bublina?.z.kluc;

  return (
    <>
      <span ref={kotva} hidden />
      {naStrane.flatMap((z, i) =>
        z.r.map((r, j) => {
          const akt = silne(z);
          const { farba, ciara } = STYL_SKUPINY[z.skupina];
          const stitok =
            j === 0 && z.stitok && akt
              ? t(z.stitok, z.stitokParam)
              : null;
          return (
            <div
              key={`${z.kluc}-${i}-${j}`}
              data-zvyraznenie={j === 0 ? z.kluc : undefined}
              data-zv-index={i}
              data-skupina={z.skupina}
              aria-hidden="true"
              className={`pointer-events-none absolute rounded-sm transition-colors ${akt ? "z-10" : ""}`}
              style={{
                left: `calc(${r.x * 100}% - 2px)`,
                top: `calc(${r.y * 100}% - 1px)`,
                width: `calc(${r.w * 100}% + 4px)`,
                height: `calc(${r.h * 100}% + 2px)`,
                border: `${akt ? 2 : 1.5}px ${ciara} ${farba}`,
                background: `color-mix(in oklch, ${farba} ${akt ? 26 : 9}%, transparent)`,
              }}
            >
              {stitok ? (
                <span
                  className="absolute bottom-full left-[-1px] whitespace-nowrap rounded-t-sm px-1 text-[9px] font-medium leading-[12px]"
                  style={{ background: farba, color: "var(--primary-foreground)" }}
                >
                  {stitok}
                </span>
              ) : null}
            </div>
          );
        }),
      )}
      {bublina && typeof document !== "undefined"
        ? createPortal(<BublinaUdaja b={bublina} t={t} />, document.body)
        : null}
    </>
  );
}

/** Bublina pri rámčeku: čo je to za údaj, hodnota a pole formulára. */
function BublinaUdaja({ b, t }: { b: Bublina; t: ReturnType<typeof useT>["t"] }) {
  const { z } = b;
  const { farba } = STYL_SKUPINY[z.skupina];
  // Nad rámčekom, keď je hore miesto; inak pod ním. Vodorovne v okne.
  const hore = b.y > 90;
  const left = Math.max(
    8,
    Math.min(b.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 288),
  );
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[100] w-max max-w-[280px] rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
      style={{
        left,
        ...(hore ? { bottom: window.innerHeight - b.y + 6 } : { top: b.spodok + 6 }),
      }}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ background: farba }}
        />
        <span className="text-muted-foreground">{t(NAZVY_SKUPIN[z.skupina])}</span>
        <span>· {t(z.popis, z.popisParam)}</span>
      </div>
      {z.text ? (
        <div className="mt-0.5 break-words font-semibold tabular-nums">{z.text}</div>
      ) : null}
      <div className="mt-0.5 text-muted-foreground">{poleFormulara(z, t)}</div>
      {z.zdroj === "ai" ? (
        <div className="mt-0.5 text-muted-foreground">{t("Miesto určila AI z obrázka.")}</div>
      ) : null}
    </div>
  );
}

/** Legenda farieb — len skupiny, ktoré sú na doklade zvýraznené. */
export function LegendaZvyraznenia({
  zvyraznenia,
  className = "",
}: {
  zvyraznenia: Zvyraznenie[];
  className?: string;
}) {
  const { t } = useT();
  const pocty = new Map<SkupinaZvyraznenia, number>();
  for (const z of zvyraznenia) pocty.set(z.skupina, (pocty.get(z.skupina) ?? 0) + 1);
  const skupiny = SKUPINY_ZVYRAZNENIA.filter((s) => pocty.has(s));
  if (!skupiny.length) return null;
  return (
    <ul
      aria-label={t("Legenda zvýraznenia")}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground ${className}`}
    >
      {skupiny.map((s) => {
        const { farba, ciara } = STYL_SKUPINY[s];
        return (
          <li key={s} className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-3.5 rounded-[2px]"
              style={{
                border: `1.5px ${ciara} ${farba}`,
                background: `color-mix(in oklch, ${farba} 12%, transparent)`,
              }}
            />
            {t(NAZVY_SKUPIN[s])}
          </li>
        );
      })}
      <li className="basis-full text-[11px] sm:basis-auto">
        {t("Ukážte myšou na rámček — uvidíte, ktoré pole to je.")}
      </li>
    </ul>
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
      className={`${className} ${zap ? "text-primary" : ""}`}
    >
      <Highlighter className="h-4 w-4" />
    </button>
  );
}

/** Údaj, ktorý prvok formulára predstavuje: `data-vytazene` (rozpis, položky), inak pole podľa popisu. */
function udajZPrvku(
  el: Element | null,
  poleZ: (el: EventTarget | null) => KlucPola | null,
): string | null {
  const vytazene = el?.closest?.("[data-vytazene]")?.getAttribute("data-vytazene");
  if (vytazene) return vytazene;
  // Popis aj pole sú v jednom <label> — myš na popise ukazuje na to isté pole.
  const vstup =
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      ? el
      : (el?.closest?.("label")?.querySelector("input, textarea") ?? null);
  return vstup ? poleZ(vstup) : null;
}

/**
 * Pole formulára pod myšou — zvýraznenie jeho miesta v náhľade bez kliknutia.
 * `poleZ` je prevod prvku na kľúč poľa (`poleZPrvku` z NahladSVyberom).
 * Vstupy s `data-vytazene` (riadky rozpisu DPH, položky) hlásia svoje id.
 */
export function useHoverPola(poleZ: (el: EventTarget | null) => KlucPola | null) {
  const [pole, setPole] = useState<string | null>(null);
  const posledne = useRef<string | null>(null);
  const casovac = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (casovac.current && clearTimeout(casovac.current)), []);
  /*
    S krátkym oneskorením — myš idúca cez formulár by inak náhľad posúvala
    pri každom poli, ktoré len prejde.
  */
  const nastav = (k: string | null) => {
    if (posledne.current === k) return;
    posledne.current = k;
    if (casovac.current) clearTimeout(casovac.current);
    casovac.current = setTimeout(() => setPole(k), k ? 150 : 0);
  };
  return {
    pole,
    onMouseOver: (e: { target: EventTarget | null }) =>
      nastav(udajZPrvku(e.target as Element | null, poleZ)),
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
export function useAktivnePoleDetailu(zapnute: boolean): string | null {
  const [klik, setKlik] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    if (!zapnute) return;
    let posledne: string | null = null;
    let casovac: ReturnType<typeof setTimeout> | null = null;
    const poleZ = (el: EventTarget | null) => {
      if (!(el instanceof Element)) return null;
      const v = el.closest("[data-vytazene]")?.getAttribute("data-vytazene");
      if (v) return v;
      const r = el.closest("[data-hodnota]");
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
export function useZvyraznenieDokladu(
  udaje: UdajeNespracovaneho | null | undefined,
  doplnok?: { polohy?: PolohaAi[]; doplnok?: DoplnokZvyraznenia },
) {
  const [zap, prepni] = useZobrazitZvyraznenie();
  /*
    Údaje sa smú podať aj nanovo pri každom vykreslení (`udajeZPrijatej(row)`)
    — drží sa posledný objekt, kým sa nezmení niektorá zvýrazňovaná hodnota,
    aby sa hľadanie v texte neopakovalo zbytočne.
  */
  const kluc = udaje
    ? udajeNaZvyraznenie(udaje, undefined, doplnok?.doplnok)
        .map((d) => `${d.id}=${d.hodnota ?? ""}`)
        .join("\u0001")
    : "";
  const drzane = useRef<{ kluc: string; udaje: UdajeNespracovaneho } | null>(null);
  if (!udaje) drzane.current = null;
  else if (drzane.current?.kluc !== kluc) drzane.current = { kluc, udaje };
  const stale = drzane.current?.udaje;
  const polohy = doplnok?.polohy;
  const dopl = doplnok?.doplnok;
  const zvyraznenie = useMemo(
    () => (stale ? { udaje: stale, zobrazit: zap, polohy, doplnok: dopl } : undefined),
    [stale, zap, polohy, dopl],
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
    <div>
      {zobrazit ? <LegendaZvyraznenia zvyraznenia={zvyraznenia} className="mb-2" /> : null}
      <div ref={box} className="relative mx-auto w-fit max-w-full" {...handlers}>
        <img src={url} alt={alt} className={`${className ?? ""} block`} draggable={false} />
        {zobrazit ? (
          <ZvyrazneniaStrany zvyraznenia={zvyraznenia} strana={0} aktivne={zvyraznenie?.aktivne} />
        ) : null}
        <SlovaSkenu slova={slova} />
        {napoveda}
      </div>
    </div>
  );
}

/** Obrázok nemá textovú vrstvu — jedna strana bez slov (stála hodnota pre useMemo). */
const BEZ_SLOV: SlovoNahladu[][] = [[]];
