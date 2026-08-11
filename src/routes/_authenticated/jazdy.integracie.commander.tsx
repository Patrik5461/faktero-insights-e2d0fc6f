import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Satellite,
  Link2,
  RefreshCcw,
  Power,
  PlugZap,
  Save,
  TestTube2,
  AlertTriangle,
  KeyRound,
} from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { supabase } from "@/integrations/supabase/client";
import {
  getCommanderStatus,
  saveCommanderConnection,
  disconnectCommander,
  testCommander,
  syncCommanderVehicles,
  linkCommanderVehicle,
  syncCommanderRides,
} from "@/lib/faktero/commander.functions";

export const Route = createFileRoute("/_authenticated/jazdy/integracie/commander")({
  head: () => ({ meta: [{ title: "Commander GPS — Faktero" }] }),
  component: CommanderPage,
});

function fmt(ts?: string | null) {
  return ts ? new Date(ts).toLocaleString("sk-SK") : "—";
}

function CommanderPage() {
  const cid = getActiveCompanyId();
  const _get = useServerFn(getCommanderStatus);
  const _save = useServerFn(saveCommanderConnection);
  const _disc = useServerFn(disconnectCommander);
  const _test = useServerFn(testCommander);
  const _syncV = useServerFn(syncCommanderVehicles);
  const _link = useServerFn(linkCommanderVehicle);
  const _syncR = useServerFn(syncCommanderRides);

  const [state, setState] = useState<any>({
    connection: null,
    links: [],
    logs: [],
    credentials_invalid: false,
  });
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [autoSync, setAutoSync] = useState(false);

  const [preset, setPreset] = useState<"today" | "week" | "month" | "last30" | "custom">("last30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function load() {
    if (!cid) return;
    const res = await _get({ data: { companyId: cid } });
    setState(res);
    if (res.connection) {
      setEnabled(!!res.connection.enabled);
      setAutoSync(!!res.connection.auto_sync_daily);
    }
    const { data: v } = await supabase
      .from("vehicles")
      .select("id, name, license_plate")
      .eq("company_id", cid)
      .order("name");
    setVehicles(v ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function onSave() {
    if (!cid) return;
    if (!username.trim() || (!state.connection && !password.trim())) {
      toast.error("Zadajte používateľské meno a heslo.");
      return;
    }
    setBusy("save");
    try {
      await _save({
        data: {
          companyId: cid,
          username: username.trim(),
          password: password || undefined,
          enabled,
          auto_sync_daily: autoSync,
        },
      });
      setPassword("");
      setNeedsReauth(false);
      toast.success("Uložené");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Uloženie zlyhalo");
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    if (!cid) return;
    setBusy("test");
    try {
      const r: any = await _test({
        data: { companyId: cid, username: username || undefined, password: password || undefined },
      });
      if (r.needs_reauth) setNeedsReauth(true);
      if (r.ok) toast.success("Pripojenie funguje");
      else toast.error(r.error ?? "Test zlyhal");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Test zlyhal");
    } finally {
      setBusy(null);
    }
  }

  async function onDisconnect() {
    if (!cid) return;
    if (
      !confirm(
        "Naozaj odpojiť Commander?\n\nImportované jazdy zostanú zachované. Vozidlá, ktoré sem priniesla integrácia a nemajú žiadnu jazdu ani tankovanie, sa odstránia.",
      )
    )
      return;
    setBusy("disc");
    try {
      const r: any = await _disc({ data: { companyId: cid } });
      toast.success(
        r?.zmazaneVozidla ? `Odpojené — odstránených vozidiel: ${r.zmazaneVozidla}` : "Odpojené",
      );
      setUsername("");
      setPassword("");
      setNeedsReauth(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBusy(null);
    }
  }

  async function onSyncVehicles() {
    if (!cid) return;
    setBusy("syncV");
    try {
      const r: any = await _syncV({ data: { companyId: cid } });
      if (r.needs_reauth) setNeedsReauth(true);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error ?? "Chyba");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBusy(null);
    }
  }

  async function onLink(linkId: string, faktero_vehicle_id: string | null) {
    if (!cid) return;
    try {
      await _link({ data: { companyId: cid, linkId, faktero_vehicle_id } });
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }

  async function onSyncRides() {
    if (!cid) return;
    if (preset === "custom" && (!from || !to)) {
      toast.error("Zadajte rozsah dátumov.");
      return;
    }
    setBusy("syncR");
    try {
      const r: any = await _syncR({
        data: { companyId: cid, preset, from: from || undefined, to: to || undefined },
      });
      if (r.needs_reauth) setNeedsReauth(true);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error ?? "Chyba");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBusy(null);
    }
  }

  async function onForceReimport() {
    if (!cid) return;
    if (preset === "custom" && (!from || !to)) {
      toast.error("Zadajte rozsah dátumov.");
      return;
    }
    if (
      !confirm(
        "Znovu skontrolovať všetky jazdy a importovať tie, ktoré ešte nie sú v knihe jázd? Skutočné duplicity (podľa external_id) sa preskočia.",
      )
    )
      return;
    setBusy("forceR");
    try {
      const r: any = await _syncR({
        data: { companyId: cid, preset, from: from || undefined, to: to || undefined, force: true },
      });
      if (r.needs_reauth) setNeedsReauth(true);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error ?? "Chyba");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBusy(null);
    }
  }

  const conn = state.connection;

  return (
    <>
      <PageHeader
        title="Commander GPS"
        description="Automatický import jázd z Commander GPS."
        action={
          <Link
            to="/jazdy/integracie"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        {(state.credentials_invalid || conn?.credentials_invalid || needsReauth) && (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <div className="font-medium text-amber-900 dark:text-amber-200">
                  Prihlasovacie údaje Commander GPS je potrebné znova zadať
                </div>
                <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">
                  Toto sa stáva po zmene bezpečnostného kľúča systému. Zadajte prosím váš Commander
                  username a heslo znova.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("commander-username");
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    (el as HTMLInputElement | null)?.focus();
                  }}
                  className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  <KeyRound className="h-4 w-4" /> Zadať credentials znova
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Connection card */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Satellite className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium">Pripojenie</div>
                  <div className="text-xs text-muted-foreground">
                    Údaje sú uložené šifrovane a používané iba na serveri.
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor="commander-username">
                    Commander username
                  </label>
                  <input
                    id="commander-username"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={username}
                    placeholder={conn?.username_masked ?? ""}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Commander password</label>
                  <input
                    type="password"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={password}
                    placeholder={conn ? "•••••••• (nezadávajte pre zachovanie)" : ""}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  Integrácia aktívna
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => setAutoSync(e.target.checked)}
                  />
                  Automaticky synchronizovať jazdy denne
                </label>
              </div>

              {conn && (
                <div
                  className={`mt-3 rounded-md border p-3 text-xs ${conn.auto_sync_daily ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border bg-muted text-muted-foreground"}`}
                >
                  {conn.auto_sync_daily
                    ? "Automatická synchronizácia je aktívna. Jazdy sa importujú denne v noci (cca 03:00)."
                    : "Automatická synchronizácia je vypnutá."}
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  disabled={!!busy}
                  onClick={onTest}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                >
                  <TestTube2 className="h-4 w-4" /> Otestovať pripojenie
                </button>
                <button
                  disabled={!!busy}
                  onClick={onSave}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> Uložiť
                </button>
                {conn && (
                  <button
                    disabled={!!busy}
                    onClick={onDisconnect}
                    className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-background px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Power className="h-4 w-4" /> Odpojiť
                  </button>
                )}
              </div>
            </div>

            {/* Vehicle links */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">Prepojené vozidlá</div>
                  <div className="text-xs text-muted-foreground">
                    {state.links.length === 0
                      ? "Žiadne vozidlá ešte neboli synchronizované."
                      : `${state.links.length} vozidiel z Commandera.`}
                  </div>
                </div>
                <button
                  disabled={!conn || !!busy}
                  onClick={onSyncVehicles}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                >
                  <RefreshCcw className="h-4 w-4" /> Synchronizovať vozidlá
                </button>
              </div>
              {state.links.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Commander vozidlo</th>
                        <th className="py-2 pr-3">EČV</th>
                        <th className="py-2 pr-3">Faktero vozidlo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.links.map((l: any) => (
                        <tr key={l.id} className="border-t border-border">
                          <td className="py-2 pr-3">
                            {l.commander_vehicle_name ?? l.commander_vehicle_id}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {l.commander_license_plate ?? "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <select
                              className="w-full max-w-xs rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                              value={l.faktero_vehicle_id ?? ""}
                              onChange={(e) => onLink(l.id, e.target.value || null)}
                            >
                              <option value="">— neprepojené —</option>
                              {vehicles.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                  {v.license_plate ? ` (${v.license_plate})` : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Rides sync */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 font-medium">Importovať jazdy</div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Obdobie</label>
                  <select
                    value={preset}
                    onChange={(e) => setPreset(e.target.value as any)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="today">Dnes</option>
                    <option value="week">Tento týždeň</option>
                    <option value="month">Tento mesiac</option>
                    <option value="last30">Posledných 30 dní</option>
                    <option value="custom">Vlastný rozsah</option>
                  </select>
                </div>
                {preset === "custom" && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Od</label>
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Do</label>
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </>
                )}
                <button
                  disabled={!conn || !!busy}
                  onClick={onSyncRides}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <PlugZap className="h-4 w-4" /> Synchronizovať jazdy
                </button>
                <button
                  disabled={!conn || !!busy}
                  onClick={onForceReimport}
                  title="Pre adminov: znovu skontroluje preskočené jazdy a importuje tie, ktoré ešte nie sú v knihe jázd."
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                >
                  <RefreshCcw className="h-4 w-4" /> Znovu importovať preskočené
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar: status + logs */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 font-medium">Stav</div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Pripojenie</dt>
                  <dd>{conn ? (conn.enabled ? "Aktívne" : "Vypnuté") : "Nepripojené"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Používateľ</dt>
                  <dd className="font-mono">{conn?.username_masked ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Posledná sync.</dt>
                  <dd>{fmt(conn?.last_sync_at)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{conn?.sync_status ?? "—"}</dd>
                </div>
                {conn?.error_message && (
                  <div>
                    <dt className="text-muted-foreground">Posledná chyba</dt>
                    <dd className="mt-1 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                      {conn.error_message}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 font-medium">
                <Link2 className="h-4 w-4" /> História synchronizácií
              </div>
              {state.logs.length === 0 ? (
                <div className="text-sm text-muted-foreground">Žiadne záznamy.</div>
              ) : (
                <ul className="space-y-2 text-xs">
                  {state.logs.map((l: any) => (
                    <li key={l.id} className="rounded-md border border-border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{l.sync_type}</span>
                        <span
                          className={l.status === "ok" ? "text-emerald-600" : "text-destructive"}
                        >
                          {l.status}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground">{fmt(l.created_at)}</div>
                      {l.message && <div className="mt-1">{l.message}</div>}
                      {(l.sync_type === "rides" || l.sync_type === "daily") && l.raw_response && (
                        <div className="mt-2 space-y-2 text-[11px] text-muted-foreground">
                          <div className="grid grid-cols-2 gap-1">
                            <div>
                              Načítané:{" "}
                              <span className="text-foreground font-medium">
                                {l.raw_response.fetched_rides_count ?? 0}
                              </span>
                            </div>
                            <div>
                              Kandidáti:{" "}
                              <span className="text-foreground font-medium">
                                {l.raw_response.candidate_rides_count ??
                                  l.raw_response.mapped_rides_count ??
                                  0}
                              </span>
                            </div>
                            <div>
                              Imported:{" "}
                              <span className="text-foreground font-medium">
                                {l.raw_response.inserted_trips_count ?? 0}
                              </span>
                            </div>
                            <div>
                              Duplicate:{" "}
                              <span className="text-foreground font-medium">
                                {l.raw_response.skipped_duplicates ??
                                  (l.raw_response.duplicate_external_id ?? 0) +
                                    (l.raw_response.duplicate_fallback_match ?? 0)}
                              </span>
                            </div>
                            <div>
                              Vehicle not linked:{" "}
                              <span className="text-foreground font-medium">
                                {l.raw_response.skipped_unlinked_vehicle ?? 0}
                              </span>
                            </div>
                            <div>
                              Validation error:{" "}
                              <span className="text-foreground font-medium">
                                {l.raw_response.validation_errors ?? 0}
                              </span>
                            </div>
                            <div>
                              Insert error:{" "}
                              <span className="text-foreground font-medium">
                                {l.raw_response.insert_errors ?? 0}
                              </span>
                            </div>
                            <div>
                              Missing mapping:{" "}
                              <span className="text-foreground font-medium">
                                {l.raw_response.missing_vehicle_mapping ?? 0}
                              </span>
                            </div>
                          </div>
                          {Array.isArray(l.raw_response.skipped_rides) &&
                            l.raw_response.skipped_rides.length > 0 && (
                              <div className="max-h-56 overflow-auto rounded border border-border bg-muted/40 p-2">
                                <div className="mb-1 font-medium text-foreground">
                                  Dôvody preskočenia ({l.raw_response.skipped_rides.length})
                                </div>
                                <div className="space-y-1 font-mono text-[10px]">
                                  {l.raw_response.skipped_rides.map((ride: any, idx: number) => (
                                    <div
                                      key={`${ride.external_id ?? "ride"}-${idx}`}
                                      className="border-t border-border pt-1 first:border-t-0 first:pt-0"
                                    >
                                      <span className="text-foreground">{ride.reason}</span>
                                      {ride.external_id ? (
                                        <span> · ride {ride.external_id}</span>
                                      ) : null}
                                      {ride.commander_vehicle_id ? (
                                        <span> · vehicle {ride.commander_vehicle_id}</span>
                                      ) : null}
                                      {ride.detail ? (
                                        <div className="whitespace-pre-wrap">{ride.detail}</div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          {Array.isArray(l.raw_response.sample_rides) &&
                            l.raw_response.sample_rides.length > 0 && (
                              <div className="max-h-56 overflow-auto rounded border border-border bg-muted/40 p-2">
                                <div className="mb-1 font-medium text-foreground">
                                  Vzorka jázd ({l.raw_response.sample_rides.length}) — surové vs.
                                  parsované dátumy
                                </div>
                                <div className="space-y-1 font-mono text-[10px]">
                                  {l.raw_response.sample_rides.map((s: any, idx: number) => (
                                    <div
                                      key={`${s.ride_id ?? "s"}-${idx}`}
                                      className="border-t border-border pt-1 first:border-t-0 first:pt-0"
                                    >
                                      <div>
                                        ride {s.ride_id ?? "—"} · vehicle {s.vehicle_id ?? "—"} ·
                                        typ {s.datetimeStart_type}
                                      </div>
                                      {Array.isArray(s.keys) && (
                                        <div>keys: [{s.keys.join(", ")}]</div>
                                      )}
                                      <div>
                                        start raw: {JSON.stringify(s.datetimeStart_raw)} →{" "}
                                        {s.datetimeStart_parsed ?? "null"}
                                      </div>
                                      <div>
                                        end&nbsp;&nbsp; raw: {JSON.stringify(s.datetimeEnd_raw)} →{" "}
                                        {s.datetimeEnd_parsed ?? "null"}
                                      </div>
                                      <div>
                                        distance: {s.distance ?? "null"} · start_loc:{" "}
                                        {s.start_location ?? "null"} · end_loc:{" "}
                                        {s.end_location ?? "null"}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          {Array.isArray(l.raw_response.raw_ride_sample_full) &&
                            l.raw_response.raw_ride_sample_full.length > 0 && (
                              <div className="max-h-72 overflow-auto rounded border border-border bg-muted/40 p-2">
                                <div className="mb-1 font-medium text-foreground">
                                  Surová Commander odpoveď (
                                  {l.raw_response.raw_ride_sample_full.length} jázd)
                                </div>
                                <pre className="whitespace-pre-wrap break-all font-mono text-[10px]">
                                  {JSON.stringify(l.raw_response.raw_ride_sample_full, null, 2)}
                                </pre>
                              </div>
                            )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}
