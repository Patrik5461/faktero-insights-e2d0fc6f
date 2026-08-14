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
import { odovzdajUctovnikoviFn, prehladOdovzdaniaFn } from "@/lib/faktero/odovzdanie.functions";
import { Download, FileCode2, Loader2, FileSpreadsheet, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/exporty")({
  head: () => ({ meta: [{ title: "Účtovné exporty — Faktero" }] }),
  /** História je sekcia tejto istej stránky; `?tab=history` na ňu zroluje. */
  validateSearch: (s: Record<string, unknown>): { tab?: "history" } => ({
    tab: s.tab === "history" ? "history" : undefined,
  }),
  component: ExportsPage,
});

/**
 * Windows-1250. Omega slovenskú diakritiku v UTF-8 neprečíta a v súbore by
 * boli namiesto písmen otázniky. Prevádzajú sa len znaky, ktoré sa od ASCII
 * líšia — zvyšok je zhodný.
 */
const CP1250: Record<string, number> = {
  "\u20AC": 0x80,
  "\u201A": 0x82,
  "\u201E": 0x84,
  "\u2026": 0x85,
  "\u2020": 0x86,
  "\u2021": 0x87,
  "\u2030": 0x89,
  "\u0160": 0x8a,
  "\u2039": 0x8b,
  "\u015A": 0x8c,
  "\u0164": 0x8d,
  "\u017D": 0x8e,
  "\u0179": 0x8f,
  "\u2018": 0x91,
  "\u2019": 0x92,
  "\u201C": 0x93,
  "\u201D": 0x94,
  "\u2022": 0x95,
  "\u2013": 0x96,
  "\u2014": 0x97,
  "\u0161": 0x9a,
  "\u203A": 0x9b,
  "\u015B": 0x9c,
  "\u0165": 0x9d,
  "\u017E": 0x9e,
  "\u017A": 0x9f,
  "\u00A0": 0xa0,
  "\u02C7": 0xa1,
  "\u02D8": 0xa2,
  "\u0141": 0xa3,
  "\u00A4": 0xa4,
  "\u0104": 0xa5,
  "\u00A6": 0xa6,
  "\u00A7": 0xa7,
  "\u00A8": 0xa8,
  "\u00A9": 0xa9,
  "\u015E": 0xaa,
  "\u00AB": 0xab,
  "\u00AC": 0xac,
  "\u00AD": 0xad,
  "\u00AE": 0xae,
  "\u017B": 0xaf,
  "\u00B0": 0xb0,
  "\u00B1": 0xb1,
  "\u02DB": 0xb2,
  "\u0142": 0xb3,
  "\u00B4": 0xb4,
  "\u00B5": 0xb5,
  "\u00B6": 0xb6,
  "\u00B7": 0xb7,
  "\u00B8": 0xb8,
  "\u0105": 0xb9,
  "\u015F": 0xba,
  "\u00BB": 0xbb,
  "\u013D": 0xbc,
  "\u02DD": 0xbd,
  "\u013E": 0xbe,
  "\u017C": 0xbf,
  "\u0154": 0xc0,
  "\u00C1": 0xc1,
  "\u00C2": 0xc2,
  "\u0102": 0xc3,
  "\u00C4": 0xc4,
  "\u0139": 0xc5,
  "\u0106": 0xc6,
  "\u00C7": 0xc7,
  "\u010C": 0xc8,
  "\u00C9": 0xc9,
  "\u0118": 0xca,
  "\u00CB": 0xcb,
  "\u011A": 0xcc,
  "\u00CD": 0xcd,
  "\u00CE": 0xce,
  "\u010E": 0xcf,
  "\u0110": 0xd0,
  "\u0143": 0xd1,
  "\u0147": 0xd2,
  "\u00D3": 0xd3,
  "\u00D4": 0xd4,
  "\u0150": 0xd5,
  "\u00D6": 0xd6,
  "\u00D7": 0xd7,
  "\u0158": 0xd8,
  "\u016E": 0xd9,
  "\u00DA": 0xda,
  "\u0170": 0xdb,
  "\u00DC": 0xdc,
  "\u00DD": 0xdd,
  "\u0162": 0xde,
  "\u00DF": 0xdf,
  "\u0155": 0xe0,
  "\u00E1": 0xe1,
  "\u00E2": 0xe2,
  "\u0103": 0xe3,
  "\u00E4": 0xe4,
  "\u013A": 0xe5,
  "\u0107": 0xe6,
  "\u00E7": 0xe7,
  "\u010D": 0xe8,
  "\u00E9": 0xe9,
  "\u0119": 0xea,
  "\u00EB": 0xeb,
  "\u011B": 0xec,
  "\u00ED": 0xed,
  "\u00EE": 0xee,
  "\u010F": 0xef,
  "\u0111": 0xf0,
  "\u0144": 0xf1,
  "\u0148": 0xf2,
  "\u00F3": 0xf3,
  "\u00F4": 0xf4,
  "\u0151": 0xf5,
  "\u00F6": 0xf6,
  "\u00F7": 0xf7,
  "\u0159": 0xf8,
  "\u016F": 0xf9,
  "\u00FA": 0xfa,
  "\u0171": 0xfb,
  "\u00FC": 0xfc,
  "\u00FD": 0xfd,
  "\u0163": 0xfe,
  "\u02D9": 0xff,
};

function doCp1250(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const z = text[i];
    const kod = z.charCodeAt(0);
    // Znak, ktorý v CP1250 nie je, nahradíme otáznikom — inak by sa posunuli bajty.
    out[i] = kod < 0x80 ? kod : (CP1250[z] ?? 0x3f);
  }
  return out;
}

function downloadFile(
  name: string,
  content: string,
  mime = "application/xml",
  encoding: "utf-8" | "windows-1250" = "utf-8",
) {
  const data: BlobPart = encoding === "windows-1250" ? (doCp1250(content) as BlobPart) : content;
  const blob = new Blob([data], { type: `${mime};charset=${encoding}` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Ponuka formátov. `note` vysvetlí, komu ešte súbor sadne. */
const FORMATY: { format: ExportFormat; label: string; note?: string }[] = [
  {
    format: "pohoda_xml",
    label: "Pohoda XML",
    note: "Predkontácie a členenie DPH sa vypĺňajú vo Firma → Pohoda; bez nich si ich účtovníčka doklikáva sama.",
  },
  {
    format: "omega_txt",
    label: "KROS Omega (TXT)",
    note: "Ten istý súbor číta aj ALFA plus — Evidencie → Pohľadávky → Import faktúr z Omegy.",
  },
  { format: "money_s3_xml", label: "Money S3 XML" },
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
        description="Exportujte faktúry do účtovných systémov ako Pohoda."
      />
      <PageBody>
        <OdovzdanieZaMesiac />
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* LEFT: selector */}
          <div className="space-y-4">
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
          <aside className="space-y-3">
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
 * mesiac a Faktero povie, koľko z neho ešte neodišlo.
 */
function OdovzdanieZaMesiac() {
  const [mesiac, setMesiac] = useState(() => new Date().toISOString().slice(0, 7));
  const [prehlad, setPrehlad] = useState<{
    spolu: number;
    odovzdanych: number;
    suma: number;
    pokladnicnych: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const odovzdaj = useServerFn(odovzdajUctovnikoviFn);
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

  async function spusti(oznacit: boolean) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setBusy(true);
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

      toast.success(
        `Balík má ${r.pocetFaktur} faktúr${r.pocetPokladnicnych ? ` a ${r.pocetPokladnicnych} pokladničných dokladov` : ""}`,
      );
      if (r.preskocene.length) {
        toast.warning(`Do XML sa nedostali: ${r.preskocene.join(", ")}`, { duration: 10000 });
      }
      if (r.chybajucePdf) {
        toast.warning(`${r.chybajucePdf} faktúram sa nepodarilo priložiť PDF`);
      }
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Odovzdanie zlyhalo");
    } finally {
      setBusy(false);
    }
  }

  const zostava = prehlad ? prehlad.spolu - prehlad.odovzdanych : 0;

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
          ) : prehlad.spolu === 0 ? (
            <span className="text-muted-foreground">V tomto mesiaci nie sú faktúry.</span>
          ) : (
            <>
              <div className="font-medium">
                {prehlad.spolu} faktúr ·{" "}
                {prehlad.suma.toLocaleString("sk-SK", { style: "currency", currency: "EUR" })}
              </div>
              <div className="text-xs text-muted-foreground">
                {zostava === 0
                  ? "Všetko už bolo odovzdané."
                  : `Ešte neodovzdaných: ${zostava}${prehlad.odovzdanych ? ` (${prehlad.odovzdanych} už áno)` : ""}`}
                {prehlad.pokladnicnych ? ` · pokladňa: ${prehlad.pokladnicnych}` : ""}
              </div>
            </>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => spusti(false)}
            disabled={busy || !prehlad?.spolu}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Stiahnuť balík
          </button>
          <button
            onClick={() => spusti(true)}
            disabled={busy || !zostava}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Odovzdať účtovníkovi
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        V balíku je XML pre Pohodu, súpiska a PDF faktúr — a pokladňa, ak v mesiaci nejaký pohyb
        bol. „Odovzdať" si navyše zapamätá, čo už odišlo, a nabudúce pošle len nové doklady.
      </p>
    </div>
  );
}
