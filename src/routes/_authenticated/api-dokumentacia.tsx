import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { ApiDocsContent } from "@/components/faktero/ApiDocsContent";

export const Route = createFileRoute("/_authenticated/api-dokumentacia")({
  head: () => ({ meta: [{ title: "API dokumentácia — Faktero" }] }),
  component: ApiDocs,
});

function ApiDocs() {
  return (
    <>
      <PageHeader
        title="API dokumentácia"
        description="REST API · verzia v1 · Bearer autentifikácia"
      />
      <PageBody>
        <ApiDocsContent loggedIn />
      </PageBody>
    </>
  );
}
