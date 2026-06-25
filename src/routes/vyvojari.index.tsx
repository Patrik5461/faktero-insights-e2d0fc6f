import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/faktero/MarketingSectionPage";
import { vyvojari } from "@/lib/faktero/marketing-content";

export const Route = createFileRoute("/vyvojari/")({
  head: () => ({
    meta: [
      { title: "API a pre vývojárov — Faktero" },
      { name: "description", content: vyvojari.hubDescription },
      { property: "og:title", content: "API Faktero" },
      { property: "og:description", content: vyvojari.hubDescription },
    ],
  }),
  component: () => <HubPage hub={vyvojari} />,
});