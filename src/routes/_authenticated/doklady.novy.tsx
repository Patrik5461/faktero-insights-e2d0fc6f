import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { captureReceipt } from "@/lib/mobile/receipt-scanner";
import { scanQrCode } from "@/lib/mobile/qr-scanner";
import { aiParseReceiptFn } from "@/lib/faktero/ai-receipt.functions";
import {
  createExpenseFn, updateExpenseFn, parseQrFn, getExpenseFileUrlFn,
} from "@/lib/faktero/expenses.functions";
import { Camera, Loader2, QrCode, Save, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/doklady/novy")({
  head: () => ({ meta: [{ title: "Nový doklad — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ id: (s.id as string) || undefined }),
  component: NovyDokladPage,
});

type Form = {
  supplier_name: string; supplier_ico: string; supplier_ic_dph: string;
  document_number: string; issue_date: string;
  total_amount: string; vat_amount: string; net_amount: string; vat_rate: string;
  currency: string; category: string; note: string;
};

const EMPTY: Form = {
  supplier_name: "", supplier_ico: "", supplier_ic_dph: "",
  document_number: "", issue_date: new Date().toISOString().slice(0, 10),
  total_amount: "", vat_amount: "", net_amount: "", vat_rate: "20",
  currency: "EUR", category: "", note: "",
};

function NovyDokladPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/doklady/novy" });
  const parseAi = useServerFn(aiParseReceiptFn);
  const parseQr = useServerFn(parseQrFn);
  const createFn = useServerFn(createExpenseFn);
  const updateFn = useServerFn(updateExpenseFn);
  const urlFn = useServerFn(getExpenseFileUrlFn);
  const [form, setForm] = useState<Form>(EMPTY);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ path: string; mime: string; size: number } | null>(null);
  const [source, setSource] = useState<"photo" | "qr" | "upload" | "web">("photo");
  const [qrRaw, setQrRaw] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cid = getActiveCompanyId();

  // Načíta existujúci doklad (editácia)
  useEffect(() => {
    if (!search.id) return;
    (async () => {
      const { data } = await supabase.from("expense_documents").select("*").eq("id", search.id).maybeSingle();
      if (!data) return;
      setForm({
        supplier_name: data.supplier_name ?? "", supplier_ico: data.supplier_ico ?? "",
        supplier_ic_dph: data.supplier_ic_dph ?? "", document_number: data.document_number ?? "",
        issue_date: data.issue_date ?? "",
        total_amount: data.total_amount?.toString() ?? "", vat_amount: data.vat_amount?.toString() ?? "",
        net_amount: data.net_amount?.toString() ?? "", vat_rate: data.vat_rate?.toString() ?? "20",
        currency: data.currency ?? "EUR", category: data.category ?? "", note: data.note ?? "",
      });
      setSource(data.source);
      setQrRaw(data.qr_raw);
      if (data.file_path) {
        setUploadedFile({ path: data.file_path, mime: data.file_mime ?? "", size: data.file_size ?? 0 });
        try { const { url } = await urlFn({ data: { file_path: data.file_path } }); setPreview(url); } catch {}
      }
    })();
    // eslint-disable-next-line
  }, [search.id]);

  function updateForm<K extends keyof Form>(k: K, v: Form[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function uploadToStorage(dataUrl: string, mime: string): Promise<{ path: string; size: number } | null> {
    if (!cid) return null;
    const bin = atob(dataUrl.split(",")[1] || "");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = mime.split("/")[1] || "jpg";
    const path = `${cid}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("expense-receipts").upload(path, bytes, { contentType: mime });
    if (error) { toast.error(error.message); return null; }
    return { path, size: bytes.length };
  }

  async function handleScanPhoto() {
    const cap = await captureReceipt();
    if (!cap) return;
    setSource("photo");
    setPreview(cap.dataUrl);
    setLoading(true);
    try {
      const stored = await uploadToStorage(cap.dataUrl, cap.mimeType);
      if (stored) setUploadedFile({ path: stored.path, mime: cap.mimeType, size: stored.size });
      const parsed = await parseAi({ data: { image_data_url: cap.dataUrl } });
      applyAiResult(parsed);
    } catch (e: any) { toast.error(e?.message ?? "AI spracovanie zlyhalo"); }
    finally { setLoading(false); }
  }

  async function handleScanQr() {
    const res = await scanQrCode();
    if (!res) { toast.error("QR skener nedostupný alebo zrušený. Použite foto."); return; }
    setSource("qr");
    setQrRaw(res.raw);
    setLoading(true);
    try {
      const { parsed } = await parseQr({ data: { raw: res.raw } });
      if (parsed.supplier_ico) updateForm("supplier_ico", parsed.supplier_ico);
      if (parsed.total_amount != null) updateForm("total_amount", String(parsed.total_amount));
      if (parsed.issue_date) updateForm("issue_date", parsed.issue_date);
      if (parsed.document_number) updateForm("document_number", parsed.document_number);
      toast.success("QR kód načítaný");
    } catch (e: any) { toast.error(e?.message ?? "QR sa nepodarilo spracovať"); }
    finally { setLoading(false); }
  }

  async function handleFile(file: File) {
    setSource("upload");
    setLoading(true);
    try {
      const reader = new FileReader();
      const dataUrl: string = await new Promise((res, rej) => {
        reader.onload = () => res(String(reader.result));
        reader.onerror = () => rej(reader.error);
        reader.readAsDataURL(file);
      });
      if (file.type.startsWith("image/")) setPreview(dataUrl);
      const stored = await uploadToStorage(dataUrl, file.type || "application/octet-stream");
      if (stored) setUploadedFile({ path: stored.path, mime: file.type, size: stored.size });
      if (file.type.startsWith("image/")) {
        const parsed = await parseAi({ data: { image_data_url: dataUrl } });
        applyAiResult(parsed);
      }
    } catch (e: any) { toast.error(e?.message ?? "Nahratie zlyhalo"); }
    finally { setLoading(false); }
  }

  function applyAiResult(parsed: any) {
    if (parsed.supplier) updateForm("supplier_name", parsed.supplier);
    if (parsed.total != null) updateForm("total_amount", String(parsed.total));
    if (parsed.vat_rate != null) updateForm("vat_rate", String(parsed.vat_rate));
    if (parsed.date) updateForm("issue_date", parsed.date);
    if (parsed.currency) updateForm("currency", parsed.currency);
    // Dopočítať net/vat ak chýba
    const total = Number(parsed.total ?? 0);
    const rate = Number(parsed.vat_rate ?? 0);
    if (total > 0 && rate > 0) {
      const net = total / (1 + rate / 100);
      updateForm("net_amount", net.toFixed(2));
      updateForm("vat_amount", (total - net).toFixed(2));
    }
    toast.success("AI predvyplnila polia — skontrolujte a uložte");
  }

  async function handleSave() {
    if (!cid) { toast.error("Vyberte firmu"); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: cid,
        source,
        status: "processed" as const,
        supplier_name: form.supplier_name || null,
        supplier_ico: form.supplier_ico || null,
        supplier_ic_dph: form.supplier_ic_dph || null,
        document_number: form.document_number || null,
        issue_date: form.issue_date || null,
        total_amount: form.total_amount ? Number(form.total_amount) : null,
        vat_amount: form.vat_amount ? Number(form.vat_amount) : null,
        net_amount: form.net_amount ? Number(form.net_amount) : null,
        vat_rate: form.vat_rate ? Number(form.vat_rate) : null,
        currency: form.currency || "EUR",
        category: form.category || null,
        note: form.note || null,
        file_path: uploadedFile?.path ?? null,
        file_mime: uploadedFile?.mime ?? null,
        file_size: uploadedFile?.size ?? null,
        qr_raw: qrRaw,
      };
      if (search.id) await updateFn({ data: { id: search.id, patch: payload } });
      else await createFn({ data: payload });
      toast.success("Doklad uložený");
      navigate({ to: "/doklady" });
    } catch (e: any) { toast.error(e?.message ?? "Uloženie zlyhalo"); }
    finally { setSaving(false); }
  }

  return (
    <>
      <PageHeader title={search.id ? "Upraviť doklad" : "Nový doklad"} description="Naskenujte, odfoťte alebo nahrajte bloček — AI predvyplní polia." />
      <PageBody>
        <div className="mx-auto max-w-3xl space-y-5">
          {!search.id && (
            <div className="grid gap-3 sm:grid-cols-3">
              <button onClick={handleScanPhoto} disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                <Camera className="h-5 w-5" /> Odfotiť
              </button>
              <button onClick={handleScanQr} disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-4 text-sm font-medium hover:bg-secondary disabled:opacity-50">
                <QrCode className="h-5 w-5" /> QR kód
              </button>
              <button onClick={() => inputRef.current?.click()} disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-4 text-sm font-medium hover:bg-secondary disabled:opacity-50">
                <UploadIcon className="h-5 w-5" /> Nahrať súbor
              </button>
              <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          )}

          {!search.id && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false);
                const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
              }}
              className={`rounded-2xl border-2 border-dashed p-8 text-center text-sm transition ${
                dragOver ? "border-primary bg-primary/5" : "border-border bg-card/50 text-muted-foreground"
              }`}
            >
              Presuňte sem fotku alebo PDF dokladu (drag &amp; drop).
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Spracovávam…
            </div>
          )}

          {preview && (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <img src={preview} alt="náhľad" className="max-h-72 w-full object-contain" />
            </div>
          )}

          {qrRaw && (
            <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs">
              <div className="mb-1 font-medium">QR obsah</div>
              <div className="break-all font-mono">{qrRaw}</div>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold">Údaje dokladu</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Dodávateľ" value={form.supplier_name} onChange={(v) => updateForm("supplier_name", v)} />
              <Field label="IČO" value={form.supplier_ico} onChange={(v) => updateForm("supplier_ico", v)} />
              <Field label="IČ DPH" value={form.supplier_ic_dph} onChange={(v) => updateForm("supplier_ic_dph", v)} />
              <Field label="Číslo dokladu" value={form.document_number} onChange={(v) => updateForm("document_number", v)} />
              <Field label="Dátum vystavenia" type="date" value={form.issue_date} onChange={(v) => updateForm("issue_date", v)} />
              <Field label="Kategória" value={form.category} onChange={(v) => updateForm("category", v)} placeholder="napr. pohonné hmoty" />
              <Field label="Suma bez DPH" type="number" value={form.net_amount} onChange={(v) => updateForm("net_amount", v)} />
              <Field label="DPH" type="number" value={form.vat_amount} onChange={(v) => updateForm("vat_amount", v)} />
              <Field label="Celkom" type="number" value={form.total_amount} onChange={(v) => updateForm("total_amount", v)} />
              <Field label="Sadzba DPH %" type="number" value={form.vat_rate} onChange={(v) => updateForm("vat_rate", v)} />
              <Field label="Mena" value={form.currency} onChange={(v) => updateForm("currency", v)} />
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-muted-foreground">Poznámka</label>
                <textarea value={form.note} onChange={(e) => updateForm("note", e.target.value)}
                  rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => navigate({ to: "/doklady" })} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary">Zrušiť</button>
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                <Save className="h-4 w-4" /> Uložiť doklad
              </button>
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
    </div>
  );
}
