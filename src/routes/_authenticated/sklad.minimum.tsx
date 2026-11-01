import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { getLowStockReport } from "@/lib/faktero/stock.functions";
import { AlertTriangle, Plus } from "lucide-react";
import { formatujCislo } from "@/lib/faktero/mena";
import { useT } from "@/lib/i18n/useT";
import { StavOdznak } from "@/components/faktero/web/Stav";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { EmptyState } from "@/components/faktero/ListControls";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/sklad/minimum")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Pod minimom — Faktero") }],
  }),
  component: LowStockPage,
});

function LowStockPage() {
  const { t } = useT();
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
        title={t("Pod minimálnym stavom")}
        description={
          rows.length > 0
            ? t(
                "Stĺpec Objednať dopĺňa zásobu na optimum. Rezervovaný tovar sa počíta ako chýbajúci, tovar objednaný u dodávateľa naopak ako už zabezpečený.",
              )
            : t("Položky, ktorých stav klesol pod nastavené minimum.")
        }
        action={
          rows.length > 0 ? (
            <Link
              to="/sklad/objednavky/nova"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Objednať u dodávateľa")}
            </Link>
          ) : undefined
        }
      />
      <PageBody>
        {loading ? (
          <NacitavanieStav />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState title="Všetky sledované položky majú dostatočný stav." />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="p-3">{t("Produkt")}</th>
                  <th className="p-3">{t("Kód")}</th>
                  <th className="p-3 text-right">{t("sklad::Stav")}</th>
                  <th className="p-3 text-right">{t("Rezervované")}</th>
                  <th className="p-3 text-right">{t("Na ceste")}</th>
                  <th className="p-3 text-right">{t("Minimum")}</th>
                  <th className="p-3 text-right">{t("Optimum")}</th>
                  <th className="p-3 text-right">{t("Objednať")}</th>
                  <th className="p-3">{t("Sklady")}</th>
                  <th>
                    <span className="sr-only">{t("Akcie")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.stock_item_id}>
                    <td className="p-3 min-w-[10rem] font-medium break-words">
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
                    <td className="p-3 whitespace-nowrap text-muted-foreground">{r.sku ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">
                      <StavOdznak ton="pozor" ikona={<AlertTriangle aria-hidden />}>
                        {formatujCislo(r.current, 0, 2)}
                      </StavOdznak>
                    </td>
                    <td className="p-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                      {r.reserved > 0 ? formatujCislo(r.reserved, 0, 2) : "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                      {r.incoming > 0 ? formatujCislo(r.incoming, 0, 2) : "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums whitespace-nowrap">
                      {formatujCislo(r.min, 0, 2)}
                    </td>
                    <td className="p-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                      {r.optimal > 0 ? formatujCislo(r.optimal, 0, 2) : "—"}
                    </td>
                    <td className="p-3 text-right suma">
                      {formatujCislo(r.order_qty, 0, 2)} {r.unit ?? ""}
                    </td>
                    <td className="p-3 min-w-[9rem] text-xs text-muted-foreground">
                      {r.per_warehouse
                        .map((w: any) => `${w.warehouse_name}: ${formatujCislo(w.quantity, 0, 2)}`)
                        .join(" · ") || "—"}
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        to="/sklad/prijem"
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-input bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
                      >
                        <Plus className="h-3 w-3" /> {t("Vytvoriť príjem")}
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
