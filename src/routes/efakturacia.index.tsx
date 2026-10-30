import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/faktero/MarketingSectionPage";
import { efakturacia } from "@/lib/faktero/marketing-content";
import { preloz } from "@/lib/i18n/jazyk";
import { kanonicka } from "@/lib/faktero/kanonicka";

export const Route = createFileRoute("/efakturacia/")({
  head: ({ match }) => {
    const j = match.context.jazyk;
    return {
      links: kanonicka("/efakturacia"),
      meta: [
        { title: preloz(j, "eFaktúra 2027 — Faktero") },
        { name: "description", content: preloz(j, efakturacia.hubDescription) },
        { property: "og:title", content: preloz(j, "eFaktúra 2027") },
        { property: "og:description", content: preloz(j, efakturacia.hubDescription) },
      ],
    };
  },
  component: () => <HubPage hub={efakturacia} />,
});
