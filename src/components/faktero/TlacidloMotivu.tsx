import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { ulozMotiv } from "@/lib/faktero/motiv";
import { useT } from "@/lib/i18n/useT";

/**
 * Rýchle prepnutie svetlý ⇄ tmavý režim jedným klikom (hlavička webu aj
 * aplikácie). Podrobná voľba vrátane „Podľa systému“ ostáva v ponuke účtu
 * (`PrepinacMotivu`). Stav sa číta z `<html class="dark">` až v efekte, aby
 * serverové vykreslenie nesedelo inak ako prehliadač.
 */
export function TlacidloMotivu({ className = "" }: { className?: string }) {
  const { t } = useT();
  const [tmavy, setTmavy] = useState<boolean | null>(null);

  useEffect(() => {
    const koren = document.documentElement;
    const zisti = () => setTmavy(koren.classList.contains("dark"));
    zisti();
    const mo = new MutationObserver(zisti);
    mo.observe(koren, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  const popis = tmavy ? t("Svetlý režim") : t("Tmavý režim");
  return (
    <button
      type="button"
      onClick={() => ulozMotiv(tmavy ? "svetly" : "tmavy")}
      aria-label={popis}
      title={popis}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-secondary hover:text-foreground ${className}`}
    >
      {tmavy ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
