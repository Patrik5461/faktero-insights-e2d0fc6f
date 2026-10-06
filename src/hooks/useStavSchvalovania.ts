import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { stavSchvalovaniaFn } from "@/lib/faktero/schvalovanie.functions";
import type { AgendaSchvalovania } from "@/lib/faktero/schvalovanie";

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
    nacitaj({ data: { company_id: companyId, agenda, ids } })
      .then((v) => !zrusene && setR(v as any))
      .catch(() => {});
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
