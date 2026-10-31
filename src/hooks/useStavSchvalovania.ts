import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { stavSchvalovaniaFn } from "@/lib/faktero/schvalovanie.functions";
import type { AgendaSchvalovania } from "@/lib/faktero/schvalovanie";

/** Koľko dokladov sa pošle naraz (server prijme najviac 1 000). */
export const DAVKA_SCHVALOVANIA = 500;

/** Rozdelí zoznam na dávky po `n`. */
export function poDavkach<T>(zoznam: T[], n: number): T[][] {
  const von: T[][] = [];
  for (let i = 0; i < zoznam.length; i += n) von.push(zoznam.slice(i, i + n));
  return von;
}

export type StavRiadku = { stav: string; odznak: string; mozem: boolean };

/**
 * Stav schvaľovania pre riadky zoznamu. Keď schvaľovanie nie je zapnuté,
 * vráti prázdnu mapu a `zapnute: false` — zoznam vtedy nič nekreslí.
 */
export function useStavSchvalovania(
  companyId: string | null | undefined,
  agenda: AgendaSchvalovania,
  ids: string[],
): { zapnute: boolean; stavy: Record<string, StavRiadku>; obnov: () => void } {
  const nacitaj = useServerFn(stavSchvalovaniaFn);
  const [r, setR] = useState<{ zapnute: boolean; stavy: Record<string, StavRiadku> }>({
    zapnute: false,
    stavy: {},
  });
  const [verzia, setVerzia] = useState(0);
  const kluc = ids.join(",");
  useEffect(() => {
    if (!companyId || !ids.length) return;
    let zrusene = false;
    /*
      Server prijme najviac 1 000 dokladov naraz — zoznam s viac riadkami
      (doklady za celý rok) predtým spadol na ZodError a odznaky nebolo vidieť
      nikde (Admin → Chyby, 31. 10. 2026). Pýta sa preto po dávkach.
    */
    void (async () => {
      const spolu: { zapnute: boolean; stavy: Record<string, StavRiadku> } = {
        zapnute: false,
        stavy: {},
      };
      for (const davka of poDavkach(ids, DAVKA_SCHVALOVANIA)) {
        const v = (await nacitaj({ data: { company_id: companyId, agenda, ids: davka } })) as {
          zapnute: boolean;
          stavy: Record<string, StavRiadku>;
        };
        if (zrusene) return;
        if (!v.zapnute) return setR({ zapnute: false, stavy: {} });
        spolu.zapnute = true;
        Object.assign(spolu.stavy, v.stavy);
      }
      if (!zrusene) setR(spolu);
    })().catch(() => {});
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, agenda, kluc, verzia]);
  return { ...r, obnov: () => setVerzia((v) => v + 1) };
}

export function farbaOdznaku(stav: string | undefined): string {
  return stav === "schvaleny"
    ? "text-emerald-700"
    : stav === "zamietnuty"
      ? "text-red-700"
      : stav === "vrateny"
        ? "text-sky-700"
        : "text-amber-700";
}
