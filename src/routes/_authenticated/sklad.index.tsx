import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { getStockDashboard } from "@/lib/faktero/stock.functions";
import { Warehouse, AlertTriangle, Package, TrendingUp, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/")({
  head: () => ({ meta: [{ title: "Sklad — Faktero" }] }),
  component: SkladDashboard,
});

function SkladDashboard() {
  const fetch = useServerFn(getStockDashboard);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) { setLoading(false); return; }
    fetch({ data: { company_id: cid } }).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [fetch]);

  return (
    <>
      <PageHeader title="Skladové hospodárstvo" description="Prehľad stavu skladu, položiek a posledných pohybov." />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : !data ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Žiadne dáta. <Link to="/sklad/nastavenia" className="text-primary hover:underline">Vytvorte sklad</Link>.
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Stat icon={Package} label="Skladové položky" value={String(data.total_items)} accent="text-primary" />
              <Stat icon={TrendingUp} label="Hodnota skladu" value={`${Number(data.total_value).toFixed(2)} €`} accent="text-emerald-600" />
              <Stat icon={AlertTriangle} label="Pod minimom" value={String(data.below_min_count)} accent={data.below_min_count ? "text-amber-600" : "text-muted-foreground"} />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Card title="Položky pod minimálnym stavom">
                {data.below_min_items.length === 0 ? <p className="text-sm text-muted-foreground">Všetky položky majú dostatočný stav.</p> : null}
                <Link to="/sklad/produkty" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">Spravovať položky <ArrowRight className="h-3.5 w-3.5" /></Link>
              </Card>
              <Card title="Posledné pohyby">
                {data.recent_movements.length === 0 ? <p className="text-sm text-muted-foreground">Zatiaľ žiadne pohyby.</p> : null}
                <Link to="/sklad/pohyby" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">Všetky pohyby <ArrowRight className="h-3.5 w-3.5" /></Link>
              </Card>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <QuickLink to="/sklad/prijem" label="Príjem na sklad" />
              <QuickLink to="/sklad/vydaj" label="Výdaj zo skladu" />
              <QuickLink to="/sklad/inventura" label="Inventúra" />
              <QuickLink to="/sklad/hodnota" label="Hodnota skladu" />
              <QuickLink to="/sklad/minimum" label="Pod minimom" />
              <QuickLink to="/sklad/import" label="Import CSV" />
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: string }) {
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span><Icon className={`h-4 w-4 ${accent ?? ""}`} /></div><div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div></div>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Warehouse className="h-4 w-4 text-primary" />{title}</div>{children}</div>;
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return <Link to={to as any} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm hover:border-primary/40 hover:bg-secondary/40">{label} <ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>;
}