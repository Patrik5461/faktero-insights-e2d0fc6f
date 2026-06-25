import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { ApiDocsContent } from "@/components/faktero/ApiDocsContent";

export const Route = createFileRoute("/docs/api")({
  head: () => ({
    meta: [
      { title: "API dokumentácia — Faktero" },
      {
        name: "description",
        content:
          "Kompletná dokumentácia Faktero REST API: autentifikácia, faktúry, ponuky, webhooky a príklady v cURL, JavaScripte a PHP.",
      },
      { property: "og:title", content: "Faktero API dokumentácia" },
      {
        property: "og:description",
        content:
          "REST API pre fakturáciu, ponuky, opakované faktúry a webhooky. Bezplatný účet, test a live kľúče.",
      },
    ],
  }),
  component: PublicDocsPage,
});

function PublicDocsPage() {
  return (
    <MarketingShell>
      <ApiDocsContent loggedIn={false} />
    </MarketingShell>
  );
}