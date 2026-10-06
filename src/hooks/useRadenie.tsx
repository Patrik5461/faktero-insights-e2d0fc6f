import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

type Hodnota = string | number | null | undefined;

/**
 * Zoraďovanie zoznamu kliknutím na hlavičku stĺpca (A–Z, Z–A, pôvodné
 * poradie). Radí sa v prehliadači nad načítaným výberom; čísla ako čísla,
 * text podľa slovenskej abecedy.
 */
export function useRadenie<T>(riadky: T[], hodnoty: Record<string, (r: T) => Hodnota>) {
  const [stav, setStav] = useState<{ kluc: string; smer: 1 | -1 } | null>(null);
  const zoradene = useMemo(() => {
    if (!stav) return riadky;
    const f = hodnoty[stav.kluc];
    if (!f) return riadky;
    return [...riadky].sort((a, b) => {
      const x = f(a);
      const y = f(b);
      if (x == null || x === "") return 1;
      if (y == null || y === "") return -1;
      const v =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "sk", { numeric: true });
      return v * stav.smer;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riadky, stav]);

  function prepni(kluc: string) {
    setStav((s) => (!s || s.kluc !== kluc ? { kluc, smer: 1 } : s.smer === 1 ? { kluc, smer: -1 } : null));
  }

  /** Obsah hlavičky stĺpca s tlačidlom na zoradenie. */
  function hlavicka(kluc: string, obsah: ReactNode) {
    const aktivny = stav?.kluc === kluc;
    const Ikona = !aktivny ? ArrowUpDown : stav!.smer === 1 ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => prepni(kluc)}
        className="inline-flex items-center gap-1 uppercase hover:text-foreground"
        aria-label={`Zoradiť podľa: ${typeof obsah === "string" ? obsah : kluc}`}
      >
        {obsah}
        <Ikona className={`h-3 w-3 ${aktivny ? "text-foreground" : "opacity-40"}`} />
      </button>
    );
  }

  return { zoradene, hlavicka, stav };
}
