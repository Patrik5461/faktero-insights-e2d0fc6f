import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { getStockValuation } from "@/lib/faktero/stock.functions";
import { Download } from "lucide-react";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { formatujCislo, formatujMenu } from "@/lib/faktero/mena";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

import { csvBunka } from "@/lib/faktero/export-helpers";
export const Route = createFileRoute("/_authenticated/sklad/hodnota")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Hodnota skladu — Faktero") }],
  }),
  component: ValuationPage,
});

function ValuationPage() {
  const { t } = useT();
  const mena = useMenaFirmy();
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
    const lines = [
      ["Produkt", "SKU", "Množstvo", "Nákupná hodnota", "Predajná hodnota"]
        .map((h) => t(h))
        .join(";"),
    ];
    for (const p of data.by_product) {
      lines.push(
        [p.name, p.sku ?? "", String(p.qty), p.purchase.toFixed(2), p.sale.toFixed(2)]
          .map(csvBunka)
          .join(";"),
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
        [t("Sklad")]: w.name,
        [t("Množstvo")]: w.qty,
        [t("Nákupná hodnota")]: Number(w.purchase.toFixed(2)),
        [t("Predajná hodnota")]: Number(w.sale.toFixed(2)),
      })),
    );
    const sheetB = XLSX.utils.json_to_sheet(
      data.by_product.map((p: any) => ({
        [t("Produkt")]: p.name,
        [t("SKU")]: p.sku,
        [t("Množstvo")]: p.qty,
        [t("Nákupná hodnota")]: Number(p.purchase.toFixed(2)),
        [t("Predajná hodnota")]: Number(p.sale.toFixed(2)),
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheetA, t("Sklady"));
    XLSX.utils.book_append_sheet(wb, sheetB, t("Produkty"));
    XLSX.writeFile(wb, `hodnota-skladu-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <>
      <PageHeader
        title={t("Hodnota skladu")}
        description={t("Ocenenie zásob podľa nákupnej a predajnej ceny.")}
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
          <div className="text-sm text-muted-foreground">{t("Načítavam…")}</div>
        ) : !data ? (
          <div className="text-sm text-muted-foreground">{t("Žiadne dáta.")}</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Stat
                label="Celková nákupná hodnota"
                value={formatujMenu(data.total_purchase, mena.kod)}
              />
              <Stat
                label="Odhad predajnej hodnoty"
                value={formatujMenu(data.total_sale, mena.kod)}
              />
            </div>

            <div className="mt-6 min-w-0 rounded-xl border border-border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">{t("Podľa skladu")}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-2">{t("Sklad")}</th>
                      <th className="p-2 text-right">{t("Množstvo")}</th>
                      <th className="p-2 text-right">{t("Nákupná")}</th>
                      <th className="p-2 text-right">{t("Predajná")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.by_warehouse.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-muted-foreground">
                          {t("Žiadne stavy.")}
                        </td>
                      </tr>
                    )}
                    {data.by_warehouse.map((w: any) => (
                      <tr key={w.id}>
                        <td className="p-2">{w.name}</td>
                        <td className="p-2 text-right tabular-nums">
                          {formatujCislo(w.qty, 0, 2)}
                        </td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">
                          {formatujMenu(w.purchase, mena.kod)}
                        </td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">
                          {formatujMenu(w.sale, mena.kod)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 min-w-0 rounded-xl border border-border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">{t("Podľa produktu")}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-2">{t("Produkt")}</th>
                      <th className="p-2">{t("Kód")}</th>
                      <th className="p-2 text-right">{t("Množstvo")}</th>
                      <th className="p-2 text-right">{t("Nákupná")}</th>
                      <th className="p-2 text-right">{t("Predajná")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.by_product.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-muted-foreground">
                          {t("Žiadne stavy.")}
                        </td>
                      </tr>
                    )}
                    {data.by_product.map((p: any) => (
                      <tr key={p.stock_item_id}>
                        <td className="p-2">{p.name}</td>
                        <td className="p-2 whitespace-nowrap text-muted-foreground">
                          {p.sku ?? "—"}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {formatujCislo(p.qty, 0, 2)}
                        </td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">
                          {formatujMenu(p.purchase, mena.kod)}
                        </td>
                        <td className="p-2 text-right tabular-nums whitespace-nowrap">
                          {formatujMenu(p.sale, mena.kod)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              <Link to="/sklad" className="text-primary hover:underline">
                {t("← Prehľad skladu")}
              </Link>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{t(label)}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
