import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  History,
  Sparkles,
  Sliders,
} from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  createImportUploadUrl,
  previewImport,
  executeImport,
} from "@/lib/faktero/import-superfaktura.functions";

export const Route = createFileRoute("/_authenticated/importy/superfaktura")({
  head: () => ({ meta: [{ title: "Import zo SuperFaktúry — Faktero" }] }),
  component: ImportPage,
});

const FIELDS: Array<{ key: string; label: string; group: string }> = [
  { key: "invoice_number", label: "Číslo faktúry", group: "Faktúra" },
  { key: "variable_symbol", label: "Variabilný symbol", group: "Faktúra" },
  { key: "issue_date", label: "Dátum vystavenia", group: "Faktúra" },
  { key: "due_date", label: "Splatnosť", group: "Faktúra" },
  { key: "delivery_date", label: "Dátum dodania", group: "Faktúra" },
  { key: "status", label: "Stav", group: "Faktúra" },
  { key: "currency", label: "Mena", group: "Faktúra" },
  { key: "subtotal", label: "Suma bez DPH", group: "Faktúra" },
  { key: "vat_total", label: "DPH spolu", group: "Faktúra" },
  { key: "total", label: "Spolu s DPH", group: "Faktúra" },
  { key: "notes", label: "Poznámka", group: "Faktúra" },
  { key: "external_id", label: "Pôvodné ID", group: "Faktúra" },
  { key: "customer_name", label: "Názov firmy", group: "Odberateľ" },
  { key: "customer_ico", label: "IČO", group: "Odberateľ" },
  { key: "customer_dic", label: "DIČ", group: "Odberateľ" },
  { key: "customer_ic_dph", label: "IČ DPH", group: "Odberateľ" },
  { key: "customer_email", label: "Email", group: "Odberateľ" },
  { key: "customer_phone", label: "Telefón", group: "Odberateľ" },
  { key: "customer_street", label: "Ulica", group: "Odberateľ" },
  { key: "customer_city", label: "Mesto", group: "Odberateľ" },
  { key: "customer_zip", label: "PSČ", group: "Odberateľ" },
  { key: "customer_country", label: "Krajina", group: "Odberateľ" },
  { key: "item_name", label: "Názov položky", group: "Položka" },
  { key: "item_description", label: "Popis položky", group: "Položka" },
  { key: "item_quantity", label: "Množstvo", group: "Položka" },
  { key: "item_unit", label: "MJ", group: "Položka" },
  { key: "item_unit_price", label: "Cena za MJ", group: "Položka" },
  { key: "item_vat_rate", label: "Sadzba DPH", group: "Položka" },
  { key: "item_total", label: "Spolu (položka)", group: "Položka" },
];

function ImportPage() {
  const createUrl = useServerFn(createImportUploadUrl);
  const doPreview = useServerFn(previewImport);
  const doImport = useServerFn(executeImport);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [file, setFile] = useState<File | null>(null);
  const [path, setPath] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [detection, setDetection] = useState<any>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [options, setOptions] = useState({
    updateExisting: false,
    customersOnly: false,
    invoicesOnly: false,
    generatePdfs: false,
    triggerWebhooks: false,
  });
  const [result, setResult] = useState<any>(null);

  async function handleUpload() {
    const cid = getActiveCompanyId();
    if (!cid) return toast.error("Nie je vybraná firma.");
    if (!file) return toast.error("Vyberte súbor.");
    if (file.size > 20 * 1024 * 1024) return toast.error("Súbor je príliš veľký (max 20 MB).");
    setBusy(true);
    try {
      const { signedUrl, path: p } = await createUrl({
        data: { companyId: cid, fileName: file.name },
      });
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) throw new Error(`Upload zlyhal (${uploadRes.status})`);
      setPath(p);
      const r = await doPreview({ data: { companyId: cid, path: p, fileName: file.name } });
      setPreview(r.preview);
      setHeaders(r.headers);
      setMapping(r.mapping);
      setDetection((r as any).detection ?? null);
      setStep(2);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload zlyhal.");
    } finally {
      setBusy(false);
    }
  }

  async function recomputePreview() {
    const cid = getActiveCompanyId();
    if (!cid || !path || !file) return;
    setBusy(true);
    try {
      const r = await doPreview({ data: { companyId: cid, path, fileName: file.name, mapping } });
      setPreview(r.preview);
    } finally {
      setBusy(false);
    }
  }

  async function handleRunImport() {
    const cid = getActiveCompanyId();
    if (!cid || !path || !file) return;
    if (!confirm("Importom sa vytvoria nové záznamy vo vašej firme. Pokračovať?")) return;
    setBusy(true);
    try {
      const r = await doImport({
        data: { companyId: cid, path, fileName: file.name, mapping, options },
      });
      setResult(r);
      setStep(5);
      toast.success(
        `Importovaných ${r.imported_invoices} faktúr a ${r.imported_customers} odberateľov.`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Import zlyhal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Import zo SuperFaktúry"
        description="Nahrajte ZIP z Export agendy alebo Excel/CSV. Faktero rozpozná stĺpce samo, ručné mapovanie je len záloha."
        action={
          <Link
            to="/importy"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            <History className="h-4 w-4" /> História importov
          </Link>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-5xl space-y-6">
          <Stepper step={step} />

          {step === 1 && (
            <section className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold">1. Nahrajte export súbor</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Podporujeme ZIP a súbory .isdoc z <strong>Export agendy</strong> vo SuperFaktúre,
                ďalej Excel (.xlsx), CSV a XML. Maximálne 20 MB.
              </p>
              <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Kde export nájdete</p>
                <p className="mt-1">
                  Vo SuperFaktúre otvorte <strong>Nástroje → Export agendy</strong>, vyberte
                  obdobie a stiahnite export. Dostanete ZIP, v ktorom je každá faktúra ako
                  samostatný súbor <code>.isdoc</code> — nahrajte ho sem celý, rozbaľovať ho
                  netreba.
                </p>
              </div>
              <label className="mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/30 px-6 py-12 text-sm hover:border-primary/50">
                <Upload className="h-8 w-8 text-primary" />
                <span className="font-medium">
                  {file ? file.name : "Vyberte alebo presuňte súbor"}
                </span>
                <span className="text-xs text-muted-foreground">
                  .zip · .isdoc · .xlsx · .csv · .xml
                </span>
                <input
                  type="file"
                  accept=".zip,.isdoc,.xlsx,.xls,.csv,.xml,text/csv,application/xml,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
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
                  Načítať a pokračovať
                </button>
              </div>
            </section>
          )}

          {step === 2 && preview && (
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">2. Automatická detekcia</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {detection?.detectedSource === "superfaktura"
                      ? "Rozpoznaný export SuperFaktúry."
                      : "Rozpoznaný všeobecný export."}{" "}
                    Detekovaných polí: {detection?.detectedColumns?.length ?? 0}.
                  </p>
                </div>
                {detection && (
                  <ConfidenceBadge label={detection.confidenceLabel} value={detection.confidence} />
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Faktúry" value={preview.invoicesCount} />
                <Stat label="Odberatelia" value={preview.customersCount} />
                <Stat label="Riadky" value={preview.itemsCount} />
                <Stat
                  label="Celková hodnota"
                  value={`${preview.totalValue.toFixed(2)} ${preview.currency}`}
                />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Obdobie: {preview.dateFrom ?? "—"} až {preview.dateTo ?? "—"}
              </div>
              {detection?.perField && (
                <div className="mt-4 rounded-lg border border-border bg-background p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Detekované stĺpce
                  </div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {Object.entries(detection.perField).map(([f, v]: any) => (
                      <div
                        key={f}
                        className="flex items-center justify-between rounded border border-border/50 bg-secondary/30 px-2 py-1 text-xs"
                      >
                        <span className="text-muted-foreground">
                          {FIELDS.find((x) => x.key === f)?.label ?? f}
                        </span>
                        <span className="font-medium">
                          {v.header} · {Math.round(v.score * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {preview.sampleInvoices?.length > 0 && (
                <div className="mt-5 overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Číslo</th>
                        <th className="px-3 py-2 text-left">Odberateľ</th>
                        <th className="px-3 py-2 text-left">Dátum</th>
                        <th className="px-3 py-2 text-right">Suma</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sampleInvoices.map((s: any, i: number) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-2">{s.invoice_number}</td>
                          <td className="px-3 py-2">{s.customer_name || "—"}</td>
                          <td className="px-3 py-2">{s.issue_date ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {Number(s.total).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                >
                  <ArrowLeft className="h-4 w-4" /> Späť
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setStep(3)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                  >
                    <Sliders className="h-4 w-4" /> Upraviť mapovanie
                  </button>
                  <button
                    onClick={() => setStep(4)}
                    disabled={detection?.confidenceLabel === "low"}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    title={
                      detection?.confidenceLabel === "low"
                        ? "Nízka zhoda — upravte mapovanie najprv"
                        : undefined
                    }
                  >
                    <Sparkles className="h-4 w-4" /> Importovať automaticky
                  </button>
                </div>
              </div>
              {detection?.confidenceLabel === "low" && (
                <p className="mt-3 text-xs text-amber-600">
                  Nízka zhoda detekcie. Skontrolujte a doplňte mapovanie pred importom.
                </p>
              )}
            </section>
          )}

          {step === 3 && (
            <section className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-base font-semibold">3. Mapovanie polí</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Spárujte stĺpce z vášho súboru s poľami Faktera. Nevyplnené sa preskočia.
              </p>
              {(["Faktúra", "Odberateľ", "Položka"] as const).map((group) => (
                <div key={group} className="mt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {FIELDS.filter((f) => f.group === group).map((f) => (
                      <div
                        key={f.key}
                        className="grid grid-cols-2 items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5"
                      >
                        <label className="text-sm">{f.label}</label>
                        <select
                          value={mapping[f.key] ?? ""}
                          onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                        >
                          <option value="">— ignorovať —</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <Footer
                onBack={() => setStep(2)}
                onNext={async () => {
                  await recomputePreview();
                  setStep(4);
                }}
                nextLabel="Validovať"
              />
            </section>
          )}

          {step === 4 && preview && (
            <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <h2 className="text-base font-semibold">4. Validácia a možnosti</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <ValidationCard
                  kind="ok"
                  label="Faktúry pripravené"
                  value={preview.invoicesCount}
                />
                <ValidationCard kind="ok" label="Odberatelia" value={preview.customersCount} />
                <ValidationCard
                  kind="warn"
                  label="Riadky bez čísla faktúry"
                  value={!mapping.invoice_number ? preview.itemsCount : 0}
                />
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                  <div>
                    <p className="font-medium">Upozornenie</p>
                    <p className="text-muted-foreground">
                      Import zapíše dáta do vašej firmy. Operácia sa nedá automaticky vrátiť.
                      Skontrolujte mapovanie pred potvrdením.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["updateExisting", "Aktualizovať existujúce faktúry"],
                  ["customersOnly", "Importovať iba odberateľov"],
                  ["invoicesOnly", "Importovať iba faktúry"],
                  ["generatePdfs", "Vygenerovať PDF po importe"],
                  ["triggerWebhooks", "Spustiť webhooky po importe"],
                ].map(([k, label]) => (
                  <label
                    key={k}
                    className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={(options as any)[k]}
                      onChange={(e) => setOptions({ ...options, [k]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Footer
                onBack={() => setStep(3)}
                onNext={handleRunImport}
                nextLabel={busy ? "Importujem…" : "Potvrdiť a importovať"}
                disabled={busy}
              />
            </section>
          )}

          {step === 5 && result && (
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
                <Link
                  to="/faktury"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Prejsť na faktúry
                </Link>
                <Link
                  to="/importy"
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
                >
                  História importov
                </Link>
              </div>
            </section>
          )}
        </div>
      </PageBody>
    </>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Upload", "Náhľad", "Mapovanie", "Validácia", "Hotovo"];
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
      {labels.map((l, i) => {
        const n = i + 1,
          active = step === n,
          done = step > n;
        return (
          <div key={l} className="flex flex-1 items-center gap-2">
            <div
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary/10 text-primary ring-2 ring-primary/30" : "bg-secondary text-muted-foreground"}`}
            >
              {n}
            </div>
            <span className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>
              {l}
            </span>
            {i < labels.length - 1 && (
              <div
                className={`mx-2 hidden h-px flex-1 sm:block ${done ? "bg-primary" : "bg-border"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ConfidenceBadge({ label, value }: { label: "high" | "medium" | "low"; value: number }) {
  const map = {
    high: { text: "Vysoká zhoda", cls: "border-primary/40 bg-primary/10 text-primary" },
    medium: { text: "Stredná zhoda", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700" },
    low: { text: "Nízka zhoda", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  } as const;
  const v = map[label] ?? map.medium;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${v.cls}`}
    >
      <Sparkles className="h-3.5 w-3.5" /> {v.text} · {Math.round((value ?? 0) * 100)}%
    </div>
  );
}

function ValidationCard({
  kind,
  label,
  value,
}: {
  kind: "ok" | "warn" | "err";
  label: string;
  value: any;
}) {
  const color =
    kind === "ok"
      ? "border-primary/30 bg-primary/5 text-primary"
      : kind === "warn"
        ? "border-amber-500/30 bg-amber-500/5 text-amber-700"
        : "border-destructive/30 bg-destructive/5 text-destructive";
  return (
    <div className={`rounded-lg border p-3 ${color}`}>
      <div className="text-xs">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Footer({
  onBack,
  onNext,
  nextLabel = "Pokračovať",
  disabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-between">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
      >
        <ArrowLeft className="h-4 w-4" /> Späť
      </button>
      <button
        onClick={onNext}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {nextLabel} <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
