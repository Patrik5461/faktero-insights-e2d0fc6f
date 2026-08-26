import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { JobPicker } from "@/components/faktero/JobPicker";
import { poslednaCenaPaliva } from "@/lib/faktero/cena-paliva";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { navrhniTrasu, type NavrhTrasy } from "@/lib/faktero/trasa.server";
import { MapaTrasy } from "@/components/faktero/MapaTrasy";
import { Map as MapIcon } from "lucide-react";
import { PoleAdresy } from "@/components/faktero/PoleAdresy";
import { PoleOdberatela, adresaOdberatela } from "@/components/faktero/PoleOdberatela";

/**
 * Tá istá stránka zakladá aj upravuje. Kniha jázd je účtovný záznam a preklep v
 * tachometri alebo zle označená súkromná jazda sa musia dať opraviť — bez toho
 * ostávalo jediné riešenie jazdu zmazať a zapísať znova, čím sa pri stiahnutých
 * jazdách stratila trasa aj väzba na Commander.
 */
export const Route = createFileRoute("/_authenticated/jazdy/nova")({
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s.id === "string" && s.id ? { id: s.id } : {},
  head: () => ({ meta: [{ title: "Jazda — Faktero" }] }),
  component: NewTripPage,
});

function NewTripPage() {
  const navigate = useNavigate();
  const { id } = Route.useSearch();
  const upravujem = !!id;
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [nacitavam, setNacitavam] = useState(upravujem);
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
    /*
      Priemerná rýchlosť a trvanie sa dopočítavajú zo vzdialenosti navzájom:
      úprava jedného prepíše druhé. Predvolených 60 km/h je bežný priemer
      zmiešanej jazdy — kto ide iba po diaľnici alebo iba po meste, si to
      prepíše a jeho číslo sa už samo nemení.
    */
    average_speed_kmh: "60",
    duration_min: "",
    job_id: "",
    customer_id: "",
    customer_name: "",
    note: "",
    classification: "business",
  });
  const [saving, setSaving] = useState(false);
  /*
    Navrhnutá trasa. Zámerne sa nikam nezapisuje sama: mapa je pomôcka,
    záväzné sú kilometre z tachometra. Do dokladu ide až vtedy, keď človek
    navrhnuté kilometre naozaj použije.
  */
  const [trasa, setTrasa] = useState<NavrhTrasy | null>(null);
  const [hladamTrasu, setHladamTrasu] = useState(false);
  /* Trasa zapísaná pri jazde. Doteraz sa dala vidieť len z knihy jázd cez
     ikonku mapy — po otvorení jazdy zmizla, hoci práve tam sa hodí najviac. */
  const [ulozenaTrasa, setUlozenaTrasa] = useState<string | null>(null);
  /* Čerstvo navrhnutá trasa prebíja zapísanú — človek ju práve prepočítal. */
  const zobrazenaTrasa = trasa?.route ?? ulozenaTrasa;
  // Doplnená cena sa smie prepísať ďalším vozidlom, ručne zadaná nikdy.
  const [cenaDoplnena, setCenaDoplnena] = useState(false);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("vehicles")
      .select("*")
      .eq("company_id", cid)
      // Pri úprave staršej jazdy môže byť vozidlo už odstavené — keby sa
      // nenačítalo, výber by sa ticho prepol na iné auto.
      .order("name")
      .then(({ data }) => {
        const zoznam = (data ?? []).filter((v) => v.active);
        setVehicles(data ?? []);
        if (!upravujem && zoznam[0]) setForm((p) => ({ ...p, vehicle_id: zoznam[0].id }));
      });
  }, [upravujem]);

  useEffect(() => {
    if (!id) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    supabase
      .from("trips")
      .select("*")
      .eq("company_id", cid)
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        setNacitavam(false);
        if (error || !data) {
          toast.error("Jazda sa nenašla.");
          return navigate({ to: "/jazdy" });
        }
        setCenaDoplnena(false);
        setUlozenaTrasa((data as any).route ?? null);
        setForm({
          vehicle_id: data.vehicle_id ?? "",
          trip_date: data.trip_date ?? new Date().toISOString().slice(0, 10),
          driver_name: data.driver_name ?? "",
          start_location: data.start_location ?? "",
          end_location: data.end_location ?? "",
          purpose: data.purpose ?? "",
          start_odometer: data.start_odometer == null ? "" : String(data.start_odometer),
          end_odometer: data.end_odometer == null ? "" : String(data.end_odometer),
          fuel_price: data.fuel_price == null ? "" : String(data.fuel_price),
          job_id: data.job_id ?? "",
          customer_id: data.customer_id ?? "",
          customer_name: data.customer_name ?? "",
          note: data.note ?? "",
          classification: data.classification === "private" ? "private" : "business",
          // Pri úprave sa berú uložené čísla, nie prepočet — inak by sa jazde
          // zmerané trvanie prepísalo odhadom z priemeru.
          average_speed_kmh: data.average_speed_kmh == null ? "60" : String(data.average_speed_kmh),
          duration_min:
            data.duration_seconds == null
              ? ""
              : String(Math.round(Number(data.duration_seconds) / 60)),
        });
      });
  }, [id, navigate]);

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

  const navrhni = useServerFn(navrhniTrasu);

  async function navrhniTrasuPreFormular() {
    if (!form.start_location.trim() || !form.end_location.trim()) {
      return toast.error("Vyplňte Odkiaľ aj Kam.");
    }
    setHladamTrasu(true);
    try {
      const t = await navrhni({
        data: { odkial: form.start_location.trim(), kam: form.end_location.trim() },
      });
      setTrasa(t);
    } catch (e: any) {
      setTrasa(null);
      toast.error(e?.message ?? "Trasu sa nepodarilo navrhnúť.");
    } finally {
      setHladamTrasu(false);
    }
  }

  /** Doplní tachometer tak, aby vyšla navrhnutá vzdialenosť. */
  function pouziKilometre() {
    if (!trasa) return;
    const zaciatok = Number(form.start_odometer || 0);
    setForm((f) => ({
      ...f,
      end_odometer: (zaciatok + trasa.vzdialenost_km).toFixed(1),
    }));
    toast.success(`Doplnených ${trasa.vzdialenost_km} km — skontrolujte podľa tachometra.`);
  }

  /** Trvanie v minútach zo vzdialenosti a priemeru; prázdne, keď sa nedá. */
  function trvanieZPriemeru(km: number, priemer: number): string {
    if (!(km > 0) || !(priemer > 0)) return "";
    return String(Math.round((km / priemer) * 60));
  }

  function nastavPriemer(hodnota: string) {
    setForm((f) => {
      const km = Number(f.end_odometer || 0) - Number(f.start_odometer || 0);
      return {
        ...f,
        average_speed_kmh: hodnota,
        duration_min: trvanieZPriemeru(km, Number(hodnota)),
      };
    });
  }

  /** Úprava trvania prepočíta priemer, nech si tie dve čísla neodporujú. */
  function nastavTrvanie(hodnota: string) {
    setForm((f) => {
      const km = Number(f.end_odometer || 0) - Number(f.start_odometer || 0);
      const minuty = Number(hodnota);
      const priemer =
        km > 0 && minuty > 0
          ? String(Math.round((km / minuty) * 60 * 10) / 10)
          : f.average_speed_kmh;
      return { ...f, duration_min: hodnota, average_speed_kmh: priemer };
    });
  }

  const start = Number(form.start_odometer || 0);
  const end = Number(form.end_odometer || 0);
  const distance = end - start;

  /*
    Keď sa zmení vzdialenosť, prepočíta sa trvanie podľa zvoleného priemeru —
    nie naopak. Rýchlosť je to, čo o jazde vie človek; trvanie z nej vyplýva.
  */
  useEffect(() => {
    const nove = trvanieZPriemeru(distance, Number(form.average_speed_kmh));
    if (nove !== form.duration_min) setForm((f) => ({ ...f, duration_min: nove }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distance]);

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
    const riadok = {
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
      customer_id: form.customer_id || null,
      // Odtlačok mena, nie odkaz — odberateľa možno premenovať aj zmazať.
      customer_name: form.customer_name || null,
      note: form.note || null,
      classification: form.classification,
      average_speed_kmh: form.average_speed_kmh ? Number(form.average_speed_kmh) : null,
      duration_seconds: form.duration_min ? Math.round(Number(form.duration_min) * 60) : null,
      // Trasa z mapy sa uloží, len keď si ju človek naozaj vyžiadal.
      ...(trasa ? { route: trasa.route } : {}),
    };
    const { error } = id
      ? await supabase.from("trips").update(riadok).eq("company_id", cid).eq("id", id)
      : await supabase.from("trips").insert({ company_id: cid, ...riadok });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(id ? "Jazda upravená" : "Jazda uložená");
    navigate({ to: "/jazdy" });
  }

  return (
    <>
      <PageHeader
        title={upravujem ? "Upraviť jazdu" : "Nová jazda"}
        description={
          upravujem
            ? "Oprava zapísanej jazdy — trasa a väzba na zdroj ostávajú zachované."
            : "Pridajte záznam o služobnej ceste."
        }
      />
      <PageBody>
        {nacitavam ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : vehicles.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm">
            Najskôr pridajte vozidlo v sekcii{" "}
            <a href="/jazdy/vozidla" className="text-primary hover:underline">
              Vozidlá
            </a>
            .
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
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
            {/* Súkromná jazda firemným autom patrí do knihy jázd, ale musí byť
                v nej označená — do exportu pre účtovníčku ide ako súkromná. */}
            <Field label="Charakter jazdy">
              <select
                value={form.classification}
                onChange={(e) => setForm({ ...form, classification: e.target.value })}
                className="input"
              >
                <option value="business">Služobná</option>
                <option value="private">Súkromná</option>
              </select>
            </Field>
            {/*
              Odkiaľ a Kam patria vedľa seba — sú to dve polovice jednej veci.
              V mriežke boli oddelené a „Odkiaľ" sedelo vedľa charakteru jazdy,
              takže sa spolu nečítali. Vlastný riadok ich drží pri sebe bez
              ohľadu na to, čo je nad nimi.
            */}
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
              <Field label="Odkiaľ">
                <PoleAdresy
                  hodnota={form.start_location}
                  onZmena={(v) => setForm({ ...form, start_location: v })}
                  placeholder="napr. Trnava, Hlavná 12"
                />
              </Field>
              <Field label="Kam">
                <PoleAdresy
                  hodnota={form.end_location}
                  onZmena={(v) => setForm({ ...form, end_location: v })}
                  placeholder="napr. Bratislava, Einsteinova 5"
                />
              </Field>
            </div>
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
            {/*
              Priemer a trvanie sú dve strany tej istej mince: úprava jedného
              prepočíta druhé podľa vzdialenosti. Obe sa dajú prepísať ručne —
              odhad je len východisko, nie tvrdenie o tom, ako sa jazdilo.
            */}
            <Field label="Priemerná rýchlosť (km/h)">
              <input
                type="number"
                step="1"
                min="1"
                value={form.average_speed_kmh}
                onChange={(e) => nastavPriemer(e.target.value)}
                className="input"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Z nej sa dopočíta trvanie. Prepíšte ju, ak ste išli prevažne po diaľnici alebo po
                meste.
              </span>
            </Field>
            <Field label="Trvanie jazdy (min)">
              <input
                type="number"
                step="1"
                min="0"
                value={form.duration_min}
                onChange={(e) => nastavTrvanie(e.target.value)}
                className="input"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {form.duration_min && Number(form.duration_min) >= 60
                  ? `${Math.floor(Number(form.duration_min) / 60)} h ${Number(form.duration_min) % 60} min — úpravou sa prepočíta priemer.`
                  : "Úpravou sa prepočíta priemerná rýchlosť."}
              </span>
            </Field>
            <Field label="Vzdialenosť (auto)">
              <div className="input bg-muted/40 tabular-nums">
                {Number.isFinite(distance) ? distance.toFixed(1) : "—"} km
              </div>
            </Field>
            {/*
              Odberateľ a zákazka vedľa seba: „za kým" a „na čom". Zákazka to
              nenahradí — nie každá cesta k odberateľovi patrí na zákazku, a
              nie každá zákazka má odberateľa.
            */}
            <PoleOdberatela
              value={form.customer_id}
              napoveda={'Doplní sa aj do poľa „Kam", keď je prázdne.'}
              onChange={(id, odberatel) =>
                setForm((p) => ({
                  ...p,
                  customer_id: id,
                  customer_name: odberatel?.name ?? "",
                  // Vypísané „Kam" sa neprepisuje — človek ho mohol zadať
                  // presnejšie než je adresa v kartotéke.
                  end_location: p.end_location.trim()
                    ? p.end_location
                    : adresaOdberatela(odberatel),
                }))
              }
            />
            <JobPicker
              value={form.job_id}
              customerId={form.customer_id || null}
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

          {/*
            Mapa vedľa formulára, nie pod ním. Pri otvorenej jazde je trasa to
            prvé, čo človek chce vidieť — dovtedy sa dala zobraziť len ikonkou
            v knihe jázd a po otvorení jazdy zmizla. Na úzkej obrazovke sa
            stĺpce poskladajú pod seba a mapa ide nakoniec.
          */}
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Trasa na mape</h2>
                {/*
                  Trasa sa počíta až na požiadanie. Automaticky pri písaní by sa
                  dopyt spustil z každej nedokončenej adresy a míňal by kvótu na
                  preklepoch.
                */}
                <button
                  type="button"
                  onClick={navrhniTrasuPreFormular}
                  disabled={hladamTrasu}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-60"
                >
                  <MapIcon className="h-3.5 w-3.5" />
                  {hladamTrasu ? "Hľadám…" : zobrazenaTrasa ? "Prepočítať" : "Navrhnúť trasu"}
                </button>
              </div>

              {trasa && (
                <div className="mt-2 text-sm">
                  <span className="font-medium">{trasa.vzdialenost_km} km</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · približne {trasa.trvanie_min} min
                  </span>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {trasa.odkial.nazov} → {trasa.kam.nazov}
                  </div>
                </div>
              )}

              {zobrazenaTrasa ? (
                <div className="mt-3">
                  <MapaTrasy route={zobrazenaTrasa} vyska={300} />
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                  {upravujem
                    ? "Táto jazda nemá zapísanú trasu. Doplňte odkiaľ a kam a dajte Navrhnúť trasu."
                    : "Vyplňte odkiaľ a kam a dajte Navrhnúť trasu."}
                </p>
              )}

              {trasa && (
                <>
                  <button
                    type="button"
                    onClick={pouziKilometre}
                    className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Doplniť {trasa.vzdialenost_km} km do tachometra
                  </button>
                  {/* Kilometre z mapy sú najkratšia cesta po cestách, nie to,
                      čo auto naozaj prešlo. Pred úradom platí tachometer. */}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Je to najkratšia cesta po cestách — obchádzky ani hľadanie parkovania v nej nie
                    sú. Pre knihu jázd je rozhodujúci tachometer.
                  </p>
                </>
              )}
            </div>
          </aside>
          </div>
        )}
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
