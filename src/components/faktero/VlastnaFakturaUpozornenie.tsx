import { AlertTriangle, ArrowDownLeft } from "lucide-react";
import type { SmerPodlaIban, UcetFirmy } from "@/lib/faktero/nespracovane-iban";
import { useT } from "@/lib/i18n/useT";

/**
 * Výrazné upozornenie na nespracovanom doklade, ktorého IBAN patrí firme —
 * je to vystavená faktúra firmy, nie prijatá. Nespracované vystavené faktúry
 * nezakladajú, preto ponúka založiť doklad ako iný doklad (archív) alebo ho
 * zmazať; medzi prijaté ide len po potvrdení pri „Vytvoriť".
 */
export function VlastnaFakturaUpozornenie({
  ucet,
  onInyDoklad,
  onZmaz,
}: {
  ucet: UcetFirmy;
  onInyDoklad: () => void;
  onZmaz: () => void;
}) {
  const { t } = useT();
  return (
    <div
      role="alert"
      className="rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{t("Toto je vaša vystavená faktúra — IBAN je váš")}</p>
          <p className="break-words">
            {ucet.nazov
              ? t("IBAN {iban} patrí vášmu účtu {nazov}.", { iban: ucet.iban, nazov: ucet.nazov })
              : t("IBAN {iban} patrí vašej firme.", { iban: ucet.iban })}{" "}
            {t(
              "Peniaze podľa nej majú prísť k vám, nie odísť — medzi prijaté faktúry nepatrí. Ak ju už máte medzi vystavenými faktúrami, doklad zmažte; inak ho uložte ako iný doklad.",
            )}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onInyDoklad}
          className="rounded-md border border-red-300 bg-background px-3 py-1.5 text-xs font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
        >
          {t("Založiť ako iný doklad")}
        </button>
        <button
          type="button"
          onClick={onZmaz}
          className="rounded-md border border-red-300 bg-background px-3 py-1.5 text-xs font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
        >
          {t("Zmazať do koša")}
        </button>
      </div>
    </div>
  );
}

/**
 * Nenápadná poznámka, prečo je doklad prijatá faktúra — IBAN príjemcu platby
 * nepatrí žiadnemu účtu firmy, alebo je firemný IBAN na doklade ako účet
 * odberateľa (platiteľa).
 */
export function PrijataPodlaIbanPoznamka({
  smer,
}: {
  smer: Extract<SmerPodlaIban, { smer: "prijata" }>;
}) {
  const { t } = useT();
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
      <ArrowDownLeft className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 break-words">
        <span className="font-medium text-foreground">{t("Prijatá faktúra")}</span> —{" "}
        {smer.dovod === "odberatel"
          ? smer.ucet.nazov
            ? t("IBAN {iban} patrí vášmu účtu {nazov} a je na doklade ako účet odberateľa.", {
                iban: smer.iban,
                nazov: smer.ucet.nazov,
              })
            : t("IBAN {iban} patrí vašej firme a je na doklade ako účet odberateľa.", {
                iban: smer.iban,
              })
          : t("IBAN {iban} nepatrí žiadnemu vášmu účtu, platba ide dodávateľovi.", {
              iban: smer.iban,
            })}
      </p>
    </div>
  );
}
