import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { JobPicker } from "@/components/faktero/JobPicker";
import { poslednaCenaPaliva } from "@/lib/faktero/cena-paliva";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/jazdy/nova")({
  head: () => ({ meta: [{ title: "Nová jazda — Faktero" }] }),
  component: NewTripPage,
});

function NewTripPage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [form, setForm] = useState({
    vehicle_id: "",
    trip_date: new Date().toISOString().slice(0, 10),
    driver_name: "",
    start_location: "",
    end_location: "",
    purpose: "",
    start_odometer: "",
    end_odometer: "",
    fuel_price: "",
    job_id: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  // Doplnená cena sa smie prepísať ďalším vozidlom, ručne zadaná nikdy.
  const [cenaDoplnena, setCenaDoplnena] = useState(false);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("vehicles")
      .select("*")
      .eq("company_id", cid)
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        setVehicles(data ?? []);
        if (data?.[0]) setForm((p) => ({ ...p, vehicle_id: data[0].id }));
      });
  }, []);

  /**
   * Cena PHM z posledného tankovania. Bez nej ostane jazda bez nákladu a vo
   * vyhodnotení zákazky vyjde doprava nula, hoci sa jazdilo.
   */
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid || !form.vehicle_id) return;
    let zrusene = false;
    poslednaCenaPaliva(cid, form.vehicle_id).then((cena) => {
      if (zrusene || cena == null) return;
      setForm((p) => {
        if (p.fuel_price && !cenaDoplnena) return p;
        return { ...p, fuel_price: String(cena) };
      });
      setCenaDoplnena(true);
    });
    return () => {
      zrusene = true;
    };
    // `cenaDoplnena` sa zámerne nesleduje — inak by sa efekt spustil znova
    // hneď po tom, čo ho sám nastaví.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vehicle_id]);

  const vozidloBezSpotreby =
    !!form.vehicle_id && !vehicles.find((v) => v.id === form.vehicle_id)?.consumption_l_100km;

  const start = Number(form.start_odometer || 0);
  const end = Number(form.end_odometer || 0);
  const distance = end - start;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cid = getActiveCompanyId();
    if (!cid) return;
    if (!form.vehicle_id) return toast.error("Vyberte vozidlo");
    if (end < start) return toast.error("Stav tachometra na konci musí byť ≥ stavu na začiatku");
    setSaving(true);
    const vehicle = vehicles.find((v) => v.id === form.vehicle_id);
    const consumption = vehicle?.consumption_l_100km
      ? (distance * Number(vehicle.consumption_l_100km)) / 100
      : null;
    const { error } = await supabase.from("trips").insert({
      company_id: cid,
      vehicle_id: form.vehicle_id,
      trip_date: form.trip_date,
      driver_name: form.driver_name || null,
      start_location: form.start_location || null,
      end_location: form.end_location || null,
      purpose: form.purpose || null,
      start_odometer: start,
      end_odometer: end,
      distance_km: distance,
      fuel_price: form.fuel_price ? Number(form.fuel_price) : null,
      fuel_consumption: consumption,
      job_id: form.job_id || null,
      note: form.note || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Jazda uložená");
    navigate({ to: "/jazdy" });
  }

  return (
    <>
      <PageHeader title="Nová jazda" description="Pridajte záznam o služobnej ceste." />
      <PageBody>
        {vehicles.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm">
            Najskôr pridajte vozidlo v sekcii{" "}
            <a href="/jazdy/vozidla" className="text-primary hover:underline">
              Vozidlá
            </a>
            .
          </div>
        ) : (
          <form onSubmit={submit} className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <Field label="Dátum *">
              <input
                type="date"
                required
                value={form.trip_date}
                onChange={(e) => setForm({ ...form, trip_date: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Vozidlo *">
              <select
                required
                value={form.vehicle_id}
                onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
                className="input"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.license_plate ? `(${v.license_plate})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vodič">
              <input
                value={form.driver_name}
                onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Účel cesty">
              <input
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Odkiaľ">
              <input
                value={form.start_location}
                onChange={(e) => setForm({ ...form, start_location: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Kam">
              <input
                value={form.end_location}
                onChange={(e) => setForm({ ...form, end_location: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Tachometer začiatok (km) *">
              <input
                type="number"
                step="0.1"
                required
                value={form.start_odometer}
                onChange={(e) => setForm({ ...form, start_odometer: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Tachometer koniec (km) *">
              <input
                type="number"
                step="0.1"
                required
                value={form.end_odometer}
                onChange={(e) => setForm({ ...form, end_odometer: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Cena PHM (€/l)">
              <input
                type="number"
                step="0.001"
                value={form.fuel_price}
                onChange={(e) => {
                  setCenaDoplnena(false);
                  setForm({ ...form, fuel_price: e.target.value });
                }}
                className="input"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {cenaDoplnena
                  ? "Doplnené z posledného tankovania."
                  : "Bez ceny nemá jazda náklad a vo vyhodnotení zákazky vyjde doprava nula."}
              </span>
            </Field>
            {/* Spotreba vozidla je druhá polovica výpočtu. Bez nej sa do jazdy
                neuloží počet litrov a náklad vyjde nula aj s cenou paliva. */}
            <Field label="">
              {vozidloBezSpotreby && (
                <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
                  Vozidlo nemá zadanú spotrebu, takže jazda nebude mať náklad.{" "}
                  <a href="/jazdy/vozidla" className="underline">
                    Doplniť spotrebu
                  </a>
                </div>
              )}
            </Field>
            <Field label="Vzdialenosť (auto)">
              <div className="input bg-muted/40 tabular-nums">
                {Number.isFinite(distance) ? distance.toFixed(1) : "—"} km
              </div>
            </Field>
            <JobPicker
              className="sm:col-span-2"
              value={form.job_id}
              onChange={(v) => setForm((p) => ({ ...p, job_id: v }))}
            />
            <label className="sm:col-span-2 block">
              <span className="text-sm font-medium">Poznámka</span>
              <textarea
                rows={2}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="input mt-1"
              />
            </label>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => navigate({ to: "/jazdy" })}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
              >
                Zrušiť
              </button>
              <button
                disabled={saving}
                type="submit"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Ukladám…" : "Uložiť jazdu"}
              </button>
            </div>
          </form>
        )}
        <style>{`.input{display:block;width:100%;border-radius:0.375rem;border:1px solid hsl(var(--input));background:hsl(var(--background));padding:0.5rem 0.75rem;font-size:0.875rem}`}</style>
      </PageBody>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
