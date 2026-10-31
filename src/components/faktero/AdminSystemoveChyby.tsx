/*
  Admin → Chyby: systémové chyby zlúčené podľa odtlačku (server, prehliadač,
  appka, hooky), zlyhané crony a stav procesu na serveri. Plus malý súhrn
  „chyby za 24 h“ pre Prehľad a Health check.
*/
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import {
  listSystemoveChyby,
  oznacSystemovuChybu,
  stavProcesuServera,
  suhrnChyb24h,
  zlyhaneCrony,
  type SystemovaChyba,
} from "@/lib/faktero/admin-chyby.functions";
import { potvrd } from "@/lib/potvrdenie";

type Zdroj = SystemovaChyba["zdroj"];
type Obdobie = "24h" | "7d" | "30d" | "90d";
type Stav = "nevyriesene" | "vyriesene" | "vsetky";
type Uroven = "vsetky" | "chyba" | "varovanie" | "stare_vydanie";

const OBDOBIA: { value: Obdobie; label: string }[] = [
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 dní" },
  { value: "30d", label: "30 dní" },
  { value: "90d", label: "90 dní" },
];
const STAVY: { value: Stav; label: string }[] = [
  { value: "nevyriesene", label: "Nevyriešené" },
  { value: "vyriesene", label: "Vyriešené" },
  { value: "vsetky", label: "Všetky" },
];
const UROVNE: { value: Uroven; label: string }[] = [
  { value: "vsetky", label: "Každá úroveň" },
  { value: "chyba", label: "Chyby" },
  { value: "varovanie", label: "Varovania" },
  { value: "stare_vydanie", label: "Staré vydanie" },
];

const UROVEN_META: Record<SystemovaChyba["uroven"], { label: string; cls: string }> = {
  chyba: { label: "chyba", cls: "bg-destructive/15 text-destructive" },
  varovanie: { label: "varovanie", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  stare_vydanie: { label: "staré vydanie", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
};

const NAZOV_ZDROJA: Record<Zdroj, string> = {
  server: "server",
  prehliadac: "prehliadač",
  appka: "appka",
  cron: "cron",
  hook: "hook",
};

function cas(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("sk-SK");
  } catch {
    return s;
  }
}

function Prepinac<T extends string>({
  hodnota,
  moznosti,
  zmen,
  popis,
}: {
  hodnota: T;
  moznosti: { value: T; label: string }[];
  zmen: (v: T) => void;
  popis: string;
}) {
  return (
    <div role="group" aria-label={popis} className="flex flex-wrap gap-1">
      {moznosti.map((m) => (
        <button
          key={m.value}
          type="button"
          aria-pressed={hodnota === m.value}
          onClick={() => zmen(m.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            hodnota === m.value
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function RiadokChyby({
  r,
  prepni,
  pracuje,
}: {
  r: SystemovaChyba;
  prepni: (r: SystemovaChyba) => void;
  pracuje: boolean;
}) {
  const [otvorene, setOtvorene] = useState(false);
  const u = UROVEN_META[r.uroven];
  return (
    <li
      className="rounded-xl border border-border bg-card p-3 shadow-sm"
      data-testid="systemova-chyba"
      data-odtlacok={r.odtlacok}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${u.cls}`}
            >
              {u.label}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              {NAZOV_ZDROJA[r.zdroj]}
            </span>
            <span
              className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums"
              title="Počet výskytov"
            >
              {r.pocet.toLocaleString("sk-SK")}×
            </span>
            {r.http_status != null && (
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px]">
                {r.http_status}
              </span>
            )}
            {r.vyriesene_at && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" aria-hidden /> vyriešené {cas(r.vyriesene_at)}
              </span>
            )}
            {r.znovu_otvorene > 0 && (
              <span className="text-[11px] text-amber-700 dark:text-amber-400">
                vrátila sa {r.znovu_otvorene}×
              </span>
            )}
          </div>
          <div className="mt-1 break-words text-sm font-medium">{r.sprava}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {(r.metoda || r.trasa) && (
              <span className="min-w-0 break-all font-mono">
                {[r.metoda, r.trasa].filter(Boolean).join(" ")}
              </span>
            )}
            <span>posledný: {cas(r.posledny_vyskyt)}</span>
            <span>prvý: {cas(r.prvy_vyskyt)}</span>
            {r.vydanie && <span className="font-mono">vydanie {r.vydanie}</span>}
          </div>
        </div>
        <button
          type="button"
          disabled={pracuje}
          onClick={() => prepni(r)}
          className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {r.vyriesene_at ? "Otvoriť znova" : "Vyriešené"}
        </button>
      </div>
      <button
        type="button"
        aria-expanded={otvorene}
        onClick={() => setOtvorene((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${otvorene ? "rotate-180" : ""}`}
          aria-hidden
        />
        Podrobnosti
      </button>
      {otvorene && (
        <div className="mt-2 space-y-2 text-xs">
          {r.stack ? (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[11px]">
              {r.stack}
            </pre>
          ) : (
            <div className="text-muted-foreground">Bez stacku.</div>
          )}
          <div className="grid gap-1 font-mono text-[11px] text-muted-foreground">
            {r.company_id && <div className="break-all">firma: {r.company_id}</div>}
            {r.user_id && <div className="break-all">používateľ: {r.user_id}</div>}
            {r.user_agent && <div className="break-all">prehliadač: {r.user_agent}</div>}
            <div className="break-all">odtlačok: {r.odtlacok}</div>
          </div>
        </div>
      )}
    </li>
  );
}

/** Zoznam systémových chýb zvolených zdrojov s filtrami. */
export function SystemoveChybyZoznam({ zdroje }: { zdroje: Zdroj[] }) {
  const nacitaj = useServerFn(listSystemoveChyby);
  const oznac = useServerFn(oznacSystemovuChybu);
  const [obdobie, setObdobie] = useState<Obdobie>("7d");
  const [stav, setStav] = useState<Stav>("nevyriesene");
  const [uroven, setUroven] = useState<Uroven>("vsetky");
  const [rows, setRows] = useState<SystemovaChyba[]>([]);
  const [loading, setLoading] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState(false);
  const kluc = zdroje.join(",");

  const obnov = useCallback(async () => {
    setLoading(true);
    setChyba(null);
    try {
      const res = await nacitaj({
        data: { zdroje: kluc.split(",") as Zdroj[], obdobie, stav, uroven },
      });
      setRows(res.rows);
      if (res.chyba) setChyba(res.chyba);
    } catch (e: any) {
      setChyba(e?.message ?? "Chyba načítania");
    } finally {
      setLoading(false);
    }
  }, [nacitaj, kluc, obdobie, stav, uroven]);

  useEffect(() => {
    void obnov();
  }, [obnov]);

  const prepni = async (r: SystemovaChyba) => {
    setPracuje(true);
    try {
      await oznac({ data: { ids: [r.id], vyriesene: !r.vyriesene_at } });
      await obnov();
    } catch (e: any) {
      setChyba(e?.message ?? "Nepodarilo sa uložiť");
    } finally {
      setPracuje(false);
    }
  };

  const vsetkyVyriesene = async () => {
    const otvorene = rows.filter((r) => !r.vyriesene_at);
    if (!otvorene.length) return;
    const ok = await potvrd(`Označiť ${otvorene.length} zobrazených chýb ako vyriešené?`, {
      potvrdit: "Označiť",
    });
    if (!ok) return;
    setPracuje(true);
    try {
      await oznac({ data: { ids: otvorene.map((r) => r.id), vyriesene: true } });
      await obnov();
    } catch (e: any) {
      setChyba(e?.message ?? "Nepodarilo sa uložiť");
    } finally {
      setPracuje(false);
    }
  };

  const vyskyty = rows.reduce((a, r) => a + r.pocet, 0);

  return (
    <section aria-label="Systémové chyby">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Prepinac popis="Obdobie" hodnota={obdobie} moznosti={OBDOBIA} zmen={setObdobie} />
        <Prepinac popis="Stav" hodnota={stav} moznosti={STAVY} zmen={setStav} />
        <Prepinac popis="Úroveň" hodnota={uroven} moznosti={UROVNE} zmen={setUroven} />
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void obnov()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            )}
            Obnoviť
          </button>
          {stav !== "vyriesene" && rows.some((r) => !r.vyriesene_at) && (
            <button
              type="button"
              onClick={() => void vsetkyVyriesene()}
              disabled={pracuje}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              Všetky zobrazené vyriešené
            </button>
          )}
        </div>
      </div>

      {chyba && (
        <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {chyba}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Načítavam…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Žiadne chyby v tomto období.
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {rows.length} rôznych chýb, spolu {vyskyty.toLocaleString("sk-SK")} výskytov
            {rows.length >= 300 ? " (zobrazených prvých 300)" : ""}.
          </p>
          <ul className="space-y-2">
            {rows.map((r) => (
              <RiadokChyby key={r.id} r={r} prepni={(x) => void prepni(x)} pracuje={pracuje} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Zlyhané behy pg_cron a chybné odpovede hookov (pg_net). */
export function ZlyhaneCrony() {
  const nacitaj = useServerFn(zlyhaneCrony);
  const [obdobie, setObdobie] = useState<Obdobie>("7d");
  const [data, setData] = useState<Awaited<ReturnType<typeof zlyhaneCrony>> | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);

  useEffect(() => {
    let zruseny = false;
    setChyba(null);
    nacitaj({ data: { obdobie } })
      .then((d) => {
        if (zruseny) return;
        setData(d);
        if (d.chyba) setChyba(d.chyba);
      })
      .catch((e: any) => !zruseny && setChyba(e?.message ?? "Chyba načítania"));
    return () => {
      zruseny = true;
    };
  }, [nacitaj, obdobie]);

  return (
    <section aria-label="Zlyhané crony" className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Plánované úlohy (pg_cron)
        </h2>
        <Prepinac popis="Obdobie cronov" hodnota={obdobie} moznosti={OBDOBIA} zmen={setObdobie} />
      </div>
      {chyba && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {chyba}
        </div>
      )}
      {!data ? (
        <div className="text-sm text-muted-foreground">Načítavam…</div>
      ) : (
        <>
          {data.behy.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Žiadny zlyhaný beh cronu.
            </div>
          ) : (
            <ul className="space-y-2">
              {data.behy.map((b) => (
                <li key={b.nazov} className="rounded-xl border border-border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{b.nazov}</span>
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                      {b.pocet}× zlyhal
                    </span>
                    <span className="text-xs text-muted-foreground">
                      z {b.behov_spolu} behov · posledný {cas(b.posledny)}
                    </span>
                  </div>
                  {b.sprava && (
                    <div className="mt-1 break-words font-mono text-xs text-muted-foreground">
                      {b.sprava}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <h3 className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Odpovede hookov (pg_net, posledných ~6 h)
          </h3>
          {data.http.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Žiadna chybná ani nedokončená odpoveď.
            </div>
          ) : (
            <ul className="space-y-2">
              {data.http.map((h, i) => (
                <li key={i} className="rounded-xl border border-border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px]">
                      {h.timed_out ? "timeout" : (h.status_code ?? "bez odpovede")}
                    </span>
                    <span className="font-semibold tabular-nums">{h.pocet}×</span>
                    <span className="text-xs text-muted-foreground">
                      posledná {cas(h.posledny)}
                    </span>
                  </div>
                  {(h.error_msg || h.obsah) && (
                    <div className="mt-1 break-words font-mono text-xs text-muted-foreground">
                      {h.error_msg ?? h.obsah}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            pg_net si odpovede drží len pár hodín a nepamätá si adresu — ktorý hook zlyhal, ukazuje
            zoznam nižšie (zdroj „hook“), kam server zapisuje každú odpoveď 5xx z /api/public/hooks.
          </p>
        </>
      )}
    </section>
  );
}

/** Reštarty procesu z pm2 a koniec chybového logu. */
export function StavProcesu() {
  const nacitaj = useServerFn(stavProcesuServera);
  const [data, setData] = useState<Awaited<ReturnType<typeof stavProcesuServera>> | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [log, setLog] = useState(false);

  const obnov = useCallback(() => {
    setChyba(null);
    nacitaj()
      .then(setData)
      .catch((e: any) => setChyba(e?.message ?? "Chyba načítania"));
  }, [nacitaj]);
  useEffect(() => obnov(), [obnov]);

  return (
    <section aria-label="Proces na serveri" className="mb-6 space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Proces na serveri
      </h2>
      {chyba && <div className="text-sm text-destructive">{chyba}</div>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Stav", data.proces.stav ?? "—"],
              ["Beží od", cas(data.proces.start)],
              ["Reštarty (pm2)", data.proces.restarty ?? "—"],
              ["Pamäť", data.proces.pamatMb != null ? `${data.proces.pamatMb} MB` : "—"],
            ].map(([k, v]) => (
              <div
                key={String(k)}
                className="min-w-0 rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {k}
                </div>
                <div className="truncate text-sm font-semibold tabular-nums">{String(v)}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Počet reštartov zahŕňa aj nasadenia (každé reštartuje proces).
            {data.proces.nestabilne ? ` Nestabilné reštarty: ${data.proces.nestabilne}.` : ""}
            {data.chybaPm2 ? ` pm2 nedostupné (${data.chybaPm2}).` : ""}
          </p>
          <button
            type="button"
            aria-expanded={log}
            onClick={() => setLog((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`h-3.5 w-3.5 ${log ? "rotate-180" : ""}`} aria-hidden />
            Koniec chybového logu ({data.riadky.length} riadkov)
          </button>
          {log &&
            (data.riadky.length ? (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-[11px]">
                {data.riadky.join("\n")}
              </pre>
            ) : (
              <div className="text-xs text-muted-foreground">
                Log je prázdny alebo nedostupný{data.chybaLogu ? ` (${data.chybaLogu})` : ""}.
              </div>
            ))}
        </>
      )}
    </section>
  );
}

/** Súhrn chýb za 24 h — Prehľad a Health check. */
export function SuhrnChyb24h() {
  const nacitaj = useServerFn(suhrnChyb24h);
  const [d, setD] = useState<Awaited<ReturnType<typeof suhrnChyb24h>> | null>(null);
  useEffect(() => {
    nacitaj()
      .then(setD)
      .catch(() => setD(null));
  }, [nacitaj]);
  if (!d) return null;
  const zle = d.spolu > 0 || d.zlyhaneCrony > 0;
  return (
    <Link
      to="/admin/errors"
      className={`mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border p-4 text-sm shadow-sm hover:bg-accent/50 ${
        zle ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
      }`}
    >
      <span className="inline-flex items-center gap-2 font-semibold">
        {zle ? (
          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
        )}
        Chyby za 24 h: {d.spolu}
      </span>
      {!d.dostupne ? (
        <span className="text-xs text-muted-foreground">tabuľka chýb zatiaľ nie je</span>
      ) : (
        <span className="text-xs text-muted-foreground">
          server {d.zdroje.server ?? 0} · hooky {d.zdroje.hook ?? 0} · prehliadač{" "}
          {d.zdroje.prehliadac ?? 0} · appka {d.zdroje.appka ?? 0} · výskytov {d.vyskyty}
          {d.stareVydanie ? ` · staré vydanie ${d.stareVydanie}` : ""}
        </span>
      )}
      <span className={`text-xs ${d.zlyhaneCrony ? "text-destructive" : "text-muted-foreground"}`}>
        zlyhané crony {d.zlyhaneCrony}
      </span>
    </Link>
  );
}
