import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Plus, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/prijate-faktury/")({
  head: () => ({ meta: [{ title: "Prijaté faktúry — Faktero" }] }),
  component: PurchaseInvoicesPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept",
  received: "Prijaté",
  booked: "Zaúčtované",
  paid: "Zaplatené",
  cancelled: "Stornované",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    received: "bg-amber-100 text-amber-800",
    booked: "bg-sky-100 text-sky-800",
    paid: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-rose-100 text-rose-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? map.draft}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function fmtMoney(n: number, c = "EUR") {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: c }).format(n);
}

function monthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [{ value: "", label: "Všetky mesiace" }];
  const now = new Date();
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    opts.push({ value: `${y}-${m}`, label: `${["Jan","Feb","Mar","Apr","Máj","Jún","Júl","Aug","Sep","Okt","Nov","Dec"][d.getMonth()]} ${y}` });
  }
  return opts;
}

function PurchaseInvoicesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [month, setMonth] = useState<string>("");
  const [supplier, setSupplier] = useState<string>("");

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setLoading(true);
    let q = supabase.from("purchase_invoices")
      .select("*")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false })
      .limit(500);
    if (status) q = q.eq("status", status);
    if (month) {
      const [y, m] = month.split("-").map(Number);
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      const toDate = new Date(y, m, 1);
      const to = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, "0")}-01`;
      q = q.gte("issue_date", from).lt("issue_date", to);
    }
    if (supplier.trim()) q = q.ilike("supplier_name", `%${supplier.trim()}%`);
    const { data } = await q;
    setRows(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [status, month, supplier]);

  const totals = useMemo(() => {
    let total = 0, unpaid = 0, overdueCount = 0;
    const today = new Date().toISOString().slice(0, 10);
    rows.forEach((r) => {
      total += Number(r.amount_total ?? 0);
      if (r.status !== "paid" && r.status !== "cancelled") {
        unpaid += Number(r.amount_total ?? 0);
        if (r.due_date < today) overdueCount++;
      }
    });
    return { total, unpaid, overdueCount, count: rows.length };
  }, [rows]);

  return (
    <>
      <PageHeader
        title="Prijaté faktúry"
        description="Evidencia nákupných faktúr od dodávateľov."
        action={
          <Link to="/prijate-faktury/nova"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Nová prijatá faktúra
          </Link>
        }
      />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Počet faktúr" value={String(totals.count)} />
          <StatCard label="Celková suma" value={fmtMoney(totals.total)} />
          <StatCard label="Nezaplatené" value={fmtMoney(totals.unpaid)} tone="amber" />
          <StatCard label="Po splatnosti" value={String(totals.overdueCount)} tone={totals.overdueCount > 0 ? "rose" : undefined} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Všetky stavy</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            {monthOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)}
            placeholder="Dodávateľ…"
            className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm" />
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Číslo</th>
                <th className="p-3">Dodávateľ</th>
                <th className="p-3">Vystavená</th>
                <th className="p-3">Splatnosť</th>
                <th className="p-3 text-right">Suma</th>
                <th className="p-3">Stav</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Načítavam…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">
                  <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  Žiadne prijaté faktúry. Pridajte prvú cez „Nová prijatá faktúra".
                </td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-muted/30"
                  onClick={() => (window.location.href = `/prijate-faktury/${r.id}`)}>
                  <td className="p-3 font-medium">{r.invoice_number}</td>
                  <td className="p-3">{r.supplier_name}</td>
                  <td className="p-3">{r.issue_date}</td>
                  <td className="p-3">{r.due_date}</td>
                  <td className="p-3 text-right tabular-nums">{fmtMoney(Number(r.amount_total ?? 0), r.currency)}</td>
                  <td className="p-3"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "amber" | "rose" }) {
  const toneCls = tone === "amber"
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-4 ${toneCls}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
