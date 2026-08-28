import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { captureReceipt } from "@/lib/mobile/receipt-scanner";
import { scanQrCode, scanQrFromImage } from "@/lib/mobile/qr-scanner";
import { nacitajBlocekFn, PRENOS_KLUC, type BlocekVysledok } from "@/lib/faktero/blocek.functions";
import {
  createExpenseFn,
  updateExpenseFn,
  getExpenseFileUrlFn,
} from "@/lib/faktero/expenses.functions";
import { Camera, Loader2, QrCode, Save, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { formatovacMeny } from "@/lib/faktero/mena";
import { MENY } from "@/lib/faktero/mena";

export const Route = createFileRoute("/_authenticated/doklady/novy")({
  head: () => ({ meta: [{ title: "Nový doklad — Faktero" }] }),
  // `prenos` znamená, že bloček prečítaný v skeneri čaká v `sessionStorage`.
  // Cez adresu sa neposiela — položiek býva aj dvadsať.
  validateSearch: (s: Record<string, unknown>): DokladSearch => ({
    id: typeof s.id === "string" && s.id ? s.id : undefined,
    prenos: s.prenos ? "1" : undefined,
  }),
  component: NovyDokladPage,
});

type DokladSearch = { id?: string; prenos?: string };

type Form = {
  supplier_name: string;
  supplier_ico: string;
  supplier_ic_dph: string;
  document_number: string;
  issue_date: string;
  /** Prázdne, kým si človek nevyberie — z predvolenej hotovosti ubúdalo v pokladni. */
  payment_method: "" | "hotovost" | "karta" | "prevod";
  total_amount: string;
  vat_amount: string;
  net_amount: string;
  vat_rate: string;
  currency: string;
  category: string;
  note: string;
};

const EMPTY: Form = {
  supplier_name: "",
  supplier_ico: "",
  supplier_ic_dph: "",
  document_number: "",
  issue_date: new Date().toISOString().slice(0, 10),
  /*
    Do stavu pokladne vstupujú len doklady platené hotovosťou, a práve preto
    sa tu nič nepredvolí. Kým tu bola hotovosť, kartová platba sa uložila ako
    hotovostná, pokladňa sa o ňu ukrátila a nikto to nehľadal. Rovnako to je
    v skeneri aj v appke.
  */
  payment_method: "" as "" | "hotovost" | "karta" | "prevod",
  total_amount: "",
  vat_amount: "",
  net_amount: "",
  vat_rate: "23",
  currency: "EUR",
  category: "",
  note: "",
};

function NovyDokladPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/doklady/novy" });
  const nacitaj = useServerFn(nacitajBlocekFn);
  const createFn = useServerFn(createExpenseFn);
  const updateFn = useServerFn(updateExpenseFn);
  const urlFn = useServerFn(getExpenseFileUrlFn);
  const [form, setForm] = useState<Form>(EMPTY);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{
    path: string;
    mime: string;
    size: number;
  } | null>(null);
  const [source, setSource] = useState<"photo" | "qr" | "upload" | "web">("photo");
  const [qrRaw, setQrRaw] = useState<string | null>(null);
  /* Položky a rozpis DPH z bločku — ukladajú sa k dokladu tak, ako prišli. */
  const [polozky, setPolozky] = useState<BlocekVysledok["items"]>([]);
  const [rozpisDph, setRozpisDph] = useState<BlocekVysledok["vat_breakdown"] | null>(null);
  /** Do „Celkom“ siahol človek alebo prišlo z bločku — potom sa nedopočítava. */
  const celkomRucne = useRef(false);
  const [ekasaBadge, setEkasaBadge] = useState<null | {
    source: BlocekVysledok["zdroj"];
    overeny: boolean;
  }>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cid = getActiveCompanyId();

  // Načíta existujúci doklad (editácia)
  useEffect(() => {
    const id = search.id;
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("expense_documents")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!data) return;
      setForm({
        supplier_name: data.supplier_name ?? "",
        supplier_ico: data.supplier_ico ?? "",
        supplier_ic_dph: data.supplier_ic_dph ?? "",
        document_number: data.document_number ?? "",
        issue_date: data.issue_date ?? "",
        total_amount: data.total_amount?.toString() ?? "",
        vat_amount: data.vat_amount?.toString() ?? "",
        net_amount: data.net_amount?.toString() ?? "",
        vat_rate: data.vat_rate?.toString() ?? "23",
        currency: data.currency ?? "EUR",
        payment_method: (data.payment_method ?? "") as "" | "hotovost" | "karta" | "prevod",
        category: data.category ?? "",
        note: data.note ?? "",
      });
      celkomRucne.current = data.total_amount != null;
      setSource(data.source as "photo" | "qr" | "upload" | "web");
      setQrRaw(data.qr_raw);
      setPolozky(Array.isArray(data.items) ? (data.items as any) : []);
      setRozpisDph(Array.isArray(data.vat_breakdown) ? (data.vat_breakdown as any) : null);
      if (data.file_path) {
        setUploadedFile({
          path: data.file_path,
          mime: data.file_mime ?? "",
          size: data.file_size ?? 0,
        });
        try {
          const { url } = await urlFn({ data: { file_path: data.file_path } });
          setPreview(url);
        } catch {
          // náhľad je nadštandard — doklad sa dá otvoriť aj bez neho
        }
      }
    })();
    // eslint-disable-next-line
  }, [search.id]);

  function updateForm<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  /**
   * Celkovú sumu dopočítavame zo základu a DPH. Ručne vypísaný doklad inak
   * ostal s prázdnym „Celkom“ — a doklad bez sumy nevstúpi ani do pokladne,
   * ani do súčtov pre účtovníka.
   */
  useEffect(() => {
    if (celkomRucne.current) return;
    const zaklad = form.net_amount === "" ? null : Number(form.net_amount);
    const dph = form.vat_amount === "" ? null : Number(form.vat_amount);
    if (zaklad == null && dph == null) return;
    const suma =
      (Number.isFinite(zaklad as number) ? (zaklad as number) : 0) +
      (Number.isFinite(dph as number) ? (dph as number) : 0);
    const nova = suma.toFixed(2);
    setForm((f) => (f.total_amount === nova ? f : { ...f, total_amount: nova }));
  }, [form.net_amount, form.vat_amount]);

  /* Bloček prečítaný v skeneri — prevezme sa raz, pri otvorení stránky. */
  useEffect(() => {
    if (search.id || !search.prenos) return;
    let r: BlocekVysledok | null = null;
    try {
      const raw = sessionStorage.getItem(PRENOS_KLUC);
      // Prenos je jednorazový; inak by sa ten istý doklad predvyplnil aj
      // pri ďalšom otvorení stránky.
      sessionStorage.removeItem(PRENOS_KLUC);
      r = raw ? JSON.parse(raw) : null;
    } catch {
      r = null;
    }
    if (!r) {
      toast.error("Prečítaný doklad sa nenašiel. Naskenujte ho znova.");
      return;
    }
    applyBlocek(r, { ticho: true });
    if (r.qr_raw) setQrRaw(r.qr_raw);
    setSource(r.zdroj === "foto" ? "photo" : "qr");
    toast.success(
      r.items.length
        ? `Doklad prevzatý zo skenera vrátane ${r.items.length} položiek`
        : "Doklad prevzatý zo skenera",
    );
    // eslint-disable-next-line
  }, []);

  async function uploadToStorage(
    dataUrl: string,
    mime: string,
  ): Promise<{ path: string; size: number } | null> {
    if (!cid) return null;
    const bin = atob(dataUrl.split(",")[1] || "");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = mime.split("/")[1] || "jpg";
    const path = `${cid}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("expense-receipts")
      .upload(path, bytes, { contentType: mime });
    if (error) {
      toast.error(error.message);
      return null;
    }
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
      // Na fotke býva aj QR kód — keď sa dá prečítať, doklad príde z Finančnej
      // správy presne, namiesto odhadu z obrázka.
      const qr = await scanQrFromImage(cap.dataUrl);
      if (qr?.raw) {
        setQrRaw(qr.raw);
        setSource("qr");
      }
      await precitaj(qr?.raw, cap.dataUrl);
    } catch (e: any) {
      toast.error(e?.message ?? "Spracovanie zlyhalo");
    } finally {
      setLoading(false);
    }
  }

  async function handleScanQr() {
    const res = await scanQrCode();
    if (!res) {
      toast.error("QR skener nedostupný alebo zrušený. Použite foto.");
      return;
    }
    setSource("qr");
    setQrRaw(res.raw);
    setLoading(true);
    try {
      await precitaj(res.raw);
    } catch (e: any) {
      toast.error(e?.message ?? "QR sa nepodarilo spracovať");
    } finally {
      setLoading(false);
    }
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
      // Faktúra od dodávateľa chodí v PDF a čítať sa dá rovnako ako fotka —
      // len QR kód v nej hľadať netreba, ten je na bločkoch. Doteraz sa PDF
      // len priložilo a všetky údaje sa prepisovali ručne.
      if (file.type.startsWith("image/")) {
        const qr = await scanQrFromImage(dataUrl);
        if (qr?.raw) setQrRaw(qr.raw);
        await precitaj(qr?.raw, dataUrl);
      } else if (file.type === "application/pdf") {
        await precitaj(undefined, dataUrl);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Nahratie zlyhalo");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Prenesie prečítaný doklad do formulára.
   *
   * Doklad z Finančnej správy nesie DPH priamo, tak sa nedopočítava — dopočet
   * zo sadzby by na doklade s viacerými sadzbami dal nesprávne číslo.
   */
  function applyBlocek(r: BlocekVysledok, opts?: { ticho?: boolean }) {
    if (r.supplier) updateForm("supplier_name", r.supplier);
    if (r.supplier_ico) updateForm("supplier_ico", r.supplier_ico);
    if (r.supplier_ic_dph) updateForm("supplier_ic_dph", r.supplier_ic_dph);
    if (r.document_number) updateForm("document_number", r.document_number);
    if (r.date) updateForm("issue_date", r.date);
    if (r.currency) updateForm("currency", r.currency);
    if (r.vat_rate != null) updateForm("vat_rate", String(r.vat_rate));
    if (r.total != null) {
      celkomRucne.current = true;
      updateForm("total_amount", String(r.total));
    }

    const total = r.total ?? 0;
    if (r.vat_amount != null) {
      updateForm("vat_amount", r.vat_amount.toFixed(2));
      if (total > 0) updateForm("net_amount", (total - r.vat_amount).toFixed(2));
    } else if (total > 0 && r.vat_rate) {
      const net = total / (1 + r.vat_rate / 100);
      updateForm("net_amount", net.toFixed(2));
      updateForm("vat_amount", (total - net).toFixed(2));
    }

    if (r.payment_method) updateForm("payment_method", r.payment_method);
    setPolozky(r.items ?? []);
    setRozpisDph(r.vat_breakdown ?? null);

    setEkasaBadge({ source: r.zdroj, overeny: r.overeny });
    if (opts?.ticho) return;
    if (r.zdroj === "ekasa")
      toast.success(
        r.items.length
          ? `Doklad z Finančnej správy vrátane ${r.items.length} položiek`
          : "Doklad načítaný z Finančnej správy",
      );
    else if (r.zdroj === "nic") toast.error(r.poznamka ?? "Nepodarilo sa prečítať nič");
    else toast.success("Polia predvyplnené — skontrolujte ich a uložte");
  }

  async function precitaj(qr: string | undefined, dataUrl?: string) {
    const r = (await nacitaj({ data: { qr, image_data_url: dataUrl } })) as BlocekVysledok;
    applyBlocek(r);
  }

  async function handleSave() {
    if (!cid) {
      toast.error("Vyberte firmu");
      return;
    }
    // Tlačidlo je bez toho zamknuté; toto je poistka pre klávesnicu a doplnky.
    const uhrada = form.payment_method;
    if (!uhrada) {
      toast.error("Vyberte spôsob úhrady — hotovosť uberá zo stavu pokladne.");
      return;
    }
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
        payment_method: uhrada,
        qr_raw: qrRaw,
        // Položky a rozpis DPH z bločku sa ukladajú tak, ako prišli — z nich
        // je vidieť, za čo sa platilo, aj keď je doklad len jedna suma.
        items: polozky.length ? polozky : null,
        vat_breakdown: rozpisDph?.length ? rozpisDph : null,
      };
      if (search.id) await updateFn({ data: { id: search.id, patch: payload } });
      else await createFn({ data: payload });
      toast.success("Doklad uložený");
      navigate({ to: "/doklady" });
    } catch (e: any) {
      toast.error(e?.message ?? "Uloženie zlyhalo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title={search.id ? "Upraviť doklad" : "Nový doklad"}
        description="Naskenujte, odfoťte alebo nahrajte bloček — údaje sa doplnia samé."
      />
      <PageBody>
        <div className="mx-auto max-w-3xl space-y-5">
          {!search.id && (
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                onClick={handleScanPhoto}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Camera className="h-5 w-5" /> Odfotiť
              </button>
              <button
                onClick={handleScanQr}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-4 text-sm font-medium hover:bg-secondary disabled:opacity-50"
              >
                <QrCode className="h-5 w-5" /> QR kód
              </button>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-4 text-sm font-medium hover:bg-secondary disabled:opacity-50"
              >
                <UploadIcon className="h-5 w-5" /> Nahrať súbor
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          )}

          {!search.id && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={`rounded-2xl border-2 border-dashed p-8 text-center text-sm transition ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card/50 text-muted-foreground"
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
            <div className="space-y-2">
              {ekasaBadge && (
                <div className="flex flex-wrap gap-2">
                  {ekasaBadge.overeny && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      ✓ Načítané z Finančnej správy
                    </span>
                  )}
                  {ekasaBadge.source === "qr" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Len z QR kódu — doklad sa vo Finančnej správe nenašiel
                    </span>
                  )}
                  {ekasaBadge.source === "foto" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                      Odhadnuté z fotky — skontrolujte údaje
                    </span>
                  )}
                </div>
              )}
              <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs">
                <div className="mb-1 font-medium">QR obsah</div>
                <div className="break-all font-mono">{qrRaw}</div>
              </div>
            </div>
          )}

          {polozky.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h3 className="text-sm font-semibold">Položky dokladu ({polozky.length})</h3>
                <button
                  onClick={() => setPolozky([])}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Odstrániť položky
                </button>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {polozky.map((p, i) => (
                    <tr key={i} className="border-t border-border first:border-t-0">
                      <td className="px-5 py-2">{p.name || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {p.quantity} ×{" "}
                        {formatovacMeny(form.currency || "EUR", "sk-SK")(p.unit_price)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.vat_rate} %</td>
                      <td className="px-5 py-2 text-right tabular-nums font-medium">
                        {formatovacMeny(
                          form.currency || "EUR",
                          "sk-SK",
                        )(p.total ?? p.quantity * p.unit_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rozpisDph && rozpisDph.length > 0 && (
                <div className="border-t border-border bg-muted/30 px-5 py-2 text-xs text-muted-foreground">
                  Rozpis DPH:{" "}
                  {rozpisDph
                    .map(
                      (s) =>
                        `${s.sadzba} % — základ ${s.zaklad.toFixed(2)}, daň ${s.dph.toFixed(2)}`,
                    )
                    .join(" · ")}
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold">Údaje dokladu</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Dodávateľ"
                value={form.supplier_name}
                onChange={(v) => updateForm("supplier_name", v)}
              />
              <Field
                label="IČO"
                value={form.supplier_ico}
                onChange={(v) => updateForm("supplier_ico", v)}
              />
              <Field
                label="IČ DPH"
                value={form.supplier_ic_dph}
                onChange={(v) => updateForm("supplier_ic_dph", v)}
              />
              <Field
                label="Číslo dokladu"
                value={form.document_number}
                onChange={(v) => updateForm("document_number", v)}
              />
              <Field
                label="Dátum vystavenia"
                type="date"
                value={form.issue_date}
                onChange={(v) => updateForm("issue_date", v)}
              />
              <Field
                label="Kategória"
                value={form.category}
                onChange={(v) => updateForm("category", v)}
                placeholder="napr. pohonné hmoty"
              />
              <Field
                label="Suma bez DPH"
                type="number"
                value={form.net_amount}
                onChange={(v) => updateForm("net_amount", v)}
              />
              <Field
                label="DPH"
                type="number"
                value={form.vat_amount}
                onChange={(v) => updateForm("vat_amount", v)}
              />
              <Field
                label="Celkom"
                type="number"
                value={form.total_amount}
                onChange={(v) => {
                  celkomRucne.current = true;
                  updateForm("total_amount", v);
                }}
              />
              <Field
                label="Sadzba DPH %"
                type="number"
                value={form.vat_rate}
                onChange={(v) => updateForm("vat_rate", v)}
              />
              {/*
                Výber, nie voľný text. Neplatný kód meny sa zapíše do databázy
                a formátovanie súm ho potom dostane rovno odtiaľ — presne tak
                raz ostal prehľad prázdny.
              */}
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Mena</span>
                <select
                  value={form.currency}
                  onChange={(e) => updateForm("currency", e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {MENY.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.flag} {m.code} {m.symbol} — {m.name}
                    </option>
                  ))}
                </select>
              </label>
              {/* Rozhoduje o stave pokladne: kartou ani prevodom hotovosť neubudne. */}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Platené
                  {!form.payment_method && (
                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                      Povinné
                    </span>
                  )}
                </label>
                <select
                  value={form.payment_method}
                  onChange={(e) => updateForm("payment_method", e.target.value as never)}
                  className={`w-full rounded-md border bg-background px-3 py-2 text-sm ${
                    form.payment_method
                      ? "border-border"
                      : "border-primary/60 ring-2 ring-primary/15"
                  }`}
                >
                  <option value="">Vyberte…</option>
                  <option value="hotovost">Hotovosťou</option>
                  <option value="karta">Kartou</option>
                  <option value="prevod">Prevodom</option>
                </select>
                {!form.payment_method && (
                  <p className="mt-1 text-xs text-primary">
                    Bez toho sa doklad uložiť nedá — hotovosť uberá zo stavu pokladne.
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-muted-foreground">Poznámka</label>
                <textarea
                  value={form.note}
                  onChange={(e) => updateForm("note", e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => navigate({ to: "/doklady" })}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
              >
                Zrušiť
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.payment_method}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />{" "}
                {form.payment_method ? "Uložiť doklad" : "Vyberte spôsob úhrady"}
              </button>
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  // Menovka musí patriť k políčku, inak ju čítačka obrazovky ani doplnenie
  // údajov v prehliadači k ničomu nepriradia.
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
