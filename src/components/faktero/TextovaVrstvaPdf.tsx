import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Info } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { mierkaTextovejVrstvy, type SlovoSkenu } from "@/lib/faktero/textova-vrstva";

/*
  Kopírovateľný text v náhľade dokladu.

  `TextovaVrstvaPdf` — priehľadná textová vrstva pdf.js nad plátnom strany:
  text sa dá myšou označiť a skopírovať (Ctrl+C), označenie je modré. Vrstva
  sa kreslí až po plátne (kreslenie strany nečaká na text) a mierku si
  prepočíta sama pri každej zmene šírky strany — okno, priblíženie
  v kompaktnom rozložení. Otočenie je transformácia predka, vrstva ide s ním.

  `SlovaSkenu` — sken bez textu: hodnoty vyťažených údajov na miestach,
  ktoré určila AI. `useNapovedaSkenu` — keď sa niekto pokúsi označiť text
  na skene, kde nič nie je, ukáže nenápadnú vetu „Sken bez textu…".
*/

export function TextovaVrstvaPdf({
  pdfjs,
  strana,
  obsah,
  pasivna = false,
}: {
  /** Načítaný modul `pdfjs-dist`. */
  pdfjs: any;
  /** Strana z `dokument.getPage()`. */
  strana: any;
  /** Výsledok `strana.getTextContent()`. */
  obsah: any;
  /** Myš prechádza na vrstvu pod textom (výber oblasti v Nespracovaných). */
  pasivna?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obal = ref.current;
    if (!obal || !pdfjs?.TextLayer || !obsah) return;
    /*
      Každé spustenie kreslí do vlastného vnútorného prvku. `TextLayer.cancel()`
      sa nevolá — v pdf.js 6 po zrušení počas čítania spadne na `reader.read`
      (null) do nezachytenej chyby; stará vrstva radšej dobehne do odpojeného
      prvku, ktorý sa zahodí.
    */
    const el = document.createElement("div");
    el.className = "faktero-text-vrstva";
    obal.replaceChildren(el);
    const viewport = strana.getViewport({ scale: 1 });
    const vrstva = new pdfjs.TextLayer({ textContentSource: obsah, container: el, viewport });
    let zrusene = false;
    vrstva
      .render()
      .then(() => {
        if (zrusene) return;
        const koniec = document.createElement("div");
        koniec.className = "endOfContent";
        el.append(koniec);
      })
      .catch(() => {
        /* strana bez textu — nič */
      });

    // Mierka podľa šírky strany (bez transformácií — tie nesie predok).
    const stranaEl = obal.parentElement;
    const nastav = () => {
      const m = mierkaTextovejVrstvy(stranaEl?.clientWidth ?? 0, viewport.width);
      if (m) el.style.setProperty("--total-scale-factor", String(m));
    };
    nastav();
    const ro =
      typeof ResizeObserver !== "undefined" && stranaEl ? new ResizeObserver(nastav) : null;
    if (ro && stranaEl) ro.observe(stranaEl);

    // Ťah cez prázdne miesto nemá preskakovať označenie (ako v prehliadači pdf.js).
    const dole = () => el.classList.add("selecting");
    const hore = () => el.classList.remove("selecting");
    el.addEventListener("pointerdown", dole);
    document.addEventListener("pointerup", hore);
    return () => {
      zrusene = true;
      ro?.disconnect();
      el.removeEventListener("pointerdown", dole);
      document.removeEventListener("pointerup", hore);
      el.remove();
    };
  }, [pdfjs, strana, obsah]);

  return (
    <div
      ref={ref}
      className="faktero-text-obal"
      data-textova-vrstva=""
      data-pasivna={pasivna ? "" : undefined}
    />
  );
}

/** Hodnoty vyťažených údajov nad skenom (polohy od AI) — dajú sa označiť a skopírovať. */
export function SlovaSkenu({ slova }: { slova: SlovoSkenu[] }) {
  if (!slova.length) return null;
  return (
    <div className="faktero-slova-skenu" data-slova-skenu="">
      {slova.map((s) => (
        <span
          key={s.kluc}
          style={{
            left: `${s.x * 100}%`,
            top: `${s.y * 100}%`,
            fontSize: `${(s.h * 85).toFixed(3)}cqh`,
          }}
        >
          {s.text}
          {"\n"}
        </span>
      ))}
    </div>
  );
}

/** Pohyb myši (px) so stlačeným tlačidlom, od ktorého je to pokus o označenie. */
const PRAH = 6;

/**
 * Nápoveda pre sken bez textu — ukáže sa až keď sa niekto pokúsi ťahom
 * označiť text, a po chvíli zmizne. `zapnuta` = strana naozaj nemá text.
 */
export function useNapovedaSkenu(zapnuta: boolean) {
  const { t } = useT();
  const [vidno, setVidno] = useState(false);
  const zaciatok = useRef<{ x: number; y: number } | null>(null);
  const casovac = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (casovac.current && clearTimeout(casovac.current)), []);
  const ukaz = () => {
    setVidno(true);
    if (casovac.current) clearTimeout(casovac.current);
    casovac.current = setTimeout(() => setVidno(false), 2800);
  };
  const handlers = zapnuta
    ? {
        onPointerDown: (e: ReactPointerEvent) => {
          zaciatok.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
        },
        onPointerMove: (e: ReactPointerEvent) => {
          const z = zaciatok.current;
          if (!z || !(e.buttons & 1)) return;
          if (Math.hypot(e.clientX - z.x, e.clientY - z.y) > PRAH) {
            zaciatok.current = null;
            ukaz();
          }
        },
        onPointerUp: () => {
          zaciatok.current = null;
        },
        onDragStart: (e: { preventDefault: () => void }) => {
          // Obrázok by sa inak začal ťahať ako súbor.
          e.preventDefault();
          ukaz();
        },
      }
    : {};
  const napoveda =
    zapnuta && vidno ? (
      <div
        role="status"
        className="pointer-events-none absolute left-1/2 top-2 z-20 inline-flex w-max max-w-[90%] -translate-x-1/2 items-center whitespace-nowrap gap-1.5 rounded-md bg-foreground/80 px-2.5 py-1 text-xs text-background shadow"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        {t("Sken bez textu – kopírovanie nie je možné")}
      </div>
    ) : null;
  return { handlers, napoveda };
}
