import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { ArrowLeft, Upload, Loader2 } from "lucide-react";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { JobPicker } from "@/components/faktero/JobPicker";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, d: number) {
  const dt = new Date(iso);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}

/**
 * Formulár prijatej faktúry — ten istý na zaevidovanie aj na opravu.
 *
 * Bez úpravy sa preklep v sume dal opraviť len zmazaním a napísaním odznova,
 * čo je na účtovnom doklade zbytočne drsné.
 */
export function PrijataFakturaForm({ id }: { id?: string }) {
  const upravujeme = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState({
    supplier_name: "",
    supplier_ico: "",
    supplier_dic: "",
    supplier_ic_dph: "",
    supplier_iban: "",
    variable_symbol: "",
    invoice_number: "",
    issue_date: today(),
    received_date: today(),
    due_date: addDays(today(), 14),
    amount_without_vat: "" as string,
    vat_amount: "" as string,
    amount_total: "" as string,
    currency: "EUR",
    payment_method: "prevod",
    note: "",
    job_id: "",
    status: "received" as "draft" | "received" | "booked" | "paid" | "cancelled",
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [nacitavam, setNacitavam] = useState(Boolean(id));
  /** Príloha, ktorá je na faktúre už uložená — nová ju nahradí. */
  const [prilohaCesta, setPrilohaCesta] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  useEffect(() => {
    if (!id) return;
    let zrusene = false;
    (async () => {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (zrusene) return;
      if (error || !data) {
        toast.error("Prijatú faktúru sa nepodarilo načítať.");
        setNacitavam(false);
        return;
      }
      setForm({
        supplier_name: data.supplier_name ?? "",
        supplier_ico: data.supplier_ico ?? "",
        supplier_dic: data.supplier_dic ?? "",
        supplier_ic_dph: data.supplier_ic_dph ?? "",
        supplier_iban: data.supplier_iban ?? "",
        variable_symbol: data.variable_symbol ?? "",
        invoice_number: data.invoice_number ?? "",
        issue_date: data.issue_date ?? today(),
        received_date: data.received_date ?? today(),
        due_date: data.due_date ?? today(),
        amount_without_vat: data.amount_without_vat?.toString() ?? "",
        vat_amount: data.vat_amount?.toString() ?? "",
        amount_total: data.amount_total?.toString() ?? "",
        currency: data.currency ?? "EUR",
        payment_method: data.payment_method ?? "prevod",
        note: data.note ?? "",
        job_id: data.job_id ?? "",
        status: (data.status ?? "received") as typeof form.status,
      });
      setPrilohaCesta(data.file_path ?? null);
      setNacitavam(false);
    })();
    return () => {
      zrusene = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // auto-compute amount_total when net/vat change
  useEffect(() => {
    const net = parseFloat(form.amount_without_vat || "0");
    const vat = parseFloat(form.vat_amount || "0");
    if (!isNaN(net) || !isNaN(vat)) {
      const total = (isNaN(net) ? 0 : net) + (isNaN(vat) ? 0 : vat);
      set("amount_total", total.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.amount_without_vat, form.vat_amount]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cid = getActiveCompanyId();
    if (!cid) return toast.error("Vyberte firmu.");
    if (!form.supplier_name.trim()) return toast.error("Zadajte dodávateľa.");
    if (!form.invoice_number.trim()) return toast.error("Zadajte číslo faktúry.");

    setBusy(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      // Optional PDF upload first
      let file_path: string | null = null;
      let file_mime: string | null = null;
      let file_size: number | null = null;
      if (file) {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${cid}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage
          .from("purchase-invoices")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw new Error(`Upload PDF zlyhal: ${up.error.message}`);
        file_path = path;
        file_mime = file.type || null;
        file_size = file.size;
      }

      const payload = {
        company_id: cid,
        created_by: user.user?.id ?? null,
        source: "rucne",
        supplier_name: form.supplier_name.trim(),
        supplier_ico: form.supplier_ico.trim() || null,
        supplier_dic: form.supplier_dic.trim() || null,
        supplier_ic_dph: form.supplier_ic_dph.trim() || null,
        // IBAN bez medzier, aby sa dal rovno použiť v platobnom príkaze.
        supplier_iban: form.supplier_iban.replace(/\s+/g, "").toUpperCase() || null,
        variable_symbol: form.variable_symbol.trim() || null,
        invoice_number: form.invoice_number.trim(),
        issue_date: form.issue_date,
        received_date: form.received_date,
        due_date: form.due_date,
        amount_without_vat: parseFloat(form.amount_without_vat || "0") || 0,
        vat_amount: parseFloat(form.vat_amount || "0") || 0,
        amount_total: parseFloat(form.amount_total || "0") || 0,
        currency: form.currency,
        payment_method: form.payment_method || null,
        note: form.note || null,
        job_id: form.job_id || null,
        status: form.status,
        file_path,
        file_mime,
        file_size,
      };
      if (id) {
        // Autora ani firmu úprava nemení; nová príloha sa doplní, len keď je.
        const { created_by, company_id, ...zmeny } = payload;
        const uprava: Record<string, unknown> = { ...zmeny };
        if (!file) {
          delete uprava.file_path;
          delete uprava.file_mime;
          delete uprava.file_size;
        }
        const { error } = await supabase
          .from("purchase_invoices")
          .update(uprava as never)
          .eq("id", id);
        if (error) throw error;
        toast.success("Zmeny sú uložené");
        navigate({ to: "/prijate-faktury/$id", params: { id } });
        return;
      }
      const { data, error } = await supabase
        .from("purchase_invoices")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Prijatá faktúra bola uložená");
      navigate({ to: "/prijate-faktury/$id", params: { id: data!.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Uloženie zlyhalo");
    } finally {
      setBusy(false);
    }
  }

  if (nacitavam) {
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">Načítavam…</div>
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader
        title={upravujeme ? "Úprava prijatej faktúry" : "Nová prijatá faktúra"}
        description={
          upravujeme
            ? "Opravte údaje dokladu. Doklad z uzamknutého obdobia sa zmeniť nedá."
            : "Zaevidujte faktúru od dodávateľa (nákup / výdavok)."
        }
        action={
          <Link
            to="/prijate-faktury"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        <form onSubmit={submit} className="mx-auto grid max-w-4xl gap-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Dodávateľ
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Názov *">
                <input
                  required
                  value={form.supplier_name}
                  onChange={(e) => set("supplier_name", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="IČO">
                <div className="flex -space-x-px items-start">
                  <input
                    value={form.supplier_ico}
                    onChange={(e) => set("supplier_ico", e.target.value)}
                    className="input flex-1 rounded-l-md focus:z-10"
                  />
                  <IcoLookupButton
                    ico={form.supplier_ico}
                    onResult={(r) => {
                      if (r.name) set("supplier_name", r.name);
                      if (r.dic) set("supplier_dic", r.dic);
                      if (r.ic_dph) set("supplier_ic_dph", r.ic_dph);
                    }}
                  />
                </div>
              </Field>
              <Field label="DIČ">
                <input
                  value={form.supplier_dic}
                  onChange={(e) => set("supplier_dic", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="IČ DPH">
                <input
                  value={form.supplier_ic_dph}
                  onChange={(e) => set("supplier_ic_dph", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="IBAN dodávateľa">
                <input
                  value={form.supplier_iban}
                  onChange={(e) => set("supplier_iban", e.target.value)}
                  placeholder="SK00 0000 0000 0000 0000 0000"
                  className="input font-mono"
                />
              </Field>
              <Field label="Variabilný symbol">
                <input
                  value={form.variable_symbol}
                  onChange={(e) => set("variable_symbol", e.target.value)}
                  placeholder={form.invoice_number || "napr. 20260112"}
                  className="input"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Faktúra
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Číslo faktúry dodávateľa *">
                <input
                  required
                  value={form.invoice_number}
                  onChange={(e) => set("invoice_number", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Dátum vystavenia">
                <input
                  type="date"
                  required
                  value={form.issue_date}
                  onChange={(e) => set("issue_date", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Dátum prijatia">
                <input
                  type="date"
                  required
                  value={form.received_date}
                  onChange={(e) => set("received_date", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Dátum splatnosti">
                <input
                  type="date"
                  required
                  value={form.due_date}
                  onChange={(e) => set("due_date", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Spôsob platby">
                <select
                  value={form.payment_method}
                  onChange={(e) => set("payment_method", e.target.value)}
                  className="input"
                >
                  <option value="prevod">Prevod</option>
                  <option value="hotovost">Hotovosť</option>
                  <option value="karta">Karta</option>
                  <option value="dobierka">Dobierka</option>
                </select>
              </Field>
              <Field label="Stav">
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as any)}
                  className="input"
                >
                  <option value="draft">Koncept</option>
                  <option value="received">Prijaté</option>
                  <option value="booked">Zaúčtované</option>
                  <option value="paid">Zaplatené</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Sumy
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Bez DPH">
                <input
                  type="number"
                  step="0.01"
                  value={form.amount_without_vat}
                  onChange={(e) => set("amount_without_vat", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="DPH">
                <input
                  type="number"
                  step="0.01"
                  value={form.vat_amount}
                  onChange={(e) => set("vat_amount", e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Celkom">
                <input
                  type="number"
                  step="0.01"
                  value={form.amount_total}
                  onChange={(e) => set("amount_total", e.target.value)}
                  className="input font-semibold"
                />
              </Field>
              <Field label="Mena">
                <select
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                  className="input"
                >
                  <option value="EUR">EUR</option>
                  <option value="CZK">CZK</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Príloha & poznámka
            </h3>
            <Field label="PDF príloha">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground hover:bg-muted/30">
                <Upload className="h-4 w-4" />
                {file
                  ? file.name
                  : prilohaCesta
                    ? "Priložený súbor ostáva — kliknutím ho nahradíte"
                    : "Kliknite pre výber PDF/obrázka"}
                <input
                  type="file"
                  className="hidden"
                  accept="application/pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </Field>
            <JobPicker
              value={form.job_id}
              onChange={(v) => set("job_id", v)}
              label="Zákazka (náklad sa započíta do jej vyhodnotenia)"
            />
            <Field label="Poznámka">
              <textarea
                rows={3}
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
                className="input"
              />
            </Field>
          </section>

          <div className="flex justify-end gap-2">
            <Link
              to="/prijate-faktury"
              className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary"
            >
              Zrušiť
            </Link>
            <button
              disabled={busy}
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {upravujeme ? "Uložiť zmeny" : "Uložiť prijatú faktúru"}
            </button>
          </div>
        </form>

        <style>{`
          .input {
            height: 2.25rem; width: 100%;
            border-radius: 0.375rem;
            border: 1px solid hsl(var(--input));
            background: hsl(var(--background));
            padding: 0 0.75rem;
            font-size: 0.875rem;
          }
          textarea.input { height: auto; padding: 0.5rem 0.75rem; }
        `}</style>
      </PageBody>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
