import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/faktero/MarketingSectionPage";
import { uctovnici } from "@/lib/faktero/marketing-content";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/uctovnici/")({
  head: ({ match }) => {
    const j = match.context.jazyk;
    return {
      meta: [
        { title: preloz(j, "Pre účtovníkov — Faktero") },
        { name: "description", content: preloz(j, uctovnici.hubDescription) },
        { property: "og:title", content: preloz(j, "Faktero pre účtovníkov") },
        { property: "og:description", content: preloz(j, uctovnici.hubDescription) },
      ],
    };
  },
  component: () => <HubPage hub={uctovnici} />,
});
