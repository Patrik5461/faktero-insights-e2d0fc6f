import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Inbox,
  ListTodo,
  Loader2,
  MessageSquare,
  PartyPopper,
} from "lucide-react";
import { obnovPoctyMenu } from "@/lib/faktero/pocty-menu";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { useKlikNaRiadok } from "@/hooks/useKlikNaRiadok";
import { useListFilters } from "@/hooks/useListFilters";
import { useStrankovanie } from "@/hooks/useStrankovanie";
import { cn } from "@/lib/utils";
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
 * komentáre, v ktorých ho kolega označil, prijaté eFaktúry a nespracované
 * doklady firmy. Používa ich samostatná stránka `/moje-ulohy` (plný zoznam)
 * a Prehľad: na širokej obrazovke ako bočný panel (`kompaktne`), na užšej
 * ako pás s počtami (`MojeUlohyPas`). Dáta načíta `useMojeUlohy` raz, aby
 * Prehľad pre panel aj pás nevolal server dvakrát.
 */

/** Zo schvaľovania ukážeme prvých pár, zvyšok je na stránke Na schválenie. */
const NAJVIAC_NA_SCHVALENIE = 10;
/** V bočnom paneli Prehľadu stačí z každej sekcie pár najnovších. */
const NAJVIAC_V_PANELI = 5;

type Schvalenie = Awaited<ReturnType<typeof cakajuNaMnaFn>>;
type Ulohy = Awaited<ReturnType<typeof mojeUlohyFn>>;

export type PoctyUloh = {
  schvalenie: number;
  komentare: number;
  nespracovane: number;
  efaktury: number;
};

export type MojeUlohyData = ReturnType<typeof useMojeUlohy>;

export function useMojeUlohy(companyId: string | null) {
  const { t } = useT();
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

  const pocty: PoctyUloh = {
    schvalenie: schvalenie?.polozky.length ?? 0,
    komentare: ulohy?.komentare.length ?? 0,
    nespracovane: ulohy?.nespracovane.pocet ?? 0,
    efaktury: ulohy?.efaktury.length ?? 0,
  };

  return {
    companyId,
    schvalenie,
    ulohy,
    chyba,
    riesim,
    vyriesit,
    obnov,
    pocty,
    nacitane: Boolean(schvalenie && ulohy),
  };
}

/**
 * Obsah Moje úlohy. Bez `data` si ich načíta sám (stránka Moje úlohy),
 * Prehľad podá dáta z `useMojeUlohy`, ktoré zdieľa s pásom.
 */
export function MojeUlohyPanel({
  companyId,
  kompaktne = false,
  data,
}: {
  companyId: string | null;
  kompaktne?: boolean;
  data?: MojeUlohyData;
}) {
  if (data) return <Obsah d={data} kompaktne={kompaktne} />;
  return <SoSvojimiDatami companyId={companyId} kompaktne={kompaktne} />;
}

function SoSvojimiDatami({ companyId, kompaktne }: { companyId: string | null; kompaktne: boolean }) {
  const d = useMojeUlohy(companyId);
  return <Obsah d={d} kompaktne={kompaktne} />;
}

function Obsah({ d, kompaktne }: { d: MojeUlohyData; kompaktne: boolean }) {
  const { t } = useT();
  const { schvalenie, ulohy, chyba, pocty } = d;
  const limit = kompaktne ? NAJVIAC_V_PANELI : NAJVIAC_NA_SCHVALENIE;

  const obal = (deti: ReactNode) =>
    kompaktne ? (
      <div className="space-y-3">
        <HlavickaPanela pocty={pocty} />
        {deti}
      </div>
    ) : (
      <>{deti}</>
    );

  if (!d.companyId) return obal(<p className="text-sm text-muted-foreground">{t("Vyberte firmu.")}</p>);
  if (!schvalenie || !ulohy)
    return obal(<NacitavanieStav className="rounded-xl border border-border bg-card" />);

  const odkazTrieda =
    "font-semibold text-primary underline underline-offset-2 hover:text-primary-hover";

  return obal(
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
        <div
          className={cn(
            "rounded-xl border border-border bg-card text-center shadow-sm",
            kompaktne ? "px-4 py-6" : "px-6 py-10",
          )}
        >
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl border border-border bg-card text-primary shadow-sm">
            <PartyPopper className="h-5 w-5" />
          </div>
          <p className="text-[15px] font-semibold">{t("Nič na vás nečaká")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Keď vám niekto pošle doklad na schválenie alebo vás označí v komentári, objaví sa tu.")}
          </p>
        </div>
      )}

      {/* V paneli sa prázdne „schvaľovanie nie je zapnuté“ neukazuje — je to nastavenie, nie úloha. */}
      {!(kompaktne && (!schvalenie.zapnute || schvalenie.polozky.length === 0)) && (
        <Sekcia
          kompaktne={kompaktne}
          ikona={<ClipboardCheck className="h-4 w-4" />}
          nadpis="Na schválenie"
          pocet={pocty.schvalenie}
          odkaz={
            schvalenie.zapnute
              ? { to: "/schvalovanie", text: kompaktne ? "Všetky" : "Schvaľovať všetky" }
              : undefined
          }
        >
          {!schvalenie.zapnute ? (
            <Prazdne>
              {t("Schvaľovanie dokladov nie je vo firme zapnuté.")}{" "}
              <Link to="/nastavenia/schvalovanie" className={odkazTrieda}>
                {t("Nastavenia → Schvaľovanie dokladov")}
              </Link>
            </Prazdne>
          ) : schvalenie.polozky.length === 0 ? (
            <Prazdne>{t("Nič nečaká na vaše schválenie.")}</Prazdne>
          ) : (
            <ul className="space-y-2">
              {schvalenie.polozky.slice(0, limit).map((p: any) => (
                <li key={`${p.agenda}:${p.id}`}>
                  <Link
                    {...(odkazNaDoklad(p.agenda, p.id) as any)}
                    className={cn(
                      "block rounded-lg border border-border transition-colors hover:border-input hover:bg-accent/60",
                      kompaktne ? "px-3 py-2" : "p-3",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <div className="min-w-0">
                        <div className={`break-words ${p.cislo ? "cislo-dokladu" : "font-medium text-muted-foreground"}`}>
                          {p.cislo || t("bez čísla")}
                        </div>
                        <div className="break-words text-sm text-muted-foreground">{p.partner ?? "—"}</div>
                      </div>
                      <div className="suma shrink-0">{sumaUlohy(p.suma, p.mena)}</div>
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
              {schvalenie.polozky.length > limit && (
                <li className="text-sm text-muted-foreground">
                  {t("…a ďalších {n} na stránke", { n: schvalenie.polozky.length - limit })}{" "}
                  <Link to="/schvalovanie" className={odkazTrieda}>
                    {t("Na schválenie")}
                  </Link>
                  .
                </li>
              )}
            </ul>
          )}
        </Sekcia>
      )}

      {!(kompaktne && ulohy.komentare.length === 0) && (
        <Sekcia
          kompaktne={kompaktne}
          ikona={<MessageSquare className="h-4 w-4" />}
          nadpis="Komentáre, kde ste označený"
          pocet={pocty.komentare}
          odkaz={kompaktne && ulohy.komentare.length > NAJVIAC_V_PANELI ? { to: "/moje-ulohy", text: "Všetky" } : undefined}
        >
          {ulohy.komentare.length === 0 ? (
            <Prazdne>{t("Žiadny nevyriešený komentár, v ktorom by vás kolega označil.")}</Prazdne>
          ) : kompaktne ? (
            <ul className="space-y-2">
              {ulohy.komentare.slice(0, NAJVIAC_V_PANELI).map((k) => (
                <Komentar key={k.id} k={k} d={d} kompaktne />
              ))}
            </ul>
          ) : (
            <KomentareStrankovane d={d} />
          )}
        </Sekcia>
      )}

      {/* Len keď niečo čaká — firma bez eFaktúr túto sekciu vôbec nepotrebuje. */}
      {ulohy.efaktury.length > 0 && (
        <Sekcia
          kompaktne={kompaktne}
          ikona={<Inbox className="h-4 w-4" />}
          nadpis="Zaevidovať prijaté eFaktúry"
          pocet={pocty.efaktury}
          odkaz={{ to: "/efaktura/prijate", text: kompaktne ? "Všetky" : "Prijaté eFaktúry" }}
        >
          <ul className="space-y-2">
            {ulohy.efaktury.slice(0, kompaktne ? NAJVIAC_V_PANELI : undefined).map((r) => (
              <li key={r.id}>
                <Link
                  to="/efaktura/prijate"
                  search={(r.cislo ? { q: r.cislo } : {}) as any}
                  className={cn(
                    "block rounded-lg border border-border transition-colors hover:border-input hover:bg-accent/60",
                    kompaktne ? "px-3 py-2" : "p-3",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <div className="break-words font-medium">
                        {r.dodavatel ?? <span className="text-muted-foreground">{t("Dodávateľ neurčený")}</span>}
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
            {!kompaktne && ulohy.efaktury.length >= 10 && (
              <li className="text-sm text-muted-foreground">
                {t("Ďalšie nájdete v")}{" "}
                <Link to="/efaktura/prijate" className={odkazTrieda}>
                  {t("Prijatých eFaktúrach")}
                </Link>
                .
              </li>
            )}
          </ul>
        </Sekcia>
      )}

      {!(kompaktne && ulohy.nespracovane.polozky.length === 0) && (
        <Sekcia
          kompaktne={kompaktne}
          ikona={<FileText className="h-4 w-4" />}
          nadpis="Nespracované doklady na kontrolu"
          pocet={pocty.nespracovane}
          odkaz={{ to: "/nespracovane", text: kompaktne ? "Všetky" : "Celý zoznam" }}
        >
          {ulohy.nespracovane.polozky.length === 0 ? (
            <Prazdne>{t("Všetko je spracované.")}</Prazdne>
          ) : (
            <ul className="space-y-2">
              {ulohy.nespracovane.polozky.slice(0, kompaktne ? NAJVIAC_V_PANELI : undefined).map((r: any) => {
                const s = stavCitania(r.stav);
                const druh = r.druh ? DRUHY_NESPRACOVANYCH.find((x) => x.kluc === r.druh)?.nazov : null;
                return (
                  <li key={`${r.typ}:${r.id}`}>
                    <Link
                      {...((r.typ === "blocek"
                        ? { to: "/doklady/novy", search: { id: r.id } }
                        : { to: "/nespracovane/$id", params: { id: r.id } }) as any)}
                      className={cn(
                        "block rounded-lg border border-border transition-colors hover:border-input hover:bg-accent/60",
                        kompaktne ? "px-3 py-2" : "p-3",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0">
                          <div className="break-words font-medium">
                            {r.dodavatel ?? <span className="text-muted-foreground">{t("Dodávateľ neurčený")}</span>}
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
                        <div className="suma shrink-0">{r.suma != null ? formatujMenu(r.suma, r.mena) : "—"}</div>
                      </div>
                      {/* Stav čítania — jednotné stavové odznaky (text bez zmeny). */}
                      <div className="mt-1.5 text-xs">
                        {s.ton === "cita" ? (
                          <StavOdznak ton="neutralny" maly ikona={<Loader2 className="h-3 w-3 animate-spin" aria-hidden />}>
                            {t(s.text)}
                          </StavOdznak>
                        ) : s.ton === "chyba" ? (
                          <StavOdznak ton="pozor" maly ikona={<AlertTriangle className="h-3 w-3" aria-hidden />}>
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
              {ulohy.nespracovane.pocet > Math.min(ulohy.nespracovane.polozky.length, kompaktne ? NAJVIAC_V_PANELI : Infinity) && (
                <li className="text-sm text-muted-foreground">
                  {t("…a ďalších {n} v", {
                    n:
                      ulohy.nespracovane.pocet -
                      Math.min(ulohy.nespracovane.polozky.length, kompaktne ? NAJVIAC_V_PANELI : Infinity),
                  })}{" "}
                  <Link to="/nespracovane" className={odkazTrieda}>
                    {t("Nespracovaných dokladoch")}
                  </Link>
                  .
                </li>
              )}
            </ul>
          )}
        </Sekcia>
      )}
    </>,
  );
}

/** Komentárov môže byť až 100 — na stránke Moje úlohy sa stránkujú. */
function KomentareStrankovane({ d }: { d: MojeUlohyData }) {
  const lf = useListFilters({ pageSizeKey: "moje-ulohy-komentare" });
  const stranky = useStrankovanie(d.ulohy?.komentare ?? [], lf);
  return (
    <>
      <ul className="space-y-2">
        {stranky.viditelne.map((k) => (
          <Komentar key={k.id} k={k} d={d} />
        ))}
      </ul>
      {stranky.stranky()}
    </>
  );
}

function Komentar({
  k,
  d,
  kompaktne = false,
}: {
  k: NonNullable<MojeUlohyData["ulohy"]>["komentare"][number];
  d: MojeUlohyData;
  kompaktne?: boolean;
}) {
  const { t, jazyk } = useT();
  const klik = useKlikNaRiadok();
  // Celá karta otvorí doklad (ak je ešte dostupný); tlačidlo Vyriešiť si klik nechá.
  const p = klik(k.dokladDostupny ? (odkazNaDoklad(k.agenda, k.dokladId) as any) : null, {
    klavesnica: false,
  });
  return (
    <li {...p} className={cn("rounded-lg border border-border bg-card", kompaktne ? "px-3 py-2" : "p-3", p.className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="min-w-0 break-words">
          <span className="font-medium text-foreground">{k.autor}</span> ·{" "}
          <span className="whitespace-nowrap tabular-nums">
            {new Date(k.vytvorene).toLocaleString(lokalJazyka(jazyk), {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
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
      <p className={cn("mt-1.5 whitespace-pre-wrap break-words text-sm", kompaktne && "line-clamp-3")}>{k.text}</p>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => void d.vyriesit(k.id, true)}
          disabled={d.riesim === k.id}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-input bg-card font-semibold transition-colors hover:bg-accent disabled:opacity-50",
            kompaktne ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
          )}
        >
          {d.riesim === k.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          )}
          {t("Vyriešiť")}
        </button>
      </div>
    </li>
  );
}

/** Nadpis bočného panela na Prehľade — názov, súčet a odkaz na celú stránku. */
function HlavickaPanela({ pocty }: { pocty: PoctyUloh }) {
  const { t } = useT();
  const spolu = pocty.schvalenie + pocty.komentare + pocty.nespracovane + pocty.efaktury;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
        <ListTodo className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="break-words">{t("Moje úlohy")}</span>
        {spolu > 0 && <Pocet n={spolu} />}
      </h2>
      <Link
        to="/moje-ulohy"
        className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover hover:underline"
      >
        {t("Otvoriť úlohy")} <ArrowUpRight className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}

function Pocet({ n }: { n: number }) {
  return (
    <span className="min-w-5 rounded-full bg-primary px-1.5 py-px text-center text-[11px] font-semibold leading-4 text-primary-foreground tabular-nums">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/**
 * Pás s počtami úloh nad Prehľadom (užšie okno, kde sa panel vedľa nezmestí).
 * Každá dlaždica vedie na stránku, kde sa úloha vybavuje.
 */
export function MojeUlohyPas({ data, className }: { data: MojeUlohyData; className?: string }) {
  const { t } = useT();
  const { pocty, nacitane, schvalenie, ulohy } = data;
  if (!data.companyId) return null;
  const polozky: { kluc: string; to: string; text: string; n: number; ikona: ReactNode }[] = [
    // Schvaľovanie len keď je vo firme zapnuté — inak by tam navždy svietila nula.
    ...(schvalenie?.zapnute || !nacitane
      ? [
          {
            kluc: "schvalenie",
            to: "/schvalovanie",
            text: "Na schválenie",
            n: pocty.schvalenie,
            ikona: <ClipboardCheck className="h-4 w-4" />,
          },
        ]
      : []),
    {
      kluc: "komentare",
      to: "/moje-ulohy",
      text: "Komentáre",
      n: pocty.komentare,
      ikona: <MessageSquare className="h-4 w-4" />,
    },
    {
      kluc: "nespracovane",
      to: "/nespracovane",
      text: "Nespracované",
      n: pocty.nespracovane,
      ikona: <FileText className="h-4 w-4" />,
    },
    ...((ulohy?.efaktury.length ?? 0) > 0
      ? [
          {
            kluc: "efaktury",
            to: "/efaktura/prijate",
            text: "eFaktúry",
            n: pocty.efaktury,
            ikona: <Inbox className="h-4 w-4" />,
          },
        ]
      : []),
  ];
  return (
    <section
      aria-label={t("Moje úlohy")}
      data-moje-ulohy-pas=""
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-sm",
        className,
      )}
    >
      <Link
        to="/moje-ulohy"
        className="inline-flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-accent/60"
      >
        <ListTodo className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        {t("Moje úlohy")}
      </Link>
      <ul className="flex min-w-0 flex-1 flex-wrap gap-2 max-sm:basis-full">
        {polozky.map((p) => (
          <li key={p.kluc} className="min-w-0">
            <Link
              to={p.to as any}
              className={cn(
                "inline-flex h-9 max-w-full items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                p.n > 0
                  ? "border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10"
                  : "border-border text-muted-foreground hover:bg-accent/60",
              )}
            >
              <span className={cn("shrink-0", p.n > 0 ? "text-primary" : "text-muted-foreground")} aria-hidden>
                {p.ikona}
              </span>
              <span className="truncate">{t(p.text)}</span>
              <span
                className={cn(
                  "suma shrink-0 font-semibold tabular-nums",
                  p.n > 0 ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {nacitane ? (p.n > 99 ? "99+" : p.n) : "…"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sekcia({
  ikona,
  nadpis,
  pocet,
  odkaz,
  kompaktne = false,
  children,
}: {
  ikona: ReactNode;
  nadpis: string;
  pocet: number;
  odkaz?: { to: string; text: string };
  kompaktne?: boolean;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <section className={cn("min-w-0 rounded-xl border border-border bg-card shadow-sm", kompaktne ? "p-3" : "p-4 sm:p-5")}>
      <div className={cn("flex flex-wrap items-center justify-between gap-2", kompaktne ? "mb-2" : "mb-3")}>
        <h2 className={cn("flex min-w-0 items-center gap-2 font-semibold", kompaktne ? "text-sm" : "text-base")}>
          <span
            className={cn(
              "grid shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground",
              kompaktne ? "h-6 w-6" : "h-7 w-7",
            )}
          >
            {ikona}
          </span>
          <span className="break-words">{t(nadpis)}</span>
          {pocet > 0 && <Pocet n={pocet} />}
        </h2>
        {odkaz && (
          <Link
            to={odkaz.to as any}
            className={cn(
              "shrink-0 font-semibold text-primary hover:text-primary-hover hover:underline",
              kompaktne ? "text-xs" : "text-sm",
            )}
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
