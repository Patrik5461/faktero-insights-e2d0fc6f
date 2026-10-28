import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  popisPredlohy,
  predlohyPreDruh,
  type DruhPredlohy,
  type Predloha,
} from "@/lib/faktero/predlohy-uctovania";
import { useT } from "@/lib/i18n/useT";

type PredlohaSId = Predloha & { id: string };

/**
 * „Použiť predlohu" v paneli zaúčtovania — pomenovaná šablóna kódov, ktorú
 * účtovník použije jedným klikom. Bez predlôh sa nič neukáže.
 */
export function PouzitPredlohu({
  companyId,
  druh,
  onPouzi,
  className = "",
}: {
  companyId: string;
  druh: DruhPredlohy;
  onPouzi: (p: Predloha) => void;
  className?: string;
}) {
  const { t } = useT();
  const [predlohy, setPredlohy] = useState<PredlohaSId[]>([]);
  const [vybrana, setVybrana] = useState("");

  useEffect(() => {
    let zrusene = false;
    supabase
      .from("predlohy_uctovania")
      .select("*")
      .eq("company_id", companyId)
      .order("poradie")
      .then(({ data }) => {
        if (!zrusene) setPredlohy(predlohyPreDruh((data ?? []) as PredlohaSId[], druh));
      });
    return () => {
      zrusene = true;
    };
  }, [companyId, druh]);

  if (!predlohy.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${className}`}>
      <select
        aria-label={t("Predloha zaúčtovania")}
        value={vybrana}
        onChange={(e) => setVybrana(e.target.value)}
        className="min-w-0 max-w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
      >
        <option value="">{t("Použiť predlohu…")}</option>
        {predlohy.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nazov}
            {popisPredlohy(p) ? ` — ${popisPredlohy(p)}` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!vybrana}
        onClick={() => {
          const p = predlohy.find((x) => x.id === vybrana);
          if (p) onPouzi(p);
          setVybrana("");
        }}
        className="rounded-md border border-border px-2 py-1 hover:bg-secondary disabled:opacity-50"
      >
        {t("Použiť")}
      </button>
    </div>
  );
}
