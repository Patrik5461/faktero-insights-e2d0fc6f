import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  prepniRiadok,
  prepniVsetky,
  stavHlavicky,
  zuzNaViditelne,
  type StavHlavicky,
} from "@/lib/faktero/hromadny-vyber";

export type HromadnyVyber = {
  /** Označené id v poradí, v akom sú v zozname (len viditeľné). */
  ids: string[];
  pocet: number;
  stav: StavHlavicky;
  jeOznaceny: (id: string) => boolean;
  /** Klik na riadok; `shift` = rozsah od posledného kliknutého. */
  prepni: (id: string, shift?: boolean) => void;
  /** Klik na hlavičku — všetko viditeľné, alebo nič. */
  prepniVsetky: () => void;
  zrus: () => void;
};

/**
 * Hromadný výber riadkov tabuľky (číselníky v nastaveniach účtovníctva a
 * ďalšie zoznamy bez stránkovania). `viditelne` sú id riadkov po filtri v
 * poradí zobrazenia — výber z nich nikdy nevybočí: čo filter skryje, to sa
 * z výberu vyhodí. Logika je v `lib/faktero/hromadny-vyber.ts`.
 */
export function useHromadnyVyber(viditelne: readonly string[]): HromadnyVyber {
  const [oznacene, setOznacene] = useState<Set<string>>(() => new Set());
  const posledny = useRef<string | null>(null);
  // Kľúč zoznamu — efekt zúženia nebeží pri každom prekreslení, len pri zmene riadkov.
  const kluc = viditelne.join("\u0001");

  // Zúženie hneď pri kreslení, aby lišta ani na okamih neukázala skryté riadky…
  const ucinne = useMemo(() => zuzNaViditelne(viditelne, oznacene), [kluc, oznacene]); // eslint-disable-line react-hooks/exhaustive-deps
  // …a uložené, aby sa skrytý riadok po vrátení filtra znova neoznačil sám.
  useEffect(() => {
    if (ucinne !== oznacene) setOznacene(ucinne);
    if (posledny.current && !viditelne.includes(posledny.current)) posledny.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ucinne]);

  const ids = useMemo(() => viditelne.filter((id) => ucinne.has(id)), [kluc, ucinne]); // eslint-disable-line react-hooks/exhaustive-deps

  const prepni = useCallback(
    (id: string, shift = false) => {
      // Posledný riadok treba prečítať teraz — funkcia v setOznacene beží až pri ďalšom kreslení.
      const odkial = posledny.current;
      setOznacene((s) => prepniRiadok(viditelne, zuzNaViditelne(viditelne, s), id, { shift, posledny: odkial }));
      posledny.current = id;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kluc],
  );
  const prepniVsetkyCb = useCallback(() => {
    setOznacene((s) => prepniVsetky(viditelne, zuzNaViditelne(viditelne, s)));
    posledny.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kluc]);
  const zrus = useCallback(() => {
    setOznacene(new Set());
    posledny.current = null;
  }, []);

  return {
    ids,
    pocet: ids.length,
    stav: stavHlavicky(viditelne, ucinne),
    jeOznaceny: (id) => ucinne.has(id),
    prepni,
    prepniVsetky: prepniVsetkyCb,
    zrus,
  };
}
