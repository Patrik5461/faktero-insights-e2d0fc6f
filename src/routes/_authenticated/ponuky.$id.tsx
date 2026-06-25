import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { generateQuotePdf, getQuotePdfSignedUrl } from "@/lib/faktero/quote-pdf.functions";
import { convertQuoteToInvoice, duplicateQuote } from "@/lib/faktero/quote.functions";
import { sendQuoteEmailFn } from "@/lib/faktero/quote-email.functions";
import { Download, FileText, RefreshCw, Mail, Copy, ArrowRightLeft, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ponuky/$id")({
  head: () => ({ meta: [{ title: "Detail ponuky — Faktero" }] }),
  component: QuoteDetail,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept", sent: "Odoslaná", accepted: "Akceptovaná",
  rejected: "Zamietnutá", expired: "Expirovaná", converted: "Konvertovaná",
};
const STATUS_CLS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-secondary text-secondary-foreground",
  accepted: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
  expired: "bg-muted text-muted-foreground",
  converted: "bg-primary/15 text-primary",
};

function QuoteDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ recipient_email: "", subject: "", message: "" });

  const genPdf = useServerFn(generateQuotePdf);
  const getPdf = useServerFn(getQuotePdfSignedUrl);
  const convert = useServerFn(convertQuoteToInvoice);
  const dup = useServerFn(duplicateQuote);
  const send = useServerFn(sendQuoteEmailFn);

  async function load() {
    const { data: quote } = await supabase.from("quotes").select("*").eq("id", id).single();
    setQ(quote);
    if (quote) {
      const [{ data: its }, { data: comp }] = await Promise.all([
        supabase.from("quote_items").select("*").eq("quote_id", id).order("position"),
        supabase.from("companies").select("*").eq("id", quote.company_id).single(),
      ]);
      setItems(its ?? []);
      setCompany(comp);
    }
  }
  useEffect(() => { load(); }, [id]);

  async function setStatus(status: string) {
    setBusy(status);
    try {
      const { error } = await supabase.from("quotes").update({ status: status as any }).eq("id", id);
      if (error) throw error;
      toast.success("Stav aktualizovaný");
      load();
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); }
    finally { setBusy(null); }
  }

  async function handleGenerate() {
    setPdfBusy(true);
    try {
      const r = await genPdf({ data: { quoteId: id } });
      toast.success("PDF vygenerované");
      if (r.signedUrl) window.open(r.signedUrl, "_blank");
      load();
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); }
    finally { setPdfBusy(false); }
  }
  async function handleDownload() {
    try {
      const r = await getPdf({ data: { quoteId: id } });
      window.open(r.signedUrl, "_blank");
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); }
  }
  async function handleDuplicate() {
    setBusy("dup");
    try {
      const r = await dup({ data: { quoteId: id } });
      toast.success("Ponuka duplikovaná");
      navigate({ to: "/ponuky/$id", params: { id: r.quote_id } });
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); }
    finally { setBusy(null); }
  }
  async function handleConvert() {
    if (!confirm("Konvertovať ponuku na faktúru?")) return;
    setBusy("conv");
    try {
      const r = await convert({ data: { quoteId: id } });
      toast.success(r.already ? "Ponuka už bola konvertovaná" : "Faktúra vytvorená");
      navigate({ to: "/faktury/$id", params: { id: r.invoice_id } });
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); }
    finally { setBusy(null); }
  }
  function openEmail() {
    if (!q.customer_email) return toast.error("Odberateľ nemá e-mail. Doplňte ho v karte odberateľa.");
    setEmailForm({
      recipient_email: q.customer_email,
      subject: `Cenová ponuka ${q.quote_number}`,
      message: `Dobrý deň,\n\nv prílohe Vám posielame cenovú ponuku ${q.quote_number} platnú do ${q.valid_until}.\n\nS pozdravom,\n${company?.name ?? ""}`,
    });
    setEmailOpen(true);
  }
  async function submitEmail() {
    setBusy("mail");
    try {
      await send({ data: { quoteId: id, ...emailForm } });
      toast.success("E-mail odoslaný");
      setEmailOpen(false); load();
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); }
    finally { setBusy(null); }
  }

  if (!q) return <PageBody>Načítavam…</PageBody>;

  const converted = q.status === "converted";

  return (
    <>
      <PageHeader
        title={`Ponuka ${q.quote_number}`}
        description={`Vystavená ${q.issue_date} · platná do ${q.valid_until}`}
        action={
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLS[q.status] ?? "bg-muted"}`}>
              {STATUS_LABEL[q.status] ?? q.status}
            </span>
            <button onClick={openEmail} disabled={converted} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              <Mail className="h-4 w-4" /> Poslať e-mailom
            </button>
            {!q.pdf_url ? (
              <button onClick={handleGenerate} disabled={pdfBusy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                <FileText className="h-4 w-4" /> {pdfBusy ? "Generujem…" : "Vygenerovať PDF"}
              </button>
            ) : (
              <>
                <button onClick={handleDownload} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
                  <Download className="h-4 w-4" /> Stiahnuť PDF
                </button>
                <button onClick={handleGenerate} disabled={pdfBusy} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50">
                  <RefreshCw className="h-4 w-4" /> {pdfBusy ? "…" : "Pregenerovať"}
                </button>
              </>
            )}
            <button onClick={handleDuplicate} disabled={busy === "dup"} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50">
              <Copy className="h-4 w-4" /> Duplikovať
            </button>
            <button onClick={handleConvert} disabled={converted || busy === "conv"} className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50">
              <ArrowRightLeft className="h-4 w-4" /> {converted ? "Konvertovaná" : "Konvertovať na faktúru"}
            </button>
            {!converted && q.status !== "accepted" && (
              <button onClick={() => setStatus("accepted")} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">
                <CheckCircle2 className="h-4 w-4" /> Akceptovaná
              </button>
            )}
            {!converted && q.status !== "rejected" && (
              <button onClick={() => setStatus("rejected")} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10">
                <XCircle className="h-4 w-4" /> Zamietnutá
              </button>
            )}
            <Link to="/ponuky" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">Späť</Link>
          </div>
        }
      />
      <PageBody>
        {converted && q.converted_invoice_id && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm">
            <span>Táto ponuka bola konvertovaná na faktúru.</span>
            <Link to="/faktury/$id" params={{ id: q.converted_invoice_id }} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
              Otvoriť faktúru →
            </Link>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <div className="grid gap-6 rounded-xl border border-border bg-card p-6 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Dodávateľ</div>
                <div className="mt-1 font-medium">{company?.name}</div>
                <div className="text-sm text-muted-foreground">{company?.street}<br />{company?.zip} {company?.city}, {company?.country}</div>
                <div className="mt-2 text-sm">IČO: {company?.ico ?? "—"} · DIČ: {company?.dic ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Odberateľ</div>
                <div className="mt-1 font-medium">{q.customer_name}</div>
                <div className="text-sm text-muted-foreground">{q.customer_street}<br />{q.customer_zip} {q.customer_city}, {q.customer_country}</div>
                <div className="mt-2 text-sm">IČO: {q.customer_ico ?? "—"} · DIČ: {q.customer_dic ?? "—"}</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="p-3">Položka</th><th className="p-3 text-right">Mn.</th><th className="p-3">MJ</th><th className="p-3 text-right">Cena</th><th className="p-3 text-right">DPH</th><th className="p-3 text-right">Spolu</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Žiadne položky.</td></tr>}
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

            {q.notes && <div className="rounded-xl border border-border bg-card p-5 text-sm whitespace-pre-wrap">{q.notes}</div>}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Sumár</div>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Bez DPH</span><span>{Number(q.subtotal).toFixed(2)} {q.currency}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">DPH</span><span>{Number(q.vat_total).toFixed(2)} {q.currency}</span></div>
              </div>
              <div className="mt-3 border-t border-border pt-3 text-lg font-semibold">
                {Number(q.total).toFixed(2)} {q.currency}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Údaje</div>
              <div className="mt-2">Číslo: <span className="font-mono">{q.quote_number}</span></div>
              <div>Mena: {q.currency}</div>
              <div>Platnosť do: {q.valid_until}</div>
            </div>
          </aside>
        </div>
      </PageBody>

      {emailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-card p-5">
            <h3 className="text-lg font-semibold">Odoslať ponuku e-mailom</h3>
            <label className="block text-sm"><span className="font-medium">Príjemca</span>
              <input value={emailForm.recipient_email} onChange={(e) => setEmailForm({ ...emailForm, recipient_email: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm"><span className="font-medium">Predmet</span>
              <input value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm"><span className="font-medium">Správa</span>
              <textarea rows={6} value={emailForm.message} onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <p className="text-xs text-muted-foreground">PDF ponuky sa pripojí automaticky.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEmailOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary">Zrušiť</button>
              <button onClick={submitEmail} disabled={busy === "mail"} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{busy === "mail" ? "Odosielam…" : "Odoslať"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
