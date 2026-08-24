import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { PrijemMailom } from "@/components/faktero/PrijemMailom";
import {
  Plus,
  FileText,
  Archive,
  Loader2,
  Check,
  Trash2,
  Mail,
  ScanLine,
  User,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { ConfirmDialog } from "@/components/faktero/ListControls";
import { toast } from "sonner";

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
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? map.draft}`}
    >
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
    opts.push({
      value: `${y}-${m}`,
      label: `${["Jan", "Feb", "Mar", "Apr", "Máj", "Jún", "Júl", "Aug", "Sep", "Okt", "Nov", "Dec"][d.getMonth()]} ${y}`,
    });
  }
  return opts;
}

function PurchaseInvoicesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [month, setMonth] = useState<string>("");
  const [supplier, setSupplier] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipBusy, setZipBusy] = useState(false);
  const [hromadneBusy, setHromadneBusy] = useState(false);
  const [mazanie, setMazanie] = useState(false);
  /** Meno k `created_by`; profily číta server, RLS pustí každého len k sebe. */
  const [mena, setMena] = useState<Record<string, string>>({});
  const nacitajMena = useServerFn(menaClenovFirmy);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  async function csvSummary(items: any[]) {
    const header = [
      "Číslo",
      "Dodávateľ",
      "IČO",
      "Vystavená",
      "Splatnosť",
      "Suma",
      "Mena",
      "Stav",
      "VS",
    ];
    const rowsCsv = items.map((r) =>
      [
        r.invoice_number,
        r.supplier_name,
        r.supplier_ico ?? "",
        r.issue_date,
        r.due_date,
        Number(r.amount_total ?? 0).toFixed(2),
        r.currency ?? "EUR",
        r.status,
        r.variable_symbol ?? "",
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(";"),
    );
    return "\uFEFF" + [header.join(";"), ...rowsCsv].join("\n");
  }

  async function runBulkZip() {
    const items = rows.filter((r) => selected.has(r.id));
    if (!items.length) return;
    setZipBusy(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      let ok = 0,
        fail = 0;
      for (const r of items) {
        if (!r.file_path) {
          fail++;
          continue;
        }
        try {
          const { data } = await supabase.storage
            .from("purchase-invoices")
            .createSignedUrl(r.file_path, 300);
          if (!data?.signedUrl) {
            fail++;
            continue;
          }
          const resp = await fetch(data.signedUrl);
          if (!resp.ok) {
            fail++;
            continue;
          }
          const bytes = new Uint8Array(await resp.arrayBuffer());
          const ext = r.file_path.split(".").pop() || "pdf";
          const safe = String(r.invoice_number ?? r.id).replace(/[^\w.-]+/g, "_");
          zip.file(`${safe}.${ext}`, bytes);
          ok++;
        } catch {
          fail++;
        }
      }
      zip.file("_suhrn.csv", await csvSummary(items));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prijate-faktury-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (fail === 0) toast.success(`ZIP so ${ok} faktúrami stiahnutý`);
      else toast.warning(`ZIP: ${ok} v poriadku, ${fail} bez prílohy alebo chyba`);
      setSelected(new Set());
    } finally {
      setZipBusy(false);
    }
  }

  /** Označí vybrané za prijaté. Stornované a už prijaté sa nechávajú tak. */
  async function hromadnePrijat() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const ciel = rows.filter(
      (r) => selected.has(r.id) && r.status !== "cancelled" && r.status !== "received",
    );
    if (!ciel.length) {
      toast.info("Vybrané faktúry už prijaté sú (alebo sú stornované).");
      return;
    }
    setHromadneBusy(true);
    try {
      const { error } = await supabase
        .from("purchase_invoices")
        .update({ status: "received" })
        .eq("company_id", cid)
        .in(
          "id",
          ciel.map((r) => r.id),
        );
      if (error) throw new Error(error.message);
      toast.success(ciel.length === 1 ? "Faktúra prijatá" : `Prijatých ${ciel.length} faktúr`);
      setSelected(new Set());
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setHromadneBusy(false);
    }
  }

  /** Mäkké mazanie — doklad ostáva v databáze kvôli exportom a auditu. */
  async function hromadneVymazat() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const ids = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
    if (!ids.length) return;
    setHromadneBusy(true);
    try {
      const { error } = await supabase
        .from("purchase_invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("company_id", cid)
        .in("id", ids);
      if (error) throw new Error(error.message);
      toast.success(ids.length === 1 ? "Faktúra vymazaná" : `Vymazaných ${ids.length} faktúr`);
      setSelected(new Set());
      setMazanie(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setHromadneBusy(false);
    }
  }

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setLoading(true);
    let q = supabase
      .from("purchase_invoices")
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
  useEffect(() => {
    load();
  }, [status, month, supplier]);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    nacitajMena({ data: { company_id: cid } })
      .then((m) => setMena(m as Record<string, string>))
      .catch(() => setMena({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    let total = 0,
      unpaid = 0,
      overdueCount = 0;
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
          <Link
            to="/prijate-faktury/nova"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nová prijatá faktúra
          </Link>
        }
      />
      <PageBody>
        <PrijemMailom />
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Počet faktúr" value={String(totals.count)} />
          <StatCard label="Celková suma" value={fmtMoney(totals.total)} />
          <StatCard label="Nezaplatené" value={fmtMoney(totals.unpaid)} tone="amber" />
          <StatCard
            label="Po splatnosti"
            value={String(totals.overdueCount)}
            tone={totals.overdueCount > 0 ? "rose" : undefined}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Všetky stavy</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {monthOptions().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Dodávateľ…"
            className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        {selected.size > 0 && (
          <div className="mt-4 flex items-center gap-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
            <span className="font-medium">{selected.size} vybraných</span>
            <button
              onClick={runBulkZip}
              disabled={zipBusy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {zipBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
              Stiahnuť ZIP (PDF + CSV)
            </button>
            <button
              onClick={hromadnePrijat}
              disabled={hromadneBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Označiť ako prijaté
            </button>
            <button
              onClick={() => setMazanie(true)}
              disabled={hromadneBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Vymazať
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Zrušiť výber
            </button>
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 p-3">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="p-3">Číslo</th>
                <th className="p-3">Dodávateľ</th>
                <th className="p-3">VS</th>
                <th className="p-3">Vystavená</th>
                <th className="p-3">Splatnosť</th>
                <th className="p-3 text-right">Suma</th>
                <th className="p-3">Zapísal</th>
                <th className="p-3">Stav</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    Načítavam…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    Žiadne prijaté faktúry. Pridajte prvú cez „Nová prijatá faktúra".
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                /*
                  Otvárať detail vedeli len dve bunky z deviatich a robili to
                  cez `window.location`, teda celým znovunačítaním stránky.
                  Ťuknutie na dátum, sumu či stav neurobilo nič — a nebolo to
                  na riadku nijako vidieť. Zvyšok aplikácie má preklikateľný
                  celý riadok, tak nech to tu funguje rovnako.
                */
                <tr
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => navigate({ to: "/prijate-faktury/$id", params: { id: r.id } })}
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="p-3 font-medium">{r.invoice_number}</td>
                  <td className="p-3">{r.supplier_name}</td>
                  <td className="p-3 tabular-nums text-muted-foreground">
                    {r.variable_symbol || "—"}
                  </td>
                  <td className="p-3">{r.issue_date}</td>
                  <td className="p-3">{r.due_date}</td>
                  <td className="p-3 text-right tabular-nums">
                    {fmtMoney(Number(r.amount_total ?? 0), r.currency)}
                  </td>
                  <td className="p-3">
                    <Zapisal zdroj={r.source} autor={r.created_by ? mena[r.created_by] : null} />
                  </td>
                  <td className="p-3">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>

      <ConfirmDialog
        open={mazanie}
        title={selected.size === 1 ? "Vymazať faktúru?" : `Vymazať ${selected.size} faktúr?`}
        message="Doklady sa presunú do koša — v exportoch ani v prehľadoch sa už neobjavia."
        confirmLabel="Vymazať"
        onCancel={() => setMazanie(false)}
        onConfirm={hromadneVymazat}
        busy={hromadneBusy}
      />
    </>
  );
}

/**
 * Kto doklad zapísal. Pri doklade z mailu je v `created_by` majiteľ adresy, nie
 * ten, kto niečo vypĺňal — meno by tam klamalo, preto rozhoduje zdroj.
 */
function Zapisal({ zdroj, autor }: { zdroj?: string | null; autor?: string | null }) {
  if (zdroj === "mail")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Mail className="h-3.5 w-3.5" /> E-mailom
      </span>
    );
  if (zdroj === "doklad")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <ScanLine className="h-3.5 w-3.5" /> Z dokladov
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <User className="h-3.5 w-3.5" /> {autor || "Ručne"}
    </span>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber" | "rose";
}) {
  const toneCls =
    tone === "amber"
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
