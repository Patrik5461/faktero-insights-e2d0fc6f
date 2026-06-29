import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { CompanyNameAutocomplete } from "@/components/faktero/CompanyNameAutocomplete";
import { mergeCompanyAutofill } from "@/lib/faktero/company-autofill";
import { findCustomerByIcoFn } from "@/lib/faktero/company-lookup.functions";
import { useServerFn } from "@tanstack/react-start";

type Props = {
  defaultName?: string;
  onClose: () => void;
  onCreated: (customer: any) => void;
};

export function NewCustomerModal({ defaultName, onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState<null | { id: string; name: string; ico: string | null; email: string | null }>(null);
  const findDup = useServerFn(findCustomerByIcoFn);
  const [f, setF] = useState({
    name: defaultName ?? "",
    ico: "",
    dic: "",
    ic_dph: "",
    email: "",
    phone: "",
    street: "",
    city: "",
    zip: "",
    country: "SK",
  });

  useEffect(() => {
    const cid = getActiveCompanyId();
    const ico = f.ico.replace(/\s+/g, "");
    if (!cid || !/^\d{6,8}$/.test(ico)) { setDup(null); return; }
    const h = setTimeout(async () => {
      try {
        const r = await findDup({ data: { ico, companyId: cid } });
        if (r.match) setDup(r.match);
        else setDup(null);
      } catch { setDup(null); }
    }, 500);
    return () => clearTimeout(h);
  }, [f.ico]);

  async function save() {
    if (!f.name.trim()) return toast.error("Zadajte názov firmy");
    const cid = getActiveCompanyId();
    if (!cid) return toast.error("Nie je vybraná firma");
    if (dup) {
      toast.error(`Odberateľ s týmto IČO už existuje: ${dup.name}`);
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("customers")
      .insert({
        company_id: cid,
        name: f.name.trim(),
        ico: f.ico.trim() || null,
        dic: f.dic.trim() || null,
        ic_dph: f.ic_dph.trim() || null,
        email: f.email.trim() || null,
        phone: f.phone.trim() || null,
        street: f.street.trim() || null,
        city: f.city.trim() || null,
        zip: f.zip.trim() || null,
        country: f.country.trim() || "SK",
      })
      .select("id, name, ico, dic, ic_dph, street, city, zip, country, email")
      .single();
    setSaving(false);
    if (error || !data) return toast.error(error?.message ?? "Nepodarilo sa vytvoriť odberateľa");
    toast.success("Odberateľ bol vytvorený.");
    onCreated(data);
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Nový odberateľ</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {dup && (
            <div className="rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
              Odberateľ s týmto IČO už existuje: <strong>{dup.name}</strong>. Použite existujúceho odberateľa namiesto vytvárania duplikátu.
              <button
                type="button"
                onClick={() => onCreated(dup)}
                className="ml-2 underline hover:no-underline"
              >Použiť existujúceho</button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Názov firmy *">
              <CompanyNameAutocomplete
                autoFocus
                value={f.name}
                onChange={(v) => setF((p) => ({ ...p, name: v }))}
                onPick={(d, { auto }) => setF((p) => mergeCompanyAutofill(p, d, { mode: auto ? "fill-empty" : "overwrite" }))}
                className={input}
              />
            </Field>
            <Field label="IČO">
              <div className="flex gap-2">
                <input value={f.ico} onChange={(e) => setF({ ...f, ico: e.target.value })} className={input} />
                <IcoLookupButton
                  ico={f.ico}
                  onResult={(d, { auto }) => setF((prev) => mergeCompanyAutofill(prev, d, { mode: auto ? "fill-empty" : "overwrite" }))}
                />
              </div>
            </Field>
            <Field label="DIČ"><input value={f.dic} onChange={(e) => setF({ ...f, dic: e.target.value })} className={input} /></Field>
            <Field label="IČ DPH"><input value={f.ic_dph} onChange={(e) => setF({ ...f, ic_dph: e.target.value })} className={input} /></Field>
            <Field label="Email"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={input} /></Field>
            <Field label="Telefón"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={input} /></Field>
            <Field label="Ulica" className="sm:col-span-2"><input value={f.street} onChange={(e) => setF({ ...f, street: e.target.value })} className={input} /></Field>
            <Field label="Mesto"><input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} className={input} /></Field>
            <Field label="PSČ"><input value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })} className={input} /></Field>
            <Field label="Krajina"><input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} className={input} /></Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">Zrušiť</button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Vytvoriť odberateľa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}