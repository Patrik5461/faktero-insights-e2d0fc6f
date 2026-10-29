import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
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
import {
  fetchMyCompanies,
  getActiveCompanyId,
  setActiveCompanyId,
} from "@/lib/faktero/active-company";
import { cakajuNaMnaFn } from "@/lib/faktero/schvalovanie.functions";
import { NAZVY_AGEND, NAZVY_STAVOV, type AgendaSchvalovania } from "@/lib/faktero/schvalovanie";
import { mojeUlohyFn, vyriesKomentarFn } from "@/lib/faktero/moje-ulohy.functions";
import { nicNecaka, odkazNaDoklad, popisDokladu, stavCitania } from "@/lib/faktero/moje-ulohy";
import { formatujMenu } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { DRUHY_NESPRACOVANYCH } from "@/lib/faktero/nespracovane";

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
  const { t } = useT();
  const { firma, dalej } = Route.useSearch();
  const navigate = useNavigate();
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
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Prepínam firmu…")}
          </p>
        ) : !companyId ? (
          <p className="text-sm text-muted-foreground">{t("Vyberte firmu.")}</p>
        ) : !nacitane ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
          </p>
        ) : (
          <>
            {chyba && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                {chyba}
              </p>
            )}
            {nicNecaka(pocty) && !chyba && (
              <div className="rounded-xl border border-border bg-card p-6 text-center">
                <PartyPopper className="mx-auto mb-2 h-8 w-8 text-primary" />
                <p className="font-medium">{t("Nič na vás nečaká")}</p>
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
                  <Link to="/nastavenia/schvalovanie" className="underline">
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
                        className="block rounded-lg border border-border p-3 hover:bg-muted/30"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                          <div className="min-w-0">
                            <div className="break-words font-medium">{p.cislo || t("bez čísla")}</div>
                            <div className="break-words text-sm text-muted-foreground">
                              {p.partner ?? "—"}
                            </div>
                          </div>
                          <div className="shrink-0 whitespace-nowrap font-semibold tabular-nums">
                            {formatujMenu(p.suma, p.mena)}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{t(NAZVY_AGEND[p.agenda as AgendaSchvalovania])}</span>
                          {p.datum ? <span>{datumNaDoklade(p.datum)}</span> : null}
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
                      <Link to="/schvalovanie" className="underline">
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
                  {ulohy.komentare.map((k) => (
                    <li key={k.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="min-w-0 break-words">
                          <span className="font-medium text-foreground">{k.autor}</span> ·{" "}
                          {new Date(k.vytvorene).toLocaleString("sk-SK", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                        {k.dokladDostupny ? (
                          <Link
                            {...(odkazNaDoklad(k.agenda, k.dokladId) as any)}
                            className="min-w-0 break-words font-medium text-primary hover:underline"
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
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
                        >
                          {riesim === k.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          )}
                          {t("Vyriešiť")}
                        </button>
                      </div>
                    </li>
                  ))}
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
                        className="block rounded-lg border border-border p-3 hover:bg-muted/30"
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
                          <div className="shrink-0 whitespace-nowrap font-semibold tabular-nums">
                            {r.suma != null && Number.isFinite(r.suma) ? formatujMenu(r.suma, r.mena) : "—"}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                  {ulohy.efaktury.length >= 10 && (
                    <li className="text-sm text-muted-foreground">
                      {t("Ďalšie nájdete v")}{" "}
                      <Link to="/efaktura/prijate" className="underline">
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
                          className="block rounded-lg border border-border p-3 hover:bg-muted/30"
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
                            <div className="shrink-0 whitespace-nowrap font-semibold tabular-nums">
                              {r.suma != null ? formatujMenu(r.suma, r.mena) : "—"}
                            </div>
                          </div>
                          <div className="mt-1 text-xs">
                            {s.ton === "cita" ? (
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t(s.text)}
                              </span>
                            ) : s.ton === "chyba" ? (
                              <span className="inline-flex items-center gap-1 text-amber-700">
                                <AlertTriangle className="h-3.5 w-3.5" /> {t(s.text)}
                              </span>
                            ) : (
                              <span className="text-emerald-700">{t(s.text)}</span>
                            )}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                  {ulohy.nespracovane.pocet > ulohy.nespracovane.polozky.length && (
                    <li className="text-sm text-muted-foreground">
                      {t("…a ďalších {n} v", { n: ulohy.nespracovane.pocet - ulohy.nespracovane.polozky.length })}{" "}
                      <Link to="/nespracovane" className="underline">
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
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          {ikona}
          <span className="break-words">{t(nadpis)}</span>
          {pocet > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold leading-4 text-primary-foreground tabular-nums">
              {pocet > 99 ? "99+" : pocet}
            </span>
          )}
        </h2>
        {odkaz && (
          <Link
            to={odkaz.to as any}
            className="shrink-0 text-sm font-medium text-primary hover:underline"
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
