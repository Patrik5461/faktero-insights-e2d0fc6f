import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Car, RefreshCcw, Power, PlugZap, Link2, AlertTriangle, FileText, ExternalLink } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { supabase } from "@/integrations/supabase/client";
import {
  getTeslaStatus, startTeslaOAuth, disconnectTesla,
  syncTeslaVehicles, linkTeslaVehicle, syncTeslaSnapshots,
} from "@/lib/faktero/tesla.functions";

export const Route = createFileRoute("/_authenticated/jazdy/integracie/tesla")({
  head: () => ({ meta: [{ title: "Tesla Fleet API — Faktero" }] }),
  component: TeslaPage,
});

function fmt(ts?: string | null) { return ts ? new Date(ts).toLocaleString("sk-SK") : "—"; }

function TeslaPage() {
  const cid = getActiveCompanyId();
  const _get = useServerFn(getTeslaStatus);
  const _start = useServerFn(startTeslaOAuth);
  const _disc = useServerFn(disconnectTesla);
  const _syncV = useServerFn(syncTeslaVehicles);
  const _link = useServerFn(linkTeslaVehicle);
  const _syncSnap = useServerFn(syncTeslaSnapshots);

  const [state, setState] = useState<any>({ connection: null, links: [], logs: [], snapshots: [] });
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    if (!cid) return;
    const res = await _get({ data: { companyId: cid } });
    setState(res);
    const { data: v } = await supabase.from("vehicles").select("id, name, license_plate").eq("company_id", cid).order("name");
    setVehicles(v ?? []);
  }
  useEffect(() => {
    load();
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("connected")) toast.success("Tesla účet pripojený.");
    if (sp.get("error")) toast.error("OAuth chyba: " + sp.get("error"));
    if (sp.get("connected") || sp.get("error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function onConnect() {
    if (!cid) return;
    setBusy("connect");
    try {
      const r = await _start({ data: { companyId: cid } });
      window.location.href = r.url;
    } catch (e: any) { toast.error(e?.message ?? "Chyba"); setBusy(null); }
  }

  async function onDisconnect() {
    if (!cid) return;
    if (!confirm("Naozaj odpojiť Tesla účet? Importované dáta zostanú zachované.")) return;
    setBusy("disc");
    try { await _disc({ data: { companyId: cid } }); toast.success("Odpojené"); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Chyba"); }
    finally { setBusy(null); }
  }

  async function onSyncVehicles() {
    if (!cid) return;
    setBusy("syncV");
    try { const r = await _syncV({ data: { companyId: cid } }); r.ok ? toast.success(r.message) : toast.error(r.error ?? "Chyba"); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Chyba"); }
    finally { setBusy(null); }
  }

  async function onLink(linkId: string, faktero_vehicle_id: string | null) {
    if (!cid) return;
    try { await _link({ data: { companyId: cid, linkId, faktero_vehicle_id } }); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Chyba"); }
  }

  async function onSyncSnap() {
    if (!cid) return;
    setBusy("snap");
    try { const r = await _syncSnap({ data: { companyId: cid } }); r.ok ? toast.success(r.message) : toast.error(r.error ?? "Chyba"); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Chyba"); }
    finally { setBusy(null); }
  }

  const conn = state.connection;
  const isConnected = !!conn?.email_masked;

  // Group latest snapshot per vehicle
  const latestByVehicle = new Map<string, any>();
  (state.snapshots ?? []).forEach((s: any) => {
    if (!latestByVehicle.has(s.tesla_vehicle_id)) latestByVehicle.set(s.tesla_vehicle_id, s);
  });

  return (
    <>
      <PageHeader
        title="Tesla Fleet API"
        description="Synchronizácia Tesla vozidiel, polohy a stavu tachometra."
        action={
          <Link to="/jazdy/integracie" className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted">
            <ArrowLeft className="h-4 w-4" /> Späť
          </Link>
        }
      />
      <PageBody>
        {(state.credentials_invalid || conn?.credentials_invalid) && (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <div className="font-medium text-amber-900 dark:text-amber-200">
                  Tesla účet je potrebné znova pripojiť
                </div>
                <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">
                  Uložené prístupové tokeny sa nedajú dešifrovať. Toto sa stáva po zmene bezpečnostného kľúča systému. Pripojte prosím Tesla účet znovu cez OAuth.
                </p>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={onConnect}
                  className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  <PlugZap className="h-4 w-4" /> Znova pripojiť Tesla účet
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {/* Connection */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><Car className="h-5 w-5" /></div>
                <div>
                  <div className="font-medium">Pripojenie Tesla účtu</div>
                  <div className="text-xs text-muted-foreground">OAuth 2.0 — tokeny sú uložené šifrovane na serveri.</div>
                </div>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">Tesla účet:</span> <span className="font-mono">{conn?.email_masked ?? "—"}</span></div>
                <div><span className="text-muted-foreground">Token platnosť:</span> {fmt(conn?.token_expires_at)}</div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {!isConnected ? (
                  <button disabled={!!busy} onClick={onConnect} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    <PlugZap className="h-4 w-4" /> Pripojiť Tesla účet
                  </button>
                ) : (
                  <button disabled={!!busy} onClick={onDisconnect} className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-background px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50">
                    <Power className="h-4 w-4" /> Odpojiť
                  </button>
                )}
              </div>
            </div>

            {/* Terms card */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-900 dark:text-emerald-200">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-emerald-500/15 p-1.5 text-emerald-700 dark:text-emerald-300">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">Podmienky používania Tesla Fleet API</div>
                  <p className="mt-1 text-emerald-800/90 dark:text-emerald-100/80">
                    Pripojením Tesla účtu súhlasíte so spracúvaním údajov o vozidle (VIN, tachometer, poloha) v
                    rozsahu uvedenom v našich podmienkach. Faktero používa výhradne čítacie oprávnenia — žiadne
                    príkazy do vozidla.
                  </p>
                  <Link
                    to="/pravne/tesla-podmienky"
                    target="_blank"
                    className="mt-3 inline-flex items-center gap-1.5 font-medium underline hover:text-emerald-700"
                  >
                    Zobraziť podmienky <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Notice */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-900 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  Tesla Fleet API neposkytuje hotový zoznam jázd ako Commander. Faktero vie synchronizovať vozidlá,
                  stav tachometra a polohu. Automatická tvorba jázd bude fungovať na základe pravidelných odometrových
                  a polohových záznamov.
                </div>
              </div>
            </div>

            {/* Vehicle links */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">Tesla vozidlá</div>
                  <div className="text-xs text-muted-foreground">
                    {state.links.length === 0 ? "Žiadne vozidlá ešte neboli synchronizované." : `${state.links.length} vozidiel z Tesla účtu.`}
                  </div>
                </div>
                <button disabled={!isConnected || !!busy} onClick={onSyncVehicles} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">
                  <RefreshCcw className="h-4 w-4" /> Synchronizovať vozidlá
                </button>
              </div>
              {state.links.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr><th className="py-2 pr-3">Tesla vozidlo</th><th className="py-2 pr-3">VIN</th><th className="py-2 pr-3">Faktero vozidlo</th></tr>
                    </thead>
                    <tbody>
                      {state.links.map((l: any) => (
                        <tr key={l.id} className="border-t border-border">
                          <td className="py-2 pr-3">{l.tesla_display_name ?? l.tesla_vehicle_id}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{l.tesla_vin ?? "—"}</td>
                          <td className="py-2 pr-3">
                            <select
                              className="w-full max-w-xs rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                              value={l.faktero_vehicle_id ?? ""}
                              onChange={(e) => onLink(l.id, e.target.value || null)}
                            >
                              <option value="">— neprepojené —</option>
                              {vehicles.map((v) => (
                                <option key={v.id} value={v.id}>{v.name}{v.license_plate ? ` (${v.license_plate})` : ""}</option>
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

            {/* Tesla data section */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-medium">Tesla dáta</div>
                <button disabled={!isConnected || !!busy || state.links.length === 0} onClick={onSyncSnap} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  <PlugZap className="h-4 w-4" /> Synchronizovať jazdy
                </button>
              </div>
              {state.links.length === 0 ? (
                <div className="text-sm text-muted-foreground">Najprv synchronizujte vozidlá.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Vozidlo</th>
                        <th className="py-2 pr-3">Tachometer</th>
                        <th className="py-2 pr-3">Poloha</th>
                        <th className="py-2 pr-3">Posledná sync.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.links.map((l: any) => {
                        const s = latestByVehicle.get(l.tesla_vehicle_id);
                        return (
                          <tr key={l.id} className="border-t border-border">
                            <td className="py-2 pr-3">{l.tesla_display_name ?? l.tesla_vehicle_id}</td>
                            <td className="py-2 pr-3">{s?.odometer_km != null ? `${s.odometer_km.toLocaleString("sk-SK")} km` : "—"}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{s?.latitude != null && s?.longitude != null ? `${Number(s.latitude).toFixed(4)}, ${Number(s.longitude).toFixed(4)}` : "—"}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">{fmt(s?.captured_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 font-medium">Stav</div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Pripojenie</dt><dd>{isConnected ? (conn.enabled ? "Aktívne" : "Vypnuté") : "Nepripojené"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Tesla účet</dt><dd className="font-mono text-xs">{conn?.email_masked ?? "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Posledná sync.</dt><dd>{fmt(conn?.last_sync_at)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Status</dt><dd>{conn?.sync_status ?? "—"}</dd></div>
                {conn?.error_message && (<div><dt className="text-muted-foreground">Posledná chyba</dt><dd className="mt-1 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{conn.error_message}</dd></div>)}
              </dl>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 font-medium"><Link2 className="h-4 w-4" /> História synchronizácií</div>
              {state.logs.length === 0 ? (
                <div className="text-sm text-muted-foreground">Žiadne záznamy.</div>
              ) : (
                <ul className="space-y-2 text-xs">
                  {state.logs.map((l: any) => (
                    <li key={l.id} className="rounded-md border border-border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{l.sync_type}</span>
                        <span className={l.status === "ok" ? "text-emerald-600" : "text-destructive"}>{l.status}</span>
                      </div>
                      <div className="mt-1 text-muted-foreground">{fmt(l.created_at)}</div>
                      {l.message && <div className="mt-1">{l.message}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
              <div className="mb-1 font-medium text-foreground">Commander vs Tesla</div>
              <p className="mb-2"><strong>Commander:</strong> poskytuje hotové jazdy — importujú sa priamo do knihy jázd.</p>
              <p><strong>Tesla:</strong> poskytuje stav vozidla, tachometer a polohu. Vytváranie jázd vyžaduje snímky/telemetriu. V1 sa zameriavame na synchronizáciu vozidiel a snímky tachometra/polohy.</p>
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}