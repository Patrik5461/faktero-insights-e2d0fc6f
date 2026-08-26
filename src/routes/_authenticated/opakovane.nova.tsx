import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { NewCustomerModal } from "@/components/faktero/NewCustomerModal";

import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { zakladnaSadzba } from "@/lib/faktero/vat-rates";
export const Route = createFileRoute("/_authenticated/opakovane/nova")({
  head: () => ({ meta: [{ title: "Nová opakovaná faktúra — Faktero" }] }),
  component: NewRecurring,
});

type Item = {
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
};
const EMPTY: Item = { name: "", quantity: 1, unit: "ks", unit_price: 0, vat_rate: 23 };

function NewRecurring() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "",
    customer_id: "",
    frequency: "monthly" as "weekly" | "monthly" | "quarterly" | "yearly",
    next_run: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    currency: "EUR",
    due_days: 14,
    payment_method: "bank_transfer",
    notes: "",
    active: true,
  });
  /* Sadzby DPH podľa krajiny registrácie firmy. */
  const krajina = useKrajinaDane();
  const [items, setItems] = useState<Item[]>([{ ...EMPTY }]);
  useEffect(() => {
    const z = zakladnaSadzba(krajina);
    setItems((a) =>
      a.some((it) => !it.name && it.vat_rate !== z)
        ? a.map((it) => (it.name ? it : { ...it, vat_rate: z }))
        : a,
    );
  }, [krajina]);
  const [newCustOpen, setNewCustOpen] = useState(false);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("customers")
      .select("id, name, ico, dic, ic_dph, street, city, zip, country, email")
      .eq("company_id", cid)
      .then(({ data }) => setCustomers(data ?? []));
  }, []);

  const totals = useMemo(() => {
    let sub = 0,
      vat = 0;
    for (const it of items) {
      const s = Number(it.quantity) * Number(it.unit_price);
      sub += s;
      vat += s * (Number(it.vat_rate) / 100);
    }
    return {
      subtotal: +sub.toFixed(2),
      vat_total: +vat.toFixed(2),
      total: +(sub + vat).toFixed(2),
    };
  }, [items]);

  function setItem(i: number, patch: Partial<Item>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cid = getActiveCompanyId();
    if (!cid) return;
    if (!form.name.trim()) return toast.error("Zadajte názov šablóny");
    const cust = customers.find((c) => c.id === form.customer_id);
    if (!cust) return toast.error("Vyberte odberateľa");
    if (items.length === 0 || !items[0].name) return toast.error("Pridajte aspoň jednu položku");

    const { data, error } = await supabase
      .from("recurring_invoices")
      .insert({
        company_id: cid,
        name: form.name,
        customer_id: cust.id,
        customer_name: cust.name,
        customer_ico: cust.ico,
        customer_dic: cust.dic,
        customer_ic_dph: cust.ic_dph,
        customer_street: cust.street,
        customer_city: cust.city,
        customer_zip: cust.zip,
        customer_country: cust.country,
        customer_email: cust.email,
        frequency: form.frequency,
        next_run: form.next_run,
        currency: form.currency,
        due_days: form.due_days,
        payment_method: form.payment_method,
        notes: form.notes,
        active: form.active,
        items: items as any,
        subtotal: totals.subtotal,
        vat_total: totals.vat_total,
        total: totals.total,
      })
      .select()
      .single();
    if (error || !data) {
      const { friendlyError } = await import("@/lib/faktero/plan-error");
      return toast.error(friendlyError(error));
    }
    toast.success("Šablóna vytvorená");
    navigate({ to: "/opakovane/$id", params: { id: data.id } });
  }

  return (
    <>
      <PageHeader
        title="Nová opakovaná faktúra"
        description="Šablóna, podľa ktorej bude Faktero pravidelne vystavovať faktúry."
      />
      <PageBody>
        <form onSubmit={submit} className="space-y-6">
          <div className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-3">
            <label className="block sm:col-span-3">
              <span className="text-sm font-medium">Názov šablóny *</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="napr. Mesačný paušál ACME"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block sm:col-span-3">
              <span className="text-sm font-medium">Odberateľ *</span>
              <div className="mt-1 flex gap-2">
                <select
                  required
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Vyberte odberateľa…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setNewCustOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary"
                >
                  <UserPlus className="h-4 w-4" /> Nový
                </button>
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Frekvencia</span>
              <select
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value as any })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="weekly">Týždenne</option>
                <option value="monthly">Mesačne</option>
                <option value="quarterly">Štvrťročne</option>
                <option value="yearly">Ročne</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Ďalší beh</span>
              <input
                type="date"
                required
                value={form.next_run}
                onChange={(e) => setForm({ ...form, next_run: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Splatnosť (dni)</span>
              <input
                type="number"
                min={1}
                value={form.due_days}
                onChange={(e) => setForm({ ...form, due_days: Number(e.target.value) })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Mena</span>
              <input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 sm:col-span-3">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              <span className="text-sm">Aktívna</span>
            </label>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Položky</h3>
              <button
                type="button"
                onClick={() =>
                  setItems([...items, { ...EMPTY, vat_rate: zakladnaSadzba(krajina) }])
                }
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                <Plus className="h-3.5 w-3.5" /> Pridať
              </button>
            </div>
            <div className="space-y-3">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[2fr_80px_80px_100px_80px_120px_auto] sm:items-end"
                >
                  <In label="Názov" value={it.name} onChange={(v) => setItem(idx, { name: v })} />
                  <In
                    label="Mn."
                    type="number"
                    value={String(it.quantity)}
                    onChange={(v) => setItem(idx, { quantity: Number(v) })}
                  />
                  <In label="MJ" value={it.unit} onChange={(v) => setItem(idx, { unit: v })} />
                  <In
                    label="Cena"
                    type="number"
                    value={String(it.unit_price)}
                    onChange={(v) => setItem(idx, { unit_price: Number(v) })}
                  />
                  <In
                    label="DPH %"
                    type="number"
                    value={String(it.vat_rate)}
                    onChange={(v) => setItem(idx, { vat_rate: Number(v) })}
                  />
                  <div className="text-right text-sm font-medium">
                    {(it.quantity * it.unit_price * (1 + it.vat_rate / 100)).toFixed(2)}{" "}
                    {form.currency}
                  </div>
                  <button
                    type="button"
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1 text-right text-sm">
              <div>
                Bez DPH:{" "}
                <span className="font-medium">
                  {totals.subtotal.toFixed(2)} {form.currency}
                </span>
              </div>
              <div>
                DPH:{" "}
                <span className="font-medium">
                  {totals.vat_total.toFixed(2)} {form.currency}
                </span>
              </div>
              <div className="text-lg font-semibold">
                Spolu: {totals.total.toFixed(2)} {form.currency}
              </div>
            </div>
          </div>

          <label className="block rounded-xl border border-border bg-card p-5">
            <span className="text-sm font-medium">Poznámka</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Vytvoriť šablónu
            </button>
          </div>
        </form>
        {newCustOpen && (
          <NewCustomerModal
            onClose={() => setNewCustOpen(false)}
            onCreated={(c) => {
              setCustomers((prev) => [...prev, c]);
              setForm((prev) => ({ ...prev, customer_id: c.id }));
              setNewCustOpen(false);
            }}
          />
        )}
      </PageBody>
    </>
  );
}

function In({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
