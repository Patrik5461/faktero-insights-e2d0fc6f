import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailPage } from "@/components/faktero/MarketingSectionPage";
import { uctovnici, getItem } from "@/lib/faktero/marketing-content";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/uctovnici/$slug")({
  head: ({ match, params }) => {
    const j = match.context.jazyk;
    const item = getItem(uctovnici, params.slug);
    return {
      meta: [
        { title: `${preloz(j, item?.label ?? "Účtovníci")} — Faktero` },
        { name: "description", content: preloz(j, item?.summary ?? uctovnici.hubDescription) },
        { property: "og:title", content: `${preloz(j, item?.label ?? "Účtovníci")} — Faktero` },
        {
          property: "og:description",
          content: preloz(j, item?.summary ?? uctovnici.hubDescription),
        },
      ],
    };
  },
  loader: ({ params }) => {
    if (!getItem(uctovnici, params.slug)) throw notFound();
  },
  component: UctovniciDetail,
});

function UctovniciDetail() {
  const { slug } = Route.useParams();
  const item = getItem(uctovnici, slug);
  if (!item) return null;
  return <DetailPage hub={uctovnici} item={item} />;
}
