import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  Link2,
  Plus,
  Power,
  RefreshCcw,
  Save,
  Satellite,
  TestTube2,
  AlertTriangle,
} from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  gpsStav,
  gpsTest,
  gpsUloz,
  gpsNastav,
  gpsOdpoj,
  gpsSynchronizuj,
  gpsSparuj,
  gpsZalozVozidlo,
} from "@/lib/faktero/gps.functions";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/jazdy/integracie/$poskytovatel")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Integrácie — Kniha jázd — Faktero") }],
  }),
  component: GpsIntegraciaPage,
});

type Pole = {
  kluc: string;
  nazov: string;
  typ: "text" | "heslo" | "url";
  povinne: boolean;
  pomoc?: string;
};
type Stav = Awaited<ReturnType<typeof gpsStav>>;
type PripojenieUI = Stav["pripojenia"][number];

function fmt(ts?: string | null) {
  return ts ? new Date(ts).toLocaleString("sk-SK") : "—";
}

const STAVY: Record<string, string> = {
  nove: "Čaká na prvú synchronizáciu",
  ok: "V poriadku",
  chyba: "Chyba",
  limit: "Dosiahnutý limit volaní",
  prebieha: "Prebieha",
  ciastocne: "Čiastočne",
};

const DRUHY_LOGU: Record<string, string> = {
  rucne: "Ručne",
  noc: "Automaticky",
  test: "Test pripojenia",
  vozidla: "Vozidlá",
};

function GpsIntegraciaPage() {
  const { t } = useT();
  const { poskytovatel } = Route.useParams();
  const cid = getActiveCompanyId();
  const _stav = useServerFn(gpsStav);
  const _test = useServerFn(gpsTest);
  const _uloz = useServerFn(gpsUloz);
  const _nastav = useServerFn(gpsNastav);
  const _odpoj = useServerFn(gpsOdpoj);
  const _sync = useServerFn(gpsSynchronizuj);
  const _sparuj = useServerFn(gpsSparuj);
  const _zaloz = useServerFn(gpsZalozVozidlo);

  const [stav, setStav] = useState<Stav | null>(null);
  const [chybaNacitania, setChybaNacitania] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Formulár: null = zatvorený, "" = nové pripojenie, id = úprava existujúceho
  const [formular, setFormular] = useState<string | null>(null);

  const nacitaj = useCallback(async () => {
    if (!cid) return;
    try {
      const s = await _stav({ data: { companyId: cid, poskytovatel } });
      setStav(s);
      setChybaNacitania(null);
      if (!s.pripojenia.length) setFormular((f) => f ?? "");
    } catch (e: any) {
      setChybaNacitania(e?.message ?? t("Chyba"));
    }
  }, [cid, poskytovatel]);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  async function synchronizuj(id: string) {
    if (!cid) return;
    setBusy("sync:" + id);
    try {
      const r: any = await _sync({ data: { companyId: cid, pripojenieId: id } });
      if (r?.chyba) toast.error(r.chyba);
      else if (r?.neuplne)
        toast.info(
          t(
            "Stiahnutá časť: {n} nových jázd. Zvyšok dokončí ďalšie spustenie alebo nočná synchronizácia.",
            {
              n: r.importovane,
            },
          ),
        );
      else toast.success(t("Synchronizované — nových jázd: {n}", { n: r?.importovane ?? 0 }));
      if (r?.nesparovane)
        toast.warning(
          t("{n} vozidiel nie je spárovaných — ich jazdy sa nesťahujú.", { n: r.nesparovane }),
        );
      await nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBusy(null);
    }
  }

  async function odpoj(id: string) {
    if (!cid) return;
    if (
      !(await potvrd(
        t("Naozaj odpojiť tento účet?\n\nImportované jazdy a tankovania zostanú v knihe jázd."),
      ))
    )
      return;
    setBusy("odpoj:" + id);
    try {
      await _odpoj({ data: { companyId: cid, pripojenieId: id } });
      toast.success(t("Odpojené"));
      await nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBusy(null);
    }
  }

  async function nastav(id: string, patch: { aktivne?: boolean; auto_sync?: boolean }) {
    if (!cid) return;
    try {
      await _nastav({ data: { companyId: cid, pripojenieId: id, ...patch } });
      await nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    }
  }

  async function sparuj(vazbaId: string, vehicleId: string | null) {
    if (!cid) return;
    try {
      await _sparuj({ data: { companyId: cid, vazbaId, vehicleId } });
      toast.success(vehicleId ? t("Vozidlo spárované") : t("Párovanie zrušené"));
      await nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    }
  }

  async function zaloz(vazbaId: string) {
    if (!cid) return;
    setBusy("zaloz:" + vazbaId);
    try {
      await _zaloz({ data: { companyId: cid, vazbaId } });
      toast.success(t("Vozidlo založené a spárované"));
      await nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBusy(null);
    }
  }

  const a = stav?.poskytovatel;

  return (
    <>
      <PageHeader
        title={a?.nazov ?? t("Integrácia")}
        description={t("Automatický import jázd z GPS systému do knihy jázd.")}
        action={
          <Link
            to="/jazdy/integracie"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" /> {t("Integrácie")}
          </Link>
        }
      />
      <PageBody>
        {chybaNacitania && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {chybaNacitania}
          </div>
        )}
        {!stav && !chybaNacitania && (
          <div className="text-sm text-muted-foreground">{t("Načítavam…")}</div>
        )}
        {stav && a && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm">
              <Satellite className="h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                {t(
                  "Jazdy sa sťahujú každú noc a po pripojení za posledných 30 dní. Sťahujú sa len pre spárované vozidlá.",
                )}
                {a.vieTankovania && " " + t("Sťahujú sa aj tankovania.")}
                {a.vieZapis &&
                  " " + t("Zmena súkromná/služobná v knihe jázd sa zapíše späť do GPS systému.")}
              </div>
              <a
                href={a.web}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {t("Web poskytovateľa")} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            {stav.pripojenia.map((p: PripojenieUI) => (
              <PripojenieKarta
                key={p.id}
                p={p}
                stav={stav}
                busy={busy}
                onUprav={() => setFormular(p.id)}
                onSync={() => synchronizuj(p.id)}
                onOdpoj={() => odpoj(p.id)}
                onNastav={(patch) => nastav(p.id, patch)}
                onSparuj={sparuj}
                onZaloz={zaloz}
                formular={
                  formular === p.id ? (
                    <Formular
                      polia={a.polia as Pole[]}
                      poskytovatel={a.id}
                      pripojenie={p}
                      onZavri={() => setFormular(null)}
                      onUlozene={async () => {
                        setFormular(null);
                        await nacitaj();
                      }}
                      test={_test}
                      uloz={_uloz}
                    />
                  ) : null
                }
              />
            ))}

            {formular === "" ? (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 font-medium">
                  {stav.pripojenia.length ? t("Ďalší účet") : t("Pripojiť účet")}
                </div>
                {!stav.spravca ? (
                  <div className="text-sm text-muted-foreground">
                    {t("Pripojiť účet môže len majiteľ alebo admin firmy.")}
                  </div>
                ) : (
                  <Formular
                    polia={a.polia as Pole[]}
                    poskytovatel={a.id}
                    pripojenie={null}
                    onZavri={stav.pripojenia.length ? () => setFormular(null) : undefined}
                    onUlozene={async (id) => {
                      setFormular(null);
                      await nacitaj();
                      if (id) await synchronizuj(id);
                    }}
                    test={_test}
                    uloz={_uloz}
                  />
                )}
              </div>
            ) : (
              stav.spravca && (
                <button
                  onClick={() => setFormular("")}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                >
                  <Plus className="h-4 w-4" /> {t("Pridať ďalší účet")}
                </button>
              )
            )}

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 font-medium">
                <Link2 className="h-4 w-4" /> {t("História synchronizácií")}
              </div>
              {stav.logy.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t("Žiadne záznamy.")}</div>
              ) : (
                <ul className="space-y-2 text-xs">
                  {stav.logy.map((l: any) => (
                    <li key={l.id} className="rounded-md border border-border p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{t(DRUHY_LOGU[l.druh] ?? l.druh)}</span>
                        <span
                          className={
                            l.stav === "ok"
                              ? "text-emerald-700"
                              : l.stav === "ciastocne"
                                ? "text-amber-700"
                                : "text-destructive"
                          }
                        >
                          {t(STAVY[l.stav] ?? l.stav)}
                        </span>
                      </div>
                      <div className="mt-1 break-words text-muted-foreground">{l.sprava}</div>
                      <div className="mt-1 text-muted-foreground">{fmt(l.created_at)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

function PripojenieKarta(props: {
  p: PripojenieUI;
  stav: Stav;
  busy: string | null;
  formular: React.ReactNode;
  onUprav: () => void;
  onSync: () => void;
  onOdpoj: () => void;
  onNastav: (patch: { aktivne?: boolean; auto_sync?: boolean }) => void;
  onSparuj: (vazbaId: string, vehicleId: string | null) => void;
  onZaloz: (vazbaId: string) => void;
}) {
  const { t } = useT();
  const { p, stav, busy } = props;
  const vazby = stav.vazby.filter((v: any) => v.pripojenie_id === p.id);
  const verejne = (p.prihlasenie_verejne ?? {}) as Record<string, string>;
  const popis =
    p.nazov ||
    Object.values(verejne).find(Boolean) ||
    t("Účet {n}", { n: stav.pripojenia.indexOf(p) + 1 });

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words font-medium">{popis}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t(STAVY[p.stav] ?? p.stav)} · {t("Posledná synchronizácia")}: {fmt(p.posledna_sync_at)}
            {p.neuplne && p.posledna_sync_at ? " · " + t("nedokončená") : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={!!busy || !p.aktivne || p.prihlasenieNeplatne}
            onClick={props.onSync}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${busy === "sync:" + p.id ? "animate-spin" : ""}`} />
            {t("Synchronizovať teraz")}
          </button>
          {stav.spravca && (
            <>
              <button
                disabled={!!busy}
                onClick={props.onUprav}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {t("Prihlasovacie údaje")}
              </button>
              <button
                disabled={!!busy}
                onClick={props.onOdpoj}
                className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-background px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Power className="h-4 w-4" /> {t("Odpojiť")}
              </button>
            </>
          )}
        </div>
      </div>

      {p.prihlasenieNeplatne && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("Prihlasovacie údaje treba zadať znova (zmenil sa bezpečnostný kľúč systému).")}
        </div>
      )}
      {p.posledna_chyba && (
        <div className="mt-3 break-words rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {p.posledna_chyba}
        </div>
      )}

      {stav.spravca && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={p.aktivne}
              onChange={(e) => props.onNastav({ aktivne: e.target.checked })}
            />
            {t("Aktívne")}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={p.auto_sync}
              onChange={(e) => props.onNastav({ auto_sync: e.target.checked })}
            />
            {t("Sťahovať jazdy automaticky každú noc")}
          </label>
        </div>
      )}

      {props.formular && <div className="mt-4 border-t border-border pt-4">{props.formular}</div>}

      <div className="mt-4 border-t border-border pt-4">
        <div className="mb-2 text-sm font-medium">{t("Vozidlá")}</div>
        {vazby.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t("Zatiaľ žiadne vozidlá. Spustite synchronizáciu.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">{t("Vozidlo v GPS")}</th>
                  <th className="py-2 pr-3">{t("EČV")}</th>
                  <th className="py-2 pr-3">{t("Vozidlo v knihe jázd")}</th>
                  <th className="py-2 pr-3">{t("Jazdy stiahnuté do")}</th>
                </tr>
              </thead>
              <tbody>
                {vazby.map((v: any) => (
                  <tr key={v.id} className="border-t border-border">
                    <td className="py-2 pr-3">{v.nazov ?? v.externe_id}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{v.spz ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={t("Vozidlo v knihe jázd")}
                          className="w-full min-w-0 max-w-xs rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                          value={v.vehicle_id ?? ""}
                          onChange={(e) => props.onSparuj(v.id, e.target.value || null)}
                        >
                          <option value="">{t("— nespárované —")}</option>
                          {stav.vozidla.map((a: any) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                              {a.license_plate ? ` (${a.license_plate})` : ""}
                            </option>
                          ))}
                        </select>
                        {!v.vehicle_id && (
                          <button
                            disabled={!!busy}
                            onClick={() => props.onZaloz(v.id)}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                          >
                            <Plus className="h-3.5 w-3.5" /> {t("Založiť vozidlo")}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{fmt(v.jazdy_do)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Formular(props: {
  polia: Pole[];
  poskytovatel: string;
  pripojenie: PripojenieUI | null;
  onZavri?: () => void;
  onUlozene: (id: string | null) => void | Promise<void>;
  test: (o: { data: any }) => Promise<any>;
  uloz: (o: { data: any }) => Promise<any>;
}) {
  const { t } = useT();
  const cid = getActiveCompanyId();
  const pr = props.pripojenie;
  const verejne = (pr?.prihlasenie_verejne ?? {}) as Record<string, string>;
  const [hodnoty, setHodnoty] = useState<Record<string, string>>(() => ({ ...verejne }));
  const [nazov, setNazov] = useState(pr?.nazov ?? "");
  const [busy, setBusy] = useState<"test" | "uloz" | null>(null);
  const [vysledok, setVysledok] = useState<{ ok: boolean; text: string } | null>(null);

  const ulozeneTajne = new Set(pr?.ulozeneTajne ?? []);

  function data() {
    return {
      companyId: cid,
      poskytovatel: props.poskytovatel,
      pripojenieId: pr?.id,
      nazov,
      hodnoty,
    };
  }

  async function test() {
    if (!cid) return;
    setBusy("test");
    setVysledok(null);
    try {
      const r = await props.test({ data: data() });
      setVysledok(
        r.ok ? { ok: true, text: t("Pripojenie funguje.") } : { ok: false, text: r.chyba },
      );
    } catch (e: any) {
      setVysledok({ ok: false, text: e?.message ?? t("Chyba") });
    } finally {
      setBusy(null);
    }
  }

  async function uloz() {
    if (!cid) return;
    setBusy("uloz");
    setVysledok(null);
    try {
      const r = await props.uloz({ data: data() });
      if (!r.ok) {
        setVysledok({ ok: false, text: r.chyba });
        return;
      }
      toast.success(t("Uložené — nájdených vozidiel: {n}", { n: r.vozidla ?? 0 }));
      if (r.vozidlaChyba) toast.error(r.vozidlaChyba);
      await props.onUlozene(pr ? null : r.id);
    } catch (e: any) {
      setVysledok({ ok: false, text: e?.message ?? t("Chyba") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {props.polia.map((p) => {
          const id = `gps-${p.kluc}`;
          const ulozene = p.typ === "heslo" && ulozeneTajne.has(p.kluc);
          return (
            <div key={p.kluc} className="min-w-0">
              <label htmlFor={id} className="mb-1 block text-xs font-medium">
                {t(p.nazov)}
                {p.povinne && <span className="text-destructive"> *</span>}
              </label>
              <input
                id={id}
                type={p.typ === "heslo" ? "password" : p.typ === "url" ? "url" : "text"}
                autoComplete={p.typ === "heslo" ? "new-password" : "off"}
                placeholder={ulozene ? "••••••••" : undefined}
                value={hodnoty[p.kluc] ?? ""}
                onChange={(e) => setHodnoty((h) => ({ ...h, [p.kluc]: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              {(p.pomoc || ulozene) && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {ulozene ? t("Uložené. Prázdne pole = ponechať.") + " " : ""}
                  {p.pomoc ? t(p.pomoc) : ""}
                </div>
              )}
            </div>
          );
        })}
        <div className="min-w-0">
          <label htmlFor="gps-nazov" className="mb-1 block text-xs font-medium">
            {t("Pomenovanie (nepovinné)")}
          </label>
          <input
            id="gps-nazov"
            value={nazov}
            maxLength={120}
            onChange={(e) => setNazov(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      {vysledok && (
        <div
          className={`break-words rounded-md p-2 text-sm ${vysledok.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}
        >
          {vysledok.text}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          disabled={!!busy}
          onClick={test}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          <TestTube2 className="h-4 w-4" /> {t("Otestovať pripojenie")}
        </button>
        <button
          disabled={!!busy}
          onClick={uloz}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {pr ? t("Uložiť") : t("Pripojiť")}
        </button>
        {props.onZavri && (
          <button
            disabled={!!busy}
            onClick={props.onZavri}
            className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            {t("Zrušiť")}
          </button>
        )}
      </div>
    </div>
  );
}
