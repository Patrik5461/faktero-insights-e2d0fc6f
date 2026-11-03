import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { navrhyKodovFn } from "@/lib/faktero/zauctovanie.functions";
import {
  prvePravidlo,
  type DokladNaPorovnanie,
  type Pravidlo,
} from "@/lib/faktero/pravidla-uctovania";
import { useT } from "@/lib/i18n/useT";
import { textKvAuto } from "@/lib/faktero/kv-auto";

/**
 * Predvyplnenie členenia KV vo formulári, kým doklad nie je uložený:
 * pravidlo automatického účtovania (to isté, ktoré pri uložení použije spúšťač
 * v databáze) → predvolené firmy (Predkontácie → Predvolené). Zákonné
 * odvodenie (`kv-auto.ts`) dopočíta volajúci z údajov dokladu.
 */
export function usePredvyplnenieKv(
  companyId: string | null | undefined,
  pre: "prijata" | "doklad" | "vystavena",
  doklad: DokladNaPorovnanie | null,
  typ?: string,
  /** false = predvolené má volajúci z vlastných návrhov kódov (nenačítava sa znova). */
  nacitatPredvolene = true,
): { predvolene: string | null; pravidlo: { nazov: string; kv: string } | null } {
  const nacitajNavrhy = useServerFn(navrhyKodovFn);
  const [predvolene, setPredvolene] = useState<string | null>(null);
  const [pravidla, setPravidla] = useState<(Pravidlo & { id: string })[]>([]);
  useEffect(() => {
    if (!companyId || !nacitatPredvolene) return;
    let zive = true;
    nacitajNavrhy({ data: { company_id: companyId, pre, ...(typ ? { typ } : {}) } })
      .then((n) => zive && setPredvolene(((n as any)?.predvoleneKv as string | null) ?? null))
      .catch(() => {});
    return () => {
      zive = false;
    };
  }, [companyId, pre, typ, nacitajNavrhy, nacitatPredvolene]);
  useEffect(() => {
    if (!companyId) return;
    let zive = true;
    // Tabuľka pravidiel nie je v generovaných typoch — číta sa ako vo VyberPravidla.
    (supabase as any)
      .from("pravidla_uctovania")
      .select("*")
      .eq("company_id", companyId)
      .eq("aktivne", true)
      .order("poradie")
      .then(({ data }: { data: unknown[] | null }) => zive && setPravidla((data ?? []) as any));
    return () => {
      zive = false;
    };
  }, [companyId]);
  const kluc = doklad ? JSON.stringify(doklad) : "";
  const pravidlo = useMemo(() => {
    if (!doklad || !(doklad.supplier_ico || doklad.supplier_name)) return null;
    const p = prvePravidlo(pravidla, doklad);
    const kv = String(p?.kv_clenenie ?? "").trim();
    return p && kv ? { nazov: p.nazov, kv } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pravidla, kluc]);
  return { predvolene, pravidlo };
}

/**
 * Výber „Členenie KV DPH“ — prázdna voľba ukazuje, čo doklad dostane, keď sa
 * nič nevyberie: kód z pravidla, inak automatické určenie podľa zákona
 * (`kv-auto.ts`, to isté ako výkaz aj export).
 */
export function VyberKvDph({
  id,
  value,
  onChange,
  moznosti,
  auto,
  pravidlo,
  className,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  moznosti: readonly { kod: string; nazov: string }[];
  /** Automatické členenie ("" = do KV nepatrí, undefined = nevie sa). */
  auto?: string;
  pravidlo?: { nazov: string; kv: string } | null;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useT();
  return (
    <select
      id={id}
      aria-label={t("Členenie KV DPH")}
      data-kv-vyber=""
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">
        {pravidlo
          ? t("z pravidla „{nazov}“ ({kod})", { nazov: pravidlo.nazov, kod: pravidlo.kv })
          : textKvAuto(t, auto)}
      </option>
      {moznosti.map((k) => (
        <option key={k.kod} value={k.kod}>
          {t(k.nazov)}
        </option>
      ))}
    </select>
  );
}
