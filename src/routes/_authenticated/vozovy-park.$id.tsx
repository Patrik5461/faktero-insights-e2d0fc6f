import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
  // Z-15: hlavička s názvom a ŠPZ vozidla (karta ich načíta sama).
  const [nazov, setNazov] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title={nazov || t("Vozidlo")}
        description={t("Technický preukaz, vlastníctvo, poistky a termíny vozidla.")}
      />
      <PageBody>
        <VozidloKarta
          key={id}
          id={id}
          onNacitane={(v) => {
            const text = [v.name, v.license_plate].filter(Boolean).join(" · ");
            setNazov(text || null);
            if (text && typeof document !== "undefined") document.title = `${text} — Faktero`;
          }}
        />
      </PageBody>
    </>
  );
}
