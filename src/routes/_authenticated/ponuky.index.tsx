import { formatujMenu } from "@/lib/faktero/mena";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Plus, Trash2, RotateCcw, Hash } from "lucide-react";
import { toast } from "sonner";
import { usePagedList } from "@/hooks/usePagedList";
import { ListPagination, ConfirmDialog, BulkBar } from "@/components/faktero/ListControls";
import { DocumentListToolbar, HlavickaViac } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { filtrujObdobie } from "@/lib/faktero/obdobie-filter";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";

export const Route = createFileRoute("/_authenticated/ponuky/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Cenové ponuky — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: QuotesPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept",
  sent: "Odoslaná",
  accepted: "Akceptovaná",
  rejected: "Zamietnutá",
  expired: "Expirovaná",
  converted: "Konvertovaná",
};
const STATUS_CLS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-secondary text-secondary-foreground",
  accepted: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
  expired: "bg-muted text-muted-foreground",
  converted: "bg-primary/15 text-primary",
};

function QuotesPage() {
  const { t } = useT();
  const navigate = useNavigate();
  // Hľadanie, filtre, strana a počet na stranu sú v adrese.
  const lf = useListFilters({
    pageSizeKey: "quotes",
    defaultSort: { column: "issue_date", ascending: false },
  });
  // Ponuka má dátum vystavenia a platnosť do (`valid_until`) — iné dátumy nemá.
  const podla = lf.filter("podla") === "platnost" ? "platnost" : "vystavenie";
  const { od: obdobieOd, do: obdobieDo } = lf.rozsah("obdobie");
  const upravDotaz = useCallback(
    (dotaz: any) => {
      if (podla === "vystavenie")
        return filtrujObdobie(dotaz, "vystavenie", obdobieOd || null, obdobieDo || null);
      let d = dotaz;
      if (obdobieOd) d = d.gte("valid_until", obdobieOd);
      if (obdobieDo) d = d.lte("valid_until", obdobieDo);
      return d;
    },
    [podla, obdobieOd, obdobieDo],
  );
  const list = usePagedList({
    resource: "quotes",
    searchColumns: ["quote_number", "customer_name"],
    // Od najnovšej — `created_at` je pri importe čas importu, nie dátum dokladu.
    orderBy: { column: "issue_date", ascending: false },
    upravDotaz,
    riadenie: lf,
    filterKey: `${podla}|${obdobieOd}|${obdobieDo}`,
  });
  // „Zobraziť vymazané“ je filter v adrese, kôš však prepína zoznam.
  const ajVymazane = lf.zapnute("vymazane");
  const setShowDeleted = list.setShowDeleted;
  useEffect(() => setShowDeleted(ajVymazane), [ajVymazane, setShowDeleted]);
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

  async function confirmRow() {
    if (!rowDelete) return;
    try {
      await list.softDelete([rowDelete.id]);
      toast.success(t("Ponuka vymazaná"));
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
        title={t("Cenové ponuky")}
        description={t("Vytvárajte a posielajte cenové ponuky odberateľom.")}
        action={
          <div className="flex flex-wrap gap-2">
            <HlavickaViac akcie={[{ label: "Číselné rady", icon: Hash, to: "/ciselne-rady" }]} />
            <Link
              to="/ponuky/nova"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Nová ponuka")}
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
              key: "obdobie",
              label: "Obdobie",
              type: "dateRange",
              dateFieldOptions: [
                { value: "vystavenie", label: "dátumu vystavenia" },
                { value: "platnost", label: "dátumu platnosti" },
              ],
            },
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
                <th className="p-3">{t("Číslo")}</th>
                <th className="p-3">{t("Odberateľ")}</th>
                <th className="p-3">{t("Vystavená")}</th>
                <th className="p-3">{t("Platnosť do")}</th>
                <th className="p-3 text-right">{t("Suma")}</th>
                <th className="p-3">{t("Stav")}</th>
                <th></th>
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
                    {list.showDeleted ? t("Žiadne vymazané ponuky.") : t("Žiadne cenové ponuky.")}
                  </td>
                </tr>
              )}
              {list.rows.map((q) => (
                /*
                  Detail otvárali jednotlivé bunky a robili to cez
                  `window.location`, teda celým znovunačítaním stránky. Stav
                  ani akcie na ťuknutie nereagovali. Preklikateľný je po novom
                  celý riadok a ide to cez router — rovnako ako inde.
                */
                <tr
                  key={q.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => navigate({ to: "/ponuky/$id", params: { id: q.id } })}
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!list.selected[q.id]}
                      onChange={(e) => list.toggleSelect(q.id, e.target.checked)}
                    />
                  </td>
                  <td className="p-3 font-medium">{q.quote_number}</td>
                  <td className="p-3">{q.customer_name ?? "—"}</td>
                  <td className="p-3">{datumNaDoklade(q.issue_date)}</td>
                  <td className="p-3">{q.valid_until ? datumNaDoklade(q.valid_until) : "—"}</td>
                  <td className="p-3 text-right">{formatujMenu(q.total, q.currency)}</td>
                  <td className="p-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[q.status] ?? "bg-muted"}`}
                    >
                      {STATUS_LABEL[q.status] ? t(STATUS_LABEL[q.status]) : q.status}
                    </span>
                  </td>
                  <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {list.showDeleted ? (
                      <button
                        aria-label={t("Obnoviť")}
                        title={t("Obnoviť")}
                        onClick={async () => {
                          try {
                            await list.restore([q.id]);
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
                        onClick={() => setRowDelete(q)}
                        className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Prázdny zoznam už má hlášku v tabuľke — „Žiadne výsledky“ zo stránkovania by ju len zopakovalo. */}
        {list.total > 0 && (
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
        title={t("Naozaj chcete vymazať túto ponuku?")}
        message={rowDelete ? t("Ponuka {cislo} bude skrytá z rozhrania.", { cislo: rowDelete.quote_number }) : ""}
        warning={
          rowDelete && (rowDelete.status === "sent" || rowDelete.status === "accepted")
            ? t("Ponuka už bola odoslaná alebo akceptovaná.")
            : undefined
        }
        onCancel={() => setRowDelete(null)}
        onConfirm={confirmRow}
      />
      <ConfirmDialog
        open={bulkDelete}
        title={t("Vymazať {n} ponúk?", { n: list.selectedIds.length })}
        message={t("Vybraté ponuky budú skryté z rozhrania.")}
        onCancel={() => setBulkDelete(false)}
        onConfirm={confirmBulk}
      />
      <ConfirmDialog
        open={bulkHardDelete}
        title={t("Natrvalo vymazať {n} ponúk?", { n: list.selectedIds.length })}
        message={t("Ponuky sa odstránia aj s položkami. Toto sa už nedá vrátiť.")}
        confirmLabel={t("Vymazať natrvalo")}
        onCancel={() => setBulkHardDelete(false)}
        onConfirm={confirmBulkHardDelete}
      />
    </>
  );
}
