import { createFileRoute, Link } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { useCallback, useEffect, useState } from "react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { runRecurringNow, toggleRecurring } from "@/lib/faktero/recurring.functions";
import { Plus, Play, Power, PowerOff, Repeat, Trash2, RotateCcw, Hash } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { usePagedList } from "@/hooks/usePagedList";
import { ListPagination, ConfirmDialog, BulkBar } from "@/components/faktero/ListControls";
import { DocumentListToolbar, HlavickaViac } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";

export const Route = createFileRoute("/_authenticated/opakovane/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Opakované faktúry — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: RecurringList,
});

const FREQ_LABEL: Record<string, string> = {
  weekly: "Týždenne",
  monthly: "Mesačne",
  quarterly: "Štvrťročne",
  yearly: "Ročne",
};

function RecurringList() {
  const { t } = useT();
  // Hľadanie, filtre, strana a počet na stranu sú v adrese.
  const lf = useListFilters({
    pageSizeKey: "recurring_invoices",
    defaultSort: { column: "created_at", ascending: false },
  });
  // Šablóna nemá dátum dokladu — obdobie sa vyberá podľa dátumu ďalšieho behu.
  const { od: behOd, do: behDo } = lf.rozsah("beh");
  const upravDotaz = useCallback(
    (dotaz: any) => {
      let d = dotaz;
      if (behOd) d = d.gte("next_run", behOd);
      if (behDo) d = d.lte("next_run", behDo);
      return d;
    },
    [behOd, behDo],
  );
  const list = usePagedList({
    resource: "recurring_invoices",
    searchColumns: ["name", "customer_name"],
    upravDotaz,
    riadenie: lf,
    filterKey: `${behOd}|${behDo}`,
  });
  // „Zobraziť vymazané“ je filter v adrese, kôš však prepína zoznam.
  const ajVymazane = lf.zapnute("vymazane");
  const setShowDeleted = list.setShowDeleted;
  useEffect(() => setShowDeleted(ajVymazane), [ajVymazane, setShowDeleted]);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowDelete, setRowDelete] = useState<any | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [bulkHardDelete, setBulkHardDelete] = useState(false);
  async function confirmBulkHardDelete() {
    const pocet = list.selectedIds.length;
    try {
      await list.hardDelete(list.selectedIds);
      toast.success(t("Natrvalo vymazaných: {n}", { n: pocet }));
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBulkHardDelete(false);
    }
  }
  const navigate = useNavigate();
  const runFn = useServerFn(runRecurringNow);
  const toggleFn = useServerFn(toggleRecurring);

  async function runNow(id: string) {
    setBusy(id);
    try {
      const r: any = await runFn({ data: { id } });
      if (r?.skipped) toast.message(t("Preskočené: {dovod}", { dovod: r.reason }));
      else {
        toast.success(t("Faktúra vytvorená"));
        navigate({ to: "/faktury/$id", params: { id: r.invoice_id } });
      }
      list.reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBusy(null);
    }
  }
  async function toggle(id: string, active: boolean) {
    try {
      await toggleFn({ data: { id, active } });
      toast.success(active ? t("Aktivované") : t("Pozastavené"));
      list.reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    }
  }
  async function confirmRow() {
    if (!rowDelete) return;
    try {
      await list.softDelete([rowDelete.id]);
      toast.success(t("Šablóna vymazaná"));
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setRowDelete(null);
    }
  }
  async function confirmBulk() {
    try {
      await list.softDelete(list.selectedIds);
      toast.success(t("Vymazaných {n}", { n: list.selectedIds.length }));
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBulkDelete(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("Opakované faktúry")}
        description={t("Šablóny, ktoré automaticky generujú faktúry podľa intervalu.")}
        action={
          <div className="flex flex-wrap gap-2">
            <HlavickaViac akcie={[{ label: "Číselné rady", icon: Hash, to: "/ciselne-rady" }]} />
            <Link
              to="/opakovane/nova"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Nová šablóna")}
            </Link>
          </div>
        }
      />
      <PageBody>
        <DocumentListToolbar
          lf={lf}
          searchPlaceholder="Hľadať názov, odberateľa…"
          filters={[
            { key: "beh", label: "Ďalší beh", type: "dateRange" },
            { key: "vymazane", label: "Zobraziť vymazané", type: "checkbox" },
          ]}
        />
        <BulkBar
          onHardDelete={() => setBulkHardDelete(true)}
          count={list.selectedIds.length}
          showDeleted={list.showDeleted}
          onDelete={() => setBulkDelete(true)}
          onRestore={async () => {
            try {
              await list.restore(list.selectedIds);
              toast.success(t("Obnovené"));
              list.clearSelection();
            } catch (e: any) {
              toast.error(e?.message ?? t("Chyba"));
            }
          }}
          onClear={list.clearSelection}
        />
        {list.loading ? (
          <div className="text-sm text-muted-foreground">{t("Načítavam…")}</div>
        ) : list.rows.length === 0 && !list.search && !list.showDeleted && !behOd && !behDo ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <Repeat className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">{t("Zatiaľ žiadne opakované faktúry")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Vytvorte šablónu a Faktero bude automaticky vystavovať faktúry pravidelne.")}
            </p>
            <Link
              to="/opakovane/nova"
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Vytvoriť šablónu")}
            </Link>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 p-3">
                    <input
                      type="checkbox"
                      checked={list.allOnPageSelected}
                      onChange={(e) => list.toggleAllOnPage(e.target.checked)}
                    />
                  </th>
                  <th className="p-3">{t("Názov")}</th>
                  <th className="p-3">{t("Odberateľ")}</th>
                  <th className="p-3">{t("Frekvencia")}</th>
                  <th className="p-3">{t("Ďalší beh")}</th>
                  <th className="p-3 text-right">{t("Suma")}</th>
                  <th className="p-3">{t("Stav")}</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      {t("Žiadne výsledky.")}
                    </td>
                  </tr>
                )}
                {list.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!list.selected[r.id]}
                        onChange={(e) => list.toggleSelect(r.id, e.target.checked)}
                      />
                    </td>
                    <td className="p-3">
                      <Link
                        to="/opakovane/$id"
                        params={{ id: r.id }}
                        className="font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="p-3">{r.customer_name ?? "—"}</td>
                    <td className="p-3">{FREQ_LABEL[r.frequency] ? t(FREQ_LABEL[r.frequency]) : r.frequency}</td>
                    <td className="p-3">{datumNaDoklade(r.next_run)}</td>
                    <td className="p-3 text-right">{formatujMenu(r.total, r.currency)}</td>
                    <td className="p-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
                      >
                        {r.active ? t("Aktívna") : t("Pozastavená")}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        {!list.showDeleted && (
                          <>
                            <button
                              onClick={() => runNow(r.id)}
                              disabled={busy === r.id || !r.active}
                              title={t("Spustiť teraz")}
                              className="rounded p-1.5 text-primary hover:bg-primary/10 disabled:opacity-40"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => toggle(r.id, !r.active)}
                              title={r.active ? t("Pozastaviť") : t("Aktivovať")}
                              className="rounded p-1.5 hover:bg-muted"
                            >
                              {r.active ? (
                                <PowerOff className="h-4 w-4" />
                              ) : (
                                <Power className="h-4 w-4" />
                              )}
                            </button>
                          </>
                        )}
                        {list.showDeleted ? (
                          <button
                            title={t("Obnoviť")}
                            onClick={async () => {
                              try {
                                await list.restore([r.id]);
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
                            onClick={() => setRowDelete(r)}
                            className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!list.loading && list.total > 0 && (
          <ListPagination
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
          />
        )}
      </PageBody>
      <ConfirmDialog
        open={!!rowDelete}
        title={t("Naozaj chcete vymazať túto šablónu?")}
        message={
          rowDelete ? t("{nazov} bude skrytá z rozhrania a prestane generovať faktúry.", { nazov: rowDelete.name }) : ""
        }
        warning={
          rowDelete?.active
            ? t("Šablóna je aktívna. Mazaním sa zastaví automatické vystavovanie.")
            : undefined
        }
        onCancel={() => setRowDelete(null)}
        onConfirm={confirmRow}
      />
      <ConfirmDialog
        open={bulkDelete}
        title={t("Vymazať {n} šablón?", { n: list.selectedIds.length })}
        message={t("Vybraté šablóny budú skryté a prestanú generovať faktúry.")}
        onCancel={() => setBulkDelete(false)}
        onConfirm={confirmBulk}
      />
      <ConfirmDialog
        open={bulkHardDelete}
        title={t("Natrvalo vymazať {n} šablón?", { n: list.selectedIds.length })}
        message={t("Šablóny sa odstránia natrvalo. Faktúry, ktoré z nich vznikli, ostanú.")}
        confirmLabel={t("Vymazať natrvalo")}
        onCancel={() => setBulkHardDelete(false)}
        onConfirm={confirmBulkHardDelete}
      />
    </>
  );
}
