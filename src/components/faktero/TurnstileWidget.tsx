import { useEffect, useRef, useState } from "react";

/**
 * Widget Cloudflare Turnstile (captcha) pre registráciu — web aj appka.
 *
 * Skript sa načíta až tu, teda len na stránke s registráciou, a vykreslí sa
 * explicitne (`render=explicit`), aby sme mali v rukách reset a odstránenie.
 *
 * `appearance: "always"`: widget je vidno stále. Pri „interaction-only“ by sa
 * väčšinou neukázal vôbec — lenže keď overenie neprejde alebo sa zasekne,
 * človek nevidí prečo a tlačidlo „Vytvoriť účet“ by len hlásilo chybu.
 * Viditeľný stav („Overujem… / Úspech“) a popis nad ním sú aj pre čítačku.
 *
 * Token platí 300 s a dá sa použiť raz. Po vypršaní ho widget obnoví sám
 * (`refresh-expired: auto`); po každom odoslaní na server ho treba resetovať
 * — to robí rodič zmenou `reset`.
 */

const SKRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, o: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

let nacitanie: Promise<void> | null = null;

function nacitajSkript(casMs = 15_000): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("mimo prehliadača"));
  if (window.turnstile) return Promise.resolve();
  if (nacitanie) return nacitanie;
  nacitanie = new Promise<void>((hotovo, chyba) => {
    const s = document.createElement("script");
    s.src = SKRIPT;
    s.async = true;
    s.defer = true;
    const casovac = setTimeout(() => chyba(new Error("timeout")), casMs);
    s.onload = () => {
      clearTimeout(casovac);
      window.turnstile ? hotovo() : chyba(new Error("bez turnstile"));
    };
    s.onerror = () => {
      clearTimeout(casovac);
      chyba(new Error("skript sa nenačítal"));
    };
    document.head.appendChild(s);
  }).catch((e) => {
    // Ďalší pokus (napr. po vypnutí blokovania reklám) má skúsiť odznova.
    nacitanie = null;
    odstranSkript();
    throw e;
  });
  return nacitanie;
}

function odstranSkript() {
  document.querySelectorAll(`script[src="${SKRIPT}"]`).forEach((el) => el.remove());
}

/** Jazyky, ktoré Turnstile pozná; inak nech si vyberie podľa prehliadača. */
function jazykWidgetu(j: string | null | undefined): string {
  return j && ["sk", "cs", "de", "en", "hu"].includes(j) ? j : "auto";
}

export type StavCaptchy = "nacitavam" | "pripravene" | "chyba";

export function TurnstileWidget({
  siteKey,
  jazyk,
  akcia,
  onToken,
  onStav,
  reset,
  popis,
  chybaNacitania,
  className = "",
}: {
  siteKey: string | null | undefined;
  jazyk: string;
  /** `action` — server ho porovnáva (`AKCIE_TURNSTILE`). */
  akcia: "registracia" | "registracia-apka" | "faktura-zadarmo";
  onToken: (token: string | null) => void;
  onStav?: (stav: StavCaptchy) => void;
  /** Zmena hodnoty widget resetuje (token je jednorazový). */
  reset: number;
  popis: string;
  chybaNacitania: string;
  className?: string;
}) {
  const miesto = useRef<HTMLDivElement>(null);
  const idWidgetu = useRef<string | null>(null);
  const [stav, setStav] = useState<StavCaptchy>("nacitavam");
  // Najnovšie spätné volania bez toho, aby sa widget pri každom prekreslení vykresľoval znova.
  const volania = useRef({ onToken, onStav });
  volania.current = { onToken, onStav };

  const zmenStav = (s: StavCaptchy) => {
    setStav(s);
    volania.current.onStav?.(s);
  };

  useEffect(() => {
    if (!siteKey) {
      zmenStav("chyba");
      return;
    }
    let zruseny = false;
    zmenStav("nacitavam");
    nacitajSkript()
      .then(() => {
        if (zruseny || !miesto.current || !window.turnstile) return;
        idWidgetu.current = window.turnstile.render(miesto.current, {
          sitekey: siteKey,
          action: akcia,
          theme: "auto",
          language: jazykWidgetu(jazyk),
          appearance: "always",
          "refresh-expired": "auto",
          "response-field": false,
          callback: (t: string) => {
            zmenStav("pripravene");
            volania.current.onToken(t);
          },
          "expired-callback": () => volania.current.onToken(null),
          "timeout-callback": () => {
            volania.current.onToken(null);
            if (idWidgetu.current) window.turnstile?.reset(idWidgetu.current);
          },
          "error-callback": () => {
            volania.current.onToken(null);
            zmenStav("chyba");
            // Vlastné spracovanie — widget potom skúša znova sám (retry: auto).
            return true;
          },
        });
      })
      .catch(() => {
        if (!zruseny) zmenStav("chyba");
      });
    return () => {
      zruseny = true;
      if (idWidgetu.current) {
        try {
          window.turnstile?.remove(idWidgetu.current);
        } catch {
          /* widget už nie je */
        }
        idWidgetu.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, jazyk, akcia]);

  // Reset po odoslaní — nie pri prvom vykreslení.
  const prvy = useRef(true);
  useEffect(() => {
    if (prvy.current) {
      prvy.current = false;
      return;
    }
    volania.current.onToken(null);
    if (idWidgetu.current) {
      try {
        window.turnstile?.reset(idWidgetu.current);
      } catch {
        /* nič */
      }
    }
  }, [reset]);

  return (
    <div role="group" aria-label={popis} className={className}>
      <span className="mb-1 block text-sm font-medium">{popis}</span>
      <div ref={miesto} className="min-h-[65px]" />
      {stav === "chyba" && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {chybaNacitania}
        </p>
      )}
    </div>
  );
}
