import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Obal tabuľky v zozname dokladov: rámik a zaoblenie na vonkajšom diele,
 * vodorovný posun na vnútornom. Pri veľa stĺpcoch (Stĺpce, filtre) sa tabuľka
 * nestláča ani neoreže — pretečie do posunu.
 *
 * Posuvník je lepivý na spodku obrazovky: pri dlhom zozname by vlastný
 * posuvník obalu bol až za posledným riadkom a k posledným stĺpcom by sa
 * myšou nedalo dostať. Lišta sedí nad súčtovou lištou výberu
 * (`--vyska-listy-vyberu`). Šírka sa prepočítava pri každej zmene tabuľky
 * (prepnuté stĺpce, nové riadky, bočný náhľad) cez ResizeObserver.
 *
 * Lepivé stĺpce (zaškrtávadlo, ikona `data-stlpec-ikona`, akcie) a
 * nezalamovanie buniek rieši CSS cez `data-tabulka-zoznamu` v `styles.css`.
 */
export function TabulkaZoznamu({
  children,
  className,
  posuvClassName,
  ...ostatne
}: {
  children: ReactNode;
  className?: string;
  /** Triedy vnútorného (posúvaného) dielu, napr. `max-sm:overflow-visible` pre karty na telefóne. */
  posuvClassName?: string;
} & HTMLAttributes<HTMLDivElement>) {
  const obal = useRef<HTMLDivElement>(null);
  const posuv = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [sirka, setSirka] = useState<{ obsah: number; okno: number }>({ obsah: 0, okno: 0 });

  useEffect(() => {
    const el = posuv.current;
    if (!el) return;
    const prepocitaj = () => {
      const obsah = el.scrollWidth;
      const okno = el.clientWidth;
      setSirka((s) => (s.obsah === obsah && s.okno === okno ? s : { obsah, okno }));
      oznacPosun();
    };
    const ro = new ResizeObserver(prepocitaj);
    const sleduj = () => {
      ro.disconnect();
      ro.observe(el);
      for (const dieta of Array.from(el.children)) ro.observe(dieta);
    };
    sleduj();
    // Načítavanie → tabuľka → prázdny stav vymieňa deti obalu.
    const mo = new MutationObserver(() => {
      sleduj();
      prepocitaj();
    });
    mo.observe(el, { childList: true });
    prepocitaj();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Atribúty pre tieň lepivých stĺpcov — bez prekreslenia Reactu. */
  function oznacPosun() {
    const el = posuv.current;
    const o = obal.current;
    if (!el || !o) return;
    const max = el.scrollWidth - el.clientWidth;
    o.toggleAttribute("data-posun-vlavo", el.scrollLeft > 0);
    o.toggleAttribute("data-posun-vpravo", max > 0 && el.scrollLeft < max - 1);
  }

  const pretieka = sirka.obsah > sirka.okno + 1;

  // Lišta sa objaví až pri pretečení — prevezme polohu, kam už bol obsah posunutý.
  useEffect(() => {
    if (pretieka && lista.current && posuv.current) lista.current.scrollLeft = posuv.current.scrollLeft;
  }, [pretieka]);

  return (
    <div
      ref={obal}
      data-tabulka-zoznamu
      {...ostatne}
      className={cn("overflow-clip rounded-xl border border-border bg-card", className)}
    >
      <div
        ref={posuv}
        className={cn(
          "overflow-x-auto",
          // Vlastný posuvník nahrádza lepivá lišta nižšie — dva naraz by boli mätúce.
          pretieka && "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          posuvClassName,
        )}
        onScroll={(e) => {
          if (lista.current) lista.current.scrollLeft = e.currentTarget.scrollLeft;
          oznacPosun();
        }}
      >
        {children}
      </div>
      {pretieka && (
        <div
          ref={lista}
          aria-hidden
          data-posuvnik-zoznamu
          className={cn(
            "sticky z-20 overflow-x-auto overflow-y-hidden border-t border-border bg-card/95 backdrop-blur",
            /*
              Vlastný vzhľad posuvníka — Chrome a Safari ho potom kreslia vždy
              (nie prekryvný, ktorý sa na Macu ukáže až pri posune a v páse
              vysokom pár bodov by sa nedal chytiť).
            */
            "[&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-track]:bg-transparent",
            "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30",
            "[&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/50",
          )}
          style={{ bottom: "var(--vyska-listy-vyberu, 0px)" }}
          onScroll={(e) => {
            if (posuv.current) posuv.current.scrollLeft = e.currentTarget.scrollLeft;
          }}
        >
          <div style={{ width: sirka.obsah, height: 1 }} />
        </div>
      )}
    </div>
  );
}
