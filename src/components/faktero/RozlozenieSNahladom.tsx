import { Fragment, useLayoutEffect, useRef, type ReactNode } from "react";
import { PanelLeft, PanelRight } from "lucide-react";
import { useStranaNahladu, type StranaNahladu } from "@/hooks/useStranaNahladu";
import { useT } from "@/lib/i18n/useT";

/** `useLayoutEffect` hlási na serveri varovanie — tam sa nič nepresúva. */
const useIzomorfnyLayoutEffect = typeof window === "undefined" ? () => {} : useLayoutEffect;

/**
 * Dva stĺpce — náhľad dokladu a obsah (formulár, detail, zoznam) — v poradí
 * podľa voľby používateľa. Poradie sa mení v DOM, nie cez CSS `order`, aby
 * tabulátor aj čítačka išli v tom poradí, v akom to človek vidí.
 *
 * `stlpceVlavo`/`stlpceVpravo` sú celé triedy Tailwindu so šírkami stĺpcov
 * (napr. `lg:grid-cols-[minmax(0,1fr)_440px]` a zrkadlovo
 * `lg:grid-cols-[440px_minmax(0,1fr)]`) — musia byť v kóde celé, inak ich
 * Tailwind nevygeneruje.
 *
 * Keď náhľad nie je (`nahlad` je null/false), vráti len obsah v `className`.
 */
export function RozlozenieSNahladom({
  nahlad,
  children,
  className,
  stlpceVlavo,
  stlpceVpravo,
  strana: vynutena,
}: {
  nahlad: ReactNode;
  children: ReactNode;
  className: string;
  stlpceVlavo: string;
  stlpceVpravo: string;
  /** Len keď volajúci už stranu pozná (inak si ju zistí sám). */
  strana?: StranaNahladu;
}) {
  const { strana: zvolena } = useStranaNahladu();
  const strana = vynutena ?? zvolena;
  const bezNahladu = nahlad === null || nahlad === undefined || nahlad === false;

  /*
    Presun uzla v DOM zhodí fokus (prehliadač ho pri vybratí uzla stratí).
    Prvok s fokusom si zapamätáme ešte pred presunom a po ňom ho vrátime —
    platí pre prepínač aj pre pole, v ktorom človek práve písal.
  */
  const sFokusom = useRef<Element | null>(null);
  if (typeof document !== "undefined") sFokusom.current = document.activeElement;
  useIzomorfnyLayoutEffect(() => {
    const el = sFokusom.current as HTMLElement | null;
    if (el && el !== document.body && el.isConnected && document.activeElement !== el) {
      el.focus({ preventScroll: true });
    }
  }, [strana]);

  if (bezNahladu) return <div className={className}>{children}</div>;
  const n = <Fragment key="nahlad">{nahlad}</Fragment>;
  const o = <Fragment key="obsah">{children}</Fragment>;
  return (
    <div
      className={`${className} ${strana === "vlavo" ? stlpceVlavo : stlpceVpravo}`}
      data-strana-nahladu={strana}
    >
      {strana === "vlavo" ? [n, o] : [o, n]}
    </div>
  );
}

/**
 * Malé tlačidlo do hlavičky náhľadu: presunie náhľad na druhú stranu.
 * Na úzkej obrazovke (stĺpce pod sebou) sa neukazuje — tam sa voľba mení
 * v Nastaveniach.
 */
export function PrepinacStranyNahladu({ className = "p-1" }: { className?: string }) {
  const { t } = useT();
  const { strana, prepni } = useStranaNahladu();
  const ref = useRef<HTMLButtonElement>(null);
  const popis = strana === "vlavo" ? t("Presunúť náhľad doprava") : t("Presunúť náhľad doľava");
  const Ikona = strana === "vlavo" ? PanelRight : PanelLeft;
  return (
    <button
      ref={ref}
      type="button"
      aria-label={popis}
      title={popis}
      data-prepinac-strany-nahladu=""
      onClick={() => {
        prepni();
        // Rozloženie fokus vráti samo; toto je poistka pre prípad, že sa tlačidlo prekreslí neskôr.
        requestAnimationFrame(() => {
          if (ref.current && document.activeElement !== ref.current)
            ref.current.focus({ preventScroll: true });
        });
      }}
      className={`hidden rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground lg:inline-flex ${className}`}
    >
      <Ikona className="h-4 w-4" />
    </button>
  );
}

/** Voľba do Nastavení — dve tlačidlá Vľavo / Vpravo. */
export function VolbaStranyNahladu() {
  const { t } = useT();
  const { strana, zmen } = useStranaNahladu();
  return (
    <div
      className="inline-flex rounded-lg border border-border p-0.5 text-sm"
      role="group"
      aria-label={t("Strana náhľadu dokladu")}
    >
      {(
        [
          ["vlavo", "Náhľad vľavo", PanelLeft],
          ["vpravo", "Náhľad vpravo", PanelRight],
        ] as const
      ).map(([k, n, I]) => (
        <button
          key={k}
          type="button"
          aria-pressed={strana === k}
          onClick={() => zmen(k)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 ${strana === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
        >
          <I className="h-4 w-4" /> {t(n)}
        </button>
      ))}
    </div>
  );
}
