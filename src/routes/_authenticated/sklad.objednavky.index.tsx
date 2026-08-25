import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listPurchaseOrders } from "@/lib/faktero/purchase-orders.functions";
import { STAV_POPIS, type StavObjednavky } from "@/lib/faktero/objednavky-dodavatel";
import { Plus, Truck } from "lucide-react";
import { formatovacMeny } from "@/lib/faktero/mena";

export const Route = createFileRoute("/_authenticated/sklad/objednavky/")({
  head: () => ({ meta: [{ title: "Objednávky u dodávateľov — Faktero" }] }),
  component: PurchaseOrdersPage,
});

const FARBA_STAVU: Record<StavObjednavky, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/10 text-blue-600",
  partially_received: "bg-amber-500/10 text-amber-600",
  received: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function suma(n: number, mena: string) {
  return formatovacMeny(mena || "EUR", "sk-SK")(n || 0);
}

function PurchaseOrdersPage() {
  const fetchOrders = useServerFn(listPurchaseOrders);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"vsetky" | "otvorene">("otvorene");

  const nacitaj = useCallback(() => {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchOrders({ data: { company_id: cid, only_open: filter === "otvorene" } })
      .then((d: any) => setRows(d ?? []))
      .finally(() => setLoading(false));
  }, [fetchOrders, filter]);

  useEffect(nacitaj, [nacitaj]);

  return (
    <>
      <PageHeader
        title="Objednávky u dodávateľov"
        description="Čo je objednané a ešte neprišlo. Otvorené objednávky sa odpočítavajú od návrhu doobjednania."
        action={
          <Link
            to="/sklad/objednavky/nova"
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nová objednávka
          </Link>
        }
      />
      <PageBody>
        <div className="mb-3 inline-flex rounded-md border border-border bg-card p-0.5 text-sm">
          {(
            [
              ["otvorene", "Otvorené"],
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
            <Truck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {filter === "otvorene"
                ? "Žiadna otvorená objednávka."
                : "Zatiaľ ste nevystavili žiadnu objednávku."}
            </div>
            <Link
              to="/sklad/minimum"
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              Pozrieť, čo je pod minimom →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Číslo</th>
                  <th className="p-3">Dodávateľ</th>
                  <th className="p-3">Vystavená</th>
                  <th className="p-3">Očakávaná</th>
                  <th className="p-3 text-right">Položiek</th>
                  <th className="p-3 text-right">Spolu</th>
                  <th className="p-3">Stav</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/30">
                    <td className="p-3 font-medium">
                      <Link
                        to="/sklad/objednavky/$id"
                        params={{ id: o.id }}
                        className="text-primary hover:underline"
                      >
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="p-3">{o.supplier_name ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{o.order_date}</td>
                    <td className="p-3 text-muted-foreground">{o.expected_date ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{o.items_count}</td>
                    <td className="p-3 text-right tabular-nums">{suma(o.total, o.currency)}</td>
                    <td className="p-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs ${
                          FARBA_STAVU[o.status as StavObjednavky] ?? ""
                        }`}
                      >
                        {STAV_POPIS[o.status as StavObjednavky] ?? o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}
