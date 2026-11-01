import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { obnovPoctyMenu } from "@/lib/faktero/pocty-menu";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka, preloz } from "@/lib/i18n/jazyk";
import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Inbox,
  Loader2,
  MessageSquare,
  PartyPopper,
} from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { useKlikNaRiadok } from "@/hooks/useKlikNaRiadok";
import { cn } from "@/lib/utils";
import {
  fetchMyCompanies,
  getActiveCompanyId,
  setActiveCompanyId,
} from "@/lib/faktero/active-company";
import { cakajuNaMnaFn } from "@/lib/faktero/schvalovanie.functions";
import { NAZVY_AGEND, NAZVY_STAVOV, type AgendaSchvalovania } from "@/lib/faktero/schvalovanie";
import { mojeUlohyFn, vyriesKomentarFn } from "@/lib/faktero/moje-ulohy.functions";
import { nicNecaka, odkazNaDoklad, popisDokladu, stavCitania, sumaUlohy } from "@/lib/faktero/moje-ulohy";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { DRUHY_NESPRACOVANYCH } from "@/lib/faktero/nespracovane";
import { StavOdznak } from "@/components/faktero/web/Stav";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";

/**
 * Moje úlohy — čo čaká práve na prihláseného: doklady na jeho schválenie,
 * komentáre, v ktorých ho kolega označil, a nespracované doklady firmy.
 * Predtým to bolo na troch miestach a človek o úlohe vedel len zo zvončeka.
 */
export const Route = createFileRoute("/_authenticated/moje-ulohy")({
  /*
    Odkaz z denného e-mailového súhrnu nesie firmu (`?firma=`) — človek
    s viacerými firmami má v e-maile sekciu za každú a klik musí otvoriť
    úlohy tej firmy, nie tej, ktorá je práve vybraná. `dalej=po-splatnosti`
    po prepnutí pokračuje na faktúry po splatnosti, `dalej=efaktury`
    (e-mail o prijatej eFaktúre) na Prijaté eFaktúry.
  */
  validateSearch: (
    s: Record<string, unknown>,
  ): { firma?: string; dalej?: "po-splatnosti" | "efaktury" } => ({
    firma: typeof s.firma === "string" && /^[0-9a-f-]{36}$/i.test(s.firma) ? s.firma : undefined,
    dalej:
      s.dalej === "po-splatnosti" ? "po-splatnosti" : s.dalej === "efaktury" ? "efaktury" : undefined,
  }),
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk ?? "sk", "Moje úlohy — Faktero") }] }),
  component: Stranka,
});

/** Zo schvaľovania ukážeme prvých pár, zvyšok je na stránke Na schválenie. */
const NAJVIAC_NA_SCHVALENIE = 10;

type Schvalenie = Awaited<ReturnType<typeof cakajuNaMnaFn>>;
type Ulohy = Awaited<ReturnType<typeof mojeUlohyFn>>;

function Stranka() {
  const { t, jazyk } = useT();
  const { firma, dalej } = Route.useSearch();
  const navigate = useNavigate();
  const klik = useKlikNaRiadok();
  const prepnut = Boolean(firma && firma !== getActiveCompanyId());
  const [prepinam, setPrepinam] = useState(prepnut);
  const companyId = prepinam ? null : getActiveCompanyId();

  // Firma z odkazu v e-maile: prepnúť (len ak je človek jej členom) a stránku načítať nanovo.
  useEffect(() => {
    if (!firma) return;
    if (!prepnut) {
      if (dalej === "po-splatnosti")
        void navigate({ to: "/faktury", search: { poSplatnosti: true }, replace: true });
      else if (dalej === "efaktury") void navigate({ to: "/efaktura/prijate", replace: true });
      else void navigate({ to: "/moje-ulohy", search: {}, replace: true });
      return;
    }
    fetchMyCompanies()
      .then((firmy) => {
        if (firmy.some((f: any) => f.id === firma)) {
          setActiveCompanyId(firma);
          window.location.replace(
            dalej === "po-splatnosti"
              ? "/faktury?poSplatnosti=true"
              : dalej === "efaktury"
                ? "/efaktura/prijate"
                : "/moje-ulohy",
          );
        } else {
          toast.error(t("K firme z odkazu nemáte prístup — ukazujem úlohy vybranej firmy."));
          setPrepinam(false);
          void navigate({ to: "/moje-ulohy", search: {}, replace: true });
        }
      })
      .catch(() => setPrepinam(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const nacitajSchvalenie = useServerFn(cakajuNaMnaFn);
  const nacitajUlohy = useServerFn(mojeUlohyFn);
  const vyries = useServerFn(vyriesKomentarFn);
  const [schvalenie, setSchvalenie] = useState<Schvalenie | null>(null);
  const [ulohy, setUlohy] = useState<Ulohy | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [riesim, setRiesim] = useState<string | null>(null);

  const obnov = async () => {
    if (!companyId) return;
    setChyba(null);
    // Každá sekcia zvlášť — keď zlyhá jedna, ostatné sa aj tak ukážu.
    await Promise.all([
      nacitajSchvalenie({ data: { company_id: companyId } })
        .then(setSchvalenie)
        .catch(() => setSchvalenie({ zapnute: false, polozky: [] })),
      nacitajUlohy({ data: { company_id: companyId } })
        .then(setUlohy)
        .catch((e: any) => {
          setChyba(e?.message ?? t("Úlohy sa nepodarilo načítať"));
          setUlohy({ komentare: [], efaktury: [], nespracovane: { pocet: 0, polozky: [] } });
        }),
    ]);
  };
  useEffect(() => {
    void obnov();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function vyriesit(id: string, vyriesene: boolean) {
    if (!companyId) return;
    setRiesim(id);
    try {
      await vyries({ data: { company_id: companyId, id, vyriesene } });
      obnovPoctyMenu();
      if (vyriesene) {
        setUlohy((u) => (u ? { ...u, komentare: u.komentare.filter((k) => k.id !== id) } : u));
        toast.success(t("Komentár je vyriešený"), {
          action: { label: t("Späť"), onClick: () => void vyriesit(id, false) },
        });
      } else {
        await obnov();
      }
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setRiesim(null);
    }
  }

  const nacitane = schvalenie && ulohy;
  const pocty = {
    schvalenie: schvalenie?.polozky.length ?? 0,
    komentare: ulohy?.komentare.length ?? 0,
    nespracovane: ulohy?.nespracovane.pocet ?? 0,
    efaktury: ulohy?.efaktury.length ?? 0,
  };

  return (
    <>
      <PageHeader
        title={t("Moje úlohy")}
        description={t("Doklady na vaše schválenie, komentáre, v ktorých vás kolega označil, a doklady čakajúce na kontrolu.")}
      />
      <PageBody>
        {prepinam ? (
          <NacitavanieStav text="Prepínam firmu…" className="rounded-xl border border-border bg-card" />
        ) : !companyId ? (
          <p className="text-sm text-muted-foreground">{t("Vyberte firmu.")}</p>
        ) : !nacitane ? (
          <NacitavanieStav className="rounded-xl border border-border bg-card" />
        ) : (
          <>
            {chyba && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-[var(--stav-pozor-bod)]/50 bg-[var(--stav-pozor-plocha)] px-3 py-2 text-sm text-[var(--stav-pozor-text)]"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{chyba}</span>
              </p>
            )}
            {nicNecaka(pocty) && !chyba && (
              <div className="rounded-xl border border-border bg-card px-6 py-10 text-center shadow-sm">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl border border-border bg-card text-primary shadow-sm">
                  <PartyPopper className="h-5 w-5" />
                </div>
                <p className="text-[15px] font-semibold">{t("Nič na vás nečaká")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("Keď vám niekto pošle doklad na schválenie alebo vás označí v komentári, objaví sa tu.")}
                </p>
              </div>
            )}

            <Sekcia
              ikona={<ClipboardCheck className="h-4 w-4" />}
              nadpis="Na schválenie"
              pocet={pocty.schvalenie}
              odkaz={
                schvalenie.zapnute ? { to: "/schvalovanie", text: "Schvaľovať všetky" } : undefined
              }
            >
              {!schvalenie.zapnute ? (
                <Prazdne>
                  {t("Schvaľovanie dokladov nie je vo firme zapnuté.")}{" "}
                  <Link to="/nastavenia/schvalovanie" className="font-semibold text-primary underline underline-offset-2 hover:text-primary-hover">
                    {t("Nastavenia → Schvaľovanie dokladov")}
                  </Link>
                </Prazdne>
              ) : schvalenie.polozky.length === 0 ? (
                <Prazdne>{t("Nič nečaká na vaše schválenie.")}</Prazdne>
              ) : (
                <ul className="space-y-2">
                  {schvalenie.polozky.slice(0, NAJVIAC_NA_SCHVALENIE).map((p: any) => (
                    <li key={`${p.agenda}:${p.id}`}>
                      <Link
                        {...(odkazNaDoklad(p.agenda, p.id) as any)}
                        className="block rounded-lg border border-border p-3 transition-colors hover:border-input hover:bg-accent/60"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                          <div className="min-w-0">
                            <div className={`break-words ${p.cislo ? "cislo-dokladu" : "font-medium text-muted-foreground"}`}>
                              {p.cislo || t("bez čísla")}
                            </div>
                            <div className="break-words text-sm text-muted-foreground">
                              {p.partner ?? "—"}
                            </div>
                          </div>
                          <div className="suma shrink-0">
                            {sumaUlohy(p.suma, p.mena)}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{t(NAZVY_AGEND[p.agenda as AgendaSchvalovania])}</span>
                          {p.datum ? <span className="whitespace-nowrap tabular-nums">{datumNaDoklade(p.datum)}</span> : null}
                          <span>
                            {t(NAZVY_STAVOV[p.stav as keyof typeof NAZVY_STAVOV] ?? "")} · {p.odznak}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                  {schvalenie.polozky.length > NAJVIAC_NA_SCHVALENIE && (
                    <li className="text-sm text-muted-foreground">
                      {t("…a ďalších {n} na stránke", { n: schvalenie.polozky.length - NAJVIAC_NA_SCHVALENIE })}{" "}
                      <Link to="/schvalovanie" className="font-semibold text-primary underline underline-offset-2 hover:text-primary-hover">
                        {t("Na schválenie")}
                      </Link>
                      .
                    </li>
                  )}
                </ul>
              )}
            </Sekcia>

            <Sekcia
              ikona={<MessageSquare className="h-4 w-4" />}
              nadpis="Komentáre, kde ste označený"
              pocet={pocty.komentare}
            >
              {ulohy.komentare.length === 0 ? (
                <Prazdne>{t("Žiadny nevyriešený komentár, v ktorom by vás kolega označil.")}</Prazdne>
              ) : (
                <ul className="space-y-2">
                  {ulohy.komentare.map((k) => {
                    // Celá karta otvorí doklad (ak je ešte dostupný); tlačidlo Vyriešiť si klik nechá.
                    const p = klik(k.dokladDostupny ? (odkazNaDoklad(k.agenda, k.dokladId) as any) : null, {
                      klavesnica: false,
                    });
                    return (
                    <li key={k.id} {...p} className={cn("rounded-lg border border-border bg-card p-3", p.className)}>
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="min-w-0 break-words">
                          <span className="font-medium text-foreground">{k.autor}</span> ·{" "}
                          <span className="whitespace-nowrap tabular-nums">{new Date(k.vytvorene).toLocaleString(lokalJazyka(jazyk), {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}</span>
                        </span>
                        {k.dokladDostupny ? (
                          <Link
                            {...(odkazNaDoklad(k.agenda, k.dokladId) as any)}
                            className="min-w-0 break-words font-semibold text-primary hover:text-primary-hover hover:underline"
                          >
                            {popisDokladu(k.agenda, k.cislo, k.partner)}
                          </Link>
                        ) : (
                          <span className="min-w-0 break-words">{t("Doklad už nie je dostupný")}</span>
                        )}
                      </div>
                      {/* Text komentára ide ako obyčajný text — žiadne HTML z databázy. */}
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm">{k.text}</p>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void vyriesit(k.id, true)}
                          disabled={riesim === k.id}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-50"
                        >
                          {riesim === k.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                          {t("Vyriešiť")}
                        </button>
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </Sekcia>

            {/* Len keď niečo čaká — firma bez eFaktúr túto sekciu vôbec nepotrebuje. */}
            {ulohy.efaktury.length > 0 && (
              <Sekcia
                ikona={<Inbox className="h-4 w-4" />}
                nadpis="Zaevidovať prijaté eFaktúry"
                pocet={pocty.efaktury}
                odkaz={{ to: "/efaktura/prijate", text: "Prijaté eFaktúry" }}
              >
                <ul className="space-y-2">
                  {ulohy.efaktury.map((r) => (
                    <li key={r.id}>
                      <Link
                        to="/efaktura/prijate"
                        search={(r.cislo ? { q: r.cislo } : {}) as any}
                        className="block rounded-lg border border-border p-3 transition-colors hover:border-input hover:bg-accent/60"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                          <div className="min-w-0">
                            <div className="break-words font-medium">
                              {r.dodavatel ?? (
                                <span className="text-muted-foreground">{t("Dodávateľ neurčený")}</span>
                              )}
                            </div>
                            <div className="break-words text-xs text-muted-foreground">
                              {[
                                r.cislo ?? t("bez čísla"),
                                r.prijate ? t("prijatá {datum}", { datum: datumNaDoklade(r.prijate.slice(0, 10)) }) : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                          <div className="suma shrink-0">
                            {r.suma != null && Number.isFinite(r.suma) ? formatujMenu(r.suma, r.mena) : "—"}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                  {ulohy.efaktury.length >= 10 && (
                    <li className="text-sm text-muted-foreground">
                      {t("Ďalšie nájdete v")}{" "}
                      <Link to="/efaktura/prijate" className="font-semibold text-primary underline underline-offset-2 hover:text-primary-hover">
                        {t("Prijatých eFaktúrach")}
                      </Link>
                      .
                    </li>
                  )}
                </ul>
              </Sekcia>
            )}

            <Sekcia
              ikona={<FileText className="h-4 w-4" />}
              nadpis="Nespracované doklady na kontrolu"
              pocet={pocty.nespracovane}
              odkaz={{ to: "/nespracovane", text: "Celý zoznam" }}
            >
              {ulohy.nespracovane.polozky.length === 0 ? (
                <Prazdne>{t("Všetko je spracované.")}</Prazdne>
              ) : (
                <ul className="space-y-2">
                  {ulohy.nespracovane.polozky.map((r: any) => {
                    const s = stavCitania(r.stav);
                    const druh = r.druh
                      ? DRUHY_NESPRACOVANYCH.find((d) => d.kluc === r.druh)?.nazov
                      : null;
                    return (
                      <li key={`${r.typ}:${r.id}`}>
                        <Link
                          {...((r.typ === "blocek"
                            ? { to: "/doklady/novy", search: { id: r.id } }
                            : { to: "/nespracovane/$id", params: { id: r.id } }) as any)}
                          className="block rounded-lg border border-border p-3 transition-colors hover:border-input hover:bg-accent/60"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <div className="min-w-0">
                              <div className="break-words font-medium">
                                {r.dodavatel ?? (
                                  <span className="text-muted-foreground">{t("Dodávateľ neurčený")}</span>
                                )}
                              </div>
                              <div className="break-words text-xs text-muted-foreground">
                                {[
                                  druh ? t(druh) : r.typ === "blocek" ? t("Bloček") : t("Druh neurčený"),
                                  r.cislo,
                                  r.datum ? datumNaDoklade(r.datum) : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            </div>
                            <div className="suma shrink-0">
                              {r.suma != null ? formatujMenu(r.suma, r.mena) : "—"}
                            </div>
                          </div>
                          {/* Stav čítania — jednotné stavové odznaky (text bez zmeny). */}
                          <div className="mt-1.5 text-xs">
                            {s.ton === "cita" ? (
                              <StavOdznak
                                ton="neutralny"
                                maly
                                ikona={<Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                              >
                                {t(s.text)}
                              </StavOdznak>
                            ) : s.ton === "chyba" ? (
                              <StavOdznak
                                ton="pozor"
                                maly
                                ikona={<AlertTriangle className="h-3 w-3" aria-hidden />}
                              >
                                {t(s.text)}
                              </StavOdznak>
                            ) : (
                              <StavOdznak ton="uspech" maly>
                                {t(s.text)}
                              </StavOdznak>
                            )}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                  {ulohy.nespracovane.pocet > ulohy.nespracovane.polozky.length && (
                    <li className="text-sm text-muted-foreground">
                      {t("…a ďalších {n} v", { n: ulohy.nespracovane.pocet - ulohy.nespracovane.polozky.length })}{" "}
                      <Link to="/nespracovane" className="font-semibold text-primary underline underline-offset-2 hover:text-primary-hover">
                        {t("Nespracovaných dokladoch")}
                      </Link>
                      .
                    </li>
                  )}
                </ul>
              )}
            </Sekcia>
          </>
        )}
      </PageBody>
    </>
  );
}

function Sekcia({
  ikona,
  nadpis,
  pocet,
  odkaz,
  children,
}: {
  ikona: ReactNode;
  nadpis: string;
  pocet: number;
  odkaz?: { to: string; text: string };
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            {ikona}
          </span>
          <span className="break-words">{t(nadpis)}</span>
          {pocet > 0 && (
            <span className="min-w-5 rounded-full bg-primary px-1.5 py-px text-center text-[11px] font-semibold leading-4 text-primary-foreground tabular-nums">
              {pocet > 99 ? "99+" : pocet}
            </span>
          )}
        </h2>
        {odkaz && (
          <Link
            to={odkaz.to as any}
            className="shrink-0 text-sm font-semibold text-primary hover:text-primary-hover hover:underline"
          >
            {t(odkaz.text)} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Prazdne({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
