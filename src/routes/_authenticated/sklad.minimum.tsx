import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { getLowStockReport } from "@/lib/faktero/stock.functions";
import { AlertTriangle, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/minimum")({
  head: () => ({ meta: [{ title: "Pod minimom — Faktero" }] }),
  component: LowStockPage,
});

function LowStockPage() {
  const fetchLow = useServerFn(getLowStockReport);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    fetchLow({ data: { company_id: cid } })
      .then((d) => setRows(d.rows))
      .finally(() => setLoading(false));
  }, [fetchLow]);

  return (
    <>
      <PageHeader
        title="Pod minimálnym stavom"
        description="Produkty, ktoré dosiahli alebo klesli pod minimum. Stĺpec Objednať dopĺňa zásobu na optimum; rezervovaný tovar sa počíta ako chýbajúci."
      />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Všetky sledované položky majú dostatočný stav.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Produkt</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3 text-right">Stav</th>
                  <th className="p-3 text-right">Rezervované</th>
                  <th className="p-3 text-right">Minimum</th>
                  <th className="p-3 text-right">Optimum</th>
                  <th className="p-3 text-right">Objednať</th>
                  <th className="p-3">Sklady</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.stock_item_id}>
                    <td className="p-3 font-medium">
                      {r.product_id ? (
                        <Link
                          to="/sklad/produkty/$id"
                          params={{ id: r.product_id }}
                          className="text-primary hover:underline"
                        >
                          {r.name}
                        </Link>
                      ) : (
                        r.name
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{r.sku ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums text-amber-600">
                      <AlertTriangle className="mr-1 inline h-3 w-3" />
                      {r.current.toFixed(2)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {r.reserved > 0 ? r.reserved.toFixed(2) : "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums">{r.min.toFixed(2)}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {r.optimal > 0 ? r.optimal.toFixed(2) : "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums font-semibold">
                      {r.order_qty.toFixed(2)} {r.unit ?? ""}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {r.per_warehouse
                        .map((w: any) => `${w.warehouse_name}: ${w.quantity.toFixed(2)}`)
                        .join(" · ") || "—"}
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        to="/sklad/prijem"
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                      >
                        <Plus className="h-3 w-3" /> Vytvoriť príjem
                      </Link>
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
