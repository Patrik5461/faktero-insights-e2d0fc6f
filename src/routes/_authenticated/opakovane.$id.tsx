import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { useServerFn } from "@tanstack/react-start";
import { runRecurringNow, toggleRecurring } from "@/lib/faktero/recurring.functions";
import { Play, Save, Power, PowerOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/opakovane/$id")({
  head: () => ({ meta: [{ title: "Opakovaná faktúra — Faktero" }] }),
  component: RecurringDetail,
});

const FREQ_LABEL: Record<string, string> = {
  weekly: "Týždenne",
  monthly: "Mesačne",
  quarterly: "Štvrťročne",
  yearly: "Ročne",
};

type Item = {
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
};

function RecurringDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [rec, setRec] = useState<any>(null);
  // Bez tohto ostala na neexistujúcej šablóne navždy hláška „Načítavam…".
  const [nenajdene, setNenajdene] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const runFn = useServerFn(runRecurringNow);
  const toggleFn = useServerFn(toggleRecurring);

  async function load() {
    const { data } = await supabase
      .from("recurring_invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    setNenajdene(!data);
    setRec(data);
    setItems((data?.items as any[]) ?? []);
    const { data: lg } = await (supabase as any)
      .from("recurring_invoice_logs")
      .select("*")
      .eq("recurring_invoice_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    setLogs(lg ?? []);
  }
  useEffect(() => {
    load();
  }, [id]);

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

  async function save() {
    setBusy("save");
    try {
      const { error } = await supabase
        .from("recurring_invoices")
        .update({
          name: rec.name,
          frequency: rec.frequency,
          next_run: rec.next_run,
          currency: rec.currency,
          due_days: rec.due_days,
          notes: rec.notes,
          items: items as any,
          subtotal: totals.subtotal,
          vat_total: totals.vat_total,
          total: totals.total,
        })
        .eq("id", id);
      if (error) throw error;
      toast.success("Uložené");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBusy(null);
    }
  }

  async function runNow() {
    setBusy("run");
    try {
      const r: any = await runFn({ data: { id } });
      if (r?.skipped) toast.message(`Preskočené: ${r.reason}`);
      else {
        toast.success("Faktúra vytvorená");
        navigate({ to: "/faktury/$id", params: { id: r.invoice_id } });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBusy(null);
    }
  }

  async function toggle() {
    try {
      await toggleFn({ data: { id, active: !rec.active } });
      toast.success(!rec.active ? "Aktivované" : "Pozastavené");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }

  if (nenajdene)
    return (
      <PageBody>
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm">
          <p>Táto opakovaná faktúra v aktívnej firme neexistuje.</p>
          <p className="mt-1 text-muted-foreground">
            Ak patrí inej vašej firme, prepnite sa na ňu hore v lište.
          </p>
          <Link to="/opakovane" className="mt-4 inline-block text-primary underline">
            Späť na opakované faktúry
          </Link>
        </div>
      </PageBody>
    );
  if (!rec) return <PageBody>Načítavam…</PageBody>;

  return (
    <>
      <PageHeader
        title={rec.name}
        description={`${FREQ_LABEL[rec.frequency]} · Odberateľ: ${rec.customer_name ?? "—"} · Ďalší beh ${rec.next_run}`}
        action={
          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${rec.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
            >
              {rec.active ? "Aktívna" : "Pozastavená"}
            </span>
            <button
              onClick={runNow}
              disabled={!rec.active || busy === "run"}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> {busy === "run" ? "Spúšťam…" : "Spustiť teraz"}
            </button>
            <button
              onClick={toggle}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              {rec.active ? (
                <>
                  <PowerOff className="h-4 w-4" /> Pozastaviť
                </>
              ) : (
                <>
                  <Power className="h-4 w-4" /> Aktivovať
                </>
              )}
            </button>
            <button
              onClick={save}
              disabled={busy === "save"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {busy === "save" ? "Ukladám…" : "Uložiť"}
            </button>
            <Link
              to="/opakovane"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Späť
            </Link>
          </div>
        }
      />
      <PageBody>
        <div className="space-y-6">
          <div className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-3">
            <label className="block sm:col-span-3">
              <span className="text-sm font-medium">Názov</span>
              <input
                value={rec.name}
                onChange={(e) => setRec({ ...rec, name: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Frekvencia</span>
              <select
                value={rec.frequency}
                onChange={(e) => setRec({ ...rec, frequency: e.target.value })}
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
                value={rec.next_run}
                onChange={(e) => setRec({ ...rec, next_run: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Splatnosť (dni)</span>
              <input
                type="number"
                value={rec.due_days}
                onChange={(e) => setRec({ ...rec, due_days: Number(e.target.value) })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Mena</span>
              <input
                value={rec.currency}
                onChange={(e) => setRec({ ...rec, currency: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Položky</h3>
              <button
                type="button"
                onClick={() =>
                  setItems([
                    ...items,
                    { name: "", quantity: 1, unit: "ks", unit_price: 0, vat_rate: 23 },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                <Plus className="h-3.5 w-3.5" /> Pridať
              </button>
            </div>
            <div className="space-y-3">
              {items.length === 0 && (
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Žiadne položky.
                </div>
              )}
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
                    {rec.currency}
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
                  {totals.subtotal.toFixed(2)} {rec.currency}
                </span>
              </div>
              <div>
                DPH:{" "}
                <span className="font-medium">
                  {totals.vat_total.toFixed(2)} {rec.currency}
                </span>
              </div>
              <div className="text-lg font-semibold">
                Spolu: {totals.total.toFixed(2)} {rec.currency}
              </div>
            </div>
          </div>

          {rec.last_invoice_id && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-5 text-sm">
              <span>
                Posledná vygenerovaná faktúra:{" "}
                {rec.last_run_at ? new Date(rec.last_run_at).toLocaleString("sk-SK") : "—"}
              </span>
              <Link
                to="/faktury/$id"
                params={{ id: rec.last_invoice_id }}
                className="text-primary hover:underline"
              >
                Otvoriť →
              </Link>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 font-semibold">História behov</h3>
            {logs.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Zatiaľ žiadne behy.
              </div>
            ) : (
              <div className="divide-y divide-border text-sm">
                {logs.map((l) => (
                  <div key={l.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${l.status === "success" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}
                      >
                        {l.status === "success" ? "Úspech" : "Chyba"}
                      </span>
                      <span className="text-muted-foreground">
                        {l.run_type === "manual" ? "Manuálny" : "Automatický"}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(l.created_at).toLocaleString("sk-SK")}
                      </span>
                      {l.error_message && (
                        <span className="text-destructive">{l.error_message}</span>
                      )}
                    </div>
                    {l.invoice_id && (
                      <Link
                        to="/faktury/$id"
                        params={{ id: l.invoice_id }}
                        className="text-primary hover:underline"
                      >
                        Faktúra →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
