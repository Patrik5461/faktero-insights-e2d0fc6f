import { createFileRoute } from "@tanstack/react-router";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { CislovaniePoImporte } from "@/components/faktero/CislovaniePoImporte";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { TRIEDA_KLIK_RIADKU, useKlikNaRiadok } from "@/hooks/useKlikNaRiadok";
import { cn } from "@/lib/utils";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { Plus, Star, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/faktero/ListControls";
import { StavOdznak } from "@/components/faktero/web/Stav";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import {
  DRUHY_RADOV,
  NAZVY_DRUHOV,
  chybaSablony,
  normalizujSablonu,
  predlohyRadu,
  upozornenieSablony,
  resetujeSaMesacne,
  ukazkaCisla,
  type CiselnyRad,
  type DruhRadu,
} from "@/lib/faktero/ciselne-rady";
import {
  ciselneRadyFn,
  ulozCiselnyRadFn,
  zmazCiselnyRadFn,
  radyZImportuFn,
} from "@/lib/faktero/ciselne-rady.functions";

export const Route = createFileRoute("/_authenticated/ciselne-rady/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Číselné rady — Faktero") }] }),
  component: CiselneRadyPage,
});

/**
 * Správa číselných radov.
 *
 * Rad je šablóna čísla viazaná na druh dokladu. Na jeden druh ich môže byť
 * viac — pobočka, prevádzka, oddelený rad — a jeden je predvolený: z neho
 * číslujú cesty, ktoré sa nepýtajú (appka, API, opakované faktúry).
 */
function CiselneRadyPage() {
  const { t } = useT();
  const nacitaj = useServerFn(ciselneRadyFn);
  const uloz = useServerFn(ulozCiselnyRadFn);
  const zmaz = useServerFn(zmazCiselnyRadFn);
  const zImportu = useServerFn(radyZImportuFn);
  const [radyZImportu, setRadyZImportu] = useState<any[] | null>(null);
  const [hladam, setHladam] = useState(false);

  /** Faktúry prenesené z iného programu — v ktorom čísle sa má pokračovať. */
  async function rozpoznaj() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setHladam(true);
    try {
      const v = await zImportu({ data: { company_id: cid } });
      setRadyZImportu(v.rady);
      if (!v.rady.length) toast.info(t("Medzi naimportovanými faktúrami sme číslovanie nenašli."));
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa."));
    } finally {
      setHladam(false);
    }
  }

  const [rady, setRady] = useState<CiselnyRad[]>([]);
  const [loading, setLoading] = useState(true);
  const [upravovany, setUpravovany] = useState<Partial<CiselnyRad> | null>(null);
  const klik = useKlikNaRiadok();
  const [mazany, setMazany] = useState<CiselnyRad | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return setLoading(false);
    setLoading(true);
    try {
      const v = await nacitaj({ data: { company_id: cid } });
      setRady(v.rady);
    } catch (e: any) {
      toast.error(e?.message ?? t("Rady sa nepodarilo načítať."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const podlaDruhu = useMemo(() => {
    const mapa = new Map<DruhRadu, CiselnyRad[]>();
    for (const d of DRUHY_RADOV) mapa.set(d, []);
    for (const r of rady) mapa.get(r.kind)?.push(r);
    return mapa;
  }, [rady]);

  async function ulozRad() {
    const cid = getActiveCompanyId();
    if (!cid || !upravovany?.kind) return;
    const chyba = chybaSablony(upravovany.format ?? "");
    if (chyba) return toast.error(t(chyba));
    if (!(upravovany.name ?? "").trim()) return toast.error(t("Zadajte názov radu."));
    setBusy(true);
    try {
      await uloz({
        data: {
          company_id: cid,
          id: upravovany.id,
          kind: upravovany.kind,
          name: (upravovany.name ?? "").trim(),
          format: (upravovany.format ?? "").trim(),
          is_default: !!upravovany.is_default,
          active: upravovany.active !== false,
          start_from: Math.max(1, Number(upravovany.start_from ?? 1) || 1),
        },
      });
      toast.success(t("Číselný rad je uložený"));
      setUpravovany(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Rad sa nepodarilo uložiť."));
    } finally {
      setBusy(false);
    }
  }

  async function zmazRad() {
    const cid = getActiveCompanyId();
    if (!cid || !mazany) return;
    setBusy(true);
    try {
      await zmaz({ data: { company_id: cid, id: mazany.id } });
      toast.success(t("Rad je zmazaný"));
      setMazany(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Rad sa nepodarilo zmazať."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("Číselné rady")}
        description={t("Ako sa číslujú doklady. Na jeden druh môžete mať viac radov a pri vystavovaní si vyberiete.")}
      />
      <PageBody>
        {loading ? (
          <div className="rounded-xl border border-border bg-card">
            <NacitavanieStav />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-foreground">
                    {t("Prechod z iného programu")}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("Faktero z naimportovaných faktúr zistí, ako ste číslovali, a nové doklady nadviažu na posledné číslo.")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={rozpoznaj}
                  disabled={hladam}
                  className="rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50"
                >
                  {hladam ? t("Hľadám…") : t("Rozpoznať z naimportovaných faktúr")}
                </button>
              </div>
              {radyZImportu && <CislovaniePoImporte rady={radyZImportu} onZmena={load} />}
            </section>
            {DRUHY_RADOV.map((druh) => {
              const zoznam = podlaDruhu.get(druh) ?? [];
              return (
                <section key={druh} className="rounded-xl border border-border bg-card p-5">
                  {/* Bez flex-wrap: dlhý názov druhu sa zalomí v nadpise a tlačidlo ostane vpravo ako všade. */}
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="min-w-0 text-base font-semibold text-foreground">
                      {t(NAZVY_DRUHOV[druh])}
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        setUpravovany({
                          kind: druh,
                          name: "",
                          format: "",
                          is_default: zoznam.length === 0,
                          active: true,
                        })
                      }
                      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-card px-3 py-1.5 text-sm font-semibold hover:bg-accent"
                    >
                      <Plus className="h-3.5 w-3.5" /> {t("Pridať rad")}
                    </button>
                  </div>

                  {zoznam.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("Zatiaľ bez vlastného radu — doklady sa číslujú pôvodným tvarom a rad sa založí sám pri najbližšom doklade.")}
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {zoznam.map((r) => (
                        <li
                          key={r.id}
                          {...klik(null, { naKlik: () => setUpravovany(r) })}
                          className={cn("flex flex-wrap items-center gap-3 py-2.5", TRIEDA_KLIK_RIADKU)}
                        >
                          <span className="min-w-[10rem] flex-1 font-semibold">
                            {r.name}
                            {r.is_default && (
                              <StavOdznak ton="uspech" maly className="ml-2" ikona={<Star className="h-3 w-3" />}>
                                {t("predvolený")}
                              </StavOdznak>
                            )}
                            {!r.active && (
                              <StavOdznak ton="neutralny" maly className="ml-2">
                                {t("vypnutý")}
                              </StavOdznak>
                            )}
                          </span>
                          <code className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs">{r.format}</code>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            → {ukazkaCisla(r.format, r.start_from ?? 1)}
                          </span>
                          <span className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setUpravovany(r)}
                              className="rounded-md border border-input bg-card px-3 py-1.5 text-sm font-semibold hover:bg-accent"
                            >
                              {t("Upraviť")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setMazany(r)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title={t("Zmazať")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {upravovany && (
          <FormularRadu
            rad={upravovany}
            busy={busy}
            onZmena={setUpravovany}
            onUloz={ulozRad}
            onZrus={() => setUpravovany(null)}
          />
        )}

        <ConfirmDialog
          open={!!mazany}
          title={t("Zmazať číselný rad?")}
          message={mazany ? `${mazany.name} — ${mazany.format}` : ""}
          warning={t("Rad, z ktorého už doklady visia, sa zmazať nedá. Vtedy ho vypnite.")}
          confirmLabel={t("Zmazať")}
          busy={busy}
          onConfirm={zmazRad}
          onCancel={() => setMazany(null)}
        />
      </PageBody>
    </>
  );
}

/** Okno na pridanie či úpravu radu. */
function FormularRadu({
  rad,
  busy,
  onZmena,
  onUloz,
  onZrus,
}: {
  rad: Partial<CiselnyRad>;
  busy: boolean;
  onZmena: (r: Partial<CiselnyRad>) => void;
  onUloz: () => void;
  onZrus: () => void;
}) {
  const { t } = useT();
  const chyba = rad.format ? chybaSablony(rad.format) : null;
  /* Nie je to chyba — len nech človek vie, čo z jeho tvaru vyjde. */
  const upozornenie = rad.format ? upozornenieSablony(rad.format) : null;
  const hotovaSablona = rad.format ? normalizujSablonu(rad.format) : "";
  const predlohy = predlohyRadu(rad.kind as DruhRadu);
  /* Vlastný tvar sa odomkne buď voľbou, alebo keď rad nesie niečo mimo predlôh. */
  const [vlastna, setVlastna] = useState(
    Boolean(rad.format) && !predlohy.some((v) => v.format === rad.format),
  );
  useZatvorNaEscape(onZrus);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("Číselný rad")}
      data-slot="dialog-overlay"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onZrus()}
    >
      <div
        data-slot="dialog-content"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg"
      >
        <h3 className="mb-4 text-lg font-semibold">
          {rad.id ? t("Úprava radu") : t("Nový rad")} — {t(NAZVY_DRUHOV[rad.kind as DruhRadu])}
        </h3>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-foreground">{t("Názov")}</span>
            <input
              value={rad.name ?? ""}
              onChange={(e) => onZmena({ ...rad, name: e.target.value })}
              placeholder={t("Napríklad: Faktúry Trnava")}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="block">
            <label className="text-sm font-semibold text-foreground">{t("Šablóna čísla")}</label>
            {/*
              Väčšina firiem si vyberie jeden z bežných tvarov — tokeny sú
              zrozumiteľné, až keď je vidieť, čo z nich vyjde. Vlastný tvar
              ostáva pre tých, čo potrebujú niečo svoje.
            */}
            <select
              value={vlastna ? "vlastna" : (rad.format ?? "")}
              onChange={(e) => {
                if (e.target.value === "vlastna") {
                  setVlastna(true);
                  return;
                }
                setVlastna(false);
                onZmena({ ...rad, format: e.target.value });
              }}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {!rad.format && <option value="">{t("— vyberte tvar čísla —")}</option>}
              {predlohy.map((v) => (
                <option key={v.format} value={v.format}>
                  {ukazkaCisla(v.format, 1)} — {t(v.popis)}
                </option>
              ))}
              <option value="vlastna">{t("Vlastná šablóna…")}</option>
            </select>
            {vlastna && (
              <input
                autoFocus
                value={rad.format ?? ""}
                onChange={(e) => onZmena({ ...rad, format: e.target.value })}
                placeholder="{YYYY}{NNNN}"
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              />
            )}
            {vlastna && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("Napíšte si číslo, ako chcete. Čo vloží Faktero: {YYYY} rok, {YY} rok dvojčíslím, {MM} mesiac a {NN} až {NNNNNN} poradie (počet N = počet číslic). Všetko ostatné sa vytlačí tak, ako to napíšete. Keď poradie vynecháte, doplní sa na koniec.")}
              </span>
            )}
            {rad.format && !chyba && (
              <span className="mt-2 block rounded-md bg-muted px-3 py-2 text-sm">
                {t("Prvé číslo:")}{" "}
                <strong className="tabular-nums">
                  {ukazkaCisla(hotovaSablona, rad.start_from ?? 1)}
                </strong>
                {t(", desiate:")}{" "}
                <strong className="tabular-nums">
                  {ukazkaCisla(hotovaSablona, (rad.start_from ?? 1) + 9)}
                </strong>{" "}
                · {resetujeSaMesacne(hotovaSablona) ? t("poradie sa resetuje mesačne") : t("poradie sa resetuje ročne")}
              </span>
            )}
            {upozornenie && !chyba && (
              <span className="mt-2 block rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                {t(upozornenie)}
              </span>
            )}
            {chyba && (
              <span className="mt-2 block rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {t(chyba)}
              </span>
            )}
          </div>
          <label className="block">
            <span className="block text-sm font-semibold text-foreground">{t("Začať od poradia")}</span>
            <input
              type="number"
              min="1"
              value={rad.start_from ?? 1}
              onChange={(e) => onZmena({ ...rad, start_from: Number(e.target.value) || 1 })}
              className="mt-1 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("Pri prechode z iného programu sem dajte číslo, ktorým chcete nadviazať. Nižšie poradia sa už neponúknu.")}
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!rad.is_default}
              onChange={(e) => onZmena({ ...rad, is_default: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            {t("Predvolený rad tohto druhu")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rad.active !== false}
              onChange={(e) => onZmena({ ...rad, active: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            {t("Ponúkať pri vystavovaní")}
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onZrus}
            className="rounded-md border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-accent"
          >
            {t("Zrušiť")}
          </button>
          <button
            type="button"
            disabled={busy || !!chyba}
            onClick={onUloz}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("Uložiť")}
          </button>
        </div>
      </div>
    </div>
  );
}
