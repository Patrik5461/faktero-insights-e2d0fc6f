import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listTransfers } from "@/lib/faktero/stock.functions";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { ArrowRightLeft, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sklad/presuny")({
  head: () => ({ meta: [{ title: "Presuny — Faktero" }] }),
  component: TransfersListPage,
});

const STATUS_LABEL: Record<string, string> = { draft: "Koncept", completed: "Dokončený", cancelled: "Zrušený" };
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-muted text-muted-foreground",
};

function TransfersListPage() {
  const fetchList = useServerFn(listTransfers);
  const [rows, setRows] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Record<string, string>>({});
  const [companies, setCompanies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    (async () => {
      setLoading(true);
      const [list, whRes, coRes] = await Promise.all([
        fetchList({ data: { company_id: cid } }),
        supabase.from("warehouses").select("id, name"),
        supabase.from("companies").select("id, name"),
      ]);
      const wm: Record<string, string> = {};
      (whRes.data ?? []).forEach((w: any) => { wm[w.id] = w.name; });
      const cm: Record<string, string> = {};
      (coRes.data ?? []).forEach((c: any) => { cm[c.id] = c.name; });
      setWarehouses(wm);
      setCompanies(cm);
      setRows(list ?? []);
      setLoading(false);
    })();
  }, [fetchList]);

  return (
    <>
      <PageHeader title="Presuny skladu" description="Presúvajte tovar medzi skladmi alebo firmami">
        <Link
          to="/sklad/presuny/nova"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nový presun
        </Link>
      </PageHeader>
      <PageBody>
        {loading ? (
          <div className="rounded-md border p-6 text-sm text-muted-foreground">Načítavam…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
            Zatiaľ nemáte žiadne presuny. <Link className="text-primary underline" to="/sklad/presuny/nova">Vytvorte prvý</Link>.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Vytvorený</th>
                  <th className="px-3 py-2">Zo skladu</th>
                  <th className="px-3 py-2">Do</th>
                  <th className="px-3 py-2">Stav</th>
                  <th className="px-3 py-2">Poznámka</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{new Date(r.created_at).toLocaleString("sk-SK")}</td>
                    <td className="px-3 py-2">{warehouses[r.warehouse_from_id] ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1">
                        <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                        {r.target_company_id
                          ? `${companies[r.target_company_id] ?? "Iná firma"}${r.warehouse_to_id ? ` · ${warehouses[r.warehouse_to_id] ?? ""}` : ""}`
                          : warehouses[r.warehouse_to_id] ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs ${STATUS_STYLE[r.status] ?? ""}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-[240px] truncate text-muted-foreground">{r.note ?? ""}</td>
                    <td className="px-3 py-2 text-right">
                      <Link to="/sklad/presuny/$id" params={{ id: r.id }} className="text-primary hover:underline">
                        Detail
                      </Link>
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
