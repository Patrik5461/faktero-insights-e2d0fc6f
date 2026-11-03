import { useState } from "react";
import { Check, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BodkaPlatby } from "@/components/faktero/IkonaPlatby";
import { useT } from "@/lib/i18n/useT";
import { potvrd } from "@/lib/potvrdenie";
import { cn } from "@/lib/utils";

/**
 * Tenký pás nad zoznamom: „N dokladov s nájdenou platbou“ + filter a hromadné
 * spárovanie istých návrhov (istota 'auto'). Nahrádza veľký panel návrhov.
 *
 * Samotné spárovanie (jeden po druhom, toast s výsledkom) robí volajúci
 * v `onSparujIste`; pás sa len opýta (`potvrd`) a počas behu zamkne tlačidlá.
 * Pri nule návrhov sa nezobrazí — iba keď je zapnutý filter, aby sa dal vypnúť.
 */
export function PasNavrhovPlatieb({
  pocet,
  istych,
  lenTieto,
  onLenTieto,
  onSparujIste,
  nazovDokladov,
}: {
  pocet: number;
  istych: number;
  lenTieto: boolean;
  onLenTieto: (zapnut: boolean) => void;
  onSparujIste: () => Promise<void>;
  /** „faktúr“ / „bločkov“ / „dokladov“ (už preložené). */
  nazovDokladov?: string;
}) {
  const { t } = useT();
  const [pracuje, setPracuje] = useState(false);
  if (pocet <= 0 && !lenTieto) return null;

  const nazov = nazovDokladov ?? t("dokladov");

  const sparuj = async () => {
    const ok = await potvrd(
      t("Spárovať {n} s istou zhodou platby? Doklady sa označia ako uhradené.", { n: `${istych} ${nazov}` }),
      { potvrdit: t("Spárovať") },
    );
    if (!ok) return;
    setPracuje(true);
    try {
      await onSparujIste();
    } finally {
      setPracuje(false);
    }
  };

  return (
    <div
      role="status"
      data-pas-navrhov-platieb=""
      className="fk-oznam fk-oznam-pozor flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2 text-sm"
    >
      <span className="flex min-w-0 items-center gap-2">
        <BodkaPlatby stav="navrh" className="h-2.5 w-2.5 shrink-0" />
        <span className="min-w-0">
          {pocet > 0
            ? t("{n} s nájdenou platbou", { n: `${pocet} ${nazov}` })
            : t("Žiadne doklady s nájdenou platbou")}
        </span>
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={lenTieto ? "secondary" : "ghost"}
          aria-pressed={lenTieto}
          className={cn("h-7")}
          onClick={() => onLenTieto(!lenTieto)}
        >
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          {lenTieto ? t("Zobraziť všetky") : t("Zobraziť len tieto")}
        </Button>
        {istych > 0 && (
          <Button size="sm" className="h-7" disabled={pracuje} onClick={() => void sparuj()}>
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {pracuje ? t("Párujem…") : t("Spárovať všetky isté ({k})", { k: istych })}
          </Button>
        )}
      </span>
    </div>
  );
}
