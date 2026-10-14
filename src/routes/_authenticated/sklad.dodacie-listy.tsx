import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listDeliveryNoteImportsFn,
  getDeliveryNoteSignedUrlFn,
} from "@/lib/faktero/ai-delivery-note.functions";
import { FileText, ExternalLink, ScanLine } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sklad/dodacie-listy")({
  head: () => ({ meta: [{ title: "História naskenovaných dodacích listov — Faktero" }] }),
  component: DeliveryNoteHistoryPage,
});

function DeliveryNoteHistoryPage() {
  const listFn = useServerFn(listDeliveryNoteImportsFn);
  const signFn = useServerFn(getDeliveryNoteSignedUrlFn);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    listFn({ data: { company_id: cid, limit: 100 } })
      .then((r) => setRows(r.rows))
      .catch((e) => toast.error(e?.message ?? "Nepodarilo sa načítať."))
      .finally(() => setLoading(false));
  }, [listFn]);

  async function openDoc(path: string) {
    try {
      const { url } = await signFn({ data: { storage_path: path } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa otvoriť dokument.");
    }
  }

  return (
    <>
      <PageHeader
        title="História dodacích listov"
        description="Prehľad AI importov zo naskenovaných dokumentov."
        action={
          <Link
            to="/sklad/dodaci-list"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <ScanLine className="h-4 w-4" /> Nový sken
          </Link>
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Zatiaľ žiadne AI importy dodacích listov.
          </div>
        ) : (
          <>
            {/* Mobil: karty — šesť stĺpcov sa na úzky displej nezmestí. */}
            <div className="space-y-2 md:hidden">
              {rows.map((r) => {
                const m = r.metadata ?? {};
                const c = m.counts ?? {};
                const items = Array.isArray(m.items) ? m.items.length : 0;
                return (
                  <div key={r.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium break-words">{m.supplier ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("sk-SK")}
                        </div>
                      </div>
                      <span className="whitespace-nowrap text-xs font-medium">
                        {m.delivery_number ?? "—"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        Položiek {items} · pohybov {c.movements ?? "—"}
                      </span>
                      {m.storage_path && (
                        <button
                          onClick={() => openDoc(m.storage_path)}
                          className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{m.source_filename ?? "otvoriť"}</span>
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
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Dátum</th>
                    <th className="p-2 text-left">Dodávateľ</th>
                    <th className="p-2 text-left">Číslo DL</th>
                    <th className="p-2 text-right">Položiek</th>
                    <th className="p-2 text-right">Pohybov</th>
                    <th className="p-2 text-left">Dokument</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const m = r.metadata ?? {};
                    const c = m.counts ?? {};
                    const items = Array.isArray(m.items) ? m.items.length : 0;
                    return (
                      <tr key={r.id}>
                        <td className="p-2 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString("sk-SK")}
                        </td>
                        <td className="p-2">{m.supplier ?? "—"}</td>
                        <td className="p-2 whitespace-nowrap">{m.delivery_number ?? "—"}</td>
                        <td className="p-2 text-right">{items}</td>
                        <td className="p-2 text-right">{c.movements ?? "—"}</td>
                        <td className="p-2">
                          {m.storage_path ? (
                            <button
                              onClick={() => openDoc(m.storage_path)}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" /> {m.source_filename ?? "otvoriť"}{" "}
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
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
