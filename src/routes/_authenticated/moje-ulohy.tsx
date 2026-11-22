import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { zoznamSearch, type ListSearch } from "@/hooks/useListFilters";
import {
  fetchMyCompanies,
  getActiveCompanyId,
  setActiveCompanyId,
} from "@/lib/faktero/active-company";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { MojeUlohyPanel } from "@/components/faktero/MojeUlohyPanel";

/**
 * Moje úlohy — čo čaká práve na prihláseného: doklady na jeho schválenie,
 * komentáre, v ktorých ho kolega označil, a nespracované doklady firmy.
 * Predtým to bolo na troch miestach a človek o úlohe vedel len zo zvončeka.
 */
export const Route = createFileRoute("/_authenticated/moje-ulohy")({
  /*
    Odkaz z denného e-mailového súhrnu nesie firmu (`?firma=`) — človek
    s viacerými firmami má v e-maile sekciu za každú a klik musí otvoriť
    úlohy tej firmy, nie tej, ktorá je práve vybraná. `dalej=po-splatnosti`
    po prepnutí pokračuje na faktúry po splatnosti, `dalej=efaktury`
    (e-mail o prijatej eFaktúre) na Prijaté eFaktúry.
  */
  validateSearch: (
    s: Record<string, unknown>,
  ): ListSearch & { firma?: string; dalej?: "po-splatnosti" | "efaktury" } => ({
    ...zoznamSearch(s),
    firma: typeof s.firma === "string" && /^[0-9a-f-]{36}$/i.test(s.firma) ? s.firma : undefined,
    dalej:
      s.dalej === "po-splatnosti" ? "po-splatnosti" : s.dalej === "efaktury" ? "efaktury" : undefined,
  }),
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "Moje úlohy — Faktero") }] }),
  component: Stranka,
});

function Stranka() {
  const { t } = useT();
  const { firma, dalej } = Route.useSearch();
  const navigate = useNavigate();
  const prepnut = Boolean(firma && firma !== getActiveCompanyId());
  const [prepinam, setPrepinam] = useState(prepnut);
  const companyId = prepinam ? null : getActiveCompanyId();

  // Firma z odkazu v e-maile: prepnúť (len ak je človek jej členom) a stránku načítať nanovo.
  useEffect(() => {
    if (!firma) return;
    if (!prepnut) {
      if (dalej === "po-splatnosti")
        void navigate({ to: "/faktury", search: { poSplatnosti: true }, replace: true });
      else if (dalej === "efaktury") void navigate({ to: "/efaktura/prijate", replace: true });
      else void navigate({ to: "/moje-ulohy", search: {}, replace: true });
      return;
    }
    fetchMyCompanies()
      .then((firmy) => {
        if (firmy.some((f: any) => f.id === firma)) {
          setActiveCompanyId(firma);
          window.location.replace(
            dalej === "po-splatnosti"
              ? "/faktury?poSplatnosti=true"
              : dalej === "efaktury"
                ? "/efaktura/prijate"
                : "/moje-ulohy",
          );
        } else {
          toast.error(t("K firme z odkazu nemáte prístup — ukazujem úlohy vybranej firmy."));
          setPrepinam(false);
          void navigate({ to: "/moje-ulohy", search: {}, replace: true });
        }
      })
      .catch(() => setPrepinam(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <PageHeader
        title={t("Moje úlohy")}
        description={t("Doklady na vaše schválenie, komentáre, v ktorých vás kolega označil, a doklady čakajúce na kontrolu.")}
      />
      <PageBody>
        {prepinam ? (
          <NacitavanieStav text="Prepínam firmu…" className="rounded-xl border border-border bg-card" />
        ) : (
          <MojeUlohyPanel companyId={companyId} />
        )}
      </PageBody>
    </>
  );
}
