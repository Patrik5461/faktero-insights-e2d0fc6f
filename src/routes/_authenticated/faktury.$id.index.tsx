import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { PrilohyFaktury } from "@/components/faktero/PrilohyFaktury";
import { Oprava25aPanel } from "@/components/faktero/Oprava25aPanel";
import { ZauctovanieVystavenejPanel } from "@/components/faktero/ZauctovanieVystavenejPanel";
import { TlacidloZauctovat } from "@/components/faktero/TlacidloZauctovat";
import { SchvalovaniePanel } from "@/components/faktero/SchvalovaniePanel";
import { KomentarePanel } from "@/components/faktero/KomentarePanel";
import { PredlzitSplatnost } from "@/components/faktero/PredlzitSplatnost";
import { popisSplatnosti, predlzena } from "@/lib/faktero/splatnost";
import { useEfakturaTestovaciRezim } from "@/components/faktero/EfakturaTestovaciRezim";
import { StatusBadge } from "./dashboard";
import { toast } from "sonner";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useServerFn } from "@tanstack/react-start";
import { generateInvoicePdf, getInvoicePdfSignedUrl } from "@/lib/faktero/pdf.functions";
import { sendInvoiceEmailFn, triggerEventFn } from "@/lib/faktero/email.functions";
import { exportInvoicesFn } from "@/lib/faktero/export.functions";
import { vystavDokladKPlatbeFn } from "@/lib/faktero/doklad-k-platbe.functions";
import {
  Download,
  FileText,
  RefreshCw,
  Mail,
  FileCode2,
  Trash2,
  Pencil,
  FileCheck2,
  CreditCard,
  Copy,
  RotateCw,
  Send,
  CheckCircle2,
  XCircle,
  Clock as ClockIcon,
  MoreHorizontal,
  Ban,
  AlertTriangle,
  Undo2,
  Plus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { requestInvoiceApproval } from "@/lib/faktero/invoice-approval.functions";
import { ConfirmDialog } from "@/components/faktero/ListControls";
import {
  generateEfakturaXmlFn,
  getEfakturaXmlUrlFn,
  getInvoiceEfakturaDocFn,
  posliEfakturuFn,
} from "@/lib/faktero/efaktura/efaktura.functions";
import {
  deriveEfakturaUiStatus,
  EfakturaStatusBadge,
} from "@/components/faktero/EfakturaStatusBadge";
import { useQuery } from "@tanstack/react-query";
import { friendlyError } from "@/lib/faktero/plan-error";
import { maZuctovanuZalohu, zostavaUhradit } from "@/lib/faktero/zaloha";
import { createInvoicePaymentLink, syncInvoicePayment } from "@/lib/faktero/payments.functions";
import { paymentMethodLabel } from "@/lib/faktero/payment-method";
import { adresaRiadky } from "@/lib/faktero/adresa";
import { cloneInvoiceFn } from "@/lib/faktero/invoice-clone.functions";
import { sendReminderFn, previewReminderFn } from "@/lib/faktero/reminders.functions";

import { isdocFakturyFn } from "@/lib/faktero/isdoc.functions";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { VyberUctu } from "@/components/faktero/banka/VyberUctu";
import { formatujIban, sUctomFaktury } from "@/lib/faktero/platobny-ucet";
/** Ako sa doklad volá — rovnako v hlavičke stránky aj v PDF. */
const NAZOV_TYPU: Record<string, string> = {
  proforma: "Zálohová faktúra",
  credit_note: "Dobropis",
  debit_note: "Ťarchopis",
  advance_payment: "Daňový doklad k platbe",
  regular: "Faktúra",
};

export const Route = createFileRoute("/_authenticated/faktury/$id/")({
  head: () => ({ meta: [{ title: "Detail faktúry — Faktero" }] }),
  component: InvoiceDetail,
});

function InvoiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState<any>(null);
  // Bez tohto ostal na neexistujúcej faktúre navždy nápis „Načítavam…".
  const [nenajdene, setNenajdene] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [stockMoves, setStockMoves] = useState<any[]>([]);
  const [warehouseNames, setWarehouseNames] = useState<Record<string, string>>({});
  const [stockSkus, setStockSkus] = useState<Record<string, string>>({});
  const [zakazka, setZakazka] = useState<any>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  /* Koľko príloh doklad má — podľa toho sa v maile ponúkne, či ich priložiť. */
  const [pocetPriloh, setPocetPriloh] = useState(0);
  const [posielatPrilohy, setPosielatPrilohy] = useState(true);
  const [reminderOpen, setReminderOpen] = useState(false);
  useZatvorNaEscape(emailOpen ? () => setEmailOpen(false) : null);
  useZatvorNaEscape(reminderOpen ? () => setReminderOpen(false) : null);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderForm, setReminderForm] = useState({
    reminderNumber: 1 as 1 | 2 | 3,
    recipient_email: "",
    subject: "",
    message: "",
  });
  const [reminders, setReminders] = useState<any[]>([]);
  const sendReminder = useServerFn(sendReminderFn);
  const previewReminder = useServerFn(previewReminderFn);

  const [emailBusy, setEmailBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [emailForm, setEmailForm] = useState({ recipient_email: "", subject: "", message: "" });
  const genPdf = useServerFn(generateInvoicePdf);
  const getPdf = useServerFn(getInvoicePdfSignedUrl);
  const sendEmail = useServerFn(sendInvoiceEmailFn);
  const triggerEvt = useServerFn(triggerEventFn);
  const exportFn = useServerFn(exportInvoicesFn);
  const cloneFn = useServerFn(cloneInvoiceFn);
  const [exportBusy, setExportBusy] = useState(false);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payLink, setPayLink] = useState<string | null>(null);
  const createPayLink = useServerFn(createInvoicePaymentLink);
  const [syncBusy, setSyncBusy] = useState(false);
  const syncPayFn = useServerFn(syncInvoicePayment);
  const [hasPayLink, setHasPayLink] = useState(false);
  const [settledIn, setSettledIn] = useState<any | null>(null); // for proforma: invoice that consumed it
  const [advanceProforma, setAdvanceProforma] = useState<any | null>(null); // for regular: linked proforma
  /* Všetky zálohy odpočítané na tejto faktúre — pri etapovej dodávke ich je viac. */
  const [odpocitaneZalohy, setOdpocitaneZalohy] = useState<any[]>([]);
  /* Daňový doklad k prijatej platbe, ak už k tejto zálohe existuje. */
  const [dokladKPlatbe, setDokladKPlatbe] = useState<any | null>(null);
  const [vystavujemDoklad, setVystavujemDoklad] = useState(false);
  const vystavDokladFn = useServerFn(vystavDokladKPlatbeFn);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const requestApprovalFn = useServerFn(requestInvoiceApproval);

  async function handleRequestApproval() {
    if (!inv) return;
    const suggested = inv.customer_email ?? "";
    const email = window.prompt("Email zákazníka pre schválenie:", suggested);
    if (!email) return;
    setApprovalBusy(true);
    try {
      await requestApprovalFn({ data: { invoiceId: inv.id, recipientEmail: email.trim() } });
      toast.success("Žiadosť o schválenie bola odoslaná.");
      load();
    } catch (e: any) {
      toast.error(friendlyError(e, "Nepodarilo sa odoslať žiadosť."));
    } finally {
      setApprovalBusy(false);
    }
  }

  async function handleCreatePayLink() {
    if (!inv?.company_id) return;
    setPayBusy(true);
    try {
      const r = await createPayLink({ data: { companyId: inv.company_id, invoiceId: id } });
      const url = `${window.location.origin}/pay/${r.token}`;
      setPayLink(url);
      setHasPayLink(true);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* ignore */
      }
      toast.success(
        r.reused
          ? "Platobný odkaz skopírovaný."
          : "Platobný odkaz bol vytvorený. PDF bude pri ďalšom stiahnutí pregenerované.",
      );
      load();
    } catch (e: any) {
      toast.error(friendlyError(e) ?? e.message);
    } finally {
      setPayBusy(false);
    }
  }

  async function handleSyncPayment() {
    if (!inv?.company_id) return;
    setSyncBusy(true);
    try {
      const r = await syncPayFn({ data: { companyId: inv.company_id, invoiceId: id } });
      if (r.paid) toast.success("Platba prebehla. Faktúra označená ako uhradená.");
      else toast.success(`Stav platby: ${r.state || "neznámy"}`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Synchronizácia zlyhala.");
    } finally {
      setSyncBusy(false);
    }
  }
  const genXml = useServerFn(generateEfakturaXmlFn);
  const posliEfakturu = useServerFn(posliEfakturuFn);
  const [efakturaBusy, setEfakturaBusy] = useState(false);
  const efakturaTest = useEfakturaTestovaciRezim();

  /**
   * Odoslanie faktúry cez Peppol.
   *
   * XML sa v prípade potreby vygeneruje samo — človek, ktorý chce faktúru
   * poslať, nemá dôvod vedieť, že najprv musí kliknúť na „Vygenerovať".
   */
  async function handleSendEfaktura() {
    if (!inv?.company_id) return;
    /* V testovacom režime doklad do siete Peppol nejde — potvrdenie aj hláška
       to musia povedať, inak človek verí, že odberateľ faktúru dostal. */
    const otazka = efakturaTest
      ? `eFaktúra beží v TESTOVACOM režime.\n\nFaktúra ${inv.invoice_number ?? ""} odíde len do skúšobného prostredia — odberateľovi nepríde nič. Pošlite mu ju aj e-mailom.\n\nPokračovať v skúšobnom odoslaní?`
      : `Odoslať faktúru ${inv.invoice_number ?? ""} cez eFaktúru?\n\nOdíde odberateľovi cez sieť Peppol a odoslanie sa nedá vziať späť.`;
    if (!window.confirm(otazka)) return;
    setEfakturaBusy(true);
    try {
      const r: any = await posliEfakturu({ data: { company_id: inv.company_id, invoice_id: id } });
      if (efakturaTest) {
        toast.warning("Odoslané len do testovacieho prostredia — odberateľovi nepríde.", {
          duration: 10000,
        });
      } else {
        toast.success(`Odoslané cez eFaktúru — stav ${r.status}.`);
      }
      efakturaQuery.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEfakturaBusy(false);
    }
  }
  const getXml = useServerFn(getEfakturaXmlUrlFn);
  const getDocFn = useServerFn(getInvoiceEfakturaDocFn);
  const [xmlBusy, setXmlBusy] = useState(false);
  const [isdocBusy, setIsdocBusy] = useState(false);
  const stiahniIsdoc = useServerFn(isdocFakturyFn);
  const krajina = useKrajinaDane();
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

  /*
    ISDOC je český národný formát a voči štátu je v Česku povinný od 2016.
    Ponúka sa preto len českej firme — slovenskej by len pribudla položka,
    ktorú nikdy nepoužije.
  */
  async function handleIsdoc() {
    if (!inv?.company_id) return;
    setIsdocBusy(true);
    try {
      const r: any = await stiahniIsdoc({ data: { company_id: inv.company_id, invoice_id: id } });
      /*
        Nie `triggerBrowserDownload`: tá otvára okno a spolieha sa na to, že
        hlavičku `Content-Disposition` pošle úložisko. Pri blobe žiadny server
        nie je, takže by sa XML len zobrazilo v novej karte a názov súboru by
        sa stratil. Meno prílohy vie povedať jedine atribút `download`.
      */
      const blob = new Blob([r.xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nazovSuboru;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Adresa blobu drží súbor v pamäti, kým sa neuvoľní.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIsdocBusy(false);
    }
  }

  async function vystavDoklad() {
    if (!inv) return;
    setVystavujemDoklad(true);
    try {
      const doklad: any = await vystavDokladFn({
        data: {
          proforma_id: inv.id,
          // Deň prijatia platby — podľa neho vzniká daňová povinnosť.
          datum_platby: (inv.paid_at ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
        },
      });
      toast.success(`Vystavený doklad ${doklad.invoice_number}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Doklad sa nepodarilo vystaviť.");
    } finally {
      setVystavujemDoklad(false);
    }
  }

  async function load() {
    const { data } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
    setNenajdene(!data);
    setInv(data);
    if (data?.job_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id, job_number, name")
        .eq("id", data.job_id)
        .maybeSingle();
      setZakazka(job);
    } else {
      setZakazka(null);
    }
    if (data) {
      const [{ data: its }, { data: comp }] = await Promise.all([
        supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
        supabase.from("companies").select("*").eq("id", data.company_id).single(),
      ]);
      setItems(its ?? []);
      setCompany(comp);
      // Check if a payment link exists for this invoice (drives the "Synchronizovať platbu" button)
      const { data: anyLink } = await supabase
        .from("invoice_payment_links")
        .select("id")
        .eq("invoice_id", id)
        .limit(1)
        .maybeSingle();
      setHasPayLink(!!anyLink);
      // Load stock impact (movements referencing this invoice)
      const { data: mv } = await supabase
        .from("stock_movements")
        .select("id, type, quantity, warehouse_id, stock_item_id, created_at, note")
        .eq("reference_type", "invoice")
        .eq("reference_id", id)
        .order("created_at");
      setStockMoves(mv ?? []);
      if (mv?.length) {
        const whIds = Array.from(new Set(mv.map((m: any) => m.warehouse_id)));
        const siIds = Array.from(new Set(mv.map((m: any) => m.stock_item_id)));
        const [{ data: whs }, { data: sis }] = await Promise.all([
          supabase.from("warehouses").select("id, name").in("id", whIds),
          supabase.from("stock_items").select("id, sku").in("id", siIds),
        ]);
        const wm: Record<string, string> = {};
        (whs ?? []).forEach((w: any) => {
          wm[w.id] = w.name;
        });
        const sm: Record<string, string> = {};
        (sis ?? []).forEach((s: any) => {
          sm[s.id] = s.sku ?? s.id.slice(0, 6);
        });
        setWarehouseNames(wm);
        setStockSkus(sm);
      } else {
        setWarehouseNames({});
        setStockSkus({});
      }
      // Advance linkage
      if (data.type === "proforma") {
        /*
          Na zálohu sa vie odvolávať aj daňový doklad k prijatej platbe, nie
          len vyúčtovanie — preto sa zúčtovanie hľadá výslovne medzi bežnými
          faktúrami, inak by sa tu ukázal doklad k platbe ako „zúčtovaná".
        */
        const [{ data: consumer }, { data: ddp }] = await Promise.all([
          supabase
            .from("invoices")
            .select("id, invoice_number, status, issue_date, total, currency, type")
            .eq("advance_invoice_id", data.id)
            .eq("type", "regular")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("invoices")
            .select("id, invoice_number, issue_date, total, currency")
            .eq("advance_invoice_id", data.id)
            .eq("type", "advance_payment")
            .is("deleted_at", null)
            .maybeSingle(),
        ]);
        setSettledIn(consumer ?? null);
        setDokladKPlatbe(ddp ?? null);
        setAdvanceProforma(null);
        setDokladKPlatbe(null);
      } else {
        const { data: odpocty } = await supabase
          .from("invoice_advances")
          .select("advance_invoice_id, amount")
          .eq("invoice_id", data.id);
        if (odpocty?.length) {
          const { data: zalohy } = await supabase
            .from("invoices")
            .select("id, invoice_number, issue_date, currency")
            .in(
              "id",
              odpocty.map((o: any) => o.advance_invoice_id),
            );
          setOdpocitaneZalohy(
            odpocty.map((o: any) => ({
              ...o,
              zaloha: (zalohy ?? []).find((z: any) => z.id === o.advance_invoice_id) ?? null,
            })),
          );
        } else {
          setOdpocitaneZalohy([]);
        }
        setAdvanceProforma(null);
        setSettledIn(null);
      }
      const { data: rems } = await supabase
        .from("invoice_reminders")
        .select("id, reminder_number, sent_at, status, email_to, triggered_by")
        .eq("invoice_id", id)
        .order("sent_at", { ascending: false });
      setReminders(rems ?? []);
    }
  }

  async function openReminder() {
    try {
      const sentSet = new Set(
        reminders.filter((r) => r.status === "sent").map((r) => r.reminder_number),
      );
      let next: 1 | 2 | 3 = 1;
      if (sentSet.has(1)) next = 2;
      if (sentSet.has(2)) next = 3;
      const preview = await previewReminder({ data: { invoiceId: id, reminderNumber: next } });
      setReminderForm({
        reminderNumber: next,
        recipient_email: preview.recipient_email ?? "",
        subject: preview.subject,
        message: preview.message,
      });
      setReminderOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa načítať upomienku");
    }
  }

  async function submitReminder() {
    setReminderBusy(true);
    try {
      await sendReminder({
        data: {
          invoiceId: id,
          reminderNumber: reminderForm.reminderNumber,
          recipient_email: reminderForm.recipient_email,
          subject: reminderForm.subject,
          message: reminderForm.message,
        },
      });
      toast.success("Upomienka odoslaná");
      setReminderOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Odoslanie upomienky zlyhalo");
    } finally {
      setReminderBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handleDelete() {
    setDeleteBusy(true);
    try {
      const { error } = await supabase
        .from("invoices")
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
    if (status === "paid" && inv?.status === "cancelled")
      return toast.error("Stornovanú faktúru nemožno označiť ako uhradenú.");
    if (status === "cancelled" && inv?.status === "paid") {
      if (!confirm("Faktúra je uhradená. Naozaj ju chcete stornovať?")) return;
    }
    const patch: any = { status };
    if (status === "paid") patch.paid_at = new Date().toISOString();
    if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
    if (status === "sent") patch.sent_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(patch).eq("id", id);
    if (error) return toast.error(friendlyError(error, error.message));
    toast.success(
      status === "issued"
        ? `Faktúra ${inv?.invoice_number ?? ""} je vystavená.`
        : "Stav aktualizovaný",
    );
    // Trigger webhook
    const event =
      status === "paid"
        ? "invoice.paid"
        : status === "cancelled"
          ? "invoice.cancelled"
          : status === "sent"
            ? "invoice.sent"
            : null;
    if (event && inv?.company_id) {
      try {
        await triggerEvt({
          data: {
            companyId: inv.company_id,
            event: event as any,
            data: {
              invoice_id: inv.id,
              invoice_number: inv.invoice_number,
              status,
              total: Number(inv.total),
              currency: inv.currency,
              external_id: inv.external_id ?? null,
            },
          },
        });
      } catch (e) {
        console.warn("[webhook] invoice.* trigger zlyhal", e);
      }
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
      const r = await exportFn({
        data: { companyId: inv.company_id, invoiceIds: [inv.id], format: "pohoda_xml" },
      });
      const blob = new Blob([r.content], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Pohoda XML stiahnuté");
    } catch (e: any) {
      toast.error(e?.message ?? "Export zlyhal");
    } finally {
      setExportBusy(false);
    }
  }

  async function handleClone() {
    setCloneBusy(true);
    try {
      const r = await cloneFn({ data: { invoiceId: id } });
      toast.success("Faktúra bola skopírovaná");
      navigate({ to: "/faktury/$id/upravit", params: { id: r.id } });
    } catch (e: any) {
      toast.error(friendlyError(e, e?.message ?? "Klonovanie zlyhalo"));
    } finally {
      setCloneBusy(false);
    }
  }

  if (nenajdene)
    return (
      <PageBody>
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm">
          <p>Táto faktúra v aktívnej firme neexistuje.</p>
          <p className="mt-1 text-muted-foreground">
            Ak patrí inej vašej firme, prepnite sa na ňu hore v lište.
          </p>
          <Link to="/faktury" className="mt-4 inline-block text-primary underline">
            Späť na faktúry
          </Link>
        </div>
      </PageBody>
    );
  if (!inv) return <PageBody>Načítavam…</PageBody>;

  const isOverdue =
    inv.status !== "paid" &&
    inv.status !== "cancelled" &&
    !!inv.due_date &&
    new Date(inv.due_date) < new Date(new Date().toDateString());

  /*
   * Adresát: doklad si údaje odberateľa odkladá v okamihu vystavenia, takže
   * faktúra vystavená pred doplnením e-mailu ho v sebe nemá. Dovtedy sa
   * odoslanie odmietalo hláškou „doplňte e-mail v karte odberateľa" — aj
   * potom, ako ho tam človek doplnil. Preto sa dopýta aktuálna karta a keď ani
   * tá adresu nemá, dialóg sa otvorí prázdny a adresa sa dá napísať ručne.
   */
  async function openEmail() {
    let adresa = inv.customer_email as string | null;
    if (!adresa && inv.customer_id) {
      const { data } = await supabase
        .from("customers")
        .select("email")
        .eq("id", inv.customer_id)
        .maybeSingle();
      adresa = (data?.email as string | null) ?? null;
    }
    setEmailForm({
      recipient_email: adresa ?? "",
      subject: (company?.email_default_subject ?? "Faktúra {invoice_number}").replaceAll(
        "{invoice_number}",
        inv.invoice_number,
      ),
      message: (company?.email_default_message ?? "V prílohe posielame faktúru {invoice_number}.")
        .replaceAll("{invoice_number}", inv.invoice_number)
        .replaceAll("{due_date}", inv.due_date)
        .replaceAll("{total}", `${Number(inv.total).toFixed(2)} ${inv.currency}`)
        .replaceAll("{company_name}", company?.name ?? ""),
    });
    setEmailOpen(true);
  }
  async function submitEmail() {
    if (!emailForm.recipient_email.trim()) {
      toast.error("Zadajte adresu príjemcu.");
      return;
    }
    setEmailBusy(true);
    try {
      const odoslane = await sendEmail({
        data: {
          invoiceId: inv.id,
          recipient_email: emailForm.recipient_email,
          subject: emailForm.subject,
          message: emailForm.message,
          s_prilohami: pocetPriloh > 0 && posielatPrilohy,
        },
      });
      toast.success("E-mail odoslaný");
      if (odoslane?.vynechane?.length) {
        /* Mail odišiel, ale nie celý — to sa musí povedať nahlas. */
        toast.warning(`Do mailu sa nezmestili: ${odoslane.vynechane.join(", ")}`, {
          duration: 12000,
        });
      }
      setEmailOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Odoslanie zlyhalo");
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={`${inv.oprava_25a ? "Opravný doklad (§ 25a)" : (NAZOV_TYPU[inv.type as string] ?? "Faktúra")} ${inv.invoice_number}`}
        description={`Vystavená ${inv.issue_date} · splatná ${popisSplatnosti(inv)}${predlzena(inv) && inv.predlzenie_poznamka ? ` — ${inv.predlzenie_poznamka}` : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={inv.status} />
            {inv.approval_status === "pending" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-400">
                <ClockIcon className="h-3 w-3" /> Čaká na schválenie
              </span>
            )}
            {inv.approval_status === "approved" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Schválené
              </span>
            )}
            {inv.approval_status === "rejected" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-500/15 dark:text-red-400">
                <XCircle className="h-3 w-3" /> Zamietnuté
              </span>
            )}

            {/* Primárne akcie */}
            <button
              onClick={openEmail}
              disabled={inv.status === "cancelled"}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Mail className="h-4 w-4" /> Odoslať emailom
            </button>
            <button
              onClick={inv.pdf_url ? handleDownload : handleGenerate}
              disabled={pdfBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
            >
              {inv.pdf_url ? <Download className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              {pdfBusy ? "…" : inv.pdf_url ? "Stiahnuť PDF" : "Vygenerovať PDF"}
            </button>
            {/*
              Upraviť sa dá aj vystavená a odoslaná faktúra — formulár to vždy
              vedel, chýbalo len tlačidlo, takže sa k oprave nedalo dostať.
              Stornovaná faktúra sa už len archivuje, preto pri nej tlačidlo nie je.
            */}
            {inv.status !== "cancelled" && (
              <Link
                to="/faktury/$id/upravit"
                params={{ id }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary"
              >
                <Pencil className="h-4 w-4" />
                {inv.status === "draft" ? "Upraviť" : "Opraviť faktúru"}
              </Link>
            )}
            {inv.status !== "cancelled" && (
              <TlacidloZauctovat zauctovane={Boolean(inv.zauctovane_at)} />
            )}
            {/* Dobropis sa vystavuje k bežnej vystavenej faktúre; formulár si
                odberateľa, väzbu aj položky (so záporným množstvom) predvyplní. */}
            {inv.type === "regular" && inv.status !== "draft" && inv.status !== "cancelled" && (
              <Link
                to="/faktury/nova"
                search={{ type: "credit_note", opravuje: id } as any}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary"
              >
                <Undo2 className="h-4 w-4" />
                Vystaviť dobropis
              </Link>
            )}
            {/* Ťarchopis — dodatočné zvýšenie ceny k tej istej faktúre (§ 25). */}
            {inv.type === "regular" && inv.status !== "draft" && inv.status !== "cancelled" && (
              <Link
                to="/faktury/nova"
                search={{ type: "debit_note", opravuje: id } as any}
                title="Dodatočné zvýšenie ceny k tejto faktúre — opravná faktúra so zvýšením základu dane"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary"
              >
                <Plus className="h-4 w-4" />
                Vystaviť ťarchopis
              </Link>
            )}

            {/* Ďalšie akcie */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-sm hover:bg-secondary"
                  aria-label="Ďalšie akcie"
                  title="Ďalšie akcie"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Stav faktúry</DropdownMenuLabel>
                {inv.status !== "sent" && inv.status !== "paid" && (
                  <DropdownMenuItem
                    onClick={() => setStatus("sent")}
                    title="Použite, ak ste faktúru odoslali mimo Faktera (poštou, osobne). Po odoslaní emailom sa stav nastaví automaticky."
                  >
                    <Send className="mr-2 h-4 w-4" /> Odoslané iným spôsobom
                  </DropdownMenuItem>
                )}
                {inv.status !== "paid" && (
                  <DropdownMenuItem onClick={() => setStatus("paid")}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Označiť ako uhradenú
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleGenerate} disabled={pdfBusy}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Pregenerovať PDF
                </DropdownMenuItem>
                {inv.status !== "cancelled" && (
                  <DropdownMenuItem
                    onClick={() => setStatus("cancelled")}
                    className="text-destructive focus:text-destructive"
                  >
                    <Ban className="mr-2 h-4 w-4" /> Stornovať
                  </DropdownMenuItem>
                )}

                {(inv.status === "draft" || inv.status === "issued") &&
                  inv.approval_status !== "approved" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Schvaľovanie</DropdownMenuLabel>
                      <DropdownMenuItem onClick={handleRequestApproval} disabled={approvalBusy}>
                        <Send className="mr-2 h-4 w-4" />
                        {inv.approval_status === "pending"
                          ? "Poslať znova na schválenie"
                          : "Poslať na schválenie"}
                      </DropdownMenuItem>
                    </>
                  )}

                {isOverdue && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Upomienky</DropdownMenuLabel>
                    <DropdownMenuItem onClick={openReminder}>
                      <Mail className="mr-2 h-4 w-4" /> Poslať upomienku
                    </DropdownMenuItem>
                  </>
                )}

                {company?.online_payments_enabled &&
                  inv.status !== "paid" &&
                  inv.status !== "cancelled" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Online platba</DropdownMenuLabel>
                      <DropdownMenuItem onClick={handleCreatePayLink} disabled={payBusy}>
                        <CreditCard className="mr-2 h-4 w-4" /> Vytvoriť platobný odkaz
                      </DropdownMenuItem>
                      {hasPayLink && (
                        <DropdownMenuItem onClick={handleSyncPayment} disabled={syncBusy}>
                          <RotateCw className="mr-2 h-4 w-4" /> Synchronizovať platbu
                        </DropdownMenuItem>
                      )}
                    </>
                  )}

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Export</DropdownMenuLabel>
                <DropdownMenuItem onClick={handlePohodaExport} disabled={exportBusy}>
                  <FileCode2 className="mr-2 h-4 w-4" /> Export do Pohody XML
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleGenerateXml} disabled={xmlBusy}>
                  <FileCheck2 className="mr-2 h-4 w-4" />
                  {efakturaDoc ? "Pregenerovať eFaktúru XML" : "Vygenerovať eFaktúru XML"}
                </DropdownMenuItem>
                {efakturaDoc && (
                  <DropdownMenuItem onClick={handleDownloadXml} disabled={xmlBusy}>
                    <Download className="mr-2 h-4 w-4" /> Stiahnuť eFaktúru XML
                  </DropdownMenuItem>
                )}
                {krajina === "CZ" && (
                  <DropdownMenuItem onClick={handleIsdoc} disabled={isdocBusy}>
                    <Download className="mr-2 h-4 w-4" />
                    {isdocBusy ? "Pripravujem…" : "Stiahnuť ISDOC"}
                  </DropdownMenuItem>
                )}
                {/*
                  Odoslanie patrí sem, k faktúre — nie len do zoznamu odoslaných
                  eFaktúr. Ten je prázdny, kým sa XML nevygeneruje, takže tam
                  tlačidlo nemal kto nájsť.
                */}
                <DropdownMenuItem onClick={handleSendEfaktura} disabled={efakturaBusy}>
                  <Send className="mr-2 h-4 w-4" />
                  {efakturaBusy
                    ? "Odosielam…"
                    : efakturaTest
                      ? "Odoslať cez eFaktúru (test)"
                      : "Odoslať cez eFaktúru"}
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Ostatné</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleClone} disabled={cloneBusy}>
                  <Copy className="mr-2 h-4 w-4" /> Klonovať
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDeleteOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Vymazať
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          </div>
        }
      />
      <PageBody>
        {inv.status === "draft" && (
          /*
            Koncept (najčastejšie kópia inej faktúry) sa dal doteraz len upraviť
            a uložiť znova ako koncept — vystaviť sa nedal nikde. Ľudia ho preto
            mazali a faktúru písali nanovo.
          */
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            <span>
              <strong>Toto je koncept.</strong> Odberateľ ho nemá a do prehľadov sa nepočíta.
            </span>
            <span className="flex flex-wrap gap-2">
              <Link
                to="/faktury/$id/upravit"
                params={{ id }}
                className="rounded-md border border-border bg-background px-3 py-1.5 font-medium hover:bg-secondary"
              >
                Upraviť
              </Link>
              <button
                onClick={() => {
                  // Bez textu nad položkami faktúra nevznikne — ten sa doplní v úprave.
                  if (!String(inv.intro_note ?? "").trim()) {
                    toast.info("Doplňte text nad položkami a vystavte faktúru z úpravy.");
                    navigate({ to: "/faktury/$id/upravit", params: { id } });
                    return;
                  }
                  void setStatus("issued");
                }}
                className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:opacity-90"
              >
                Vystaviť faktúru
              </button>
            </span>
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">eFaktúra:</span>
          <EfakturaStatusBadge status={efakturaUi} />
          {efakturaTest && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-800 dark:text-amber-300">
              testovací režim — odberateľovi nič nepríde
            </span>
          )}
          {payLink && (
            <a
              href={payLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 hover:bg-secondary"
              title={payLink}
            >
              <Copy className="h-3 w-3" /> Otvoriť platobný odkaz
            </a>
          )}
        </div>
        {inv.approval_status === "rejected" && inv.approval_note && (
          <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <XCircle className="h-4 w-4" /> Faktúra bola zamietnutá zákazníkom
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {inv.approval_responded_at
                ? new Date(inv.approval_responded_at).toLocaleString("sk-SK")
                : ""}
            </div>
            <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Dôvod: </span>
              {inv.approval_note}
            </div>
          </div>
        )}
        {inv.approval_status === "pending" && inv.approval_requested_at && (
          <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/5 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-400">
              <ClockIcon className="h-4 w-4" /> Čaká sa na schválenie zákazníkom
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Odoslané {new Date(inv.approval_requested_at).toLocaleString("sk-SK")} · odkaz platí 7
              dní
            </div>
          </div>
        )}
        {/*
          Bez IBAN-u sa na faktúre nevykreslia platobné údaje ani QR platba —
          a doteraz sa to nikde nepovedalo. Doklad vyzeral hotovo a odberateľ
          nemal kam zaplatiť.
        */}
        {company && !sUctomFaktury(company, inv).iban && (
          <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/5 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" /> Faktúra nemá platobné údaje
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Firma nemá vyplnený IBAN, takže na doklade nebude číslo účtu ani QR platba.{" "}
              <Link to="/firma" className="font-medium text-primary hover:underline">
                Doplniť v nastaveniach firmy
              </Link>
            </div>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <div className="grid gap-6 rounded-xl border border-border bg-card p-6 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Dodávateľ
                </div>
                <div className="mt-1 font-medium">{company?.name}</div>
                <div className="text-sm text-muted-foreground">
                  {company?.street}
                  <br />
                  {company?.zip} {company?.city}, {company?.country}
                </div>
                <div className="mt-2 text-sm">
                  IČO: {company?.ico ?? "—"} · DIČ: {company?.dic ?? "—"}
                </div>
                {company?.ic_dph && <div className="text-sm">IČ DPH: {company.ic_dph}</div>}
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Odberateľ
                  {inv.status !== "cancelled" && (
                    <Link
                      to="/faktury/$id/upravit"
                      params={{ id }}
                      className="normal-case tracking-normal text-primary hover:underline print:hidden"
                    >
                      Zmeniť
                    </Link>
                  )}
                </div>
                <div className="mt-1 font-medium">{inv.customer_name}</div>
                {/* Prázdne časti adresy sa vynechajú — inak tam ostane holá čiarka. */}
                <div className="text-sm text-muted-foreground">
                  {adresaRiadky(
                    inv.customer_street,
                    inv.customer_zip,
                    inv.customer_city,
                    inv.customer_country,
                  ).map((r) => (
                    <div key={r}>{r}</div>
                  ))}
                </div>
                <div className="mt-2 text-sm">
                  IČO: {inv.customer_ico ?? "—"} · DIČ: {inv.customer_dic ?? "—"}
                </div>
              </div>
            </div>

            {inv.intro_note && (
              <div className="whitespace-pre-wrap rounded-xl border border-border bg-card p-5 text-sm">
                {inv.intro_note}
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">Položka</th>
                    <th className="p-3 text-right">Mn.</th>
                    <th className="p-3">MJ</th>
                    <th className="p-3 text-right">Cena</th>
                    <th className="p-3 text-right">DPH</th>
                    <th className="p-3 text-right">Spolu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td className="p-3">
                        <div className="font-medium">{it.name}</div>
                        {it.description && (
                          <div className="whitespace-pre-line text-xs text-muted-foreground">{it.description}</div>
                        )}
                        {Number((it as any).discount_percent ?? 0) > 0 && (
                          <div className="text-xs text-emerald-600">
                            Zľava {Number((it as any).discount_percent)} %
                          </div>
                        )}
                      </td>
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

            {inv.notes && (
              <div className="rounded-xl border border-border bg-card p-5 text-sm whitespace-pre-wrap">
                {inv.notes}
              </div>
            )}

            <PrilohyFaktury
              dokladId={inv.id}
              mozeMenit={inv.status !== "cancelled"}
              onZmena={setPocetPriloh}
            />

            {/* Zaúčtovanie patrí do širokého stĺpca — v bočnom (320 px) sa polia nezmestili. */}
            <ZauctovanieVystavenejPanel
              inv={inv}
              onZmena={() => void load()}
              onStiahnut={handlePohodaExport}
            />
          </div>

          <aside className="space-y-4">
            {zakazka && (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Zákazka</div>
                <Link
                  to="/zakazky/$id"
                  params={{ id: zakazka.id }}
                  className="mt-1 block text-sm text-primary hover:underline"
                >
                  {zakazka.job_number} — {zakazka.name}
                </Link>
              </div>
            )}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Sumár</div>
              <div className="mt-3 space-y-1 text-sm">
                {Number(inv.discount_total ?? 0) > 0 && (
                  <>
                    <Row
                      label="Medzisúčet"
                      value={`${(Number(inv.subtotal) + Number(inv.discount_total)).toFixed(2)} ${inv.currency}`}
                    />
                    <Row
                      label="Zľava"
                      value={`−${Number(inv.discount_total).toFixed(2)} ${inv.currency}`}
                    />
                  </>
                )}
                <Row label="Bez DPH" value={`${Number(inv.subtotal).toFixed(2)} ${inv.currency}`} />
                <Row label="DPH" value={`${Number(inv.vat_total).toFixed(2)} ${inv.currency}`} />
                {maZuctovanuZalohu(inv.advance_amount) && (
                  <>
                    <Row label="Spolu" value={`${Number(inv.total).toFixed(2)} ${inv.currency}`} />
                    <Row
                      label="Zúčtovaná záloha"
                      value={`−${Number(inv.advance_amount).toFixed(2)} ${inv.currency}`}
                    />
                  </>
                )}
              </div>
              <div className="mt-3 border-t border-border pt-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {inv.status === "paid" ? "Uhradené" : "Spolu k úhrade"}
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {zostavaUhradit(inv.total, inv.advance_amount).toFixed(2)} {inv.currency}
                </div>
              </div>
            </div>
            <Oprava25aPanel invoice={inv} />
            {inv.status !== "draft" && (
              <SchvalovaniePanel companyId={inv.company_id} agenda="vystavena" id={inv.id} onZmena={() => void load()} />
            )}
            <KomentarePanel companyId={inv.company_id} agenda="vystavena" id={inv.id} />
            {inv.status === "paid" ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100 dark:border-emerald-900/40">
                <div className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Uhradené
                </div>
                <div className="mt-2">
                  Dátum úhrady: {inv.paid_at ? String(inv.paid_at).slice(0, 10) : "—"}
                </div>
                <div>Forma úhrady: {paymentMethodLabel(inv.payment_method)}</div>
                <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                  Platobné údaje sa nezobrazujú — faktúra je zaplatená.
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-5 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Platba</div>
                <div className="mt-2">
                  IBAN:{" "}
                  <span className="font-mono">
                    {sUctomFaktury(company ?? {}, inv).iban
                      ? formatujIban(sUctomFaktury(company ?? {}, inv).iban)
                      : "—"}
                  </span>
                </div>
                {/* Iný účet aj na vystavenej faktúre — PDF a QR sa pregenerujú samé. */}
                {inv.status !== "cancelled" && (
                  <VyberUctu
                    className="mt-2"
                    predvyplnit={false}
                    companyId={inv.company_id}
                    value={inv.payment_account_id ?? null}
                    onChange={async (id) => {
                      if (id === inv.payment_account_id) return;
                      const { error } = await supabase
                        .from("invoices")
                        .update({ payment_account_id: id })
                        .eq("id", inv.id);
                      if (error) return toast.error(error.message);
                      toast.success("Účet na úhradu zmenený.");
                      void load();
                    }}
                  />
                )}
                <div>
                  Variabilný symbol: <span className="font-mono">{inv.variable_symbol}</span>
                </div>
                <div>Splatnosť: {popisSplatnosti(inv)}</div>
                {predlzena(inv) && (
                  <div className="text-xs text-muted-foreground">
                    Lehoty DPH (§ 25a) sa počítajú od pôvodnej splatnosti.
                    {inv.predlzenie_poznamka ? ` Dohoda: ${inv.predlzenie_poznamka}` : ""}
                  </div>
                )}
                <div className="my-2">
                  <PredlzitSplatnost druh="vydana" faktura={inv} onZmena={() => void load()} />
                </div>
                <div>Forma úhrady: {paymentMethodLabel(inv.payment_method)}</div>
                {/*
                  Bez IBAN-u nemá odberateľ kam zaplatiť a na doklade nie je ani
                  QR kód. Pri novej firme sa toto pole preskočí ľahko — register
                  ho nedopĺňa — a chyba sa ukáže až vtedy, keď peniaze neprídu.
                */}
                {!sUctomFaktury(company ?? {}, inv).iban && (
                  <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                    <div className="font-medium text-foreground">Chýba IBAN</div>
                    <p className="mt-0.5 text-muted-foreground">
                      Odberateľ nemá kam zaplatiť a na doklade nebude QR kód.
                    </p>
                    <Link
                      to="/firma"
                      className="mt-1 inline-block font-medium text-primary hover:underline"
                    >
                      Doplniť v údajoch firmy
                    </Link>
                  </div>
                )}
              </div>
            )}
            {inv.type === "proforma" && (
              <div className="rounded-xl border border-border bg-card p-5 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Zálohová faktúra
                </div>
                {settledIn ? (
                  <div className="mt-2 space-y-1">
                    <div className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                      Zúčtovaná
                    </div>
                    <div>
                      Zúčtovaná vo faktúre:{" "}
                      <Link
                        to="/faktury/$id"
                        params={{ id: settledIn.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {settledIn.invoice_number}
                      </Link>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {settledIn.issue_date} · {Number(settledIn.total).toFixed(2)}{" "}
                      {settledIn.currency}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-muted-foreground">
                    Zatiaľ nezúčtovaná. Zálohu môžete použiť pri vytváraní novej faktúry cez „Pridať
                    zálohovú faktúru".
                  </div>
                )}

                {/*
                  Daňová povinnosť vzniká prijatím platby, nie dodaním — platiteľ
                  DPH musí do 15 dní vystaviť doklad k tejto platbe. Preto je
                  ponuka priamo pri zálohovej faktúre, hneď ako je uhradená.
                */}
                <div className="mt-4 border-t border-border pt-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Daňový doklad k prijatej platbe
                  </div>
                  {dokladKPlatbe ? (
                    <div className="mt-2 space-y-1">
                      <Link
                        to="/faktury/$id"
                        params={{ id: dokladKPlatbe.id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {dokladKPlatbe.invoice_number}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {dokladKPlatbe.issue_date} · {Number(dokladKPlatbe.total).toFixed(2)}{" "}
                        {dokladKPlatbe.currency} · daň sa priznáva v tomto období
                      </div>
                    </div>
                  ) : inv.status === "paid" ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-muted-foreground">
                        Záloha je uhradená — ako platiteľ DPH musíte do 15 dní od prijatia platby
                        vystaviť daňový doklad. Daň sa prizná v období platby a na vyúčtovacej
                        faktúre sa už znovu nepočíta.
                      </p>
                      <button
                        type="button"
                        disabled={vystavujemDoklad}
                        onClick={vystavDoklad}
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                      >
                        {vystavujemDoklad ? "Vystavujem…" : "Vystaviť daňový doklad"}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-muted-foreground">
                      Vystaví sa až po úhrade zálohy — daňová povinnosť vzniká prijatím platby.
                    </p>
                  )}
                </div>
              </div>
            )}
            {odpocitaneZalohy.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {odpocitaneZalohy.length === 1 ? "Zúčtovaná záloha" : "Zúčtované zálohy"}
                </div>
                <ul className="mt-2 space-y-1">
                  {odpocitaneZalohy.map((o) => (
                    <li key={o.advance_invoice_id} className="flex flex-wrap items-baseline gap-2">
                      <Link
                        to="/faktury/$id"
                        params={{ id: o.advance_invoice_id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {o.zaloha?.invoice_number ?? "zálohová faktúra"}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {o.zaloha?.issue_date ?? ""} · odpočítané {Number(o.amount).toFixed(2)}{" "}
                        {o.zaloha?.currency ?? inv.currency}
                      </span>
                    </li>
                  ))}
                </ul>
                {odpocitaneZalohy.length > 1 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Spolu odpočítané{" "}
                    <strong>
                      {odpocitaneZalohy
                        .reduce((a: number, o: any) => a + Number(o.amount), 0)
                        .toFixed(2)}{" "}
                      {inv.currency}
                    </strong>
                  </div>
                )}
              </div>
            )}
            {advanceProforma && (
              <div className="rounded-xl border border-border bg-card p-5 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Zúčtovaná záloha
                </div>
                <div className="mt-2 space-y-1">
                  <div>
                    Zálohová faktúra:{" "}
                    <Link
                      to="/faktury/$id"
                      params={{ id: advanceProforma.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {advanceProforma.invoice_number}
                    </Link>
                  </div>
                  {inv.advance_amount != null && (
                    <div className="text-xs text-muted-foreground">
                      Odpočítaná suma: {Number(inv.advance_amount).toFixed(2)} {inv.currency}
                    </div>
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
                      <div
                        key={m.id}
                        className="flex items-start justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0"
                      >
                        <div>
                          <div className="font-medium">
                            {reversed ? "Sklad vrátený" : "Sklad odpočítaný"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {stockSkus[m.stock_item_id] ?? "—"} ·{" "}
                            {warehouseNames[m.warehouse_id] ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(m.created_at).toLocaleString("sk-SK")}
                          </div>
                        </div>
                        <div
                          className={`tabular-nums text-right font-semibold ${reversed ? "text-emerald-600" : "text-destructive"}`}
                        >
                          {reversed ? "+" : "−"}
                          {Math.abs(Number(m.quantity))}
                        </div>
                      </div>
                    );
                  })}
                  <Link
                    to="/sklad/pohyby"
                    className="block pt-1 text-xs text-primary hover:underline"
                  >
                    Pozrieť všetky pohyby →
                  </Link>
                </div>
              </div>
            )}
          </aside>
        </div>
      </PageBody>
      {emailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEmailOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Odoslať faktúru e-mailom"
            className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-card p-5 max-h-[calc(100dvh-2rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Odoslať faktúru e-mailom</h3>
            <label className="block text-sm">
              <span className="font-medium">Príjemca</span>
              <input
                type="email"
                value={emailForm.recipient_email}
                onChange={(e) => setEmailForm({ ...emailForm, recipient_email: e.target.value })}
                placeholder="odberatel@firma.sk"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              {!emailForm.recipient_email && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  Odberateľ nemá uloženú adresu — napíšte ju sem, alebo ju doplňte v jeho karte.
                </span>
              )}
            </label>
            <label className="block text-sm">
              <span className="font-medium">Predmet</span>
              <input
                value={emailForm.subject}
                onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Správa</span>
              <textarea
                rows={6}
                value={emailForm.message}
                onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            {pocetPriloh > 0 && (
              <label className="flex items-start gap-2 rounded-md border border-border bg-secondary/30 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={posielatPrilohy}
                  onChange={(e) => setPosielatPrilohy(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Odoslať aj prílohy dokladu</span>
                  <span className="block text-xs text-muted-foreground">
                    {pocetPriloh === 1
                      ? "K dokladu visí 1 príloha"
                      : `K dokladu visia prílohy: ${pocetPriloh}`}
                    . Pôjdu v tom istom maile ako faktúra.
                  </span>
                </span>
              </label>
            )}
            <p className="text-xs text-muted-foreground">
              PDF faktúry sa pripojí automaticky. Ak ešte neexistuje, vygeneruje sa pred odoslaním.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEmailOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
              >
                Zrušiť
              </button>
              <button
                onClick={submitEmail}
                disabled={emailBusy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {emailBusy ? "Odosielam…" : "Odoslať"}
              </button>
            </div>
          </div>
        </div>
      )}
      {reminderOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setReminderOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Poslať upomienku"
            className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-card p-5 max-h-[calc(100dvh-2rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">
              Poslať upomienku ({reminderForm.reminderNumber}.)
            </h3>
            <label className="block text-sm">
              <span className="font-medium">Príjemca</span>
              <input
                value={reminderForm.recipient_email}
                onChange={(e) =>
                  setReminderForm({ ...reminderForm, recipient_email: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Predmet</span>
              <input
                value={reminderForm.subject}
                onChange={(e) => setReminderForm({ ...reminderForm, subject: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Správa</span>
              <textarea
                rows={10}
                value={reminderForm.message}
                onChange={(e) => setReminderForm({ ...reminderForm, message: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            {reminders.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Predchádzajúce upomienky:{" "}
                {reminders
                  .map(
                    (r) =>
                      `#${r.reminder_number} (${new Date(r.sent_at).toLocaleDateString("sk-SK")})`,
                  )
                  .join(", ")}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setReminderOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
              >
                Zrušiť
              </button>
              <button
                onClick={submitReminder}
                disabled={reminderBusy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {reminderBusy ? "Odosielam…" : "Odoslať upomienku"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="Naozaj chcete vymazať túto faktúru?"
        message={`Faktúra ${inv.invoice_number} bude skrytá z rozhrania. Môžete ju neskôr obnoviť v zozname vymazaných.`}
        warning={
          inv.status === "paid" || inv.status === "sent"
            ? "Táto faktúra je už odoslaná alebo zaplatená. Mazanie môže narušiť účtovnú stopu."
            : undefined
        }
        busy={deleteBusy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
