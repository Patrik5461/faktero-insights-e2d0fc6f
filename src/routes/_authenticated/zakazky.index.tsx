import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listJobs } from "@/lib/faktero/jobs.functions";
import { STAV_ZAKAZKY_POPIS, prekrocenyRozpocet, type StavZakazky } from "@/lib/faktero/zakazky";
import { Plus, HardHat } from "lucide-react";
import { useFormatMenyFirmy } from "@/components/faktero/SuctyPoMenach";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { EmptyState } from "@/components/faktero/ListControls";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { useStrankovanie } from "@/hooks/useStrankovanie";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { StavOdznak, type TonStavu } from "@/components/faktero/web/Stav";

export const Route = createFileRoute("/_authenticated/zakazky/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Zákazky — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: JobsPage,
});

/** Stav zákazky → tón jednotného stavového odznaku (text ostáva z STAV_ZAKAZKY_POPIS). */
const TON_ZAKAZKY: Record<StavZakazky, TonStavu> = {
  active: "informacia",
  closed: "uspech",
  cancelled: "zruseny",
};

/** Kladný zisk — tón „úspech“ z dizajnového systému (nie pevná zelená). */
const KLADNE = "text-[color:var(--stav-uspech-text)]";

function JobsPage() {
  const { t } = useT();
  const fetchJobs = useServerFn(listJobs);
  // Vyhodnotenie zákaziek je v domácej mene firmy (CZ firma Kč), nie natvrdo v EUR (K-01).
  const menyFirmy = useFormatMenyFirmy();
  const suma = (n: number) => menyFirmy.suma(n || 0);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"otvorene" | "uzavrete" | "vsetky">("otvorene");

  const nacitaj = useCallback(() => {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchJobs({
      data: {
        company_id: cid,
        ...(filter === "otvorene"
          ? { status: "active" as const }
          : filter === "uzavrete"
            ? { status: "closed" as const }
            : {}),
      },
    })
      .then((d: any) => setRows(d ?? []))
      .finally(() => setLoading(false));
  }, [fetchJobs, filter]);

  useEffect(nacitaj, [nacitaj]);

  const spolu = useMemo(
    () =>
      rows.reduce(
        (s, r) => ({
          vynosy: s.vynosy + (r.vynosy ?? 0),
          naklady: s.naklady + (r.naklady ?? 0),
          zisk: s.zisk + (r.zisk ?? 0),
        }),
        { vynosy: 0, naklady: 0, zisk: 0 },
      ),
    [rows],
  );
  // Súčty ostávajú zo všetkých zákaziek, kreslí sa len jedna strana.
  const lf = useListFilters({ pageSizeKey: "zakazky" });
  const strankovanie = useStrankovanie(rows, lf, { reset: filter });

  return (
    <>
      <PageHeader
        title={t("Zákazky")}
        description={t(
          "Faktúry, materiál zo skladu a jazdy zvedené na jedno miesto. Zákazka povie, koľko na nej ostalo.",
        )}
        action={
          <Link
            to="/zakazky/nova"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" /> {t("Nová zákazka")}
          </Link>
        }
      />
      <PageBody>
        <div className="mb-4 inline-flex max-w-full flex-wrap rounded-lg border border-border bg-card p-0.5 text-sm">
          {(
            [
              ["otvorene", "Otvorené"],
              ["uzavrete", "Uzavreté"],
              ["vsetky", "Všetky"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={`rounded-md px-3 py-1.5 ${
                filter === k
                  ? "bg-primary/10 font-semibold text-primary-hover"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-card">
            <NacitavanieStav />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState
              icon={HardHat}
              title={
                filter === "otvorene"
                  ? "Žiadna otvorená zákazka."
                  : filter === "uzavrete"
                    ? "Žiadna uzavretá zákazka."
                    : "Zatiaľ ste nezaložili žiadnu zákazku."
              }
              description="Zákazku priradíte faktúre, prijatej faktúre, výdaju zo skladu aj jazde. Náklady a výnosy sa potom zbierajú samy."
            />
          </div>
        ) : (
          <>
            <ResponsiveTable
              items={strankovanie.viditelne}
              desktop={
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                      <tr>
                        <th className="whitespace-nowrap p-3">{t("Číslo")}</th>
                        <th className="p-3">{t("Názov")}</th>
                        <th className="p-3">{t("Odberateľ")}</th>
                        <th className="p-3 text-right">{t("Výnosy")}</th>
                        <th className="p-3 text-right">{t("Náklady")}</th>
                        <th className="p-3 text-right">{t("Zisk")}</th>
                        <th className="p-3 text-right">{t("Marža")}</th>
                        <th className="p-3">{t("Stav")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {strankovanie.viditelne.map((j) => (
                        <KlikatelnyRiadok key={j.id} ciel={{ to: "/zakazky/$id", params: { id: j.id } }}>
                          <td className="whitespace-nowrap p-3">
                            <Link
                              to="/zakazky/$id"
                              params={{ id: j.id }}
                              className="cislo-dokladu text-primary hover:underline"
                            >
                              {j.job_number}
                            </Link>
                          </td>
                          <td className="max-w-[18rem] p-3 break-words">{j.name}</td>
                          <td className="max-w-[14rem] p-3 break-words text-muted-foreground">
                            {j.customer_name ?? "—"}
                          </td>
                          <td className="suma p-3 text-right">{suma(j.vynosy)}</td>
                          <td
                            className={`suma p-3 text-right ${
                              prekrocenyRozpocet(j) ? "font-bold text-destructive" : ""
                            }`}
                            title={
                              prekrocenyRozpocet(j)
                                ? t("Prekročený plánovaný náklad {suma}", {
                                    suma: suma(j.planovany_naklad),
                                  })
                                : undefined
                            }
                          >
                            {suma(j.naklady)}
                          </td>
                          <td
                            className={`suma p-3 text-right ${
                              j.zisk < 0 ? "text-destructive" : KLADNE
                            }`}
                          >
                            {suma(j.zisk)}
                          </td>
                          <td className="whitespace-nowrap p-3 text-right tabular-nums text-muted-foreground">
                            {j.marza == null ? "—" : `${j.marza} %`}
                          </td>
                          <td className="p-3">
                            <StavOdznak ton={TON_ZAKAZKY[j.status as StavZakazky] ?? "neutralny"}>
                              {t(STAV_ZAKAZKY_POPIS[j.status as StavZakazky] ?? j.status)}
                            </StavOdznak>
                          </td>
                        </KlikatelnyRiadok>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-border bg-muted/30 font-bold">
                      <tr>
                        <td className="p-3" colSpan={3}>
                          {t("Spolu ({n})", { n: rows.length })}
                        </td>
                        <td className="suma p-3 text-right !font-bold">{suma(spolu.vynosy)}</td>
                        <td className="suma p-3 text-right !font-bold">{suma(spolu.naklady)}</td>
                        <td
                          className={`suma p-3 text-right !font-bold ${
                            spolu.zisk < 0 ? "text-destructive" : KLADNE
                          }`}
                        >
                          {suma(spolu.zisk)}
                        </td>
                        <td className="p-3" colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              }
              mobileCard={(j: any) => (
                <MobileListCard
                  ciel={{ to: "/zakazky/$id", params: { id: j.id } }}
                  title={j.job_number}
                  subtitle={j.customer_name ? `${j.name} · ${j.customer_name}` : j.name}
                  status={
                    <StavOdznak ton={TON_ZAKAZKY[j.status as StavZakazky] ?? "neutralny"} maly>
                      {t(STAV_ZAKAZKY_POPIS[j.status as StavZakazky] ?? j.status)}
                    </StavOdznak>
                  }
                  meta={
                    <>
                      {t("Výnosy")} {suma(j.vynosy)} ·{" "}
                      <span className={prekrocenyRozpocet(j) ? "font-medium text-destructive" : ""}>
                        {t("Náklady")} {suma(j.naklady)}
                      </span>
                      {j.marza != null && ` · ${t("Marža")} ${j.marza} %`}
                    </>
                  }
                  amount={
                    <span
                      className={`suma ${j.zisk < 0 ? "text-destructive" : KLADNE}`}
                    >
                      {suma(j.zisk)}
                    </span>
                  }
                />
              )}
            />
            {/* Súčtový riadok tabuľky — na telefóne ako samostatná karta pod zoznamom. */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-border bg-card p-3 text-sm font-bold sm:hidden">
              <span>{t("Spolu ({n})", { n: rows.length })}</span>
              <span
                className={`suma !font-bold ${spolu.zisk < 0 ? "text-destructive" : KLADNE}`}
              >
                {suma(spolu.zisk)}
              </span>
              <span className="w-full text-xs font-normal text-muted-foreground tabular-nums">
                {t("Výnosy")} {suma(spolu.vynosy)} · {t("Náklady")} {suma(spolu.naklady)}
              </span>
            </div>
            {strankovanie.stranky()}
          </>
        )}
      </PageBody>
    </>
  );
}
