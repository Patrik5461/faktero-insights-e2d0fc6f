import { createFileRoute } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { KontrolaEfaktury } from "@/components/faktero/KontrolaEfaktury";
import { MAX_VELKOST_KONTROLY } from "@/lib/faktero/efaktura/kontrola";

export const Route = createFileRoute("/_authenticated/efaktura/kontrola")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Kontrola e-faktúry — Faktero") }],
  }),
  component: KontrolaEfakturyStranka,
});

function KontrolaEfakturyStranka() {
  const { t } = useT();
  return (
    <>
      <PageHeader
        title={t("Kontrola e-faktúry")}
        description={t(
          "Nahrajte XML e-faktúry (UBL, Peppol BIS 3.0) — vlastnú aj prijatú — a uvidíte chyby a varovania podľa EN 16931, Peppolu a slovenských pravidiel.",
        )}
      />
      <PageBody>
        <div className="max-w-4xl">
          <KontrolaEfaktury maxVelkost={MAX_VELKOST_KONTROLY} />
        </div>
      </PageBody>
    </>
  );
}
