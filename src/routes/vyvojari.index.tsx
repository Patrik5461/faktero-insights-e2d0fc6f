import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/faktero/MarketingSectionPage";
import { vyvojari } from "@/lib/faktero/marketing-content";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/vyvojari/")({
  head: ({ match }) => {
    const j = match.context.jazyk;
    return {
      meta: [
        { title: preloz(j, "API a pre vývojárov — Faktero") },
        { name: "description", content: preloz(j, vyvojari.hubDescription) },
        { property: "og:title", content: preloz(j, "API Faktero") },
        { property: "og:description", content: preloz(j, vyvojari.hubDescription) },
      ],
    };
  },
  component: () => <HubPage hub={vyvojari} />,
});
