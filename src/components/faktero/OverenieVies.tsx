import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { overIcDphFn } from "@/lib/faktero/vies.functions";
import { jeCerstve, jeEuIcDph, jeTuzemske, type VysledokVies } from "@/lib/faktero/vies";
import { BadgeCheck, Loader2, ShieldAlert, ShieldQuestion } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";

/**
 * Overenie IČ DPH v registri VIES.
 *
 * Pri dodaní tovaru do iného členského štátu je platné IČ DPH odberateľa
 * podmienkou oslobodenia od dane — nie formalitou. Overenie sa zapisuje aj
 * s dátumom, takže sa dá pri kontrole preukázať.
 */
export function OverenieVies({
  companyId,
  icDph,
  customerId,
  posledne,
  onOverene,
}: {
  companyId: string | null;
  icDph: string | null | undefined;
  customerId?: string | null;
  /** Posledný známy výsledok z karty odberateľa. */
  posledne?: { platne: boolean | null; kedy: string | null };
  onOverene?: (v: VysledokVies) => void;
}) {
  const { t, jazyk } = useT();
  const over = useServerFn(overIcDphFn);
  const [bezi, setBezi] = useState(false);
  const [vysledok, setVysledok] = useState<VysledokVies | null>(null);
  const krajinaFirmy = useKrajinaDane();

  const ic = String(icDph ?? "").trim();
  if (!ic) return null;
  // Nemecká firma nemá čo overovať pri nemeckom odberateľovi; SK a CZ ostávajú, ako boli.
  if (jeTuzemske(ic, krajinaFirmy === "DE" ? "DE" : "SK")) return null;
  if (!jeEuIcDph(ic)) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        {t("IČ DPH nie je z členského štátu EÚ — vo VIES sa overiť nedá.")}
      </p>
    );
  }

  const stav = vysledok
    ? vysledok
    : posledne?.platne != null
      ? ({ platne: posledne.platne, overene: posledne.kedy ?? "" } as VysledokVies)
      : null;
  const cerstve = stav ? jeCerstve(stav.overene) : false;

  async function spusti() {
    if (!companyId) return;
    setBezi(true);
    try {
      const v = await over({
        data: { company_id: companyId, ic_dph: ic, customer_id: customerId ?? null },
      });
      setVysledok(v);
      onOverene?.(v);
    } finally {
      setBezi(false);
    }
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={spusti}
        disabled={bezi}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
      >
        {bezi ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ShieldQuestion className="h-3.5 w-3.5" />
        )}
        {t("Overiť vo VIES")}
      </button>
      {stav && (
        <span
          className={`ml-2 inline-flex items-center gap-1 text-xs ${
            stav.platne ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
          }`}
        >
          {stav.platne ? (
            <BadgeCheck className="h-3.5 w-3.5" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5" />
          )}
          {stav.platne ? t("Platné") : t("Neplatné")}
          {stav.overene && (
            <span className="text-muted-foreground">
              · {new Date(stav.overene).toLocaleDateString(lokalJazyka(jazyk))}
              {!cerstve && ` ${t("(staršie než 30 dní)")}`}
            </span>
          )}
        </span>
      )}
      {vysledok?.nazov && (
        <span className="ml-2 text-xs text-muted-foreground">{vysledok.nazov}</span>
      )}
      {vysledok?.chyba && !vysledok.platne && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t(vysledok.chyba)}</p>
      )}
    </div>
  );
}
