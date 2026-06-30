import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { StatusBadge } from "./dashboard";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateInvoicePdf, getInvoicePdfSignedUrl } from "@/lib/faktero/pdf.functions";
import { sendInvoiceEmailFn, triggerEventFn } from "@/lib/faktero/email.functions";
import { exportInvoicesFn } from "@/lib/faktero/export.functions";
import { Download, FileText, RefreshCw, Mail, FileCode2, Trash2, Pencil, FileCheck2, CreditCard, Copy, RotateCw } from "lucide-react";
import { ConfirmDialog } from "@/components/faktero/ListControls";
import {
  generateEfakturaXmlFn,
  getEfakturaXmlUrlFn,
  getInvoiceEfakturaDocFn,
} from "@/lib/faktero/efaktura/efaktura.functions";
import {
  deriveEfakturaUiStatus,
  EfakturaStatusBadge,
} from "@/components/faktero/EfakturaStatusBadge";
import { useQuery } from "@tanstack/react-query";
import { friendlyError } from "@/lib/faktero/plan-error";
import { createInvoicePaymentLink, syncInvoicePayment } from "@/lib/faktero/payments.functions";

export const Route = createFileRoute("/_authenticated/faktury/$id")({
  head: () => ({ meta: [{ title: "Detail faktúry — Faktero" }] }),
  component: InvoiceDetail,
});

function InvoiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [stockMoves, setStockMoves] = useState<any[]>([]);
  const [warehouseNames, setWarehouseNames] = useState<Record<string, string>>({});
  const [stockSkus, setStockSkus] = useState<Record<string, string>>({});
  const [pdfBusy, setPdfBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [emailForm, setEmailForm] = useState({ recipient_email: "", subject: "", message: "" });
  const genPdf = useServerFn(generateInvoicePdf);
  const getPdf = useServerFn(getInvoicePdfSignedUrl);
  const sendEmail = useServerFn(sendInvoiceEmailFn);
  const triggerEvt = useServerFn(triggerEventFn);
  const exportFn = useServerFn(exportInvoicesFn);
  const [exportBusy, setExportBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payLink, setPayLink] = useState<string | null>(null);
  const createPayLink = useServerFn(createInvoicePaymentLink);
  const [syncBusy, setSyncBusy] = useState(false);
  const syncPayFn = useServerFn(syncInvoicePayment);
  const [hasPayLink, setHasPayLink] = useState(false);
  const [settledIn, setSettledIn] = useState<any | null>(null); // for proforma: invoice that consumed it
  const [advanceProforma, setAdvanceProforma] = useState<any | null>(null); // for regular: linked proforma

  async function handleCreatePayLink() {
    if (!inv?.company_id) return;
    setPayBusy(true);
    try {
      const r = await createPayLink({ data: { companyId: inv.company_id, invoiceId: id } });
      const url = `${window.location.origin}/pay/${r.token}`;
      setPayLink(url);
      setHasPayLink(true);
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
      toast.success(
        r.reused
          ? "Platobný odkaz skopírovaný."
          : "Platobný odkaz bol vytvorený. PDF bude pri ďalšom stiahnutí pregenerované.",
      );
      load();
    } catch (e: any) { toast.error(friendlyError(e) ?? e.message); }
    finally { setPayBusy(false); }
  }

  async function handleSyncPayment() {
    if (!inv?.company_id) return;
    setSyncBusy(true);
    try {
      const r = await syncPayFn({ data: { companyId: inv.company_id, invoiceId: id } });
      if (r.paid) toast.success("Platba prebehla. Faktúra označená ako uhradená.");
      else toast.success(`Stav platby: ${r.state || "neznámy"}`);
      load();
    } catch (e: any) { toast.error(e?.message ?? "Synchronizácia zlyhala."); }
    finally { setSyncBusy(false); }
  }
  const genXml = useServerFn(generateEfakturaXmlFn);
  const getXml = useServerFn(getEfakturaXmlUrlFn);
  const getDocFn = useServerFn(getInvoiceEfakturaDocFn);
  const [xmlBusy, setXmlBusy] = useState(false);
  const efakturaQuery = useQuery({
    queryKey: ["efaktura-doc", id, inv?.company_id],
    queryFn: () => getDocFn({ data: { companyId: inv!.company_id, invoiceId: id } }),
    enabled: !!inv?.company_id,
  });
  const efakturaDoc = efakturaQuery.data ?? null;
  const efakturaUi = deriveEfakturaUiStatus(efakturaDoc);

  async function handleGenerateXml() {
    if (!inv?.company_id) return;
    setXmlBusy(true);
    try {
      const r = await genXml({ data: { companyId: inv.company_id, invoiceId: id } });
      if (r.valid) toast.success("eFaktúra XML vygenerovaná a validovaná.");
      else toast.error(`XML vygenerovaná, ale s ${r.validationErrors.length} chybami validácie.`);
      efakturaQuery.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setXmlBusy(false);
    }
  }
  async function handleDownloadXml() {
    if (!inv?.company_id) return;
    setXmlBusy(true);
    try {
      const r = await getXml({ data: { companyId: inv.company_id, invoiceId: id } });
      triggerBrowserDownload(r.signedUrl, `${inv.invoice_number ?? "efaktura"}.xml`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setXmlBusy(false);
    }
  }

  async function load() {
    const { data } = await supabase.from("invoices").select("*").eq("id", id).single();
    setInv(data);
    if (data) {
      const [{ data: its }, { data: comp }] = await Promise.all([
        supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
        supabase.from("companies").select("*").eq("id", data.company_id).single(),
      ]);
      setItems(its ?? []);
      setCompany(comp);
      // Check if a payment link exists for this invoice (drives the "Synchronizovať platbu" button)
      const { data: anyLink } = await supabase.from("invoice_payment_links")
        .select("id").eq("invoice_id", id).limit(1).maybeSingle();
      setHasPayLink(!!anyLink);
      // Load stock impact (movements referencing this invoice)
      const { data: mv } = await supabase.from("stock_movements")
        .select("id, type, quantity, warehouse_id, stock_item_id, created_at, note")
        .eq("reference_type", "invoice").eq("reference_id", id).order("created_at");
      setStockMoves(mv ?? []);
      if (mv?.length) {
        const whIds = Array.from(new Set(mv.map((m: any) => m.warehouse_id)));
        const siIds = Array.from(new Set(mv.map((m: any) => m.stock_item_id)));
        const [{ data: whs }, { data: sis }] = await Promise.all([
          supabase.from("warehouses").select("id, name").in("id", whIds),
          supabase.from("stock_items").select("id, sku").in("id", siIds),
        ]);
        const wm: Record<string, string> = {}; (whs ?? []).forEach((w: any) => { wm[w.id] = w.name; });
        const sm: Record<string, string> = {}; (sis ?? []).forEach((s: any) => { sm[s.id] = s.sku ?? s.id.slice(0, 6); });
        setWarehouseNames(wm); setStockSkus(sm);
      } else { setWarehouseNames({}); setStockSkus({}); }
      // Advance linkage
      if (data.type === "proforma") {
        const { data: consumer } = await supabase.from("invoices")
          .select("id, invoice_number, status, issue_date, total, currency, type")
          .eq("advance_invoice_id", data.id).is("deleted_at", null)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        setSettledIn(consumer ?? null);
        setAdvanceProforma(null);
      } else if (data.advance_invoice_id) {
        const { data: pf } = await supabase.from("invoices")
          .select("id, invoice_number, status, issue_date, total, currency, type")
          .eq("id", data.advance_invoice_id).maybeSingle();
        setAdvanceProforma(pf ?? null);
        setSettledIn(null);
      } else {
        setSettledIn(null); setAdvanceProforma(null);
      }
    }
  }
  useEffect(() => { load(); }, [id]);

  async function handleDelete() {
    setDeleteBusy(true);
    try {
      const { error } = await supabase.from("invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Faktúra vymazaná");
      navigate({ to: "/faktury" });
    } catch (e: any) {
      toast.error(friendlyError(e, "Chyba pri mazaní"));
    } finally {
      setDeleteBusy(false);
      setDeleteOpen(false);
    }
  }

  async function setStatus(status: string) {
    // Production-readiness checks
    if (status === "paid" && inv?.status === "cancelled") return toast.error("Stornovanú faktúru nemožno označiť ako uhradenú.");
    if (status === "cancelled" && inv?.status === "paid") {
      if (!confirm("Faktúra je uhradená. Naozaj ju chcete stornovať?")) return;
    }
    const patch: any = { status };
    if (status === "paid") patch.paid_at = new Date().toISOString();
    if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
    if (status === "sent") patch.sent_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(patch).eq("id", id);
    if (error) return toast.error(friendlyError(error, error.message));
    toast.success("Stav aktualizovaný");
    // Trigger webhook
    const event = status === "paid" ? "invoice.paid" : status === "cancelled" ? "invoice.cancelled" : status === "sent" ? "invoice.sent" : null;
    if (event && inv?.company_id) {
      try {
        await triggerEvt({ data: { companyId: inv.company_id, event: event as any, data: {
          invoice_id: inv.id, invoice_number: inv.invoice_number, status, total: Number(inv.total), currency: inv.currency, external_id: inv.external_id ?? null,
        } } });
      } catch {}
    }
    load();
  }

  function triggerBrowserDownload(url: string, _filename: string): boolean {
    // The signed URL is already issued with ?download=<name>, so the storage server
    // sends Content-Disposition: attachment. Opening it in a new tab triggers the
    // browser download even when running inside the sandboxed preview iframe.
    try {
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (w) return true;
    } catch (e) {
      console.error("PDF window.open failed", e);
    }
    // Fallback: navigate top frame directly to the file URL.
    try {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch (e) {
      console.error("PDF anchor click failed", e);
      return false;
    }
  }

  async function handleGenerate() {
    setPdfBusy(true);
    try {
      const r = await genPdf({ data: { invoiceId: id } });
      if (!r?.signedUrl) {
        toast.error("PDF sa nepodarilo vygenerovať.");
        return;
      }
      toast.success("PDF vygenerované.");
      const ok = triggerBrowserDownload(r.signedUrl, `${inv.invoice_number ?? "faktura"}.pdf`);
      if (!ok) toast.error("PDF sa nepodarilo stiahnuť.");
      load();
    } catch (e: any) {
      console.error("generateInvoicePdf failed", e);
      toast.error(e?.message ?? "PDF sa nepodarilo vygenerovať.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleDownload() {
    setPdfBusy(true);
    try {
      let signedUrl: string | null = null;
      try {
        const r = await getPdf({ data: { invoiceId: id } });
        signedUrl = r?.signedUrl ?? null;
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (msg.includes("zatiaľ neexistuje") || msg.includes("not_found")) {
          // Auto-generate if missing
          const g = await genPdf({ data: { invoiceId: id } });
          signedUrl = g?.signedUrl ?? null;
          load();
        } else {
          throw e;
        }
      }
      if (!signedUrl) {
        toast.error("PDF zatiaľ neexistuje.");
        return;
      }
      const ok = triggerBrowserDownload(signedUrl, `${inv.invoice_number ?? "faktura"}.pdf`);
      if (!ok) toast.error("PDF sa nepodarilo stiahnuť.");
    } catch (e: any) {
      console.error("downloadInvoicePdf failed", e);
      toast.error(e?.message ?? "PDF sa nepodarilo stiahnuť.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function handlePohodaExport() {
    if (!inv?.company_id) return;
    setExportBusy(true);
    try {
      const r = await exportFn({ data: { companyId: inv.company_id, invoiceIds: [inv.id], format: "pohoda_xml" } });
      const blob = new Blob([r.content], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = r.fileName; document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      toast.success("Pohoda XML stiahnuté");
    } catch (e: any) {
      toast.error(e?.message ?? "Export zlyhal");
    } finally { setExportBusy(false); }
  }

  if (!inv) return <PageBody>Načítavam…</PageBody>;

  function openEmail() {
    if (!inv.customer_email) {
      toast.error("Odberateľ nemá e-mail. Doplňte e-mail v karte odberateľa.");
      return;
    }
    setEmailForm({
      recipient_email: inv.customer_email,
      subject: (company?.email_default_subject ?? "Faktúra {invoice_number}").replaceAll("{invoice_number}", inv.invoice_number),
      message: (company?.email_default_message ?? "V prílohe posielame faktúru {invoice_number}.")
        .replaceAll("{invoice_number}", inv.invoice_number)
        .replaceAll("{due_date}", inv.due_date)
        .replaceAll("{total}", `${Number(inv.total).toFixed(2)} ${inv.currency}`)
        .replaceAll("{company_name}", company?.name ?? ""),
    });
    setEmailOpen(true);
  }
  async function submitEmail() {
    setEmailBusy(true);
    try {
      await sendEmail({ data: { invoiceId: inv.id, recipient_email: emailForm.recipient_email, subject: emailForm.subject, message: emailForm.message } });
      toast.success("E-mail odoslaný");
      setEmailOpen(false); load();
    } catch (e: any) { toast.error(e?.message ?? "Odoslanie zlyhalo"); }
    finally { setEmailBusy(false); }
  }

  return (
    <>
      <PageHeader
        title={`${inv.type === "proforma" ? "Zálohová faktúra" : inv.type === "credit_note" ? "Dobropis" : "Faktúra"} ${inv.invoice_number}`}
        description={`Vystavená ${inv.issue_date} · splatná ${inv.due_date}`}
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={inv.status} />
            {inv.status !== "paid" && inv.status !== "cancelled" && (
              <Link to="/faktury/$id/upravit" params={{ id }} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">
                <Pencil className="h-4 w-4" /> Upraviť
              </Link>
            )}
            <button onClick={openEmail} disabled={inv.status === "cancelled"} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              <Mail className="h-4 w-4" /> Poslať e-mailom
            </button>
            {company?.online_payments_enabled && inv.status !== "paid" && inv.status !== "cancelled" && (
              <button onClick={handleCreatePayLink} disabled={payBusy} className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
                <CreditCard className="h-4 w-4" /> {payBusy ? "…" : "Vytvoriť platobný odkaz"}
              </button>
            )}
            {payLink && (
              <a href={payLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary" title={payLink}>
                <Copy className="h-3.5 w-3.5" /> Otvoriť odkaz
              </a>
            )}
            {hasPayLink && inv.status !== "cancelled" && (
              <button onClick={handleSyncPayment} disabled={syncBusy} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50" title="Načítať stav platby z GoPay">
                <RotateCw className="h-4 w-4" /> {syncBusy ? "Synchronizujem…" : "Synchronizovať platbu"}
              </button>
            )}
            {!inv.pdf_url && (
              <button onClick={handleGenerate} disabled={pdfBusy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                <FileText className="h-4 w-4" /> {pdfBusy ? "Generujem…" : "Vygenerovať PDF"}
              </button>
            )}
            {inv.pdf_url && (
              <>
                <button onClick={handleDownload} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
                  <Download className="h-4 w-4" /> Stiahnuť PDF
                </button>
                <button onClick={handleGenerate} disabled={pdfBusy} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50">
                  <RefreshCw className="h-4 w-4" /> {pdfBusy ? "…" : "Pregenerovať"}
                </button>
              </>
            )}
            {inv.status !== "paid" && <button onClick={() => setStatus("paid")} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">Označiť ako uhradenú</button>}
            {inv.status !== "sent" && inv.status !== "paid" && <button onClick={() => setStatus("sent")} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">Označiť ako odoslanú</button>}
            {inv.status !== "cancelled" && <button onClick={() => setStatus("cancelled")} className="rounded-md border border-border px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10">Stornovať</button>}
            <button onClick={handlePohodaExport} disabled={exportBusy} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50">
              <FileCode2 className="h-4 w-4" /> {exportBusy ? "Exportujem…" : "Export do Pohody XML"}
            </button>
            <EfakturaStatusBadge status={efakturaUi} />
            <button
              onClick={handleGenerateXml}
              disabled={xmlBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <FileCheck2 className="h-4 w-4" />
              {xmlBusy ? "…" : efakturaDoc ? "Pregenerovať eFaktúru XML" : "Vygenerovať eFaktúru XML"}
            </button>
            {efakturaDoc && (
              <button
                onClick={handleDownloadXml}
                disabled={xmlBusy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Stiahnuť XML
              </button>
            )}
            <button onClick={() => setDeleteOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" /> Vymazať
            </button>
            <Link to="/faktury" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">Späť</Link>
          </div>
        }
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <div className="grid gap-6 rounded-xl border border-border bg-card p-6 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Dodávateľ</div>
                <div className="mt-1 font-medium">{company?.name}</div>
                <div className="text-sm text-muted-foreground">{company?.street}<br />{company?.zip} {company?.city}, {company?.country}</div>
                <div className="mt-2 text-sm">IČO: {company?.ico ?? "—"} · DIČ: {company?.dic ?? "—"}</div>
                {company?.ic_dph && <div className="text-sm">IČ DPH: {company.ic_dph}</div>}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Odberateľ</div>
                <div className="mt-1 font-medium">{inv.customer_name}</div>
                <div className="text-sm text-muted-foreground">{inv.customer_street}<br />{inv.customer_zip} {inv.customer_city}, {inv.customer_country}</div>
                <div className="mt-2 text-sm">IČO: {inv.customer_ico ?? "—"} · DIČ: {inv.customer_dic ?? "—"}</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="p-3">Položka</th><th className="p-3 text-right">Mn.</th><th className="p-3">MJ</th><th className="p-3 text-right">Cena</th><th className="p-3 text-right">DPH</th><th className="p-3 text-right">Spolu</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td className="p-3"><div className="font-medium">{it.name}</div>{it.description && <div className="text-xs text-muted-foreground">{it.description}</div>}</td>
                      <td className="p-3 text-right">{Number(it.quantity)}</td>
                      <td className="p-3">{it.unit}</td>
                      <td className="p-3 text-right">{Number(it.unit_price).toFixed(2)}</td>
                      <td className="p-3 text-right">{it.vat_rate}%</td>
                      <td className="p-3 text-right font-medium">{Number(it.total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {inv.notes && <div className="rounded-xl border border-border bg-card p-5 text-sm whitespace-pre-wrap">{inv.notes}</div>}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Sumár</div>
              <div className="mt-3 space-y-1 text-sm">
                <Row label="Bez DPH" value={`${Number(inv.subtotal).toFixed(2)} ${inv.currency}`} />
                <Row label="DPH" value={`${Number(inv.vat_total).toFixed(2)} ${inv.currency}`} />
              </div>
              <div className="mt-3 border-t border-border pt-3 text-lg font-semibold">
                {Number(inv.total).toFixed(2)} {inv.currency}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Platba</div>
              <div className="mt-2">IBAN: <span className="font-mono">{company?.iban ?? "—"}</span></div>
              <div>Variabilný symbol: <span className="font-mono">{inv.variable_symbol}</span></div>
              <div>Splatnosť: {inv.due_date}</div>
            </div>
            {inv.type === "proforma" && (
              <div className="rounded-xl border border-border bg-card p-5 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Zálohová faktúra</div>
                {settledIn ? (
                  <div className="mt-2 space-y-1">
                    <div className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Zúčtovaná</div>
                    <div>Zúčtovaná vo faktúre:{" "}
                      <Link to="/faktury/$id" params={{ id: settledIn.id }} className="font-medium text-primary hover:underline">
                        {settledIn.invoice_number}
                      </Link>
                    </div>
                    <div className="text-xs text-muted-foreground">{settledIn.issue_date} · {Number(settledIn.total).toFixed(2)} {settledIn.currency}</div>
                  </div>
                ) : (
                  <div className="mt-2 text-muted-foreground">Zatiaľ nezúčtovaná. Zálohu môžete použiť pri vytváraní novej faktúry cez „Pridať zálohovú faktúru".</div>
                )}
              </div>
            )}
            {advanceProforma && (
              <div className="rounded-xl border border-border bg-card p-5 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Zúčtovaná záloha</div>
                <div className="mt-2 space-y-1">
                  <div>Zálohová faktúra:{" "}
                    <Link to="/faktury/$id" params={{ id: advanceProforma.id }} className="font-medium text-primary hover:underline">
                      {advanceProforma.invoice_number}
                    </Link>
                  </div>
                  {inv.advance_amount != null && (
                    <div className="text-xs text-muted-foreground">Odpočítaná suma: {Number(inv.advance_amount).toFixed(2)} {inv.currency}</div>
                  )}
                </div>
              </div>
            )}
            {stockMoves.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Sklad</div>
                <div className="mt-2 space-y-2">
                  {stockMoves.map((m) => {
                    const reversed = m.type === "dobropis";
                    return (
                      <div key={m.id} className="flex items-start justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                        <div>
                          <div className="font-medium">
                            {reversed ? "Sklad vrátený" : "Sklad odpočítaný"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {stockSkus[m.stock_item_id] ?? "—"} · {warehouseNames[m.warehouse_id] ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("sk-SK")}</div>
                        </div>
                        <div className={`tabular-nums text-right font-semibold ${reversed ? "text-emerald-600" : "text-destructive"}`}>
                          {reversed ? "+" : "−"}{Math.abs(Number(m.quantity))}
                        </div>
                      </div>
                    );
                  })}
                  <Link to="/sklad/pohyby" className="block pt-1 text-xs text-primary hover:underline">Pozrieť všetky pohyby →</Link>
                </div>
              </div>
            )}
          </aside>
        </div>
      </PageBody>
      {emailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-card p-5">
            <h3 className="text-lg font-semibold">Odoslať faktúru e-mailom</h3>
            <label className="block text-sm"><span className="font-medium">Príjemca</span>
              <input value={emailForm.recipient_email} onChange={(e) => setEmailForm({ ...emailForm, recipient_email: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm"><span className="font-medium">Predmet</span>
              <input value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm"><span className="font-medium">Správa</span>
              <textarea rows={6} value={emailForm.message} onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <p className="text-xs text-muted-foreground">PDF faktúry sa pripojí automaticky. Ak ešte neexistuje, vygeneruje sa pred odoslaním.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEmailOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary">Zrušiť</button>
              <button onClick={submitEmail} disabled={emailBusy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{emailBusy ? "Odosielam…" : "Odoslať"}</button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deleteOpen}
        title="Naozaj chcete vymazať túto faktúru?"
        message={`Faktúra ${inv.invoice_number} bude skrytá z rozhrania. Môžete ju neskôr obnoviť v zozname vymazaných.`}
        warning={inv.status === "paid" || inv.status === "sent" ? "Táto faktúra je už odoslaná alebo zaplatená. Mazanie môže narušiť účtovnú stopu." : undefined}
        busy={deleteBusy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}