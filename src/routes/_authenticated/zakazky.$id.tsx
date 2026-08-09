import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { deleteJob, getJob, setJobStatus, updateJob } from "@/lib/faktero/jobs.functions";
import { STAV_ZAKAZKY_POPIS, nakladZJazdy, type StavZakazky } from "@/lib/faktero/zakazky";
import { ArrowLeft, Lock, Unlock, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/zakazky/$id")({
  head: () => ({ meta: [{ title: "Zákazka — Faktero" }] }),
  component: JobDetail,
});

function suma(n: number) {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(n || 0);
}

function Karta({
  titulok,
  hodnota,
  farba,
  poznamka,
}: {
  titulok: string;
  hodnota: string;
  farba?: string;
  poznamka?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{titulok}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${farba ?? ""}`}>{hodnota}</div>
      {poznamka && <div className="mt-1 text-xs text-muted-foreground">{poznamka}</div>}
    </div>
  );
}

/** Prúžok čerpania. Nad 100 % sa zafarbí načerveno, ale neprelezie rámik. */
function Prucok({ percento, obratene }: { percento: number; obratene?: boolean }) {
  const zle = obratene ? percento > 100 : percento < 100;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${zle ? "bg-destructive" : "bg-emerald-500"}`}
        style={{ width: `${Math.min(100, Math.max(0, percento))}%` }}
      />
    </div>
  );
}

function JobDetail() {
  const { id } = useParams({ from: "/_authenticated/zakazky/$id" });
  const nav = useNavigate();
  const fetchJob = useServerFn(getJob);
  const doStatus = useServerFn(setJobStatus);
  const doUpdate = useServerFn(updateJob);
  const doDelete = useServerFn(deleteJob);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [upravujem, setUpravujem] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState<any>(null);

  const cid = useMemo(() => getActiveCompanyId(), []);

  const nacitaj = useCallback(() => {
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchJob({ data: { company_id: cid, id } })
      .then((d: any) => {
        setData(d);
        setError(null);
      })
      .catch((e: any) => setError(e?.message ?? "Zákazku sa nepodarilo načítať"))
      .finally(() => setLoading(false));
  }, [cid, fetchJob, id]);

  useEffect(nacitaj, [nacitaj]);

  useEffect(() => {
    if (!cid || !upravujem || customers.length) return;
    supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .order("name")
      .then(({ data: d }) => setCustomers(d ?? []));
  }, [cid, upravujem, customers.length]);

  function zacniUpravu() {
    const j = data.job;
    setForm({
      name: j.name ?? "",
      customer_id: j.customer_id ?? "",
      start_date: j.start_date ?? "",
      end_date: j.end_date ?? "",
      planned_revenue: j.planned_revenue ?? "",
      planned_cost: j.planned_cost ?? "",
      note: j.note ?? "",
    });
    setUpravujem(true);
  }

  async function akcia(fn: () => Promise<any>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      nacitaj();
    } catch (e: any) {
      setError(e?.message ?? "Operácia zlyhala");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">Načítavam…</div>
      </PageBody>
    );
  }
  if (!data) {
    return (
      <PageBody>
        <div className="text-sm text-destructive">{error ?? "Zákazka nenájdená."}</div>
      </PageBody>
    );
  }

  const j = data.job;
  const v = data.vyhodnotenie;
  const otvorena = j.status === "active";
  const pole = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  const popis = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <>
      <PageHeader
        title={`${j.job_number} — ${j.name}`}
        description={[
          j.customer_name,
          j.start_date && `od ${j.start_date}`,
          j.end_date && `do ${j.end_date}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/zakazky"
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" /> Späť
            </Link>
            {otvorena && (
              <>
                <button
                  type="button"
                  onClick={zacniUpravu}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                >
                  <Pencil className="h-4 w-4" /> Upraviť
                </button>
                <button
                  type="button"
                  onClick={() =>
                    akcia(() => doStatus({ data: { company_id: cid!, id, status: "closed" } }))
                  }
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Lock className="h-4 w-4" /> Uzavrieť
                </button>
              </>
            )}
            {!otvorena && (
              <button
                type="button"
                onClick={() =>
                  akcia(() => doStatus({ data: { company_id: cid!, id, status: "active" } }))
                }
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                <Unlock className="h-4 w-4" /> Znovu otvoriť
              </button>
            )}
          </div>
        }
      />
      <PageBody>
        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!otvorena && (
          <div className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Zákazka je {STAV_ZAKAZKY_POPIS[j.status as StavZakazky]?.toLowerCase()}. Nový doklad sa
            k nej priradiť nedá — vyhodnotenie sa už nezmení.
          </div>
        )}

        {upravujem && (
          <form
            className="mb-6 space-y-4 rounded-xl border border-border bg-card p-4"
            onSubmit={(e) => {
              e.preventDefault();
              akcia(async () => {
                await doUpdate({
                  data: {
                    company_id: cid!,
                    id,
                    name: form.name.trim(),
                    customer_id: form.customer_id || null,
                    start_date: form.start_date || null,
                    end_date: form.end_date || null,
                    planned_revenue:
                      form.planned_revenue === "" ? null : Number(form.planned_revenue),
                    planned_cost: form.planned_cost === "" ? null : Number(form.planned_cost),
                    note: form.note.trim() || null,
                  },
                });
                setUpravujem(false);
              });
            }}
          >
            <div>
              <label className={popis}>Názov</label>
              <input
                className={pole}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={popis}>Odberateľ</label>
                <select
                  className={pole}
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
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
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className={popis}>Koniec</label>
                <input
                  type="date"
                  className={pole}
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
              <div>
                <label className={popis}>Plánované výnosy (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={pole}
                  value={form.planned_revenue}
                  onChange={(e) => setForm({ ...form, planned_revenue: e.target.value })}
                />
              </div>
              <div>
                <label className={popis}>Plánované náklady (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={pole}
                  value={form.planned_cost}
                  onChange={(e) => setForm({ ...form, planned_cost: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className={popis}>Poznámka</label>
              <textarea
                className={`${pole} min-h-20`}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Uložiť
              </button>
              <button
                type="button"
                onClick={() => setUpravujem(false)}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                Zrušiť
              </button>
            </div>
          </form>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Karta titulok="Výnosy" hodnota={suma(v.vynosy)} />
          <Karta titulok="Náklady" hodnota={suma(v.naklady)} />
          <Karta
            titulok="Zisk"
            hodnota={suma(v.zisk)}
            farba={v.zisk < 0 ? "text-destructive" : "text-emerald-600"}
          />
          <Karta
            titulok="Marža"
            hodnota={v.marza == null ? "—" : `${v.marza} %`}
            poznamka={v.marza == null ? "Zatiaľ bez výnosov" : undefined}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Karta
            titulok="Materiál zo skladu"
            hodnota={suma(v.naklad_material)}
            poznamka="Vo váženej nákupnej cene"
          />
          <Karta titulok="Prijaté faktúry" hodnota={suma(v.naklad_sluzby)} poznamka="Bez DPH" />
          <Karta
            titulok="Doprava"
            hodnota={suma(v.naklad_doprava)}
            poznamka="Z jázd priradených zákazke"
          />
        </div>

        {(v.planovany_vynos != null || v.planovany_naklad != null) && (
          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-medium">Plán a skutočnosť</div>
            <div className="grid gap-4 sm:grid-cols-2">
              {v.planovany_vynos != null && (
                <div>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted-foreground">Výnosy</span>
                    <span className="tabular-nums">
                      {suma(v.vynosy)} z {suma(v.planovany_vynos)}
                      {v.plnenie_vynosu != null && ` (${v.plnenie_vynosu} %)`}
                    </span>
                  </div>
                  <Prucok percento={v.plnenie_vynosu ?? 0} />
                </div>
              )}
              {v.planovany_naklad != null && (
                <div>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted-foreground">Náklady</span>
                    <span className="tabular-nums">
                      {suma(v.naklady)} z {suma(v.planovany_naklad)}
                      {v.cerpanie_nakladu != null && ` (${v.cerpanie_nakladu} %)`}
                    </span>
                  </div>
                  <Prucok percento={v.cerpanie_nakladu ?? 0} obratene />
                </div>
              )}
            </div>
            {v.planovany_zisk != null && (
              <div className="mt-3 text-sm text-muted-foreground">
                Plánovaný zisk {suma(v.planovany_zisk)}, skutočný{" "}
                <span className={v.zisk < 0 ? "text-destructive" : "text-emerald-600"}>
                  {suma(v.zisk)}
                </span>
                .
              </div>
            )}
          </div>
        )}

        {j.note && (
          <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Poznámka
            </div>
            <div className="whitespace-pre-wrap">{j.note}</div>
          </div>
        )}

        <Zoznam
          titulok="Vydané faktúry"
          prazdne="K zákazke zatiaľ nie je priradená žiadna faktúra."
          hlavicka={["Číslo", "Dátum", "Typ", "Bez DPH"]}
          riadky={data.faktury.map((f: any) => [
            <Link
              key={f.id}
              to="/faktury/$id"
              params={{ id: f.id }}
              className="text-primary hover:underline"
            >
              {f.invoice_number}
            </Link>,
            f.issue_date,
            f.type === "credit_note" ? "Dobropis" : f.type === "proforma" ? "Zálohová" : "Faktúra",
            suma(Number(f.subtotal)),
          ])}
        />

        <Zoznam
          titulok="Prijaté faktúry"
          prazdne="Žiadny nákup priradený k zákazke."
          hlavicka={["Číslo", "Dodávateľ", "Dátum", "Bez DPH"]}
          riadky={data.prijate_faktury.map((f: any) => [
            f.invoice_number,
            f.supplier_name,
            f.issue_date,
            suma(Number(f.amount_without_vat)),
          ])}
        />

        <Zoznam
          titulok="Materiál zo skladu"
          prazdne="Zo skladu sa na zákazku zatiaľ nič nevydalo."
          hlavicka={["Položka", "Pohyb", "Množstvo", "Vážená cena", "Hodnota"]}
          riadky={data.pohyby.map((p: any) => [
            p.nazov,
            p.type,
            Number(p.quantity),
            p.unit_cost == null ? "—" : suma(Number(p.unit_cost)),
            suma(Number(p.unit_cost ?? 0) * Number(p.quantity)),
          ])}
        />

        <Zoznam
          titulok="Jazdy"
          prazdne="K zákazke nie je priradená žiadna jazda."
          hlavicka={["Dátum", "Trasa", "Km", "Náklad"]}
          riadky={data.jazdy.map((t: any) => [
            t.trip_date,
            [t.start_location, t.end_location].filter(Boolean).join(" → ") || (t.purpose ?? "—"),
            Number(t.distance_km),
            suma(nakladZJazdy(t)),
          ])}
        />

        {otvorena && (
          <div className="mt-8 border-t border-border pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!confirm(`Naozaj zmazať zákazku ${j.job_number}?`)) return;
                akcia(async () => {
                  await doDelete({ data: { company_id: cid!, id } });
                  nav({ to: "/zakazky" });
                });
              }}
              className="inline-flex items-center gap-1 text-sm text-destructive hover:underline disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Zmazať zákazku
            </button>
            <p className="mt-1 text-xs text-muted-foreground">
              Zmazať sa dá len zákazka bez dokladov. Rozbehnutú zákazku uzavrite.
            </p>
          </div>
        )}
      </PageBody>
    </>
  );
}

function Zoznam({
  titulok,
  prazdne,
  hlavicka,
  riadky,
}: {
  titulok: string;
  prazdne: string;
  hlavicka: string[];
  riadky: React.ReactNode[][];
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 text-sm font-medium">
        {titulok} <span className="text-muted-foreground">({riadky.length})</span>
      </div>
      {riadky.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {prazdne}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {hlavicka.map((h, i) => (
                  <th key={h} className={`p-3 ${i >= hlavicka.length - 2 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {riadky.map((r, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  {r.map((c, k) => (
                    <td
                      key={k}
                      className={`p-3 ${k >= hlavicka.length - 2 ? "text-right tabular-nums" : ""}`}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
