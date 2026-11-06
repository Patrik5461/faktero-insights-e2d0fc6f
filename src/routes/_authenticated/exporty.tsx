import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import { zadaj } from "@/lib/potvrdenie";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { useServerFn } from "@tanstack/react-start";
import {
  exportInvoicesFn,
  getExportContentFn,
  type ExportFormat,
} from "@/lib/faktero/export.functions";
import { toast } from "sonner";
import {
  odovzdajUctovnikoviFn,
  posliOdovzdanieMailomFn,
  prehladOdovzdaniaFn,
} from "@/lib/faktero/odovzdanie.functions";
import { exportUctovanieFn, programUctovaniaFn } from "@/lib/faktero/uctovanie-export.functions";
import { PROGRAMY_UCTOVANIA, type AgendaExportu } from "@/lib/faktero/uctovanie-programy";
import { ZalozkyStranky } from "@/components/faktero/ZalozkyStranky";
import { downloadFile } from "@/lib/faktero/stiahnut-subor";
import { Download, FileCode2, Loader2, FileSpreadsheet, ChevronRight, Mail } from "lucide-react";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { formatujMenu } from "@/lib/faktero/mena";
import { filtrujObdobie, datumDodania, type DatumObdobia } from "@/lib/faktero/obdobie-filter";
import { prveOdoslanie } from "@/lib/faktero/efaktura-odoslana";
import { useT } from "@/lib/i18n/useT";
import { StavOdznak } from "@/components/faktero/web/Stav";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { toastNeodovzdane } from "@/components/faktero/NeodovzdaneDoklady";
import { KontrolaPohody } from "@/components/faktero/KontrolaPohody";
import { usePoslatOpravuDoPohody } from "@/components/faktero/PoslatOpravuDoPohody";
import {
  PROGRAM_FORMATU,
  nazovProgramuExportu,
  predvolenyMesiacOdovzdania,
  predvolenyZaciatokExportu,
  predvoleneOznacit,
  uctovnyProgramFirmy,
} from "@/lib/faktero/odovzdanie-exportu";
import { SuctyPoMenach } from "@/components/faktero/SuctyPoMenach";
import { riadkyPreIds, vsetkyRiadky } from "@/lib/faktero/strankovanie";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
/** Kľúč podľa počtu: 1 / 2–4 / 5 a viac (slovenské tvary, preklad ich zjednotí). */
const tvar = (n: number, jeden: string, dva: string, pat: string) =>
  n === 1 ? jeden : n >= 2 && n <= 4 ? dva : pat;

export const Route = createFileRoute("/_authenticated/exporty")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Účtovné exporty — Faktero") }],
  }),
  /** Záložky Export (bez `tab` alebo `tab=export`) a História (`tab=historia`).
   *  Starý tvar `?tab=history` (staré odkazy a e-maily) je tiež História. */
  validateSearch: (s: Record<string, unknown>): { tab?: ZalozkaExportov } => ({
    tab:
      s.tab === "historia" || s.tab === "history"
        ? "historia"
        : s.tab === "export"
          ? "export"
          : undefined,
  }),
  component: ExportsPage,
});

type ZalozkaExportov = "export" | "historia";
const ZALOZKY_EXPORTOV: { kod: ZalozkaExportov; nazov: string }[] = [
  { kod: "export", nazov: "Export" },
  { kod: "historia", nazov: "História" },
];

/** Ponuka formátov. `note` vysvetlí, komu ešte súbor sadne. */
const FORMATY: { format: ExportFormat; label: string; note?: string }[] = [
  {
    format: "pohoda_xml",
    label: "Pohoda XML",
    note: "Predkontácie a členenie DPH sa vypĺňajú v Účtovníctvo → Prepojenie s Pohodou; bez nich si ich účtovníčka doklikáva sama.",
  },
  {
    format: "bis_zip",
    label: "Peppol BIS XML (ZIP)",
    note: "Formát eFaktúry. Pohoda od verzie Jeseň 2026 ho načíta hromadne: Súbor → Dátová komunikácia → Import z BIS. Faktúra, ktorá by neprešla ako eFaktúra, sa do súboru nedostane a povieme prečo.",
  },
  {
    format: "omega_txt",
    label: "KROS Omega (TXT)",
    note: "Ten istý súbor číta aj ALFA plus — Evidencie → Pohľadávky → Import faktúr z Omegy.",
  },
  {
    format: "money_s3_xml",
    label: "Money S3 XML",
    note: "Dátový balík MoneyData pre XML prenosy. Faktúra v cudzej mene má hlavičku v mene agendy a svoje sumy v bloku Valuty.",
  },
  {
    format: "isdoc_zip",
    label: "ISDOC (ZIP)",
    note: "Univerzálny formát — načíta ho Pohoda, Money, ABRA, Helios aj Premier. Jeden súbor .isdoc na doklad; faktúra bez položiek doň nejde.",
  },
  {
    format: "flexi_xml",
    label: "ABRA Flexi XML",
    note: "Import v ABRA Flexi: Nástroje → Import → XML. Faktúru v cudzej mene pošle s kurzom; zálohové faktúry a daňové doklady k prijatej platbe vynechá.",
  },
  {
    format: "mrp_xml",
    label: "MRP-K/S XML",
    note: "XML MRP-K/S 2.0 pre slovenskú aj českú verziu: Faktury vydané → Funkce → Import ze souboru XML. Typy DPH a verziu programu nastavíte v Zaúčtovaných dokladoch pri programe MRP-K/S.",
  },
  {
    format: "csv_univerzal",
    label: "Súpiska CSV (Excel, Premier, Helios…)",
    note: "Jeden riadok na doklad s rozpisom po sadzbách DPH, oddeľovač bodkočiarka, kódovanie Windows-1250. Dobropis je záporný, aby sa dal rovno sčítať.",
  },
];

/** Odznak druhu dokladu v zozname exportu (bežná faktúra odznak nemá). */
const DRUH_DOKLADU_EXPORTU: Record<string, string> = {
  proforma: "Zálohová",
  advance_payment: "Doklad k platbe",
  credit_note: "Dobropis",
  debit_note: "Ťarchopis",
};

function ExportsPage() {
  const { t } = useT();
  const [format, setFormat] = useState<ExportFormat>("pohoda_xml");
  const [jobs, setJobs] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [dateFrom, setDateFrom] = useState(() => predvolenyZaciatokExportu());
  const [dateTo, setDateTo] = useState(dnesBratislava());
  const [podla, setPodla] = useState<DatumObdobia>("vystavenie");
  const [lenNeexportovane, setLenNeexportovane] = useState(false);
  /** Druh dokladu — zálohové faktúry sa dajú vybrať samostatne (do Pohody ako zálohová, neúčtuje sa). */
  const [typDokladu, setTypDokladu] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [efOdoslane, setEfOdoslane] = useState<Record<string, string>>({});
  /** Formát posledného odovzdania faktúry (`export_jobs.format`) — „V Pohode“ len pri Pohode. */
  const [formatOdovzdania, setFormatOdovzdania] = useState<Record<string, string>>({});
  /** Program, ktorý firma vedie ako účtovný — len preň sa export predvolene označí ako odovzdaný. */
  const [uctovnyProgram, setUctovnyProgram] = useState<string | null>(null);
  const [oznacit, setOznacit] = useState(true);
  useEffect(() => {
    setOznacit(predvoleneOznacit(format, uctovnyProgram));
  }, [format, uctovnyProgram]);
  const exportFn = useServerFn(exportInvoicesFn);
  const getContent = useServerFn(getExportContentFn);
  const poslatOpravu = usePoslatOpravuDoPohody();
  const [aktivnaFirma, setAktivnaFirma] = useState<string | null>(null);
  useEffect(() => setAktivnaFirma(getActiveCompanyId()), []);

  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const zalozka: ZalozkaExportov = tab === "historia" ? "historia" : "export";
  const zmenZalozku = (kod: ZalozkaExportov) =>
    navigate({
      to: "/exporty",
      search: (s: { tab?: ZalozkaExportov }) => ({ ...s, tab: kod === "export" ? undefined : kod }),
      replace: true,
    });

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const [{ data: js }, { data: inv }, { data: firma }] = await Promise.all([
      supabase
        .from("export_jobs")
        .select("*")
        .eq("company_id", cid)
        .order("created_at", { ascending: false })
        .limit(50),
      // Celé obdobie po stránkach — Supabase vráti najviac 1 000 riadkov naraz.
      vsetkyRiadky<any>((od, po) => {
        let q = filtrujObdobie(
          supabase
            .from("invoices")
            .select(
              "id, company_id, invoice_number, customer_name, issue_date, delivery_date, total, currency, status, exported_at, type",
            )
            .eq("company_id", cid),
          podla,
          dateFrom,
          dateTo,
        )
          .neq("status", "draft")
          .neq("status", "cancelled")
          // Zmazaná faktúra sa do účtovníctva posielať nesmie.
          .is("deleted_at", null);
        if (lenNeexportovane) q = q.is("exported_at", null);
        if (typDokladu) q = q.eq("type", typDokladu as any);
        return q
          .order(podla === "dodanie" ? "delivery_date" : "issue_date", {
            ascending: false,
            nullsFirst: false,
          })
          .order("id")
          .range(od, po);
      }).then((data) => ({ data })),
      supabase.from("companies").select("uctovny_program, country").eq("id", cid).maybeSingle(),
    ]);
    // Nemecká firma s predvolenou Pohodou má DATEV — rovnako ako server.
    setUctovnyProgram(
      uctovnyProgramFirmy((firma as any)?.uctovny_program, (firma as any)?.country),
    );
    setJobs(js ?? []);
    setInvoices(inv ?? []);
    // Ktoré už odišli ako eFaktúra — v Pohode sa nesmú poslať cez Peppol znova.
    // Zoznamy id po dávkach — viac ako ~350 id v jednej adrese brána neprepustí.
    const ids = (inv ?? []).map((i: any) => i.id);
    if (ids.length) {
      const docs = await riadkyPreIds<any>(ids, (kus, od, po) =>
        supabase
          .from("efaktura_documents")
          .select("id, invoice_id")
          .in("invoice_id", kus)
          .order("id")
          .range(od, po),
      );
      const docIds = docs.map((d) => d.id);
      const dor = docIds.length
        ? await riadkyPreIds<any>(docIds, (kus, od, po) =>
            supabase
              .from("efaktura_deliveries")
              .select("document_id, status, created_at")
              .in("document_id", kus)
              .order("created_at")
              .range(od, po),
          )
        : [];
      setEfOdoslane(prveOdoslanie(docs as any, dor as any));
    } else setEfOdoslane({});
    // Kam odovzdaná faktúra odišla naposledy (Pohoda, Money, Omega…).
    const odovzdane = (inv ?? []).filter((i: any) => i.exported_at).map((i: any) => i.id);
    if (odovzdane.length) {
      const logy = await riadkyPreIds<any>(odovzdane, (kus, od, po) =>
        supabase
          .from("export_logs")
          .select("invoice_id, created_at, export_jobs(format)")
          .in("invoice_id", kus)
          .eq("status", "ok")
          .order("created_at")
          .range(od, po),
      );
      const mapa: Record<string, string> = {};
      for (const l of [...logy].sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)),
      ))
        mapa[l.invoice_id] = l.export_jobs?.format ?? "";
      setFormatOdovzdania(mapa);
    } else setFormatOdovzdania({});
  }
  useEffect(() => {
    load();
  }, [dateFrom, dateTo, podla, lenNeexportovane, typDokladu]);

  const selectedIds = Object.entries(picked)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const vybraneEfaktury = selectedIds.filter((id) => efOdoslane[id]).length;

  async function runExport() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    if (!selectedIds.length) return toast.error(t("Vyberte aspoň jednu faktúru"));
    setBusy(true);
    try {
      const r = await exportFn({
        data: { companyId: cid, invoiceIds: selectedIds, format, oznacit },
      });
      downloadFile(r.fileName, r.content, r.mime, r.encoding);
      toast.success(
        r.oznacene
          ? t("Exportovaných faktúr: {n}", { n: r.invoiceCount })
          : t("Exportovaných faktúr: {n} (neoznačené ako odovzdané)", { n: r.invoiceCount }),
      );
      // Vynechaný doklad sa musí povedať nahlas — inak by účtovníčke ticho chýbal.
      toastNeodovzdane(t, r.preskocene);
      setPicked({});
      load();
    } catch (e: any) {
      toast.error(e?.message || t("Export zlyhal"));
    } finally {
      setBusy(false);
    }
  }

  async function downloadJob(j: any) {
    try {
      const r = await getContent({ data: { jobId: j.id } });
      downloadFile(r.fileName ?? "export.xml", r.content ?? "", r.mime, r.encoding);
    } catch (e: any) {
      toast.error(e?.message || t("Stiahnutie zlyhalo"));
    }
  }

  return (
    <>
      <PageHeader
        title={t("Účtovné exporty")}
        description={t(
          "Exportujte faktúry do Pohody, Omegy, Money S3, ABRA Flexi, MRP, DATEV, do ISDOC-u alebo ako súpisku pre Excel.",
        )}
      />
      <PageBody>
        <ZalozkyStranky
          zalozky={ZALOZKY_EXPORTOV}
          aktivna={zalozka}
          onZmena={zmenZalozku}
          popis="Časti stránky Účtovné exporty"
          className="mb-6"
        />
        {zalozka === "historia" ? (
          <div className="max-w-4xl">
            <div id="historia-exportov" className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h3 className="mb-3 text-base font-semibold">
                {t("História exportov")}
              </h3>
              {jobs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("Zatiaľ žiadne exporty.")}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {jobs.map((j) => (
                    <li key={j.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                          <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />
                          <span className="min-w-0 break-all">
                            {j.file_name ?? `${j.target_system} — ${j.format}`}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {/^pohoda-prijate/.test(String(j.file_name ?? ""))
                            ? t(
                                tvar(j.invoice_count, "{n} doklad", "{n} doklady", "{n} dokladov"),
                                {
                                  n: j.invoice_count,
                                },
                              )
                            : t(tvar(j.invoice_count, "{n} faktúra", "{n} faktúry", "{n} faktúr"), {
                                n: j.invoice_count,
                              })}{" "}
                          ·{" "}
                          <span className="whitespace-nowrap tabular-nums">
                            {new Date(j.created_at).toLocaleString("sk-SK")}
                          </span>
                          {j.date_from && j.date_to
                            ? ` · ${datumNaDoklade(j.date_from)} → ${datumNaDoklade(j.date_to)}`
                            : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => downloadJob(j)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-secondary"
                      >
                        <Download className="h-3.5 w-3.5" /> {t("Stiahnuť")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <>
            <ZauctovaneDoProgramu />
            <OdovzdanieZaMesiac />
            {aktivnaFirma ? <KontrolaPohody companyId={aktivnaFirma} /> : null}
            {/* `min-w-0` na stĺpcoch: bez neho má položka mriežky min-width auto,
                takže široká tabuľka stĺpec roztiahne a na mobile presiahne stránku. */}
            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              {/* LEFT: selector */}
              <div className="min-w-0 space-y-4">
                <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-end gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">{t("Od")}</label>
                      <input
                        aria-label={t("Od")}
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">{t("Do")}</label>
                      <input
                        aria-label={t("Do")}
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground" htmlFor="exp-podla">
                        {t("Obdobie podľa")}
                      </label>
                      <select
                        id="exp-podla"
                        value={podla}
                        onChange={(e) => setPodla(e.target.value as DatumObdobia)}
                        className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="vystavenie">{t("dátumu vystavenia")}</option>
                        <option value="dodanie">{t("dátumu dodania")}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground" htmlFor="exp-typ">
                        {t("Druh dokladu")}
                      </label>
                      <select
                        id="exp-typ"
                        value={typDokladu}
                        onChange={(e) => {
                          setTypDokladu(e.target.value);
                          setPicked({});
                        }}
                        className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">{t("Všetky doklady")}</option>
                        <option value="regular">{t("Faktúry")}</option>
                        <option value="proforma">{t("Zálohové faktúry")}</option>
                        <option value="advance_payment">{t("Doklady k prijatej platbe")}</option>
                        <option value="credit_note">{t("Dobropisy")}</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 pb-2 text-sm">
                      <input
                        type="checkbox"
                        checked={lenNeexportovane}
                        onChange={(e) => setLenNeexportovane(e.target.checked)}
                      />
                      {t("Len ešte neexportované")}
                    </label>
                    <div className="ml-auto flex gap-2">
                      <button
                        onClick={() => setPicked(Object.fromEntries(invoices.map((i) => [i.id, true])))}
                        className="rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-secondary"
                      >
                        {t("Vybrať všetko")}
                      </button>
                      <button
                        onClick={() => setPicked({})}
                        className="rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-secondary"
                      >
                        {t("Zrušiť výber")}
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="w-10 p-3">
                            <span className="sr-only">{t("Výber")}</span>
                          </th>
                          <th className="p-3">{t("Číslo")}</th>
                          <th className="p-3">{t("Odberateľ")}</th>
                          <th className="hidden p-3 md:table-cell">{t("Vystavená")}</th>
                          <th className="hidden p-3 md:table-cell">{t("Dodaná")}</th>
                          <th className="hidden p-3 text-right md:table-cell">{t("Suma")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {invoices.length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                              {t("Žiadne faktúry v zvolenom období.")}
                            </td>
                          </tr>
                        )}
                        {invoices.map((i) => (
                          // Zoznam slúži na výber — klik na riadok ho označí/odznačí, doklad neotvára.
                          <KlikatelnyRiadok
                            key={i.id}
                            naKlik={() => setPicked((p) => ({ ...p, [i.id]: !p[i.id] }))}
                          >
                            <td className="p-3">
                              <input
                                type="checkbox"
                                aria-label={t("Vybrať riadok")}
                                checked={!!picked[i.id]}
                                onChange={(e) => setPicked({ ...picked, [i.id]: e.target.checked })}
                              />
                            </td>
                            <td className="p-3 font-medium">
                              <span className="cislo-dokladu whitespace-nowrap">{i.invoice_number}</span>
                              {DRUH_DOKLADU_EXPORTU[String(i.type ?? "")] ? (
                                <StavOdznak
                                  ton="neutralny"
                                  maly
                                  className="ml-2 align-middle"
                                  title={
                                    i.type === "proforma"
                                      ? t("Do Pohody ide ako zálohová faktúra — neúčtuje sa, eviduje sa kvôli odpočtu zálohy.")
                                      : undefined
                                  }
                                >
                                  {t(DRUH_DOKLADU_EXPORTU[String(i.type)])}
                                </StavOdznak>
                              ) : null}
                              {efOdoslane[i.id] ? (
                                <StavOdznak
                                  ton="priebeh"
                                  maly
                                  className="ml-2 align-middle"
                                  title={t(
                                    "Odišla ako eFaktúra — v Pohode ju cez Peppol znova neposielajte.",
                                  )}
                                >
                                  {t("eFaktúra")}
                                </StavOdznak>
                              ) : null}
                              {i.exported_at ? (
                                <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle text-xs font-normal">
                                  <StavOdznak ton="uspech" maly>
                                    {/* Faktúra poslaná do Money nie je „v Pohode“ — povie sa, kam odišla. */}
                                    {nazovProgramuExportu(formatOdovzdania[i.id])
                                      ? t("Odovzdaná ({program})", {
                                          program: t(nazovProgramuExportu(formatOdovzdania[i.id])!),
                                        })
                                      : t("V Pohode")}
                                  </StavOdznak>
                                  {/* Odovzdaná faktúra je zamknutá; „Vrátiť“ ju pustí na opravu. */}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (await poslatOpravu("faktura", i.company_id, i.id)) load();
                                    }}
                                    className="rounded-md border border-input px-1.5 py-0.5 font-medium hover:bg-secondary"
                                  >
                                    {nazovProgramuExportu(formatOdovzdania[i.id])
                                      ? t("Vrátiť")
                                      : t("Vrátiť z Pohody")}
                                  </button>
                                </span>
                              ) : null}
                              <span className="block whitespace-nowrap text-xs font-normal text-muted-foreground md:hidden">
                                {datumNaDoklade(i.issue_date)}
                                {i.delivery_date && i.delivery_date !== i.issue_date
                                  ? ` · ${t("dodaná")} ${datumNaDoklade(i.delivery_date)}`
                                  : ""}{" "}
                                · <span className="suma">{formatujMenu(i.total, i.currency)}</span>
                              </span>
                            </td>
                            <td className="min-w-[10rem] p-3 break-words">{i.customer_name ?? "—"}</td>
                            <td className="hidden whitespace-nowrap p-3 md:table-cell">
                              {datumNaDoklade(i.issue_date)}
                            </td>
                            <td
                              className={`hidden whitespace-nowrap p-3 md:table-cell ${i.delivery_date && i.delivery_date !== i.issue_date ? "font-medium" : "text-muted-foreground"}`}
                            >
                              {datumNaDoklade(datumDodania(i))}
                            </td>
                            <td className="suma hidden whitespace-nowrap p-3 text-right md:table-cell">
                              {formatujMenu(i.total, i.currency)}
                            </td>
                          </KlikatelnyRiadok>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {vybraneEfaktury > 0 && (format === "pohoda_xml" || format === "bis_zip") && (
                    <p
                      role="status"
                      className="mt-4 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-sm text-foreground"
                    >
                      {t(
                        "Vybrané faktúry, ktoré už odišli ako eFaktúra: {n}. V Pohode ich cez Peppol znova neposielajte — odberateľ by ich dostal dvakrát. V internej poznámke dokladu to v Pohode uvidíte.",
                        { n: vybraneEfaktury },
                      )}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">
                      {t("Vybraných:")}{" "}
                      <span className="font-semibold tabular-nums text-foreground">{selectedIds.length}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={t("Formát exportu")}
                        value={format}
                        onChange={(e) => setFormat(e.target.value as ExportFormat)}
                        className="min-w-0 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {FORMATY.map((f) => (
                          <option key={f.format} value={f.format}>
                            {t(f.label)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={runExport}
                        disabled={busy || !selectedIds.length}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileCode2 className="h-4 w-4" />
                        )}
                        {t("Exportovať")}
                      </button>
                    </div>
                  </div>
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={oznacit}
                      onChange={(e) => setOznacit(e.target.checked)}
                    />
                    <span className="min-w-0">
                      {t("Označiť ako odovzdané (zamknú sa a nepôjdu druhýkrát)")}
                      {!PROGRAM_FORMATU[format] ? (
                        <span className="block text-xs text-muted-foreground">
                          {t(
                            "Tento formát nie je účtovný program — predvolene sa faktúry neoznačia ani nezamknú.",
                          )}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </div>

              </div>

              {/* RIGHT: formats sidebar */}
              <aside aria-label={t("Podporované formáty")} className="min-w-0 space-y-3">
                <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                  <h3 className="text-base font-semibold">
                    {t("Podporované formáty")}
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {FORMATY.map((f) => (
                      <li
                        key={f.format}
                        className={`rounded-lg border px-3 py-2 ${
                          format === f.format ? "border-primary/40 bg-primary/5" : "border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 font-medium">{t(f.label)}</span>
                          {format === f.format && (
                            <span className="shrink-0 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary-hover">
                              {t("Vybrané")}
                            </span>
                          )}
                        </div>
                        {f.note && <p className="mt-1 text-xs text-muted-foreground">{t(f.note)}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 sm:p-5 text-sm text-muted-foreground">
                  <p className="flex items-start gap-2">
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {t(
                      "Vyberte obdobie a faktúry, ktoré chcete preniesť do účtovníctva. Súbor sa stiahne a uloží sa do histórie.",
                    )}
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}

/**
 * Odovzdanie za mesiac.
 *
 * Výber jednotlivých faktúr je dobrý na doplnenie jedného dokladu, ale bežná
 * práca je mesačná a človek si musí sám pamätať, čo už poslal. Tu sa vyberie
 * mesiac a Faktero povie, koľko z neho ešte neodišlo — a vie to rovno poslať
 * účtovníčke, aby odpadlo aj sťahovanie a preposielanie.
 */
type Prehlad = {
  obdobie: string;
  spolu: number;
  odovzdanych: number;
  /** Súčet po menách — len riadne faktúry, dobropisy a ťarchopisy. */
  sumy: { mena: string; suma: number }[];
  pokladnicnych: number;
  dokladov: number;
  dokladovNovych: number;
  prijatych?: number;
  prijatychNovych?: number;
  uctovnikEmail: string | null;
};

function OdovzdanieZaMesiac() {
  const { t, jazyk } = useT();
  const [mesiac, setMesiac] = useState(() => predvolenyMesiacOdovzdania());
  const [prehlad, setPrehlad] = useState<Prehlad | null>(null);
  const [busy, setBusy] = useState<null | "stiahnut" | "odovzdat" | "mail">(null);
  const odovzdaj = useServerFn(odovzdajUctovnikoviFn);
  const posliMailom = useServerFn(posliOdovzdanieMailomFn);
  const nacitajPrehlad = useServerFn(prehladOdovzdaniaFn);

  // Po odovzdaní sa prehľad musí prepočítať; zvýšenie čísla znovu spustí načítanie.
  const [verzia, setVerzia] = useState(0);
  const refresh = () => setVerzia((v) => v + 1);
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    let platne = true;
    nacitajPrehlad({ data: { companyId: cid, mesiac } })
      .then((p) => platne && setPrehlad(p))
      .catch(() => platne && setPrehlad(null));
    return () => {
      platne = false;
    };
  }, [mesiac, verzia, nacitajPrehlad]);

  /** Spoločné hlásenia — platia pre stiahnutie aj pre e-mail. */
  function povedzVysledok(r: {
    preskocene: string[];
    vynechanePrilohy: number;
    pocetFaktur: number;
    pocetDokladov: number;
    pocetPokladnicnych: number;
  }) {
    toastNeodovzdane(t, r.preskocene);
    if (r.vynechanePrilohy) {
      toast.warning(
        t("Dokladov bez prílohy: {n} — balík by sa inak nezmestil", { n: r.vynechanePrilohy }),
      );
    }
  }

  function popisObsahu(r: {
    pocetFaktur: number;
    pocetDokladov: number;
    pocetPrijatych?: number;
    pocetPokladnicnych: number;
    pocetOstatnych?: number;
  }) {
    return (
      [
        r.pocetFaktur
          ? t(tvar(r.pocetFaktur, "{n} faktúra", "{n} faktúry", "{n} faktúr"), { n: r.pocetFaktur })
          : "",
        r.pocetPrijatych
          ? t(
              tvar(
                r.pocetPrijatych,
                "{n} prijatá faktúra",
                "{n} prijaté faktúry",
                "{n} prijatých faktúr",
              ),
              { n: r.pocetPrijatych },
            )
          : "",
        r.pocetDokladov
          ? t(
              tvar(
                r.pocetDokladov,
                "{n} prijatý doklad",
                "{n} prijaté doklady",
                "{n} prijatých dokladov",
              ),
              { n: r.pocetDokladov },
            )
          : "",
        r.pocetPokladnicnych
          ? t(
              tvar(
                r.pocetPokladnicnych,
                "{n} pokladničný doklad",
                "{n} pokladničné doklady",
                "{n} pokladničných dokladov",
              ),
              { n: r.pocetPokladnicnych },
            )
          : "",
        r.pocetOstatnych
          ? t(tvar(r.pocetOstatnych, "{n} iný doklad", "{n} iné doklady", "{n} iných dokladov"), {
              n: r.pocetOstatnych,
            })
          : "",
      ]
        .filter(Boolean)
        .join(", ") || t("nič")
    );
  }

  async function stiahni(oznacit: boolean) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setBusy(oznacit ? "odovzdat" : "stiahnut");
    try {
      const r = await odovzdaj({ data: { companyId: cid, mesiac, oznacit, lenNove: oznacit } });
      const bajty = Uint8Array.from(atob(r.base64), (z) => z.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bajty], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("Balík obsahuje: {obsah}", { obsah: popisObsahu(r) }));
      povedzVysledok(r);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Odovzdanie zlyhalo"));
    } finally {
      setBusy(null);
    }
  }

  async function posli() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const email =
      prehlad?.uctovnikEmail ||
      (
        await zadaj(
          t("E-mail účtovníčky\nUloží sa v Účtovníctvo → Prepojenie s Pohodou."),
          {
            typ: "email",
            placeholder: "uctovnicka@kancelaria.sk",
          },
          { potvrdit: t("Poslať podklady") },
        )
      )?.trim();
    if (!email) return;
    setBusy("mail");
    try {
      const r = await posliMailom({
        data: { companyId: cid, mesiac, oznacit: true, lenNove: true, email },
      });
      toast.success(
        t("Odoslané na {prijemca} — {obsah}", { prijemca: r.prijemca, obsah: popisObsahu(r) }),
      );
      povedzVysledok(r);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Odoslanie zlyhalo"));
    } finally {
      setBusy(null);
    }
  }

  const zostava = prehlad
    ? prehlad.spolu - prehlad.odovzdanych + prehlad.dokladovNovych + (prehlad.prijatychNovych ?? 0)
    : 0;
  const jeCo =
    (prehlad?.spolu ?? 0) +
      (prehlad?.dokladov ?? 0) +
      (prehlad?.prijatych ?? 0) +
      (prehlad?.pokladnicnych ?? 0) >
    0;
  const pracuje = busy !== null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-sm font-semibold text-foreground">
            {t("Odovzdať za mesiac")}
          </label>
          <input
            aria-label={t("Odovzdať za mesiac")}
            type="month"
            value={mesiac}
            onChange={(e) => setMesiac(e.target.value)}
            className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-0 text-sm">
          {prehlad === null ? (
            <span className="text-muted-foreground">{t("Zisťujem…")}</span>
          ) : !jeCo ? (
            <span className="text-muted-foreground">
              {t("Za {obdobie} nie sú žiadne doklady.", {
                // Server skladá názov mesiaca po slovensky („október 2026“) — v inom jazyku ho napíše prehliadač.
                obdobie:
                  jazyk === "sk"
                    ? prehlad.obdobie
                    : new Date(`${mesiac}-01T12:00:00`).toLocaleDateString(lokalJazyka(jazyk), {
                        month: "long",
                        year: "numeric",
                      }),
              })}
            </span>
          ) : (
            <>
              <div className="font-medium">
                {t(tvar(prehlad.spolu, "{n} faktúra", "{n} faktúry", "{n} faktúr"), {
                  n: prehlad.spolu,
                })}{" "}
                ·{" "}
                <SuctyPoMenach sucty={prehlad.sumy} className="suma whitespace-nowrap align-baseline" />
                {prehlad.prijatych
                  ? ` · ${t(
                      tvar(
                        prehlad.prijatych,
                        "{n} prijatá faktúra",
                        "{n} prijaté faktúry",
                        "{n} prijatých faktúr",
                      ),
                      { n: prehlad.prijatych },
                    )}`
                  : ""}
                {prehlad.dokladov
                  ? ` · ${t(
                      tvar(
                        prehlad.dokladov,
                        "{n} prijatý doklad",
                        "{n} prijaté doklady",
                        "{n} prijatých dokladov",
                      ),
                      { n: prehlad.dokladov },
                    )}`
                  : ""}
                {prehlad.pokladnicnych
                  ? ` · ${t("pokladňa {n}", { n: prehlad.pokladnicnych })}`
                  : ""}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {zostava === 0
                  ? t("Všetko už bolo odovzdané.")
                  : t("Ešte neodovzdaných: {n}", { n: zostava })}
                {prehlad.uctovnikEmail
                  ? ` · ${t("účtovníčka: {email}", { email: prehlad.uctovnikEmail })}`
                  : ""}
              </div>
            </>
          )}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={() => stiahni(false)}
            disabled={pracuje || !jeCo}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            {busy === "stiahnut" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t("Stiahnuť balík")}
          </button>
          <button
            onClick={() => stiahni(true)}
            disabled={pracuje || !zostava}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            {busy === "odovzdat" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t("Označiť za odovzdané")}
          </button>
          <button
            onClick={posli}
            disabled={pracuje || !zostava}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {busy === "mail" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            {t("Poslať účtovníčke")}
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t(
          "V balíku sú súbory XML pre Pohodu (faktúry, prijaté doklady, pokladňa), súpisky v CSV a samotné doklady. Odoslanie aj označenie si zapamätá, čo už odišlo, a nabudúce priloží len nové doklady.",
        )}
      </p>
    </div>
  );
}

/**
 * Zaúčtované doklady do iného programu než Pohoda (Omega, Money S3, ABRA
 * Flexi, DATEV, súpiska CSV) — vystavené faktúry, prijaté faktúry aj bločky
 * s predkontáciou, členením, strediskom a zákazkou. Program si firma vyberie
 * raz a pamätá sa; nemecká firma bez voľby dostane DATEV.
 */
function ZauctovaneDoProgramu() {
  const { t } = useT();
  const nacitajProgram = useServerFn(programUctovaniaFn);
  const exportuj = useServerFn(exportUctovanieFn);
  const [program, setProgram] = useState<string>("pohoda");
  const [agenda, setAgenda] = useState<AgendaExportu>("prijata");
  const [od, setOd] = useState(() => predvolenyZaciatokExportu(1));
  const [doDna, setDoDna] = useState(dnesBratislava());
  const [riadky, setRiadky] = useState<any[]>([]);
  const [vyber, setVyber] = useState<Record<string, boolean>>({});
  const [oznacit, setOznacit] = useState(true);
  const [lenNove, setLenNove] = useState(true);
  const [podlaZ, setPodlaZ] = useState<DatumObdobia>("vystavenie");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    nacitajProgram({ data: { company_id: cid } })
      .then((r) => {
        setProgram(r.program);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function nacitaj() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    let data: any[] = [];
    try {
      data = await nacitajRiadky(cid);
    } catch (e: any) {
      toast.error(e?.message || t("Doklady sa nepodarilo načítať."));
      return;
    }
    setRiadky(data);
    setVyber({});
  }

  async function nacitajRiadky(cid: string): Promise<any[]> {
    let data: any[] = [];
    // Po stránkach — Supabase vráti najviac 1 000 riadkov naraz (E-06).
    if (agenda === "vystavena") {
      const r = await vsetkyRiadky<any>((zac, kon) =>
        filtrujObdobie(
          supabase
            .from("invoices")
            .select(
              "id, invoice_number, customer_name, issue_date, delivery_date, total, currency, zauctovane_at, status",
            )
            .eq("company_id", cid),
          podlaZ,
          od,
          doDna,
        )
          // Stornované tu ostávajú (nerozhodnuté, E-07) — v zozname sú označené.
          .neq("status", "draft")
          .is("deleted_at", null)
          .order("issue_date", { ascending: false })
          .order("id")
          .range(zac, kon),
      );
      data = r.map((x: any) => ({
        id: x.id,
        cislo: x.invoice_number,
        partner: x.customer_name,
        datum: x.issue_date,
        dodanie: x.delivery_date,
        suma: x.total,
        mena: x.currency,
        zauctovany: Boolean(x.zauctovane_at),
        odovzdany: false,
        stornovany: x.status === "cancelled",
      }));
    } else if (agenda === "prijata") {
      const r = await vsetkyRiadky<any>((zac, kon) =>
        filtrujObdobie(
          supabase
            .from("purchase_invoices")
            .select(
              "id, invoice_number, supplier_name, issue_date, delivery_date, amount_total, currency, zauctovane_at, exported_at, type",
            )
            .eq("company_id", cid),
          podlaZ,
          od,
          doDna,
        )
          .eq("type", "regular")
          .is("deleted_at", null)
          .order("issue_date", { ascending: false })
          .order("id")
          .range(zac, kon),
      );
      data = r.map((x: any) => ({
        id: x.id,
        cislo: x.invoice_number,
        partner: x.supplier_name,
        datum: x.issue_date,
        dodanie: x.delivery_date,
        suma: x.amount_total,
        mena: x.currency,
        zauctovany: Boolean(x.zauctovane_at),
        odovzdany: Boolean(x.exported_at),
      }));
    } else {
      const r = await vsetkyRiadky<any>((zac, kon) =>
        supabase
          .from("expense_documents")
          .select(
            "id, document_number, supplier_name, issue_date, total_amount, currency, status, exported_at, pohoda_predkontacia",
          )
          .eq("company_id", cid)
          .gte("issue_date", od)
          .lte("issue_date", doDna)
          .neq("status", "new")
          .order("issue_date", { ascending: false })
          .order("id")
          .range(zac, kon),
      );
      data = r.map((x: any) => ({
        id: x.id,
        cislo: x.document_number || t("bloček"),
        partner: x.supplier_name,
        datum: x.issue_date,
        suma: x.total_amount,
        mena: x.currency,
        zauctovany: Boolean(x.pohoda_predkontacia),
        odovzdany: Boolean(x.exported_at) || x.status === "exported",
      }));
    }
    return data;
  }
  useEffect(() => {
    if (program !== "pohoda") void nacitaj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda, od, doDna, program, podlaZ]);

  async function zmenProgram(p: string) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setProgram(p);
    try {
      await nacitajProgram({ data: { company_id: cid, program: p as any } });
    } catch (e: any) {
      toast.error(e?.message ?? t("Program sa nepodarilo uložiť"));
    }
  }

  const zobrazene = riadky.filter((r) => !lenNove || !r.odovzdany);
  const ids = zobrazene.filter((r) => vyber[r.id]).map((r) => r.id);
  const def = PROGRAMY_UCTOVANIA.find((p) => p.program === program);
  const kratkyNazov = t(def?.nazov ?? "").split(" — ")[0];

  async function spusti() {
    const cid = getActiveCompanyId();
    if (!cid || !ids.length || program === "pohoda") return;
    setBusy(true);
    try {
      const r = await exportuj({
        data: { company_id: cid, program: program as any, agenda, ids, oznacit },
      });
      downloadFile(r.fileName, r.content, r.mime, r.encoding);
      toast.success(t("Vyvezených dokladov: {n}", { n: r.pocet }));
      if (r.preskocene.length)
        toast.warning(t("Do súboru sa nedostali: {zoznam}", { zoznam: r.preskocene.join(" · ") }), {
          duration: 12000,
        });
      void nacitaj();
    } catch (e: any) {
      toast.error(e?.message || t("Export zlyhal"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("Zaúčtované doklady do vášho programu")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t(
              "Vystavené faktúry, prijaté faktúry aj bločky s predkontáciou, členením DPH, strediskom a zákazkou — tak, ako ste ich zaúčtovali vo Fakteri.",
            )}
          </p>
        </div>
        <label className="min-w-0 max-w-full text-sm">
          <span className="block text-sm font-semibold">{t("Účtovný program")}</span>
          <select
            aria-label={t("Účtovný program")}
            value={program}
            onChange={(e) => void zmenProgram(e.target.value)}
            className="mt-1 w-full max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-auto"
          >
            {PROGRAMY_UCTOVANIA.map((p) => (
              <option key={p.program} value={p.program}>
                {t(p.nazov)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {program === "pohoda" ? (
        <p className="mt-4 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          {t(
            "Do Pohody idú zaúčtované doklady konektorom alebo mesačným balíkom nižšie; jednotlivo tlačidlom",
          )}{" "}
          <em>{t("Stiahnuť XML pre Pohodu")}</em>{" "}
          {t("pri doklade či v zozname. Používate iný program? Vyberte ho vpravo hore.")}
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="flex max-w-full flex-wrap rounded-md border border-input bg-background p-0.5 text-sm">
              {(
                [
                  ["vystavena", "Vystavené faktúry"],
                  ["prijata", "Prijaté faktúry"],
                  ["doklad", "Bločky a doklady"],
                ] as const
              ).map(([k, n]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAgenda(k)}
                  aria-pressed={agenda === k}
                  className={`rounded px-3 py-1.5 font-medium ${agenda === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                >
                  {t(n)}
                </button>
              ))}
            </div>
            <label className="text-xs text-muted-foreground">
              {t("Od")}
              <input
                type="date"
                value={od}
                onChange={(e) => setOd(e.target.value)}
                className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              {t("Do")}
              <input
                type="date"
                value={doDna}
                onChange={(e) => setDoDna(e.target.value)}
                className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            {agenda !== "doklad" && (
              <label className="text-xs text-muted-foreground">
                {t("Obdobie podľa")}
                <select
                  value={podlaZ}
                  onChange={(e) => setPodlaZ(e.target.value as DatumObdobia)}
                  className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
                >
                  <option value="vystavenie">{t("dátumu vystavenia")}</option>
                  <option value="dodanie">{t("dátumu dodania")}</option>
                </select>
              </label>
            )}
            {agenda !== "vystavena" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={lenNove}
                  onChange={(e) => setLenNove(e.target.checked)}
                />
                {t("Len ešte neodovzdané")}
              </label>
            )}
            {/* Nastavenia programu sú na jedinom mieste — v Predkontáciách. */}
            <Link
              to="/uctovnictvo/predkontacie"
              search={{ nastavenia: program }}
              hash="nastavenia-exportu"
              className="ml-auto rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary"
            >
              {t("Nastavenia pre {program}", { program: kratkyNazov })}
            </Link>
          </div>

          {program === "datev" && (
            <p className="mt-3 rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              {t(
                "Súbor EXTF_Buchungsstapel… (Windows-1252) načíta DATEV Rechnungswesen cez Bestand → Importieren → ASCII-Daten / DATEV-Format, prípadne ho pošlite poradcovi do DATEV Unternehmen online. Jeden súbor smie obsahovať len doklady z jedného hospodárskeho roka. Pred prvým exportom vyplňte v nastaveniach Beraternummer a Mandantennummer.",
              )}
            </p>
          )}

          <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 p-2">
                    <input
                      type="checkbox"
                      aria-label={t("Vybrať všetko")}
                      checked={zobrazene.length > 0 && ids.length === zobrazene.length}
                      onChange={(e) =>
                        setVyber(
                          e.target.checked
                            ? Object.fromEntries(zobrazene.map((r) => [r.id, true]))
                            : {},
                        )
                      }
                    />
                  </th>
                  <th className="p-2">{t("Číslo")}</th>
                  <th className="p-2">
                    {agenda === "vystavena" ? t("Odberateľ") : t("Dodávateľ")}
                  </th>
                  <th className="hidden p-2 md:table-cell">{t("Dátum")}</th>
                  <th className="hidden p-2 text-right md:table-cell">{t("Suma")}</th>
                  <th className="p-2">{t("Stav")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {zobrazene.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      {t("V tomto období tu nič nie je.")}
                    </td>
                  </tr>
                )}
                {zobrazene.map((r) => (
                  // Výber na export — klik na riadok ho označí/odznačí, doklad neotvára.
                  <KlikatelnyRiadok
                    key={r.id}
                    naKlik={() => setVyber((v) => ({ ...v, [r.id]: !v[r.id] }))}
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        aria-label={t("Vybrať riadok")}
                        checked={!!vyber[r.id]}
                        onChange={(e) => setVyber({ ...vyber, [r.id]: e.target.checked })}
                      />
                    </td>
                    <td className="p-2 font-medium">
                      <span className="cislo-dokladu whitespace-nowrap">{r.cislo}</span>
                      <span className="block whitespace-nowrap text-xs font-normal text-muted-foreground md:hidden">
                        {datumNaDoklade(r.datum)} ·{" "}
                        <span className="suma">{formatujMenu(r.suma ?? 0, r.mena)}</span>
                      </span>
                    </td>
                    <td className="min-w-[10rem] p-2 break-words">{r.partner ?? "—"}</td>
                    <td className="hidden whitespace-nowrap p-2 md:table-cell">
                      {datumNaDoklade(r.datum)}
                      {r.dodanie && r.dodanie !== r.datum ? (
                        <span className="block text-xs text-muted-foreground">
                          {t("dodaná")} {datumNaDoklade(r.dodanie)}
                        </span>
                      ) : null}
                    </td>
                    <td className="suma hidden whitespace-nowrap p-2 text-right md:table-cell">
                      {formatujMenu(r.suma ?? 0, r.mena)}
                    </td>
                    <td className="whitespace-nowrap p-2 text-xs">
                      {r.stornovany ? (
                        <StavOdznak ton="zruseny" maly className="mr-1">
                          {t("stornovaná")}
                        </StavOdznak>
                      ) : null}
                      {r.odovzdany ? (
                        <StavOdznak ton="uspech" maly>
                          {t("odovzdaný")}
                        </StavOdznak>
                      ) : r.zauctovany ? (
                        <StavOdznak ton="informacia" maly>
                          {t("zaúčtovaný")}
                        </StavOdznak>
                      ) : (
                        <StavOdznak ton="neutralny" maly>
                          {t("predvolené kódy")}
                        </StavOdznak>
                      )}
                    </td>
                  </KlikatelnyRiadok>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={oznacit}
                onChange={(e) => setOznacit(e.target.checked)}
              />
              {t("Označiť ako odovzdané (zamknú sa a nepôjdu druhýkrát)")}
            </label>
            <button
              type="button"
              onClick={spusti}
              disabled={busy || !ids.length}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileCode2 className="h-4 w-4" />
              )}
              {t("Stiahnuť pre {program} ({n})", { program: kratkyNazov, n: ids.length })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
