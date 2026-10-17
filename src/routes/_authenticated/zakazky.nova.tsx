import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { createJob } from "@/lib/faktero/jobs.functions";
import { ArrowLeft } from "lucide-react";
import { formatujMenu } from "@/lib/faktero/mena";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/zakazky/nova")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Nová zákazka — Faktero") }],
  }),
  component: NewJob,
});

function NewJob() {
  const { t } = useT();
  const mena = useMenaFirmy();
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
      .eq("odberatel", true)
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
      setError(t("Zadajte názov zákazky."));
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError(t("Koniec zákazky nemôže byť skôr ako jej začiatok."));
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
      setError(err?.message ?? t("Zákazku sa nepodarilo uložiť"));
    } finally {
      setSaving(false);
    }
  }

  const pole =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const popis = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <>
      <PageHeader
        title={t("Nová zákazka")}
        description={t(
          "Číslo pridelí Faktero. Plán je nepovinný — slúži na porovnanie so skutočnosťou.",
        )}
      />
      <PageBody>
        <form onSubmit={ulozit} className="max-w-2xl space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-4">
            <label className={popis}>{t("Názov zákazky")}</label>
            <input
              className={pole}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("napr. Rekonštrukcia — Hlavná 12")}
              autoFocus
            />

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={popis}>{t("Odberateľ")}</label>
                <select
                  className={pole}
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">{t("— bez odberateľa —")}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={popis}>{t("Začiatok")}</label>
                <input
                  type="date"
                  className={pole}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className={popis}>{t("Predpokladaný koniec")}</label>
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
            <div className="mb-3 text-sm font-medium">{t("Plán zákazky")}</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={popis}>
                  {t("Plánované výnosy bez DPH ({mena})", { mena: mena.symbol })}
                </label>
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
                <label className={popis}>
                  {t("Plánované náklady bez DPH ({mena})", { mena: mena.symbol })}
                </label>
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
                {t("Plánovaný zisk:")}{" "}
                <span
                  className={`font-medium tabular-nums ${
                    planovanyZisk < 0 ? "text-destructive" : "text-emerald-600"
                  }`}
                >
                  {formatujMenu(planovanyZisk, mena.kod)}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <label className={popis}>{t("Poznámka")}</label>
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
            {saving ? t("Ukladám…") : t("Založiť zákazku")}
          </button>
        </form>
      </PageBody>
    </>
  );
}
