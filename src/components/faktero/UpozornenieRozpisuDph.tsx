/*
  Upozornenie v sekcii „Čiastka a DPH“: rozpis DPH nesedí so sumami dokladu,
  daň riadku nezodpovedá základu × sadzbe alebo sadzba v krajine neplatí
  (`rozpis-dph-kontrola.ts`). Doklad s takým rozpisom sa neuloží potichu —
  ide „na kontrolu“ a človek ho tu vidí ešte pred vytvorením.
*/
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import type { VysledokKontroly } from "@/lib/faktero/rozpis-dph-kontrola";

export function UpozornenieRozpisuDph({
  kontrola,
  dovod,
  onPotvrd,
  className = "",
}: {
  /** Živá kontrola rozpisu vo formulári. */
  kontrola?: VysledokKontroly | null;
  /** Uložený dôvod (napr. `na_kontrolu_dovod`), keď živá kontrola nie je. */
  dovod?: string | null;
  /** „Rozpis je správny“ — človek ho overil podľa dokladu. */
  onPotvrd?: (() => void) | null;
  className?: string;
}) {
  const { t } = useT();
  const vety =
    kontrola && !kontrola.ok ? kontrola.chyby.map((c) => c.sprava) : dovod ? [dovod] : [];
  if (!vety.length) return null;
  return (
    <div
      role="alert"
      data-testid="upozornenie-rozpisu-dph"
      className={`dk-pozor flex items-start gap-2 rounded-lg border p-3 text-xs ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        <div className="font-semibold">
          {t("Rozpis DPH nesedí — skontrolujte ho podľa dokladu")}
        </div>
        <ul className="list-disc space-y-0.5 pl-4">
          {vety.map((v, i) => (
            <li key={i} className="break-words">
              {v}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          {t(
            "Doklad s takýmto rozpisom pôjde na kontrolu. Opravte sadzby, základ a DPH podľa tabuľky rozpisu DPH na doklade.",
          )}
        </p>
        {onPotvrd ? (
          <button
            type="button"
            onClick={onPotvrd}
            className="mt-1 inline-flex h-8 items-center rounded-md border border-current/30 px-3 font-medium hover:bg-background/60"
          >
            {t("Rozpis je správny")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
