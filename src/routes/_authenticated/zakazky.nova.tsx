import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { createJob } from "@/lib/faktero/jobs.functions";
import { ArrowLeft } from "lucide-react";
import { formatovacMeny } from "@/lib/faktero/mena";

export const Route = createFileRoute("/_authenticated/zakazky/nova")({
  head: () => ({ meta: [{ title: "Nová zákazka — Faktero" }] }),
  component: NewJob,
});

function NewJob() {
  const nav = useNavigate();
  const doCreate = useServerFn(createJob);

  const [customers, setCustomers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [plannedRevenue, setPlannedRevenue] = useState("");
  const [plannedCost, setPlannedCost] = useState("");
  const [note, setNote] = useState("");

  const cid = useMemo(() => getActiveCompanyId(), []);

  useEffect(() => {
    if (!cid) return;
    supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => setCustomers(data ?? []));
  }, [cid]);

  const planovanyZisk = useMemo(() => {
    if (!plannedRevenue || !plannedCost) return null;
    return Number(plannedRevenue) - Number(plannedCost);
  }, [plannedRevenue, plannedCost]);

  async function ulozit(e: React.FormEvent) {
    e.preventDefault();
    if (!cid) return;
    if (!name.trim()) {
      setError("Zadajte názov zákazky.");
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError("Koniec zákazky nemôže byť skôr ako jej začiatok.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r: any = await doCreate({
        data: {
          company_id: cid,
          name: name.trim(),
          customer_id: customerId || null,
          start_date: startDate || null,
          end_date: endDate || null,
          planned_revenue: plannedRevenue === "" ? null : Number(plannedRevenue),
          planned_cost: plannedCost === "" ? null : Number(plannedCost),
          note: note.trim() || null,
        },
      });
      nav({ to: "/zakazky/$id", params: { id: r.id } });
    } catch (err: any) {
      setError(err?.message ?? "Zákazku sa nepodarilo uložiť");
    } finally {
      setSaving(false);
    }
  }

  const pole = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  const popis = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <>
      <PageHeader
        title="Nová zákazka"
        description="Číslo pridelí Faktero. Plán je nepovinný — slúži na porovnanie so skutočnosťou."
        action={
          <Link
            to="/zakazky"
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        <form onSubmit={ulozit} className="max-w-2xl space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-4">
            <label className={popis}>Názov zákazky</label>
            <input
              className={pole}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Napríklad Rekonštrukcia rozvodov — Hlavná 12"
              autoFocus
            />

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={popis}>Odberateľ</label>
                <select
                  className={pole}
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">— bez odberateľa —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div />
              <div>
                <label className={popis}>Začiatok</label>
                <input
                  type="date"
                  className={pole}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className={popis}>Predpokladaný koniec</label>
                <input
                  type="date"
                  className={pole}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-medium">Plán zákazky</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={popis}>Plánované výnosy bez DPH (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={pole}
                  value={plannedRevenue}
                  onChange={(e) => setPlannedRevenue(e.target.value)}
                />
              </div>
              <div>
                <label className={popis}>Plánované náklady bez DPH (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={pole}
                  value={plannedCost}
                  onChange={(e) => setPlannedCost(e.target.value)}
                />
              </div>
            </div>
            {planovanyZisk != null && (
              <div className="mt-3 text-sm text-muted-foreground">
                Plánovaný zisk:{" "}
                <span
                  className={`font-medium tabular-nums ${
                    planovanyZisk < 0 ? "text-destructive" : "text-emerald-600"
                  }`}
                >
                  {formatovacMeny("EUR", "sk-SK")(planovanyZisk)}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <label className={popis}>Poznámka</label>
            <textarea
              className={`${pole} min-h-24`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Ukladám…" : "Založiť zákazku"}
          </button>
        </form>
      </PageBody>
    </>
  );
}
