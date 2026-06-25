import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailPage } from "@/components/faktero/MarketingSectionPage";
import { vyvojari, getItem } from "@/lib/faktero/marketing-content";

export const Route = createFileRoute("/vyvojari/$slug")({
  head: ({ params }) => {
    const item = getItem(vyvojari, params.slug);
    return {
      meta: [
        { title: `${item?.label ?? "API"} — Faktero` },
        { name: "description", content: item?.summary ?? vyvojari.hubDescription },
        { property: "og:title", content: `${item?.label ?? "API"} — Faktero` },
        { property: "og:description", content: item?.summary ?? vyvojari.hubDescription },
      ],
    };
  },
  loader: ({ params }) => {
    if (!getItem(vyvojari, params.slug)) throw notFound();
  },
  component: VyvojariDetail,
});

function VyvojariDetail() {
  const { slug } = Route.useParams();
  const item = getItem(vyvojari, slug);
  if (!item) return null;
  return <DetailPage hub={vyvojari} item={item} />;
}