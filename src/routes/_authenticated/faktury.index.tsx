import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { NahladPdfOkno } from "@/components/faktero/NahladPdfOkno";
import { OdovzdaneIkona } from "@/components/faktero/OdovzdaneIkona";
import { useExportDoProgramu } from "@/hooks/useExportDoProgramu";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { jeZapnute } from "@/lib/faktero/search-parametre";
import { jeOtvorena } from "@/lib/faktero/faktury-sumy";
import { sumaNaZobrazenie } from "@/lib/faktero/dobropis-zobrazenie";
import { SuctovaListaVyberu } from "@/components/faktero/SuctovaListaVyberu";
import { polozkaVystavenej } from "@/lib/faktero/suhrn-vyberu";
import { SuctovaPatickaZoznamu } from "@/components/faktero/SuctyDokladov";
import { useSuhrnVystavenych, useSuhrnVyberuVystavenych } from "@/hooks/useSuhrnVystavenych";
import { DNI_PAROVANIA, MAX_PAROVANIA } from "@/lib/faktero/parovanie-limity";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { StatusBadge } from "./dashboard";
import {
  Plus,
  FileCode2,
  Loader2,
  Trash2,
  Hash,
  RotateCcw,
  Copy,
  Bell,
  CheckCircle2,
  Mail,
  CalendarPlus,
  Archive,
  Landmark,
  X,
  Zap,
  BookCheck,
  Eye,
  FileCheck2,
  Send,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { exportInvoicesFn } from "@/lib/faktero/export.functions";
import { toastNeodovzdane } from "@/components/faktero/NeodovzdaneDoklady";
import { cloneInvoiceFn } from "@/lib/faktero/invoice-clone.functions";
import { bulkMarkPaidFn } from "@/lib/faktero/invoice-bulk.functions";
import { sendInvoiceEmailFn } from "@/lib/faktero/email.functions";
import {
  kontrolaDatumuVystaveniaFn,
  zmenDatumVystaveniaNaDnesFn,
} from "@/lib/faktero/datum-vystavenia.functions";
import { potvrd } from "@/lib/potvrdenie";
import { sendReminderFn } from "@/lib/faktero/reminders.functions";
import { generateInvoicePdf, getInvoicePdfSignedUrl } from "@/lib/faktero/pdf.functions";
import { toast } from "sonner";
import { usePagedList } from "@/hooks/usePagedList";
import { SELECT_VYSTAVENYCH } from "@/lib/faktero/stlpce-zoznamov";
import {
  ListPagination,
  type MoznostZoradenia,
  ConfirmDialog,
  BulkBar,
} from "@/components/faktero/ListControls";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { formatujMenu } from "@/lib/faktero/mena";
import { supabase } from "@/integrations/supabase/client";
import { ZauctovanieFakturOkno } from "@/components/faktero/ZauctovanieFakturOkno";
import { useStavSchvalovania, farbaOdznaku } from "@/hooks/useStavSchvalovania";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { SNahladom, useBocnyNahlad, useSipkyNahladu } from "@/components/faktero/BocnyNahlad";
import { DocumentListToolbar, HlavickaViac } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";
import {
  posliEfakturuFn,
  skontrolujPredOdoslanimFn,
} from "@/lib/faktero/efaktura/efaktura.functions";
import { useEfakturaTestovaciRezim } from "@/components/faktero/EfakturaTestovaciRezim";
import { filtrujObdobie, datumDodania, type DatumObdobia } from "@/lib/faktero/obdobie-filter";
import { HromadnaAkciaDokladov } from "@/components/faktero/HromadnaAkciaDokladov";
import { VyberVRiadku, moznostiKodov } from "@/components/faktero/VyberVRiadku";
import { VyberStavuDokladu, StavDokladuOdznak } from "@/components/faktero/StavDokladu";
import { useCiselnikyDokladov, filtreStavuAStitkov } from "@/hooks/useCiselnikyDokladov";
import { dovodZamku, NAZOV_ZAMKU, platbaPreZoradenie } from "@/lib/faktero/doklady-hromadne";
import { zoradPodlaDokladu } from "@/lib/faktero/predkontacie";
import { zauctujVystavenuFn } from "@/lib/faktero/zauctovanie.functions";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
type BulkAction = null | "paid" | "email" | "efaktura" | "clone" | "reminder" | "zip";

/** Ponuka zoradenia. Prvá možnosť je predvolená — od najnovšej faktúry. */
const ZORADENIE_FAKTUR: MoznostZoradenia[] = [
  { label: "Najnovšie prvé", column: "issue_date" },
  { label: "Najstaršie prvé", column: "issue_date", ascending: true },
  { label: "Dátum dodania zostupne", column: "delivery_date" },
  { label: "Dátum dodania vzostupne", column: "delivery_date", ascending: true },
  { label: "Číslo zostupne", column: "invoice_number" },
  { label: "Číslo vzostupne", column: "invoice_number", ascending: true },
  { label: "Najbližšia splatnosť", column: "due_date", ascending: true },
  { label: "Najvyššia suma", column: "total" },
  { label: "Najnižšia suma", column: "total", ascending: true },
  { label: "Naposledy pridané", column: "created_at" },
];

/**
 * Filtre z menu (Dobropisy, Koncepty), z AI asistenta (po splatnosti,
 * neodoslané) a `q` z vyhľadávania v hlavičke.
 *
 * Čo tu nie je vymenované, to sa z adresy zahodí — takže odkaz s parametrom,
 * ktorý tu chýba, otvorí nefiltrovaný zoznam a nikde sa to neohlási. Presne to
 * robili karty v AI asistentovi s `?status=overdue`.
 */
type InvoiceSearch = {
  /** credit = dobropisy a ťarchopisy, vydane = len bežné faktúry, danove = daňové doklady k platbe. */
  type?: "credit" | "vydane" | "danove";
  status?: "draft" | "issued";
  poSplatnosti?: true;
  /**
   * Neuhradené — teda pohľadávky. Nie je to stav v databáze: faktúra môže byť
   * `issued` aj `sent` a obe sú neuhradené, kým nemajú úhradu. Preto vlastný
   * parameter a nie `status`.
   */
  neuhradene?: true;
  q?: string;
};

type Splatnost = {
  id?: string;
  status?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
};

/**
 * „Po splatnosti" nie je stav v databáze — nikto ho tam nezapisuje. Je to
 * výpočet z dátumu splatnosti a úhrady, takže sa filtruje až nad načítanými
 * riadkami a nie cez `equals`.
 */
function jePoSplatnosti(r: Splatnost, dnes: string): boolean {
  return (
    (r.status === "issued" || r.status === "sent") &&
    !!r.due_date &&
    r.due_date < dnes &&
    !r.paid_at
  );
}

export const Route = createFileRoute("/_authenticated/faktury/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Faktúry — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>): InvoiceSearch => ({
    type: s.type === "credit" || s.type === "vydane" || s.type === "danove" ? s.type : undefined,
    status: s.status === "draft" || s.status === "issued" ? s.status : undefined,
    // Smerovač si hodnotu z adresy rozparsuje sám: `=true` je `true`, `=1` je
    // číslo `1`. Porovnanie s reťazcom `"1"` preto neplatilo nikdy a odkaz
    // napísaný ručne otvoril nefiltrovaný zoznam — presne to, čo tu opravujeme.
    poSplatnosti: jeZapnute(s.poSplatnosti) ? true : undefined,
    neuhradene: jeZapnute(s.neuhradene) ? true : undefined,
    ...zoznamSearch(s),
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { type, status, poSplatnosti, neuhradene, q } = Route.useSearch();
  // Hľadanie, filtre, zoradenie a strana sú v adrese — `?q=` z hľadania v hlavičke je to isté pole.
  const lf = useListFilters({ pageSizeKey: "invoices", defaultSort: { column: "issue_date", ascending: false } });
  const podla = (lf.filter("podla") || "vystavenie") as DatumObdobia;
  const { od: obdobieOd, do: obdobieDo } = lf.rozsah("obdobie");
  const exportovane = lf.filter("export") as "" | "ano" | "nie";
  const overdueNoReminder = lf.zapnute("bezUpomienky");
  // Opravné faktúry: dobropis `credit_note` a ťarchopis `debit_note`; v adrese je kratšie `credit`.
  const equals = useMemo(
    () => ({
      ...(type === "credit"
        ? { type: ["credit_note", "debit_note"] }
        : type === "vydane"
          ? { type: ["regular"] }
          : type === "danove"
            ? { type: ["advance_payment"] }
            : {}),
      ...(status ? { status } : {}),
    }),
    [type, status],
  );
  // Obdobie a „len neexportované“ filtruje databáza, nie načítaná stránka —
  // inak by na druhej strane chýbali faktúry, ktoré na prvú nevošli.
  const stavFiltra = lf.filter("stavDokladu");
  const stitokFiltra = lf.filter("stitok");
  const upravDotaz = useCallback(
    (dotaz: any) => {
      let d = filtrujObdobie(dotaz, podla, obdobieOd || null, obdobieDo || null);
      if (stavFiltra === "_bez") d = d.is("stav_id", null);
      else if (stavFiltra) d = d.eq("stav_id", stavFiltra);
      if (stitokFiltra) d = d.contains("stitky", [stitokFiltra]);
      // Koncept ani stornovaná sa do účtovníctva neexportujú, tak tu nepatria.
      if (exportovane === "ano") d = d.not("exported_at", "is", null);
      if (exportovane === "nie") d = d.is("exported_at", null).not("status", "in", "(draft,cancelled)");
      return d;
    },
    [podla, obdobieOd, obdobieDo, exportovane, stavFiltra, stitokFiltra],
  );
  const list = usePagedList({
    resource: "invoices",
    // Bez `select *` — stránka 100 faktúr COPY PRINTU 276 kB → 183 kB.
    stlpce: SELECT_VYSTAVENYCH,
    searchColumns: ["invoice_number", "customer_name", "customer_ico"],
    equals: Object.keys(equals).length ? equals : undefined,
    // Od najnovšej. Predtým sa radilo podľa `created_at`, čo je pri
    // naimportovaných faktúrach čas importu — všetky mali rovnaký a zoznam
    // vyzeral zoradený odzadu.
    orderBy: { column: "issue_date", ascending: false },
    upravDotaz,
    riadenie: lf,
    filterKey: `${podla}|${obdobieOd}|${obdobieDo}|${exportovane}|${stavFiltra}|${stitokFiltra}`,
  });
  // Predkontácie, vlastné stavy, štítky a uzávierka — raz za firmu, nie za riadok.
  const cis = useCiselnikyDokladov(getActiveCompanyId(), "vystavena");
  const stavPodlaId = useMemo(() => new Map(cis.stavy.map((s) => [s.id, s])), [cis.stavy]);
  /* Voľby predkontácie do riadku — líšia sa len podľa platby, nepočítajú sa
     znova pre každý zo stoviek riadkov pri každom prekreslení. */
  const moznostiPredkontacie = useMemo(() => {
    const pamat = new Map<string, ReturnType<typeof moznostiKodov>>();
    return (platba: ReturnType<typeof platbaPreZoradenie>) => {
      const k = String(platba);
      let m = pamat.get(k);
      if (!m) {
        m = moznostiKodov(
          zoradPodlaDokladu(cis.navrhy?.predkontacie ?? [], { typ: "faktura", platba }),
        );
        pamat.set(k, m);
      }
      return m;
    };
  }, [cis.navrhy]);
  /** Predkontácia v riadku — tá istá funkcia ako panel zaúčtovania v detaile (len uloží, nezaúčtuje). */
  async function zmenPredkontaciuRiadku(i: any, kodPk: string) {
    const c = getActiveCompanyId();
    if (!c) return;
    try {
      await zauctujVystavenuFn({
        data: {
          company_id: c,
          id: i.id,
          predkontacia: kodPk || null,
          clenenie: i.pohoda_clenenie_dph ?? null,
          kv: i.kv_clenenie ?? null,
          stredisko: i.stredisko ?? null,
          cinnost: i.cinnost ?? null,
          intPoznamka: i.int_poznamka ?? null,
          lenUlozit: true,
        },
      });
      list.reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("Predkontáciu sa nepodarilo uložiť"));
    }
  }
  // „Zobraziť vymazané“ je filter v adrese, kôš však prepína zoznam.
  const ajVymazane = lf.zapnute("vymazane");
  const setShowDeleted = list.setShowDeleted;
  useEffect(() => setShowDeleted(ajVymazane), [ajVymazane, setShowDeleted]);
  const [busy, setBusy] = useState(false);
  const [rowDelete, setRowDelete] = useState<any | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [reminderMap, setReminderMap] = useState<Record<string, number>>({});
  const [efakturaMap, setEfakturaMap] = useState<Record<string, EfakturaStav>>({});
  const exportFn = useServerFn(exportInvoicesFn);
  const [zauctovanie, setZauctovanie] = useState(false);
  const sch = useStavSchvalovania(
    getActiveCompanyId(),
    "vystavena",
    list.rows.filter((r: any) => r.status !== "draft").map((r: any) => r.id),
  );
  const cloneFn = useServerFn(cloneInvoiceFn);
  const pdfUrlFn = useServerFn(getInvoicePdfSignedUrl);
  const [nahlad, setNahlad] = useState<{ url: string; nazov: string } | null>(null);
  /** Náhľad PDF priamo zo zoznamu — v okne, bez sťahovania. */
  async function nahladRiadku(i: any) {
    try {
      const r = await pdfUrlFn({ data: { invoiceId: i.id } });
      if (r?.signedUrl) setNahlad({ url: r.signedUrl, nazov: i.invoice_number ?? "faktura" });
    } catch (e: any) {
      toast.error(e?.message ?? t("PDF sa nepodarilo pripraviť."));
    }
  }
  // Náhľad vedľa zoznamu — pri účtovaní netreba otvárať každú faktúru zvlášť.
  const bocny = useBocnyNahlad("faktury");
  const markPaidFn = useServerFn(bulkMarkPaidFn);
  const emailFn = useServerFn(sendInvoiceEmailFn);
  const kontrolaDatumuFn = useServerFn(kontrolaDatumuVystaveniaFn);
  const posliEfakturu = useServerFn(posliEfakturuFn);
  const skontrolujEfaktury = useServerFn(skontrolujPredOdoslanimFn);
  const efakturaTest = useEfakturaTestovaciRezim();
  const zmenDatumFn = useServerFn(zmenDatumVystaveniaNaDnesFn);
  const reminderFn = useServerFn(sendReminderFn);
  const pdfFn = useServerFn(generateInvoicePdf);

  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  /*
   * Tlačidlo na párovanie má zmysel len firme, ktorá má pripojenú banku, a
   * číslo pri ňom hovorí, koľko príchodzích platieb ešte nie je priradených —
   * bez toho by používateľ nemal ako vedieť, že je čo párovať.
   */
  const [maBanku, setMaBanku] = useState(false);
  const [cakaNaParovanie, setCakaNaParovanie] = useState(0);
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("bank_accounts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", cid)
      .then(({ count }) => setMaBanku((count ?? 0) > 0));
    /*
      Odznak musí počítať to isté, s čím párovacia stránka pracuje. Bez okna
      hlásil MaxiTicketu 7 987 platieb, pritom stránka berie len posledných
      400 dní a najviac 2 000 — číslo, na ktoré sa nedalo nikdy dostať.
    */
    const od = new Date(Date.now() - DNI_PAROVANIA * 86400000).toISOString().slice(0, 10);
    supabase
      .from("bank_transactions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", cid)
      .is("matched_invoice_id", null)
      .is("vybavenie", null)
      .gt("amount", 0)
      .gte("booking_date", od)
      .then(({ count }) => setCakaNaParovanie(Math.min(count ?? 0, MAX_PAROVANIA)));
  }, []);

  useEffect(() => {
    const ids = list.rows.map((r: any) => r.id);
    if (ids.length === 0) {
      setReminderMap({});
      return;
    }
    supabase
      .from("invoice_reminders")
      .select("invoice_id, reminder_number")
      .in("invoice_id", ids)
      .eq("status", "sent")
      .then(({ data }) => {
        const m: Record<string, number> = {};
        for (const r of data ?? []) {
          const n = (r as any).reminder_number as number;
          const id = (r as any).invoice_id as string;
          if (!m[id] || m[id] < n) m[id] = n;
        }
        setReminderMap(m);
      });
  }, [list.rows]);

  // Či faktúra odišla ako eFaktúra — rovnaké pravidlo ako na detaile: rozhoduje
  // posledné doručenie dokumentu, zlyhané či odmietnuté sa neráta za odoslané.
  useEffect(() => {
    const ids = list.rows.map((r: any) => r.id);
    if (ids.length === 0) {
      setEfakturaMap({});
      return;
    }
    let zruseny = false;
    (async () => {
      const { data: docs } = await supabase
        .from("efaktura_documents")
        .select("id, invoice_id")
        .in("invoice_id", ids);
      const faktura: Record<string, string> = {};
      for (const d of docs ?? []) if (d.invoice_id) faktura[d.id] = d.invoice_id;
      const docIds = Object.keys(faktura);
      if (docIds.length === 0) {
        if (!zruseny) setEfakturaMap({});
        return;
      }
      const { data: dorucenia } = await supabase
        .from("efaktura_deliveries")
        .select("document_id, status, delivered_at, created_at")
        .in("document_id", docIds)
        .order("created_at", { ascending: true });
      const m: Record<string, EfakturaStav> = {};
      // Vzostupne podľa času — posledné doručenie prepíše staršie pokusy.
      for (const d of dorucenia ?? []) {
        const id = faktura[d.document_id];
        if (!id) continue;
        m[id] = ["failed", "rejected"].includes(String(d.status))
          ? { stav: "zlyhala" }
          : d.status === "delivered" || d.status === "accepted"
            ? { stav: "dorucena", kedy: d.delivered_at }
            : { stav: "odoslana" };
      }
      if (!zruseny) setEfakturaMap(m);
    })();
    return () => {
      zruseny = true;
    };
  }, [list.rows]);

  const today = dnesBratislava();
  const visibleRows = useMemo(() => {
    let riadky = list.rows;
    if (poSplatnosti) riadky = riadky.filter((r: Splatnost) => jePoSplatnosti(r, today));
    // Rovnaká definícia ako v prehľade, inak by dlaždica a zoznam ukazovali
    // dve rôzne čísla a človek by nevedel, ktorému veriť.
    if (neuhradene) riadky = riadky.filter((r: any) => jeOtvorena(r));
    if (overdueNoReminder) {
      riadky = riadky.filter(
        (r: Splatnost) => jePoSplatnosti(r, today) && !reminderMap[r.id as string],
      );
    }
    return riadky;
  }, [list.rows, poSplatnosti, neuhradene, overdueNoReminder, reminderMap, today]);

  useSipkyNahladu(
    bocny.zapnuty,
    visibleRows.map((r: any) => r.id),
    bocny.vybrany,
    bocny.setVybrany,
  );

  async function cloneRow(invoiceId: string) {
    try {
      const r = await cloneFn({ data: { invoiceId } });
      toast.success(t("Faktúra bola skopírovaná"));
      navigate({ to: "/faktury/$id/upravit", params: { id: r.id } });
    } catch (e: any) {
      toast.error(e?.message ?? t("Klonovanie zlyhalo"));
    }
  }

  const sensitiveSelected = list.rows.filter(
    (r) => list.selected[r.id] && (r.status === "paid" || r.status === "sent"),
  ).length;

  const program = useExportDoProgramu();
  async function bulkExport() {
    const cid = getActiveCompanyId();
    if (!cid || !list.selectedIds.length) return;
    // Firma s iným programom než Pohoda dostane zaúčtovaný súbor pre svoj program.
    if (program.inyProgram) {
      if (await program.spusti("vystavena", list.selectedIds)) list.clearSelection();
      return;
    }
    setBusy(true);
    try {
      const r = await exportFn({
        data: { companyId: cid, invoiceIds: list.selectedIds, format: "pohoda_xml" },
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
      toast.success(t("Exportované faktúry: {n}", { n: r.invoiceCount }));
      toastNeodovzdane(t, r.preskocene);
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? t("Export zlyhal"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRowDelete() {
    if (!rowDelete) return;
    try {
      await list.softDelete([rowDelete.id]);
      toast.success(t("Faktúra vymazaná"));
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setRowDelete(null);
    }
  }
  async function confirmBulkDelete() {
    try {
      await list.softDelete(list.selectedIds);
      toast.success(t("Vymazané faktúry: {n}", { n: list.selectedIds.length }));
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBulkDelete(false);
    }
  }
  const [bulkHardDelete, setBulkHardDelete] = useState(false);
  /** Vyprázdnenie koša — bez označovania riadkov, na celú aktuálnu stránku koša. */
  const [vyprazdnitKos, setVyprazdnitKos] = useState(false);
  async function confirmVyprazdnitKos() {
    const ids = list.rows.map((r: any) => r.id);
    try {
      await list.hardDelete(ids);
      toast.success(t("Kôš vyprázdnený — natrvalo vymazaných {n} faktúr", { n: ids.length }));
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setVyprazdnitKos(false);
    }
  }
  async function confirmBulkHardDelete() {
    const pocet = list.selectedIds.length;
    try {
      await list.hardDelete(list.selectedIds);
      toast.success(t("Natrvalo vymazané faktúry: {n}", { n: pocet }));
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBulkHardDelete(false);
    }
  }
  async function bulkRestoreNow() {
    try {
      await list.restore(list.selectedIds);
      toast.success(t("Obnovené"));
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    }
  }

  const selectedRows = useMemo(
    () => list.rows.filter((r: any) => list.selected[r.id]),
    [list.rows, list.selected],
  );
  /*
    Súčty (P-1007): za označené z načítaných riadkov, za celý filter z
    databázy — zoznam je stránkovaný, súčet stránky by klamal. Kontext povie,
    či sa počítajú koncepty a zálohové (len vo vlastnej záložke).
  */
  const kontextSuctu = useMemo(
    () => ({ typy: (equals as any).type ?? null, status: status ?? null }),
    [equals, status],
  );
  const rozpisVyberu = useSuhrnVyberuVystavenych(selectedRows, kontextSuctu);
  const sucetFiltra = useSuhrnVystavenych(
    {
      companyId: getActiveCompanyId(),
      typy: kontextSuctu.typy,
      status: status ?? null,
      hladanie: list.search,
      podla,
      od: obdobieOd || null,
      do: obdobieDo || null,
      stav: stavFiltra || null,
      stitok: stitokFiltra || null,
      export: exportovane || null,
      neuhradene: !!neuhradene,
      poSplatnosti: !!poSplatnosti,
      bezUpomienky: overdueNoReminder,
    },
    { vypnute: list.showDeleted, nonce: list.rows },
  );
  const emailableCount = selectedRows.filter(
    (r: any) => (r.status === "issued" || r.status === "sent") && r.customer_email,
  ).length;
  const overdueSelectedCount = selectedRows.filter(
    (r: any) =>
      (r.status === "issued" || r.status === "sent") &&
      r.due_date &&
      r.due_date < today &&
      !r.paid_at,
  ).length;

  async function runBulkPaid() {
    setBusy(true);
    setBulkAction(null);
    try {
      const r = await markPaidFn({ data: { invoiceIds: list.selectedIds } });
      toast.success(
        r.skipped > 0
          ? t("{n} faktúr označených ako zaplatené ({m} preskočených)", { n: r.updated, m: r.skipped })
          : t("{n} faktúr označených ako zaplatené", { n: r.updated }),
      );
      list.clearSelection();
      list.reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("Označenie zlyhalo"));
    } finally {
      setBusy(false);
    }
  }

  /*
    Spoločné pre hromadný e-mail aj eFaktúru: faktúry so starým dátumom
    vystavenia sa po súhlase zmenia na dnes, nemeniteľné sa preskočia.
    Vráti null, keď sa nemá odosielať nič.
  */
  async function overDatumy(targets: any[], prazdne: string) {
    /*
      Prvé odoslanie len s dnešným dátumom vystavenia. Faktúry so starším
      dátumom sa po súhlase zmenia na dnes; tie, ktoré sa zmeniť nedajú
      (uzamknuté obdobie, export), sa hromadne neodošlú — pôvodný dátum sa dá
      potvrdiť len jednotlivo na detaile.
    */
    let kontroly: Record<string, any> = {};
    try {
      kontroly = await kontrolaDatumuFn({ data: { invoiceIds: targets.map((r: any) => r.id) } });
    } catch {
      /* rozhodne server pri odoslaní */
    }
    const naZmenu = targets.filter((r: any) => kontroly[r.id]?.treba && kontroly[r.id]?.mozno);
    const nemenitelne = targets.filter((r: any) => kontroly[r.id]?.treba && !kontroly[r.id]?.mozno);
    if (naZmenu.length || nemenitelne.length) {
      const riadky = [
        t("Faktúry so starším dátumom vystavenia: {n}. Faktúra sa odosiela dnes — dátum vystavenia by mal byť aktuálny.", {
          n: naZmenu.length + nemenitelne.length,
        }),
        naZmenu.length
          ? t("Dátum vystavenia sa zmení na dnes pri {n} z nich, splatnosť sa posunie o rovnaký počet dní a dátum dodania ostáva.", { n: naZmenu.length })
          : "",
        nemenitelne.length
          ? t("Faktúry, ktorým sa dátum zmeniť nedá (uzamknuté obdobie alebo export do účtovníctva): {n}. Hromadne sa neodošlú — pošlite ich jednotlivo z detailu faktúry.", { n: nemenitelne.length })
          : "",
      ].filter(Boolean);
      const ano = await potvrd(riadky.join("\n"), {
        potvrdit: naZmenu.length ? t("Zmeniť dátum vystavenia na dnes a odoslať") : t("Odoslať ostatné"),
        nebezpecne: false,
      });
      if (!ano) return null;
    }
    const preskocit = new Set(nemenitelne.map((r: any) => r.id));
    const naOdoslanie = targets.filter((r: any) => !preskocit.has(r.id));
    if (!naOdoslanie.length) {
      toast.error(prazdne);
      return null;
    }
    return { naOdoslanie, menit: new Set<string>(naZmenu.map((r: any) => r.id)) };
  }

  /** Faktúry z výberu, ktoré ešte neodišli ako eFaktúra a dajú sa ňou poslať. */
  const efakturovatelne = (riadky: any[]) =>
    riadky.filter(
      (r: any) =>
        r.status !== "draft" &&
        r.status !== "cancelled" &&
        r.type !== "proforma" &&
        efakturaMap[r.id]?.stav !== "odoslana" &&
        efakturaMap[r.id]?.stav !== "dorucena",
    );
  const efakturaCount = efakturovatelne(selectedRows).length;

  /*
    Kontrola eFaktúr pred hromadným odoslaním (EN 16931, Peppol BIS). Faktúry
    s chybou sa neodošlú — server by ich aj tak odmietol; zvyšok po súhlase
    áno. Keď sa kontrola nespustí, rozhodne server pri každej faktúre.
  */
  async function bezChybKontroly(faktury: any[]): Promise<any[] | null> {
    setBusy(true);
    const zle: string[] = [];
    const vyradit = new Set<string>();
    try {
      const podlaFirmy = new Map<string, any[]>();
      for (const f of faktury) podlaFirmy.set(f.company_id, [...(podlaFirmy.get(f.company_id) ?? []), f]);
      for (const [firma, zoznam] of podlaFirmy) {
        for (let i = 0; i < zoznam.length; i += 200) {
          const davka = zoznam.slice(i, i + 200);
          const r = await skontrolujEfaktury({
            data: { company_id: firma, invoice_ids: davka.map((f: any) => f.id) },
          });
          for (const f of davka) {
            const v = r[f.id];
            if (!v) continue;
            if (!v.kontrola) zle.push(`${f.invoice_number}: ${t(v.nedaSa ?? "eFaktúru nie je možné odoslať.")}`);
            else if (!v.kontrola.mozno)
              zle.push(
                `${f.invoice_number}: ${v.kontrola.chyby
                  .slice(0, 3)
                  .map((n) => n.kod)
                  .join(", ")}${v.kontrola.chyby.length > 3 ? "…" : ""}`,
              );
            else continue;
            vyradit.add(f.id);
          }
        }
      }
    } catch {
      /* kontrolu spraví server pri odoslaní */
    } finally {
      setBusy(false);
    }
    if (!vyradit.size) return faktury;
    const ostatne = faktury.filter((f) => !vyradit.has(f.id));
    const sprava = [
      t("Faktúry, ktoré neprešli kontrolou eFaktúry a neodošlú sa: {n}. Chyby ukáže okno odoslania v detaile faktúry.", {
        n: vyradit.size,
      }),
      ...zle.slice(0, 10),
      zle.length > 10 ? "…" : "",
    ].filter(Boolean);
    if (!ostatne.length) {
      toast.error(sprava[0], { description: zle.slice(0, 10).join("\n"), duration: 15000 });
      return null;
    }
    const ano = await potvrd(sprava.join("\n"), {
      potvrdit: t("Odoslať ostatné ({n})", { n: ostatne.length }),
      nebezpecne: false,
    });
    return ano ? ostatne : null;
  }

  async function runBulkEfaktura() {
    setBulkAction(null);
    const targets = efakturovatelne(selectedRows);
    const prazdne = t("Žiadne faktúry na odoslanie eFaktúrou (koncept, storno, zálohová alebo už odoslaná).");
    if (!targets.length) {
      toast.error(prazdne);
      return;
    }
    const pripravene = await overDatumy(targets, prazdne);
    if (!pripravene) return;
    const { menit } = pripravene;
    const naOdoslanie = await bezChybKontroly(pripravene.naOdoslanie);
    if (!naOdoslanie) return;
    setBusy(true);
    setProgress({ current: 0, total: naOdoslanie.length });
    let ok = 0;
    const chyby: string[] = [];
    // Po jednej — ePošták a kontrola dátumu bežia pre každú faktúru zvlášť.
    for (let i = 0; i < naOdoslanie.length; i++) {
      const inv = naOdoslanie[i];
      try {
        if (menit.has(inv.id)) await zmenDatumFn({ data: { invoiceId: inv.id } });
        await posliEfakturu({
          data: { company_id: inv.company_id, invoice_id: inv.id, s_pdf: true, prilohy: [] },
        });
        ok++;
      } catch (e: any) {
        chyby.push(`${inv.invoice_number}: ${e?.message ?? t("chyba")}`);
      }
      setProgress({ current: i + 1, total: naOdoslanie.length });
    }
    setProgress(null);
    setBusy(false);
    if (!chyby.length) toast.success(t("Odoslané eFaktúry: {n}", { n: ok }));
    else
      toast.error(t("Odoslaných {ok}, zlyhalo {fail}", { ok, fail: chyby.length }), {
        description: chyby.slice(0, 5).join("\n"),
        duration: 15000,
      });
    list.clearSelection();
    list.reload();
  }

  async function runBulkEmail() {
    setBulkAction(null);
    const targets = selectedRows.filter(
      (r: any) => (r.status === "issued" || r.status === "sent") && r.customer_email,
    );
    if (!targets.length) {
      toast.error(t("Žiadne odosielateľné faktúry (chýba email alebo nesprávny stav)."));
      return;
    }
    const pripravene = await overDatumy(targets, t("Žiadne odosielateľné faktúry (chýba email alebo nesprávny stav)."));
    if (!pripravene) return;
    const { naOdoslanie, menit } = pripravene;
    setBusy(true);
    setProgress({ current: 0, total: naOdoslanie.length });
    let ok = 0,
      fail = 0;
    for (let i = 0; i < naOdoslanie.length; i++) {
      const inv = naOdoslanie[i];
      try {
        if (menit.has(inv.id)) await zmenDatumFn({ data: { invoiceId: inv.id } });
        await emailFn({ data: { invoiceId: inv.id, recipient_email: inv.customer_email } });
        ok++;
      } catch (e) {
        console.error("bulk email failed", inv.id, e);
        fail++;
      }
      setProgress({ current: i + 1, total: naOdoslanie.length });
    }
    setProgress(null);
    setBusy(false);
    if (fail === 0) toast.success(t("Odoslané e-maily: {n}", { n: ok }));
    else toast.error(t("Odoslaných {ok}, zlyhalo {fail}", { ok, fail }));
    list.clearSelection();
    list.reload();
  }

  async function runBulkClone() {
    setBulkAction(null);
    const ids = list.selectedIds;
    setBusy(true);
    setProgress({ current: 0, total: ids.length });
    let ok = 0,
      fail = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await cloneFn({ data: { invoiceId: ids[i] } });
        ok++;
      } catch (e) {
        console.error("bulk clone failed", ids[i], e);
        fail++;
      }
      setProgress({ current: i + 1, total: ids.length });
    }
    setProgress(null);
    setBusy(false);
    if (fail === 0) toast.success(t("Vytvorené kópie pre ďalší mesiac: {n}", { n: ok }));
    else toast.error(t("Vytvorených {ok}, zlyhalo {fail}", { ok, fail }));
    list.clearSelection();
    list.reload();
  }

  async function runBulkReminder() {
    setBulkAction(null);
    const targets = selectedRows.filter(
      (r: any) =>
        (r.status === "issued" || r.status === "sent") &&
        r.due_date &&
        r.due_date < today &&
        !r.paid_at &&
        r.customer_email,
    );
    if (!targets.length) {
      toast.error(t("Žiadne po splatnosti faktúry s emailom."));
      return;
    }
    setBusy(true);
    setProgress({ current: 0, total: targets.length });
    let ok = 0,
      fail = 0;
    for (let i = 0; i < targets.length; i++) {
      const inv = targets[i];
      const next = Math.min(3, (reminderMap[inv.id] ?? 0) + 1) as 1 | 2 | 3;
      try {
        await reminderFn({
          data: { invoiceId: inv.id, reminderNumber: next, recipient_email: inv.customer_email },
        });
        ok++;
      } catch (e) {
        console.error("bulk reminder failed", inv.id, e);
        fail++;
      }
      setProgress({ current: i + 1, total: targets.length });
    }
    setProgress(null);
    setBusy(false);
    if (fail === 0) toast.success(t("Odoslané upomienky: {n}", { n: ok }));
    else toast.error(t("Odoslaných {ok}, zlyhalo {fail}", { ok, fail }));
    list.clearSelection();
    list.reload();
  }

  async function runBulkZip() {
    setBulkAction(null);
    const ids = list.selectedIds;
    setBusy(true);
    setProgress({ current: 0, total: ids.length });
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    let ok = 0,
      fail = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        const r = await pdfFn({ data: { invoiceId: ids[i] } });
        const resp = await fetch(r.signedUrl);
        if (!resp.ok) throw new Error("PDF fetch failed");
        const bytes = new Uint8Array(await resp.arrayBuffer());
        zip.file(r.fileName, bytes);
        ok++;
      } catch (e) {
        console.error("bulk pdf failed", ids[i], e);
        fail++;
      }
      setProgress({ current: i + 1, total: ids.length });
    }
    setProgress(null);
    if (ok > 0) {
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `faktury-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    setBusy(false);
    if (fail === 0) toast.success(t("ZIP stiahnutý — faktúr: {n}", { n: ok }));
    else toast.error(t("Do ZIPu pridaných {ok}, zlyhalo {fail}", { ok, fail }));
    list.clearSelection();
  }

  // Žiadna z týchto akcií nič nemaže, preto majú vlastný text tlačidla.
  const confirmMessages: Record<
    Exclude<BulkAction, null>,
    { title: string; message: string; confirmLabel: string }
  > = {
    paid: {
      title: t("Označiť {n} faktúr ako zaplatené?", { n: list.selectedIds.length }),
      message: t("Stornované a už zaplatené faktúry budú preskočené. Nastaví sa dnešný dátum úhrady."),
      confirmLabel: t("Označiť ako zaplatené"),
    },
    email: {
      title: t("Odoslať e-mailom {n} faktúr?", { n: emailableCount }),
      message: t("Odosielajú sa iba vystavené/odoslané faktúry s emailom odberateľa."),
      confirmLabel: t("Odoslať"),
    },
    efaktura: {
      title: efakturaTest
        ? t("Odoslať eFaktúrou {n} faktúr (test)?", { n: efakturaCount })
        : t("Odoslať eFaktúrou {n} faktúr?", { n: efakturaCount }),
      message: efakturaTest
        ? t("eFaktúra beží v testovacom režime — faktúry odídu len do skúšobného prostredia a odberateľom nepríde nič.")
        : t("Faktúry odídu odberateľom cez sieť Peppol s PDF faktúry a odoslanie sa nedá vziať späť. Koncepty, storná, zálohové a už odoslané eFaktúry sa preskočia. Ďalšie prílohy pošlite jednotlivo z detailu faktúry."),
      confirmLabel: t("Odoslať eFaktúry"),
    },
    clone: {
      title: t("Vytvoriť kópie {n} faktúr pre ďalší mesiac?", { n: list.selectedIds.length }),
      message: t("Vytvoria sa nové koncepty s inkrementovaným mesiacom v popisoch."),
      confirmLabel: t("Vytvoriť kópie"),
    },
    reminder: {
      title: t("Odoslať upomienky pre {n} faktúr?", { n: overdueSelectedCount }),
      message:
        t("Odosielajú sa iba po splatnosti faktúry s emailom odberateľa. Číslo upomienky sa určí automaticky."),
      confirmLabel: t("Odoslať upomienky"),
    },
    zip: {
      title: t("Stiahnuť PDF ZIP pre {n} faktúr?", { n: list.selectedIds.length }),
      message: t("Pre každú faktúru sa vygeneruje PDF a spakuje do jedného ZIP archívu."),
      confirmLabel: t("Stiahnuť ZIP"),
    },
  };
  const runners: Record<Exclude<BulkAction, null>, () => Promise<void>> = {
    paid: runBulkPaid,
    email: runBulkEmail,
    efaktura: runBulkEfaktura,
    clone: runBulkClone,
    reminder: runBulkReminder,
    zip: runBulkZip,
  };

  const rowWarning = rowDelete && (rowDelete.status === "paid" || rowDelete.status === "sent");
  return (
    <>
      {nahlad && (
        <NahladPdfOkno url={nahlad.url} nazov={nahlad.nazov} onClose={() => setNahlad(null)} />
      )}
      <PageHeader
        title={
          type === "credit"
            ? t("Dobropisy a ťarchopisy")
            : type === "vydane"
              ? t("Vydané faktúry")
              : type === "danove"
                ? t("Daňové doklady")
                : poSplatnosti
              ? t("Faktúry po splatnosti")
              : neuhradene
                ? t("Neuhradené faktúry")
                : status === "draft"
                  ? t("Koncepty")
                  : status === "issued"
                    ? t("Vystavené faktúry")
                    : t("Faktúry")
        }
        description={
          q
            ? t("Výsledky hľadania „{q}“.", { q })
            : type === "credit"
              ? t("Vystavené opravné faktúry — dobropisy cenu znižujú, ťarchopisy zvyšujú.")
              : type === "vydane"
                ? t("Len faktúry — bez zálohových, dobropisov a daňových dokladov.")
                : type === "danove"
                  ? t("Daňové doklady k prijatej platbe. Vystavujú sa zo zálohovej faktúry po jej úhrade.")
                  : poSplatnosti
                ? t("Vystavené a odoslané faktúry, ktorým uplynula splatnosť a nie sú uhradené.")
                : neuhradene
                  ? t("Faktúry, ktoré vám zákazníci ešte nezaplatili.")
                  : status === "draft"
                    ? t("Rozpracované faktúry, ktoré ešte neboli vystavené.")
                    : status === "issued"
                      ? t("Faktúry vo vystavenom stave — ešte neodoslané odberateľovi.")
                      : t("Všetky vystavené faktúry, koncepty aj stornované.")
        }
        action={
          /* Hlavné tlačidlo je posledné a vpravo; Číselné rady a Účtovné exporty sú
             v riadku s filtrami, aby sa hlavička nezalamovala. */
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(type || status || poSplatnosti || neuhradene) && (
              <Link
                to="/faktury"
                search={{} as any}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <X className="h-4 w-4" /> {t("Zrušiť filter")}
              </Link>
            )}
            {list.selectedIds.length > 0 && !list.showDeleted && (
              <button
                onClick={() => setZauctovanie(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                <BookCheck className="h-4 w-4" /> {t("Zaúčtovať ({n})", { n: list.selectedIds.length })}
              </button>
            )}
            {list.selectedIds.length > 0 && !list.showDeleted && (
              <button
                onClick={bulkExport}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary-hover hover:bg-primary/15 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileCode2 className="h-4 w-4" />
                )}
                {t("Export {n} do {program}", { n: list.selectedIds.length, program: program.inyProgram ? program.nazov : t("Pohody XML") })}
              </button>
            )}
            {maBanku && (
              <Link
                to="/faktury/parovanie"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <Landmark className="h-4 w-4" /> {t("Spárovať platby")}
                {cakaNaParovanie > 0 && (
                  <span className="rounded-full bg-emerald-700 px-1.5 text-xs font-medium text-white">
                    {cakaNaParovanie}
                  </span>
                )}
              </Link>
            )}
            {/*
              Samofaktúra sa eviduje medzi prijatými (pre nás je to nákup), ale
              vystavujeme ju my — preto aj tu, kde ju človek hľadá.
            */}
            {type !== "credit" && (
            <Link
              to="/prijate-faktury/samofaktura"
              title={t("Faktúra za dodávateľa podľa dohody o samofakturácii — uloží sa medzi prijaté faktúry")}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
            >
              <Plus className="h-4 w-4" /> {t("Samofaktúra")}
            </Link>
            )}
            {/* Krátka cesta pre jednu položku — plný formulár je na zvyšok. */}
            {type !== "credit" && type !== "danove" && (
            <Link
              to="/faktury/rychla"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
            >
              <Zap className="h-4 w-4" /> {t("Rýchla faktúra")}
            </Link>
            )}
            <Link
              to="/exporty"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
            >
              <FileCode2 className="h-4 w-4" /> {t("Účtovné exporty")}
            </Link>
            <HlavickaViac akcie={[{ label: "Číselné rady", icon: Hash, to: "/ciselne-rady" }]} />
            {type === "danove" ? (
              <Link
                to="/zalohove"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> {t("Vystaviť zo zálohovej faktúry")}
              </Link>
            ) : type === "credit" ? (
              <Link
                to="/faktury/nova"
                search={{ type: "credit_note" } as any}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> {t("Vystaviť dobropis")}
              </Link>
            ) : (
            <Link
              to="/faktury/nova"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Nová faktúra")}
            </Link>
            )}
          </div>
        }
      />
      <PageBody>
        <DocumentListToolbar
          lf={lf}
          searchPlaceholder="Hľadať číslo, odberateľa, IČO…"
          sortOptions={ZORADENIE_FAKTUR}
          filters={[
            {
              key: "obdobie",
              label: "Obdobie",
              type: "dateRange",
              dateFieldOptions: [
                { value: "vystavenie", label: "dátumu vystavenia" },
                { value: "dodanie", label: "dátumu dodania" },
                { value: "splatnost", label: "dátumu splatnosti" },
              ],
            },
            {
              key: "export",
              label: "Export do účtovníctva",
              type: "select",
              options: [
                { value: "ano", label: "Exportované" },
                { value: "nie", label: "Neexportované" },
              ],
            },
            { key: "bezUpomienky", label: "Po splatnosti bez upomienky", type: "checkbox" },
            { key: "vymazane", label: "Zobraziť vymazané", type: "checkbox" },
            ...filtreStavuAStitkov(cis.stavy, cis.stitky),
          ]}
          previewToggle={bocny}
        />
        {list.showDeleted && list.rows.length > 0 && (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setVyprazdnitKos(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" /> {t("Vyprázdniť kôš ({n})", { n: list.rows.length })}
            </button>
          </div>
        )}
        <BulkBar
          onHardDelete={() => setBulkHardDelete(true)}
          count={list.selectedIds.length}
          showDeleted={list.showDeleted}
          onDelete={() => setBulkDelete(true)}
          onRestore={bulkRestoreNow}
          onClear={list.clearSelection}
        />
        {list.selectedIds.length > 0 && !list.showDeleted && (
          <div className="sticky top-16 z-20 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-card/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
            <span className="font-medium text-primary">
              {t("Vybrané faktúry: {n}", { n: list.selectedIds.length })}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() => setBulkAction("paid")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> {t("Označiť ako zaplatené")}
              </button>
              <button
                disabled={busy || emailableCount === 0}
                onClick={() => setBulkAction("email")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
              >
                <Mail className="h-3.5 w-3.5" /> {t("Odoslať e-mailom")}{" "}
                {emailableCount > 0 ? `(${emailableCount})` : ""}
              </button>
              <button
                disabled={busy || efakturaCount === 0}
                onClick={() => setBulkAction("efaktura")}
                className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary-hover hover:bg-primary/15 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> {efakturaTest ? t("Odoslať eFaktúrou (test)") : t("Odoslať eFaktúrou")}{" "}
                {efakturaCount > 0 ? `(${efakturaCount})` : ""}
              </button>
              <button
                disabled={busy}
                onClick={() => setBulkAction("clone")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
              >
                <CalendarPlus className="h-3.5 w-3.5" /> {t("Vystaviť pre ďalší mesiac")}
              </button>
              <button
                disabled={busy || overdueSelectedCount === 0}
                onClick={() => setBulkAction("reminder")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
              >
                <Bell className="h-3.5 w-3.5" /> {t("Poslať upomienku")}{" "}
                {overdueSelectedCount > 0 ? `(${overdueSelectedCount})` : ""}
              </button>
              <button
                disabled={busy}
                onClick={() => setBulkAction("zip")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
              >
                <Archive className="h-3.5 w-3.5" /> {t("Exportovať PDF (ZIP)")}
              </button>
              {getActiveCompanyId() ? (
                <HromadnaAkciaDokladov
                  companyId={getActiveCompanyId()!}
                  agenda="vystavena"
                  ids={list.selectedIds}
                  onHotovo={() => list.reload()}
                  pdfZip={() => setBulkAction("zip")}
                  zmazat={() => setBulkDelete(true)}
                />
              ) : null}
              {progress && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary-hover">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Spracováva sa {a}/{b}…", { a: progress.current, b: progress.total })}
                </span>
              )}
            </div>
          </div>
        )}
        <ResponsiveTable
          className="mt-3"
          items={visibleRows}
          loading={list.loading}
          emptyText={list.showDeleted ? t("Žiadne vymazané faktúry.") : t("Žiadne faktúry.")}
          mobileCard={(i: any) => (
            <MobileListCard
              onClick={() => navigate({ to: "/faktury/$id", params: { id: i.id } })}
              title={
                <span className="inline-flex items-center gap-2">
                  {i.invoice_number}
                  <OdovzdaneIkona kedy={i.exported_at} doklad={i} />
                  {i.type === "credit_note" || i.type === "debit_note" ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {i.type === "credit_note" ? t("Dobropis") : t("Ťarchopis")}
                    </span>
                  ) : null}
                  <OdznakEfaktury stav={efakturaMap[i.id]} />
                  {reminderMap[i.id] ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
                      <Bell className="h-3 w-3" /> {t("Upomienka #{n}", { n: reminderMap[i.id] })}
                    </span>
                  ) : null}
                </span>
              }
              subtitle={i.customer_name ?? "—"}
              status={<StatusBadge status={i.status} />}
              meta={`${datumNaDoklade(i.issue_date)}${i.delivery_date && i.delivery_date !== i.issue_date ? ` · ${t("dodaná")} ${datumNaDoklade(i.delivery_date)}` : ""} · ${t("splat.")} ${datumNaDoklade(i.due_date)}`}
              amount={formatujMenu(sumaNaZobrazenie(i, i.total), i.currency)}
              actions={
                list.showDeleted ? (
                  <button
                    aria-label={t("Obnoviť")}
                    title={t("Obnoviť")}
                    onClick={async () => {
                      try {
                        await list.restore([i.id]);
                        toast.success(t("Obnovené"));
                      } catch (e: any) {
                        toast.error(e?.message ?? t("Chyba"));
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary-hover hover:bg-primary/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> {t("Obnoviť")}
                  </button>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={() => cloneRow(i.id)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Copy className="h-3.5 w-3.5" /> {t("Klonovať")}
                    </button>
                    <button
                      onClick={() => setRowDelete(i)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("Vymazať")}
                    </button>
                  </div>
                )
              }
            />
          )}
          desktop={
            <SNahladom
              zapnuty={bocny.zapnuty}
              vybrany={bocny.vybrany}
              nazov={visibleRows.find((r: any) => r.id === bocny.vybrany)?.invoice_number}
              nacitaj={async (id) => {
                const r = await pdfUrlFn({ data: { invoiceId: id } });
                return r?.signedUrl ? { url: r.signedUrl } : null;
              }}
              onOtvorit={(id) => navigate({ to: "/faktury/$id", params: { id } })}
              onZavriet={() => bocny.setVybrany(null)}
            >
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 p-3">
                      <input
                        type="checkbox"
                        aria-label={t("Vybrať všetko")}
                        checked={list.allOnPageSelected}
                        onChange={(e) => list.toggleAllOnPage(e.target.checked)}
                      />
                    </th>
                    <th className="p-3">{t("Číslo")}</th>
                    <th className="p-3">{t("Odberateľ")}</th>
                    <th className="p-3">{t("Vystavená")}</th>
                    <th className="p-3">{t("Dodaná")}</th>
                    <th className="p-3">{t("Splatnosť")}</th>
                    <th className="p-3 text-right">{t("Suma")}</th>
                    <th className="p-3">{t("Účtovná položka")}</th>
                    <th className="p-3">{t("Stav")}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.loading && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-muted-foreground">
                        {t("Načítavam…")}
                      </td>
                    </tr>
                  )}
                  {!list.loading && visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-muted-foreground">
                        {list.showDeleted ? t("Žiadne vymazané faktúry.") : t("Žiadne faktúry.")}
                      </td>
                    </tr>
                  )}
                  {visibleRows.map((i) => (
                    /*
                      Detail otvárali jednotlivé bunky a robili to celým
                      znovunačítaním stránky. Klikateľný je po novom celý
                      riadok cez router; výber a akcie si kliknutie ponechajú.
                    */
                    <tr
                      key={i.id}
                      data-nahlad-id={i.id}
                      className={`cursor-pointer hover:bg-muted/30 ${bocny.zapnuty && bocny.vybrany === i.id ? "bg-primary/10" : ""}`}
                      onClick={() =>
                        bocny.aktivny()
                          ? bocny.setVybrany(i.id)
                          : navigate({ to: "/faktury/$id", params: { id: i.id } })
                      }
                      onDoubleClick={() => navigate({ to: "/faktury/$id", params: { id: i.id } })}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={t("Vybrať riadok")}
                          checked={!!list.selected[i.id]}
                          onChange={(e) => list.toggleSelect(i.id, e.target.checked)}
                        />
                      </td>
                      <td className="p-3 font-medium">
                        <span className="inline-flex items-center gap-2">
                          {i.invoice_number}
                          <OdovzdaneIkona kedy={i.exported_at} doklad={i} />
                          {i.type === "credit_note" || i.type === "debit_note" ? (
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {i.type === "credit_note" ? t("Dobropis") : t("Ťarchopis")}
                            </span>
                          ) : null}
                          <OdznakEfaktury stav={efakturaMap[i.id]} />
                          {reminderMap[i.id] ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200"
                              title={t("Upomienka bola odoslaná")}
                            >
                              <Bell className="h-3 w-3" /> #{reminderMap[i.id]}
                            </span>
                          ) : null}
                        </span>
                      </td>

                      <td className="p-3">{i.customer_name ?? "—"}</td>
                      <td className="p-3">{datumNaDoklade(i.issue_date)}</td>
                      <td
                        className={`p-3 ${i.delivery_date && i.delivery_date !== i.issue_date ? "font-medium" : "text-muted-foreground"}`}
                      >
                        {datumNaDoklade(datumDodania(i))}
                      </td>
                      <td className="p-3">
                        {datumNaDoklade(i.due_date)}
                        {i.povodna_splatnost && i.povodna_splatnost !== i.due_date && (
                          <span className="block text-xs text-muted-foreground" title={t("Pôvodne {datum}", { datum: datumNaDoklade(i.povodna_splatnost) })}>
                            {t("predĺžená")}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {/* Dobropis bez mínusu — že znižuje, hovorí štítok Dobropis. */}
                        {formatujMenu(sumaNaZobrazenie(i, i.total), i.currency)}
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          // Koncept sa účtuje až po vystavení; odovzdanú najprv treba vrátiť z Pohody.
                          const z = dovodZamku(i, cis.zamknuteDo);
                          return (
                            <VyberVRiadku
                              ariaLabel={t("Účtovná položka faktúry {cislo}", { cislo: i.invoice_number ?? "" })}
                              hodnota={i.pohoda_predkontacia}
                              moznosti={moznostiPredkontacie(platbaPreZoradenie(i.payment_method))}
                              zamok={
                                list.showDeleted ? t("Vymazaná faktúra") : z ? t(NAZOV_ZAMKU[z]) : null
                              }
                              prazdne={t("Nedefinované")}
                              nazovPrazdnej={t("predvolená")}
                              onVyber={(v) => zmenPredkontaciuRiadku(i, v)}
                            />
                          );
                        })()}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={i.status} />
                        {cis.stavy.length && !list.showDeleted ? (
                          <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                            <VyberStavuDokladu
                              kompaktny
                              tabulka="invoices"
                              id={i.id}
                              stavId={i.stav_id}
                              stavy={cis.stavy}
                            />
                          </div>
                        ) : i.stav_id ? (
                          <div className="mt-1">
                            <StavDokladuOdznak stav={stavPodlaId.get(i.stav_id)} />
                          </div>
                        ) : null}
                        {i.stitky?.length ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {i.stitky.map((stitok: string) => (
                              <span key={stitok} className="rounded-full bg-secondary px-1.5 text-[11px] text-muted-foreground">
                                {stitok}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {sch.stavy[i.id] ? (
                          <div className={`mt-1 text-xs ${farbaOdznaku(sch.stavy[i.id].stav)}`} title={t("Schvaľovanie")}>
                            {t(sch.stavy[i.id].odznak)}
                          </div>
                        ) : null}
                        {i.zauctovane_at ? (
                          <div
                            className="mt-1 text-xs text-sky-700"
                            title={[i.pohoda_predkontacia, i.pohoda_clenenie_dph].filter(Boolean).join(" · ")}
                          >
                            {t("Zaúčtovaná")}
                            {i.pohoda_predkontacia ? ` · ${i.pohoda_predkontacia}` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {list.showDeleted ? (
                          <button
                            title={t("Obnoviť")}
                            onClick={async () => {
                              try {
                                await list.restore([i.id]);
                                toast.success(t("Obnovené"));
                              } catch (e: any) {
                                toast.error(e?.message ?? t("Chyba"));
                              }
                            }}
                            className="rounded p-1.5 text-primary hover:bg-primary/10"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <button
                              title={t("Náhľad")}
                              aria-label={i.invoice_number ? t("Náhľad {cislo}", { cislo: i.invoice_number }) : t("Náhľad faktúry")}
                              onClick={() => nahladRiadku(i)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              title={t("Klonovať")}
                              onClick={() => cloneRow(i.id)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              title={t("Vymazať")}
                              onClick={() => setRowDelete(i)}
                              className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </SNahladom>
          }
        />
        {/* Súčet za celý filter (obdobie, stav, hľadanie) — nie za stránku. */}
        {!list.showDeleted && list.total > 0 ? (
          <SuctovaPatickaZoznamu suhrn={sucetFiltra.suhrn} nacitava={sucetFiltra.nacitava} />
        ) : null}
        <ListPagination
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
        />
        {zauctovanie && getActiveCompanyId() && (
          <ZauctovanieFakturOkno
            companyId={getActiveCompanyId()!}
            ids={list.selectedIds}
            onClose={() => setZauctovanie(false)}
            onHotovo={() => {
              list.clearSelection();
              list.reload();
            }}
          />
        )}
        {/* Súčet označených faktúr — zálohová mimo súčtu, dobropis odpočítava, meny zvlášť. */}
        {!list.showDeleted ? (
          <SuctovaListaVyberu
            polozky={selectedRows.map((r: any) => polozkaVystavenej(r))}
            rozpis={rozpisVyberu}
            pocet={list.selectedIds.length}
            onZrusit={list.clearSelection}
          />
        ) : null}
      </PageBody>

      <ConfirmDialog
        open={!!rowDelete}
        title={t("Naozaj chcete vymazať túto faktúru?")}
        message={
          rowDelete
            ? t("Faktúra {cislo} bude skrytá z rozhrania. Môžete ju neskôr obnoviť.", { cislo: rowDelete.invoice_number })
            : ""
        }
        warning={
          rowWarning
            ? t("Táto faktúra je už odoslaná alebo zaplatená. Mazanie môže narušiť účtovnú stopu.")
            : undefined
        }
        onCancel={() => setRowDelete(null)}
        onConfirm={confirmRowDelete}
      />
      <ConfirmDialog
        open={bulkDelete}
        title={t("Vymazať {n} faktúr?", { n: list.selectedIds.length })}
        message={t("Vybraté faktúry budú skryté z rozhrania. Môžete ich neskôr obnoviť.")}
        warning={
          sensitiveSelected > 0
            ? t("{n} z vybratých je odoslaných alebo zaplatených. Mazanie môže narušiť účtovnú stopu.", { n: sensitiveSelected })
            : undefined
        }
        onCancel={() => setBulkDelete(false)}
        onConfirm={confirmBulkDelete}
      />
      <ConfirmDialog
        open={bulkHardDelete}
        title={t("Natrvalo vymazať {n} faktúr?", { n: list.selectedIds.length })}
        message={t("Faktúry sa odstránia aj s položkami, upomienkami a záznamami o odoslaní. Toto sa už nedá vrátiť.")}
        warning={t("Ak máte doklady odovzdané účtovníčke, radšej ich nechajte v koši.")}
        confirmLabel={t("Vymazať natrvalo")}
        onCancel={() => setBulkHardDelete(false)}
        onConfirm={confirmBulkHardDelete}
      />
      <ConfirmDialog
        open={vyprazdnitKos}
        title={t("Vyprázdniť kôš — natrvalo vymazať {n} faktúr?", { n: list.rows.length })}
        message={t("Faktúry sa odstránia aj s položkami, upomienkami a záznamami o odoslaní. Toto sa už nedá vrátiť.")}
        warning={t("Maže sa to, čo je práve zobrazené na tejto stránke koša.")}
        confirmLabel={t("Vyprázdniť kôš")}
        onCancel={() => setVyprazdnitKos(false)}
        onConfirm={confirmVyprazdnitKos}
      />
      <ConfirmDialog
        open={!!bulkAction}
        title={bulkAction ? confirmMessages[bulkAction].title : ""}
        message={bulkAction ? confirmMessages[bulkAction].message : ""}
        confirmLabel={bulkAction ? confirmMessages[bulkAction].confirmLabel : ""}
        danger={false}
        busy={busy}
        onCancel={() => setBulkAction(null)}
        onConfirm={() => {
          if (bulkAction) runners[bulkAction]();
        }}
      />
    </>
  );
}

type EfakturaStav = { stav: "odoslana" | "dorucena" | "zlyhala"; kedy?: string | null };

/** Štítok pri čísle faktúry: odišla ako eFaktúra, bola doručená, alebo odoslanie zlyhalo. */
function OdznakEfaktury({ stav }: { stav?: EfakturaStav }) {
  const { t } = useT();
  if (!stav) return null;
  const zlyhala = stav.stav === "zlyhala";
  const popis = zlyhala
    ? t("Odoslanie eFaktúry zlyhalo")
    : stav.stav === "dorucena"
      ? stav.kedy
        ? t("eFaktúra doručená {kedy}", { kedy: datumNaDoklade(stav.kedy.slice(0, 10)) })
        : t("eFaktúra doručená")
      : t("eFaktúra odoslaná");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        zlyhala
          ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
          : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
      }`}
      title={popis}
      aria-label={popis}
    >
      <FileCheck2 className="h-3 w-3" aria-hidden="true" /> {t("eFaktúra")}
    </span>
  );
}
