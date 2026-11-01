import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listDeliveryNoteImportsFn,
  getDeliveryNoteSignedUrlFn,
} from "@/lib/faktero/ai-delivery-note.functions";
import { FileText, ExternalLink, ScanLine, SearchX } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { DocumentListToolbar } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { useKlikNaRiadok } from "@/hooks/useKlikNaRiadok";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/faktero/ListControls";

export const Route = createFileRoute("/_authenticated/sklad/dodacie-listy")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk, "História naskenovaných dodacích listov — Faktero") },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: DeliveryNoteHistoryPage,
});

/** Deň importu v miestnom čase — `created_at` je v UTC a po polnoci by patril včerajšku. */
function denImportu(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function DeliveryNoteHistoryPage() {
  const { t } = useT();
  const listFn = useServerFn(listDeliveryNoteImportsFn);
  const signFn = useServerFn(getDeliveryNoteSignedUrlFn);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const lf = useListFilters();
  const klik = useKlikNaRiadok();
  const { od: obdobieOd, do: obdobieDo } = lf.rozsah("obdobie");

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    listFn({ data: { company_id: cid, limit: 100 } })
      .then((r) => setRows(r.rows))
      .catch((e) => toast.error(e?.message ?? t("Nepodarilo sa načítať.")))
      .finally(() => setLoading(false));
  }, [listFn]);

  // Hľadanie a obdobie len prechádzajú načítané importy.
  const hladane = lf.q.trim().toLowerCase();
  const zobrazene = useMemo(
    () =>
      rows.filter((r) => {
        const den = r.created_at ? denImportu(r.created_at) : "";
        if (obdobieOd && (!den || den < obdobieOd)) return false;
        if (obdobieDo && (!den || den > obdobieDo)) return false;
        if (!hladane) return true;
        const m = r.metadata ?? {};
        return [m.supplier, m.delivery_number, m.source_filename]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(hladane));
      }),
    [rows, hladane, obdobieOd, obdobieDo],
  );

  async function openDoc(path: string) {
    /*
      Okno sa otvára hneď po kliknutí — Safari zablokuje `window.open` volaný
      až po `await` (už to nepovažuje za akciu používateľa). Adresa sa doplní
      po podpísaní (F-09).
    */
    const okno = window.open("", "_blank");
    try {
      const { url } = await signFn({ data: { storage_path: path } });
      if (okno) okno.location.href = url;
      else window.open(url, "_blank");
    } catch (e: any) {
      okno?.close();
      toast.error(e?.message ?? t("Nepodarilo sa otvoriť dokument."));
    }
  }

  return (
    <>
      <PageHeader
        title={t("História dodacích listov")}
        description={t("Prehľad AI importov zo naskenovaných dokumentov.")}
        action={
          <Link
            to="/sklad/dodaci-list"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <ScanLine className="h-4 w-4" /> {t("Nový sken")}
          </Link>
        }
      />
      <PageBody>
        <DocumentListToolbar
          lf={lf}
          searchPlaceholder="Hľadať dodávateľa alebo číslo"
          filters={[{ key: "obdobie", label: "Obdobie", type: "dateRange" }]}
        />
        {loading ? (
          <NacitavanieStav />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState icon={ScanLine} title="Zatiaľ žiadne AI importy dodacích listov." />
          </div>
        ) : zobrazene.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState icon={SearchX} title="Nič nevyhovuje filtru." />
          </div>
        ) : (
          <>
            {/* Mobil: karty — šesť stĺpcov sa na úzky displej nezmestí. */}
            <div className="space-y-2 md:hidden">
              {zobrazene.map((r) => {
                const m = r.metadata ?? {};
                const c = m.counts ?? {};
                const items = Array.isArray(m.items) ? m.items.length : 0;
                const pk = klik(null, {
                  naKlik: m.storage_path ? () => openDoc(m.storage_path) : undefined,
                  klavesnica: false,
                });
                return (
                  <div
                    key={r.id}
                    {...pk}
                    className={cn(pk.className, "rounded-xl border border-border bg-card p-4 text-sm")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="break-words font-semibold">{m.supplier ?? "—"}</div>
                        <div className="text-xs tabular-nums text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("sk-SK")}
                        </div>
                      </div>
                      <span className="cislo-dokladu whitespace-nowrap text-xs">
                        {m.delivery_number ?? "—"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {t("Položiek {n} · pohybov {p}", { n: items, p: c.movements ?? "—" })}
                      </span>
                      {m.storage_path && (
                        <button
                          onClick={() => openDoc(m.storage_path)}
                          className="inline-flex min-w-0 items-center gap-1 font-semibold text-primary hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{m.source_filename ?? t("otvoriť")}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">{t("Dátum")}</th>
                    <th className="p-3 text-left">{t("Dodávateľ")}</th>
                    <th className="p-3 text-left">{t("Číslo DL")}</th>
                    <th className="p-3 text-right">{t("Položiek")}</th>
                    <th className="p-3 text-right">{t("sklad::Pohybov")}</th>
                    <th className="p-3 text-left">{t("Dokument")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {zobrazene.map((r) => {
                    const m = r.metadata ?? {};
                    const c = m.counts ?? {};
                    const items = Array.isArray(m.items) ? m.items.length : 0;
                    return (
                      <KlikatelnyRiadok
                        key={r.id}
                        naKlik={m.storage_path ? () => openDoc(m.storage_path) : undefined}
                      >
                        <td className="whitespace-nowrap p-3 tabular-nums text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("sk-SK")}
                        </td>
                        <td className="max-w-[18rem] break-words p-3 font-medium">{m.supplier ?? "—"}</td>
                        <td className="cislo-dokladu whitespace-nowrap p-3">{m.delivery_number ?? "—"}</td>
                        <td className="p-3 text-right tabular-nums">{items}</td>
                        <td className="p-3 text-right tabular-nums">{c.movements ?? "—"}</td>
                        <td className="max-w-[16rem] p-3">
                          {m.storage_path ? (
                            <button
                              onClick={() => openDoc(m.storage_path)}
                              className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
                              title={m.source_filename ?? undefined}
                            >
                              <FileText className="h-3.5 w-3.5 shrink-0" />{" "}
                              <span className="truncate">{m.source_filename ?? t("otvoriť")}</span>{" "}
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </KlikatelnyRiadok>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
