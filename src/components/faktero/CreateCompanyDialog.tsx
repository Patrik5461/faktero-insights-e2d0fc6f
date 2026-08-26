import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setActiveCompanyId } from "@/lib/faktero/active-company";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { CompanyNameAutocomplete } from "@/components/faktero/CompanyNameAutocomplete";
import { mergeCompanyAutofill } from "@/lib/faktero/company-autofill";

import { VyberKrajiny } from "@/components/faktero/VyberKrajiny";
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (companyId: string) => void;
};

const EMPTY = {
  name: "",
  ico: "",
  dic: "",
  ic_dph: "",
  email: "",
  phone: "",
  street: "",
  city: "",
  zip: "",
  country: "SK",
};

export function CreateCompanyDialog({ open, onOpenChange, onCreated }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function set<K extends keyof typeof EMPTY>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function reset() {
    setForm(EMPTY);
    setErrorMsg(null);
    setLoading(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErrorMsg(null);
    if (!form.name.trim()) {
      setErrorMsg("Zadajte názov firmy.");
      return;
    }
    setLoading(true);
    try {
      const { data: companyId, error } = await supabase.rpc("create_company_with_owner", {
        _name: form.name,
        _ico: form.ico || undefined,
        _dic: form.dic || undefined,
        _ic_dph: form.ic_dph || undefined,
        _street: form.street || undefined,
        _city: form.city || undefined,
        _zip: form.zip || undefined,
        _country: form.country || "SK",
        _email: form.email || undefined,
        _phone: form.phone || undefined,
        _default_currency: "EUR",
      });
      if (error || !companyId) {
        console.error("[create_company]", error);
        throw new Error(error?.message ?? "Nepodarilo sa vytvoriť firmu.");
      }
      const id = companyId as string;
      setActiveCompanyId(id);
      toast.success("Firma bola vytvorená.");
      onCreated?.(id);
      reset();
      onOpenChange(false);
      // Hard reload so all company-scoped data and context refresh.
      window.location.assign("/dashboard");
    } catch (err: any) {
      const msg = err?.message ?? "Nepodarilo sa vytvoriť firmu.";
      setErrorMsg(msg);
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!loading) {
          onOpenChange(o);
          if (!o) reset();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pridať firmu</DialogTitle>
          <DialogDescription>
            Vytvorte ďalšiu firmu, ku ktorej budete mať prístup ako vlastník.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {errorMsg && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errorMsg}
            </div>
          )}
          <label className="block">
            <span className="text-sm font-medium">Názov firmy *</span>
            <div className="mt-1">
              <CompanyNameAutocomplete
                value={form.name}
                onChange={(v) => set("name", v)}
                onPick={(d, { auto }) =>
                  setForm((f) =>
                    mergeCompanyAutofill(f, d, { mode: auto ? "fill-empty" : "overwrite" }),
                  )
                }
              />
            </div>
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium">IČO</span>
              <div className="mt-1 flex -space-x-px items-start">
                <input
                  value={form.ico}
                  onChange={(e) => set("ico", e.target.value)}
                  className="w-full rounded-l-md border border-input bg-background px-3 py-2 text-sm focus:z-10"
                />
                <IcoLookupButton
                  ico={form.ico}
                  onResult={(d, { auto }) =>
                    setForm((f) =>
                      mergeCompanyAutofill(f, d, { mode: auto ? "fill-empty" : "overwrite" }),
                    )
                  }
                />
              </div>
            </label>
            <Field label="DIČ" value={form.dic} onChange={(v) => set("dic", v)} />
            <Field label="IČ DPH" value={form.ic_dph} onChange={(v) => set("ic_dph", v)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" value={form.email} onChange={(v) => set("email", v)} />
            <Field label="Telefón" value={form.phone} onChange={(v) => set("phone", v)} />
          </div>
          <Field label="Ulica" value={form.street} onChange={(v) => set("street", v)} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Mesto" value={form.city} onChange={(v) => set("city", v)} />
            <Field label="PSČ" value={form.zip} onChange={(v) => set("zip", v)} />
            <VyberKrajiny hodnota={form.country} onZmena={(v) => set("country", v)} />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                if (!loading) {
                  onOpenChange(false);
                  reset();
                }
              }}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
            >
              Zrušiť
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Vytváram…" : "Vytvoriť firmu"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
