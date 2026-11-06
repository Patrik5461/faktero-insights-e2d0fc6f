import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import { ArrowRight } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { VendorImportPage, type VendorId } from "@/components/faktero/VendorImportPage";
import { IMPORT_ZDROJE, PREDVOLENY_ZDROJ, zdrojPodlaId } from "@/components/faktero/import-zdroje";
import { ZalozkyStranky } from "@/components/faktero/ZalozkyStranky";
import { HistoriaImportov } from "@/components/faktero/uctovnictvo/HistoriaImportov";

type Zalozka = "import" | "historia";
const ZALOZKY: { kod: Zalozka; nazov: string }[] = [
  { kod: "import", nazov: "Import" },
  { kod: "historia", nazov: "História" },
];

export const Route = createFileRoute("/_authenticated/importy/novy")({
  head: ({ match }) => ({
    meta: [
      {
        title: preloz(
          match.context.jazyk ?? "sk",
          match.search.tab === "historia"
            ? "História importov — Faktero"
            : "Účtovné importy — Faktero",
        ),
      },
    ],
  }),
  /** Zdroj aj záložku drží adresa, nie stav — dá sa na ne odkázať aj ich obnoviť.
   *  `tab=historia` je História (sem vedie aj stará adresa `/importy`). */
  validateSearch: (s: Record<string, unknown>): { zdroj?: string; tab?: Zalozka } => ({
    zdroj: typeof s.zdroj === "string" ? s.zdroj : undefined,
    tab: s.tab === "historia" || s.tab === "import" ? s.tab : undefined,
  }),
  component: Page,
});

function VyberZdroja({ id, onZmena }: { id: string; onZmena: (v: string) => void }) {
  const { t } = useT();
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <label htmlFor="zdroj-importu" className="text-sm font-semibold text-foreground">
        {t("Odkiaľ importujete")}
      </label>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Vyberte program, z ktorého máte export. Návod aj prípony súborov sa prispôsobia.")}
      </p>
      <select
        id="zdroj-importu"
        value={id}
        onChange={(e) => onZmena(e.target.value)}
        className="mt-3 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {IMPORT_ZDROJE.map((z) => (
          <option key={z.id} value={z.id}>
            {t(z.label)}
          </option>
        ))}
      </select>
    </section>
  );
}

function Page() {
  const { t } = useT();
  const { zdroj, tab } = Route.useSearch();
  const navigate = useNavigate();
  const aktivna: Zalozka = tab === "historia" ? "historia" : "import";
  const z = zdrojPodlaId(zdroj ?? PREDVOLENY_ZDROJ);
  const zmen = (v: string) =>
    navigate({ to: "/importy/novy", search: (s: { zdroj?: string; tab?: Zalozka }) => ({ ...s, zdroj: v }) });
  const zalozky = (
    <ZalozkyStranky
      zalozky={ZALOZKY}
      aktivna={aktivna}
      popis="Časti stránky Účtovné importy"
      onZmena={(kod) =>
        navigate({
          to: "/importy/novy",
          search: (s: { zdroj?: string; tab?: Zalozka }) => ({ ...s, tab: kod === "import" ? undefined : kod }),
          replace: true,
        })
      }
    />
  );
  const nadpis = t("Účtovné importy");
  const popis = t("Prechod do Faktera z iného fakturačného alebo účtovného programu.");

  if (aktivna === "historia") {
    return (
      <>
        <PageHeader title={nadpis} description={popis} />
        <PageBody>
          <div className="mx-auto mb-4 max-w-5xl">{zalozky}</div>
          <HistoriaImportov />
        </PageBody>
      </>
    );
  }

  /* Zdroje s vlastnou stránkou sem formulár nedostanú — SuperFaktúra si pýta
     priradenie stĺpcov a prijaté doklady berú viac súborov naraz. */
  if (z.cesta) {
    return (
      <>
        <PageHeader title={nadpis} description={popis} />
        <PageBody>
          <div className="mx-auto max-w-4xl space-y-6">
            {zalozky}
            <VyberZdroja id={z.id} onZmena={zmen} />
            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="text-base font-semibold">{t(z.title)}</h2>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">{z.guide}</div>
              <div className="mt-5 flex justify-end">
                <Link
                  to={z.cesta}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  {t("Otvoriť import")} <ArrowRight className="h-4 w-4" />
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
      title={nadpis}
      description={popis}
      accept={z.accept!}
      selector={<VyberZdroja id={z.id} onZmena={zmen} />}
      guide={z.guide}
      zalozky={zalozky}
    />
  );
}
