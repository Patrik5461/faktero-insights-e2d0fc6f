/*
  Register kontextu pre hlasové ovládanie (prehliadač).

  Stránka zverejní, čo má na obrazovke (doklady na aktuálnej strane, označené,
  otvorený doklad) a voliteľne akcie (obnoviť zoznam, potvrdiť návrh vo
  formulári). Panel hlasu si to prečíta v okamihu príkazu. Bez React kontextu —
  stránky aj panel sú v rôznych vetvách stromu.
*/
import { useEffect, useRef } from "react";
import {
  MAX_DOKLADOV_KONTEXTU,
  type DokladNaObrazovke,
  type KontextHlasu,
  type TypDokladuHlasu,
} from "./hlas";

export type AkcieStranky = {
  /** Načítať zoznam / detail znova (po potvrdení návrhu). */
  obnov?: () => void;
  /**
   * Potvrdiť návrh zaúčtovania priamo vo formulári otvoreného dokladu
   * (Nespracovaný detail: „Potvrdiť návrh“ + Uložiť). Vráti false, keď nie je čo.
   */
  potvrdNavrh?: (id: string) => Promise<boolean>;
};

export type ZaznamStranky = {
  stranka: string;
  doklady?: DokladNaObrazovke[];
  oznacene?: string[];
  otvoreny?: { typ: TypDokladuHlasu; id: string } | null;
  akcie?: AkcieStranky;
};

const zaznamy = new Map<number, ZaznamStranky>();
let dalsi = 1;

/** Posledná zverejnená stránka vyhráva (detail nad zoznamom). */
export function dajKontextHlasu(cesta: string): KontextHlasu & { akcie: AkcieStranky } {
  const vsetky = [...zaznamy.entries()].sort((a, b) => a[0] - b[0]).map(([, z]) => z);
  const posledna = vsetky[vsetky.length - 1];
  const akcie: AkcieStranky = {};
  for (const z of vsetky) Object.assign(akcie, z.akcie ?? {});
  return {
    stranka: posledna?.stranka ?? null,
    cesta,
    doklady: (posledna?.doklady ?? []).slice(0, MAX_DOKLADOV_KONTEXTU),
    oznacene: posledna?.oznacene ?? [],
    otvoreny: posledna?.otvoreny ?? null,
    akcie,
  };
}

/**
 * Stránka zverejní svoj kontext. Volať nepodmienene (pred skorým `return`).
 * `null` = nič nezverejniť. Akcie sa držia v refe, nemusia byť stabilné.
 */
export function useKontextHlasu(z: ZaznamStranky | null): void {
  const kluc = useRef<number>(0);
  if (!kluc.current) kluc.current = dalsi++;
  const akcieRef = useRef<AkcieStranky | undefined>(z?.akcie);
  akcieRef.current = z?.akcie;
  const podpis = z
    ? JSON.stringify([z.stranka, z.doklady?.map((d) => d.id), z.oznacene, z.otvoreny])
    : "";
  useEffect(() => {
    const k = kluc.current;
    if (!z) {
      zaznamy.delete(k);
      return;
    }
    zaznamy.set(k, {
      ...z,
      akcie: {
        obnov: z.akcie?.obnov ? () => akcieRef.current?.obnov?.() : undefined,
        potvrdNavrh: z.akcie?.potvrdNavrh
          ? (id) => akcieRef.current?.potvrdNavrh?.(id) ?? Promise.resolve(false)
          : undefined,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podpis]);
  useEffect(() => {
    const k = kluc.current;
    return () => {
      zaznamy.delete(k);
    };
  }, []);
}
