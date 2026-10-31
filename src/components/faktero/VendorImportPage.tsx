import { Link } from "@tanstack/react-router";
import { CislovaniePoImporte } from "@/components/faktero/CislovaniePoImporte";
import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Upload,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  History,
  AlertTriangle,
} from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { ImportOptions, PREDVOLENE_VOLBY } from "@/components/faktero/ImportOptions";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { createImportUploadUrl } from "@/lib/faktero/import-superfaktura.functions";
import { previewVendorImport, executeVendorImport } from "@/lib/faktero/import-vendors.functions";
import { potvrd } from "@/lib/potvrdenie";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useT } from "@/lib/i18n/useT";

export type VendorId = "money-s3" | "omega" | "idoklad" | "kros" | "pohoda";

export function VendorImportPage(props: {
  source: VendorId;
  title: string;
  description: string;
  accept: string;
  guide: ReactNode;
  /** Rozbaľovačka zdroja — na stránke „Účtovné importy". Jednotlivé stránky ju nemajú. */
  selector?: ReactNode;
}) {
  const { t } = useT();
  const createUrl = useServerFn(createImportUploadUrl);
  const doPreview = useServerFn(previewVendorImport);
  const doImport = useServerFn(executeVendorImport);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [options, setOptions] = useState(PREDVOLENE_VOLBY);

  async function handleUpload() {
    const cid = getActiveCompanyId();
    if (!cid) return toast.error(t("Nie je vybraná firma."));
    if (!file) return toast.error(t("Vyberte súbor."));
    if (file.size > 20 * 1024 * 1024) return toast.error(t("Súbor je príliš veľký (max 20 MB)."));
    setBusy(true);
    try {
      const { signedUrl, path: p } = await createUrl({
        data: { companyId: cid, fileName: file.name },
      });
      const up = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!up.ok) throw new Error(t("Upload zlyhal ({status})", { status: up.status }));
      setPath(p);
      const r = await doPreview({
        data: { companyId: cid, source: props.source, path: p, fileName: file.name },
      });
      setPreview(r.preview);
      setStep(2);
    } catch (e: any) {
      toast.error(t(e?.message ?? "Nahranie zlyhalo."));
    } finally {
      setBusy(false);
    }
  }

  async function handleRun() {
    const cid = getActiveCompanyId();
    if (!cid || !file || !path) return;
    if (!(await potvrd(t("Importom sa vytvoria nové záznamy. Pokračovať?")))) return;
    setBusy(true);
    try {
      const r = await doImport({
        data: { companyId: cid, source: props.source, path, fileName: file.name, options },
      });
      setResult(r);
      setStep(4);
      toast.success(
        t("Importovaných {faktury} faktúr a {odberatelia} odberateľov.", {
          faktury: r.imported_invoices,
          odberatelia: r.imported_customers,
        }),
      );
      /*
       * Odmietnuté riadky sa musia povedať nahlas. Keď faktúry spadnú
       * napríklad na uzamknuté obdobie, hláška „importovaných 0 faktúr"
       * vyzerá ako úspech a dôvod ostane schovaný v histórii.
       */
      if (r.failed_rows > 0) {
        toast.warning(
          t("{n} dokladov sa nezapísalo. Dôvod pri každom nájdete v histórii importov.", {
            n: r.failed_rows,
          }),
          { duration: 12000 },
        );
      }
    } catch (e: any) {
      toast.error(t(e?.message ?? "Import zlyhal."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t(props.title)}
        description={t(props.description)}
        action={
          <Link
            to="/importy"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            <History className="h-4 w-4" /> {t("História importov")}
          </Link>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-4xl space-y-6">
          {step === 1 && (
            <>
              {props.selector}
              <section className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-base font-semibold">{t("Návod na export")}</h2>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">{props.guide}</div>
              </section>
              <section className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-base font-semibold">{t("Nahrajte súbor")}</h2>
                <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/30 px-6 py-10 text-sm hover:border-primary/50">
                  <Upload className="h-8 w-8 text-primary" />
                  <span className="font-medium">
                    {file ? file.name : t("Vyberte alebo presuňte súbor")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {props.accept.split(",").join(" · ")}
                  </span>
                  <input
                    type="file"
                    accept={props.accept}
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <div className="mt-5 flex justify-end">
                  <button
                    onClick={handleUpload}
                    disabled={!file || busy}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    {t("Načítať náhľad")}
                  </button>
                </div>
              </section>
            </>
          )}

          {step === 2 && preview && (
            <section className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold">{t("Náhľad")}</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Faktúry" value={preview.invoicesCount} />
                <Stat label="Odberatelia" value={preview.customersCount} />
                <Stat label="Riadky" value={preview.itemsCount} />
                <Stat label="Hodnota" value={formatujMenu(preview.totalValue, preview.currency)} />
              </div>
              {(preview.storna > 0 || preview.stornujuce > 0) && (
                <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span className="min-w-0">
                    {t(
                      "Súbor obsahuje storná ({n}). Stornovaný doklad sa vo Fakteri označí ako stornovaný, stornujúci doklad sa neimportuje.",
                      { n: (preview.storna ?? 0) + (preview.stornujuce ?? 0) },
                    )}
                  </span>
                </p>
              )}
              {preview.sampleInvoices?.length > 0 && (
                <div className="mt-5 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">{t("Číslo")}</th>
                        <th className="px-3 py-2 text-left">{t("Odberateľ")}</th>
                        <th className="px-3 py-2 text-left">{t("Dátum")}</th>
                        <th className="px-3 py-2 text-right">{t("Suma")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sampleInvoices.map((s: any, i: number) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-2">{s.invoice_number}</td>
                          <td className="px-3 py-2">{s.customer_name || "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {s.issue_date ? datumNaDoklade(s.issue_date) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatujMenu(s.total, preview.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-5 flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                >
                  <ArrowLeft className="h-4 w-4" /> {t("Späť")}
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  {t("Pokračovať")} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </section>
          )}

          {step === 3 && preview && (
            <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <h2 className="text-base font-semibold">{t("Potvrdenie a možnosti")}</h2>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-800" />
                  <div>
                    <p className="font-medium">{t("Upozornenie")}</p>
                    <p className="text-muted-foreground">
                      {t("Import zapíše dáta do vašej firmy a nedá sa automaticky vrátiť.")}
                    </p>
                  </div>
                </div>
              </div>
              <ImportOptions options={options} setOptions={setOptions} />
              <div className="flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                >
                  <ArrowLeft className="h-4 w-4" /> {t("Späť")}
                </button>
                <button
                  onClick={handleRun}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {t("Potvrdiť a importovať")}
                </button>
              </div>
            </section>
          )}

          {step === 4 && result && (
            <section className="rounded-2xl border border-border bg-card p-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
              <h2 className="mt-3 text-lg font-semibold">{t("Import dokončený")}</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Faktúry" value={result.imported_invoices} />
                <Stat label="Odberatelia" value={result.imported_customers} />
                <Stat label="Duplikáty" value={result.duplicates} />
                <Stat label="Chyby" value={result.failed_rows} />
              </div>
              {result.stornovane > 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                  {t("Stornované doklady: {n}", { n: result.stornovane })}
                </p>
              )}
              {result.upozornenia?.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    {t("Na čo dať pozor")}
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {result.upozornenia.map((u: string, i: number) => (
                      <li key={i} className="break-words">
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <CislovaniePoImporte rady={(result as any).ciselneRady} />
              <div className="mt-6 flex justify-center gap-2">
                <Link
                  to="/faktury"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  {t("Prejsť na faktúry")}
                </Link>
                <Link
                  to="/importy"
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
                >
                  {t("História importov")}
                </Link>
              </div>
            </section>
          )}
        </div>
      </PageBody>
    </>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  const { t } = useT();
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{t(label)}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
