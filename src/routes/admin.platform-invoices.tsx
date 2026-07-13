import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageBody, AdminPageHeader } from "@/components/faktero/AdminShell";
import { AlertTriangle, ExternalLink, Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/platform-invoices")({
  ssr: false,
  component: PlatformInvoicesAdmin,
});

type Row = {
  id: string;
  invoice_number: string;
  company_id: string;
  total_cents: number;
  currency: string;
  issue_date: string;
  provider_payment_id: string | null;
  public_token: string;
  buyer_snapshot: any;
  companies?: { name: string | null } | null;
};

function fmtEur(cents: number, currency = "EUR") {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function PlatformInvoicesAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(""); // YYYY-MM
  const [companyFilter, setCompanyFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("platform_invoices")
      .select("id, invoice_number, company_id, total_cents, currency, issue_date, provider_payment_id, public_token, buyer_snapshot, companies(name)")
      .order("issue_date", { ascending: false })
      .limit(500);
    if (error) setErr(error.message);
    setRows((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (month) {
        const m = r.issue_date?.slice(0, 7);
        if (m !== month) return false;
      }
      if (companyFilter.trim()) {
        const name = (r.companies?.name ?? r.buyer_snapshot?.name ?? "").toLowerCase();
        if (!name.includes(companyFilter.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, month, companyFilter]);

  async function del(row: Row) {
    if (!confirm(`Naozaj vymazať doklad ${row.invoice_number}?\n\nTáto akcia je NEVRATNÁ.`)) return;
    setBusyId(row.id);
    const { error } = await supabase.from("platform_invoices").delete().eq("id", row.id);
    setBusyId(null);
    if (error) { alert("Chyba: " + error.message); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }

  return (
    <>
      <AdminPageHeader
        title="Platformové faktúry"
        description="Daňové doklady vystavené Tobify s.r.o. za predplatné Faktero."
      />
      <AdminPageBody>
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <b>Pozor:</b> mazanie dokladov je určené výhradne na testovacie účely.
            V produkcii by daňové doklady nemali byť mazané — porušuje to zákonné povinnosti archivácie.
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs text-muted-foreground">Mesiac</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-muted-foreground">Firma</span>
            <input
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              placeholder="hľadať názov…"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={() => { setMonth(""); setCompanyFilter(""); }}
            className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs"
          >
            Zrušiť filtre
          </button>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} / {rows.length}
          </div>
        </div>

        {err && (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {err}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Číslo</th>
                <th className="px-3 py-2 text-left">Firma</th>
                <th className="px-3 py-2 text-right">Suma s DPH</th>
                <th className="px-3 py-2 text-left">Vystavené</th>
                <th className="px-3 py-2 text-left">GoPay ID</th>
                <th className="px-3 py-2 text-right">Akcie</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Načítavam…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Žiadne doklady.</td></tr>
              )}
              {!loading && filtered.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-3 py-2 font-mono text-xs">{r.invoice_number}</td>
                  <td className="px-3 py-2">{r.companies?.name ?? r.buyer_snapshot?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEur(r.total_cents, r.currency)}</td>
                  <td className="px-3 py-2">{r.issue_date}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.provider_payment_id ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to="/danovy-doklad/$token"
                        params={{ token: r.public_token }}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-xs hover:bg-secondary/80"
                      >
                        <ExternalLink className="h-3 w-3" /> Doklad
                      </Link>
                      <button
                        onClick={() => del(r)}
                        disabled={busyId === r.id}
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" /> {busyId === r.id ? "Mažem…" : "Vymazať"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminPageBody>
    </>
  );
}
