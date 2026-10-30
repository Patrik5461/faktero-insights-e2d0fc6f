import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailPage } from "@/components/faktero/MarketingSectionPage";
import { funkcie, getItem } from "@/lib/faktero/marketing-content";
import { preloz } from "@/lib/i18n/jazyk";
import { kanonicka } from "@/lib/faktero/kanonicka";

export const Route = createFileRoute("/funkcie/$slug")({
  head: ({ match, params }) => {
    const j = match.context.jazyk;
    const item = getItem(funkcie, params.slug);
    return {
      links: kanonicka(`/funkcie/${params.slug}`),
      meta: [
        { title: `${preloz(j, item?.label ?? "Funkcia")} — Faktero` },
        { name: "description", content: preloz(j, item?.summary ?? funkcie.hubDescription) },
        { property: "og:title", content: `${preloz(j, item?.label ?? "Funkcia")} — Faktero` },
        { property: "og:description", content: preloz(j, item?.summary ?? funkcie.hubDescription) },
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
