import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Satellite, ChevronRight, Car } from "lucide-react";

export const Route = createFileRoute("/_authenticated/jazdy/integracie/")({
  head: () => ({ meta: [{ title: "Integrácie — Kniha jázd — Faktero" }] }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <>
      <PageHeader
        title="Integrácie"
        description="Prepojte externé GPS systémy a automaticky importujte jazdy do knihy jázd."
      />
      <PageBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to="/jazdy/integracie/commander"
            className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Satellite className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">Commander GPS</div>
                <div className="text-sm text-muted-foreground">
                  Automatický import jázd z Commander GPS cez REST API v1.
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
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Car className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">Tesla Fleet API</div>
                <div className="text-sm text-muted-foreground">
                  Synchronizácia Tesla vozidiel, tachometra a polohy cez oficiálne Tesla Fleet API
                  (OAuth).
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5" />
          </Link>
        </div>
      </PageBody>
    </>
  );
}
