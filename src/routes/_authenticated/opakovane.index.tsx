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
import { ListPagination, ConfirmDialog, BulkBar, EmptyState } from "@/components/faktero/ListControls";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { StavOdznak, type TonStavu } from "@/components/faktero/web/Stav";
import { DocumentListToolbar, HlavickaViac } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";

export const Route = createFileRoute("/_authenticated/opakovane/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Opakované faktúry — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: RecurringList,
});

/* Tón odznaku šablóny: aktívna / pozastavená (Stav.tsx nemá mapu pre opakované). */
const TON_OPAKOVANEJ: Record<"aktivna" | "pozastavena", TonStavu> = {
  aktivna: "uspech",
  pozastavena: "neutralny",
};

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
          <NacitavanieStav className="mt-3 rounded-xl border border-border bg-card" />
        ) : list.rows.length === 0 && !list.search && !list.showDeleted && !behOd && !behDo ? (
          <div className="mt-3 rounded-xl border border-border bg-card">
            <EmptyState
              icon={Repeat}
              title="Zatiaľ žiadne opakované faktúry"
              description="Vytvorte šablónu a Faktero bude automaticky vystavovať faktúry pravidelne."
              action={
                <Link
                  to="/opakovane/nova"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  <Plus className="h-4 w-4" /> {t("Vytvoriť šablónu")}
                </Link>
              }
            />
          </div>
        ) : (
          <ResponsiveTable
            className="mt-3"
            items={list.rows}
            emptyText="Žiadne výsledky."
            desktop={
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs font-semibold text-muted-foreground [&_th]:whitespace-nowrap">
                    <tr>
                      <th className="w-10 p-3">
                        <input
                          type="checkbox"
                          aria-label={t("Vybrať všetko")}
                          checked={list.allOnPageSelected}
                          onChange={(e) => list.toggleAllOnPage(e.target.checked)}
                        />
                        <span className="sr-only">{t("Výber")}</span>
                      </th>
                      <th className="p-3">{t("Názov")}</th>
                      <th className="p-3">{t("Odberateľ")}</th>
                      <th className="p-3">{t("Frekvencia")}</th>
                      <th className="p-3">{t("Ďalší beh")}</th>
                      <th className="p-3 text-right">{t("Suma")}</th>
                      <th className="p-3">{t("Stav")}</th>
                      <th className="p-3"><span className="sr-only">{t("Akcie")}</span></th>
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
                      <KlikatelnyRiadok key={r.id} ciel={{ to: "/opakovane/$id", params: { id: r.id } }}>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={t("Vybrať riadok")}
                            checked={!!list.selected[r.id]}
                            onChange={(e) => list.toggleSelect(r.id, e.target.checked)}
                          />
                        </td>
                        <td className="max-w-[280px] 2xl:max-w-[400px] p-3">
                          {/* Dlhý názov šablóny sa skráti, celý je v title. */}
                          <Link
                            to="/opakovane/$id"
                            params={{ id: r.id }}
                            title={r.name ?? undefined}
                            className="block truncate font-medium hover:underline"
                          >
                            {r.name}
                          </Link>
                        </td>
                        <td className="p-3">
                          <span className="block max-w-[220px] 2xl:max-w-[320px] truncate" title={r.customer_name ?? undefined}>
                            {r.customer_name ?? "—"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap p-3">{FREQ_LABEL[r.frequency] ? t(FREQ_LABEL[r.frequency]) : r.frequency}</td>
                        <td className="whitespace-nowrap p-3">{datumNaDoklade(r.next_run)}</td>
                        <td className="suma whitespace-nowrap p-3 text-right">{formatujMenu(r.total, r.currency)}</td>
                        <td className="whitespace-nowrap p-3">
                          <StavOdznak ton={TON_OPAKOVANEJ[r.active ? "aktivna" : "pozastavena"]}>
                            {r.active ? t("Aktívna") : t("Pozastavená")}
                          </StavOdznak>
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
                      </KlikatelnyRiadok>
                    ))}
                  </tbody>
                </table>
              </div>
            }
            mobileCard={(r: any) => (
              <MobileListCard
                ciel={{ to: "/opakovane/$id", params: { id: r.id } }}
                vybrane={!!list.selected[r.id]}
                onVyber={(zapnut) => list.toggleSelect(r.id, zapnut)}
                vyberPopis={t("Vybrať riadok")}
                title={r.name}
                subtitle={r.customer_name ?? "—"}
                status={
                  <StavOdznak ton={TON_OPAKOVANEJ[r.active ? "aktivna" : "pozastavena"]}>
                    {r.active ? t("Aktívna") : t("Pozastavená")}
                  </StavOdznak>
                }
                meta={`${FREQ_LABEL[r.frequency] ? t(FREQ_LABEL[r.frequency]) : r.frequency} · ${t("Ďalší beh")} ${datumNaDoklade(r.next_run)}`}
                amount={formatujMenu(r.total, r.currency)}
                actions={
                  list.showDeleted ? (
                    <button
                      onClick={async () => {
                        try {
                          await list.restore([r.id]);
                          toast.success(t("Obnovené"));
                        } catch (e: any) {
                          toast.error(e?.message ?? t("Chyba"));
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary-hover hover:bg-primary/10"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {t("Obnoviť")}
                    </button>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-1">
                      <button
                        onClick={() => runNow(r.id)}
                        disabled={busy === r.id || !r.active}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary-hover hover:bg-primary/10 disabled:opacity-40"
                      >
                        <Play className="h-3.5 w-3.5" /> {t("Spustiť teraz")}
                      </button>
                      <button
                        onClick={() => toggle(r.id, !r.active)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        {r.active ? (
                          <PowerOff className="h-3.5 w-3.5" />
                        ) : (
                          <Power className="h-3.5 w-3.5" />
                        )}{" "}
                        {r.active ? t("Pozastaviť") : t("Aktivovať")}
                      </button>
                      <button
                        onClick={() => setRowDelete(r)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t("Vymazať")}
                      </button>
                    </div>
                  )
                }
              />
            )}
          />
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
