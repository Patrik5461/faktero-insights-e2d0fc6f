import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/faktero/MarketingSectionPage";
import { uctovnici } from "@/lib/faktero/marketing-content";

export const Route = createFileRoute("/uctovnici/")({
  head: () => ({
    meta: [
      { title: "Pre účtovníkov — Faktero" },
      { name: "description", content: uctovnici.hubDescription },
      { property: "og:title", content: "Faktero pre účtovníkov" },
      { property: "og:description", content: uctovnici.hubDescription },
    ],
  }),
  component: () => <HubPage hub={uctovnici} />,
});
