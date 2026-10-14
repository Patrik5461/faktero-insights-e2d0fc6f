import { createFileRoute } from "@tanstack/react-router";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { KosDokladovOkno } from "@/components/faktero/KosDokladovOkno";
import { getActiveCompanyId } from "@/lib/faktero/active-company";

export const Route = createFileRoute("/_authenticated/kos")({
  head: () => ({ meta: [{ title: "Kôš — Faktero" }] }),
  component: KosPage,
});

/** Kôš ako samostatná sekcia dokladov — zmazané doklady všetkých druhov. */
function KosPage() {
  const cid = getActiveCompanyId();
  return (
    <>
      <PageHeader
        title="Kôš"
        description="Zmazané doklady všetkých druhov sa dajú obnoviť do pôvodnej sekcie aj s párovaním na pohyb v banke. Po 90 dňoch sa kôš vysype sám aj so skenmi."
      />
      <PageBody>
        {cid ? (
          <KosDokladovOkno vlozene companyId={cid} onClose={() => {}} onObnovene={() => {}} />
        ) : null}
      </PageBody>
    </>
  );
}
