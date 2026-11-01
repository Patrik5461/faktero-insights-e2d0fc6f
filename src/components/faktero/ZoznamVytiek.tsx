/*
  Výtky „Pred podaním …“ vo výkazoch DPH (SK, CZ, DE UStVA a ZM) — jeden
  komponent. Ukáže prvých 20 a pod nimi „Zobraziť všetky (n)“, aby sa zvyšok
  nestratil. Text výtky ide cez t() — kľúče sú slovenské texty zo servera.
*/
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

export const VYTKY_NARAZ = 20;

export function ZoznamVytiek({
  vytky,
  nadpis,
  className,
}: {
  vytky: readonly { doklad: string; text: string }[];
  /** Hotový (preložený) nadpis s počtom. */
  nadpis: string;
  className?: string;
}) {
  const { t } = useT();
  const [vsetky, setVsetky] = useState(false);
  if (!vytky.length) return null;
  const zobraz = vsetky ? vytky : vytky.slice(0, VYTKY_NARAZ);
  const zvysok = vytky.length - zobraz.length;
  return (
    <div
      className={cn("mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4", className)}
      data-testid="zoznam-vytiek"
    >
      <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4" />
        {nadpis}
      </div>
      <ul className="mt-2 space-y-1 text-sm text-amber-800 dark:text-amber-400">
        {zobraz.map((v, i) => (
          <li key={i}>
            <span className="font-medium">{v.doklad}</span>: {t(v.text)}
          </li>
        ))}
      </ul>
      {zvysok > 0 && (
        <button
          type="button"
          className="mt-2 text-sm font-medium text-amber-900 underline underline-offset-2 dark:text-amber-300"
          onClick={() => setVsetky(true)}
        >
          {t("… a ďalších {n} — zobraziť všetky", { n: zvysok })}
        </button>
      )}
    </div>
  );
}
