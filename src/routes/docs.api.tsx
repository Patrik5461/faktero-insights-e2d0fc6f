import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/faktero/MarketingShell";
import { ApiDocsContent } from "@/components/faktero/ApiDocsContent";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/docs/api")({
  head: ({ match }) => {
    const j = match.context.jazyk;
    return {
      meta: [
        { title: preloz(j, "API dokumentácia — Faktero") },
        {
          name: "description",
          content: preloz(
            j,
            "Kompletná dokumentácia Faktero REST API: autentifikácia, faktúry, ponuky, webhooky a príklady v cURL, JavaScripte a PHP.",
          ),
        },
        { property: "og:title", content: preloz(j, "Faktero API dokumentácia") },
        {
          property: "og:description",
          content: preloz(
            j,
            "REST API pre fakturáciu, ponuky, opakované faktúry a webhooky. Bezplatný účet, test a live kľúče.",
          ),
        },
      ],
    };
  },
  component: PublicDocsPage,
});

function PublicDocsPage() {
  return (
    <MarketingShell>
      <ApiDocsContent loggedIn={false} />
    </MarketingShell>
  );
}
