import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { gpsKatalog } from "@/lib/faktero/gps.functions";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Satellite, ChevronRight, Car } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/jazdy/integracie/")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Integrácie — Kniha jázd — Faktero") }],
  }),
  component: IntegrationsPage,
});

type PolozkaKatalogu = Awaited<ReturnType<typeof gpsKatalog>>[number];

function IntegrationsPage() {
  const { t } = useT();
  const _katalog = useServerFn(gpsKatalog);
  const [katalog, setKatalog] = useState<PolozkaKatalogu[]>([]);
  useEffect(() => {
    _katalog().then(setKatalog, () => setKatalog([]));
  }, []);
  return (
    <>
      <PageHeader
        title={t("Integrácie")}
        description={t(
          "Prepojte externé GPS systémy a automaticky importujte jazdy do knihy jázd.",
        )}
      />
      <PageBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to="/jazdy/integracie/commander"
            className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary-hover">
                <Satellite className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">Commander GPS</div>
                <div className="text-sm text-muted-foreground">
                  {t("Automatický import jázd z Commander GPS cez REST API v1.")}
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/jazdy/integracie/tesla"
            className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary-hover">
                <Car className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">Tesla Fleet API</div>
                <div className="text-sm text-muted-foreground">
                  {t(
                    "Synchronizácia Tesla vozidiel, tachometra a polohy cez oficiálne Tesla Fleet API (OAuth).",
                  )}
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5" />
          </Link>
          {katalog.map((a) => (
            <Link
              key={a.id}
              to="/jazdy/integracie/$poskytovatel"
              params={{ poskytovatel: a.id }}
              className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary-hover">
                  <Satellite className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium">{a.nazov}</div>
                  <div className="text-sm text-muted-foreground">
                    {a.vieTankovania
                      ? t("Automatický import jázd a tankovaní do knihy jázd.")
                      : t("Automatický import jázd do knihy jázd.")}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
