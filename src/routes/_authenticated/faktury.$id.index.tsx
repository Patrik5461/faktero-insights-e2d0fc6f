import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useKlikNaRiadok } from "@/hooks/useKlikNaRiadok";
import { cn } from "@/lib/utils";
import { vsVystavenej } from "@/lib/faktero/variabilny-symbol";
import { RozpisDph } from "@/components/faktero/RozpisDph";
import { rozpisPodlaSadzieb } from "@/lib/faktero/rozpis-dph";
import { riadkySoZlavou } from "@/lib/faktero/zlavy";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { importDphNeplatitela } from "@/lib/faktero/dph-neplatitel-import";
import { NahladPdfOkno } from "@/components/faktero/NahladPdfOkno";
import { DetailSNahladom, useNahladVDetaile, type SuborNahladu } from "@/components/faktero/BocnyNahlad";
import { UdajePreUctovnika, type UdajeUctovnika } from "@/components/faktero/UdajePreUctovnika";
import { ZbaleneK } from "@/components/faktero/DetailDokladuKompaktny";
import { useDizajn } from "@/hooks/useDizajn";
import { VystavenaDetailKompaktna } from "@/components/faktero/VystavenaDetailKompaktna";
import { PlatbaZalohyDetail } from "@/components/faktero/PlatbaZalohy";
import { rezimDphVystavenej, stavZauctovania } from "@/lib/faktero/udaje-pre-uctovnika";
import { isAccountingDocument } from "@/lib/faktero/uctovny-doklad";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageBody } from "@/components/faktero/AppShell";
import {
  DocumentDetailHeader,
  MenuAkcia,
  MenuSkupina,
  MetaRiadok,
  PoTermine,
  SekundarnaAkcia,
  PrimarnaAkcia,
} from "@/components/faktero/DocumentDetailHeader";
import { PrilohyFaktury } from "@/components/faktero/PrilohyFaktury";
import { OdoslanieEfakturyOkno } from "@/components/faktero/OdoslanieEfakturyOkno";
import { useAktualnyDatum } from "@/components/faktero/AktualnyDatumOkno";
import { Oprava25aPanel } from "@/components/faktero/Oprava25aPanel";
import { ZauctovanieVystavenejPanel } from "@/components/faktero/ZauctovanieVystavenejPanel";
import { ZasielkovnaFaktury } from "@/components/faktero/ZasielkovnaFaktury";
import { skocNaZauctovanie } from "@/components/faktero/TlacidloZauctovat";
import { SchvalovaniePanel } from "@/components/faktero/SchvalovaniePanel";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { KomentarePanel } from "@/components/faktero/KomentarePanel";
import { KomentarDokladu, VyberStavuDokladu } from "@/components/faktero/StavDokladu";
import { StitkyDokladu } from "@/components/faktero/StitkyDokladu";
import { DokladPoradie } from "@/components/faktero/DokladPoradie";
import { useCiselnikyDokladov } from "@/hooks/useCiselnikyDokladov";
import { PredlzitSplatnost } from "@/components/faktero/PredlzitSplatnost";
import { popisSplatnosti, predlzena } from "@/lib/faktero/splatnost";
import { useEfakturaTestovaciRezim } from "@/components/faktero/EfakturaTestovaciRezim";
import { StatusBadge } from "./dashboard";
import { StavOdznak as StavWeb, TON_SCHVALOVANIA, TON_EFAKTURY } from "@/components/faktero/web/Stav";
import { ChybovyStav, NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { toast } from "sonner";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useServerFn } from "@tanstack/react-start";
import { generateInvoicePdf, getInvoicePdfSignedUrl } from "@/lib/faktero/pdf.functions";
import { sendInvoiceEmailFn, triggerEventFn } from "@/lib/faktero/email.functions";
import { exportInvoicesFn } from "@/lib/faktero/export.functions";
import { toastNeodovzdane } from "@/components/faktero/NeodovzdaneDoklady";
import { vystavDokladKPlatbeFn } from "@/lib/faktero/doklad-k-platbe.functions";
import { DokladKPlatbeOkno } from "@/components/faktero/DokladKPlatbeOkno";
import {
  Download,
  Receipt,
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
  RotateCcw,
  Send,
  CheckCircle2,
  XCircle,
  Clock as ClockIcon,
  BookCheck,
  Ban,
  AlertTriangle,
  Undo2,
  Plus,
  Eye,
  SendHorizontal,
} from "lucide-react";
import { usePoslatOpravuDoPohody } from "@/components/faktero/PoslatOpravuDoPohody";
import { useProgramOdovzdaniaFaktury } from "@/components/faktero/OdovzdanieDokladu";
import { popisPoslatOpravu, textPoslatOpravu } from "@/lib/faktero/stav-odovzdania";
import { HistoriaDokladu } from "@/components/faktero/HistoriaDokladu";
import { KtoKedyDokladu } from "@/components/faktero/KtoKedyDokladu";
import { requestInvoiceApproval } from "@/lib/faktero/invoice-approval.functions";
import { ConfirmDialog } from "@/components/faktero/ListControls";
import {
  generateEfakturaXmlFn,
  getEfakturaXmlUrlFn,
  getInvoiceEfakturaDocFn,
} from "@/lib/faktero/efaktura/efaktura.functions";
import {
  deriveEfakturaUiStatus,
  EfakturaStatusBadge,
  stavDorucenia,
} from "@/components/faktero/EfakturaStatusBadge";
import {
  IkonaEfaktury,
  UpozornenieEfaktury,
  usePopisEfaktury,
} from "@/components/faktero/EfakturaStavWeb";
import {
  stavEfaktury,
  STLPCE_DORUCENIA,
  type RiadokDorucenia,
} from "@/lib/faktero/efaktura/stav-efaktury";
import { jeChybaEfaktury, textStavuEfaktury } from "@/lib/faktero/efaktura/stav-efaktury-texty";
import { useQuery } from "@tanstack/react-query";
import { friendlyError } from "@/lib/faktero/plan-error";
import { maZuctovanuZalohu, zostavaPoUhradach, zostavaUhradit } from "@/lib/faktero/zaloha";
import {
  dalsiaUpomienka,
  povoleneAkcie,
  smieZmenitStav,
  sucetOdpocitanychZaloh,
} from "@/lib/faktero/akcie-faktury";
import { obnovZKosa } from "@/lib/faktero/obnova-z-kosa";
import { textChybyZapisu } from "@/lib/faktero/over-zapis";
import { jeDobropisNaZobrazenie, polozkaNaZobrazenie, sumaNaZobrazenie } from "@/lib/faktero/dobropis-zobrazenie";
import { createInvoicePaymentLink, syncInvoicePayment } from "@/lib/faktero/payments.functions";
import { paymentMethodLabel } from "@/lib/faktero/payment-method";
import { adresaRiadky } from "@/lib/faktero/adresa";
import { cloneInvoiceFn } from "@/lib/faktero/invoice-clone.functions";
import { sendReminderFn, previewReminderFn } from "@/lib/faktero/reminders.functions";

import { isdocFakturyFn } from "@/lib/faktero/isdoc.functions";
import { xrechnungFakturyFn } from "@/lib/faktero/xrechnung.functions";
import { hodnotyMailu, jazykFaktury, predvolenyMailFaktury, vlastnyMailFirmy } from "@/lib/faktero/email-jazyk";
import { krajinaDane } from "@/lib/faktero/vat-rates";
import { hodnotyPremennych } from "@/lib/faktero/email-sablony";
import { VyberEmailSablony } from "@/components/faktero/VyberEmailSablony";
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { VyberUctu } from "@/components/faktero/banka/VyberUctu";
import { formatujIban, sUctomFaktury } from "@/lib/faktero/platobny-ucet";
import { potvrd, zadaj } from "@/lib/potvrdenie";
import { nastaveniaExportu } from "@/lib/faktero/export-nastavenia";
import { OKNO_STORNO_DOKLADU_K_PLATBE, stornoLenRucne } from "@/lib/faktero/storno-dokladu-k-platbe";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujMenu, formatujCislo, formatujJednotkovuCenu, formatujMnozstvo } from "@/lib/faktero/mena";
import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
/** Ako sa doklad volá — rovnako v hlavičke stránky aj v PDF. */
const NAZOV_TYPU: Record<string, string> = {
  proforma: "Zálohová faktúra",
  credit_note: "Dobropis",
  debit_note: "Ťarchopis",
  advance_payment: "Daňový doklad k platbe",
  regular: "Faktúra",
};

export const Route = createFileRoute("/_authenticated/faktury/$id/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Detail faktúry — Faktero") }] }),
  /* `po` posiela formulár faktúry: „Vystaviť a stiahnuť PDF“ / „… a odoslať e-mailom“. */
  validateSearch: (s: Record<string, unknown>): { po?: "pdf" | "email" } => ({
    po: s.po === "pdf" || s.po === "email" ? s.po : undefined,
  }),
  component: InvoiceDetail,
});

function InvoiceDetail() {
  const { t, jazyk } = useT();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const klik = useKlikNaRiadok();
  // Vlastné stavy dokladov firmy (číselník v Účtovníctvo → Predkontácie).
  const ciselnikyFirmy = useCiselnikyDokladov(getActiveCompanyId(), null, false);
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
  const [nahladUrl, setNahladUrl] = useState<string | null>(null);
  // PDF stále vľavo vedľa údajov — pri účtovaní ho netreba otvárať zvlášť.
  const nahladDetail = useNahladVDetaile();
  // Kompaktné rozloženie má vlastné usporiadanie detailu (jeden stĺpec kariet).
  const kompaktne = useDizajn() === "kompaktny";
  const [pdfVedla, setPdfVedla] = useState<SuborNahladu | undefined>(undefined);
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
    doplnok: "",
  });
  const [reminders, setReminders] = useState<any[]>([]);
  const sendReminder = useServerFn(sendReminderFn);
  const previewReminder = useServerFn(previewReminderFn);

  const [emailBusy, setEmailBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [emailForm, setEmailForm] = useState({ recipient_email: "", subject: "", message: "" });
  const [emailSablona, setEmailSablona] = useState<{
    jazyk: string;
    predvolene: { predmet: string; text: string };
    hodnoty: Record<string, string>;
  } | null>(null);
  const genPdf = useServerFn(generateInvoicePdf);
  const getPdf = useServerFn(getInvoicePdfSignedUrl);
  const sendEmail = useServerFn(sendInvoiceEmailFn);
  const triggerEvt = useServerFn(triggerEventFn);
  const exportFn = useServerFn(exportInvoicesFn);
  const poslatOpravu = usePoslatOpravuDoPohody();
  // Kam faktúra odišla (Money, Omega…) — akcia „Poslať opravu“ nesmie tvrdiť Pohodu.
  const programOdovzdania = useProgramOdovzdaniaFaktury(inv?.id, Boolean(inv?.exported_at));
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
  /* Úhrady faktúry (aj čiastočné) — „Spolu k úhrade“ z nich odpočíta, čo už prišlo. */
  const [uhradene, setUhradene] = useState(0);
  /* História dokladu je prázdna — kompaktné rozloženie potom nekreslí prázdny rámček. */
  const [pocetHistorie, setPocetHistorie] = useState<number | null>(null);
  const [obnovujem, setObnovujem] = useState(false);
  /* Všetky zálohy odpočítané na tejto faktúre — pri etapovej dodávke ich je viac. */
  const [odpocitaneZalohy, setOdpocitaneZalohy] = useState<any[]>([]);
  /* Daňový doklad k prijatej platbe, ak už k tejto zálohe existuje. */
  const [dokladKPlatbe, setDokladKPlatbe] = useState<any | null>(null);
  const [vystavujemDoklad, setVystavujemDoklad] = useState(false);
  /* Okno „Vystaviť daňový doklad k platbe“ (menu „…“ aj karta zálohy). */
  const [oknoDokladuKPlatbe, setOknoDokladuKPlatbe] = useState(false);
  const [poslednaUhrada, setPoslednaUhrada] = useState<string | null>(null);
  const vystavDokladFn = useServerFn(vystavDokladKPlatbeFn);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const requestApprovalFn = useServerFn(requestInvoiceApproval);

  async function handleRequestApproval() {
    if (!inv) return;
    const suggested = inv.customer_email ?? "";
    const email = await zadaj(t("E-mail zákazníka pre schválenie faktúry"), {
      predvolene: suggested,
      typ: "email",
      placeholder: "zakaznik@firma.sk",
    }, { potvrdit: t("Poslať žiadosť") });
    if (!email) return;
    setApprovalBusy(true);
    try {
      await requestApprovalFn({ data: { invoiceId: inv.id, recipientEmail: email.trim() } });
      toast.success(t("Žiadosť o schválenie bola odoslaná."));
      load();
    } catch (e: any) {
      toast.error(t(friendlyError(e, "Nepodarilo sa odoslať žiadosť.")));
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
          ? t("Platobný odkaz skopírovaný.")
          : t("Platobný odkaz bol vytvorený. PDF bude pri ďalšom stiahnutí pregenerované."),
      );
      load();
    } catch (e: any) {
      toast.error(t(friendlyError(e) ?? e.message));
    } finally {
      setPayBusy(false);
    }
  }

  async function handleSyncPayment() {
    if (!inv?.company_id) return;
    setSyncBusy(true);
    try {
      const r = await syncPayFn({ data: { companyId: inv.company_id, invoiceId: id } });
      if (r.paid) toast.success(t("Platba prebehla. Faktúra označená ako uhradená."));
      else toast.success(t("Stav platby: {stav}", { stav: r.state || t("neznámy") }));
      load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Synchronizácia zlyhala."));
    } finally {
      setSyncBusy(false);
    }
  }
  const genXml = useServerFn(generateEfakturaXmlFn);
  const efakturaTest = useEfakturaTestovaciRezim();

  /**
   * Odoslanie faktúry cez Peppol — okno s potvrdením, PDF faktúry a výberom
   * príloh dokladu (BG-24). XML ePošták vyrobí sám z údajov faktúry.
   */
  const [efakturaOkno, setEfakturaOkno] = useState(false);
  /* Dátum vystavenia pred prvým odoslaním — rieši ho samo okno eFaktúry. */
  function handleSendEfaktura() {
    if (!inv?.company_id) return;
    setEfakturaOkno(true);
  }
  const datumOkno = useAktualnyDatum();
  /** Pôvodný dátum potvrdený pri doklade, ktorý sa zmeniť nedá. */
  const [potvrdenyStaryDatum, setPotvrdenyStaryDatum] = useState(false);
  /** Číslo, s ktorým sa predvyplnil predmet a text mailu — server ho pri odoslaní zladí s aktuálnym. */
  const cisloVOkneRef = useRef<string | null>(null);
  function poOdoslaniEfaktury(r: { status: string }) {
    setEfakturaOkno(false);
    /* V testovacom režime doklad do siete Peppol nejde — hláška to musí
       povedať, inak človek verí, že odberateľ faktúru dostal. */
    if (efakturaTest) {
      toast.warning(t("Odoslané len do testovacieho prostredia — odberateľovi nepríde."), {
        duration: 10000,
      });
    } else {
      toast.success(
        t("Odoslané cez eFaktúru — stav {stav}.", { stav: t(stavDorucenia(r.status)).toLowerCase() }),
      );
    }
    efakturaQuery.refetch();
    dorucenieQuery.refetch();
  }
  const getXml = useServerFn(getEfakturaXmlUrlFn);
  const getDocFn = useServerFn(getInvoiceEfakturaDocFn);
  const [xmlBusy, setXmlBusy] = useState(false);
  const [isdocBusy, setIsdocBusy] = useState(false);
  const stiahniIsdoc = useServerFn(isdocFakturyFn);
  const [xrechnungBusy, setXrechnungBusy] = useState(false);
  const stiahniXrechnung = useServerFn(xrechnungFakturyFn);
  const krajina = useKrajinaDane();
  const efakturaQuery = useQuery({
    queryKey: ["efaktura-doc", id, inv?.company_id],
    queryFn: () => getDocFn({ data: { companyId: inv!.company_id, invoiceId: id } }),
    enabled: !!inv?.company_id,
  });
  const efakturaDoc = efakturaQuery.data ?? null;
  const efakturaUi = deriveEfakturaUiStatus(efakturaDoc);
  /*
    Stav eFaktúry zo všetkých doručení — spoločné pravidlá s appkou a zoznamom
    (`stavEfaktury`): zlyhanie hlásené ePoštákom (`deliveryFailure`) nie je
    „odoslaná“ a `accepted` je len prevzatie ePoštákom, nie odberateľom.
  */
  const dorucenieQuery = useQuery({
    queryKey: ["efaktura-dorucenie", (efakturaDoc as any)?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("efaktura_deliveries")
        .select(STLPCE_DORUCENIA)
        .eq("document_id", (efakturaDoc as any).id);
      return stavEfaktury((data ?? []) as RiadokDorucenia[]);
    },
    enabled: !!(efakturaDoc as any)?.id,
  });
  const stavEf = dorucenieQuery.data ?? null;
  const popisEfaktury = usePopisEfaktury();

  async function handleGenerateXml() {
    if (!inv?.company_id) return;
    setXmlBusy(true);
    try {
      const r = await genXml({ data: { companyId: inv.company_id, invoiceId: id } });
      if (r.valid) toast.success(t("eFaktúra XML vygenerovaná a validovaná."));
      else toast.error(t("XML vygenerovaná, ale s chybami validácie: {n}.", { n: r.validationErrors.length }));
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

  /*
    XRechnung je nemecká e-faktúra (UBL) — ponúka sa len nemeckej firme.
    Keď faktúre niečo chýba, server XML nevydá a povie čo; neplatnú
    e-faktúru by príjemca aj tak odmietol.
  */
  async function handleXrechnung() {
    if (!inv?.company_id) return;
    setXrechnungBusy(true);
    try {
      const r = await stiahniXrechnung({ data: { company_id: inv.company_id, invoice_id: id } });
      if (!r.xml) {
        toast.error(
          t("XRechnung sa nedá vystaviť: {chyby}", {
            chyby: r.chyby.map((c) => t(c.sprava)).join(" "),
          }),
          { duration: 12000 },
        );
        return;
      }
      // Blob a atribút `download` — rovnako ako ISDOC vyššie, aby ostal názov súboru.
      const blob = new Blob([r.xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nazovSuboru;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error(t((e as Error).message));
    } finally {
      setXrechnungBusy(false);
    }
  }

  async function vystavDoklad(v: { suma: number; datum: string }) {
    if (!inv) return;
    setVystavujemDoklad(true);
    try {
      const doklad: any = await vystavDokladFn({
        data: {
          proforma_id: inv.id,
          // Deň prijatia platby — podľa neho vzniká daňová povinnosť.
          datum_platby: v.datum,
          // Prijatá suma (aj čiastočná úhrada) — server ju rozpočíta na položky.
          suma: v.suma,
        },
      });
      toast.success(t("Vystavený doklad {cislo}", { cislo: doklad.invoice_number }));
      setOknoDokladuKPlatbe(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Doklad sa nepodarilo vystaviť."));
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
        /*
          Doklad k prijatej platbe sa tu predtým hneď znova vynuloval — záloha
          ho nikdy neukázala a ponúkala „Vystaviť daňový doklad“ aj po vystavení.
        */
        setDokladKPlatbe(ddp ?? null);
      } else {
        const { data: odpocty } = await supabase
          .from("invoice_advances")
          .select("advance_invoice_id, amount")
          .eq("invoice_id", data.id);
        /*
          Staršie faktúry majú odpočet len v `advance_amount` + `advance_invoice_id`
          bez riadku v `invoice_advances` — inak by sa ich záloha v detaile
          neukázala vôbec. Daňový doklad k platbe tiež nesie `advance_invoice_id`,
          ale to nie je odpočet.
        */
        const riadky: { advance_invoice_id: string; amount: unknown }[] = odpocty?.length
          ? (odpocty as any[])
          : data.type === "regular" && data.advance_invoice_id && Number(data.advance_amount) > 0
            ? [{ advance_invoice_id: data.advance_invoice_id, amount: data.advance_amount }]
            : [];
        if (riadky.length) {
          const { data: zalohy } = await supabase
            .from("invoices")
            .select("id, invoice_number, issue_date, currency")
            .in(
              "id",
              riadky.map((o) => o.advance_invoice_id),
            );
          setOdpocitaneZalohy(
            riadky.map((o) => ({
              ...o,
              zaloha: (zalohy ?? []).find((z: any) => z.id === o.advance_invoice_id) ?? null,
            })),
          );
        } else {
          setOdpocitaneZalohy([]);
        }
        setSettledIn(null);
        setDokladKPlatbe(null);
      }
      const { data: rems } = await supabase
        .from("invoice_reminders")
        .select("id, reminder_number, sent_at, status, email_to, triggered_by")
        .eq("invoice_id", id)
        .order("sent_at", { ascending: false });
      setReminders(rems ?? []);
      const { data: platby } = await supabase
        .from("payments")
        .select("amount, paid_at")
        .eq("invoice_id", id);
      setUhradene((platby ?? []).reduce((a: number, p: any) => a + (Number(p.amount) || 0), 0));
      // Deň poslednej úhrady — predvyplní dátum dokladu k prijatej platbe.
      setPoslednaUhrada(
        (platby ?? [])
          .map((p: any) => String(p.paid_at ?? "").slice(0, 10))
          .filter(Boolean)
          .sort()
          .pop() ?? null,
      );
    }
  }

  async function openReminder() {
    try {
      const sentSet = new Set(
        reminders.filter((r) => r.status === "sent").map((r) => r.reminder_number),
      );
      let next = dalsiaUpomienka(sentSet as Set<number>);
      if (next === null) {
        // Po tretej sa ďalšia neponúka potichu — opakovanie tretej len vedome.
        const znova = await potvrd(
          t("Všetky upomienky (1., 2. aj 3.) už boli odoslané. Chcete poslať 3. upomienku znova?"),
          { potvrdit: t("Poslať 3. upomienku znova"), nebezpecne: false },
        );
        if (!znova) return;
        next = 3;
      }
      const preview = await previewReminder({ data: { invoiceId: id, reminderNumber: next } });
      setReminderForm({
        reminderNumber: next,
        recipient_email: preview.recipient_email ?? "",
        subject: preview.subject,
        message: preview.message,
        doplnok: preview.doplnok ?? "",
      });
      setReminderOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa načítať upomienku"));
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
      toast.success(t("Upomienka odoslaná"));
      setReminderOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Odoslanie upomienky zlyhalo"));
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
      toast.success(t("Faktúra vymazaná"));
      navigate({ to: "/faktury" });
    } catch (e: any) {
      toast.error(t(friendlyError(e, "Chyba pri mazaní")));
    } finally {
      setDeleteBusy(false);
      setDeleteOpen(false);
    }
  }

  async function setStatus(status: string) {
    // Production-readiness checks
    if (status === "paid" && inv?.status === "cancelled")
      return toast.error(t("Stornovanú faktúru nemožno označiť ako uhradenú."));
    // Koncept sa najprv vystavuje (DUZP, kontroly), storno sa už neodosiela ani neuhrádza.
    if (inv?.deleted_at) return toast.error(t("Faktúra je v koši — najprv ju obnovte."));
    if (status === "paid" && inv?.status === "draft")
      return toast.error(t("Koncept najprv vystavte, potom ho môžete označiť ako uhradený."));
    if (!smieZmenitStav(inv?.status, status))
      return toast.error(t("V tomto stave faktúry sa táto zmena nedá urobiť."));
    if (
      status === "cancelled" &&
      inv?.exported_at &&
      stornoLenRucne(inv.type, nastaveniaExportu(company?.uctovanie_nastavenia).dokladKPlatbe)
    ) {
      // Daňový doklad k platbe je v Pohode interný doklad — storno tam treba urobiť ručne.
      const ok = await potvrd(t(OKNO_STORNO_DOKLADU_K_PLATBE, { cislo: inv.invoice_number ?? "" }), {
        potvrdit: t("Stornovať"),
        nebezpecne: true,
      });
      if (!ok) return;
    } else if (status === "cancelled" && inv?.status === "paid") {
      if (!(await potvrd(t("Faktúra je uhradená. Naozaj ju chcete stornovať?")))) return;
    }
    const patch: any = { status };
    if (status === "paid") patch.paid_at = new Date().toISOString();
    if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
    if (status === "sent") patch.sent_at = new Date().toISOString();
    // Koncept bez dátumu dodania (staršia kópia) sa nesmie vystaviť bez DUZP.
    if (status === "issued" && inv?.status === "draft" && !inv?.delivery_date) patch.delivery_date = inv.issue_date;
    const { error } = await supabase.from("invoices").update(patch).eq("id", id);
    if (error) return toast.error(t(friendlyError(error, error.message)));
    toast.success(
      status === "issued"
        ? t("Faktúra {cislo} je vystavená.", { cislo: inv?.invoice_number ?? "" })
        : t("Stav aktualizovaný"),
    );
    // Webhook: úhradu aj storno posiela fronta webhookov z databázy (spúšťač) —
    // z prehliadača ide len „odoslaná“, a údaje si server načíta sám.
    if (status === "sent" && inv?.id) {
      try {
        await triggerEvt({ data: { event: "invoice.sent", id: inv.id } });
      } catch (e) {
        console.warn("[webhook] invoice.sent trigger zlyhal", e);
      }
    }
    load();
  }

  /* Späť medzi otvorené — ako po zrušení párovania; „po splatnosti“ sa počíta z dátumu. */
  async function oznacNeuhradenu() {
    if (!(await potvrd(t("Označiť faktúru ako neuhradenú?")))) return;
    const { error } = await supabase
      .from("invoices")
      .update({ status: inv?.sent_at ? "sent" : "issued", paid_at: null })
      .eq("id", id);
    if (error) return toast.error(t(friendlyError(error, error.message)));
    toast.success(t("Stav aktualizovaný"));
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
        toast.error(t("PDF sa nepodarilo vygenerovať."));
        return;
      }
      toast.success(t("PDF vygenerované."));
      const ok = triggerBrowserDownload(r.signedUrl, `${inv.invoice_number ?? "faktura"}.pdf`);
      if (!ok) toast.error(t("PDF sa nepodarilo stiahnuť."));
      load();
    } catch (e: any) {
      console.error("generateInvoicePdf failed", e);
      toast.error(e?.message ?? t("PDF sa nepodarilo vygenerovať."));
    } finally {
      setPdfBusy(false);
    }
  }

  /** Podpísaný odkaz na aktuálne PDF — keď ešte nie je, vyrobí sa. */
  async function odkazNaPdf(): Promise<string | null> {
    try {
      const r = await getPdf({ data: { invoiceId: id } });
      return r?.signedUrl ?? null;
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("zatiaľ neexistuje") || msg.includes("not_found")) {
        const g = await genPdf({ data: { invoiceId: id } });
        load();
        return g?.signedUrl ?? null;
      }
      throw e;
    }
  }

  // Po úprave faktúry (nové PDF) sa náhľad načíta znova.
  const verziaPdf = inv ? `${inv.id}|${inv.pdf_url ?? ""}|${inv.updated_at ?? ""}` : "";
  useEffect(() => {
    // Náhľad je aj na mobile (nad/pod údajmi), preto sa PDF načíta pri každej šírke.
    if (!verziaPdf || !nahladDetail.zapnuty) return;
    let zive = true;
    odkazNaPdf()
      .then((u) => zive && setPdfVedla(u ? { url: u } : null))
      .catch(() => zive && setPdfVedla(null));
    return () => {
      zive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verziaPdf, nahladDetail.zapnuty]);

  /** Náhľad v okne nad stránkou — bez sťahovania súboru. Na širokej obrazovke ho zapne vľavo. */
  async function handleNahlad() {
    if (nahladDetail.siroka() && !nahladDetail.zapnuty) return nahladDetail.prepni(true);
    setPdfBusy(true);
    try {
      const url = await odkazNaPdf();
      if (!url) return toast.error(t("PDF sa nepodarilo pripraviť."));
      setNahladUrl(url);
    } catch (e: any) {
      toast.error(e?.message ?? t("PDF sa nepodarilo pripraviť."));
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleDownload() {
    setPdfBusy(true);
    try {
      const signedUrl = await odkazNaPdf();
      if (!signedUrl) {
        toast.error(t("PDF zatiaľ neexistuje."));
        return;
      }
      const ok = triggerBrowserDownload(signedUrl, `${inv.invoice_number ?? "faktura"}.pdf`);
      if (!ok) toast.error(t("PDF sa nepodarilo stiahnuť."));
    } catch (e: any) {
      console.error("downloadInvoicePdf failed", e);
      toast.error(e?.message ?? t("PDF sa nepodarilo stiahnuť."));
    } finally {
      setPdfBusy(false);
    }
  }

  async function handlePohodaExport() {
    if (!inv?.company_id) return;
    setExportBusy(true);
    try {
      // Odovzdaná faktúra: len kópia na stiahnutie — do histórie sa nezapíše,
      // aby nevznikla druhá dávka s tou istou faktúrou.
      const r = await exportFn({
        data: {
          companyId: inv.company_id,
          invoiceIds: [inv.id],
          format: "pohoda_xml",
          kopia: Boolean(inv.exported_at),
        },
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
      toast.success(t("Pohoda XML stiahnuté"));
      toastNeodovzdane(t, r.preskocene);
    } catch (e: any) {
      toast.error(e?.message ?? t("Export zlyhal"));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleClone() {
    setCloneBusy(true);
    try {
      const r = await cloneFn({ data: { invoiceId: id } });
      toast.success(t("Faktúra bola skopírovaná"));
      navigate({ to: "/faktury/$id/upravit", params: { id: r.id } });
    } catch (e: any) {
      toast.error(t(friendlyError(e, e?.message ?? "Klonovanie zlyhalo")));
    } finally {
      setCloneBusy(false);
    }
  }

  /*
    Po „Vystaviť a stiahnuť PDF / odoslať e-mailom“ vo formulári sa akcia
    spustí raz, keď je faktúra načítaná; parameter sa z adresy hneď zmaže,
    aby sa pri obnovení stránky nespustila znova.
  */
  const { po } = Route.useSearch();
  const poHotovoRef = useRef(false);
  const openEmailRef = useRef<null | (() => Promise<void>)>(null);
  useEffect(() => {
    if (!po || !inv || poHotovoRef.current || inv.deleted_at) return;
    poHotovoRef.current = true;
    navigate({ to: "/faktury/$id", params: { id }, search: {}, replace: true });
    if (po === "pdf") void handleDownload();
    else void openEmailRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po, inv]);

  if (nenajdene)
    return (
      <PageBody>
        <div className="rounded-xl border border-border bg-card">
          <ChybovyStav
            nadpis="Táto faktúra v aktívnej firme neexistuje."
            popis={t("Ak patrí inej vašej firme, prepnite sa na ňu hore v lište.")}
            akcia={
              <Link to="/faktury" className="text-sm font-medium text-primary underline">
                {t("Späť na faktúry")}
              </Link>
            }
          />
        </div>
      </PageBody>
    );
  if (!inv)
    return (
      <PageBody>
        <NacitavanieStav />
      </PageBody>
    );

  /*
    Čo sa s faktúrou v jej stave dá robiť — spoločné pre klasický aj
    kompaktný detail. „Po splatnosti“ rovnako ako zoznam a Prehľad:
    vystavená/odoslaná, neuhradená, splatnosť pred dneškom v Bratislave
    (koncept nikdy).
  */
  const akcie = povoleneAkcie(inv, {
    dnes: dnesBratislava(),
    platitelDph: company ? company.vat_payer : null,
    krajina,
  });
  const isOverdue = akcie.poSplatnosti;
  // Dobropis sa neuhrádza — čiastočná úhrada má zmysel len pri kladnej faktúre.
  const ciastocneUhradena = uhradene > 0.004 && !jeDobropisNaZobrazenie(inv);
  /*
    Daňový doklad k prijatej platbe — zo zálohovej faktúry platiteľa DPH už po
    prvej (aj čiastočnej) úhrade, kým k nej doklad nie je. Daňová povinnosť
    vzniká prijatím platby (§ 19 ods. 4), nie až úhradou celej zálohy.
  */
  const mozeDokladKPlatbe =
    inv.type === "proforma" &&
    !inv.deleted_at &&
    inv.status !== "cancelled" &&
    inv.status !== "draft" &&
    company?.vat_payer !== false &&
    !dokladKPlatbe &&
    (akcie.dokladKPlatbe || uhradene > 0.004);
  // Suma a dátum do okna: z úhrad, pri „Označiť ako uhradenú“ bez úhrady celá záloha.
  const sumaDokladuKPlatbe =
    uhradene > 0.004 ? Math.min(uhradene, Number(inv.total ?? 0)) : Number(inv.total ?? 0);
  const datumDokladuKPlatbe =
    poslednaUhrada || String(inv.paid_at ?? "").slice(0, 10) || dnesBratislava();
  async function obnovFakturu() {
    if (!inv) return;
    setObnovujem(true);
    try {
      await obnovZKosa("invoices", [inv.id], inv.company_id);
      toast.success(t("Faktúra je obnovená z koša."));
      await load();
    } catch (e) {
      toast.error(textChybyZapisu(e, t));
    } finally {
      setObnovujem(false);
    }
  }

  /*
   * Adresát: doklad si údaje odberateľa odkladá v okamihu vystavenia, takže
   * faktúra vystavená pred doplnením e-mailu ho v sebe nemá. Dovtedy sa
   * odoslanie odmietalo hláškou „doplňte e-mail v karte odberateľa" — aj
   * potom, ako ho tam človek doplnil. Preto sa dopýta aktuálna karta a keď ani
   * tá adresu nemá, dialóg sa otvorí prázdny a adresa sa dá napísať ručne.
   */
  async function openEmail() {
    /*
      Prvé odoslanie len s dnešným dátumom vystavenia. Okno sa ukáže ešte pred
      formulárom mailu — text mailu nesie splatnosť, ktorá sa so zmenou posúva.
    */
    const vysledok = await datumOkno.over(id);
    if (!vysledok) return;
    setPotvrdenyStaryDatum(vysledok.potvrdenyStaryDatum);
    let fa: any = inv;
    if (vysledok.zmenene) {
      const { data: nova } = await supabase.from("invoices").select("*").eq("id", id).single();
      if (nova) fa = nova;
      toast.success(t("Dátum vystavenia je zmenený na dnes."));
      load();
    }
    let adresa = fa.customer_email as string | null;
    if (!adresa && fa.customer_id) {
      const { data } = await supabase
        .from("customers")
        .select("email")
        .eq("id", fa.customer_id)
        .maybeSingle();
      adresa = (data?.email as string | null) ?? null;
    }
    /*
      Predvolený mail je v jazyku dokladu (nemecká faktúra → nemecký mail),
      nie v jazyku, v ktorom má človek prepnutý web. Vlastný predvolený
      predmet a text firmy sa berie tak, ako ho firma napísala.
    */
    const jazykMailu = jazykFaktury(fa, company);
    const predvoleny = predvolenyMailFaktury(
      jazykMailu,
      (fa as any)?.type,
      krajinaDane((company as any)?.country),
    );
    const hodnoty = hodnotyMailu(fa, jazykMailu);
    // Slovenská hodnota z databázy nie je vlastný text firmy — dokladu v inom jazyku sa neprikladá.
    const vlastny = vlastnyMailFirmy(company, jazykMailu);
    const predvolenyMail = {
      predmet: (vlastny.predmet ?? predvoleny.predmet).replaceAll(
        "{invoice_number}",
        fa.invoice_number,
      ),
      text: (vlastny.text ?? predvoleny.text)
        .replaceAll("{invoice_number}", fa.invoice_number)
        .replaceAll("{due_date}", hodnoty.due_date)
        .replaceAll("{total}", hodnoty.total)
        .replaceAll("{company_name}", company?.name ?? ""),
    };
    // Šablóna podľa typu a jazyka dokladu (VyberEmailSablony) ho po načítaní nahradí.
    setEmailSablona({
      jazyk: jazykMailu,
      predvolene: predvolenyMail,
      hodnoty: hodnotyPremennych({
        doklad: fa as any,
        jazyk: jazykMailu,
        firma: company?.name ?? "",
        iban: company ? (sUctomFaktury(company, fa).iban ?? "") : "",
        krajina: krajinaDane((company as any)?.country),
      }),
    });
    cisloVOkneRef.current = fa.invoice_number ?? null;
    setEmailForm({
      recipient_email: adresa ?? "",
      subject: predvolenyMail.predmet,
      message: predvolenyMail.text,
    });
    setEmailOpen(true);
  }
  openEmailRef.current = openEmail;
  async function submitEmail() {
    if (!emailForm.recipient_email.trim()) {
      toast.error(t("Zadajte adresu príjemcu."));
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
          potvrdeny_stary_datum: potvrdenyStaryDatum || undefined,
          cislo_v_okne: cisloVOkneRef.current ?? undefined,
        },
      });
      toast.success(t("E-mail odoslaný"));
      if (odoslane?.vynechane?.length) {
        /* Mail odišiel, ale nie celý — to sa musí povedať nahlas. */
        toast.warning((odoslane as any).odkaz_prilohy
          ? t("Do mailu sa nezmestili: {subory} — príjemca ich dostal ako odkaz na stiahnutie (platí 30 dní).", {
              subory: odoslane.vynechane.join(", "),
            })
          : t("Do mailu sa nezmestili: {subory}", { subory: odoslane.vynechane.join(", ") }), {
          duration: 12000,
        });
      }
      setEmailOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ? t(e.message) : t("Odoslanie zlyhalo"));
    } finally {
      setEmailBusy(false);
    }
  }


  /*
    PDF na jednej strane a údaje na druhej (ako nespracovaný doklad) — vždy,
    keď je náhľad zapnutý; na úzkej obrazovke je PDF nad/pod údajmi.
  */
  const pdfRozlozenie = nahladDetail.zapnuty;
  const jeZaloha = maZuctovanuZalohu(inv.advance_amount);
  const udajeUctovnika: UdajeUctovnika = {
    cislo: inv.invoice_number,
    druh: inv.oprava_25a ? t("Opravný doklad (§ 25a)") : t(NAZOV_TYPU[inv.type as string] ?? "Faktúra"),
    stranaNadpis: "Odberateľ",
    strana: {
      nazov: inv.customer_name,
      ico: inv.customer_ico,
      dic: inv.customer_dic,
      icDph: inv.customer_ic_dph,
    },
    stranaDoplnok:
      inv.status !== "cancelled" ? (
        <Link
          to="/faktury/$id/upravit"
          params={{ id }}
          className="normal-case tracking-normal text-primary hover:underline print:hidden"
        >
          {t("Zmeniť")}
        </Link>
      ) : null,
    vystavenie: inv.issue_date,
    dodanie: inv.delivery_date,
    splatnost: popisSplatnosti(inv),
    vs: vsVystavenej(inv) || null,
    formaUhrady: t(paymentMethodLabel(inv.payment_method)),
    mena: inv.currency,
    kurz: inv.exchange_rate,
    kurzDatum: inv.exchange_rate_date,
    rozpis: rozpisPodlaSadzieb(
      riadkySoZlavou(items, inv.discount_total).map((it: any) => ({
        vat_rate: it.vat_rate,
        subtotal: it.subtotal,
        vat_amount: it.vat_amount,
        prenesenie: Boolean(inv.reverse_charge || it.prenesenie),
      })),
      { subtotal: inv.subtotal, vat_total: inv.vat_total },
    ),
    naZobrazenie: (n) => sumaNaZobrazenie(inv, n),
    zaklad: Number(inv.subtotal),
    dph: Number(inv.vat_total),
    zlava: Number(inv.discount_total ?? 0),
    zaloha: jeZaloha ? Number(inv.advance_amount) : null,
    kUhrade: jeZaloha ? zostavaUhradit(inv.total, inv.advance_amount) : null,
    spolu: Number(inv.total),
    rezimy: rezimDphVystavenej(
      inv,
      items.some((it: any) => it.prenesenie),
    ),
    uhrada: {
      uhradena: inv.status === "paid",
      datum: inv.paid_at ? String(inv.paid_at).slice(0, 10) : null,
      zostava: sumaNaZobrazenie(inv, zostavaUhradit(inv.total, inv.advance_amount)),
      bezUhrady: inv.status === "cancelled" || inv.status === "draft" || jeDobropisNaZobrazenie(inv),
    },
    // Zálohová faktúra sa neúčtuje — bez predkontácie, členenia a stavu zaúčtovania.
    zauctovanie: isAccountingDocument(inv.type)
      ? {
          ...stavZauctovania(inv),
          predkontacia: inv.pohoda_predkontacia,
          /* Prázdne členenie ukáže návrh zaúčtovania (uloží sa v časti Zaúčtovanie). */
          clenenie:
            inv.pohoda_clenenie_dph ||
            ((inv as any).auto_uctovanie_navrh?.clenenieDph
              ? t("{kod} (návrh)", { kod: (inv as any).auto_uctovanie_navrh.clenenieDph })
              : null),
          kv: inv.kv_clenenie,
        }
      : undefined,
  };

  /*
    Kúsky detailu. Skladajú sa v dvoch rozloženiach: bez náhľadu PDF
    (hlavný stĺpec + bočný 320 px) a s náhľadom PDF vľavo — vtedy je vpravo
    jeden stĺpec, navrchu údaje pre účtovníka a platba, a to, čo len
    opakuje PDF (strany, položky, poznámky), je zbalené v „Údajoch faktúry“.
  */
  const kartaStrany = (
    <div className="grid gap-6 rounded-xl border border-border bg-card p-6 sm:grid-cols-2">
      <div>
        <div className="text-sm font-semibold text-muted-foreground">
          {t("Dodávateľ")}
        </div>
        <div className="mt-1 font-medium">{company?.name}</div>
        <div className="text-sm text-muted-foreground">
          {company?.street}
          <br />
          {company?.zip} {company?.city}, {company?.country}
        </div>
        <div className="mt-2 text-sm">
          {t("IČO")}: {company?.ico ?? "—"} · {t("DIČ")}: {company?.dic ?? "—"}
        </div>
        {company?.ic_dph && <div className="text-sm">{t("IČ DPH")}: {company.ic_dph}</div>}
      </div>
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          {t("Odberateľ")}
          {inv.status !== "cancelled" && !inv.deleted_at && (
            <Link
              to="/faktury/$id/upravit"
              params={{ id }}
              className="font-medium text-primary hover:underline print:hidden"
            >
              {t("Zmeniť")}
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
          {t("IČO")}: {inv.customer_ico ?? "—"} · {t("DIČ")}: {inv.customer_dic ?? "—"}
        </div>
      </div>
    </div>
  );
  const kartaUvod = inv.intro_note ? (
    <div className="whitespace-pre-wrap rounded-xl border border-border bg-card p-5 text-sm">
      {inv.intro_note}
    </div>

  ) : null;
  const polozkyNaZobrazenie = items.map((it0) => polozkaNaZobrazenie(inv, it0));
  const dphPolozky = (it: (typeof polozkyNaZobrazenie)[number]) =>
    inv.reverse_charge || (it as any).prenesenie ? (
      <span title={t("Prenesenie daňovej povinnosti — daň priznáva odberateľ")}>{t("PDP")}</span>
    ) : (
      `${it.vat_rate}%`
    );
  /*
    Položky sa prispôsobia šírke karty, nie obrazovky: v úzkom stĺpci
    (kompaktný detail, bočný panel, telefón) idú ako karty pod sebou,
    od 560 px kontajnera ako tabuľka — nikdy nie s vodorovným posúvaním.
  */
  const kartaPolozky = (
    <div className="@container min-w-0 rounded-xl border border-border bg-card">
      <ul className="divide-y divide-border text-sm @min-[560px]:hidden">
        {polozkyNaZobrazenie.map((it) => (
          <li key={it.id} className="min-w-0 p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 break-words font-medium">{it.name}</div>
              <div className="suma shrink-0 whitespace-nowrap text-right font-medium">
                {formatujCislo(it.total, 2)}
              </div>
            </div>
            {it.description && (
              <div className="whitespace-pre-line break-words text-xs text-muted-foreground">{it.description}</div>
            )}
            {Number((it as any).discount_percent ?? 0) > 0 && (
              <div className="fk-text-uspech text-xs">
                {t("Zľava {n} %", { n: Number((it as any).discount_percent) })}
              </div>
            )}
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
              <span>
                {formatujMnozstvo(it.quantity, lokalJazyka(jazyk))} {it.unit} × {formatujJednotkovuCenu(it.unit_price)}
              </span>
              <span>
                {t("DPH")} {dphPolozky(it)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-sm @min-[560px]:table">
        <thead className="bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
          <tr>
            <th className="p-3">{t("Položka")}</th>
            <th className="whitespace-nowrap p-3 text-right">{t("Mn.")}</th>
            <th className="whitespace-nowrap p-3">{t("MJ")}</th>
            <th className="whitespace-nowrap p-3 text-right">{t("Cena")}</th>
            <th className="whitespace-nowrap p-3 text-right">{t("DPH")}</th>
            <th className="whitespace-nowrap p-3 text-right">{t("Spolu")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {/* Dobropis je v databáze záporný, na detaile sa ukazuje kladne. */}
          {polozkyNaZobrazenie.map((it) => (
            <tr key={it.id}>
              <td className="p-3">
                <div className="font-medium">{it.name}</div>
                {it.description && (
                  <div className="whitespace-pre-line text-xs text-muted-foreground">{it.description}</div>
                )}
                {Number((it as any).discount_percent ?? 0) > 0 && (
                  <div className="fk-text-uspech text-xs">
                    {t("Zľava {n} %", { n: Number((it as any).discount_percent) })}
                  </div>
                )}
              </td>
              <td className="whitespace-nowrap p-3 text-right tabular-nums">{formatujMnozstvo(it.quantity, lokalJazyka(jazyk))}</td>
              <td className="p-3">{it.unit}</td>
              <td className="whitespace-nowrap p-3 text-right tabular-nums">{formatujJednotkovuCenu(it.unit_price)}</td>
              <td className="whitespace-nowrap p-3 text-right">{dphPolozky(it)}</td>
              <td className="suma whitespace-nowrap p-3 text-right font-medium">{formatujCislo(it.total, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const kartaPoznamka = inv.notes ? (
    <div className="rounded-xl border border-border bg-card p-5 text-sm whitespace-pre-wrap">
      {inv.notes}
    </div>

  ) : null;
  const kartaPrilohy = (
    <PrilohyFaktury
      dokladId={inv.id}
      mozeMenit={inv.status !== "cancelled"}
      onZmena={setPocetPriloh}
    />
  );
  const kartaZauctovanie = (
    <ZauctovanieVystavenejPanel
      inv={inv}
      onZmena={() => void load()}
      onStiahnut={handlePohodaExport}
    />
  );
  // Kto faktúru vytvoril a zaúčtoval a kedy — nenápadný riadok nad históriou.
  const kartaKtoKedy = <KtoKedyDokladu companyId={inv.company_id} agenda="faktura" row={inv} />;
  const kartaHistoria = (
    <>
      <HistoriaDokladu
        companyId={inv.company_id}
        agenda="faktura"
        id={inv.id}
        row={inv}
        onPocet={setPocetHistorie}
      />
    </>
  );
  const kartaZasielkovna = (
    <>
      <ZasielkovnaFaktury inv={inv} onZmena={() => void load()} />
      {zakazka && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-semibold text-muted-foreground">{t("Zákazka")}</div>
          <Link
            to="/zakazky/$id"
            params={{ id: zakazka.id }}
            className="mt-1 block text-sm text-primary hover:underline"
          >
            {zakazka.job_number} — {zakazka.name}
          </Link>
        </div>
      )}
    </>
  );
  const kartaSumar = (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-sm font-semibold text-muted-foreground">{t("Sumár")}</div>
      <div className="mt-3 space-y-1 text-sm">
        {Number(inv.discount_total ?? 0) > 0 && (
          <>
            <Row
              label={t("Medzisúčet")}
              value={formatujMenu((Number(inv.subtotal) + Number(inv.discount_total)), inv.currency)}
            />
            <Row
              label={t("Zľava")}
              value={`−${formatujMenu(inv.discount_total, inv.currency)}`}
            />
          </>
        )}
        <Row label={t("Bez DPH")} value={formatujMenu(sumaNaZobrazenie(inv, inv.subtotal), inv.currency)} />
        <Row label={t("DPH")} value={formatujMenu(sumaNaZobrazenie(inv, inv.vat_total), inv.currency)} />
        <RozpisDph
          skupiny={rozpisPodlaSadzieb(
            riadkySoZlavou(items, inv.discount_total).map((it: any) => ({
              vat_rate: it.vat_rate,
              subtotal: it.subtotal,
              vat_amount: it.vat_amount,
              prenesenie: Boolean(inv.reverse_charge || it.prenesenie),
            })),
            { subtotal: inv.subtotal, vat_total: inv.vat_total },
          )}
          mena={inv.currency}
          naZobrazenie={(n) => sumaNaZobrazenie(inv, n)}
        />
        {maZuctovanuZalohu(inv.advance_amount) && (
          <>
            <Row label={t("Spolu")} value={formatujMenu(inv.total, inv.currency)} />
            <Row
              label={t("Zúčtovaná záloha")}
              value={`−${formatujMenu(inv.advance_amount, inv.currency)}`}
            />
          </>
        )}
      </div>
      <div className="mt-3 border-t border-border pt-3">
        <div className="text-sm font-semibold text-muted-foreground">
          {inv.status === "paid"
            ? t("Uhradené")
            : jeDobropisNaZobrazenie(inv)
              ? t("Spolu")
              : ciastocneUhradena
                ? t("Zostáva k úhrade")
                : t("Spolu k úhrade")}
        </div>
        <div className="suma text-lg font-semibold">
          {formatujMenu(
            sumaNaZobrazenie(
              inv,
              inv.status === "paid"
                ? zostavaUhradit(inv.total, inv.advance_amount)
                : zostavaPoUhradach(inv.total, inv.advance_amount, uhradene),
            ),
            inv.currency,
          )}
        </div>
        {ciastocneUhradena && inv.status !== "paid" ? (
          <div className="text-xs text-muted-foreground">
            {t("Čiastočne uhradená — {suma}", { suma: formatujMenu(uhradene, inv.currency) })}
          </div>
        ) : null}
      </div>
    </div>
  );
  const kartyOpravaSchvalovanie = (
    <>
      <Oprava25aPanel invoice={inv} />
      {inv.status !== "draft" && (
        <SchvalovaniePanel companyId={inv.company_id} agenda="vystavena" id={inv.id} onZmena={() => void load()} />
      )}
    </>
  );
  const kartaStitky = (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <StitkyDokladu
        key={inv.id}
        tabulka="invoices"
        id={inv.id}
        stitky={(inv as any).stitky ?? []}
        companyId={inv.company_id}
      />
      {ciselnikyFirmy.stavy.length ? (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t("Stav dokladu")}</span>
          <VyberStavuDokladu
            key={inv.id}
            tabulka="invoices"
            id={inv.id}
            stavId={(inv as any).stav_id}
            stavy={ciselnikyFirmy.stavy}
          />
        </label>
      ) : null}
    </div>
  );
  /* Interná poznámka je v tej istej karte ako komentáre — dva skoro rovnaké názvy mätli. */
  const kartaKomentare = (
    <KomentarePanel companyId={inv.company_id} agenda="vystavena" id={inv.id}>
      <KomentarDokladu tabulka="invoices" id={inv.id} komentar={(inv as any).komentar} />
    </KomentarePanel>
  );
  /* Iný účet aj na vystavenej faktúre — PDF a QR sa pregenerujú samé. */
  const vyberUctu = inv.status !== "cancelled" && (
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
        toast.success(t("Účet na úhradu zmenený."));
        void load();
      }}
    />
  );
  const predlzenieSplatnosti = (
    <>
      {predlzena(inv) && (
        <div className="text-xs text-muted-foreground">
          {t("Lehoty DPH (§ 25a) sa počítajú od pôvodnej splatnosti.")}
          {inv.predlzenie_poznamka ? ` ${t("Dohoda:")} ${inv.predlzenie_poznamka}` : ""}
        </div>
      )}
      <div className="my-2">
        <PredlzitSplatnost druh="vydana" faktura={inv} onZmena={() => void load()} />
      </div>
    </>
  );
  /*
    Bez IBAN-u nemá odberateľ kam zaplatiť a na doklade nie je ani
    QR kód. Pri novej firme sa toto pole preskočí ľahko — register
    ho nedopĺňa — a chyba sa ukáže až vtedy, keď peniaze neprídu.
  */
  const chybaIban = !sUctomFaktury(company ?? {}, inv).iban && (
    <div className="fk-oznam fk-oznam-pozor mt-3 rounded-md p-3 text-xs">
      <div className="font-semibold">{t("Chýba IBAN")}</div>
      <p className="mt-0.5">
        {t("Odberateľ nemá kam zaplatiť a na doklade nebude QR kód.")}
      </p>
      <Link
        to="/firma"
        className="mt-1 inline-block font-medium text-primary hover:underline"
      >
        {t("Doplniť v údajoch firmy")}
      </Link>
    </div>
  );
  const kartaPlatba = (sumaHore: boolean) =>
    inv.status === "paid" ? (
      <div className="fk-oznam fk-oznam-uspech rounded-xl p-5 text-sm">
        <div className="text-sm font-semibold">
          {t("Uhradené")}
        </div>
        {sumaHore && (
          <div className="suma text-lg font-semibold">
            {formatujMenu(sumaNaZobrazenie(inv, zostavaUhradit(inv.total, inv.advance_amount)), inv.currency)}
          </div>
        )}
        <div className="mt-2">
          {t("Dátum úhrady:")} {inv.paid_at ? String(inv.paid_at).slice(0, 10) : "—"}
        </div>
        <div>{t("Forma úhrady:")} {t(paymentMethodLabel(inv.payment_method))}</div>
        <div className="mt-2 text-xs">
          {t("Platobné údaje sa nezobrazujú — faktúra je zaplatená.")}
        </div>
      </div>
    ) : (
      <div className="rounded-xl border border-border bg-card p-5 text-sm">
        {sumaHore ? (
          /* Pri náhľade PDF je suma na úhradu hneď nad platobnými údajmi. */
          <div className="mb-3 border-b border-border pb-3">
            <div className="text-sm font-semibold text-muted-foreground">
              {jeDobropisNaZobrazenie(inv)
                ? t("Spolu")
                : ciastocneUhradena
                  ? t("Zostáva k úhrade")
                  : t("Spolu k úhrade")}
            </div>
            <div className="suma text-2xl font-semibold">
              {formatujMenu(
                sumaNaZobrazenie(inv, zostavaPoUhradach(inv.total, inv.advance_amount, uhradene)),
                inv.currency,
              )}
            </div>
          </div>
        ) : null}
        <div className="text-sm font-semibold text-muted-foreground">{t("Platba")}</div>
        <div className="mt-2">
          {t("IBAN:")}{" "}
          <span className="font-mono">
            {sUctomFaktury(company ?? {}, inv).iban
              ? formatujIban(sUctomFaktury(company ?? {}, inv).iban)
              : "—"}
          </span>
        </div>
        {vyberUctu}
        <div>
          {t("Variabilný symbol:")} <span className="font-mono">{vsVystavenej(inv)}</span>
        </div>
        <div>{t("Splatnosť:")} {popisSplatnosti(inv)}</div>
        {predlzenieSplatnosti}
        <div>{t("Forma úhrady:")} {t(paymentMethodLabel(inv.payment_method))}</div>
        {chybaIban}
      </div>
    );
  const kartyZalohySklad = (
    <>
      {/* Nájdená prichádzajúca platba (Spárovať) alebo „V banke sme platbu nenašli“. */}
      {inv.type === "proforma" && !inv.deleted_at && (
        <PlatbaZalohyDetail
          druh="vydana"
          companyId={inv.company_id}
          doklad={inv}
          mena={inv.currency}
          onZmena={() => load()}
        />
      )}
      {inv.type === "proforma" && (
        <div className="rounded-xl border border-border bg-card p-5 text-sm">
          <div className="text-sm font-semibold text-muted-foreground">
            {t("Zálohová faktúra")}
          </div>
          {settledIn ? (
            <div className="mt-2 space-y-1">
              <div>
                <StavWeb ton="uspech" maly>{t("Zúčtovaná")}</StavWeb>
              </div>
              <div>
                {t("Zúčtovaná vo faktúre:")}{" "}
                <Link
                  to="/faktury/$id"
                  params={{ id: settledIn.id }}
                  className="cislo-dokladu font-medium text-primary hover:underline"
                >
                  {settledIn.invoice_number}
                </Link>
              </div>
              <div className="text-xs text-muted-foreground">
                {datumNaDoklade(settledIn.issue_date)} · <span className="suma">{formatujMenu(settledIn.total, settledIn.currency)}</span>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-muted-foreground">
              {t("Zatiaľ nezúčtovaná. Zálohu môžete použiť pri vytváraní novej faktúry cez „Pridať zálohovú faktúru\".")}
            </div>
          )}

          {/*
            Daňová povinnosť vzniká prijatím platby, nie dodaním — platiteľ
            DPH musí do 15 dní vystaviť doklad k tejto platbe. Preto je
            ponuka priamo pri zálohovej faktúre, hneď ako je uhradená.
          */}
          {/* Neplatiteľ DPH doklad k platbe nevystavuje — karta len pri už existujúcom doklade. */}
          {(company?.vat_payer !== false || dokladKPlatbe) && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="text-sm font-semibold text-muted-foreground">
              {t("Daňový doklad k prijatej platbe")}
            </div>
            {dokladKPlatbe ? (
              <div className="mt-2 space-y-1">
                <Link
                  to="/faktury/$id"
                  params={{ id: dokladKPlatbe.id }}
                  className="cislo-dokladu font-medium text-primary hover:underline"
                >
                  {dokladKPlatbe.invoice_number}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {datumNaDoklade(dokladKPlatbe.issue_date)} · <span className="suma">{formatujMenu(dokladKPlatbe.total, dokladKPlatbe.currency)}</span> · {t("daň sa priznáva v tomto období")}
                </div>
              </div>
            ) : mozeDokladKPlatbe ? (
              <div className="mt-2 space-y-2">
                <p className="text-muted-foreground">
                  {inv.status === "paid"
                    ? t("Záloha je uhradená — ako platiteľ DPH musíte do 15 dní od prijatia platby vystaviť daňový doklad. Daň sa prizná v období platby a na vyúčtovacej faktúre sa už znovu nepočíta.")
                    : t("Záloha je čiastočne uhradená — daňový doklad sa vystaví na prijatú sumu. Daň sa prizná v období platby.")}
                </p>
                <button
                  type="button"
                  disabled={vystavujemDoklad}
                  onClick={() => setOknoDokladuKPlatbe(true)}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {vystavujemDoklad ? t("Vystavujem…") : t("Vystaviť daňový doklad")}
                </button>
              </div>
            ) : (
              <p className="mt-2 text-muted-foreground">
                {t("Vystaví sa až po úhrade zálohy — daňová povinnosť vzniká prijatím platby.")}
              </p>
            )}
          </div>
          )}
        </div>
      )}
      {odpocitaneZalohy.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 text-sm">
          <div className="text-sm font-semibold text-muted-foreground">
            {odpocitaneZalohy.length === 1 ? t("Zúčtovaná záloha") : t("Zúčtované zálohy")}
          </div>
          <ul className="mt-2 space-y-1">
            {odpocitaneZalohy.map((o) => {
              const p = klik({ to: "/faktury/$id", params: { id: o.advance_invoice_id } }, { klavesnica: false });
              return (
              <li key={o.advance_invoice_id} {...p} className={cn("flex flex-wrap items-baseline gap-2", p.className)}>
                <Link
                  to="/faktury/$id"
                  params={{ id: o.advance_invoice_id }}
                  className="cislo-dokladu font-medium text-primary hover:underline"
                >
                  {o.zaloha?.invoice_number ?? t("zálohová faktúra")}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {o.zaloha?.issue_date ? datumNaDoklade(o.zaloha.issue_date) : ""} · {t("odpočítané")}{" "}
                  <span className="suma">{formatujMenu(o.amount, o.zaloha?.currency ?? inv.currency)}</span>
                </span>
              </li>
              );
            })}
          </ul>
          {/* Súčet len pri jednej mene — zálohy v inej mene ostávajú každá so svojou sumou. */}
          {odpocitaneZalohy.length > 1 && sucetOdpocitanychZaloh(odpocitaneZalohy, inv.currency) !== null && (
            <div className="mt-2 text-xs text-muted-foreground">
              {t("Spolu odpočítané")}{" "}
              <strong className="suma">
                {formatujMenu(sucetOdpocitanychZaloh(odpocitaneZalohy, inv.currency) ?? 0, inv.currency)}
              </strong>
            </div>
          )}
        </div>
      )}
      {stockMoves.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 text-sm">
          <div className="text-sm font-semibold text-muted-foreground">{t("Sklad")}</div>
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
                      {reversed ? t("Sklad vrátený") : t("Sklad odpočítaný")}
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
                    className={`whitespace-nowrap text-right font-semibold tabular-nums ${reversed ? "fk-text-uspech" : "text-destructive"}`}
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
              {t("Pozrieť všetky pohyby →")}
            </Link>
          </div>
        </div>
      )}
    </>
  );

  /*
    Kompaktné rozloženie — ako nespracovaný doklad (NespracovanyKompaktny):
    veľký náhľad PDF na strane podľa voľby a úzky panel so sekciami.
  */
  const zamknuteObdobie = Boolean(
    ciselnikyFirmy.zamknuteDo && inv.issue_date && inv.issue_date <= ciselnikyFirmy.zamknuteDo,
  );
  /* Koncept, stav eFaktúry, schvaľovanie a chýbajúci IBAN — nad detailom (kompaktne navrchu panelu). */
  const upozornenia = (
    <>
      {inv.status === "draft" && (
        /*
          Koncept (najčastejšie kópia inej faktúry) sa dal doteraz len upraviť
          a uložiť znova ako koncept — vystaviť sa nedal nikde. Ľudia ho preto
          mazali a faktúru písali nanovo.
        */
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span>
            <strong>{t("Toto je koncept.")}</strong> {t("Odberateľ ho nemá a do prehľadov sa nepočíta.")}
          </span>
          <span className="flex flex-wrap gap-2">
            <Link
              to="/faktury/$id/upravit"
              params={{ id }}
              className="rounded-md border border-input bg-background px-3 py-1.5 font-medium hover:bg-secondary"
            >
              {t("Upraviť")}
            </Link>
            <button
              onClick={() => {
                // Bez textu nad položkami faktúra nevznikne — ten sa doplní v úprave.
                if (!String(inv.intro_note ?? "").trim()) {
                  toast.info(t("Doplňte text nad položkami a vystavte faktúru z úpravy."));
                  navigate({ to: "/faktury/$id/upravit", params: { id } });
                  return;
                }
                void setStatus("issued");
              }}
              className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:opacity-90"
            >
              {t("Vystaviť faktúru")}
            </button>
          </span>
        </div>
      )}
      {inv.status !== "draft" && inv.status !== "cancelled" && inv.type !== "proforma" && (
        <UpozornenieEfaktury stav={stavEf} onZnova={handleSendEfaktura} zaneprazdnene={efakturaOkno} />
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{t("eFaktúra:")}</span>
        <EfakturaStatusBadge status={efakturaUi} />
        {efakturaTest && (
          <span className="fk-oznam fk-oznam-pozor rounded-full px-2.5 py-1">
            {t("testovací režim — odberateľovi nič nepríde")}
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
            <Copy className="h-3 w-3" /> {t("Otvoriť platobný odkaz")}
          </a>
        )}
      </div>
      {inv.approval_status === "rejected" && inv.approval_note && (
        <div className="fk-oznam fk-oznam-chyba mb-4 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <XCircle className="h-4 w-4" /> {t("Faktúra bola zamietnutá zákazníkom")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {inv.approval_responded_at
              ? new Date(inv.approval_responded_at).toLocaleString("sk-SK")
              : ""}
          </div>
          <div className="mt-2 whitespace-pre-wrap text-sm">
            <span className="text-xs font-semibold">{t("Dôvod:")} </span>
            {inv.approval_note}
          </div>
        </div>
      )}
      {inv.approval_status === "pending" && inv.approval_requested_at && (
        <div className="fk-oznam fk-oznam-pozor mb-4 rounded-xl p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <ClockIcon className="h-4 w-4" /> {t("Čaká sa na schválenie zákazníkom")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("Odoslané {kedy} · odkaz platí 7 dní", { kedy: new Date(inv.approval_requested_at).toLocaleString("sk-SK") })}
          </div>
        </div>
      )}
      {/*
        Bez IBAN-u sa na faktúre nevykreslia platobné údaje ani QR platba —
        a doteraz sa to nikde nepovedalo. Doklad vyzeral hotovo a odberateľ
        nemal kam zaplatiť.
      */}
      {company && !sUctomFaktury(company, inv).iban && (
        <div className="fk-oznam fk-oznam-pozor mb-4 rounded-xl p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> {t("Faktúra nemá platobné údaje")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("Firma nemá vyplnený IBAN, takže na doklade nebude číslo účtu ani QR platba.")}{" "}
            <Link to="/firma" className="font-medium text-primary hover:underline">
              {t("Doplniť v nastaveniach firmy")}
            </Link>
          </div>
        </div>
      )}
      {/* Import histórie smie zapísať DPH aj neplatiteľovi (poistka v DB) — treba ho skontrolovať. */}
      {importDphNeplatitela(inv as any, company) && (
        <div
          className="mb-4 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm"
          data-testid="import-dph-neplatitel"
        >
          <div className="flex items-center gap-2 font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" /> {t("Importovaný doklad s DPH, hoci firma nie je platiteľ")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("Doklad prišiel z importu ({zdroj}) s DPH. Firma nie je platiteľ DPH — skontrolujte ho.", {
              zdroj: String((inv as any).import_source),
            })}
          </div>
        </div>
      )}
    </>
  );
  const kompaktnyDetail = kompaktne ? (
    /* Ako nespracovaný doklad v kompaktnom rozložení: náhľad PDF a panel so sekciami. */
    <VystavenaDetailKompaktna
      inv={inv}
      company={company}
      u={udajeUctovnika}
      poSplatnosti={isOverdue}
      polozky={items.map((it0) => polozkaNaZobrazenie(inv, it0))}
      nahlad={
        nahladDetail.zapnuty
          ? {
              subor:
                pdfVedla === undefined
                  ? undefined
                  : pdfVedla
                    ? {
                        url: pdfVedla.url,
                        nazov: `${inv.invoice_number ?? t("Faktúra")}.pdf`,
                        mime: "application/pdf",
                      }
                    : null,
              onSkryt: () => nahladDetail.prepni(false),
            }
          : null
      }
      upozornenie={upozornenia}
      stitky={kartaStitky}
      zamknuteObdobie={zamknuteObdobie}
      onStiahnut={handlePohodaExport}
      prilohy={
        <PrilohyFaktury
          dokladId={inv.id}
          mozeMenit={inv.status !== "cancelled"}
          onZmena={setPocetPriloh}
          kompaktne
          hlavny={{
            nazov: `${inv.invoice_number ?? t("Faktúra")}.pdf`,
            url: null,
            mime: "application/pdf",
            stiahni: () => void handleNahlad(),
          }}
        />
      }
      platbaDoplnok={
        <>
          {vyberUctu}
          {predlzenieSplatnosti}
          {chybaIban}
        </>
      }
      dalsie={
        <>
          {kartaZasielkovna}
          {kartyOpravaSchvalovanie}
          {kartyZalohySklad}
        </>
      }
      komentare={<KomentarePanel companyId={inv.company_id} agenda="vystavena" id={inv.id} />}
      historia={
        /* Bez záznamov sa rámček nekreslí — história sa však načíta aj tak (skrytá). */
        <div hidden={!pocetHistorie} data-historia-pocet={pocetHistorie ?? ""}>
          <ZbaleneK nadpis="História dokladu">{kartaHistoria}</ZbaleneK>
        </div>
      }
      onUhradena={() => void setStatus("paid")}
      onNeuhradena={() => void oznacNeuhradenu()}
      onZmena={() => void load()}
    />
  ) : null;

  return (
    <>
      {nahladUrl && (
        <NahladPdfOkno
          url={nahladUrl}
          nazov={inv.invoice_number ?? "faktura"}
          onClose={() => setNahladUrl(null)}
        />
      )}
      <DocumentDetailHeader
        title={inv.oprava_25a ? t("Opravný doklad (§ 25a)") : t(NAZOV_TYPU[inv.type as string] ?? "Faktúra")}
        number={inv.invoice_number}
        status={
          <>
            <StatusBadge status={akcie.odznak} />
            {akcie.vymazana && (
              <StavWeb ton="chyba" ikona={<Trash2 className="h-3 w-3" />}>
                {t("V koši")}
              </StavWeb>
            )}
            {inv.approval_status === "pending" && (
              <StavWeb ton={TON_SCHVALOVANIA.pending} ikona={<ClockIcon className="h-3 w-3" />}>
                {t("Čaká na schválenie")}
              </StavWeb>
            )}
            {inv.approval_status === "approved" && (
              <StavWeb ton={TON_SCHVALOVANIA.approved} ikona={<CheckCircle2 className="h-3 w-3" />}>
                {t("Schválené")}
              </StavWeb>
            )}
            {inv.approval_status === "rejected" && (
              <StavWeb ton={TON_SCHVALOVANIA.rejected} ikona={<XCircle className="h-3 w-3" />}>
                {t("Zamietnuté")}
              </StavWeb>
            )}
            {/* Stav eFaktúry (opakované odoslanie je v hlavnej akcii). */}
            {inv.status !== "draft" && inv.status !== "cancelled" && inv.type !== "proforma" && stavEf && (
              <StavWeb
                ton={
                  jeChybaEfaktury(stavEf)
                    ? "chyba"
                    : TON_EFAKTURY[
                        ({ odoslana: "sent", dorucena: "delivered", prijata: "accepted" } as Record<string, string>)[
                          stavEf.stav
                        ] ?? "sent"
                      ]
                }
                title={popisEfaktury(stavEf)}
                ikona={<IkonaEfaktury stav={stavEf} />}
              >
                <span data-efaktura-stav={stavEf.stav}>{t(textStavuEfaktury(stavEf))}</span>
                {efakturaTest ? ` (${t("test")})` : ""}
              </StavWeb>
            )}
          </>
        }
        meta={
          <MetaRiadok
            polozky={[
              /* Koncept ešte vystavený nie je — ukáže sa len plánovaný dátum vystavenia. */
              inv.status === "draft"
                ? t("Koncept, dátum vystavenia {datum}", { datum: datumNaDoklade(inv.issue_date) })
                : t("Vystavená {datum}", { datum: datumNaDoklade(inv.issue_date) }),
              <PoTermine aktivne={isOverdue}>{t("splatná {splatnost}", { splatnost: popisSplatnosti(inv) })}</PoTermine>,
              predlzena(inv) && inv.predlzenie_poznamka ? inv.predlzenie_poznamka : null,
            ]}
          />
        }
        primaryAction={
          /*
            Hlavné je odoslanie eFaktúrou, e-mail je vedľa ako obrysové tlačidlo.
            Zálohová faktúra nie je daňový doklad — cez eFaktúru sa neposiela,
            preto pri nej je hlavný e-mail a eFaktúra ostane vypnutá s vysvetlením.
          */
          akcie.vymazana ? (
            <PrimarnaAkcia onClick={() => void obnovFakturu()} disabled={obnovujem}>
              <RotateCcw className="h-4 w-4" />
              {t("Obnoviť z koša")}
            </PrimarnaAkcia>
          ) : inv.type === "proforma" ? (
            <PrimarnaAkcia onClick={openEmail} disabled={!akcie.email}>
              <Mail className="h-4 w-4" />
              {t("Odoslať e-mailom")}
            </PrimarnaAkcia>
          ) : (
            <PrimarnaAkcia
              onClick={handleSendEfaktura}
              disabled={efakturaOkno || !akcie.efaktura}
              title={akcie.dovodBezEfaktury ? t(akcie.dovodBezEfaktury) : undefined}
            >
              <Send className="h-4 w-4" />
              {stavEf?.stav === "zlyhala"
                ? t("Odoslať eFaktúru znova")
                : efakturaTest
                  ? t("Odoslať eFaktúru (test)")
                  : t("Odoslať eFaktúru")}
            </PrimarnaAkcia>
          )
        }
        secondaryActions={
          akcie.vymazana ? null : (
          <>
            {inv.type === "proforma" ? (
              <SekundarnaAkcia
                ikona={FileCheck2}
                label={t("eFaktúra")}
                onClick={handleSendEfaktura}
                disabled
                title={t("Zálohová faktúra nie je daňový doklad — pošlite ju e-mailom.")}
              />
            ) : (
              <SekundarnaAkcia
                ikona={Mail}
                label={t("E-mailom")}
                title={t("Odoslať e-mailom")}
                onClick={openEmail}
                disabled={!akcie.email}
              />
            )}
            <SekundarnaAkcia ikona={Eye} label={t("Náhľad")} onClick={handleNahlad} disabled={pdfBusy} />
            <SekundarnaAkcia
              ikona={inv.pdf_url ? Download : FileText}
              label={pdfBusy ? "…" : inv.pdf_url ? t("Stiahnuť PDF") : t("Vygenerovať PDF")}
              onClick={inv.pdf_url ? handleDownload : handleGenerate}
              disabled={pdfBusy}
            />
            <DokladPoradie
              tabulka="invoices"
              companyId={inv.company_id}
              id={inv.id}
              createdAt={inv.created_at}
              onOtvor={(dalsi) => navigate({ to: "/faktury/$id", params: { id: dalsi } })}
            />
          </>
          )
        }
        menuActions={
          akcie.vymazana ? null : (
          <>
            <MenuSkupina label={t("Úpravy a zaúčtovanie")}>
              {/*
                Upraviť sa dá aj vystavená a odoslaná faktúra — formulár to vždy
                vedel. Stornovaná faktúra sa už len archivuje.
              */}
              {inv.status !== "cancelled" && (
                <MenuAkcia asChild>
                  <Link to="/faktury/$id/upravit" params={{ id }}>
                    <Pencil className="h-4 w-4" />
                    {inv.status === "draft" ? t("Upraviť") : t("Opraviť faktúru")}
                  </Link>
                </MenuAkcia>
              )}
              {inv.status !== "cancelled" && (
                <MenuAkcia ikona={BookCheck} onClick={skocNaZauctovanie}>
                  {inv.zauctovane_at ? t("Zaúčtovanie") : t("Zaúčtovať")}
                </MenuAkcia>
              )}
              {/* Odovzdaná faktúra je zamknutá — opraviť sa dá až po vrátení z Pohody. */}
              {inv.exported_at && (
                <MenuAkcia
                  ikona={SendHorizontal}
                  onClick={async () => {
                    if (await poslatOpravu("faktura", inv.company_id, inv.id)) void load();
                  }}
                  title={t(popisPoslatOpravu(programOdovzdania), {
                    program: programOdovzdania ?? "",
                  })}
                >
                  {t(textPoslatOpravu(programOdovzdania), { program: programOdovzdania ?? "" })}
                </MenuAkcia>
              )}
              {akcie.odoslaneInak && (
                <MenuAkcia
                  ikona={Send}
                  onClick={() => setStatus("sent")}
                  title={t("Použite, ak ste faktúru odoslali mimo Faktera (poštou, osobne). Po odoslaní emailom sa stav nastaví automaticky.")}
                >
                  {t("Odoslané iným spôsobom")}
                </MenuAkcia>
              )}
              {akcie.uhradena && (
                <MenuAkcia ikona={CheckCircle2} onClick={() => setStatus("paid")}>
                  {t("Označiť ako uhradenú")}
                </MenuAkcia>
              )}
              {akcie.neuhradena && (
                <MenuAkcia ikona={Undo2} onClick={() => void oznacNeuhradenu()}>
                  {t("Označiť ako neuhradenú")}
                </MenuAkcia>
              )}
            </MenuSkupina>

            {/* Dobropis a ťarchopis k bežnej vystavenej faktúre; formulár si
                odberateľa, väzbu aj položky predvyplní. */}
            <MenuSkupina label={t("Nadväzné doklady")}>
              {/* Zálohová faktúra: daňový doklad k prijatej platbe — aktívny po úhrade (aj čiastočnej). */}
              {inv.type === "proforma" && company?.vat_payer !== false && !dokladKPlatbe && (
                <MenuAkcia
                  ikona={Receipt}
                  onClick={() => setOknoDokladuKPlatbe(true)}
                  disabled={!mozeDokladKPlatbe || vystavujemDoklad}
                  title={
                    mozeDokladKPlatbe
                      ? undefined
                      : t("Vystaví sa až po úhrade zálohy — daňová povinnosť vzniká prijatím platby.")
                  }
                >
                  {t("Vystaviť daňový doklad k platbe")}
                </MenuAkcia>
              )}
              {inv.type === "regular" && inv.status !== "draft" && inv.status !== "cancelled" && (
                <MenuAkcia asChild>
                  <Link to="/faktury/nova" search={{ type: "credit_note", opravuje: id } as any}>
                    <Undo2 className="h-4 w-4" />
                    {t("Vystaviť dobropis")}
                  </Link>
                </MenuAkcia>
              )}
              {/* Ťarchopis — dodatočné zvýšenie ceny k tej istej faktúre (§ 25). */}
              {inv.type === "regular" && inv.status !== "draft" && inv.status !== "cancelled" && (
                <MenuAkcia asChild>
                  <Link
                    to="/faktury/nova"
                    search={{ type: "debit_note", opravuje: id } as any}
                    title={t("Dodatočné zvýšenie ceny k tejto faktúre — opravná faktúra so zvýšením základu dane")}
                  >
                    <Plus className="h-4 w-4" />
                    {t("Vystaviť ťarchopis")}
                  </Link>
                </MenuAkcia>
              )}
              <MenuAkcia ikona={Copy} onClick={handleClone} disabled={cloneBusy}>
                {t("Klonovať")}
              </MenuAkcia>
            </MenuSkupina>

            {(inv.status === "draft" || inv.status === "issued") && inv.approval_status !== "approved" && (
              <MenuSkupina label={t("Schvaľovanie")}>
                <MenuAkcia ikona={Send} onClick={handleRequestApproval} disabled={approvalBusy}>
                  {inv.approval_status === "pending" ? t("Poslať znova na schválenie") : t("Poslať na schválenie")}
                </MenuAkcia>
              </MenuSkupina>
            )}

            {isOverdue && (
              <MenuSkupina label={t("Upomienky")}>
                <MenuAkcia ikona={Mail} onClick={openReminder}>
                  {t("Poslať upomienku")}
                </MenuAkcia>
              </MenuSkupina>
            )}

            {company?.online_payments_enabled && inv.status !== "paid" && inv.status !== "cancelled" && (
              <MenuSkupina label={t("Online platba")}>
                <MenuAkcia ikona={CreditCard} onClick={handleCreatePayLink} disabled={payBusy}>
                  {t("Vytvoriť platobný odkaz")}
                </MenuAkcia>
                {hasPayLink && (
                  <MenuAkcia ikona={RotateCw} onClick={handleSyncPayment} disabled={syncBusy}>
                    {t("Synchronizovať platbu")}
                  </MenuAkcia>
                )}
              </MenuSkupina>
            )}

            <MenuSkupina label={t("Export")}>
              <MenuAkcia ikona={RefreshCw} onClick={handleGenerate} disabled={pdfBusy}>
                {t("Pregenerovať PDF")}
              </MenuAkcia>
              {/* Nemecká firma Pohodu nemá — panel zaúčtovania tlačidlo tiež skrýva. */}
              {akcie.exportPohoda && (
                <MenuAkcia ikona={FileCode2} onClick={handlePohodaExport} disabled={exportBusy}>
                  {t("Export do Pohody XML")}
                </MenuAkcia>
              )}
              <MenuAkcia ikona={FileCheck2} onClick={handleGenerateXml} disabled={xmlBusy}>
                {efakturaDoc ? t("Pregenerovať eFaktúru XML") : t("Vygenerovať eFaktúru XML")}
              </MenuAkcia>
              {efakturaDoc && (
                <MenuAkcia ikona={Download} onClick={handleDownloadXml} disabled={xmlBusy}>
                  {t("Stiahnuť eFaktúru XML")}
                </MenuAkcia>
              )}
              {krajina === "DE" && inv.type !== "proforma" && (
                <MenuAkcia ikona={Download} onClick={handleXrechnung} disabled={xrechnungBusy}>
                  {xrechnungBusy ? t("Pripravujem…") : t("Stiahnuť XRechnung (XML)")}
                </MenuAkcia>
              )}
              {krajina === "CZ" && (
                <MenuAkcia ikona={Download} onClick={handleIsdoc} disabled={isdocBusy}>
                  {isdocBusy ? t("Pripravujem…") : t("Stiahnuť ISDOC")}
                </MenuAkcia>
              )}
            </MenuSkupina>

            <MenuSkupina>
              {inv.status !== "cancelled" && (
                <MenuAkcia ikona={Ban} onClick={() => setStatus("cancelled")} nebezpecna>
                  {t("Stornovať")}
                </MenuAkcia>
              )}
              <MenuAkcia ikona={Trash2} onClick={() => setDeleteOpen(true)} nebezpecna>
                {t("Vymazať")}
              </MenuAkcia>
            </MenuSkupina>
          </>
          )
        }
      />
      <PageBody>
        {akcie.vymazana ? (
          /*
            Faktúra z koša sa neotvára ako živá: len na čítanie a s jediným
            krokom — obnoviť. Akcie (úhrada, odoslanie, zaúčtovanie…) by inak
            menili doklad, ktorý v zozname ani v súčtoch nie je.
          */
          <div className="space-y-4" data-faktura-v-kosi="">
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <Trash2 className="h-4 w-4" /> {t("Faktúra je v koši")}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {t("Vymazaná {datum}. Nepočíta sa do zoznamov ani súčtov a nedá sa meniť, kým ju neobnovíte.", {
                    datum: datumNaDoklade(String(inv.deleted_at).slice(0, 10)),
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void obnovFakturu()}
                disabled={obnovujem}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" /> {t("Obnoviť z koša")}
              </button>
            </div>
            {kartaStrany}
            {kartaUvod}
            {kartaPolozky}
            {kartaSumar}
          </div>
        ) : (
        <>
        {kompaktne ? null : upozornenia}
        {kompaktnyDetail ? (
          kompaktnyDetail
        ) : (
        <DetailSNahladom
          zobrazit={nahladDetail.zapnuty}
          subor={pdfVedla}
          nazov={inv.invoice_number}
          onSkryt={() => nahladDetail.prepni(false)}
          naMobile
        >
        {pdfRozlozenie ? (
          /*
            Ako nespracovaný doklad: navrchu údaje, hneď pod nimi zaúčtovanie,
            potom platba a záloha (daňový doklad k platbe, odpočet), zvyšok nižšie.
          */
          <div className="min-w-0 space-y-4">
            <UdajePreUctovnika u={udajeUctovnika} />
            {kartaZauctovanie}
            {kartaPlatba(true)}
            {kartyZalohySklad}
            {kartaZasielkovna}
            {kartyOpravaSchvalovanie}
            {kartaStitky}
            {kartaPrilohy}
            {kartaKomentare}
            <ZbaleneK nadpis="Údaje faktúry">
              <div className="space-y-4">
                {kartaUvod}
                {kartaPolozky}
                {kartaPoznamka}
              </div>
            </ZbaleneK>
            {kartaKtoKedy}
            {kartaHistoria}
          </div>
        ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-6">
            {kartaStrany}
            {kartaUvod}
            {kartaPolozky}
            {kartaPoznamka}
            {kartaPrilohy}
            {kartaZauctovanie}
            {kartaKtoKedy}
            {kartaHistoria}
          </div>

          <aside className="space-y-4">
            {kartaZasielkovna}
            {kartaSumar}
            {/* Platba hneď pod sumárom — doteraz bola až pod komentármi. */}
            {kartaPlatba(false)}
            {kartyOpravaSchvalovanie}
            {kartaStitky}
            {kartaKomentare}
            {kartyZalohySklad}
          </aside>
        </div>
        )}
        </DetailSNahladom>
        )}
        </>
        )}
      </PageBody>
      {efakturaOkno && inv?.company_id && (
        <OdoslanieEfakturyOkno
          companyId={inv.company_id}
          invoiceId={id}
          cislo={inv.invoice_number ?? ""}
          test={efakturaTest}
          onClose={() => setEfakturaOkno(false)}
          onOdoslane={poOdoslaniEfaktury}
          onZmenaDatumu={load}
        />
      )}
      {datumOkno.okno}
      {inv?.type === "proforma" && (
        <DokladKPlatbeOkno
          open={oknoDokladuKPlatbe}
          onOpenChange={setOknoDokladuKPlatbe}
          predvolenaSuma={sumaDokladuKPlatbe}
          predvolenyDatum={datumDokladuKPlatbe}
          celkom={Number(inv.total ?? 0)}
          mena={inv.currency}
          busy={vystavujemDoklad}
          onVystav={(v) => void vystavDoklad(v)}
        />
      )}
      {emailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEmailOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("Odoslať faktúru e-mailom")}
            className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-card p-5 max-h-[calc(100dvh-2rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">{t("Odoslať faktúru e-mailom")}</h3>
            <label className="block text-sm">
              <span className="font-medium">{t("Príjemca")}</span>
              <input
                type="email"
                value={emailForm.recipient_email}
                onChange={(e) => setEmailForm({ ...emailForm, recipient_email: e.target.value })}
                placeholder="odberatel@firma.sk"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              {!emailForm.recipient_email && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("Odberateľ nemá uloženú adresu — napíšte ju sem, alebo ju doplňte v jeho karte.")}
                </span>
              )}
            </label>
            {emailSablona && (
              <VyberEmailSablony
                companyId={inv?.company_id}
                typ={(inv as any)?.type}
                jazyk={emailSablona.jazyk}
                hodnoty={emailSablona.hodnoty}
                predvolene={emailSablona.predvolene}
                onPouzi={(m) => setEmailForm((f) => ({ ...f, subject: m.predmet, message: m.text }))}
              />
            )}
            <label className="block text-sm">
              <span className="font-medium">{t("Predmet")}</span>
              <input
                value={emailForm.subject}
                onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("Správa")}</span>
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
                  <span className="font-medium">{t("Odoslať aj prílohy dokladu")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {pocetPriloh === 1
                      ? t("K dokladu visí 1 príloha")
                      : t("K dokladu visia prílohy: {n}", { n: pocetPriloh })}
                    {t(". Pôjdu v tom istom maile ako faktúra.")}
                  </span>
                </span>
              </label>
            )}
            <p className="text-xs text-muted-foreground">
              {t("PDF faktúry sa pripojí automaticky. Ak ešte neexistuje, vygeneruje sa pred odoslaním.")}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEmailOpen(false)}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-secondary"
              >
                {t("Zrušiť")}
              </button>
              <button
                onClick={submitEmail}
                disabled={emailBusy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {emailBusy ? t("Odosielam…") : t("Odoslať")}
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
            aria-label={t("Poslať upomienku")}
            className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-card p-5 max-h-[calc(100dvh-2rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">
              {t("Poslať upomienku ({n}.)", { n: reminderForm.reminderNumber })}
            </h3>
            <label className="block text-sm">
              <span className="font-medium">{t("Príjemca")}</span>
              <input
                value={reminderForm.recipient_email}
                onChange={(e) =>
                  setReminderForm({ ...reminderForm, recipient_email: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("Predmet")}</span>
              <input
                value={reminderForm.subject}
                onChange={(e) => setReminderForm({ ...reminderForm, subject: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{t("Správa")}</span>
              <textarea
                rows={10}
                value={reminderForm.message}
                onChange={(e) => setReminderForm({ ...reminderForm, message: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            {reminderForm.doplnok && (
              <div className="text-xs text-muted-foreground">
                <div className="font-medium">{t("Pod správu sa pripojí:")}</div>
                <pre className="mt-1 whitespace-pre-wrap font-sans">{reminderForm.doplnok}</pre>
              </div>
            )}
            {reminders.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {t("Predchádzajúce upomienky:")}{" "}
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
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-secondary"
              >
                {t("Zrušiť")}
              </button>
              <button
                onClick={submitReminder}
                disabled={reminderBusy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {reminderBusy ? t("Odosielam…") : t("Odoslať upomienku")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        title={t("Naozaj chcete vymazať túto faktúru?")}
        message={t("Faktúra {cislo} bude skrytá z rozhrania. Môžete ju neskôr obnoviť v zozname vymazaných.", { cislo: inv.invoice_number })}
        warning={
          inv.status === "paid" || inv.status === "sent"
            ? t("Táto faktúra je už odoslaná alebo zaplatená. Mazanie môže narušiť účtovnú stopu.")
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
      <span className="whitespace-nowrap text-right tabular-nums">{value}</span>
    </div>
  );
}
