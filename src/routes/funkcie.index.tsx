import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/faktero/MarketingSectionPage";
import { funkcie } from "@/lib/faktero/marketing-content";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/funkcie/")({
  head: ({ match }) => {
    const j = match.context.jazyk;
    return {
      meta: [
        { title: preloz(j, "Funkcie — Faktero") },
        { name: "description", content: preloz(j, funkcie.hubDescription) },
        { property: "og:title", content: preloz(j, "Funkcie Faktero") },
        { property: "og:description", content: preloz(j, funkcie.hubDescription) },
      ],
    };
  },
  component: () => <HubPage hub={funkcie} />,
});
