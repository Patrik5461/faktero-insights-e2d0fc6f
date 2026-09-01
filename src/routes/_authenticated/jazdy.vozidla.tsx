import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Plus, Pencil, Power, Fuel, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";

export const Route = createFileRoute("/_authenticated/jazdy/vozidla")({
  head: () => ({ meta: [{ title: "Vozidlá — Faktero" }] }),
  component: VehiclesPage,
});

type Vehicle = {
  id?: string;
  name: string;
  license_plate?: string | null;
  vehicle_type?: string | null;
  fuel_type?: string | null;
  consumption_l_100km?: number | null;
  initial_odometer?: number;
  active?: boolean;
};

const EMPTY: Vehicle = { name: "", initial_odometer: 0, active: true, fuel_type: "diesel" };

function VehiclesPage() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [fuel, setFuel] = useState<any[]>([]);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [fuelOpen, setFuelOpen] = useState(false);

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const [{ data: v }, { data: f }] = await Promise.all([
      supabase.from("vehicles").select("*").eq("company_id", cid).order("name"),
      supabase
        .from("fuel_records")
        .select("*, vehicles(name, license_plate)")
        .eq("company_id", cid)
        .order("fuel_date", { ascending: false })
        .limit(50),
    ]);
    setVehicles(v ?? []);
    setFuel(f ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(v: Vehicle) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const payload: any = { ...v, company_id: cid };
    payload.consumption_l_100km = v.consumption_l_100km ? Number(v.consumption_l_100km) : null;
    payload.initial_odometer = Number(v.initial_odometer ?? 0);
    let error;
    if (v.id) ({ error } = await supabase.from("vehicles").update(payload).eq("id", v.id));
    else ({ error } = await supabase.from("vehicles").insert(payload));
    if (error) return toast.error(error.message);
    toast.success("Uložené");
    setEditing(null);
    load();
  }

  async function toggleActive(v: any) {
    const { error } = await supabase.from("vehicles").update({ active: !v.active }).eq("id", v.id);
    if (error) return toast.error(error.message);
    load();
  }

  /**
   * Omylom pridané vozidlo sa dalo len deaktivovať a v zozname ostávalo
   * navždy. Zmazať sa dá, kým naň nevisia jazdy ani tankovania — tie drží
   * cudzí kľúč s RESTRICT, ale surová hláška z Postgresu človeku nepovie nič.
   */
  async function zmazVozidlo(v: any) {
    const [{ count: jazdy }, { count: tankovania }] = await Promise.all([
      supabase.from("trips").select("id", { count: "exact", head: true }).eq("vehicle_id", v.id),
      supabase
        .from("fuel_records")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", v.id),
    ]);
    if (jazdy || tankovania) {
      const co = [jazdy && `jazdy (${jazdy})`, tankovania && `tankovania (${tankovania})`]
        .filter(Boolean)
        .join(" a ");
      return toast.error(
        `Vozidlo sa nedá zmazať, sú naň naviazané ${co}. Namiesto toho ho deaktivujte.`,
      );
    }
    if (!confirm(`Naozaj zmazať vozidlo ${v.name}?`)) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", v.id);
    if (error) return toast.error(error.message);
    toast.success("Vozidlo zmazané");
    load();
  }

  async function zmazTankovanie(f: any) {
    if (!confirm("Naozaj zmazať tento záznam o tankovaní?")) return;
    const { error } = await supabase.from("fuel_records").delete().eq("id", f.id);
    if (error) return toast.error(error.message);
    toast.success("Tankovanie zmazané");
    load();
  }

  return (
    <>
      <PageHeader
        title="Vozidlá a tankovanie"
        description="Správa služobných vozidiel a evidencia PHM."
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setFuelOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
            >
              <Fuel className="h-4 w-4" /> Tankovanie
            </button>
            <button
              onClick={() => setEditing(EMPTY)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Pridať vozidlo
            </button>
          </div>
        }
      />
      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.length === 0 && (
            <div className="text-sm text-muted-foreground">Žiadne vozidlá.</div>
          )}
          {vehicles.map((v) => (
            <div
              key={v.id}
              className={`rounded-xl border p-4 shadow-sm ${v.active ? "border-border bg-card" : "border-border bg-muted/30 opacity-70"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{v.name}</div>
                  <div className="text-xs text-muted-foreground">{v.license_plate ?? "—"}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(v)} className="rounded p-1.5 hover:bg-muted">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => toggleActive(v)}
                    title={v.active ? "Deaktivovať" : "Aktivovať"}
                    className="rounded p-1.5 hover:bg-muted"
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => zmazVozidlo(v)}
                    title="Zmazať vozidlo"
                    aria-label="Zmazať vozidlo"
                    className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Typ</dt>
                  <dd>{v.vehicle_type ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Palivo</dt>
                  <dd>{v.fuel_type ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Spotreba</dt>
                  <dd>{v.consumption_l_100km ? `${v.consumption_l_100km} l/100km` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Počiatočný stav</dt>
                  <dd className="tabular-nums">{Number(v.initial_odometer ?? 0).toFixed(0)} km</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide">
          Posledné tankovania
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Dátum</th>
                <th className="p-3">Vozidlo</th>
                <th className="p-3 text-right">Litre</th>
                <th className="p-3 text-right">€/l</th>
                <th className="p-3 text-right">Spolu</th>
                <th className="p-3">Stanica</th>
                <th className="p-3">Doklad</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fuel.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Žiadne záznamy.
                  </td>
                </tr>
              )}
              {fuel.map((f: any) => (
                <tr key={f.id}>
                  <td className="p-3 whitespace-nowrap">{f.fuel_date}</td>
                  <td className="p-3">{f.vehicles?.name ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums">{Number(f.liters).toFixed(2)}</td>
                  <td className="p-3 text-right tabular-nums">
                    {Number(f.price_per_liter).toFixed(3)}
                  </td>
                  <td className="p-3 text-right tabular-nums font-medium">
                    {Number(f.total_amount).toFixed(2)} €
                  </td>
                  <td className="p-3">{f.station_name ?? "—"}</td>
                  <td className="p-3">{f.receipt_number ?? "—"}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => zmazTankovanie(f)}
                      title="Zmazať tankovanie"
                      aria-label="Zmazať tankovanie"
                      className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>

      {editing && (
        <VehicleDialog initial={editing} onClose={() => setEditing(null)} onSave={save} />
      )}
      {fuelOpen && (
        <FuelDialog
          vehicles={vehicles}
          onClose={() => setFuelOpen(false)}
          onSaved={() => {
            setFuelOpen(false);
            load();
          }}
        />
      )}
    </>
  );
}

function VehicleDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: Vehicle;
  onClose: () => void;
  onSave: (v: Vehicle) => void;
}) {
  const [v, setV] = useState<Vehicle>(initial);
  useZatvorNaEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={v.id ? "Upraviť vozidlo" : "Nové vozidlo"}
        className="w-full max-w-xl rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{v.id ? "Upraviť vozidlo" : "Nové vozidlo"}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(v);
          }}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <In
            label="Názov *"
            value={v.name}
            onChange={(x) => setV({ ...v, name: x })}
            required
            full
          />
          <In
            label="ŠPZ"
            value={v.license_plate ?? ""}
            onChange={(x) => setV({ ...v, license_plate: x })}
          />
          <In
            label="Typ vozidla"
            value={v.vehicle_type ?? ""}
            onChange={(x) => setV({ ...v, vehicle_type: x })}
          />
          <label className="block">
            <span className="text-sm font-medium">Palivo</span>
            <select
              value={v.fuel_type ?? ""}
              onChange={(e) => setV({ ...v, fuel_type: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="diesel">Diesel</option>
              <option value="benzin">Benzín</option>
              <option value="lpg">LPG</option>
              <option value="cng">CNG</option>
              <option value="elektro">Elektro</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
          <In
            label="Spotreba (l/100km)"
            type="number"
            step="0.1"
            value={String(v.consumption_l_100km ?? "")}
            onChange={(x) => setV({ ...v, consumption_l_100km: x ? Number(x) : null })}
          />
          <In
            label="Počiatočný stav km"
            type="number"
            step="1"
            value={String(v.initial_odometer ?? 0)}
            onChange={(x) => setV({ ...v, initial_odometer: Number(x) })}
          />
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
            >
              Zrušiť
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Uložiť
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FuelDialog({
  vehicles,
  onClose,
  onSaved,
}: {
  vehicles: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    vehicle_id: vehicles[0]?.id ?? "",
    fuel_date: new Date().toISOString().slice(0, 10),
    liters: "",
    price_per_liter: "",
    station_name: "",
    receipt_number: "",
  });
  const total = (Number(f.liters || 0) * Number(f.price_per_liter || 0)).toFixed(2);
  useZatvorNaEscape(onClose);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cid = getActiveCompanyId();
    if (!cid || !f.vehicle_id) return;
    const { error } = await supabase.from("fuel_records").insert({
      company_id: cid,
      vehicle_id: f.vehicle_id,
      fuel_date: f.fuel_date,
      liters: Number(f.liters),
      price_per_liter: Number(f.price_per_liter),
      total_amount: Number(total),
      station_name: f.station_name || null,
      receipt_number: f.receipt_number || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Tankovanie uložené");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nové tankovanie"
        className="w-full max-w-md rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Nové tankovanie</h2>
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <label className="block">
            <span className="text-sm font-medium">Vozidlo *</span>
            <select
              required
              value={f.vehicle_id}
              onChange={(e) => setF({ ...f, vehicle_id: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.license_plate ? `(${v.license_plate})` : ""}
                </option>
              ))}
            </select>
          </label>
          <In
            label="Dátum *"
            type="date"
            required
            value={f.fuel_date}
            onChange={(x) => setF({ ...f, fuel_date: x })}
          />
          <div className="grid grid-cols-2 gap-3">
            <In
              label="Litre *"
              type="number"
              step="0.01"
              required
              value={f.liters}
              onChange={(x) => setF({ ...f, liters: x })}
            />
            <In
              label="Cena za liter *"
              type="number"
              step="0.001"
              required
              value={f.price_per_liter}
              onChange={(x) => setF({ ...f, price_per_liter: x })}
            />
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
            Spolu: <strong className="tabular-nums">{total} €</strong>
          </div>
          <In
            label="Čerpacia stanica"
            value={f.station_name}
            onChange={(x) => setF({ ...f, station_name: x })}
          />
          <In
            label="Číslo dokladu"
            value={f.receipt_number}
            onChange={(x) => setF({ ...f, receipt_number: x })}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
            >
              Zrušiť
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Uložiť
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function In({
  label,
  value,
  onChange,
  type = "text",
  step,
  required,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        step={step}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
