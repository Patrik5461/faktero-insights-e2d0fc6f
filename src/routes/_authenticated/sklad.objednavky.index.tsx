import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listPurchaseOrders } from "@/lib/faktero/purchase-orders.functions";
import { STAV_POPIS, type StavObjednavky } from "@/lib/faktero/objednavky-dodavatel";
import { Plus, Truck } from "lucide-react";
import { formatovacMeny } from "@/lib/faktero/mena";
import { OdkazNaRady } from "@/components/faktero/OdkazNaRady";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { DocumentListToolbar } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";

export const Route = createFileRoute("/_authenticated/sklad/objednavky/")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Objednávky u dodávateľov — Faktero") }],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
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
  const { t } = useT();
  const fetchOrders = useServerFn(listPurchaseOrders);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const lf = useListFilters();
  // Predvolene len otvorené; „Všetky“ si načíta zo servera aj prijaté a zrušené.
  const filter: "vsetky" | "otvorene" = lf.filter("stav") === "vsetky" ? "vsetky" : "otvorene";
  const { od: obdobieOd, do: obdobieDo } = lf.rozsah("obdobie");

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

  // Hľadanie a obdobie len prechádzajú načítané objednávky.
  const hladane = lf.q.trim().toLowerCase();
  const zobrazene = useMemo(
    () =>
      rows.filter((o) => {
        if (obdobieOd && (!o.order_date || o.order_date < obdobieOd)) return false;
        if (obdobieDo && (!o.order_date || o.order_date > obdobieDo)) return false;
        if (!hladane) return true;
        return [o.order_number, o.supplier_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(hladane));
      }),
    [rows, hladane, obdobieOd, obdobieDo],
  );

  return (
    <>
      <PageHeader
        title={t("Objednávky u dodávateľov")}
        description={t(
          "Čo je objednané a ešte neprišlo. Otvorené objednávky sa odpočítavajú od návrhu doobjednania.",
        )}
        action={
          <div className="flex flex-wrap gap-2">
            <OdkazNaRady />
            <Link
              to="/sklad/objednavky/nova"
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Nová objednávka")}
            </Link>
          </div>
        }
      />
      <PageBody>
        <DocumentListToolbar
          lf={lf}
          searchPlaceholder="Hľadať dodávateľa alebo číslo"
          filters={[
            {
              key: "stav",
              label: "Stav",
              type: "select",
              allLabel: "Otvorené",
              options: [{ value: "vsetky", label: "Všetky" }],
            },
            { key: "obdobie", label: "Obdobie", type: "dateRange" },
          ]}
        />

        {loading ? (
          <div className="text-sm text-muted-foreground">{t("Načítavam…")}</div>
        ) : rows.length > 0 && zobrazene.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {t("Nič nevyhovuje filtru.")}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Truck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {filter === "otvorene"
                ? t("Žiadna otvorená objednávka.")
                : t("Zatiaľ ste nevystavili žiadnu objednávku.")}
            </div>
            <Link
              to="/sklad/minimum"
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              {t("Pozrieť, čo je pod minimom →")}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">{t("Číslo")}</th>
                  <th className="p-3">{t("Dodávateľ")}</th>
                  <th className="p-3">{t("Vystavená")}</th>
                  <th className="p-3">{t("Očakávaná")}</th>
                  <th className="p-3 text-right">{t("Položiek")}</th>
                  <th className="p-3 text-right">{t("Spolu")}</th>
                  <th className="p-3">{t("Stav")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {zobrazene.map((o) => (
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
                    <td className="p-3 text-muted-foreground">{datumNaDoklade(o.order_date)}</td>
                    <td className="p-3 text-muted-foreground">{o.expected_date ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{o.items_count}</td>
                    <td className="p-3 text-right tabular-nums">{suma(o.total, o.currency)}</td>
                    <td className="p-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs ${
                          FARBA_STAVU[o.status as StavObjednavky] ?? ""
                        }`}
                      >
                        {t(STAV_POPIS[o.status as StavObjednavky] ?? o.status)}
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
