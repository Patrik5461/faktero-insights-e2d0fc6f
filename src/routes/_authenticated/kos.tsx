import { createFileRoute } from "@tanstack/react-router";
import { PageBody, PageHeader } from "@/components/faktero/AppShell";
import { KosDokladovOkno } from "@/components/faktero/KosDokladovOkno";
import { getActiveCompanyId } from "@/lib/faktero/active-company";

export const Route = createFileRoute("/_authenticated/kos")({
  head: () => ({ meta: [{ title: "Kôš — Faktero" }] }),
  component: KosPage,
});

/** Kôš ako samostatná sekcia dokladov (ako v Doklado) — zmazané doklady všetkých druhov. */
function KosPage() {
  const cid = getActiveCompanyId();
  return (
    <>
      <PageHeader title="Kôš" description="Zmazané doklady — dajú sa obnoviť do pôvodnej sekcie." />
      <PageBody>
        {cid ? <KosDokladovOkno vlozene companyId={cid} onClose={() => {}} onObnovene={() => {}} /> : null}
      </PageBody>
    </>
  );
}
