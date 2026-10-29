import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/useT";

/**
 * Dlhý zoznam sa nekreslí celý naraz.
 *
 * Prijaté faktúry či bločky väčšej firmy majú stovky riadkov a každý nesie
 * výbery, odznaky a ikonky. Päťsto riadkov naraz zablokovalo prehliadač na
 * sekundu pri otvorení a na tretinu sekundy pri každom ťuknutí (zaškrtnutie
 * prekreslí celý zoznam). Ukáže sa preto prvá dávka a ďalšia sa dokreslí,
 * keď sa k nej doroluje — súčty, výber všetkých aj export ďalej pracujú so
 * všetkými riadkami, len sa ich do stránky nekreslí viac, než treba.
 *
 * `reset` je čokoľvek, čo mení obsah zoznamu (filter, zoradenie) — vtedy sa
 * začne znova od prvej dávky. Úprava jedného riadka zoznam neskracuje.
 * `potrebneId` je riadok, ktorý musí byť vidieť (naposledy otvorený doklad).
 */
export function usePostupneZobrazenie<T extends { id?: unknown }>(
  riadky: T[],
  o: { krok?: number; reset?: unknown; potrebneId?: unknown } = {},
) {
  const { t } = useT();
  const krok = o.krok ?? 100;
  const [pocet, setPocet] = useState(krok);
  const resetKluc = JSON.stringify(o.reset ?? null);
  const prvy = useRef(true);
  useEffect(() => {
    if (prvy.current) {
      prvy.current = false;
      return;
    }
    setPocet(krok);
  }, [resetKluc, krok]);

  // Naposledy otvorený doklad hlboko v zozname musí byť nakreslený, inak k nemu
  // zoznam nedoroluje.
  const index = useMemo(
    () => (o.potrebneId == null ? -1 : riadky.findIndex((r) => r.id === o.potrebneId)),
    [riadky, o.potrebneId],
  );
  const viditelnych = Math.max(pocet, index >= 0 ? Math.ceil((index + 1) / krok) * krok : 0);
  const viditelne = useMemo(
    () => (riadky.length > viditelnych ? riadky.slice(0, viditelnych) : riadky),
    [riadky, viditelnych],
  );
  const zostava = riadky.length - viditelne.length;

  const zarazkaRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = zarazkaRef.current;
    if (!el || zostava <= 0 || typeof IntersectionObserver === "undefined") return;
    const pozorovatel = new IntersectionObserver(
      (z) => {
        if (z.some((x) => x.isIntersecting)) setPocet((p) => Math.max(p, viditelnych) + krok);
      },
      { rootMargin: "800px 0px" },
    );
    pozorovatel.observe(el);
    return () => pozorovatel.disconnect();
  }, [zostava, viditelnych, krok]);

  const dalsie = () => setPocet((p) => Math.max(p, viditelnych) + krok);

  /** Riadok tabuľky na konci zoznamu: dokreslí ďalšiu dávku. */
  function zarazkaRiadok(stlpcov: number) {
    if (zostava <= 0) return null;
    return (
      <tr
        ref={(el) => {
          zarazkaRef.current = el;
        }}
      >
        <td colSpan={stlpcov} className="p-3 text-center">
          <button
            type="button"
            onClick={dalsie}
            className="text-sm font-medium text-primary hover:underline"
          >
            {t("Zobraziť ďalšie ({n})", { n: zostava })}
          </button>
        </td>
      </tr>
    );
  }

  /** To isté mimo tabuľky (zoznam kariet). */
  function zarazka() {
    if (zostava <= 0) return null;
    return (
      <div
        ref={(el) => {
          zarazkaRef.current = el;
        }}
        className="p-3 text-center"
      >
        <button
          type="button"
          onClick={dalsie}
          className="text-sm font-medium text-primary hover:underline"
        >
          {t("Zobraziť ďalšie ({n})", { n: zostava })}
        </button>
      </div>
    );
  }

  return { viditelne, zostava, zarazkaRiadok, zarazka };
}
