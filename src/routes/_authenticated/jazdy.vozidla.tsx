import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Plus, Pencil, Power, Fuel, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { potvrd } from "@/lib/potvrdenie";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { formatujCislo, formatujJednotkovuCenu, formatujMenu } from "@/lib/faktero/mena";
import { formatujDatum } from "@/lib/faktero/uzavierka";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
export const Route = createFileRoute("/_authenticated/jazdy/vozidla")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Vozidlá — Faktero") }] }),
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
  const { t } = useT();
  const mena = useMenaFirmy();
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
    toast.success(t("Uložené"));
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
      const co = [
        jazdy && t("jazdy ({n})", { n: jazdy }),
        tankovania && t("tankovania ({n})", { n: tankovania }),
      ]
        .filter(Boolean)
        .join(t(" a "));
      return toast.error(
        t("Vozidlo sa nedá zmazať, sú naň naviazané {co}. Namiesto toho ho deaktivujte.", { co }),
      );
    }
    if (!(await potvrd(t("Naozaj zmazať vozidlo {nazov}?", { nazov: v.name })))) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", v.id);
    if (error) return toast.error(error.message);
    toast.success(t("Vozidlo zmazané"));
    load();
  }

  async function zmazTankovanie(f: any) {
    if (!(await potvrd(t("Naozaj zmazať tento záznam o tankovaní?")))) return;
    const { error } = await supabase.from("fuel_records").delete().eq("id", f.id);
    if (error) return toast.error(error.message);
    toast.success(t("Tankovanie zmazané"));
    load();
  }

  return (
    <>
      <PageHeader
        title={t("Vozidlá a tankovanie")}
        description={t("Správa služobných vozidiel a evidencia PHM.")}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setFuelOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
            >
              <Fuel className="h-4 w-4" /> {t("Tankovanie")}
            </button>
            <button
              onClick={() => setEditing(EMPTY)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Pridať vozidlo")}
            </button>
          </div>
        }
      />
      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center sm:col-span-2 lg:col-span-3">
              <div className="text-sm font-medium">{t("Zatiaľ nemáte žiadne vozidlo")}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t("Pridajte prvé vozidlo a môžete zapisovať jazdy aj tankovania.")}
              </div>
              <button
                onClick={() => setEditing(EMPTY)}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> {t("Pridať vozidlo")}
              </button>
            </div>
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
                  <button
                    onClick={() => setEditing(v)}
                    title={t("Upraviť vozidlo")}
                    aria-label={t("Upraviť vozidlo")}
                    className="rounded p-1.5 hover:bg-muted"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => toggleActive(v)}
                    title={v.active ? t("Deaktivovať") : t("Aktivovať")}
                    className="rounded p-1.5 hover:bg-muted"
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => zmazVozidlo(v)}
                    title={t("Zmazať vozidlo")}
                    aria-label={t("Zmazať vozidlo")}
                    className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">{t("Typ")}</dt>
                  <dd>{v.vehicle_type ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("Palivo")}</dt>
                  <dd>{v.fuel_type ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("Spotreba")}</dt>
                  <dd>
                    {v.consumption_l_100km
                      ? `${formatujCislo(v.consumption_l_100km, 1, 2)} l/100 km`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("Počiatočný stav")}</dt>
                  <dd className="tabular-nums">{formatujCislo(v.initial_odometer ?? 0, 0)} km</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide">
          {t("Posledné tankovania")}
        </h2>
        {/* Mobil: karty — osem stĺpcov sa na 390 px nezmestí. */}
        <div className="space-y-2 md:hidden">
          {fuel.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {t("Žiadne záznamy.")}
            </div>
          )}
          {fuel.map((f: any) => (
            <div key={f.id} className="rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{f.vehicles?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatujDatum(f.fuel_date)}
                    {f.station_name ? ` · ${f.station_name}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="whitespace-nowrap font-semibold tabular-nums">
                    {formatujMenu(f.total_amount, mena.kod)}
                  </span>
                  <button
                    onClick={() => zmazTankovanie(f)}
                    title={t("Zmazať tankovanie")}
                    aria-label={t("Zmazať tankovanie")}
                    className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                {formatujCislo(f.liters, 2)} l ×{" "}
                {formatujJednotkovuCenu(f.price_per_liter, mena.kod)}
                {f.receipt_number ? ` · ${t("doklad {cislo}", { cislo: f.receipt_number })}` : ""}
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">{t("Dátum")}</th>
                <th className="p-3">{t("Vozidlo")}</th>
                <th className="p-3 text-right">{t("Litre")}</th>
                <th className="p-3 text-right">{mena.symbol}/l</th>
                <th className="p-3 text-right">{t("Spolu")}</th>
                <th className="p-3 pl-6">{t("Stanica")}</th>
                <th className="p-3">{t("Doklad")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fuel.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    {t("Žiadne záznamy.")}
                  </td>
                </tr>
              )}
              {fuel.map((f: any) => (
                <tr key={f.id}>
                  <td className="p-3 whitespace-nowrap">{formatujDatum(f.fuel_date)}</td>
                  <td className="p-3">{f.vehicles?.name ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums">{formatujCislo(f.liters, 2)}</td>
                  <td className="p-3 text-right tabular-nums">
                    {formatujJednotkovuCenu(f.price_per_liter)}
                  </td>
                  <td className="p-3 text-right tabular-nums font-medium whitespace-nowrap">
                    {formatujMenu(f.total_amount, mena.kod)}
                  </td>
                  <td className="p-3 pl-6">{f.station_name ?? "—"}</td>
                  <td className="p-3">{f.receipt_number ?? "—"}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => zmazTankovanie(f)}
                      title={t("Zmazať tankovanie")}
                      aria-label={t("Zmazať tankovanie")}
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
  const { t } = useT();
  const [v, setV] = useState<Vehicle>(initial);
  useZatvorNaEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={v.id ? t("Upraviť vozidlo") : t("Nové vozidlo")}
        className="w-full max-w-xl rounded-xl border border-border bg-card p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{v.id ? t("Upraviť vozidlo") : t("Nové vozidlo")}</h2>
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
            <span className="text-sm font-medium">{t("Palivo")}</span>
            <select
              value={v.fuel_type ?? ""}
              onChange={(e) => setV({ ...v, fuel_type: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="diesel">Diesel</option>
              <option value="benzin">{t("Benzín")}</option>
              <option value="lpg">LPG</option>
              <option value="cng">CNG</option>
              <option value="elektro">{t("Elektro")}</option>
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
              {t("Zrušiť")}
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {t("Uložiť")}
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
  const { t } = useT();
  const mena = useMenaFirmy();
  const [f, setF] = useState({
    vehicle_id: vehicles[0]?.id ?? "",
    fuel_date: dnesBratislava(),
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
    toast.success(t("Tankovanie uložené"));
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Nové tankovanie")}
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{t("Nové tankovanie")}</h2>
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <label className="block">
            <span className="text-sm font-medium">{t("Vozidlo *")}</span>
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
            {t("Spolu:")} <strong className="tabular-nums">{formatujMenu(total, mena.kod)}</strong>
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
              {t("Zrušiť")}
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {t("Uložiť")}
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
  const { t } = useT();
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium">{t(label)}</span>
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
