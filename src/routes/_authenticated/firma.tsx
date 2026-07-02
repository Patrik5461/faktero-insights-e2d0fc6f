import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { CompanyNameAutocomplete } from "@/components/faktero/CompanyNameAutocomplete";
import { mergeCompanyAutofill } from "@/lib/faktero/company-autofill";

export const Route = createFileRoute("/_authenticated/firma")({
  head: () => ({ meta: [{ title: "Firma — Faktero" }] }),
  component: CompanyPage,
});

function CompanyPage() {
  const [c, setC] = useState<any>(null);
  useEffect(() => {
    const id = getActiveCompanyId();
    if (!id) return;
    supabase.from("companies").select("*").eq("id", id).single().then(({ data }) => setC(data));
  }, []);
  if (!c) return <PageBody>Načítavam…</PageBody>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { id, created_at, updated_at, created_by, ...patch } = c;
    const { error } = await supabase.from("companies").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Uložené");
  }

  const f = (k: string) => (v: string) => setC({ ...c, [k]: v });
  return (
    <>
      <PageHeader title="Firma" description="Údaje, ktoré sa zobrazia na faktúrach." />
      <PageBody>
        <form onSubmit={save} className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Názov *</span>
            <div className="mt-1">
              <CompanyNameAutocomplete
                value={c.name ?? ""}
                onChange={f("name")}
                onPick={(d, { auto }) => setC((prev: any) => mergeCompanyAutofill(prev ?? {}, d, { mode: auto ? "fill-empty" : "overwrite" }))}
              />
            </div>
          </label>
          <label className="block">
            <span className="text-sm font-medium">IČO</span>
            <div className="mt-1 flex gap-2">
              <input value={c.ico ?? ""} onChange={(e) => f("ico")(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <IcoLookupButton
                ico={c.ico ?? ""}
                onResult={(d, { auto }) => setC((prev: any) => mergeCompanyAutofill(prev ?? {}, d, { mode: auto ? "fill-empty" : "overwrite" }))}
              />
            </div>
          </label>
          <In label="DIČ" value={c.dic ?? ""} onChange={f("dic")} />
          <In label="IČ DPH" value={c.ic_dph ?? ""} onChange={f("ic_dph")} />
          <In label="Email" value={c.email ?? ""} onChange={f("email")} />
          <In full label="Ulica" value={c.street ?? ""} onChange={f("street")} />
          <In label="Mesto" value={c.city ?? ""} onChange={f("city")} />
          <In label="PSČ" value={c.zip ?? ""} onChange={f("zip")} />
          <In label="Krajina" value={c.country ?? ""} onChange={f("country")} />
          <In label="Telefón" value={c.phone ?? ""} onChange={f("phone")} />
          <In label="Web" value={c.website ?? ""} onChange={f("website")} />
          <In label="IBAN" value={c.iban ?? ""} onChange={f("iban")} />
          <In label="SWIFT/BIC" value={c.swift ?? ""} onChange={f("swift")} />
          <In label="Mena" value={c.default_currency ?? "EUR"} onChange={f("default_currency")} />
          <In label="Formát čísla faktúry" value={c.invoice_number_format ?? ""} onChange={f("invoice_number_format")} />
          <label className="block">
            <span className="text-sm font-medium">Preferovaný účtovný systém</span>
            <select
              value={c.preferred_accounting_system ?? "pohoda"}
              onChange={(e) => setC({ ...c, preferred_accounting_system: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="pohoda">Pohoda</option>
              <option value="omega">Omega</option>
              <option value="money">Money</option>
              <option value="alfa_plus">Alfa Plus</option>
              <option value="other">Iný</option>
            </select>
          </label>
          <label className="sm:col-span-2 block">
            <span className="text-sm font-medium">Pätička faktúry</span>
            <textarea rows={3} value={c.invoice_footer ?? ""} onChange={(e) => setC({ ...c, invoice_footer: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <div className="sm:col-span-2 mt-2 border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">E-mail</h3>
          </div>
          <In label="Meno odosielateľa" value={c.email_sender_name ?? ""} onChange={f("email_sender_name")} />
          <In label="Odpovedať na (Reply-To)" value={c.email_reply_to ?? ""} onChange={f("email_reply_to")} />
          <In full label="Predvolený predmet e-mailu" value={c.email_default_subject ?? ""} onChange={f("email_default_subject")} />
          <label className="sm:col-span-2 block">
            <span className="text-sm font-medium">Predvolená správa e-mailu</span>
            <textarea rows={5} value={c.email_default_message ?? ""} onChange={(e) => setC({ ...c, email_default_message: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <span className="mt-1 block text-xs text-muted-foreground">Premenné: {"{invoice_number}"}, {"{due_date}"}, {"{total}"}, {"{company_name}"}</span>
          </label>

          <div className="sm:col-span-2 mt-2 border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Automatické upomienky po splatnosti</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.reminders_enabled ?? true}
                onChange={(e) => setC({ ...c, reminders_enabled: e.target.checked })}
              />
              Zapnúť automatické upomienky
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium">Dní po splatnosti — 1. upomienka</span>
            <input type="number" min={1} value={c.reminder_days_1 ?? 3}
              onChange={(e) => setC({ ...c, reminder_days_1: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Dní po splatnosti — 2. upomienka</span>
            <input type="number" min={1} value={c.reminder_days_2 ?? 7}
              onChange={(e) => setC({ ...c, reminder_days_2: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Dní po splatnosti — 3. upomienka</span>
            <input type="number" min={1} value={c.reminder_days_3 ?? 14}
              onChange={(e) => setC({ ...c, reminder_days_3: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </label>
          {[1, 2, 3].map((n) => (
            <div key={n} className="sm:col-span-2 grid gap-2 rounded-md border border-border p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{n}. upomienka — e-mail</div>
              <input
                placeholder={`Predmet (napr. Upomienka: Faktúra {invoice_number})`}
                value={c[`reminder_subject_${n}`] ?? ""}
                onChange={(e) => setC({ ...c, [`reminder_subject_${n}`]: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <textarea
                rows={4}
                placeholder="Text upomienky (premenné: {invoice_number}, {due_date}, {total}, {company_name}, {iban}, {variable_symbol})"
                value={c[`reminder_message_${n}`] ?? ""}
                onChange={(e) => setC({ ...c, [`reminder_message_${n}`]: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          ))}

          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Uložiť zmeny</button>
          </div>

        </form>
      </PageBody>
    </>
  );
}

function In({ label, value, onChange, full }: { label: string; value: string; onChange: (v: string) => void; full?: boolean }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
    </label>
  );
}