import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, ArrowRight, ArrowLeft, History, AlertTriangle } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { createImportUploadUrl } from "@/lib/faktero/import-superfaktura.functions";
import { previewVendorImport, executeVendorImport } from "@/lib/faktero/import-vendors.functions";

export type VendorId = "money-s3" | "omega" | "idoklad" | "kros";

export function VendorImportPage(props: {
  source: VendorId;
  title: string;
  description: string;
  accept: string;
  guide: ReactNode;
}) {
  const createUrl = useServerFn(createImportUploadUrl);
  const doPreview = useServerFn(previewVendorImport);
  const doImport = useServerFn(executeVendorImport);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [options, setOptions] = useState({ updateExisting: false, customersOnly: false, invoicesOnly: false });

  async function handleUpload() {
    const cid = getActiveCompanyId();
    if (!cid) return toast.error("Nie je vybraná firma.");
    if (!file) return toast.error("Vyberte súbor.");
    if (file.size > 20 * 1024 * 1024) return toast.error("Súbor je príliš veľký (max 20 MB).");
    setBusy(true);
    try {
      const { signedUrl, path: p } = await createUrl({ data: { companyId: cid, fileName: file.name } });
      const up = await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!up.ok) throw new Error(`Upload zlyhal (${up.status})`);
      setPath(p);
      const r = await doPreview({ data: { companyId: cid, source: props.source, path: p, fileName: file.name } });
      setPreview(r.preview);
      setStep(2);
    } catch (e: any) {
      toast.error(e?.message ?? "Nahranie zlyhalo.");
    } finally { setBusy(false); }
  }

  async function handleRun() {
    const cid = getActiveCompanyId();
    if (!cid || !file || !path) return;
    if (!confirm("Importom sa vytvoria nové záznamy. Pokračovať?")) return;
    setBusy(true);
    try {
      const r = await doImport({ data: { companyId: cid, source: props.source, path, fileName: file.name, options } });
      setResult(r);
      setStep(4);
      toast.success(`Importovaných ${r.imported_invoices} faktúr a ${r.imported_customers} odberateľov.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Import zlyhal.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader
        title={props.title}
        description={props.description}
        action={
          <Link to="/importy" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">
            <History className="h-4 w-4" /> História importov
          </Link>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-4xl space-y-6">
          {step === 1 && (
            <>
              <section className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-base font-semibold">Návod na export</h2>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">{props.guide}</div>
              </section>
              <section className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-base font-semibold">Nahrajte súbor</h2>
                <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/30 px-6 py-10 text-sm hover:border-primary/50">
                  <Upload className="h-8 w-8 text-primary" />
                  <span className="font-medium">{file ? file.name : "Vyberte alebo presuňte súbor"}</span>
                  <span className="text-xs text-muted-foreground">{props.accept}</span>
                  <input type="file" accept={props.accept} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
                <div className="mt-5 flex justify-end">
                  <button onClick={handleUpload} disabled={!file || busy}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    Načítať náhľad
                  </button>
                </div>
              </section>
            </>
          )}

          {step === 2 && preview && (
            <section className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold">Náhľad</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Faktúry" value={preview.invoicesCount} />
                <Stat label="Odberatelia" value={preview.customersCount} />
                <Stat label="Riadky" value={preview.itemsCount} />
                <Stat label="Hodnota" value={`${Number(preview.totalValue).toFixed(2)} ${preview.currency}`} />
              </div>
              {preview.sampleInvoices?.length > 0 && (
                <div className="mt-5 overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40 text-xs text-muted-foreground">
                      <tr><th className="px-3 py-2 text-left">Číslo</th><th className="px-3 py-2 text-left">Odberateľ</th><th className="px-3 py-2 text-left">Dátum</th><th className="px-3 py-2 text-right">Suma</th></tr>
                    </thead>
                    <tbody>
                      {preview.sampleInvoices.map((s: any, i: number) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-2">{s.invoice_number}</td>
                          <td className="px-3 py-2">{s.customer_name || "—"}</td>
                          <td className="px-3 py-2">{s.issue_date || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{Number(s.total).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-5 flex justify-between">
                <button onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">
                  <ArrowLeft className="h-4 w-4" /> Späť
                </button>
                <button onClick={() => setStep(3)} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                  Pokračovať <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </section>
          )}

          {step === 3 && preview && (
            <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <h2 className="text-base font-semibold">Potvrdenie a možnosti</h2>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                  <div>
                    <p className="font-medium">Upozornenie</p>
                    <p className="text-muted-foreground">Import zapíše dáta do vašej firmy a nedá sa automaticky vrátiť.</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  ["updateExisting", "Aktualizovať existujúce faktúry"],
                  ["customersOnly", "Importovať iba odberateľov"],
                  ["invoicesOnly", "Importovať iba faktúry"],
                ] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
                    <input type="checkbox" checked={(options as any)[k]} onChange={(e) => setOptions({ ...options, [k]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
              <div className="flex justify-between">
                <button onClick={() => setStep(2)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">
                  <ArrowLeft className="h-4 w-4" /> Späť
                </button>
                <button onClick={handleRun} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Potvrdiť a importovať
                </button>
              </div>
            </section>
          )}

          {step === 4 && result && (
            <section className="rounded-2xl border border-border bg-card p-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
              <h2 className="mt-3 text-lg font-semibold">Import dokončený</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Faktúry" value={result.imported_invoices} />
                <Stat label="Odberatelia" value={result.imported_customers} />
                <Stat label="Duplikáty" value={result.duplicates} />
                <Stat label="Chyby" value={result.failed_rows} />
              </div>
              <div className="mt-6 flex justify-center gap-2">
                <Link to="/faktury" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Prejsť na faktúry</Link>
                <Link to="/importy" className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary">História importov</Link>
              </div>
            </section>
          )}
        </div>
      </PageBody>
    </>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
