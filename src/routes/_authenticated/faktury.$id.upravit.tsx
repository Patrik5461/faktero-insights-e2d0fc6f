import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PAYMENT_METHODS } from "@/lib/faktero/payment-method";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Trash2, Plus, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_VAT_RATE, vatRateOptions } from "@/lib/faktero/vat-rates";

export const Route = createFileRoute("/_authenticated/faktury/$id/upravit")({
  head: () => ({ meta: [{ title: "Upraviť faktúru — Faktero" }] }),
  component: EditInvoice,
});

type Item = {
  id?: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  stock_item_id?: string | null;
  _original_quantity?: number;
  _original_stock_item_id?: string | null;
  _original_name?: string;
  _locked?: boolean;
};

const EMPTY: Item = { name: "", quantity: 1, unit: "ks", unit_price: 0, vat_rate: DEFAULT_VAT_RATE };

function EditInvoice() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inv, setInv] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [originalLocked, setOriginalLocked] = useState<Array<{ id: string; stock_item_id: string; quantity: number; name: string }>>([]);
  const [form, setForm] = useState({
    issue_date: "",
    delivery_date: "",
    due_date: "",
    variable_symbol: "",
    currency: "EUR",
    payment_method: "bank_transfer",
    notes: "",
  });

  useEffect(() => {
    (async () => {
      const [{ data: i }, { data: its }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
      ]);
      if (!i) { toast.error("Faktúra nenájdená"); navigate({ to: "/faktury" }); return; }
      if (i.status === "paid" || i.status === "cancelled") {
        toast.error("Uhradenú alebo stornovanú faktúru nemožno upraviť.");
        navigate({ to: "/faktury/$id", params: { id } });
        return;
      }
      setInv(i);
      setForm({
        issue_date: i.issue_date ?? "",
        delivery_date: i.delivery_date ?? "",
        due_date: i.due_date ?? "",
        variable_symbol: i.variable_symbol ?? "",
        currency: i.currency ?? "EUR",
        payment_method: i.payment_method ?? "bank_transfer",
        notes: i.notes ?? "",
      });
      setItems(
        (its ?? []).map((r: any) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          quantity: Number(r.quantity),
          unit: r.unit ?? "ks",
          unit_price: Number(r.unit_price),
          vat_rate: Number(r.vat_rate),
          stock_item_id: r.stock_item_id ?? null,
          _original_quantity: Number(r.quantity),
          _original_stock_item_id: r.stock_item_id ?? null,
          _original_name: r.name,
          _locked: !!r.stock_item_id && (i.status as string) === "sent",
        })),
      );
      if ((i.status as string) === "sent") {
        setOriginalLocked(
          (its ?? [])
            .filter((r: any) => r.stock_item_id)
            .map((r: any) => ({ id: r.id, stock_item_id: r.stock_item_id, quantity: Number(r.quantity), name: r.name })),
        );
      }
      setLoading(false);
    })();
  }, [id]);

  const totals = useMemo(() => {
    let sub = 0, vat = 0;
    for (const it of items) {
      const s = Number(it.quantity) * Number(it.unit_price);
      sub += s;
      vat += s * (Number(it.vat_rate) / 100);
    }
    return { subtotal: sub, vat_total: vat, total: sub + vat };
  }, [items]);

  function setItem(idx: number, patch: Partial<Item>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!items.length || !items[0].name) return toast.error("Pridajte aspoň jednu položku");
    // Lock: stock-linked lines cannot be removed or modified after sent/paid
    if ((inv?.status as string) === "sent") {
      const violation = originalLocked.some((orig) => {
        const cur = items.find((it) => it.id === orig.id);
        if (!cur) return true; // removed
        return (
          Number(cur.quantity) !== orig.quantity ||
          (cur.stock_item_id ?? null) !== orig.stock_item_id ||
          cur.name !== orig.name
        );
      });
      if (violation) {
        toast.error("Položky ovplyvňujúce sklad nie je možné meniť po odoslaní faktúry.");
        return;
      }
    }
    setSaving(true);
    try {
      const { error: upErr } = await supabase
        .from("invoices")
        .update({
          issue_date: form.issue_date,
          delivery_date: form.delivery_date,
          due_date: form.due_date,
          variable_symbol: form.variable_symbol,
          currency: form.currency,
          payment_method: form.payment_method,
          notes: form.notes,
          subtotal: Number(totals.subtotal.toFixed(2)),
          vat_total: Number(totals.vat_total.toFixed(2)),
          total: Number(totals.total.toFixed(2)),
          pdf_url: null,
        })
        .eq("id", id);
      if (upErr) throw upErr;

      const { error: delErr } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
      if (delErr) throw delErr;

      const rows = items.map((it, idx) => {
        const s = Number(it.quantity) * Number(it.unit_price);
        const v = s * (Number(it.vat_rate) / 100);
        return {
          invoice_id: id,
          position: idx,
          name: it.name,
          description: it.description ?? null,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          vat_rate: it.vat_rate,
          stock_item_id: it.stock_item_id ?? null,
          subtotal: Number(s.toFixed(2)),
          vat_amount: Number(v.toFixed(2)),
          total: Number((s + v).toFixed(2)),
        };
      });
      const { error: insErr } = await supabase.from("invoice_items").insert(rows);
      if (insErr) throw insErr;

      toast.success("Faktúra upravená. PDF treba pregenerovať.");
      navigate({ to: "/faktury/$id", params: { id } });
    } catch (err: any) {
      toast.error(err?.message ?? "Chyba pri ukladaní");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !inv) return <PageBody>Načítavam…</PageBody>;

  return (
    <>
      <PageHeader
        title={`Upraviť faktúru ${inv.invoice_number}`}
        description="Po uložení sa PDF pregeneruje pri ďalšom otvorení."
        action={
          <Link to="/faktury/$id" params={{ id }} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">
            Späť
          </Link>
        }
      />
      <PageBody>
        <form onSubmit={submit} className="mx-auto max-w-5xl space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide">Základné údaje</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Lbl label="Dátum vystavenia">
                <input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} className={inputCls} />
              </Lbl>
              <Lbl label="Splatnosť">
                <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className={inputCls} />
              </Lbl>
              <Lbl label="Dátum dodania">
                <input type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} className={inputCls} />
              </Lbl>
              <Lbl label="Variabilný symbol">
                <input value={form.variable_symbol} onChange={(e) => setForm({ ...form, variable_symbol: e.target.value })} className={inputCls} />
              </Lbl>
              <Lbl label="Mena">
                <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputCls} />
              </Lbl>
              <Lbl label="Spôsob platby">
                <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className={inputCls}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </Lbl>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide">Položky</h3>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 font-medium">Názov</th>
                    <th className="py-2 pl-3 font-medium">Mn.</th>
                    <th className="py-2 pl-3 font-medium">MJ</th>
                    <th className="py-2 pl-3 font-medium text-right">Cena</th>
                    <th className="py-2 pl-3 font-medium">DPH</th>
                    <th className="py-2 pl-3 font-medium text-right">Spolu</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className={`border-b border-border/60 ${it._locked ? "bg-muted/30" : ""}`}>
                      <td className="py-2 pr-3">
                        <input value={it.name} disabled={it._locked} onChange={(e) => setItem(idx, { name: e.target.value })} placeholder="Názov položky"
                          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background" />
                      </td>
                      <td className="py-2 pl-3">
                        <input type="number" step="0.01" value={it.quantity} disabled={it._locked} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })}
                          className="w-16 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm tabular-nums hover:border-input focus:border-input focus:bg-background" />
                      </td>
                      <td className="py-2 pl-3">
                        <input value={it.unit} disabled={it._locked} onChange={(e) => setItem(idx, { unit: e.target.value })}
                          className="w-14 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background" />
                      </td>
                      <td className="py-2 pl-3">
                        <input type="number" step="0.01" value={it.unit_price} disabled={it._locked} onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) })}
                          className="w-24 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm tabular-nums text-right hover:border-input focus:border-input focus:bg-background" />
                      </td>
                      <td className="py-2 pl-3">
                        <select value={it.vat_rate} disabled={it._locked} onChange={(e) => setItem(idx, { vat_rate: Number(e.target.value) })}
                          className="rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-input focus:border-input focus:bg-background">
                          {vatRateOptions(it.vat_rate).map((r) => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums font-medium">
                        {(it.quantity * it.unit_price * (1 + it.vat_rate / 100)).toFixed(2)}
                      </td>
                      <td className="py-2 pl-2">
                        <button type="button" disabled={it._locked} title={it._locked ? "Položky ovplyvňujúce sklad nie je možné meniť po odoslaní faktúry." : ""}
                          onClick={() => !it._locked && setItems(items.filter((_, i) => i !== idx))}
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {items.map((it, idx) => (
                <div key={idx} className={`rounded-lg border border-border p-3 ${it._locked ? "bg-muted/30" : ""}`}>
                  <input value={it.name} disabled={it._locked} onChange={(e) => setItem(idx, { name: e.target.value })} placeholder="Názov položky"
                    className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                  <div className="grid grid-cols-4 gap-2">
                    <input type="number" step="0.01" value={it.quantity} disabled={it._locked} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                    <input value={it.unit} disabled={it._locked} onChange={(e) => setItem(idx, { unit: e.target.value })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                    <input type="number" step="0.01" value={it.unit_price} disabled={it._locked} onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                    <select value={it.vat_rate} disabled={it._locked} onChange={(e) => setItem(idx, { vat_rate: Number(e.target.value) })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                      {vatRateOptions(it.vat_rate).map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="font-medium tabular-nums">{(it.quantity * it.unit_price * (1 + it.vat_rate / 100)).toFixed(2)} {form.currency}</span>
                    <button type="button" disabled={it._locked} onClick={() => !it._locked && setItems(items.filter((_, i) => i !== idx))} className="text-destructive disabled:opacity-40">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {it._locked && <div className="mt-2 text-[11px] text-muted-foreground">🔒 Položka ovplyvňujúca sklad — nemožno meniť po odoslaní.</div>}
                </div>
              ))}
            </div>

            <button type="button" onClick={() => setItems([...items, { ...EMPTY }])}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground">
              <Plus className="h-3.5 w-3.5" /> Pridať položku
            </button>
          </section>

          <section className="rounded-2xl border border-border bg-gradient-to-br from-card to-primary/[0.03] p-5">
            <div className="ml-auto max-w-sm space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Bez DPH</span><span className="tabular-nums">{totals.subtotal.toFixed(2)} {form.currency}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">DPH</span><span className="tabular-nums">{totals.vat_total.toFixed(2)} {form.currency}</span></div>
              <div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
                <span>Spolu</span><span className="tabular-nums text-primary">{totals.total.toFixed(2)} {form.currency}</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">Poznámka</h3>
            <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </section>

          <div className="sticky bottom-4 z-10 flex flex-col-reverse gap-2 rounded-2xl border border-border bg-card/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-end">
            <Link to="/faktury/$id" params={{ id }} className="rounded-md border border-border bg-card px-4 py-2 text-center text-sm font-medium hover:bg-secondary">
              Zrušiť
            </Link>
            <button type="submit" disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Uložiť zmeny
            </button>
          </div>
        </form>
      </PageBody>
    </>
  );
}

const inputCls = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none";

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}