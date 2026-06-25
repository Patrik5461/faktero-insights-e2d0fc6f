import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailPage } from "@/components/faktero/MarketingSectionPage";
import { efakturacia, getItem } from "@/lib/faktero/marketing-content";

export const Route = createFileRoute("/efakturacia/$slug")({
  head: ({ params }) => {
    const item = getItem(efakturacia, params.slug);
    return {
      meta: [
        { title: `${item?.label ?? "eFaktúra"} — Faktero` },
        { name: "description", content: item?.summary ?? efakturacia.hubDescription },
        { property: "og:title", content: `${item?.label ?? "eFaktúra"} — Faktero` },
        { property: "og:description", content: item?.summary ?? efakturacia.hubDescription },
      ],
    };
  },
  loader: ({ params }) => {
    if (!getItem(efakturacia, params.slug)) throw notFound();
  },
  component: EfakturaciaDetail,
});

function EfakturaciaDetail() {
  const { slug } = Route.useParams();
  const item = getItem(efakturacia, slug);
  if (!item) return null;
  return <DetailPage hub={efakturacia} item={item} />;
}