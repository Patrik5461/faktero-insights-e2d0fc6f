import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Plus, Pencil, Trash2, Car, Map as MapIcon } from "lucide-react";
import { toast } from "sonner";
import {
  formatDuration,
  formatSpeed,
  jeSukromna,
  sourceLabel,
  ucelNaZobrazenie,
} from "@/lib/faktero/trip-format";
import { MapaTrasy } from "@/components/faktero/MapaTrasy";
import { useServerFn } from "@tanstack/react-start";
import { trasaMedziBodmi } from "@/lib/faktero/trasa.server";
import { BulkBar, ConfirmDialog } from "@/components/faktero/ListControls";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/jazdy/")({
  head: () => ({ meta: [{ title: "Kniha jázd — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>): { vehicle_id?: string } => ({
    vehicle_id: typeof s.vehicle_id === "string" && s.vehicle_id ? s.vehicle_id : undefined,
  }),
  component: TripsPage,
});

type Trip = {
  id: string;
  trip_date: string;
  driver_name: string | null;
  start_location: string | null;
  end_location: string | null;
  purpose: string | null;
  customer_name: string | null;
  job_id: string | null;
  distance_km: number;
  vehicle_id: string;
  note: string | null;
  duration_seconds: number | null;
  average_speed_kmh: number | null;
  max_speed_kmh: number | null;
  raw_provider_data: any;
  external_source: string | null;
  classification: string | null;
  route: string | null;
};

/**
 * Začiatok a koniec jazdy zo surových dát Commandera.
 *
 * Commander skutočne prejdenú trasu neposiela — pole `waypoints` je v jeho
 * odpovedi vždy prázdne (overené na 3 209 jazdách). Má ale presné súradnice
 * začiatku a konca, takže sa aspoň dá ukázať, kde jazda začala a skončila.
 */
function koncoveBody(r: Trip): { odkial: Bod; kam: Bod } | null {
  if (r.route) return null;
  const d = r.raw_provider_data;
  if (!d) return null;
  const c = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const a = { lat: c(d.latStart), lng: c(d.lonStart) };
  const b = { lat: c(d.latStop), lng: c(d.lonStop) };
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  // Jazda, ktorá skončila tam, kde začala, nemá čo kresliť.
  if (a.lat === b.lat && a.lng === b.lng) return null;
  return { odkial: a as Bod, kam: b as Bod };
}

type Bod = { lat: number; lng: number };

/** Koľko jázd sa načíta naraz. */
const DAVKA = 500;

function TripsPage() {
  const { vehicle_id } = Route.useSearch();
  const navigate = useNavigate({ from: "/jazdy/" });
  const [rows, setRows] = useState<Trip[]>([]);
  const [vehicleList, setVehicleList] = useState<
    Array<{ id: string; name: string; license_plate: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  // Kniha jázd je účtovný záznam, takže sa nesmie ticho končiť na strope. Načítava
  // sa po dávkach a vedľa nich je vidno, koľko jázd firma naozaj má.
  const [limit, setLimit] = useState(DAVKA);
  const [spolu, setSpolu] = useState<number | null>(null);
  const [trasa, setTrasa] = useState<Trip | null>(null);
  // Výber na hromadné mazanie. Drží sa v mape podľa id, nie poľom — pri
  // päťsto načítaných jazdách je preklikávanie zoznamom zbytočne pomalé.
  const [vybrane, setVybrane] = useState<Record<string, boolean>>({});
  const [potvrdenie, setPotvrdenie] = useState(false);
  /*
    Navrhnutá trasa pre jazdy, ktoré si vlastnú nenesú (Commander). Drží sa
    podľa id jazdy, aby sa tá istá cesta nepýtala pri každom otvorení znova.
  */
  const [navrhy, setNavrhy] = useState<Record<string, string>>({});
  const [navrhujem, setNavrhujem] = useState(false);
  const ziadajTrasu = useServerFn(trasaMedziBodmi);
  const [mazem, setMazem] = useState(false);

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from("trips")
      .select("*", { count: "exact" })
      .eq("company_id", cid)
      .order("trip_date", { ascending: false })
      .limit(limit);
    if (vehicle_id) q = q.eq("vehicle_id", vehicle_id);
    const [{ data: t, count }, { data: v }] = await Promise.all([
      q,
      supabase
        .from("vehicles")
        .select("id, name, license_plate")
        .eq("company_id", cid)
        .order("name"),
    ]);
    setRows((t ?? []) as any);
    setSpolu(count ?? null);
    setVehicleList((v ?? []) as any);
    setLoading(false);
  }
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [vehicle_id, limit]);

  // Pri prepnutí vozidla začíname zase od prvej dávky.
  useEffect(() => {
    setLimit(DAVKA);
  }, [vehicle_id]);

  const vehicles = useMemo(() => {
    const m: Record<string, { name: string; license_plate: string | null }> = {};
    vehicleList.forEach((x) => {
      m[x.id] = { name: x.name, license_plate: x.license_plate };
    });
    return m;
  }, [vehicleList]);

  const vybraneIds = useMemo(
    () => rows.filter((r) => vybrane[r.id]).map((r) => r.id),
    [rows, vybrane],
  );
  const vsetkyVybrate = rows.length > 0 && vybraneIds.length === rows.length;

  function prepniJazdu(id: string, zapnute: boolean) {
    setVybrane((p) => ({ ...p, [id]: zapnute }));
  }

  function prepniVsetky(zapnute: boolean) {
    setVybrane(zapnute ? Object.fromEntries(rows.map((r) => [r.id, true])) : {});
  }

  async function otvorTrasu(r: Trip) {
    setTrasa(r);
    const body = koncoveBody(r);
    if (!body || navrhy[r.id]) return;
    setNavrhujem(true);
    try {
      const v = await ziadajTrasu({ data: body });
      setNavrhy((n) => ({ ...n, [r.id]: v.route }));
    } catch (e: any) {
      toast.error(e?.message ?? "Trasu sa nepodarilo navrhnúť.");
    } finally {
      setNavrhujem(false);
    }
  }

  /** Jednu jazdu maže tá istá cesta ako hromadu — jeden dialóg, jedno hlásenie. */
  function zmazJednu(id: string) {
    setVybrane({ [id]: true });
    setPotvrdenie(true);
  }

  /**
   * Hromadné prepnutie služobná/súkromná. Rovnaká poistka ako pri mazaní:
   * `select()` povie, koľkých riadkov sa to naozaj týkalo — uzamknuté obdobie
   * alebo cudzia firma sa inak tvária ako úspech.
   */
  async function nastavZaradenie(classification: "business" | "private") {
    const cid = getActiveCompanyId();
    if (!cid || !vybraneIds.length) return;
    const { data, error } = await supabase
      .from("trips")
      .update({ classification })
      .in("id", vybraneIds)
      .eq("company_id", cid)
      .select("id");
    if (error) return toast.error(error.message);

    const zmenenych = data?.length ?? 0;
    const popis = classification === "private" ? "súkromné" : "služobné";
    if (zmenenych === vybraneIds.length) {
      toast.success(`Označených ako ${popis}: ${zmenenych}`);
    } else {
      toast.warning(
        `Zmenených ${zmenenych} z ${vybraneIds.length} — zvyšok sa zmeniť nedal, ` +
          `skontrolujte, či nie je obdobie uzamknuté.`,
      );
    }
    setVybrane({});
    load();
  }

  async function zmazVybrate() {
    const cid = getActiveCompanyId();
    if (!cid || !vybraneIds.length) return;
    setMazem(true);
    /*
      `select()` tu nie je kozmetika: bez neho `delete()` ohlási úspech aj vtedy,
      keď riadok neprepustila politika (napríklad uzamknuté obdobie), a človek by
      si myslel, že jazdy sú preč. Takto vieme, koľkých sa to naozaj týkalo.
    */
    const { data, error } = await supabase
      .from("trips")
      .delete()
      .in("id", vybraneIds)
      .eq("company_id", cid)
      .select("id");
    setMazem(false);
    setPotvrdenie(false);
    if (error) return toast.error(error.message);

    const zmazanych = data?.length ?? 0;
    if (zmazanych === vybraneIds.length) {
      toast.success(zmazanych === 1 ? "Jazda je vymazaná" : `Vymazaných ${zmazanych} jázd`);
    } else {
      toast.warning(
        `Vymazaných ${zmazanych} z ${vybraneIds.length} — zvyšok sa vymazať nedal, ` +
          `skontrolujte, či nie je obdobie uzamknuté.`,
      );
    }
    setVybrane({});
    load();
  }

  return (
    <>
      <PageHeader
        title="Kniha jázd"
        description="Záznamy služobných ciest s automatickým výpočtom km."
        action={
          <Link
            to="/jazdy/nova"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nová jazda
          </Link>
        }
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium">Vozidlo</label>
          <select
            value={vehicle_id ?? ""}
            onChange={(e) => {
              const v = e.target.value || undefined;
              navigate({ search: { vehicle_id: v } as any });
            }}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="">Všetky vozidlá</option>
            {vehicleList.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.license_plate ? ` — ${v.license_plate}` : ""}
              </option>
            ))}
          </select>
        </div>
        {loading && rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Načítavam…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <Car className="mx-auto h-10 w-10 text-muted-foreground" />
            <div className="mt-3 text-sm text-muted-foreground">Zatiaľ žiadne jazdy.</div>
            <Link
              to="/jazdy/nova"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Pridať prvú jazdu
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-3">
              <BulkBar
                count={vybraneIds.length}
                showDeleted={false}
                onDelete={() => setPotvrdenie(true)}
                onRestore={() => {}}
                onClear={() => setVybrane({})}
                akcie={
                  <>
                    <button
                      onClick={() => nastavZaradenie("business")}
                      className="rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary"
                    >
                      Označiť ako služobné
                    </button>
                    <button
                      onClick={() => nastavZaradenie("private")}
                      className="rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary"
                    >
                      Označiť ako súkromné
                    </button>
                  </>
                }
              />
            </div>

            {/* Desktop */}
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3 w-10">
                      <input
                        type="checkbox"
                        aria-label="Označiť všetky jazdy v zozname"
                        checked={vsetkyVybrate}
                        onChange={(e) => prepniVsetky(e.target.checked)}
                        className="h-4 w-4 cursor-pointer accent-primary"
                      />
                    </th>
                    <th className="p-3">Dátum jazdy</th>
                    <th className="p-3">Vozidlo</th>
                    <th className="p-3">Vodič</th>
                    <th className="p-3">Odkiaľ</th>
                    <th className="p-3">Kam</th>
                    <th className="p-3">Za kým</th>
                    <th className="p-3 text-right">Počet km</th>
                    <th className="p-3 text-right">Priemerná rýchlosť</th>
                    <th className="p-3 text-right">Najvyššia rýchlosť</th>
                    <th className="p-3 text-right">Trvanie jazdy</th>
                    <th className="p-3">Typ jazdy</th>
                    <th className="p-3">Zdroj</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    /*
                      Jazdu otvára celý riadok, nielen ceruzka. Rovnako sa
                      správa kniha faktúr — malá ikonka na kraji riadku je na
                      dotyk aj myšou zbytočne úzky cieľ. Akcie si kliknutie
                      ponechávajú pre seba.
                    */
                    <tr
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => navigate({ to: "/jazdy/nova", search: { id: r.id } })}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Označiť jazdu z ${r.trip_date}`}
                          checked={!!vybrane[r.id]}
                          onChange={(e) => prepniJazdu(r.id, e.target.checked)}
                          className="h-4 w-4 cursor-pointer accent-primary"
                        />
                      </td>
                      <td className="p-3 whitespace-nowrap">{r.trip_date}</td>
                      <td className="p-3">
                        {vehicles[r.vehicle_id]?.name ?? "—"}{" "}
                        <span className="text-xs text-muted-foreground">
                          {vehicles[r.vehicle_id]?.license_plate}
                        </span>
                      </td>
                      <td className="p-3">{r.driver_name ?? "—"}</td>
                      <td className="p-3">{r.start_location ?? "—"}</td>
                      <td className="p-3">{r.end_location ?? "—"}</td>
                      {/* Odberateľ je to, čo z jazdy robí služobnú cestu —
                          v knihe jázd patrí do prehľadu, nie len do detailu. */}
                      <td className="p-3">
                        {r.customer_name ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-right tabular-nums font-medium">
                        {Number(r.distance_km).toFixed(1)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatSpeed(r.distance_km, r.duration_seconds, r.average_speed_kmh)}
                      </td>
                      {/* Najvyššiu rýchlosť merajú len appka a Commander —
                          pri ručne zapísanej jazde tam nemá čo stáť. */}
                      <td className="p-3 text-right tabular-nums">
                        {r.max_speed_kmh ? `${Number(r.max_speed_kmh).toFixed(0)} km/h` : "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatDuration(r.duration_seconds)}
                      </td>
                      <td className="p-3">
                        {/* Charakter jazdy je štítok, účel je to, čo appka nevie
                            — za čím sa išlo. Kým sa účel vypĺňal zástupným
                            textom, stálo tu dvakrát to isté. */}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            jeSukromna(r.classification)
                              ? "bg-muted text-muted-foreground"
                              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {jeSukromna(r.classification) ? "Súkromná" : "Služobná"}
                        </span>
                        {ucelNaZobrazenie(r.purpose, r.classification) && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {ucelNaZobrazenie(r.purpose, r.classification)}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {sourceLabel(r.external_source)}
                      </td>
                      <td
                        className="p-3 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(r.route || koncoveBody(r)) && (
                          <button
                            onClick={() => otvorTrasu(r)}
                            title="Zobraziť trasu na mape"
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                          >
                            <MapIcon className="h-4 w-4" />
                          </button>
                        )}
                        <Link
                          to="/jazdy/nova"
                          search={{ id: r.id }}
                          title="Upraviť jazdu"
                          className="inline-block rounded p-1.5 text-muted-foreground hover:bg-muted"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => zmazJednu(r.id)}
                          title="Vymazať jazdu"
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

            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {rows.map((r) => (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate({ to: "/jazdy/nova", search: { id: r.id } })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate({ to: "/jazdy/nova", search: { id: r.id } });
                    }
                  }}
                  className="cursor-pointer rounded-xl border border-border bg-card p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Označiť jazdu z ${r.trip_date}`}
                        checked={!!vybrane[r.id]}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => prepniJazdu(r.id, e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {r.trip_date} · {vehicles[r.vehicle_id]?.name ?? "—"}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground truncate">
                          {r.start_location ?? "—"} → {r.end_location ?? "—"}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>Trvanie: {formatDuration(r.duration_seconds)}</span>
                          <span>
                            Ø {formatSpeed(r.distance_km, r.duration_seconds, r.average_speed_kmh)}
                          </span>
                          <span className="font-medium">
                            {jeSukromna(r.classification) ? "Súkromná" : "Služobná"}
                          </span>
                          {ucelNaZobrazenie(r.purpose, r.classification) && (
                            <span>{ucelNaZobrazenie(r.purpose, r.classification)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="text-sm font-bold tabular-nums">
                        {Number(r.distance_km).toFixed(1)} km
                      </div>
                      {(r.route || koncoveBody(r)) && (
                        <button
                          onClick={() => otvorTrasu(r)}
                          aria-label="Zobraziť trasu na mape"
                          className="mt-1 rounded p-1 text-muted-foreground"
                        >
                          <MapIcon className="h-4 w-4" />
                        </button>
                      )}
                      <Link
                        to="/jazdy/nova"
                        search={{ id: r.id }}
                        aria-label="Upraviť jazdu"
                        className="mt-1 inline-block rounded p-1 text-muted-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => zmazJednu(r.id)}
                        aria-label="Vymazať jazdu"
                        className="mt-1 rounded p-1 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
              <span>
                Zobrazených {rows.length}
                {spolu !== null && spolu > rows.length ? ` z ${spolu}` : ""} jázd
              </span>
              {spolu !== null && spolu > rows.length && (
                <button
                  onClick={() => setLimit((l) => l + DAVKA)}
                  disabled={loading}
                  className="rounded-md border border-border bg-card px-3 py-1.5 font-medium text-foreground hover:bg-secondary disabled:opacity-60"
                >
                  {loading
                    ? "Načítavam…"
                    : `Načítať ďalších ${Math.min(DAVKA, spolu - rows.length)}`}
                </button>
              )}
            </div>
          </>
        )}

        <ConfirmDialog
          open={potvrdenie}
          title={vybraneIds.length === 1 ? "Vymazať jazdu?" : `Vymazať ${vybraneIds.length} jázd?`}
          message="Jazdy sa z knihy odstránia natrvalo — kniha jázd nemá kôš."
          warning="Ak boli priradené k zákazke, jej náklady sa o ne znížia."
          confirmLabel="Vymazať"
          busy={mazem}
          onCancel={() => setPotvrdenie(false)}
          onConfirm={zmazVybrate}
        />

        <Dialog open={trasa !== null} onOpenChange={(o) => !o && setTrasa(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                Trasa jazdy
                {trasa ? ` — ${trasa.trip_date}, ${Number(trasa.distance_km).toFixed(1)} km` : ""}
              </DialogTitle>
            </DialogHeader>
            {trasa &&
              (trasa.route ? (
                <MapaTrasy route={trasa.route} vyska={420} />
              ) : navrhy[trasa.id] ? (
                <>
                  <MapaTrasy route={navrhy[trasa.id]} vyska={420} />
                  {/* Nech je to povedané rovno v mape: Commander posiela len
                      začiatok a koniec, cesta medzi nimi je dopočítaná. */}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Commander posiela iba začiatok a koniec jazdy. Nakreslená cesta medzi nimi je
                    návrh po cestách, nie skutočne prejdená trasa — kilometre v knihe ostávajú tie z
                    tachometra.
                  </p>
                </>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {navrhujem ? "Kreslím trasu…" : "Trasa nie je k dispozícii."}
                </div>
              ))}
          </DialogContent>
        </Dialog>
      </PageBody>
    </>
  );
}
