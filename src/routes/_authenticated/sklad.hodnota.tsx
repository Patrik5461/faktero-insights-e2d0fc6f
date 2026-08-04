import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { getStockValuation } from "@/lib/faktero/stock.functions";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/hodnota")({
  head: () => ({ meta: [{ title: "Hodnota skladu — Faktero" }] }),
  component: ValuationPage,
});

function ValuationPage() {
  const fetchVal = useServerFn(getStockValuation);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    fetchVal({ data: { company_id: cid } })
      .then(setData)
      .finally(() => setLoading(false));
  }, [fetchVal]);

  function exportCsv() {
    if (!data) return;
    const lines = ["Produkt;SKU;Množstvo;Nákupná hodnota;Predajná hodnota"];
    for (const p of data.by_product) {
      lines.push(
        [
          p.name.replaceAll(";", ","),
          p.sku ?? "",
          String(p.qty),
          p.purchase.toFixed(2),
          p.sale.toFixed(2),
        ].join(";"),
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hodnota-skladu-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportXlsx() {
    if (!data) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const sheetA = XLSX.utils.json_to_sheet(
      data.by_warehouse.map((w: any) => ({
        Sklad: w.name,
        Množstvo: w.qty,
        "Nákupná hodnota": Number(w.purchase.toFixed(2)),
        "Predajná hodnota": Number(w.sale.toFixed(2)),
      })),
    );
    const sheetB = XLSX.utils.json_to_sheet(
      data.by_product.map((p: any) => ({
        Produkt: p.name,
        SKU: p.sku,
        Množstvo: p.qty,
        "Nákupná hodnota": Number(p.purchase.toFixed(2)),
        "Predajná hodnota": Number(p.sale.toFixed(2)),
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheetA, "Sklady");
    XLSX.utils.book_append_sheet(wb, sheetB, "Produkty");
    XLSX.writeFile(wb, `hodnota-skladu-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <>
      <PageHeader
        title="Hodnota skladu"
        description="Ocenenie zásob podľa nákupnej a predajnej ceny."
        action={
          data ? (
            <div className="flex gap-2">
              <button
                onClick={exportCsv}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
              >
                <Download className="h-4 w-4" /> CSV
              </button>
              <button
                onClick={exportXlsx}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
              >
                <Download className="h-4 w-4" /> XLSX
              </button>
            </div>
          ) : null
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : !data ? (
          <div className="text-sm text-muted-foreground">Žiadne dáta.</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Stat label="Celková nákupná hodnota" value={`${data.total_purchase.toFixed(2)} €`} />
              <Stat label="Odhad predajnej hodnoty" value={`${data.total_sale.toFixed(2)} €`} />
            </div>

            <div className="mt-6 rounded-xl border border-border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">Podľa skladu</div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-2">Sklad</th>
                    <th className="p-2 text-right">Množstvo</th>
                    <th className="p-2 text-right">Nákupná</th>
                    <th className="p-2 text-right">Predajná</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.by_warehouse.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-muted-foreground">
                        Žiadne stavy.
                      </td>
                    </tr>
                  )}
                  {data.by_warehouse.map((w: any) => (
                    <tr key={w.id}>
                      <td className="p-2">{w.name}</td>
                      <td className="p-2 text-right tabular-nums">{w.qty.toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums">{w.purchase.toFixed(2)} €</td>
                      <td className="p-2 text-right tabular-nums">{w.sale.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">Podľa produktu</div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-2">Produkt</th>
                    <th className="p-2">SKU</th>
                    <th className="p-2 text-right">Množstvo</th>
                    <th className="p-2 text-right">Nákupná</th>
                    <th className="p-2 text-right">Predajná</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.by_product.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-muted-foreground">
                        Žiadne stavy.
                      </td>
                    </tr>
                  )}
                  {data.by_product.map((p: any) => (
                    <tr key={p.stock_item_id}>
                      <td className="p-2">{p.name}</td>
                      <td className="p-2 text-muted-foreground">{p.sku ?? "—"}</td>
                      <td className="p-2 text-right tabular-nums">{p.qty.toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums">{p.purchase.toFixed(2)} €</td>
                      <td className="p-2 text-right tabular-nums">{p.sale.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              <Link to="/sklad" className="text-primary hover:underline">
                ← Sklad dashboard
              </Link>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
