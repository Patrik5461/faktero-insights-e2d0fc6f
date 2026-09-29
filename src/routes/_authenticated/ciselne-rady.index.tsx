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
                            → {ukazkaCisla(r.format, 1)}
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
          <label className="block">
            <span className="text-[13px] font-semibold text-foreground">Šablóna čísla</span>
            <input
              value={rad.format ?? ""}
              onChange={(e) => onZmena({ ...rad, format: e.target.value })}
              placeholder="{YYYY}{NNNN}"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Tokeny: {"{YYYY}"} rok, {"{YY}"} rok dvojčíslím, {"{MM}"} mesiac, {"{NN}"} až{" "}
              {"{NNNNNN}"} poradie (počet N = počet číslic). Text okolo je predpona.
            </span>
            {rad.format && !chyba && (
              <span className="mt-2 block rounded-md bg-muted px-3 py-2 text-sm">
                Prvé číslo: <strong className="tabular-nums">{ukazkaCisla(rad.format, 1)}</strong>,
                desiate: <strong className="tabular-nums">{ukazkaCisla(rad.format, 10)}</strong> ·
                poradie sa resetuje {resetujeSaMesacne(rad.format) ? "mesačne" : "ročne"}
              </span>
            )}
            {chyba && (
              <span className="mt-2 block rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {chyba}
              </span>
            )}
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
