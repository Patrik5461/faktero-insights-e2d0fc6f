import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { PreddefinovanePoznamkySprava } from "@/components/faktero/PreddefinovanePoznamkySprava";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/nastavenia/poznamky")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Preddefinované poznámky — Faktero") }],
  }),
  component: PoznamkyStranka,
});

function PoznamkyStranka() {
  const { t } = useT();
  return (
    <>
      <PageHeader
        title={t("Preddefinované poznámky")}
        description={t(
          "Texty, ktoré sa dajú jedným klikom vložiť do poznámky faktúry, prijatej faktúry, bločku alebo nespracovaného dokladu.",
        )}
      />
      <PageBody>
        <div className="max-w-3xl rounded-xl border border-border bg-card p-6">
          <PreddefinovanePoznamkySprava />
        </div>
      </PageBody>
    </>
  );
}
