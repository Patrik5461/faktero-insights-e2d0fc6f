import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Download, Info, Mail } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { EmptyState } from "@/components/faktero/ListControls";
import { StavOdznak, type TonStavu } from "@/components/faktero/web/Stav";
import { ChybovyStav, NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { odoslaneMailyFn } from "@/lib/faktero/odoslane-maily.functions";
import {
  casBratislava,
  datumBratislava,
  jeOdoslany,
  mailyDoCsv,
  nazovDruhu,
  rozsahObdobia,
  suhrnMailov,
  textStavu,
  ZACIATOK_EVIDENCIE,
  ZACIATOK_HISTORIE,
  type Obdobie,
  type OdoslanyMail,
  type StavMailu,
} from "@/lib/faktero/odoslane-maily";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { cn } from "@/lib/utils";

/*
  Nastavenia → Odoslané e-maily: koľko e-mailov firma poslala, komu a akých,
  čo zlyhalo alebo zastavil strážca, a koľko z denného stropu je minuté.
  Dáta vydá server (odoslane-maily.functions.ts) len správcovi firmy.
*/
export const Route = createFileRoute("/_authenticated/nastavenia/odoslane-maily")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Odoslané e-maily — Faktero") }],
  }),
  component: OdoslaneMailyStranka,
});

const OBDOBIA: { v: Obdobie; label: string }[] = [
  { v: "mesiac", label: "Tento mesiac" },
  { v: "minuly", label: "Minulý mesiac" },
  { v: "rok", label: "Tento rok" },
  { v: "vlastne", label: "Vlastné" },
];

const TON_MAILU: Record<StavMailu, TonStavu> = {
  odoslane: "uspech",
  rezervovane: "priebeh",
  zlyhalo: "chyba",
  zastavene: "pozor",
};

const datumSk = (d: string) => {
  const [r, m, dd] = d.slice(0, 10).split("-");
  return `${Number(dd)}. ${Number(m)}. ${r}`;
};
const cas = (iso: string) => {
  const [d, h] = casBratislava(iso).split(" ");
  return `${datumSk(d)} ${h}`;
};

const POCIATOCNE_ADRESATOV = 15;
const POCIATOCNE_ZOZNAM = 50;

function OdoslaneMailyStranka() {
  const { t } = useT();
  const [companyId] = useState<string | null>(() => getActiveCompanyId());
  const nacitaj = useServerFn(odoslaneMailyFn);
  const dnes = datumBratislava(new Date());
  const [obdobie, setObdobie] = useState<Obdobie>("mesiac");
  const [vlastne, setVlastne] = useState<{ od: string; do: string }>(() =>
    rozsahObdobia("mesiac", dnes),
  );
  const rozsah = rozsahObdobia(obdobie, dnes, vlastne);
  const [vsetciAdresati, setVsetciAdresati] = useState(false);
  const [zoznamPocet, setZoznamPocet] = useState(POCIATOCNE_ZOZNAM);
  const [filterDruh, setFilterDruh] = useState("");
  const [lenChyby, setLenChyby] = useState(false);

  const q = useQuery({
    queryKey: ["odoslane-maily", companyId, rozsah.od, rozsah.do],
    enabled: !!companyId,
    queryFn: () => nacitaj({ data: { company_id: companyId!, od: rozsah.od, do: rozsah.do } }),
    // Bez oprávnenia (nie správca) server odmietne hneď — opakovanie by len odďaľovalo hlášku.
    retry: false,
  });

  const maily = useMemo(() => q.data?.maily ?? [], [q.data]);
  const suhrn = useMemo(() => suhrnMailov(maily), [maily]);
  const chyby = useMemo(() => maily.filter((m) => !jeOdoslany(m)), [maily]);
  const zoznam = useMemo(
    () =>
      maily.filter(
        (m) => (!filterDruh || m.druh === filterDruh) && (!lenChyby || !jeOdoslany(m)),
      ),
    [maily, filterDruh, lenChyby],
  );

  function stiahniCsv() {
    const csv = mailyDoCsv(maily, (s) => t(s));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `odoslane-emaily-${rozsah.od}-${rozsah.do}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const neuplne = rozsah.od < ZACIATOK_EVIDENCIE.slice(0, 10);

  return (
    <>
      <PageHeader
        title={t("Odoslané e-maily")}
        description={t(
          "Koľko e-mailov Faktero poslalo v mene firmy, komu a akých — faktúry, upomienky, ponuky, pozvánky aj podklady účtovníkovi.",
        )}
        action={
          <button
            type="button"
            onClick={stiahniCsv}
            disabled={!maily.length}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-semibold hover:bg-secondary disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden />
            {t("CSV")}
          </button>
        }
      />
      <PageBody>
        <div className="max-w-5xl space-y-5">
          {/* Obdobie */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex max-w-full flex-wrap rounded-lg border border-input bg-background p-0.5 text-sm"
              role="group"
              aria-label={t("Obdobie")}
            >
              {OBDOBIA.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={obdobie === o.v}
                  onClick={() => {
                    setObdobie(o.v);
                    setZoznamPocet(POCIATOCNE_ZOZNAM);
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-semibold",
                    obdobie === o.v
                      ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {t(o.label)}
                </button>
              ))}
            </div>
            {obdobie === "vlastne" ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">{t("Od")}</span>
                  <input
                    type="date"
                    value={vlastne.od}
                    max={dnes}
                    onChange={(e) => e.target.value && setVlastne((v) => ({ ...v, od: e.target.value }))}
                    className="h-9 rounded-md border border-input bg-background px-2"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">{t("Do")}</span>
                  <input
                    type="date"
                    value={vlastne.do}
                    max={dnes}
                    onChange={(e) => e.target.value && setVlastne((v) => ({ ...v, do: e.target.value }))}
                    className="h-9 rounded-md border border-input bg-background px-2"
                  />
                </label>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">
                {datumSk(rozsah.od)} – {datumSk(rozsah.do)}
              </span>
            )}
          </div>

          {q.isLoading ? (
            <NacitavanieStav />
          ) : q.error ? (
            <div className="rounded-xl border border-border bg-card">
              <ChybovyStav
                nadpis="Odoslané e-maily sa nepodarilo načítať"
                popis={t(String((q.error as any)?.message ?? ""))}
              />
            </div>
          ) : q.data ? (
            <>
              <Strazca s={q.data.strazca} />

              {neuplne && (
                <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {t(
                      "Úplná evidencia všetkých e-mailov je od {od}. Pred týmto dňom sú v súhrne len faktúry, upomienky a cenové ponuky (faktúry od {fakt}).",
                      {
                        od: datumSk(ZACIATOK_EVIDENCIE),
                        fakt: datumSk(ZACIATOK_HISTORIE),
                      },
                    )}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Dlazdica label={t("Odoslaných e-mailov")} hodnota={suhrn.emailov} />
                <Dlazdica
                  label={t("Rôznych adresátov")}
                  hodnota={suhrn.roznychAdresatov}
                  pozn={
                    suhrn.adresatov !== suhrn.emailov
                      ? t("{n} doručení spolu", { n: suhrn.adresatov })
                      : undefined
                  }
                />
                <Dlazdica label={t("Neodoslané (chyba)")} hodnota={suhrn.zlyhalo} cervena />
                <Dlazdica label={t("Zastavené strážcom")} hodnota={suhrn.zastavene} cervena />
              </div>

              {maily.length === 0 ? (
                <div className="rounded-xl border border-border bg-card">
                  <EmptyState
                    icon={Mail}
                    title="V tomto období neodišiel žiadny e-mail"
                    description="Vyberte iné obdobie, alebo pošlite faktúru či ponuku e-mailom."
                  />
                </div>
              ) : (
                <>
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    {/* Podľa druhu */}
                    <section className="min-w-0 rounded-xl border border-border bg-card p-5">
                      <h2 className="text-base font-semibold">{t("Podľa druhu")}</h2>
                      <ul className="mt-3 space-y-3">
                        {suhrn.poDruhoch.map((d) => {
                          const max = Math.max(1, ...suhrn.poDruhoch.map((x) => x.emailov));
                          return (
                            <li key={d.druh} className="text-sm">
                              <div className="flex items-baseline justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => setFilterDruh(filterDruh === d.druh ? "" : d.druh)}
                                  className="min-w-0 truncate text-left hover:underline"
                                >
                                  {t(d.nazov)}
                                </button>
                                <PocetSChybami emailov={d.emailov} chyby={d.chyby} />
                              </div>
                              <div className="mt-1 h-1.5 rounded-full bg-muted" aria-hidden>
                                <div
                                  className="h-1.5 rounded-full bg-primary"
                                  style={{ width: `${(d.emailov / max) * 100}%` }}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>

                    {/* Kto odosielal */}
                    <section className="min-w-0 rounded-xl border border-border bg-card p-5">
                      <h2 className="text-base font-semibold">{t("Kto odosielal")}</h2>
                      <ul className="mt-3 divide-y divide-border text-sm">
                        {suhrn.poOdosielateloch.map((o) => (
                          <li key={o.kto ?? "-"} className="flex justify-between gap-3 py-2">
                            <span className={cn("min-w-0 truncate", !o.kto && "text-muted-foreground")}>
                              {o.kto ?? t("Automaticky (upomienky, API, appka)")}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums">{o.emailov}</span>
                          </li>
                        ))}
                        {suhrn.poOdosielateloch.length === 0 && (
                          <li className="py-2 text-muted-foreground">—</li>
                        )}
                      </ul>
                      {suhrn.cezSmtp > 0 && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          {t("Cez vlastný SMTP server firmy odišlo {n} z nich.", {
                            n: suhrn.cezSmtp,
                          })}
                        </p>
                      )}
                    </section>
                  </div>

                  {/* Podľa adresátov */}
                  <section className="rounded-xl border border-border bg-card">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 p-5 pb-3">
                      <h2 className="text-base font-semibold">{t("Podľa adresátov")}</h2>
                      <span className="text-xs text-muted-foreground">
                        {t("{n} adresátov", { n: suhrn.poAdresatoch.length })}
                      </span>
                    </div>
                    <ul className="divide-y divide-border border-t border-border text-sm">
                      {(vsetciAdresati
                        ? suhrn.poAdresatoch
                        : suhrn.poAdresatoch.slice(0, POCIATOCNE_ADRESATOV)
                      ).map((a) => (
                        <li
                          key={a.adresa}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-5 py-2.5 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto_10rem]"
                        >
                          <span className="min-w-0 break-all font-medium">{a.adresa}</span>
                          <span className="row-start-2 min-w-0 truncate text-xs text-muted-foreground md:row-start-auto md:text-sm">
                            {a.odberatel ?? ""}
                            <span className="md:hidden">
                              {a.odberatel ? " · " : ""}
                              {t("naposledy {cas}", { cas: cas(a.posledne) })}
                            </span>
                          </span>
                          <PocetSChybami
                            emailov={a.emailov}
                            chyby={a.chyby}
                            className="row-span-2 md:row-span-1"
                          />
                          <span className="hidden text-right text-xs text-muted-foreground md:block">
                            {cas(a.posledne)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {suhrn.poAdresatoch.length > POCIATOCNE_ADRESATOV && (
                      <div className="border-t border-border px-5 py-3">
                        <button
                          type="button"
                          onClick={() => setVsetciAdresati((x) => !x)}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          {vsetciAdresati
                            ? t("Zobraziť menej")
                            : t("Zobraziť všetkých ({n})", { n: suhrn.poAdresatoch.length })}
                        </button>
                      </div>
                    )}
                  </section>

                  {/* Chyby a zastavené */}
                  {chyby.length > 0 && (
                    <section className="rounded-xl border border-border bg-card p-5">
                      <h2 className="text-base font-semibold">{t("Chyby a zastavené")}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t(
                          "E-maily, ktoré neodišli — poštová služba ich odmietla, alebo ich zastavil strážca odosielania (strop adresátov, podozrivý obsah).",
                        )}
                      </p>
                      <ul className="mt-3 divide-y divide-border text-sm">
                        {chyby.slice(0, 20).map((m) => (
                          <RiadokMailu key={m.id} m={m} />
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Posledné odoslania */}
                  <section className="rounded-xl border border-border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
                      <h2 className="text-base font-semibold">{t("Posledné odoslania")}</h2>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <select
                          value={filterDruh}
                          onChange={(e) => setFilterDruh(e.target.value)}
                          aria-label={t("Druh")}
                          className="h-9 max-w-full rounded-md border border-input bg-background px-2"
                        >
                          <option value="">{t("Všetky druhy")}</option>
                          {suhrn.poDruhoch.map((d) => (
                            <option key={d.druh} value={d.druh}>
                              {t(d.nazov)}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={lenChyby}
                            onChange={(e) => setLenChyby(e.target.checked)}
                            className="h-4 w-4 accent-primary"
                          />
                          {t("Len neodoslané")}
                        </label>
                      </div>
                    </div>
                    <ul className="divide-y divide-border border-t border-border px-5 text-sm">
                      {zoznam.slice(0, zoznamPocet).map((m) => (
                        <RiadokMailu key={m.id} m={m} />
                      ))}
                      {zoznam.length === 0 && (
                        <li className="py-6 text-center text-muted-foreground">
                          {t("Nič nevyhovuje filtru.")}
                        </li>
                      )}
                    </ul>
                    {zoznam.length > zoznamPocet && (
                      <div className="border-t border-border px-5 py-3">
                        <button
                          type="button"
                          onClick={() => setZoznamPocet((n) => n + 100)}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          {t("Zobraziť ďalšie ({n})", { n: zoznam.length - zoznamPocet })}
                        </button>
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          ) : null}
        </div>
      </PageBody>
    </>
  );
}

/** Počet odoslaných, pri neodoslaných aj ich počet na červeno (bez „0“, keď nič neodišlo). */
function PocetSChybami({
  emailov,
  chyby,
  className,
}: {
  emailov: number;
  chyby: number;
  className?: string;
}) {
  const { t } = useT();
  return (
    <span className={cn("shrink-0 text-right tabular-nums", className)}>
      {(emailov > 0 || chyby === 0) && <span className="font-semibold">{emailov}</span>}
      {chyby > 0 && (
        <span className={cn("text-xs fk-text-chyba", emailov > 0 && "ml-2")}>
          {t("{n} neodoslané", { n: chyby })}
        </span>
      )}
    </span>
  );
}

function Dlazdica({
  label,
  hodnota,
  pozn,
  cervena,
}: {
  label: string;
  hodnota: number;
  pozn?: string;
  cervena?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          cervena && hodnota > 0 && "fk-text-chyba",
        )}
      >
        {hodnota}
      </div>
      {pozn && <div className="mt-0.5 text-xs text-muted-foreground">{pozn}</div>}
    </div>
  );
}

function Strazca({
  s,
}: {
  s: {
    zaDen: number;
    stropDen: number;
    zaHodinu: number;
    stropHodina: number;
    naMail: number;
    nova: boolean;
    pozastavene: boolean;
  };
}) {
  const { t } = useT();
  const pomer = Math.min(1, s.zaDen / Math.max(1, s.stropDen));
  const ton = s.pozastavene || pomer >= 0.9 ? "bg-destructive" : pomer >= 0.7 ? "bg-warning" : "bg-primary";
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold">{t("Strop odosielania")}</h2>
        {s.pozastavene ? (
          <StavOdznak ton="chyba" maly>
            {t("Odosielanie je pozastavené")}
          </StavOdznak>
        ) : (
          <span className="text-sm">
            {t("Za posledných 24 h {n} z {max} adresátov", { n: s.zaDen, max: s.stropDen })}
          </span>
        )}
      </div>
      <div
        className="mt-3 h-2 rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={s.stropDen}
        aria-valuenow={s.zaDen}
        aria-label={t("Adresáti za posledných 24 h")}
      >
        <div className={cn("h-2 rounded-full", ton)} style={{ width: `${pomer * 100}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t(
          "Strážca odosielania chráni firmu aj odberateľov pred zneužitím účtu: najviac {den} rôznych adresátov za 24 hodín, {mail} na jeden e-mail či doklad a {hod} za hodinu (teraz {teraz}).",
          { den: s.stropDen, mail: s.naMail, hod: s.stropHodina, teraz: s.zaHodinu },
        )}{" "}
        {s.nova && t("Nová firma má prvých 7 dní nižšie stropy.")}{" "}
        {s.pozastavene
          ? t("Ozvite sa nám na podpora@faktero.sk.")
          : t("Ak potrebujete viac, napíšte nám na podpora@faktero.sk.")}
      </p>
    </section>
  );
}

function OdkazDokladu({ m }: { m: OdoslanyMail }) {
  const { t } = useT();
  const d = m.doklad;
  if (!d) return null;
  const text = d.cislo || t("Doklad");
  const cls = "cislo-dokladu font-medium text-primary hover:underline";
  if (d.typ === "faktura")
    return (
      <Link to="/faktury/$id" params={{ id: d.id }} className={cls}>
        {text}
      </Link>
    );
  if (d.typ === "ponuka")
    return (
      <Link to="/ponuky/$id" params={{ id: d.id }} className={cls}>
        {text}
      </Link>
    );
  return (
    <Link to="/prijate-faktury/$id" params={{ id: d.id }} className={cls}>
      {text}
    </Link>
  );
}

function RiadokMailu({ m }: { m: OdoslanyMail }) {
  const { t } = useT();
  return (
    <li className="flex flex-col gap-1 py-3 md:flex-row md:items-start md:gap-4">
      <span className="shrink-0 text-xs text-muted-foreground md:w-32 md:pt-0.5">{cas(m.cas)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">{t(nazovDruhu(m.druh))}</span>
          <OdkazDokladu m={m} />
          {m.odberatel && (
            <span className="min-w-0 truncate text-muted-foreground">{m.odberatel}</span>
          )}
        </div>
        <div className="mt-0.5 break-all text-xs text-muted-foreground">
          {m.adresati.length
            ? m.adresati.join(", ")
            : t("{n} adresátov (adresy sa pri zastavení neukladajú)", { n: m.pocet })}
        </div>
        {m.chyba && !jeOdoslany(m) && (
          <div className="mt-1 break-words text-xs fk-text-chyba">{m.chyba}</div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-col md:items-end">
        <StavOdznak ton={TON_MAILU[m.stav] ?? "neutralny"} maly>
          {t(textStavu(m.stav))}
        </StavOdznak>
        <span className="text-xs text-muted-foreground">
          {m.kto ?? t("Automaticky")}
          {m.cez === "smtp" ? ` · ${t("vlastný SMTP")}` : ""}
        </span>
      </div>
    </li>
  );
}
