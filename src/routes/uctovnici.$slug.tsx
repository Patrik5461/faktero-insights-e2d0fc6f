import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailPage } from "@/components/faktero/MarketingSectionPage";
import { uctovnici, getItem } from "@/lib/faktero/marketing-content";

export const Route = createFileRoute("/uctovnici/$slug")({
  head: ({ params }) => {
    const item = getItem(uctovnici, params.slug);
    return {
      meta: [
        { title: `${item?.label ?? "Účtovníci"} — Faktero` },
        { name: "description", content: item?.summary ?? uctovnici.hubDescription },
        { property: "og:title", content: `${item?.label ?? "Účtovníci"} — Faktero` },
        { property: "og:description", content: item?.summary ?? uctovnici.hubDescription },
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
