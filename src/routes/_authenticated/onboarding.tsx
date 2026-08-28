import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setActiveCompanyId } from "@/lib/faktero/active-company";
import { toast } from "sonner";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { CompanyNameAutocomplete } from "@/components/faktero/CompanyNameAutocomplete";
import { mergeCompanyAutofill } from "@/lib/faktero/company-autofill";
import { PLAN_PENDING_KEY } from "@/routes/registracia";

import { VyberKrajiny } from "@/components/faktero/VyberKrajiny";
import { MENY } from "@/lib/faktero/mena";
export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Nastavenie firmy — Faktero" }] }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    ico: "",
    dic: "",
    ic_dph: "",
    street: "",
    city: "",
    zip: "",
    country: "SK",
    email: "",
    phone: "",
    iban: "",
    default_currency: "EUR",
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
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
      const { data: userData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !userData.user) {
        throw new Error("Chýba prihlásenie. Prihláste sa znova.");
      }
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
        _iban: form.iban || undefined,
        _default_currency: form.default_currency || "EUR",
      });
      if (error || !companyId) {
        throw new Error(error?.message ?? "Nepodarilo sa vytvoriť firmu.");
      }
      setActiveCompanyId(companyId as string);
      toast.success("Firma vytvorená");
      // Keď používateľ prišiel z objednávky s vybraným plánom, dokončíme, čo začal —
      // firmu už má, takže platba má kam patriť.
      let pendingPlan: string | null = null;
      try {
        pendingPlan = sessionStorage.getItem(PLAN_PENDING_KEY);
        if (pendingPlan) sessionStorage.removeItem(PLAN_PENDING_KEY);
      } catch {
        // sessionStorage môže byť zakázané — pokračujeme na nástenku
      }
      // Hard reload so the authed layout re-reads memberships fresh.
      window.location.assign(
        pendingPlan ? `/predplatne?plan=${encodeURIComponent(pendingPlan)}` : "/dashboard",
      );
    } catch (err: any) {
      const msg = err?.message ?? "Nepodarilo sa vytvoriť firmu.";
      setErrorMsg(msg);
      toast.error(msg);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Vytvorte si firmu</h1>
      <p className="mt-2 text-muted-foreground">
        Tieto údaje sa zobrazia na faktúrach. Môžete ich kedykoľvek upraviť.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-8 space-y-5 rounded-xl border border-border bg-card p-6"
      >
        {errorMsg && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMsg}
          </div>
        )}
        <label className="block">
          <span className="text-sm font-medium">
            Názov firmy<span className="text-destructive"> *</span>
          </span>
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
                className="w-full rounded-l-md border border-input bg-background px-3 py-2 text-sm outline-none focus:z-10 focus:ring-2 focus:ring-ring"
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
        <Field label="Ulica" value={form.street} onChange={(v) => set("street", v)} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Mesto" value={form.city} onChange={(v) => set("city", v)} />
          <Field label="PSČ" value={form.zip} onChange={(v) => set("zip", v)} />
          <VyberKrajiny hodnota={form.country} onZmena={(v) => set("country", v)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} />
          <Field label="Telefón" value={form.phone} onChange={(v) => set("phone", v)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="IBAN" value={form.iban} onChange={(v) => set("iban", v)} />
          {/* Mena firmy sa dedí do dokladov — voľný text by sem pustil kód,
              ktorý nikto nekontroluje. */}
          <label className="block">
            <span className="text-sm font-medium">Mena</span>
            <select
              value={form.default_currency}
              onChange={(e) => set("default_currency", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {MENY.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.flag} {m.code} {m.symbol} — {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Vytváram..." : "Vytvoriť firmu a pokračovať"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
