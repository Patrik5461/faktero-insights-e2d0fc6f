import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listJobs } from "@/lib/faktero/jobs.functions";
import { STAV_ZAKAZKY_POPIS, prekrocenyRozpocet, type StavZakazky } from "@/lib/faktero/zakazky";
import { Plus, HardHat } from "lucide-react";

export const Route = createFileRoute("/_authenticated/zakazky/")({
  head: () => ({ meta: [{ title: "Zákazky — Faktero" }] }),
  component: JobsPage,
});

const FARBA_STAVU: Record<StavZakazky, string> = {
  active: "bg-blue-500/10 text-blue-600",
  closed: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function suma(n: number) {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(n || 0);
}

function JobsPage() {
  const fetchJobs = useServerFn(listJobs);
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

  return (
    <>
      <PageHeader
        title="Zákazky"
        description="Faktúry, materiál zo skladu a jazdy zvedené na jedno miesto. Zákazka povie, koľko na nej ostalo."
        action={
          <Link
            to="/zakazky/nova"
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nová zákazka
          </Link>
        }
      />
      <PageBody>
        <div className="mb-3 inline-flex rounded-md border border-border bg-card p-0.5 text-sm">
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
              className={`rounded px-3 py-1.5 ${
                filter === k ? "bg-secondary font-medium" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <HardHat className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {filter === "otvorene"
                ? "Žiadna otvorená zákazka."
                : "Zatiaľ ste nezaložili žiadnu zákazku."}
            </div>
            <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
              Zákazku priradíte faktúre, prijatej faktúre, výdaju zo skladu aj jazde. Náklady a
              výnosy sa potom zbierajú samy.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Číslo</th>
                  <th className="p-3">Názov</th>
                  <th className="p-3">Odberateľ</th>
                  <th className="p-3 text-right">Výnosy</th>
                  <th className="p-3 text-right">Náklady</th>
                  <th className="p-3 text-right">Zisk</th>
                  <th className="p-3 text-right">Marža</th>
                  <th className="p-3">Stav</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((j) => (
                  <tr key={j.id} className="hover:bg-muted/30">
                    <td className="p-3 font-medium">
                      <Link
                        to="/zakazky/$id"
                        params={{ id: j.id }}
                        className="text-primary hover:underline"
                      >
                        {j.job_number}
                      </Link>
                    </td>
                    <td className="p-3">{j.name}</td>
                    <td className="p-3 text-muted-foreground">{j.customer_name ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{suma(j.vynosy)}</td>
                    <td
                      className={`p-3 text-right tabular-nums ${
                        prekrocenyRozpocet(j) ? "font-medium text-destructive" : ""
                      }`}
                      title={
                        prekrocenyRozpocet(j)
                          ? `Prekročený plánovaný náklad ${suma(j.planovany_naklad)}`
                          : undefined
                      }
                    >
                      {suma(j.naklady)}
                    </td>
                    <td
                      className={`p-3 text-right font-medium tabular-nums ${
                        j.zisk < 0 ? "text-destructive" : "text-emerald-600"
                      }`}
                    >
                      {suma(j.zisk)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {j.marza == null ? "—" : `${j.marza} %`}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs ${
                          FARBA_STAVU[j.status as StavZakazky] ?? ""
                        }`}
                      >
                        {STAV_ZAKAZKY_POPIS[j.status as StavZakazky] ?? j.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/20 font-medium">
                <tr>
                  <td className="p-3" colSpan={3}>
                    Spolu ({rows.length})
                  </td>
                  <td className="p-3 text-right tabular-nums">{suma(spolu.vynosy)}</td>
                  <td className="p-3 text-right tabular-nums">{suma(spolu.naklady)}</td>
                  <td
                    className={`p-3 text-right tabular-nums ${
                      spolu.zisk < 0 ? "text-destructive" : "text-emerald-600"
                    }`}
                  >
                    {suma(spolu.zisk)}
                  </td>
                  <td className="p-3" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}
