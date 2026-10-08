import { createFileRoute } from "@tanstack/react-router";
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
import { NastaveniaProgramu } from "@/components/faktero/NastaveniaProgramu";
import { downloadFile } from "@/lib/faktero/stiahnut-subor";
import { Download, FileCode2, Loader2, FileSpreadsheet, ChevronRight, Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/exporty")({
  head: () => ({ meta: [{ title: "Účtovné exporty — Faktero" }] }),
  /** História je sekcia tejto istej stránky; `?tab=history` na ňu zroluje. */
  validateSearch: (s: Record<string, unknown>): { tab?: "history" } => ({
    tab: s.tab === "history" ? "history" : undefined,
  }),
  component: ExportsPage,
});

/** Ponuka formátov. `note` vysvetlí, komu ešte súbor sadne. */
const FORMATY: { format: ExportFormat; label: string; note?: string }[] = [
  {
    format: "pohoda_xml",
    label: "Pohoda XML",
    note: "Predkontácie a členenie DPH sa vypĺňajú v Účtovníctvo → Prepojenie s Pohodou; bez nich si ich účtovníčka doklikáva sama.",
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
    note: "Import v ABRA Flexi: Nástroje → Import → XML. Zálohové faktúry a doklady v cudzej mene vynechá.",
  },
  {
    format: "csv_univerzal",
    label: "Súpiska CSV (Excel, MRP, Premier…)",
    note: "Jeden riadok na doklad s rozpisom po sadzbách DPH, oddeľovač bodkočiarka, kódovanie Windows-1250. Dobropis je záporný, aby sa dal rovno sčítať.",
  },
];

function ExportsPage() {
  const [format, setFormat] = useState<ExportFormat>("pohoda_xml");
  const [jobs, setJobs] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const exportFn = useServerFn(exportInvoicesFn);
  const getContent = useServerFn(getExportContentFn);

  const { tab } = Route.useSearch();
  useEffect(() => {
    if (tab !== "history") return;
    document.getElementById("historia-exportov")?.scrollIntoView({ behavior: "smooth" });
  }, [tab]);

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const [{ data: js }, { data: inv }] = await Promise.all([
      supabase
        .from("export_jobs")
        .select("*")
        .eq("company_id", cid)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, issue_date, total, currency, status")
        .eq("company_id", cid)
        .gte("issue_date", dateFrom)
        .lte("issue_date", dateTo)
        .neq("status", "draft")
        .neq("status", "cancelled")
        // Zmazaná faktúra sa do účtovníctva posielať nesmie.
        .is("deleted_at", null)
        .order("issue_date", { ascending: false }),
    ]);
    setJobs(js ?? []);
    setInvoices(inv ?? []);
  }
  useEffect(() => {
    load();
  }, [dateFrom, dateTo]);

  const selectedIds = Object.entries(picked)
    .filter(([, v]) => v)
    .map(([k]) => k);

  async function runExport() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    if (!selectedIds.length) return toast.error("Vyberte aspoň jednu faktúru");
    setBusy(true);
    try {
      const r = await exportFn({
        data: { companyId: cid, invoiceIds: selectedIds, format },
      });
      downloadFile(r.fileName, r.content, r.mime, r.encoding);
      toast.success(`Exportovaných ${r.invoiceCount} faktúr`);
      // Vynechaný doklad sa musí povedať nahlas — inak by účtovníčke ticho chýbal.
      if (r.preskocene?.length) {
        toast.warning(`Do súboru sa nedostali: ${r.preskocene.join(", ")}`, { duration: 10000 });
      }
      setPicked({});
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Export zlyhal");
    } finally {
      setBusy(false);
    }
  }

  async function downloadJob(j: any) {
    try {
      const r = await getContent({ data: { jobId: j.id } });
      downloadFile(r.fileName ?? "export.xml", r.content ?? "", r.mime, r.encoding);
    } catch (e: any) {
      toast.error(e?.message ?? "Stiahnutie zlyhalo");
    }
  }

  return (
    <>
      <PageHeader
        title="Účtovné exporty"
        description="Exportujte faktúry do Pohody, Omegy, Money S3, ABRA Flexi, do ISDOC-u alebo ako súpisku pre Excel."
      />
      <PageBody>
        <ZauctovaneDoProgramu />
        <OdovzdanieZaMesiac />
        {/* `min-w-0` na stĺpcoch: bez neho má položka mriežky min-width auto,
            takže široká tabuľka stĺpec roztiahne a na mobile presiahne stránku. */}
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* LEFT: selector */}
          <div className="min-w-0 space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Od</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Do</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => setPicked(Object.fromEntries(invoices.map((i) => [i.id, true])))}
                    className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                  >
                    Vybrať všetko
                  </button>
                  <button
                    onClick={() => setPicked({})}
                    className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                  >
                    Zrušiť výber
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="w-10 p-3"></th>
                      <th className="p-3">Číslo</th>
                      <th className="p-3">Odberateľ</th>
                      <th className="p-3">Vystavená</th>
                      <th className="p-3 text-right">Suma</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoices.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                          Žiadne faktúry v zvolenom období.
                        </td>
                      </tr>
                    )}
                    {invoices.map((i) => (
                      <tr key={i.id} className="hover:bg-muted/30">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={!!picked[i.id]}
                            onChange={(e) => setPicked({ ...picked, [i.id]: e.target.checked })}
                          />
                        </td>
                        <td className="p-3 font-medium">{i.invoice_number}</td>
                        <td className="p-3">{i.customer_name ?? "—"}</td>
                        <td className="p-3">{i.issue_date}</td>
                        <td className="p-3 text-right tabular-nums">
                          {Number(i.total).toFixed(2)} {i.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Vybraných:{" "}
                  <span className="font-semibold text-foreground">{selectedIds.length}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as ExportFormat)}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {FORMATY.map((f) => (
                      <option key={f.format} value={f.format}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={runExport}
                    disabled={busy || !selectedIds.length}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileCode2 className="h-4 w-4" />
                    )}
                    Exportovať
                  </button>
                </div>
              </div>
            </div>

            {/* History */}
            <div id="historia-exportov" className="rounded-2xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">
                História exportov
              </h3>
              {jobs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Zatiaľ žiadne exporty.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {jobs.map((j) => (
                    <li key={j.id} className="flex items-center justify-between py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FileSpreadsheet className="h-4 w-4 text-primary" />
                          {j.file_name ?? `${j.target_system} — ${j.format}`}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {j.invoice_count} faktúr ·{" "}
                          {new Date(j.created_at).toLocaleString("sk-SK")}
                          {j.date_from && j.date_to ? ` · ${j.date_from} → ${j.date_to}` : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => downloadJob(j)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                      >
                        <Download className="h-3.5 w-3.5" /> Stiahnuť
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* RIGHT: formats sidebar */}
          <aside className="min-w-0 space-y-3">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide">Podporované formáty</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {FORMATY.map((f) => (
                  <li
                    key={f.format}
                    className={`rounded-lg border px-3 py-2 ${
                      format === f.format ? "border-primary/40 bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{f.label}</span>
                      {format === f.format && (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Vybrané
                        </span>
                      )}
                    </div>
                    {f.note && <p className="mt-1 text-xs text-muted-foreground">{f.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Vyberte obdobie a faktúry, ktoré chcete preniesť do účtovníctva. Súbor sa stiahne a
                uloží sa do histórie.
              </p>
            </div>
          </aside>
        </div>
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
  suma: number;
  pokladnicnych: number;
  dokladov: number;
  dokladovNovych: number;
  prijatych?: number;
  prijatychNovych?: number;
  uctovnikEmail: string | null;
};

function OdovzdanieZaMesiac() {
  const [mesiac, setMesiac] = useState(() => new Date().toISOString().slice(0, 7));
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
    if (r.preskocene.length) {
      toast.warning(`Do XML sa nedostali: ${r.preskocene.join(", ")}`, { duration: 10000 });
    }
    if (r.vynechanePrilohy) {
      toast.warning(`${r.vynechanePrilohy} dokladov je bez prílohy — balík by sa inak nezmestil`);
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
        r.pocetFaktur ? `${r.pocetFaktur} faktúr` : "",
        r.pocetPrijatych ? `${r.pocetPrijatych} prijatých faktúr` : "",
        r.pocetDokladov ? `${r.pocetDokladov} prijatých dokladov` : "",
        r.pocetPokladnicnych ? `${r.pocetPokladnicnych} pokladničných` : "",
        r.pocetOstatnych ? `${r.pocetOstatnych} iných dokladov` : "",
      ]
        .filter(Boolean)
        .join(", ") || "nič"
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
      toast.success(`Balík obsahuje ${popisObsahu(r)}`);
      povedzVysledok(r);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Odovzdanie zlyhalo");
    } finally {
      setBusy(null);
    }
  }

  async function posli() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const email =
      prehlad?.uctovnikEmail ||
      window.prompt("E-mail účtovníčky (uloží sa v Účtovníctvo → Prepojenie s Pohodou):")?.trim();
    if (!email) return;
    setBusy("mail");
    try {
      const r = await posliMailom({
        data: { companyId: cid, mesiac, oznacit: true, lenNove: true, email },
      });
      toast.success(`Odoslané na ${r.prijemca} — ${popisObsahu(r)}`);
      povedzVysledok(r);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Odoslanie zlyhalo");
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
    <div className="mb-6 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Odovzdať za mesiac</label>
          <input
            type="month"
            value={mesiac}
            onChange={(e) => setMesiac(e.target.value)}
            className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="text-sm">
          {prehlad === null ? (
            <span className="text-muted-foreground">Zisťujem…</span>
          ) : !jeCo ? (
            <span className="text-muted-foreground">
              Za {prehlad.obdobie} nie sú žiadne doklady.
            </span>
          ) : (
            <>
              <div className="font-medium">
                {prehlad.spolu} faktúr ·{" "}
                {prehlad.suma.toLocaleString("sk-SK", { style: "currency", currency: "EUR" })}
                {prehlad.prijatych ? ` · ${prehlad.prijatych} prijatých faktúr` : ""}
                {prehlad.dokladov ? ` · ${prehlad.dokladov} prijatých dokladov` : ""}
                {prehlad.pokladnicnych ? ` · pokladňa ${prehlad.pokladnicnych}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {zostava === 0 ? "Všetko už bolo odovzdané." : `Ešte neodovzdaných: ${zostava}`}
                {prehlad.uctovnikEmail ? ` · účtovníčka: ${prehlad.uctovnikEmail}` : ""}
              </div>
            </>
          )}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={() => stiahni(false)}
            disabled={pracuje || !jeCo}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {busy === "stiahnut" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Stiahnuť balík
          </button>
          <button
            onClick={() => stiahni(true)}
            disabled={pracuje || !zostava}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {busy === "odovzdat" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Označiť za odovzdané
          </button>
          <button
            onClick={posli}
            disabled={pracuje || !zostava}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy === "mail" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Poslať účtovníčke
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        V balíku sú súbory XML pre Pohodu (faktúry, prijaté doklady, pokladňa), súpisky v CSV a
        samotné doklady. Odoslanie aj označenie si zapamätá, čo už odišlo, a nabudúce priloží len
        nové doklady.
      </p>
    </div>
  );
}

/**
 * Zaúčtované doklady do iného programu než Pohoda (Omega, Money S3, ABRA
 * Flexi, súpiska CSV) — vystavené faktúry, prijaté faktúry aj bločky
 * s predkontáciou, členením, strediskom a zákazkou. Program si firma vyberie
 * raz a pamätá sa.
 */
function ZauctovaneDoProgramu() {
  const nacitajProgram = useServerFn(programUctovaniaFn);
  const exportuj = useServerFn(exportUctovanieFn);
  const [program, setProgram] = useState<string>("pohoda");
  const [nastavenia, setNastavenia] = useState<Record<string, Record<string, unknown>>>({});
  const [agenda, setAgenda] = useState<AgendaExportu>("prijata");
  const [od, setOd] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10),
  );
  const [doDna, setDoDna] = useState(new Date().toISOString().slice(0, 10));
  const [riadky, setRiadky] = useState<any[]>([]);
  const [vyber, setVyber] = useState<Record<string, boolean>>({});
  const [oznacit, setOznacit] = useState(true);
  const [lenNove, setLenNove] = useState(true);
  const [busy, setBusy] = useState(false);
  const [otvoreneNastavenia, setOtvoreneNastavenia] = useState(false);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    nacitajProgram({ data: { company_id: cid } })
      .then((r) => {
        setProgram(r.program);
        setNastavenia(r.nastavenia as any);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function nacitaj() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    let data: any[] = [];
    if (agenda === "vystavena") {
      const r = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, issue_date, total, currency, zauctovane_at")
        .eq("company_id", cid)
        .gte("issue_date", od)
        .lte("issue_date", doDna)
        .neq("status", "draft")
        .is("deleted_at", null)
        .order("issue_date", { ascending: false });
      data = (r.data ?? []).map((x: any) => ({
        id: x.id,
        cislo: x.invoice_number,
        partner: x.customer_name,
        datum: x.issue_date,
        suma: x.total,
        mena: x.currency,
        zauctovany: Boolean(x.zauctovane_at),
        odovzdany: false,
      }));
    } else if (agenda === "prijata") {
      const r = await supabase
        .from("purchase_invoices")
        .select("id, invoice_number, supplier_name, issue_date, amount_total, currency, zauctovane_at, exported_at, type")
        .eq("company_id", cid)
        .gte("issue_date", od)
        .lte("issue_date", doDna)
        .eq("type", "regular")
        .is("deleted_at", null)
        .order("issue_date", { ascending: false });
      data = (r.data ?? []).map((x: any) => ({
        id: x.id,
        cislo: x.invoice_number,
        partner: x.supplier_name,
        datum: x.issue_date,
        suma: x.amount_total,
        mena: x.currency,
        zauctovany: Boolean(x.zauctovane_at),
        odovzdany: Boolean(x.exported_at),
      }));
    } else {
      const r = await supabase
        .from("expense_documents")
        .select("id, document_number, supplier_name, issue_date, total_amount, currency, status, exported_at, pohoda_predkontacia")
        .eq("company_id", cid)
        .gte("issue_date", od)
        .lte("issue_date", doDna)
        .neq("status", "new")
        .order("issue_date", { ascending: false });
      data = (r.data ?? []).map((x: any) => ({
        id: x.id,
        cislo: x.document_number || "bloček",
        partner: x.supplier_name,
        datum: x.issue_date,
        suma: x.total_amount,
        mena: x.currency,
        zauctovany: Boolean(x.pohoda_predkontacia),
        odovzdany: Boolean(x.exported_at) || x.status === "exported",
      }));
    }
    setRiadky(data);
    setVyber({});
  }
  useEffect(() => {
    if (program !== "pohoda") void nacitaj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda, od, doDna, program]);

  async function zmenProgram(p: string) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setProgram(p);
    try {
      await nacitajProgram({ data: { company_id: cid, program: p as any } });
    } catch (e: any) {
      toast.error(e?.message ?? "Program sa nepodarilo uložiť");
    }
  }

  const zobrazene = riadky.filter((r) => !lenNove || !r.odovzdany);
  const ids = zobrazene.filter((r) => vyber[r.id]).map((r) => r.id);
  const def = PROGRAMY_UCTOVANIA.find((p) => p.program === program);

  async function spusti() {
    const cid = getActiveCompanyId();
    if (!cid || !ids.length || program === "pohoda") return;
    setBusy(true);
    try {
      const r = await exportuj({
        data: { company_id: cid, program: program as any, agenda, ids, oznacit },
      });
      downloadFile(r.fileName, r.content, r.mime, r.encoding);
      toast.success(`Vyvezených ${r.pocet} dokladov`);
      if (r.preskocene.length)
        toast.warning(`Do súboru sa nedostali: ${r.preskocene.join(" · ")}`, { duration: 12000 });
      void nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? "Export zlyhal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Zaúčtované doklady do vášho programu</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Vystavené faktúry, prijaté faktúry aj bločky s predkontáciou, členením DPH, strediskom a
            zákazkou — tak, ako ste ich zaúčtovali vo Fakteri.
          </p>
        </div>
        <label className="text-sm">
          <span className="block text-xs text-muted-foreground">Účtovný program</span>
          <select
            aria-label="Účtovný program"
            value={program}
            onChange={(e) => void zmenProgram(e.target.value)}
            className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {PROGRAMY_UCTOVANIA.map((p) => (
              <option key={p.program} value={p.program}>
                {p.nazov}
              </option>
            ))}
          </select>
        </label>
      </div>

      {program === "pohoda" ? (
        <p className="mt-4 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
          Do Pohody idú zaúčtované doklady konektorom alebo mesačným balíkom nižšie; jednotlivo
          tlačidlom <em>Stiahnuť XML pre Pohodu</em> pri doklade či v zozname. Používate iný program?
          Vyberte ho vpravo hore.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="flex rounded-md border border-border p-0.5 text-sm">
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
                  className={`rounded px-3 py-1.5 ${agenda === k ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <label className="text-xs text-muted-foreground">
              Od
              <input
                type="date"
                value={od}
                onChange={(e) => setOd(e.target.value)}
                className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Do
              <input
                type="date"
                value={doDna}
                onChange={(e) => setDoDna(e.target.value)}
                className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            {agenda !== "vystavena" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={lenNove} onChange={(e) => setLenNove(e.target.checked)} />
                Len ešte neodovzdané
              </label>
            )}
            <button
              type="button"
              onClick={() => setOtvoreneNastavenia((o) => !o)}
              className="ml-auto rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Nastavenia pre {def?.nazov.split(" — ")[0]}
            </button>
          </div>

          {otvoreneNastavenia && (
            <NastaveniaProgramu
              program={program as any}
              hodnoty={(nastavenia[program] ?? {}) as Record<string, unknown>}
              onUlozit={async (h) => {
                const cid = getActiveCompanyId();
                if (!cid) return;
                const r = await nacitajProgram({ data: { company_id: cid, nastavenia: h } });
                setNastavenia(r.nastavenia as any);
                toast.success("Nastavenia sú uložené");
              }}
            />
          )}

          <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 p-2">
                    <input
                      type="checkbox"
                      aria-label="Vybrať všetko"
                      checked={zobrazene.length > 0 && ids.length === zobrazene.length}
                      onChange={(e) =>
                        setVyber(e.target.checked ? Object.fromEntries(zobrazene.map((r) => [r.id, true])) : {})
                      }
                    />
                  </th>
                  <th className="p-2">Číslo</th>
                  <th className="p-2">{agenda === "vystavena" ? "Odberateľ" : "Dodávateľ"}</th>
                  <th className="p-2">Dátum</th>
                  <th className="p-2 text-right">Suma</th>
                  <th className="p-2">Stav</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {zobrazene.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      V tomto období tu nič nie je.
                    </td>
                  </tr>
                )}
                {zobrazene.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={!!vyber[r.id]}
                        onChange={(e) => setVyber({ ...vyber, [r.id]: e.target.checked })}
                      />
                    </td>
                    <td className="p-2 font-medium">{r.cislo}</td>
                    <td className="p-2">{r.partner ?? "—"}</td>
                    <td className="p-2">{r.datum}</td>
                    <td className="p-2 text-right tabular-nums">
                      {Number(r.suma ?? 0).toFixed(2)} {r.mena}
                    </td>
                    <td className="p-2 text-xs">
                      {r.odovzdany ? (
                        <span className="text-emerald-700">odovzdaný</span>
                      ) : r.zauctovany ? (
                        <span className="text-sky-700">zaúčtovaný</span>
                      ) : (
                        <span className="text-muted-foreground">predvolené kódy</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={oznacit} onChange={(e) => setOznacit(e.target.checked)} />
              Označiť ako odovzdané (zamknú sa a nepôjdu druhýkrát)
            </label>
            <button
              type="button"
              onClick={spusti}
              disabled={busy || !ids.length}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4" />}
              Stiahnuť pre {def?.nazov.split(" — ")[0]} ({ids.length})
            </button>
          </div>
        </>
      )}
    </div>
  );
}

