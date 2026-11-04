import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { TabulkaZoznamu } from "@/components/faktero/TabulkaZoznamu";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listSalesOrders } from "@/lib/faktero/sales-orders.functions";
import {
  STAV_POPIS,
  jePoTermine,
  percentoVybavenia,
  type StavPrijatejObjednavky,
} from "@/lib/faktero/objednavky-odberatel";
import { Plus, ClipboardList, AlertTriangle } from "lucide-react";
import { SuctyPoMenach, useFormatMenyFirmy } from "@/components/faktero/SuctyPoMenach";
import { OdkazNaRady } from "@/components/faktero/OdkazNaRady";
import { DocumentListToolbar } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { EmptyState } from "@/components/faktero/ListControls";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { StavOdznak, tonStavu, type TonStavu } from "@/components/faktero/web/Stav";

export const Route = createFileRoute("/_authenticated/objednavky/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Prijaté objednávky — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: OrdersPage,
});

/* Tón odznaku stavu prijatej objednávky (Stav.tsx nemá mapu pre objednávky). */
const TON_OBJEDNAVKY: Record<StavPrijatejObjednavky, TonStavu> = {
  draft: "neutralny",
  confirmed: "informacia",
  partially_invoiced: "pozor",
  completed: "uspech",
  cancelled: "zruseny",
};

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
  const { t } = useT();
  const nacitaj = useServerFn(listSalesOrders);
  const menyFirmy = useFormatMenyFirmy();
  const suma = (n: unknown, mena: unknown) => menyFirmy.suma(Number(n) || 0, mena);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const lf = useListFilters();
  // Predvolene len otvorené; „Všetky“ si načíta zo servera aj vybavené a zrušené.
  const filter: "otvorene" | "vsetky" = lf.filter("stav") === "vsetky" ? "vsetky" : "otvorene";
  const { od: obdobieOd, do: obdobieDo } = lf.rozsah("obdobie");
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

  // Hľadanie a obdobie len prechádzajú načítané objednávky.
  const hladane = lf.q.trim().toLowerCase();
  const zobrazene = useMemo(
    () =>
      rows.filter((o) => {
        if (obdobieOd && (!o.order_date || o.order_date < obdobieOd)) return false;
        if (obdobieDo && (!o.order_date || o.order_date > obdobieDo)) return false;
        if (!hladane) return true;
        return [o.order_number, o.customer_order_number, o.customers?.name, o.customer_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(hladane));
      }),
    [rows, hladane, obdobieOd, obdobieDo],
  );

  // Po menách (D-01, K-14) a obe hodnoty s DPH, aby sa dali porovnať (D-03).
  const spolu = useMemo(
    () => ({
      hodnota: menyFirmy.sucty(zobrazene, (r) => Number(r.total || 0), (r) => r.currency),
      zostava: menyFirmy.sucty(
        zobrazene,
        (r) => Number(r.zostava_s_dph ?? r.zostava ?? 0),
        (r) => r.currency,
      ),
    }),
    [zobrazene, menyFirmy],
  );

  return (
    <>
      <PageHeader
        title={t("Prijaté objednávky")}
        description={t("Čo si u vás odberatelia objednali a čo z toho ešte nie je vyfakturované.")}
        action={
          <div className="flex flex-wrap gap-2">
            <OdkazNaRady />
            <Link
              to="/objednavky/nova"
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
          searchPlaceholder="Hľadať číslo, odberateľa…"
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
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {zobrazene.length > 0 && (
            <span className="ml-auto inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
              {t("Hodnota s DPH")} <SuctyPoMenach sucty={spolu.hodnota} /> · {t("nevyfakturované s DPH")}{" "}
              <SuctyPoMenach sucty={spolu.zostava} className="suma text-foreground" />
            </span>
          )}
        </div>

        {loading ? (
          <NacitavanieStav className="rounded-xl border border-border bg-card" />
        ) : rows.length > 0 && zobrazene.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {t("Nič nevyhovuje filtru.")}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState
              icon={ClipboardList}
              title={filter === "otvorene" ? "Žiadna otvorená objednávka" : "Zatiaľ žiadna objednávka"}
              description="Objednávka je záväzok odberateľa. Vzniká ručne alebo z prijatej cenovej ponuky a vybavuje sa faktúrami — aj po častiach."
            />
          </div>
        ) : (
          <ResponsiveTable
            items={zobrazene}
            desktop={
              <TabulkaZoznamu>
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground [&_th]:whitespace-nowrap">
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-left font-semibold">{t("Číslo")}</th>
                      <th className="px-4 py-2 text-left font-semibold">{t("Odberateľ")}</th>
                      <th className="px-4 py-2 text-left font-semibold">{t("Objednané")}</th>
                      <th className="px-4 py-2 text-left font-semibold">{t("Termín")}</th>
                      <th className="px-4 py-2 text-left font-semibold">{t("Stav")}</th>
                      <th className="px-4 py-2 text-right font-semibold">{t("Vybavené")}</th>
                      <th className="px-4 py-2 text-right font-semibold">{t("Hodnota")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zobrazene.map((o) => {
                      const stav = (o.stav_vypocitany ?? o.status) as StavPrijatejObjednavky;
                      const meska = jePoTermine(o.requested_date, stav, dnes);
                      const percento = percentoVybavenia(o.sales_order_items ?? []);
                      return (
                        <KlikatelnyRiadok
                          key={o.id}
                          ciel={{ to: "/objednavky/$id", params: { id: o.id } }}
                          className="border-b border-border last:border-0 hover:bg-muted/40"
                        >
                          <td className="px-4 py-2">
                            <Link
                              to="/objednavky/$id"
                              params={{ id: o.id }}
                              className="cislo-dokladu whitespace-nowrap text-primary hover:underline"
                            >
                              {o.order_number}
                            </Link>
                            {o.customer_order_number && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {t("u odberateľa {cislo}", { cislo: o.customer_order_number })}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className="block max-w-[220px] 2xl:max-w-[320px] truncate"
                              title={o.customers?.name ?? o.customer_name ?? undefined}
                            >
                              {o.customers?.name ?? o.customer_name ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">{datum(o.order_date)}</td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {datum(o.requested_date)}
                            {meska && (
                              <span className="fk-text-chyba ml-1.5 inline-flex items-center gap-1 text-xs">
                                <AlertTriangle className="h-3 w-3" /> {t("po termíne")}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2">
                            <StavOdznak ton={tonStavu(TON_OBJEDNAVKY, stav)}>
                              {t(STAV_POPIS[stav])}
                            </StavOdznak>
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
                          <td className="suma whitespace-nowrap px-4 py-2 text-right">{suma(o.total, o.currency)}</td>
                        </KlikatelnyRiadok>
                      );
                    })}
                  </tbody>
                </table>
              </TabulkaZoznamu>
            }
            mobileCard={(o: any) => {
              const stav = (o.stav_vypocitany ?? o.status) as StavPrijatejObjednavky;
              const meska = jePoTermine(o.requested_date, stav, dnes);
              const percento = percentoVybavenia(o.sales_order_items ?? []);
              return (
                <MobileListCard
                  ciel={{ to: "/objednavky/$id", params: { id: o.id } }}
                  title={
                    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                      {o.order_number}
                      {o.customer_order_number && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {t("u odberateľa {cislo}", { cislo: o.customer_order_number })}
                        </span>
                      )}
                    </span>
                  }
                  subtitle={o.customers?.name ?? o.customer_name ?? "—"}
                  status={
                    <StavOdznak ton={tonStavu(TON_OBJEDNAVKY, stav)}>
                      {t(STAV_POPIS[stav])}
                    </StavOdznak>
                  }
                  meta={
                    <>
                      {datum(o.order_date)} · {t("Termín")} {datum(o.requested_date)}
                      {meska && <span className="fk-text-chyba"> · {t("po termíne")}</span>}
                      {` · ${t("Vybavené")} ${percento} %`}
                    </>
                  }
                  amount={<span className="suma">{suma(o.total, o.currency)}</span>}
                />
              );
            }}
          />
        )}
      </PageBody>
    </>
  );
}
