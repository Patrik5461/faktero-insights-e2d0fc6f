import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { VozidloKarta } from "@/components/faktero/VozidloKarta";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/vozovy-park/$id")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Vozidlo — Faktero") }] }),
  component: Vozidlo,
});

function Vozidlo() {
  const { t } = useT();
  const { id } = Route.useParams();
  return (
    <>
      <PageHeader
        title={t("Vozidlo")}
        description={t("Technický preukaz, vlastníctvo, poistky a termíny vozidla.")}
      />
      <PageBody>
        <VozidloKarta key={id} id={id} />
      </PageBody>
    </>
  );
}
