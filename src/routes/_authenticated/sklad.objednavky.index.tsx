import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listPurchaseOrders } from "@/lib/faktero/purchase-orders.functions";
import { STAV_POPIS, type StavObjednavky } from "@/lib/faktero/objednavky-dodavatel";
import { Plus, SearchX, Truck } from "lucide-react";
import { formatovacMeny } from "@/lib/faktero/mena";
import { OdkazNaRady } from "@/components/faktero/OdkazNaRady";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { DocumentListToolbar } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { StavOdznak, tonStavu, type TonStavu } from "@/components/faktero/web/Stav";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { EmptyState } from "@/components/faktero/ListControls";

export const Route = createFileRoute("/_authenticated/sklad/objednavky/")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Objednávky u dodávateľov — Faktero") }],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: PurchaseOrdersPage,
});

/** Tón stavu objednávky (texty ostávajú zo `STAV_POPIS`). */
const TON_OBJEDNAVKY: Record<StavObjednavky, TonStavu> = {
  draft: "neutralny",
  sent: "priebeh",
  partially_received: "pozor",
  received: "uspech",
  cancelled: "zruseny",
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
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
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
          <NacitavanieStav />
        ) : rows.length > 0 && zobrazene.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState icon={SearchX} title="Nič nevyhovuje filtru." />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState
              icon={Truck}
              title={
                filter === "otvorene"
                  ? "Žiadna otvorená objednávka."
                  : "Zatiaľ ste nevystavili žiadnu objednávku."
              }
              action={
                <Link
                  to="/sklad/minimum"
                  className="inline-block text-sm font-semibold text-primary hover:underline"
                >
                  {t("Pozrieť, čo je pod minimom →")}
                </Link>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
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
                    <td className="whitespace-nowrap p-3">
                      <Link
                        to="/sklad/objednavky/$id"
                        params={{ id: o.id }}
                        className="cislo-dokladu text-primary hover:underline"
                      >
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="max-w-[16rem] truncate p-3" title={o.supplier_name ?? undefined}>
                      {o.supplier_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{datumNaDoklade(o.order_date)}</td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{o.expected_date ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{o.items_count}</td>
                    <td className="suma p-3 text-right">{suma(o.total, o.currency)}</td>
                    <td className="p-3">
                      <StavOdznak ton={tonStavu(TON_OBJEDNAVKY, o.status)}>
                        {t(STAV_POPIS[o.status as StavObjednavky] ?? o.status)}
                      </StavOdznak>
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
