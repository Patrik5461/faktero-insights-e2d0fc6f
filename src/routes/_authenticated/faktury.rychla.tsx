import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { DEFAULT_VAT_RATE, SK_VAT_RATES } from "@/lib/faktero/vat-rates";

export const Route = createFileRoute("/_authenticated/faktury/rychla")({
  head: () => ({ meta: [{ title: "Rýchla faktúra — Faktero" }] }),
  component: QuickInvoicePage,
});

function QuickInvoicePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Služby");
  const [vatRate, setVatRate] = useState<number>(DEFAULT_VAT_RATE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase.from("customers").select("id,name").eq("company_id", cid).order("name").limit(100).then(({ data }) => {
      setCustomers(data ?? []);
    });
  }, []);

  async function save() {
    const cid = getActiveCompanyId();
    if (!cid) return toast.error("Vyberte firmu");
    if (!customerId) return toast.error("Vyberte odberateľa");
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Zadajte sumu");
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const unitPrice = amt / (1 + vatRate / 100);
    const customer = customers.find((c) => c.id === customerId);
    const { data: inv, error } = await supabase.from("invoices").insert({
      company_id: cid,
      customer_id: customerId,
      customer_name: customer?.name ?? "",
      type: "regular",
      status: "draft",
      issue_date: today,
      due_date: due,
      delivery_date: today,
      currency: "EUR",
      invoice_number: `RYCHLA-${Date.now().toString().slice(-6)}`,
      constant_symbol: "",
      payment_method: "bank_transfer",
    }).select().single();
    if (error || !inv) { setSaving(false); return toast.error(error?.message ?? "Chyba"); }
    await supabase.from("invoice_items").insert({
      invoice_id: inv.id,
      name: description,
      quantity: 1,
      unit: "ks",
      unit_price: Math.round(unitPrice * 100) / 100,
      vat_rate: vatRate,
    });
    setSaving(false);
    toast.success("Faktúra vytvorená");
    navigate({ to: "/faktury/$id", params: { id: inv.id } });
  }

  return (
    <>
      <PageHeader title="Rýchla faktúra" description={`Krok ${step} z 3`} />
      <PageBody>
        <div className="mx-auto max-w-md space-y-4">
          <div className="flex gap-1">
            {[1, 2, 3].map((n) => (
              <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <h2 className="font-medium">Odberateľ</h2>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">— vyberte —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button disabled={!customerId} onClick={() => setStep(2)} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Ďalej</button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <h2 className="font-medium">Suma a popis</h2>
              <label className="block text-sm">Suma (s DPH)
                <input type="number" inputMode="decimal" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base" autoFocus />
              </label>
              <label className="block text-sm">DPH
                <select value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {SK_VAT_RATES.map((r) => <option key={r} value={r}>{r} %</option>)}
                </select>
              </label>
              <label className="block text-sm">Popis
                <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </label>
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 rounded-md border border-border px-4 py-2 text-sm">Späť</button>
                <button disabled={!amount} onClick={() => setStep(3)} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Ďalej</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <h2 className="font-medium">Súhrn</h2>
              <div className="space-y-1 text-sm">
                <Row label="Odberateľ" value={customers.find((c) => c.id === customerId)?.name ?? ""} />
                <Row label="Popis" value={description} />
                <Row label="Suma" value={`${amount} € (vrátane ${vatRate}% DPH)`} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="flex-1 rounded-md border border-border px-4 py-2 text-sm">Späť</button>
                <button disabled={saving} onClick={save} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
                  {saving ? "Ukladám…" : "Vytvoriť faktúru"}
                </button>
              </div>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}
