import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listSalesOrders } from "@/lib/faktero/sales-orders.functions";
import {
  STAV_POPIS,
  jePoTermine,
  percentoVybavenia,
  type StavPrijatejObjednavky,
} from "@/lib/faktero/objednavky-odberatel";
import { Plus, ClipboardList, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/objednavky/")({
  head: () => ({ meta: [{ title: "Prijaté objednávky — Faktero" }] }),
  component: OrdersPage,
});

const FARBA: Record<StavPrijatejObjednavky, string> = {
  draft: "bg-muted text-muted-foreground",
  confirmed: "bg-blue-500/10 text-blue-600",
  partially_invoiced: "bg-amber-500/10 text-amber-600",
  completed: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function suma(n: unknown) {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(
    Number(n) || 0,
  );
}

/** Dnešok v miestnom čase — `toISOString()` by po polnoci vrátil včerajšok. */
function dnesLokalne(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function datum(s?: string | null) {
  if (!s) return "—";
  const [r, m, d] = s.split("-");
  return `${Number(d)}. ${Number(m)}. ${r}`;
}

function OrdersPage() {
  const nacitaj = useServerFn(listSalesOrders);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"otvorene" | "vsetky">("otvorene");
  const dnes = useMemo(dnesLokalne, []);

  const nacitajZoznam = useCallback(() => {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    nacitaj({ data: { company_id: cid, ...(filter === "otvorene" ? { otvorene: true } : {}) } })
      .then((d: any) => setRows(d ?? []))
      .finally(() => setLoading(false));
  }, [nacitaj, filter]);

  useEffect(nacitajZoznam, [nacitajZoznam]);

  const spolu = useMemo(
    () =>
      rows.reduce(
        (s, r) => ({ hodnota: s.hodnota + Number(r.total || 0), zostava: s.zostava + Number(r.zostava || 0) }),
        { hodnota: 0, zostava: 0 },
      ),
    [rows],
  );

  return (
    <>
      <PageHeader
        title="Prijaté objednávky"
        description="Čo si u vás odberatelia objednali a čo z toho ešte nie je vyfakturované."
        action={
          <Link
            to="/objednavky/nova"
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nová objednávka
          </Link>
        }
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["otvorene", "vsetky"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs ${
                filter === f
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f === "otvorene" ? "Otvorené" : "Všetky"}
            </button>
          ))}
          {rows.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              Hodnota {suma(spolu.hodnota)} · nevyfakturované{" "}
              <span className="font-medium text-foreground">{suma(spolu.zostava)}</span>
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              {filter === "otvorene" ? "Žiadna otvorená objednávka" : "Zatiaľ žiadna objednávka"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Objednávka je záväzok odberateľa. Vzniká ručne alebo z prijatej cenovej ponuky a
              vybavuje sa faktúrami — aj po častiach.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium">Číslo</th>
                  <th className="px-4 py-2 text-left font-medium">Odberateľ</th>
                  <th className="px-4 py-2 text-left font-medium">Objednané</th>
                  <th className="px-4 py-2 text-left font-medium">Termín</th>
                  <th className="px-4 py-2 text-left font-medium">Stav</th>
                  <th className="px-4 py-2 text-right font-medium">Vybavené</th>
                  <th className="px-4 py-2 text-right font-medium">Hodnota</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const stav = (o.stav_vypocitany ?? o.status) as StavPrijatejObjednavky;
                  const meska = jePoTermine(o.requested_date, stav, dnes);
                  const percento = percentoVybavenia(o.sales_order_items ?? []);
                  return (
                    <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2">
                        <Link
                          to="/objednavky/$id"
                          params={{ id: o.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {o.order_number}
                        </Link>
                        {o.customer_order_number && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            u odberateľa {o.customer_order_number}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">{o.customers?.name ?? o.customer_name ?? "—"}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{datum(o.order_date)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {datum(o.requested_date)}
                        {meska && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="h-3 w-3" /> po termíne
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${FARBA[stav]}`}>
                          {STAV_POPIS[stav]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${percento}%` }}
                            />
                          </div>
                          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                            {percento} %
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{suma(o.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}
