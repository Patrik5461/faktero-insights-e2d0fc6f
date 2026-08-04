import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/faktero/MarketingSectionPage";
import { funkcie } from "@/lib/faktero/marketing-content";

export const Route = createFileRoute("/funkcie/")({
  head: () => ({
    meta: [
      { title: "Funkcie — Faktero" },
      { name: "description", content: funkcie.hubDescription },
      { property: "og:title", content: "Funkcie Faktero" },
      { property: "og:description", content: funkcie.hubDescription },
    ],
  }),
  component: () => <HubPage hub={funkcie} />,
});
