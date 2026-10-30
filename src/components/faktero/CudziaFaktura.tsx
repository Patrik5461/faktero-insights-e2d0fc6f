import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Save,
  Trash2,
} from "lucide-react";
import type { OdberatelNesedi } from "@/lib/faktero/cudzia-faktura";
import { moznostiCudzejFn, presunCudzuFn } from "@/lib/faktero/cudzia-faktura.functions";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";

type T = (s: string, p?: Record<string, string | number>) => string;

/** „IČO 12345678, IČ DPH SK…“ v jazyku používateľa. */
function cisla(n: OdberatelNesedi, t: T): string {
  const o = n.odberatel;
  return [
    o.ico ? `${t("IČO")} ${o.ico}` : "",
    o.dic && !o.ic_dph ? `${t("DIČ")} ${o.dic}` : "",
    o.ic_dph ? `${t("IČ DPH")} ${o.ic_dph}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/** Veta „Faktúra nepatrí firme X, odberateľ je Y (IČO …)“. */
export function textCudzejFaktury(n: OdberatelNesedi, t: T): string {
  const c = cisla(n, t);
  const odberatel = n.odberatel.nazov || t("iná firma");
  return n.firma.nazov
    ? t("Faktúra nepatrí firme {firma}, odberateľ je {odberatel}", {
        firma: n.firma.nazov,
        odberatel: c ? `${odberatel} (${c})` : odberatel,
      })
    : t("Faktúra nepatrí tejto firme, odberateľ je {odberatel}", {
        odberatel: c ? `${odberatel} (${c})` : odberatel,
      });
}

/**
 * Červený výkričník pri faktúre, ktorá nepatrí firme — v zoznamoch a v
 * hlavičke detailu. Popis ukáže pri prechode myšou aj čítačke.
 */
export function CudziaFakturaZnak({
  nesedi,
  className = "",
}: {
  nesedi: OdberatelNesedi | null | undefined;
  className?: string;
}) {
  const { t } = useT();
  if (!nesedi) return null;
  const popis = `${textCudzejFaktury(nesedi, t)}. ${t("Kým nepotvrdíte, že patrí tejto firme, nedá sa zaúčtovať.")}`;
  return (
    <span
      title={popis}
      aria-label={popis}
      role="img"
      className={`inline-flex shrink-0 items-center text-red-600 dark:text-red-400 ${className}`}
    >
      <AlertCircle className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

/**
 * Upozornenie na faktúru, ktorá nepatrí firme, s voľbami:
 * Zmazať · Uložiť aj tak (Nespracované) / Faktúra patrí tejto firme (prijatá)
 * · Presunúť k firme, ku ktorej patrí (len firmy, kde smie človek zapisovať).
 */
export function CudziaFakturaUpozornenie({
  nesedi,
  druh,
  id,
  onZmaz,
  onUlozit,
  onPatri,
  onPresunute,
  busy,
}: {
  nesedi: OdberatelNesedi;
  druh: "prijata" | "nespracovany";
  id: string;
  onZmaz: () => void;
  /** Nespracované: vytvoriť prijatú faktúru aj tak (s príznakom). */
  onUlozit?: () => void;
  /** Prijatá faktúra: potvrdiť, že patrí tejto firme. */
  onPatri?: () => void;
  onPresunute: (ciel: { id: string; nazov: string }) => void;
  busy?: boolean;
}) {
  const { t } = useT();
  const moznosti = useServerFn(moznostiCudzejFn);
  const presun = useServerFn(presunCudzuFn);
  const [ciele, setCiele] = useState<{ id: string; nazov: string }[] | null>(null);
  const [presuvam, setPresuvam] = useState(false);

  useEffect(() => {
    let zrusene = false;
    moznosti({ data: { druh, id } })
      .then((r) => !zrusene && setCiele(r.ciele))
      .catch(() => !zrusene && setCiele([]));
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [druh, id]);

  async function presunut(ciel: { id: string; nazov: string }) {
    if (
      !(await potvrd(
        t("Presunúť faktúru do firmy {firma}?", { firma: ciel.nazov }) +
          "\n" +
          t(
            "Faktúra aj so súbormi prejde do firmy, ku ktorej patrí. Párovanie s bankou, zaúčtovanie, pravidlo a štítky z tejto firmy sa zrušia — tam sa zaúčtuje po svojom.",
          ),
        { potvrdit: t("Presunúť") },
      ))
    )
      return;
    setPresuvam(true);
    try {
      await presun({ data: { druh, id, cielovaFirmaId: ciel.id } });
      toast.success(t("Faktúra je presunutá do firmy {firma}", { firma: ciel.nazov }));
      onPresunute(ciel);
    } catch (e: any) {
      toast.error(e?.message ?? t("Faktúru sa nepodarilo presunúť"));
    } finally {
      setPresuvam(false);
    }
  }

  const tlacidlo =
    "inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-background px-3 py-1.5 text-xs font-medium hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:hover:bg-red-900/40";
  return (
    <div
      role="alert"
      className="rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="break-words font-semibold">{textCudzejFaktury(nesedi, t)}</p>
          <p className="break-words">
            {druh === "nespracovany"
              ? t(
                  "Odberateľ na doklade nie je vaša firma. Faktúru môžete zmazať, presunúť k firme, ktorej patrí, alebo ju uložiť aj tak — vtedy ostane označená a nedá sa zaúčtovať, kým nepotvrdíte, že patrí vašej firme.",
                )
              : t(
                  "Kým nepotvrdíte, že patrí tejto firme, nedá sa zaúčtovať, odovzdať do účtovníctva ani zaradiť do príkazu na úhradu.",
                )}
          </p>
          {ciele && !ciele.length ? (
            <p className="break-words text-xs opacity-90">
              {t(
                "Presunúť ju môžete len do firmy, ku ktorej máte prístup. Ak odberateľ používa Faktero, požiadajte jeho správcu o prístup, alebo mu faktúru pošlite.",
              )}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {(ciele ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={busy || presuvam}
            onClick={() => void presunut(c)}
            className={tlacidlo}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Presunúť do firmy {firma}", { firma: c.nazov })}
          </button>
        ))}
        {onUlozit ? (
          <button type="button" disabled={busy || presuvam} onClick={onUlozit} className={tlacidlo}>
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Uložiť aj tak")}
          </button>
        ) : null}
        {onPatri ? (
          <button
            type="button"
            disabled={busy || presuvam}
            onClick={onPatri}
            className={tlacidlo}
            title={t(
              "Odberateľ na doklade je zle prečítaný alebo opravený — faktúra sa dá zaúčtovať.",
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Faktúra patrí tejto firme")}
          </button>
        ) : null}
        <button type="button" disabled={busy || presuvam} onClick={onZmaz} className={tlacidlo}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t("Zmazať do koša")}
        </button>
      </div>
    </div>
  );
}
