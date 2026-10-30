import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailPage } from "@/components/faktero/MarketingSectionPage";
import { efakturacia, getItem } from "@/lib/faktero/marketing-content";
import { preloz } from "@/lib/i18n/jazyk";
import { kanonicka } from "@/lib/faktero/kanonicka";

export const Route = createFileRoute("/efakturacia/$slug")({
  head: ({ match, params }) => {
    const j = match.context.jazyk;
    const item = getItem(efakturacia, params.slug);
    return {
      links: kanonicka(`/efakturacia/${params.slug}`),
      meta: [
        { title: `${preloz(j, item?.label ?? "eFaktúra")} — Faktero` },
        { name: "description", content: preloz(j, item?.summary ?? efakturacia.hubDescription) },
        { property: "og:title", content: `${preloz(j, item?.label ?? "eFaktúra")} — Faktero` },
        {
          property: "og:description",
          content: preloz(j, item?.summary ?? efakturacia.hubDescription),
        },
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
