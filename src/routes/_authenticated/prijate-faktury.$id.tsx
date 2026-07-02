import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { ArrowLeft, Download, CheckCircle2, Ban, Trash2, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/prijate-faktury/$id")({
  head: () => ({ meta: [{ title: "Detail prijatej faktúry — Faktero" }] }),
  component: PurchaseInvoiceDetail,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept", received: "Prijaté", booked: "Zaúčtované", paid: "Zaplatené", cancelled: "Stornované",
};
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  received: "bg-amber-100 text-amber-800",
  booked: "bg-sky-100 text-sky-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-800",
};

function fmt(n: number, c = "EUR") {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: c }).format(n);
}

function PurchaseInvoiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<any | null>(null);

  async function load() {
    const { data } = await supabase.from("purchase_invoices").select("*").eq("id", id).maybeSingle();
    setRow(data);
  }
  useEffect(() => { load(); }, [id]);

  async function setStatus(status: string, extra: Record<string, any> = {}) {
    const { error } = await supabase.from("purchase_invoices")
      .update({ status, ...extra }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Stav aktualizovaný");
    load();
  }

  async function markPaid() {
    const d = prompt("Dátum úhrady (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
    if (!d) return;
    await setStatus("paid", { payment_date: d });
  }

  async function del() {
    if (!confirm("Naozaj vymazať túto prijatú faktúru?")) return;
    const { error } = await supabase.from("purchase_invoices")
      .update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Vymazané");
    navigate({ to: "/prijate-faktury" });
  }

  async function downloadPdf() {
    if (!row?.file_path) return toast.error("Bez prílohy");
    const { data, error } = await supabase.storage.from("purchase-invoices")
      .createSignedUrl(row.file_path, 60, { download: `${row.invoice_number ?? "faktura"}` });
    if (error || !data) return toast.error(error?.message ?? "Chyba");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (!row) return <PageBody>Načítavam…</PageBody>;

  return (
    <>
      <PageHeader
        title={`Prijatá faktúra ${row.invoice_number}`}
        description={`Dodávateľ: ${row.supplier_name} · Vystavená ${row.issue_date}`}
        action={
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[row.status] ?? ""}`}>
              {STATUS_LABEL[row.status] ?? row.status}
            </span>
            {row.status !== "received" && row.status !== "paid" && row.status !== "cancelled" && (
              <button onClick={() => setStatus("received")}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">
                Označiť ako prijaté
              </button>
            )}
            {row.status !== "paid" && row.status !== "cancelled" && (
              <button onClick={markPaid}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Označiť ako zaplatené
              </button>
            )}
            {row.status !== "cancelled" && (
              <button onClick={() => setStatus("cancelled")}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50">
                <Ban className="h-4 w-4" /> Storno
              </button>
            )}
            {row.file_path && (
              <button onClick={downloadPdf}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">
                <Download className="h-4 w-4" /> Stiahnuť PDF
              </button>
            )}
            <button onClick={del}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" /> Vymazať
            </button>
            <Link to="/prijate-faktury"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" /> Späť
            </Link>
          </div>
        }
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <div className="grid gap-6 rounded-xl border border-border bg-card p-6 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Dodávateľ</div>
                <div className="mt-1 font-medium">{row.supplier_name}</div>
                <div className="mt-2 text-sm">IČO: {row.supplier_ico ?? "—"} · DIČ: {row.supplier_dic ?? "—"}</div>
                {row.supplier_ic_dph && <div className="text-sm">IČ DPH: {row.supplier_ic_dph}</div>}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Dátumy</div>
                <Row label="Vystavenie" value={row.issue_date} />
                <Row label="Prijatie" value={row.received_date} />
                <Row label="Splatnosť" value={row.due_date} />
                {row.payment_date && <Row label="Úhrada" value={row.payment_date} />}
              </div>
            </div>

            {row.note && (
              <div className="rounded-xl border border-border bg-card p-5 text-sm whitespace-pre-wrap">
                {row.note}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Sumár</div>
              <div className="mt-3 space-y-1 text-sm">
                <Row label="Bez DPH" value={fmt(Number(row.amount_without_vat), row.currency)} />
                <Row label="DPH" value={fmt(Number(row.vat_amount), row.currency)} />
              </div>
              <div className="mt-3 border-t border-border pt-3 text-lg font-semibold">
                {fmt(Number(row.amount_total), row.currency)}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 text-sm">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" /> Platba
              </div>
              <div className="mt-2">Spôsob: {row.payment_method ?? "—"}</div>
              <div>Splatnosť: {row.due_date}</div>
              {row.payment_date && <div>Uhradené: {row.payment_date}</div>}
            </div>
          </aside>
        </div>
      </PageBody>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
