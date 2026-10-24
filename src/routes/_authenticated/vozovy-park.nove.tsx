import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { VozidloKarta } from "@/components/faktero/VozidloKarta";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/vozovy-park/nove")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Nové vozidlo — Faktero") }],
  }),
  component: NoveVozidlo,
});

function NoveVozidlo() {
  const { t } = useT();
  return (
    <>
      <PageHeader
        title={t("Nové vozidlo")}
        description={t(
          "Nahrajte technický preukaz vpravo — údaje vozidla sa vyplnia samé. Potom doplňte vlastníctvo a termíny.",
        )}
      />
      <PageBody>
        <VozidloKarta id={null} />
      </PageBody>
    </>
  );
}
