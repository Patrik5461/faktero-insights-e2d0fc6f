import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";

export const Route = createFileRoute("/_authenticated/efaktura/prijate")({
  head: () => ({ meta: [{ title: "Prijaté eFaktúry — Faktero" }] }),
  component: ReceivedPage,
});

function ReceivedPage() {
  return (
    <>
      <PageHeader title="Prijaté eFaktúry" description="eFaktúry doručené od vašich dodávateľov." />
      <PageBody>
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <Inbox className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Zatiaľ tu nič nie je</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Prijímanie eFaktúr bude dostupné po napojení na digitálneho poštára alebo Peppol
            Access Point. Pripravujeme.
          </p>
        </div>
      </PageBody>
    </>
  );
}