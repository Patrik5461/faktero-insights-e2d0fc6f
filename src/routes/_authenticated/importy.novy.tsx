import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { History, ArrowRight } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { VendorImportPage, type VendorId } from "@/components/faktero/VendorImportPage";
import { IMPORT_ZDROJE, PREDVOLENY_ZDROJ, zdrojPodlaId } from "@/components/faktero/import-zdroje";

export const Route = createFileRoute("/_authenticated/importy/novy")({
  head: () => ({ meta: [{ title: "Účtovné importy — Faktero" }] }),
  /** Zdroj drží adresa, nie stav — dá sa naň odkázať aj ho obnoviť. */
  validateSearch: (s: Record<string, unknown>): { zdroj?: string } => ({
    zdroj: typeof s.zdroj === "string" ? s.zdroj : undefined,
  }),
  component: Page,
});

function VyberZdroja({ id, onZmena }: { id: string; onZmena: (v: string) => void }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <label htmlFor="zdroj-importu" className="text-sm font-semibold text-foreground">
        Odkiaľ importujete
      </label>
      <p className="mt-1 text-sm text-muted-foreground">
        Vyberte program, z ktorého máte export. Návod aj prípony súborov sa prispôsobia.
      </p>
      <select
        id="zdroj-importu"
        value={id}
        onChange={(e) => onZmena(e.target.value)}
        className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        {IMPORT_ZDROJE.map((z) => (
          <option key={z.id} value={z.id}>
            {z.label}
          </option>
        ))}
      </select>
    </section>
  );
}

function Page() {
  const { zdroj } = Route.useSearch();
  const navigate = useNavigate();
  const z = zdrojPodlaId(zdroj ?? PREDVOLENY_ZDROJ);
  const zmen = (v: string) => navigate({ to: "/importy/novy", search: { zdroj: v } });

  /* Zdroje s vlastnou stránkou sem formulár nedostanú — SuperFaktúra si pýta
     priradenie stĺpcov a prijaté doklady berú viac súborov naraz. */
  if (z.cesta) {
    return (
      <>
        <PageHeader
          title="Účtovné importy"
          description="Prechod do Faktera z iného fakturačného alebo účtovného programu."
          action={
            <Link
              to="/importy"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <History className="h-4 w-4" /> História importov
            </Link>
          }
        />
        <PageBody>
          <div className="mx-auto max-w-4xl space-y-6">
            <VyberZdroja id={z.id} onZmena={zmen} />
            <section className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold">{z.title}</h2>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">{z.guide}</div>
              <div className="mt-5 flex justify-end">
                <Link
                  to={z.cesta}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Otvoriť import <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </section>
          </div>
        </PageBody>
      </>
    );
  }

  return (
    <VendorImportPage
      /* `key` vynúti čistý formulár pri prepnutí zdroja — inak by v ňom ostal
         súbor a náhľad z predchádzajúceho programu. */
      key={z.id}
      source={z.id as VendorId}
      title="Účtovné importy"
      description="Prechod do Faktera z iného fakturačného alebo účtovného programu."
      accept={z.accept!}
      selector={<VyberZdroja id={z.id} onZmena={zmen} />}
      guide={z.guide}
    />
  );
}
