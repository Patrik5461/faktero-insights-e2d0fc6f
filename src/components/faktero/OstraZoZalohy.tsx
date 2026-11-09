/*
  Ostrá (vyúčtovacia) faktúra k zálohe — na detaile zálohovej faktúry aj
  daňového dokladu k prijatej platbe. Kým záloha nie je vyúčtovaná, ponúkne
  „Vystaviť ostrú faktúru“ (formulár sa predvyplní, `?zo_zalohy=`); keď je,
  ukáže faktúru, ktorá ju vyúčtovala.
*/
import { Link } from "@tanstack/react-router";
import { FileCheck2 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujMenu } from "@/lib/faktero/mena";
import type { StavOstrej } from "@/lib/faktero/ostra-zo-zalohy";

export function OstraZoZalohy({
  stav,
  dokladId,
  mena,
  sOdkazomNaZalohu,
}: {
  stav: StavOstrej;
  /** Id dokladu, z ktorého sa ostrá faktúra vystavuje (záloha alebo doklad k platbe). */
  dokladId: string;
  mena: string;
  /** Na doklade k platbe aj odkaz na zálohovú faktúru. */
  sOdkazomNaZalohu?: boolean;
}) {
  const { t } = useT();
  return (
    <div className="space-y-2" data-ostra-zo-zalohy={stav.vyuctovana ? "vyuctovana" : stav.mozeOstru ? "mozno" : "nie"}>
      {sOdkazomNaZalohu && stav.zalohaCislo ? (
        <div>
          {t("Zálohová faktúra:")}{" "}
          <Link
            to="/faktury/$id"
            params={{ id: stav.zalohaId }}
            className="cislo-dokladu font-medium text-primary hover:underline"
          >
            {stav.zalohaCislo}
          </Link>
        </div>
      ) : null}
      {stav.faktury.length > 0 && (
        <div>
          <div>{stav.vyuctovana ? t("Vyúčtovaná ostrou faktúrou:") : t("Čiastočne odpočítaná vo faktúre:")}</div>
          <ul className="mt-1 space-y-1">
            {stav.faktury.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline gap-2">
                <Link
                  to="/faktury/$id"
                  params={{ id: f.id }}
                  className="cislo-dokladu font-medium text-primary hover:underline"
                >
                  {f.invoice_number || t("koncept")}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {f.issue_date ? datumNaDoklade(f.issue_date) : ""} · {t("odpočítané")}{" "}
                  <span className="suma">{formatujMenu(f.suma, mena)}</span>
                  {f.status === "draft" ? ` · ${t("koncept")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {stav.mozeOstru && (
        <>
          <p className="text-muted-foreground">
            {t("Po dodaní vystavte ostrú faktúru — položky sa prevezmú zo zálohy a uhradená záloha sa na nej odpočíta.")}
          </p>
          <Link
            to="/faktury/nova"
            search={{ zo_zalohy: dokladId } as any}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <FileCheck2 className="h-4 w-4" />
            {t("Vystaviť ostrú faktúru")}
          </Link>
        </>
      )}
    </div>
  );
}
