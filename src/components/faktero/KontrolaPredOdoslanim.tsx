import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { odkazNaPravidlo } from "@/lib/faktero/efaktura/kontrola";
import {
  parametreNalezu,
  type KontrolaPredOdoslanim as Kontrola,
  type NalezOdoslania,
} from "@/lib/faktero/efaktura/kontrola-odoslania";

/** Stav kontroly v okne: načítava sa, výsledok, nedá sa poslať, kontrola sa nespustila. */
export type StavKontroly =
  | { druh: "nacitavam" }
  | { druh: "hotovo"; kontrola: Kontrola }
  | { druh: "nedaSa"; dovod: string }
  | { druh: "zlyhala"; dovod: string };

/** Či stav kontroly bráni odoslaniu. Nespustená kontrola nebráni — overí ju server. */
export function blokujeOdoslanie(s: StavKontroly): boolean {
  return (
    s.druh === "nacitavam" || s.druh === "nedaSa" || (s.druh === "hotovo" && !s.kontrola.mozno)
  );
}

function Nalez({ n }: { n: NalezOdoslania }) {
  const { t } = useT();
  const odkaz = odkazNaPravidlo(n.kod);
  const chyba = n.zavaznost === "chyba";
  return (
    <li className="flex gap-2 py-1.5 text-sm">
      {chyba ? (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label={t("Chyba")} />
      ) : (
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
          aria-label={t("Varovanie")}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="break-words">{t(n.popis, parametreNalezu(n, t))}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {odkaz ? (
            <a
              href={odkaz}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono font-semibold text-primary hover:underline"
            >
              {n.kod} <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : (
            <span className="font-mono font-semibold" title={t("Vlastná kontrola Faktera")}>
              {n.kod}
            </span>
          )}
          {n.preradene && (
            <span>{t("pri odoslaní len varovanie — ePošták túto časť dopĺňa sám")}</span>
          )}
        </p>
      </div>
    </li>
  );
}

/**
 * Výsledok kontroly eFaktúry pred odoslaním (pravidlá EN 16931 a Peppol BIS
 * nad UBL z údajov faktúry). Chyby odoslanie zastavia, varovania nie.
 */
export function KontrolaPredOdoslanimPanel({
  stav,
  onZnova,
}: {
  stav: StavKontroly;
  onZnova?: () => void;
}) {
  const { t } = useT();
  const znova = onZnova && stav.druh !== "nacitavam" && (
    <button
      type="button"
      onClick={onZnova}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
    >
      <RefreshCw className="h-3 w-3" aria-hidden="true" /> {t("Skontrolovať znova")}
    </button>
  );

  if (stav.druh === "nacitavam")
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("Kontrolujem eFaktúru podľa pravidiel EN 16931 a Peppol BIS…")}
      </p>
    );
  if (stav.druh === "zlyhala")
    return (
      <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm text-muted-foreground">
        <p>
          {t("Kontrolu sa nepodarilo spustiť ({dovod}). Faktúru skontroluje server pri odoslaní.", {
            dovod: stav.dovod,
          })}
        </p>
        {znova}
      </div>
    );
  if (stav.druh === "nedaSa")
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
      >
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0">{t(stav.dovod)}</p>
      </div>
    );

  const { chyby, varovania, orientacna } = stav.kontrola;
  return (
    <div className="space-y-2" aria-live="polite">
      {chyby.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {varovania.length
              ? t("Kontrola prešla s varovaniami: {n}", { n: varovania.length })
              : t("Kontrola prešla")}
          </span>
          {znova}
        </div>
      ) : (
        <div
          role="alert"
          className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p className="font-medium text-destructive">
            {t("eFaktúra neprešla kontrolou — chyby: {n}. Takto by ju sieť Peppol odmietla.", {
              n: chyby.length,
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Opravte faktúru (Upraviť alebo Opraviť faktúru) podľa zoznamu nižšie a potom ju skontrolujte znova. Odoslanie je dovtedy zablokované.",
            )}
          </p>
          <ul className="divide-y divide-border">
            {chyby.map((n, i) => (
              <Nalez key={`${n.kod}-${i}`} n={n} />
            ))}
          </ul>
          {znova}
        </div>
      )}
      {varovania.length > 0 && (
        <details className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-amber-800 dark:text-amber-300">
            {orientacna
              ? t("Orientačné varovania kontroly: {n}", { n: varovania.length })
              : t("Varovania: {n} — odoslaniu nebránia", { n: varovania.length })}
          </summary>
          <ul className="mt-1 divide-y divide-border">
            {varovania.map((n, i) => (
              <Nalez key={`${n.kod}-${i}`} n={n} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
