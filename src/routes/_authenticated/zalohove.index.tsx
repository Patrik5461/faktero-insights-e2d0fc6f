import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { StatusBadge } from "./dashboard";
import { Plus, Trash2, RotateCcw, Hash } from "lucide-react";
import { toast } from "sonner";
import { usePagedList } from "@/hooks/usePagedList";
import { ListPagination, ConfirmDialog } from "@/components/faktero/ListControls";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { DocumentListToolbar, HlavickaViac } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { filtrujObdobie, type DatumObdobia } from "@/lib/faktero/obdobie-filter";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujMenu } from "@/lib/faktero/mena";
import { SuctovaPatickaZoznamu } from "@/components/faktero/SuctyDokladov";
import { useSuhrnVystavenych } from "@/hooks/useSuhrnVystavenych";

export const Route = createFileRoute("/_authenticated/zalohove/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Vydané zálohové faktúry — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: ProformaListPage,
});

function ProformaListPage() {
  const { t } = useT();
  const navigate = useNavigate();
  // Hľadanie, filtre, strana a počet na stranu sú v adrese.
  const lf = useListFilters({
    pageSizeKey: "invoices-proforma",
    defaultSort: { column: "issue_date", ascending: false },
  });
  const podla = (lf.filter("podla") || "vystavenie") as DatumObdobia;
  const { od: obdobieOd, do: obdobieDo } = lf.rozsah("obdobie");
  const upravDotaz = useCallback(
    (dotaz: any) => filtrujObdobie(dotaz, podla, obdobieOd || null, obdobieDo || null),
    [podla, obdobieOd, obdobieDo],
  );
  const list = usePagedList({
    resource: "invoices",
    searchColumns: ["invoice_number", "customer_name", "customer_ico"],
    equals: { type: "proforma" },
    pageSizeKey: "invoices-proforma",
    orderBy: { column: "issue_date", ascending: false },
    upravDotaz,
    riadenie: lf,
    filterKey: `${podla}|${obdobieOd}|${obdobieDo}`,
  });
  // Súčet za celý filter (P-1007) — v tejto záložke sa zálohové počítajú.
  const sucetFiltra = useSuhrnVystavenych(
    {
      companyId: getActiveCompanyId(),
      typy: ["proforma"],
      hladanie: list.search,
      podla,
      od: obdobieOd || null,
      do: obdobieDo || null,
    },
    { vypnute: list.showDeleted, nonce: list.rows },
  );
  // „Zobraziť vymazané“ je filter v adrese, kôš však prepína zoznam.
  const ajVymazane = lf.zapnute("vymazane");
  const setShowDeleted = list.setShowDeleted;
  useEffect(() => setShowDeleted(ajVymazane), [ajVymazane, setShowDeleted]);

  const [settledMap, setSettledMap] = useState<
    Record<string, { id: string; invoice_number: string }>
  >({});
  const [rowDelete, setRowDelete] = useState<any | null>(null);

  /*
    Ktoré zálohy sú už zúčtované. Väzba je v `invoice_advances` — faktúra si
    môže odpočítať viac záloh naraz, takže starý stĺpec na faktúre by tie
    ďalšie zamlčal.
  */
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid || !list.rows.length) {
      setSettledMap({});
      return;
    }
    const ids = list.rows.map((r) => r.id);
    let cancelled = false;
    (async () => {
      const { data: odpocty } = await supabase
        .from("invoice_advances")
        .select("invoice_id, advance_invoice_id")
        .eq("company_id", cid)
        .in("advance_invoice_id", ids);
      const fakturyIds = [...new Set((odpocty ?? []).map((o: any) => o.invoice_id))];
      const { data: faktury } = fakturyIds.length
        ? await supabase.from("invoices").select("id, invoice_number").in("id", fakturyIds)
        : { data: [] as any[] };
      const cisla = new Map((faktury ?? []).map((f: any) => [f.id, f.invoice_number]));
      const data = (odpocty ?? []).map((o: any) => ({
        id: o.invoice_id,
        invoice_number: cisla.get(o.invoice_id) ?? "",
        advance_invoice_id: o.advance_invoice_id,
      }));
      if (cancelled) return;
      const m: Record<string, { id: string; invoice_number: string }> = {};
      for (const row of data ?? []) {
        if (row.advance_invoice_id && !m[row.advance_invoice_id]) {
          m[row.advance_invoice_id] = { id: row.id, invoice_number: row.invoice_number };
        }
      }
      setSettledMap(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [list.rows]);

  function statusFor(row: any) {
    if (settledMap[row.id]) return "settled" as const;
    return row.status as string;
  }

  async function confirmRowDelete() {
    if (!rowDelete) return;
    try {
      await list.softDelete([rowDelete.id]);
      toast.success(t("Zálohová faktúra vymazaná"));
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setRowDelete(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("Vydané zálohové faktúry")}
        description={t("Proforma / zálohové faktúry. Po prijatí platby ich zúčtujete vo finálnej faktúre.")}
        action={
          <div className="flex flex-wrap gap-2">
            <HlavickaViac akcie={[{ label: "Číselné rady", icon: Hash, to: "/ciselne-rady" }]} />
            <Link
              to="/faktury/nova"
              search={{ type: "proforma" } as any}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Nová zálohová faktúra")}
            </Link>
          </div>
        }
      />
      <PageBody>
        <DocumentListToolbar
          lf={lf}
          searchPlaceholder="Hľadať číslo, odberateľa, IČO…"
          filters={[
            {
              key: "obdobie",
              label: "Obdobie",
              type: "dateRange",
              dateFieldOptions: [
                { value: "vystavenie", label: "dátumu vystavenia" },
                { value: "dodanie", label: "dátumu dodania" },
                { value: "splatnost", label: "dátumu splatnosti" },
              ],
            },
            { key: "vymazane", label: "Zobraziť vymazané", type: "checkbox" },
          ]}
        />
        <ResponsiveTable
          className="mt-3"
          items={list.rows}
          loading={list.loading}
          emptyText={
            list.showDeleted
              ? t("Žiadne vymazané zálohové faktúry.")
              : t("Žiadne zálohové faktúry. Vytvorte prvú tlačidlom „Nová zálohová faktúra\".")
          }
          mobileCard={(i: any) => {
            const s = statusFor(i);
            return (
              <MobileListCard
                onClick={() => navigate({ to: "/faktury/$id", params: { id: i.id } })}
                title={i.invoice_number}
                subtitle={i.customer_name ?? "—"}
                status={<ProformaStatus value={s} settled={settledMap[i.id]} />}
                meta={`${datumNaDoklade(i.issue_date)} · ${t("splat.")} ${datumNaDoklade(i.due_date)}`}
                amount={formatujMenu(i.total, i.currency)}
                actions={
                  list.showDeleted ? (
                    <button
                      aria-label={t("Obnoviť")}
                      title={t("Obnoviť")}
                      onClick={async () => {
                        try {
                          await list.restore([i.id]);
                          toast.success(t("Obnovené"));
                        } catch (e: any) {
                          toast.error(e?.message ?? t("Chyba"));
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {t("Obnoviť")}
                    </button>
                  ) : (
                    <button
                      onClick={() => setRowDelete(i)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("Vymazať")}
                    </button>
                  )
                }
              />
            );
          }}
          desktop={
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">{t("Číslo")}</th>
                    <th className="p-3">{t("Odberateľ")}</th>
                    <th className="p-3">{t("Vystavená")}</th>
                    <th className="p-3">{t("Splatnosť")}</th>
                    <th className="p-3 text-right">{t("Suma")}</th>
                    <th className="p-3">{t("Stav")}</th>
                    <th className="p-3">{t("Zúčtovaná v")}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.loading && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        {t("Načítavam…")}
                      </td>
                    </tr>
                  )}
                  {!list.loading && list.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        {list.showDeleted
                          ? t("Žiadne vymazané zálohové faktúry.")
                          : t("Žiadne zálohové faktúry.")}
                      </td>
                    </tr>
                  )}
                  {list.rows.map((i) => {
                    const s = statusFor(i);
                    const link = settledMap[i.id];
                    return (
                      /*
                        Detail otvárali jednotlivé bunky a celým znovunačítaním
                        stránky. Stav ani odkaz na zúčtovanú faktúru na ťuknutie
                        nereagovali. Klikateľný je po novom celý riadok cez
                        router; bunka s odkazom a akciami si kliknutie ponechá.
                      */
                      <tr
                        key={i.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => navigate({ to: "/faktury/$id", params: { id: i.id } })}
                      >
                        <td className="p-3 font-medium">{i.invoice_number}</td>
                        <td className="p-3">{i.customer_name ?? "—"}</td>
                        <td className="p-3">{datumNaDoklade(i.issue_date)}</td>
                        <td className="p-3">{datumNaDoklade(i.due_date)}</td>
                        <td className="p-3 text-right">{formatujMenu(i.total, i.currency)}</td>
                        <td className="p-3">
                          <ProformaStatus value={s} settled={link} />
                        </td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          {link ? (
                            <Link
                              to="/faktury/$id"
                              params={{ id: link.id }}
                              className="text-primary hover:underline"
                            >
                              {link.invoice_number}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {list.showDeleted ? (
                            <button
                              title={t("Obnoviť")}
                              onClick={async () => {
                                try {
                                  await list.restore([i.id]);
                                  toast.success(t("Obnovené"));
                                } catch (e: any) {
                                  toast.error(e?.message ?? t("Chyba"));
                                }
                              }}
                              className="rounded p-1.5 text-primary hover:bg-primary/10"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              title={t("Vymazať")}
                              onClick={() => setRowDelete(i)}
                              className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          }
        />
        {!list.showDeleted && list.total > 0 ? (
          <SuctovaPatickaZoznamu suhrn={sucetFiltra.suhrn} nacitava={sucetFiltra.nacitava} />
        ) : null}
        <ListPagination
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
        />
      </PageBody>

      <ConfirmDialog
        open={!!rowDelete}
        title={t("Naozaj chcete vymazať túto zálohovú faktúru?")}
        message={
          rowDelete
            ? t("Zálohová faktúra {cislo} bude skrytá z rozhrania. Môžete ju neskôr obnoviť.", { cislo: rowDelete.invoice_number })
            : ""
        }
        onCancel={() => setRowDelete(null)}
        onConfirm={confirmRowDelete}
      />
    </>
  );
}

function ProformaStatus({
  value,
  settled,
}: {
  value: string;
  settled?: { id: string; invoice_number: string };
}) {
  const { t } = useT();
  if (settled || value === "settled") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
        {t("Zúčtovaná")}
      </span>
    );
  }
  return <StatusBadge status={value} />;
}
