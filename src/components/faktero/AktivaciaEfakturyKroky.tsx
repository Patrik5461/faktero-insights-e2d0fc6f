import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { PORTAL_FS } from "@/lib/faktero/efaktura-oznam";

/**
 * Kroky aktivácie eFaktúry na Portáli finančnej správy.
 *
 * Aktivácia nie je nastavenie vo Fakteri: firma (alebo jej účtovník so
 * splnomocnením) na portáli vyberie Faktero ako poskytovateľa doručovacej
 * služby, FS nám pošle údaje a Faktero firmu zaregistruje v Peppole samo.
 * Rovnaké kroky ukazuje prehľad /efaktura aj verejná stránka pre účtovníka —
 * preto jeden komponent.
 */
export function AktivaciaEfakturyKroky({
  dic,
  nazovFirmy,
  preUctovnika = false,
}: {
  dic: string | null;
  nazovFirmy?: string | null;
  preUctovnika?: boolean;
}) {
  const { t } = useT();
  const [skopirovane, setSkopirovane] = useState(false);

  async function kopiruj() {
    if (!dic) return;
    try {
      await navigator.clipboard.writeText(dic);
      setSkopirovane(true);
      setTimeout(() => setSkopirovane(false), 2000);
    } catch {
      /* bez schránky si ho človek odpíše */
    }
  }

  const kroky: string[] = preUctovnika
    ? [
        "Prihláste sa na Portál finančnej správy svojím účtom (ten, ktorým podávate za klientov priznania).",
        "Prepnite sa na subjekt klienta podľa DIČ nižšie — splnomocnenie na zastupovanie už máte.",
        "Otvorte časť eFaktúra a zvoľte výber poskytovateľa doručovacej služby.",
        "Zo zoznamu poskytovateľov vyberte Faktero a výber potvrďte.",
        "Hotovo. Finančná správa nám pošle údaje firmy a Faktero ju do niekoľkých minút zaregistruje v sieti Peppol.",
      ]
    : [
        "Prihláste sa na Portál finančnej správy do osobnej internetovej zóny.",
        "Otvorte časť eFaktúra a zvoľte výber poskytovateľa doručovacej služby.",
        "Zo zoznamu poskytovateľov vyberte Faktero a výber potvrďte.",
        "Hotovo. Finančná správa nám pošle údaje firmy a Faktero ju do niekoľkých minút zaregistruje v sieti Peppol — eFaktúra sa tu zapne sama.",
      ];

  return (
    <div className="space-y-4">
      {(nazovFirmy || dic) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          {nazovFirmy ? (
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{t("Firma")}</div>
              <div className="font-medium break-words">{nazovFirmy}</div>
            </div>
          ) : null}
          {dic ? (
            <div>
              <div className="text-xs text-muted-foreground">{t("DIČ")}</div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium tabular-nums">{dic}</span>
                <button
                  type="button"
                  onClick={kopiruj}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-muted"
                >
                  {skopirovane ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {skopirovane ? t("Skopírované") : t("Kopírovať")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
      <ol className="space-y-3">
        {kroky.map((k, i) => (
          <li key={k} className="flex gap-3 text-sm">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {i + 1}
            </span>
            <span className="pt-0.5">{t(k)}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        {t(
          "Názvy položiek sa na portáli môžu mierne líšiť. Ak firmu v sieti Peppol drží iný poskytovateľ, treba migračný kód — pozrite návod.",
        )}
      </p>
      <a
        href={PORTAL_FS}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {t("Otvoriť Portál finančnej správy")} <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}
