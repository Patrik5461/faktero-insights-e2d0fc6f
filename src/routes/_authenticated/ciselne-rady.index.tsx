import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { Plus, Star, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/faktero/ListControls";
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
} from "@/lib/faktero/ciselne-rady.functions";

export const Route = createFileRoute("/_authenticated/ciselne-rady/")({
  head: () => ({ meta: [{ title: "Číselné rady — Faktero" }] }),
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
  const nacitaj = useServerFn(ciselneRadyFn);
  const uloz = useServerFn(ulozCiselnyRadFn);
  const zmaz = useServerFn(zmazCiselnyRadFn);

  const [rady, setRady] = useState<CiselnyRad[]>([]);
  const [loading, setLoading] = useState(true);
  const [upravovany, setUpravovany] = useState<Partial<CiselnyRad> | null>(null);
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
      toast.error(e?.message ?? "Rady sa nepodarilo načítať.");
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
    if (chyba) return toast.error(chyba);
    if (!(upravovany.name ?? "").trim()) return toast.error("Zadajte názov radu.");
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
      toast.success("Číselný rad je uložený");
      setUpravovany(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Rad sa nepodarilo uložiť.");
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
      toast.success("Rad je zmazaný");
      setMazany(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Rad sa nepodarilo zmazať.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Číselné rady"
        description="Ako sa číslujú doklady. Na jeden druh môžete mať viac radov a pri vystavovaní si vyberiete."
      />
      <PageBody>
        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Načítavam…
          </div>
        ) : (
          <div className="space-y-6">
            {DRUHY_RADOV.map((druh) => {
              const zoznam = podlaDruhu.get(druh) ?? [];
              return (
                <section key={druh} className="rounded-2xl border border-border bg-card p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[13px] font-semibold uppercase tracking-wide text-foreground">
                      {NAZVY_DRUHOV[druh]}
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
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                    >
                      <Plus className="h-3.5 w-3.5" /> Pridať rad
                    </button>
                  </div>

                  {zoznam.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Zatiaľ bez vlastného radu — doklady sa číslujú pôvodným tvarom a rad sa založí
                      sám pri najbližšom doklade.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {zoznam.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                          <span className="min-w-[10rem] flex-1 font-medium">
                            {r.name}
                            {r.is_default && (
                              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                <Star className="h-3 w-3" /> predvolený
                              </span>
                            )}
                            {!r.active && (
                              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                vypnutý
                              </span>
                            )}
                          </span>
                          <code className="rounded bg-muted px-2 py-1 text-xs">{r.format}</code>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            → {ukazkaCisla(r.format, r.start_from ?? 1)}
                          </span>
                          <span className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setUpravovany(r)}
                              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                            >
                              Upraviť
                            </button>
                            <button
                              type="button"
                              onClick={() => setMazany(r)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title="Zmazať"
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
          title="Zmazať číselný rad?"
          message={mazany ? `${mazany.name} — ${mazany.format}` : ""}
          warning="Rad, z ktorého už doklady visia, sa zmazať nedá. Vtedy ho vypnite."
          confirmLabel="Zmazať"
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
      aria-label="Číselný rad"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onZrus()}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide">
          {rad.id ? "Úprava radu" : "Nový rad"} — {NAZVY_DRUHOV[rad.kind as DruhRadu]}
        </h3>
        <div className="space-y-4">
          <label className="block">
            <span className="text-[13px] font-semibold text-foreground">Názov</span>
            <input
              value={rad.name ?? ""}
              onChange={(e) => onZmena({ ...rad, name: e.target.value })}
              placeholder="Napríklad: Faktúry Trnava"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="block">
            <label className="text-[13px] font-semibold text-foreground">Šablóna čísla</label>
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
              {!rad.format && <option value="">— vyberte tvar čísla —</option>}
              {predlohy.map((v) => (
                <option key={v.format} value={v.format}>
                  {ukazkaCisla(v.format, 1)} — {v.popis}
                </option>
              ))}
              <option value="vlastna">Vlastná šablóna…</option>
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
                Napíšte si číslo, ako chcete. Čo vloží Faktero: {"{YYYY}"} rok, {"{YY}"} rok
                dvojčíslím, {"{MM}"} mesiac a {"{NN}"} až {"{NNNNNN}"} poradie (počet N = počet
                číslic). Všetko ostatné sa vytlačí tak, ako to napíšete. Keď poradie vynecháte,
                doplní sa na koniec.
              </span>
            )}
            {rad.format && !chyba && (
              <span className="mt-2 block rounded-md bg-muted px-3 py-2 text-sm">
                Prvé číslo:{" "}
                <strong className="tabular-nums">
                  {ukazkaCisla(hotovaSablona, rad.start_from ?? 1)}
                </strong>
                , desiate:{" "}
                <strong className="tabular-nums">
                  {ukazkaCisla(hotovaSablona, (rad.start_from ?? 1) + 9)}
                </strong>{" "}
                · poradie sa resetuje {resetujeSaMesacne(hotovaSablona) ? "mesačne" : "ročne"}
              </span>
            )}
            {upozornenie && !chyba && (
              <span className="mt-2 block rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
                {upozornenie}
              </span>
            )}
            {chyba && (
              <span className="mt-2 block rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {chyba}
              </span>
            )}
          </div>
          <label className="block">
            <span className="text-[13px] font-semibold text-foreground">Začať od poradia</span>
            <input
              type="number"
              min="1"
              value={rad.start_from ?? 1}
              onChange={(e) => onZmena({ ...rad, start_from: Number(e.target.value) || 1 })}
              className="mt-1 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Pri prechode z iného programu sem dajte číslo, ktorým chcete nadviazať. Nižšie poradia
              sa už neponúknu.
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!rad.is_default}
              onChange={(e) => onZmena({ ...rad, is_default: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            Predvolený rad tohto druhu
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rad.active !== false}
              onChange={(e) => onZmena({ ...rad, active: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            Ponúkať pri vystavovaní
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onZrus}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            Zrušiť
          </button>
          <button
            type="button"
            disabled={busy || !!chyba}
            onClick={onUloz}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Uložiť
          </button>
        </div>
      </div>
    </div>
  );
}
