import { createFileRoute } from "@tanstack/react-router";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { KosDokladovOkno } from "@/components/faktero/KosDokladovOkno";
import { getActiveCompanyId } from "@/lib/faktero/active-company";

export const Route = createFileRoute("/_authenticated/kos")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "Kôš — Faktero") }] }),
  component: KosPage,
});

/** Kôš ako samostatná sekcia dokladov — zmazané doklady všetkých druhov. */
function KosPage() {
  const { t } = useT();
  const cid = getActiveCompanyId();
  return (
    <>
      <PageHeader
        title={t("Kôš")}
        description={t("Zmazané doklady všetkých druhov sa dajú obnoviť do pôvodnej sekcie aj s párovaním na pohyb v banke. Po 90 dňoch sa kôš vysype sám aj so skenmi.")}
      />
      <PageBody>
        {cid ? (
          <KosDokladovOkno vlozene companyId={cid} onClose={() => {}} onObnovene={() => {}} />
        ) : null}
      </PageBody>
    </>
  );
}
