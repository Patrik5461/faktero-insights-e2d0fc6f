import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Trash2, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { createReservationsFromQuote } from "@/lib/faktero/reservations.functions";
import { nextQuoteNumberFn } from "@/lib/faktero/quote.functions";
import { NewCustomerModal } from "@/components/faktero/NewCustomerModal";
import { JobPicker } from "@/components/faktero/JobPicker";

export const Route = createFileRoute("/_authenticated/ponuky/nova")({
  head: () => ({ meta: [{ title: "Nová cenová ponuka — Faktero" }] }),
  component: NewQuote,
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

function NewQuote() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState({
    customer_id: "",
    issue_date: new Date().toISOString().slice(0, 10),
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    currency: "EUR",
    notes: "",
    job_id: "",
  });
  const [items, setItems] = useState<Item[]>([{ ...EMPTY }]);
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [reserveStock, setReserveStock] = useState(false);
  const reserveFn = useServerFn(createReservationsFromQuote);
  const dalsieCislo = useServerFn(nextQuoteNumberFn);

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
    return { subtotal: sub, vat_total: vat, total: sub + vat };
  }, [items]);

  function setItem(i: number, patch: Partial<Item>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cid = getActiveCompanyId();
    if (!cid) return;
    const cust = customers.find((c) => c.id === form.customer_id);
    if (!cust) return toast.error("Vyberte odberateľa");
    const { quote_number } = await dalsieCislo({ data: { company_id: cid } });
    const { data: q, error } = await supabase
      .from("quotes")
      .insert({
        company_id: cid,
        customer_id: cust.id,
        status: "draft",
        quote_number,
        issue_date: form.issue_date,
        valid_until: form.valid_until,
        currency: form.currency,
        customer_name: cust.name,
        customer_ico: cust.ico,
        customer_dic: cust.dic,
        customer_ic_dph: cust.ic_dph,
        customer_street: cust.street,
        customer_city: cust.city,
        customer_zip: cust.zip,
        customer_country: cust.country,
        customer_email: cust.email,
        subtotal: Number(totals.subtotal.toFixed(2)),
        vat_total: Number(totals.vat_total.toFixed(2)),
        total: Number(totals.total.toFixed(2)),
        reserve_stock: reserveStock,
        notes: form.notes,
        job_id: form.job_id || null,
      })
      .select()
      .single();
    if (error || !q) {
      const { friendlyError } = await import("@/lib/faktero/plan-error");
      return toast.error(friendlyError(error));
    }

    const rows = items.map((it, i) => {
      const s = Number(it.quantity) * Number(it.unit_price);
      const v = s * (Number(it.vat_rate) / 100);
      return {
        quote_id: q.id,
        position: i,
        name: it.name,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        vat_rate: it.vat_rate,
        subtotal: +s.toFixed(2),
        vat_amount: +v.toFixed(2),
        total: +(s + v).toFixed(2),
      };
    });
    const { error: e2 } = await supabase.from("quote_items").insert(rows);
    if (e2) return toast.error(e2.message);
    if (reserveStock) {
      try {
        const r = await reserveFn({ data: { company_id: cid, quote_id: q.id } });
        if ((r as any).created > 0) toast.success(`Rezervovaných ${(r as any).created} položiek.`);
        else if ((r as any).reason === "no_warehouse")
          toast.warning("Chýba aktívny sklad — rezervácie neboli vytvorené.");
        else toast.info("Rezervácia: žiadne položky nebolo možné napárovať na sklad.");
      } catch (err: any) {
        toast.error(`Rezervácia zlyhala: ${err?.message ?? err}`);
      }
    }
    toast.success("Ponuka vytvorená");
    navigate({ to: "/ponuky/$id", params: { id: q.id } });
  }

  return (
    <>
      <PageHeader title="Nová cenová ponuka" description="Vyplňte údaje a pridajte položky." />
      <PageBody>
        <form onSubmit={submit} className="space-y-6">
          <div className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-3">
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
            <In
              label="Dátum vystavenia"
              type="date"
              required
              value={form.issue_date}
              onChange={(v) => setForm({ ...form, issue_date: v })}
            />
            <In
              label="Platnosť do"
              type="date"
              required
              value={form.valid_until}
              onChange={(v) => setForm({ ...form, valid_until: v })}
            />
            <In
              label="Mena"
              value={form.currency}
              onChange={(v) => setForm({ ...form, currency: v })}
            />
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Položky</h3>
              <button
                type="button"
                onClick={() => setItems([...items, { ...EMPTY }])}
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
          <JobPicker
            className="rounded-xl border border-border bg-card p-5"
            value={form.job_id}
            onChange={(v) => setForm((f) => ({ ...f, job_id: v }))}
            customerId={form.customer_id || null}
            label="Zákazka (prenesie sa na faktúru pri premene ponuky)"
          />
          <label className="block rounded-xl border border-border bg-card p-5">
            <span className="text-sm font-medium">Poznámka</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
            <input
              type="checkbox"
              checked={reserveStock}
              onChange={(e) => setReserveStock(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm">
              <div className="font-medium">Rezervovať tovar na sklade</div>
              <div className="text-xs text-muted-foreground">
                Vytvorí aktívne rezervácie pre napárované položky. Platnosť sa nastaví podľa dátumu
                „Platnosť do“.
              </div>
            </span>
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Vytvoriť ponuku
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
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
