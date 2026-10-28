import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatujMenu } from "@/lib/faktero/mena";
import { nacitajVynosyNaklady } from "@/lib/faktero/vynosy-naklady.functions";
import {
  bilancia,
  bilanciaSOcakavanym,
  obdobiePredvolby,
  suctyObdobia,
  type CislaVN,
  type VynosyNaklady,
} from "@/lib/faktero/vynosy-naklady";

/*
  Výnosy a náklady po mesiacoch. Nahrádza starý graf „Obrat (12 mesiacov)",
  ktorý ukazoval len vystavené a zaplatené faktúry — tu sú obe strany
  (vystavené aj prijaté s bločkami) a obdobie si človek vyberie sám.

  Farby sú tokeny témy: `--chart-2` je zelená v svetlom aj tmavom režime,
  `--destructive` červená. Neuhradené (očakávané) je tá istá farba svetlejšie,
  naskladaná nad uhradeným — stĺpec spolu je všetko vystavené za mesiac.
*/

type Predvolba = "rok" | "minuly_rok" | "12_mesiacov" | "vlastne";

const FARBA_VYNOS = "var(--chart-2)";
const FARBA_NAKLAD = "var(--destructive)";
const FARBA_BILANCIA = "var(--foreground)";
/*
  Očakávané sumy svetlejšou farbou priamo vo `fill`, nie cez `fillOpacity` —
  legenda grafu priehľadnosť ignoruje a „Očakávané“ v nej vyzerali rovnako
  ako uhradené.
*/
const FARBA_VYNOS_SVETLA = "color-mix(in oklch, var(--chart-2) 40%, transparent)";
const FARBA_NAKLAD_SVETLA = "color-mix(in oklch, var(--destructive) 40%, transparent)";

const MESIACE = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Máj",
  "kratko::Jún",
  "kratko::Júl",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dec",
];

const RIADKY: { kluc: keyof CislaVN | "bilancia"; nazov: string }[] = [
  { kluc: "vynosy", nazov: "Výnosy" },
  { kluc: "ocakavaneVynosy", nazov: "Očakávané výnosy" },
  { kluc: "naklady", nazov: "Náklady" },
  { kluc: "ocakavaneNaklady", nazov: "Očakávané náklady" },
  { kluc: "bilancia", nazov: "Bilancia" },
];

function hodnota(c: CislaVN, kluc: keyof CislaVN | "bilancia"): number {
  return kluc === "bilancia" ? bilancia(c) : c[kluc];
}

export function VynosyNakladyPanel({ companyId }: { companyId: string }) {
  const { t } = useT();
  const nacitaj = useServerFn(nacitajVynosyNaklady);
  const [predvolba, setPredvolba] = useState<Predvolba>("rok");
  const [vlastne, setVlastne] = useState(() => obdobiePredvolby("rok"));
  const [sDph, setSDph] = useState(true);
  const [data, setData] = useState<VynosyNaklady | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacitava, setNacitava] = useState(true);

  const obdobie = predvolba === "vlastne" ? vlastne : obdobiePredvolby(predvolba);
  const platneObdobie = !!obdobie.od && !!obdobie.do && obdobie.od <= obdobie.do;

  useEffect(() => {
    if (!platneObdobie) return;
    let zruseny = false;
    setNacitava(true);
    setChyba(null);
    nacitaj({ data: { companyId, od: obdobie.od, do: obdobie.do } })
      .then((d) => !zruseny && setData(d))
      .catch((e: unknown) => !zruseny && setChyba(e instanceof Error ? e.message : String(e)))
      .finally(() => !zruseny && setNacitava(false));
    return () => {
      zruseny = true;
    };
  }, [companyId, obdobie.od, obdobie.do, platneObdobie, nacitaj]);

  const mena = data?.mena ?? "EUR";
  const fmt = (n: number) => formatujMenu(n, mena);
  const viacRokov = !!data && data.od.slice(0, 4) !== data.do.slice(0, 4);
  const nazovMesiaca = (m: string) => {
    const nazov = t(MESIACE[Number(m.slice(5, 7)) - 1]);
    return viacRokov ? `${nazov} ${m.slice(2, 4)}` : nazov;
  };

  const graf = useMemo(
    () =>
      (data?.mesiace ?? []).map((m) => {
        const c = sDph ? m.sDph : m.bezDph;
        return { mesiac: nazovMesiaca(m.mesiac), ...c, bilancia: bilancia(c) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, sDph, t],
  );
  const spolu = useMemo(() => suctyObdobia(data?.mesiace ?? [], sDph), [data, sDph]);
  const bezPrepoctu = data
    ? data.bezPrepoctu.faktury + data.bezPrepoctu.prijate + data.bezPrepoctu.blocky
    : 0;
  const prazdne =
    !!data &&
    spolu.vynosy === 0 &&
    spolu.ocakavaneVynosy === 0 &&
    spolu.naklady === 0 &&
    spolu.ocakavaneNaklady === 0;

  const dlazdice: {
    nazov: string;
    suma: number;
    farba?: string;
    svetla?: boolean;
    ton?: string;
  }[] = [
    { nazov: "Výnosy", suma: spolu.vynosy, farba: FARBA_VYNOS },
    { nazov: "Očakávané výnosy", suma: spolu.ocakavaneVynosy, farba: FARBA_VYNOS, svetla: true },
    { nazov: "Náklady", suma: spolu.naklady, farba: FARBA_NAKLAD },
    { nazov: "Očakávané náklady", suma: spolu.ocakavaneNaklady, farba: FARBA_NAKLAD, svetla: true },
    {
      nazov: "Bilancia",
      suma: bilancia(spolu),
      ton: bilancia(spolu) < 0 ? "text-destructive" : "",
    },
    {
      nazov: "Bilancia s očakávanými",
      suma: bilanciaSOcakavanym(spolu),
      ton: bilanciaSOcakavanym(spolu) < 0 ? "text-destructive" : "",
    },
  ];

  const tlacidlo = (aktivne: boolean) =>
    `px-3 py-1.5 text-xs font-medium transition-colors ${aktivne ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`;

  return (
    <section
      className="min-w-0 rounded-xl border border-border bg-card p-4"
      aria-labelledby="vn-nadpis"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h2 id="vn-nadpis" className="text-sm font-medium">
            {t("Výnosy a náklady")}
          </h2>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <select
            value={predvolba}
            onChange={(e) => setPredvolba(e.target.value as Predvolba)}
            aria-label={t("Obdobie")}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="rok">{t("Tento rok")}</option>
            <option value="minuly_rok">{t("Minulý rok")}</option>
            <option value="12_mesiacov">{t("Posledných 12 mesiacov")}</option>
            <option value="vlastne">{t("Vlastné obdobie")}</option>
          </select>
          {predvolba === "vlastne" && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <input
                type="date"
                value={vlastne.od}
                onChange={(e) => setVlastne((v) => ({ ...v, od: e.target.value }))}
                aria-label={t("Od")}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="date"
                value={vlastne.do}
                onChange={(e) => setVlastne((v) => ({ ...v, do: e.target.value }))}
                aria-label={t("Do")}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              />
            </div>
          )}
          <div
            className="inline-flex overflow-hidden rounded-md border border-border"
            role="group"
            aria-label={t("Sumy")}
          >
            <button
              type="button"
              className={tlacidlo(sDph)}
              aria-pressed={sDph}
              onClick={() => setSDph(true)}
            >
              {t("s DPH")}
            </button>
            <button
              type="button"
              className={tlacidlo(!sDph)}
              aria-pressed={!sDph}
              onClick={() => setSDph(false)}
            >
              {t("bez DPH")}
            </button>
          </div>
          <span
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
            title={t("Doklady v cudzej mene sú prepočítané kurzom uloženým na doklade.")}
          >
            {mena}
          </span>
        </div>
      </div>

      {!platneObdobie ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("Začiatok obdobia je po jeho konci.")}
        </p>
      ) : chyba ? (
        <p className="py-6 text-center text-sm text-destructive">{chyba}</p>
      ) : nacitava && !data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-lg bg-muted/50" />
        </div>
      ) : (
        <div className={nacitava ? "opacity-60 transition-opacity" : ""}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {dlazdice.map((d) => (
              <div
                key={d.nazov}
                className="min-w-0 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  {d.farba && (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: d.farba, opacity: d.svetla ? 0.4 : 1 }}
                    />
                  )}
                  <span className="truncate">{t(d.nazov)}</span>
                </div>
                <div
                  className={`mt-0.5 truncate text-base font-semibold tabular-nums ${d.ton ?? ""}`}
                >
                  {fmt(d.suma)}
                </div>
              </div>
            ))}
          </div>

          {bezPrepoctu > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t(
                "Doklady v cudzej mene bez prepočtu na {mena}: {n}. V súčtoch nie sú (bločky v cudzej mene sa neprepočítavajú).",
                { n: bezPrepoctu, mena },
              )}
            </p>
          )}

          {prazdne ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("Za toto obdobie nie sú žiadne doklady.")}
            </p>
          ) : (
            <>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={graf}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    barGap={2}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="mesiac"
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      minTickGap={4}
                    />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      tickFormatter={(v: number) =>
                        new Intl.NumberFormat("sk-SK", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(v)
                      }
                    />
                    <ReferenceLine y={0} stroke="var(--border)" />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "var(--foreground)",
                      }}
                      formatter={(v: any) => fmt(Number(v))}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="vynosy"
                      name={t("Výnosy")}
                      stackId="v"
                      fill={FARBA_VYNOS}
                      maxBarSize={28}
                    />
                    <Bar
                      dataKey="ocakavaneVynosy"
                      name={t("Očakávané výnosy")}
                      stackId="v"
                      fill={FARBA_VYNOS_SVETLA}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                    <Bar
                      dataKey="naklady"
                      name={t("Náklady")}
                      stackId="n"
                      fill={FARBA_NAKLAD}
                      maxBarSize={28}
                    />
                    <Bar
                      dataKey="ocakavaneNaklady"
                      name={t("Očakávané náklady")}
                      stackId="n"
                      fill={FARBA_NAKLAD_SVETLA}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                    <Line
                      type="monotone"
                      dataKey="bilancia"
                      name={t("Bilancia")}
                      stroke={FARBA_BILANCIA}
                      strokeWidth={2}
                      dot={{ r: 3, fill: FARBA_BILANCIA }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {t(
                  "Výnosy sú uhradené vystavené faktúry, náklady uhradené prijaté faktúry a bločky. Bilancia = výnosy − náklady. Zálohové faktúry sa nepočítajú, dobropisy odpočítavajú.",
                )}
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <caption className="sr-only">{t("Súhrn po mesiacoch")}</caption>
                  <thead>
                    <tr className="text-[12px] text-muted-foreground">
                      <th className="sticky left-0 bg-card py-1.5 pr-3 text-left font-medium">
                        {t("Súhrn po mesiacoch")}
                      </th>
                      {graf.map((m, i) => (
                        <th
                          key={i}
                          className="whitespace-nowrap px-2 py-1.5 text-right font-medium"
                        >
                          {m.mesiac}
                        </th>
                      ))}
                      <th className="whitespace-nowrap py-1.5 pl-2 text-right font-semibold">
                        {t("Spolu")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {RIADKY.map((r) => {
                      const celkom = hodnota(spolu, r.kluc);
                      return (
                        <tr key={r.kluc} className={r.kluc === "bilancia" ? "font-semibold" : ""}>
                          <th
                            scope="row"
                            className="sticky left-0 whitespace-nowrap bg-card py-2 pr-3 text-left font-normal"
                          >
                            {t(r.nazov)}
                          </th>
                          {(data?.mesiace ?? []).map((m) => {
                            const v = hodnota(sDph ? m.sDph : m.bezDph, r.kluc);
                            return (
                              <td
                                key={m.mesiac}
                                className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${v === 0 ? "text-muted-foreground" : v < 0 && r.kluc === "bilancia" ? "text-destructive" : ""}`}
                              >
                                {fmt(v)}
                              </td>
                            );
                          })}
                          <td
                            className={`whitespace-nowrap py-2 pl-2 text-right font-semibold tabular-nums ${celkom < 0 && r.kluc === "bilancia" ? "text-destructive" : ""}`}
                          >
                            {fmt(celkom)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
