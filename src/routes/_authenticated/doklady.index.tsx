import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listExpensesFn,
  deleteExpenseFn,
  exportExpensesZipFn,
  getExpenseFileUrlFn,
} from "@/lib/faktero/expenses.functions";
import { Camera, Download, FileText, Plus, Trash2, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/doklady/")({
  head: () => ({ meta: [{ title: "Doklady — Faktero" }] }),
  component: DokladyPage,
});

const STATUS_LABEL: Record<string, string> = {
  new: "Nový",
  processed: "Spracovaný",
  exported: "Exportovaný",
};
const STATUS_STYLE: Record<string, string> = {
  new: "bg-amber-500/10 text-amber-700",
  processed: "bg-secondary text-foreground/70",
  exported: "bg-primary/10 text-primary",
};

function DokladyPage() {
  const navigate = useNavigate();
  const listFn = useServerFn(listExpensesFn);
  const deleteFn = useServerFn(deleteExpenseFn);
  const exportFn = useServerFn(exportExpensesZipFn);
  const urlFn = useServerFn(getExpenseFileUrlFn);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("all");
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const cid = getActiveCompanyId();

  async function refresh() {
    if (!cid) return;
    setLoading(true);
    try {
      const data = await listFn({ data: { company_id: cid, status, month: month || null } });
      setRows(data ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba pri načítaní");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh(); /* eslint-disable-next-line */
  }, [status, month]);

  const totals = useMemo(() => {
    let net = 0,
      vat = 0,
      total = 0;
    for (const r of rows) {
      net += Number(r.net_amount ?? 0);
      vat += Number(r.vat_amount ?? 0);
      total += Number(r.total_amount ?? 0);
    }
    return { net, vat, total };
  }, [rows]);

  function toggle(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function handleExport(markExported: boolean) {
    if (!cid) return;
    setExporting(true);
    try {
      const ids = selected.size ? Array.from(selected) : undefined;
      const res = await exportFn({
        data: { company_id: cid, ids, month: ids ? null : month, mark_exported: markExported },
      });
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportovaných ${res.count} dokladov`);
      if (markExported) refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Export zlyhal");
    } finally {
      setExporting(false);
    }
  }

  async function openFile(path: string) {
    try {
      const { url } = await urlFn({ data: { file_path: path } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Nedá sa otvoriť súbor");
    }
  }

  async function del(id: string) {
    if (!confirm("Naozaj zmazať doklad?")) return;
    try {
      await deleteFn({ data: { id } });
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Zmazanie zlyhalo");
    }
  }

  return (
    <>
      <PageHeader
        title="Doklady"
        description="Naskenované a nahraté výdavkové doklady pre účtovníka."
        action={
          <div className="flex gap-2">
            <Link
              to="/doklady/novy"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Nový doklad
            </Link>
          </div>
        }
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Mesiac</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Stav</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="all">Všetky</option>
              <option value="new">Nové</option>
              <option value="processed">Spracované</option>
              <option value="exported">Exportované</option>
            </select>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => handleExport(false)}
              disabled={exporting || !rows.length}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> ZIP {selected.size ? `(${selected.size})` : "všetko"}
            </button>
            <button
              onClick={() => handleExport(true)}
              disabled={exporting || !rows.length}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Odovzdať účtovníkovi
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-3">
          <SummaryCard label="Základ" value={totals.net} />
          <SummaryCard label="DPH" value={totals.vat} />
          <SummaryCard label="Celkom" value={totals.total} highlight />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Načítavam…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
              Zatiaľ tu nemáte žiadne doklady. Odfoťte blok alebo nahrajte fotku/PDF.
              <div className="mt-4 flex justify-center gap-2">
                <Link
                  to="/doklady/novy"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  <Camera className="h-4 w-4" /> Skenovať doklad
                </Link>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.size === rows.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Dátum</th>
                  <th className="px-3 py-2 text-left">Dodávateľ</th>
                  <th className="px-3 py-2 text-left">Číslo</th>
                  <th className="px-3 py-2 text-right">Celkom</th>
                  <th className="px-3 py-2 text-left">Stav</th>
                  <th className="px-3 py-2 text-left">Zdroj</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.issue_date ?? "—"}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() =>
                          navigate({ to: "/doklady/novy", search: { id: r.id } as any })
                        }
                        className="text-left hover:underline"
                      >
                        {r.supplier_name ?? (
                          <span className="text-muted-foreground italic">bez názvu</span>
                        )}
                      </button>
                      {r.supplier_ico ? (
                        <div className="text-xs text-muted-foreground">IČO {r.supplier_ico}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{r.document_number ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.total_amount != null
                        ? `${Number(r.total_amount).toFixed(2)} ${r.currency}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.source}</td>
                    <td className="px-3 py-2 text-right">
                      {r.file_path && (
                        <button
                          onClick={() => openFile(r.file_path)}
                          title="Otvoriť súbor"
                          className="rounded-md p-1.5 hover:bg-secondary"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => del(r.id)}
                        title="Zmazať"
                        className="rounded-md p-1.5 hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PageBody>
    </>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border p-4 ${highlight ? "bg-primary/5" : "bg-card"}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value.toFixed(2)} €</div>
    </div>
  );
}
