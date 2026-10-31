import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Database,
  HardDrive,
  Users,
  Globe,
  Zap,
  Radio,
  RefreshCw,
  Table2,
  ExternalLink,
} from "lucide-react";
import { getSupabaseUsage } from "@/lib/faktero/admin-usage.functions";
import {
  formatBajty,
  odhadNakladov,
  percento,
  tonPercent,
  type LimitPlanu,
  type Ton,
} from "@/lib/faktero/admin-zdroje";
import {
  ODKAZ_SUPABASE_USAGE,
  podielDopocitaneho,
  zobrazitEdgeFunkcie,
} from "@/lib/faktero/zdroje-logy";
import { useT } from "@/lib/i18n/useT";

type Usage = Awaited<ReturnType<typeof getSupabaseUsage>>;
type Hodnota<T> = { dostupne: true; hodnota: T } | { dostupne: false; dovod: string };

const TON_PAS: Record<Ton, string> = {
  zelena: "bg-emerald-500",
  oranzova: "bg-amber-500",
  cervena: "bg-destructive",
};
const TON_TEXT: Record<Ton, string> = {
  zelena: "text-emerald-700 dark:text-emerald-400",
  oranzova: "text-amber-700 dark:text-amber-400",
  cervena: "text-destructive",
};

const GB = 1024 ** 3;

function cislo(n: number, desatinne = 0) {
  return n.toLocaleString("sk-SK", {
    minimumFractionDigits: desatinne,
    maximumFractionDigits: desatinne,
  });
}

function suma(n: number) {
  return n.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Pas({ pct }: { pct: number | null }) {
  if (pct == null) return <div className="mt-3 h-2 w-full rounded-full bg-muted" />;
  return (
    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full ${TON_PAS[tonPercent(pct)]} transition-all`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function Metrika({
  icon: Icon,
  nazov,
  vyuzite,
  limit,
  kurz,
  dovod,
  vyuziteNaCenu,
  children,
}: {
  icon: any;
  nazov: string;
  /** null = údaj nie je dostupný (vtedy sa ukáže `dovod`). */
  vyuzite: number | null;
  limit: LimitPlanu | undefined;
  kurz: number | null;
  dovod?: string;
  /** Množstvo, z ktorého sa počíta cena, ak je iné ako využité (napr. pridelený disk). */
  vyuziteNaCenu?: number | null;
  children?: React.ReactNode;
}) {
  const { t } = useT();
  const format = (n: number) => (limit?.jednotka === "bajty" ? formatBajty(n) : cislo(n));
  const pct = vyuzite != null && limit ? percento(vyuzite, limit.zahrnute) : null;
  const naCenu = vyuziteNaCenu ?? vyuzite;
  const naklady = naCenu != null && limit ? odhadNakladov(naCenu, limit, kurz) : null;
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{nazov}</span>
        </span>
        {pct != null && (
          <span className={`text-xs font-semibold tabular-nums ${TON_TEXT[tonPercent(pct)]}`}>
            {pct < 0.1 && pct > 0 ? "< 0,1" : cislo(pct, 1)} %
          </span>
        )}
      </div>
      {vyuzite != null ? (
        <div className="mt-2 text-lg font-semibold tabular-nums">
          {format(vyuzite)}{" "}
          {limit && (
            <span className="text-sm font-normal text-muted-foreground">
              / {format(limit.zahrnute)} {t("zahrnuté")}
            </span>
          )}
        </div>
      ) : (
        <div className="mt-2 text-sm text-muted-foreground">
          {t("nedostupné")}
          {dovod ? ` (${dovod})` : ""}
          {limit && (
            <span className="block text-xs">
              {t("Zahrnuté v pláne")}: {format(limit.zahrnute)}
            </span>
          )}
        </div>
      )}
      <Pas pct={pct} />
      {naklady && (
        <div className="mt-2 text-xs text-muted-foreground">
          {naklady.usd > 0 ? (
            <span className="font-medium text-destructive">
              {t("Odhad nad limit")}: {naklady.eur != null ? `${suma(naklady.eur)} € · ` : ""}
              {suma(naklady.usd)} $
            </span>
          ) : (
            <span>{t("Nad limit: 0 € · 0 $")}</span>
          )}
        </div>
      )}
      {children && <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

/** Odkaz na presné čísla v dashboarde Supabase (karty s odhadom z logov). */
function OdkazSupabase() {
  const { t } = useT();
  return (
    <a
      href={ODKAZ_SUPABASE_USAGE}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      {t("Presné číslo v Supabase")}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

const datum = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("sk-SK", { timeZone: "UTC" });

function hodnota<T>(h: Hodnota<T>): T | null {
  return h.dostupne ? h.hodnota : null;
}

export function AdminVyuzitieZdrojov() {
  const { t } = useT();
  const fetchUsage = useServerFn(getSupabaseUsage);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacitava, setNacitava] = useState(false);

  const nacitaj = useCallback(
    async (obnovit: boolean) => {
      setNacitava(true);
      setChyba(null);
      try {
        setUsage(await fetchUsage({ data: { obnovit } }));
      } catch (e: any) {
        console.error("usage fetch failed", e);
        setChyba(e?.message ?? t("Chyba pri načítaní"));
      } finally {
        setNacitava(false);
      }
    },
    [fetchUsage, t],
  );

  useEffect(() => {
    void nacitaj(false);
  }, [nacitaj]);

  const prevod = (h: { dostupne: false; dovod: string } | { dostupne: true }) =>
    h.dostupne
      ? undefined
      : h.dovod === "chýba prístupový token"
        ? t("chýba prístupový token")
        : h.dovod;

  const limit = (k: string) => usage?.limits.find((l) => l.kluc === k);
  const kurz = usage?.usd_kurz?.kurz ?? null;
  const api = usage?.api;
  const disk = api ? hodnota(api.disk) : null;
  const diskUtil = api ? hodnota(api.diskVyuzitie) : null;
  const autoscale = api ? hodnota(api.diskAutoscale) : null;
  const compute = api ? hodnota(api.compute) : null;
  const pridelenyDisk = disk?.velkost_gb != null ? disk.velkost_gb * GB : null;
  // Využitie disku: najpresnejšie z disk/util, inak veľkosť DB voči pridelenému disku.
  const diskPct = diskUtil
    ? percento(diskUtil.pouzite_bajty, diskUtil.velkost_bajty)
    : usage && pridelenyDisk
      ? percento(usage.db.size_bytes, pridelenyDisk)
      : null;

  // Súčet odhadov nad limit z metrík, ktoré sú naozaj známe.
  const sucetUsd = usage
    ? [
        ["db_disk", Math.max(usage.db.size_bytes, pridelenyDisk ?? 0)],
        ["storage", usage.storage.used_bytes],
        ["mau", usage.auth.mau],
      ].reduce((s, [k, v]) => {
        const l = limit(k as string);
        const o = l ? odhadNakladov(v as number, l, kurz) : null;
        return s + (o?.usd ?? 0);
      }, 0)
    : 0;

  const overene = usage?.limits[0]?.overene;

  // Denné odhady z logov (admin_usage_daily) za aktuálny kalendárny mesiac.
  const logy = usage?.logy && usage.logy.dni > 0 ? usage.logy : null;
  const dovodLogy = usage?.logy ? t("zatiaľ žiadny deň z logov") : t("tabuľka odhadov nedostupná");
  const pocetFunkcii = api ? hodnota(api.edgeFunkcie) : null;
  const ukazEdge = zobrazitEdgeFunkcie(pocetFunkcii, logy?.edge_invocations ?? null);
  const dopocitane = logy ? podielDopocitaneho(logy) : null;
  const obdobie = logy ? (
    <div>
      {t("Odhad z logov")}: {datum(logy.od)} – {logy.do ? datum(logy.do) : "—"} (
      {t("kalendárny mesiac, dní s údajmi: {n}", { n: logy.dni })})
    </div>
  ) : (
    <div>{t("Odhad z logov")}</div>
  );

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t("Využitie zdrojov (Supabase Pro)")}</h2>
          {usage && (
            <p className="text-xs text-muted-foreground">
              {compute ? `${t("Výpočtový výkon")}: ${compute} · ` : ""}
              {t("Načítané")} {new Date(usage.generated_at).toLocaleString("sk-SK")}
              {usage.z_cache ? ` · ${t("z vyrovnávacej pamäte (10 min)")}` : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void nacitaj(true)}
          disabled={nacitava}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${nacitava ? "animate-spin" : ""}`} />
          {t("Obnoviť údaje")}
        </button>
      </div>

      {chyba && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {chyba}
        </div>
      )}
      {!usage && nacitava && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {usage && api && (
        <>
          {!api.token && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              {t(
                "Údaje z Management API sú nedostupné (chýba prístupový token). Databáza, úložisko a používatelia sa rátajú priamo z databázy.",
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metrika
              icon={Database}
              nazov={t("Databáza")}
              vyuzite={usage.db.size_bytes}
              limit={limit("db_disk")}
              kurz={kurz}
              vyuziteNaCenu={Math.max(usage.db.size_bytes, pridelenyDisk ?? 0)}
            >
              {disk ? (
                <>
                  <div>
                    {t("Pridelený disk")}: {disk.velkost_gb ?? "—"} GB
                    {disk.typ ? ` · ${disk.typ}` : ""}
                    {disk.iops != null ? ` · ${cislo(disk.iops)} IOPS` : ""}
                    {disk.throughput_mibps != null
                      ? ` · ${cislo(disk.throughput_mibps)} MiB/s`
                      : ""}
                  </div>
                  {diskPct != null && (
                    <div>
                      {t("Využitie disku")}:{" "}
                      <span className={`font-medium ${TON_TEXT[tonPercent(diskPct)]}`}>
                        {cislo(diskPct, 1)} %
                      </span>
                      {diskUtil
                        ? ` (${formatBajty(diskUtil.pouzite_bajty)} / ${formatBajty(diskUtil.velkost_bajty)})`
                        : ""}
                    </div>
                  )}
                </>
              ) : (
                <div>
                  {t("Pridelený disk")}: {t("nedostupné")}
                  {prevod(api.disk) ? ` (${prevod(api.disk)})` : ""}
                </div>
              )}
              <div>
                {t("Pri 90 % využitia sa disk automaticky rozšíri.")}
                {autoscale?.rast_percent != null
                  ? ` ${t("Rast o {p} %, najviac do {max} GB.", {
                      p: autoscale.rast_percent,
                      max: autoscale.max_velkost_gb ?? "—",
                    })}`
                  : ""}
              </div>
            </Metrika>

            <Metrika
              icon={HardDrive}
              nazov={t("Úložisko súborov")}
              vyuzite={usage.storage.used_bytes}
              limit={limit("storage")}
              kurz={kurz}
            >
              <div>
                {t("{n} súborov v {k} košoch", {
                  n: cislo(usage.storage.files),
                  k: usage.storage.buckets.length,
                })}
              </div>
            </Metrika>

            <Metrika
              icon={Users}
              nazov={t("Aktívni používatelia (MAU)")}
              vyuzite={usage.auth.mau}
              limit={limit("mau")}
              kurz={kurz}
            >
              <div>
                {t("Prihlásení od {d}", {
                  d: usage.auth.month_start
                    ? new Date(usage.auth.month_start).toLocaleDateString("sk-SK")
                    : "—",
                })}
              </div>
              <div>
                {t("Používateľov spolu")}: {cislo(usage.auth.users_total)}
              </div>
            </Metrika>

            <Metrika
              icon={Globe}
              nazov={t("Egress (nekešovaný)")}
              vyuzite={logy ? logy.egress_bytes : null}
              limit={limit("egress")}
              kurz={kurz}
              dovod={dovodLogy}
            >
              {obdobie}
              {logy && (
                <div>
                  {t(
                    "Súčet veľkosti odpovedí API brány vrátane kešovaných; {p} % odpovedí veľkosť neuvádza, tie sú dopočítané priemerom služby.",
                    {
                      p: cislo(
                        logy.responses_total > 0
                          ? (logy.responses_without_length / logy.responses_total) * 100
                          : 0,
                      ),
                    },
                  )}
                  {dopocitane != null &&
                    ` ${t("Dopočítaná časť: {p} % objemu.", { p: cislo(dopocitane, 1) })}`}
                </div>
              )}
              <OdkazSupabase />
            </Metrika>

            {ukazEdge && (
              <Metrika
                icon={Zap}
                nazov={t("Volania edge funkcií")}
                vyuzite={logy ? logy.edge_invocations : null}
                limit={limit("edge_invocations")}
                kurz={kurz}
                dovod={dovodLogy}
              >
                {obdobie}
                <div>
                  {t("Počet funkcií")}:{" "}
                  {api.edgeFunkcie.dostupne
                    ? api.edgeFunkcie.hodnota
                    : `${t("nedostupné")} (${prevod(api.edgeFunkcie)})`}
                </div>
                <OdkazSupabase />
              </Metrika>
            )}

            <Metrika
              icon={Radio}
              nazov={t("Realtime – správy")}
              vyuzite={logy ? logy.realtime_messages : null}
              limit={limit("realtime_messages")}
              kurz={kurz}
              dovod={dovodLogy}
            >
              {obdobie}
              {logy && <div>{t("Počet záznamov v logu Realtime, nie presný počet správ.")}</div>}
              <div>
                {t("Súčasné pripojenia (špička)")}: {t("nedostupné")}
              </div>
              <div>
                {t("Realtime požiadavky za 7 dní")}:{" "}
                {api.poziadavky7d.dostupne
                  ? cislo(api.poziadavky7d.hodnota.realtime)
                  : `${t("nedostupné")} (${prevod(api.poziadavky7d)})`}
              </div>
              <OdkazSupabase />
            </Metrika>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
            <span>
              {t("Odhad nákladov nad limit (zo známych metrík)")}:{" "}
              <span className={`font-semibold ${sucetUsd > 0 ? "text-destructive" : ""}`}>
                {kurz ? `${suma(sucetUsd / kurz)} € · ` : ""}
                {suma(sucetUsd)} $
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {overene &&
                t("Limity overené {d} na supabase.com/pricing", {
                  d: new Date(overene).toLocaleDateString("sk-SK"),
                })}
              {usage.usd_kurz &&
                ` · ${t("kurz ECB {k} USD/EUR z {d}", {
                  k: usage.usd_kurz.kurz,
                  d: new Date(usage.usd_kurz.den).toLocaleDateString("sk-SK"),
                })}`}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Table2 className="h-4 w-4 text-muted-foreground" />
                {t("Top 10 najväčších tabuliek")}
              </div>
              <div className="space-y-2">
                {usage.db.tables.map((tab) => {
                  const pct =
                    usage.db.size_bytes > 0 ? (tab.size_bytes / usage.db.size_bytes) * 100 : 0;
                  return (
                    <div key={`${tab.schema}.${tab.table}`} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-mono text-xs">
                          {tab.schema === "public" ? tab.table : `${tab.schema}.${tab.table}`}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatBajty(tab.size_bytes)} · {cislo(pct, 1)} %
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary/60"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {usage.db.tables.length === 0 && (
                  <div className="text-sm text-muted-foreground">{t("Dáta nedostupné.")}</div>
                )}
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                {t("Úložisko podľa košov")}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">{t("Kôš úložiska")}</th>
                      <th className="py-1 pr-2 text-right font-medium">{t("Súbory")}</th>
                      <th className="py-1 pr-2 text-right font-medium">{t("Veľkosť")}</th>
                      <th className="py-1 text-right font-medium">{t("Priemer")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.storage.buckets.map((b) => (
                      <tr
                        key={b.name}
                        className={`border-t border-border/60 ${b.docasny ? "bg-amber-500/10" : ""}`}
                      >
                        <td className="py-1 pr-2">
                          <span className="font-mono text-xs">{b.name}</span>
                          {b.docasny && (
                            <span className="ml-1.5 rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                              {t("dočasný")}
                            </span>
                          )}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">{cislo(b.files)}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">
                          {formatBajty(b.size_bytes)}
                        </td>
                        <td className="py-1 text-right tabular-nums text-muted-foreground">
                          {b.files > 0 ? formatBajty(Math.round(b.priemer_bajty)) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {Object.keys(usage.row_counts).length > 0 && (
            <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 text-sm font-medium">{t("Počty záznamov")}</div>
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
                {Object.entries(usage.row_counts).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                  >
                    <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                      {k}
                    </span>
                    <span className="font-semibold tabular-nums">{cislo(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
