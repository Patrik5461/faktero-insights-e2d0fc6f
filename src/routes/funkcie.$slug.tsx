import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailPage } from "@/components/faktero/MarketingSectionPage";
import { funkcie, getItem } from "@/lib/faktero/marketing-content";

export const Route = createFileRoute("/funkcie/$slug")({
  head: ({ params }) => {
    const item = getItem(funkcie, params.slug);
    return {
      meta: [
        { title: `${item?.label ?? "Funkcia"} — Faktero` },
        { name: "description", content: item?.summary ?? funkcie.hubDescription },
        { property: "og:title", content: `${item?.label ?? "Funkcia"} — Faktero` },
        { property: "og:description", content: item?.summary ?? funkcie.hubDescription },
      ],
    };
  },
  loader: ({ params }) => {
    if (!getItem(funkcie, params.slug)) throw notFound();
  },
  component: FunkciaDetail,
});

function FunkciaDetail() {
  const { slug } = Route.useParams();
  const item = getItem(funkcie, slug);
  if (!item) return null;
  return <DetailPage hub={funkcie} item={item} />;
}
