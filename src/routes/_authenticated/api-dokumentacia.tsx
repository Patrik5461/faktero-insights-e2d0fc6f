import { createFileRoute } from "@tanstack/react-router";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { ApiDocsContent } from "@/components/faktero/ApiDocsContent";

export const Route = createFileRoute("/_authenticated/api-dokumentacia")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "API dokumentácia — Faktero") }] }),
  component: ApiDocs,
});

function ApiDocs() {
  const { t } = useT();
  return (
    <>
      <PageHeader
        title={t("API dokumentácia")}
        description={t("REST API · verzia v1 · Bearer autentifikácia")}
      />
      <PageBody>
        <ApiDocsContent loggedIn />
      </PageBody>
    </>
  );
}
