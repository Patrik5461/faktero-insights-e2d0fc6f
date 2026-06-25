import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/faktero/MarketingSectionPage";
import { efakturacia } from "@/lib/faktero/marketing-content";

export const Route = createFileRoute("/efakturacia/")({
  head: () => ({
    meta: [
      { title: "eFaktúra 2027 — Faktero" },
      { name: "description", content: efakturacia.hubDescription },
      { property: "og:title", content: "eFaktúra 2027" },
      { property: "og:description", content: efakturacia.hubDescription },
    ],
  }),
  component: () => <HubPage hub={efakturacia} />,
});