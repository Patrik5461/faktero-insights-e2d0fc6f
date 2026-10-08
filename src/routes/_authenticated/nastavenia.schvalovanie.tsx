import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  nastavenieSchvalovaniaFn,
  ulozCestuFn,
  ulozNastavenieSchvalovaniaFn,
  zmazCestuFn,
} from "@/lib/faktero/schvalovanie.functions";
import { NAZVY_AGEND, type AgendaSchvalovania } from "@/lib/faktero/schvalovanie";
import { potvrd } from "@/lib/potvrdenie";

/**
 * Nastavenie schvaľovania dokladov — ako v Doklado: zapnutie, agendy,
 * automatické schválenie pod sumou, odoslanie faktúry až po schválení a
 * schvaľovacie cesty s úrovňami a pravidlami.
 */
export const Route = createFileRoute("/_authenticated/nastavenia/schvalovanie")({
  head: () => ({ meta: [{ title: "Schvaľovanie dokladov — Faktero" }] }),
  component: Stranka,
});

type Clovek = { id: string; rola: string; meno: string };
type CestaForm = {
  id?: string;
  nazov: string;
  urovne: string[][];
  podmienky: { agenda?: AgendaSchvalovania | ""; ico?: string; suma_od?: number | null; predkontacia?: string };
  predvolena: boolean;
  poradie: number;
};

const AGENDY: AgendaSchvalovania[] = ["doklad", "prijata", "vystavena"];
const vstup = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function Stranka() {
  const companyId = getActiveCompanyId();
  const nacitaj = useServerFn(nastavenieSchvalovaniaFn);
  const ulozN = useServerFn(ulozNastavenieSchvalovaniaFn);
  const ulozC = useServerFn(ulozCestuFn);
  const zmazC = useServerFn(zmazCestuFn);
  const [d, setD] = useState<any>(null);
  const [n, setN] = useState<{ zapnute: boolean; agendy: string[]; autoPod: string; odoslanie: boolean }>({
    zapnute: false,
    agendy: ["doklad", "prijata"],
    autoPod: "",
    odoslanie: false,
  });
  const [form, setForm] = useState<CestaForm | null>(null);
  const [busy, setBusy] = useState(false);

  const obnov = async () => {
    if (!companyId) return;
    const r = await nacitaj({ data: { company_id: companyId } });
    setD(r);
    setN({
      zapnute: r.nastavenie.zapnute,
      agendy: r.nastavenie.agendy,
      autoPod: r.nastavenie.autoPod != null ? String(r.nastavenie.autoPod) : "",
      odoslanie: r.nastavenie.odoslanie,
    });
  };
  useEffect(() => {
    obnov().catch((e) => toast.error(e?.message ?? "Nepodarilo sa načítať"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  if (!companyId || !d)
    return (
      <>
        <PageHeader title="Schvaľovanie dokladov" />
        <PageBody>
          <p className="text-sm text-muted-foreground">Načítavam…</p>
        </PageBody>
      </>
    );

  const spravca = ["owner", "admin"].includes(d.mojaRola);
  const ludia: Clovek[] = d.ludia;
  const meno = (id: string) =>
    id === "manazer" ? "manažér zákazky" : (ludia.find((l) => l.id === id)?.meno ?? "používateľ");

  async function ulozNastavenie() {
    setBusy(true);
    try {
      await ulozN({
        data: {
          company_id: companyId!,
          zapnute: n.zapnute,
          agendy: n.agendy as AgendaSchvalovania[],
          autoPod: n.autoPod.trim() ? Number(n.autoPod.replace(",", ".")) : null,
          odoslanie: n.odoslanie,
        },
      });
      toast.success("Uložené");
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(false);
    }
  }

  async function ulozCestu() {
    if (!form) return;
    setBusy(true);
    try {
      await ulozC({
        data: {
          company_id: companyId!,
          id: form.id ?? null,
          nazov: form.nazov,
          urovne: form.urovne.filter((u) => u.length),
          podmienky: {
            agenda: form.podmienky.agenda || "",
            ico: form.podmienky.ico?.trim() || "",
            suma_od: form.podmienky.suma_od ?? null,
            predkontacia: form.podmienky.predkontacia?.trim() || "",
          },
          predvolena: form.predvolena,
          poradie: form.poradie,
        },
      });
      toast.success("Cesta uložená");
      setForm(null);
      await obnov();
    } catch (e: any) {
      toast.error(e?.message ?? "Nepodarilo sa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Schvaľovanie dokladov"
        description="Kto musí doklad schváliť, kým ide do Pohody, na úhradu alebo k odberateľovi."
      />
      <PageBody>
        <section className="rounded-xl border border-border bg-card p-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={n.zapnute}
              disabled={!spravca}
              onChange={(e) => setN({ ...n, zapnute: e.target.checked })}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="font-medium">Schvaľovať doklady</span>
              <span className="block text-xs text-muted-foreground">
                Platí pre doklady pridané od zapnutia. Do Pohody, do mesačného balíka a do príkazu na
                úhradu potom idú len schválené.
                {d.nastavenie.od
                  ? ` Zapnuté od ${new Date(d.nastavenie.od).toLocaleString("sk-SK", { dateStyle: "medium", timeStyle: "short" })}.`
                  : ""}
              </span>
            </span>
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Čo sa schvaľuje</div>
              <div className="mt-1 flex flex-wrap gap-3">
                {AGENDY.map((a) => (
                  <label key={a} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      disabled={!spravca}
                      checked={n.agendy.includes(a)}
                      onChange={(e) =>
                        setN({
                          ...n,
                          agendy: e.target.checked ? [...n.agendy, a] : n.agendy.filter((x) => x !== a),
                        })
                      }
                    />
                    {NAZVY_AGEND[a]}
                  </label>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-xs text-muted-foreground">Automaticky schváliť doklad so sumou pod (€)</span>
              <input
                value={n.autoPod}
                disabled={!spravca}
                onChange={(e) => setN({ ...n, autoPod: e.target.value })}
                placeholder="napr. 50"
                inputMode="decimal"
                className={vstup}
              />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!spravca}
              checked={n.odoslanie}
              onChange={(e) => setN({ ...n, odoslanie: e.target.checked })}
            />
            Vystavenú faktúru odoslať (mailom, eFaktúrou) až po schválení
          </label>
          {spravca ? (
            <div className="mt-4 flex justify-end">
              <button
                onClick={ulozNastavenie}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Uložiť
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Nastavenie mení majiteľ alebo správca firmy.</p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Schvaľovacie cesty
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Úrovne od najnižšej po najvyššiu. Schválenie vyššou úrovňou platí aj za nižšie. Prvá cesta,
                ktorej pravidlá sedia, sa použije; inak predvolená; bez ciest stačí jedno schválenie
                majiteľom, správcom alebo účtovníkom.
              </p>
            </div>
            {spravca && (
              <button
                onClick={() =>
                  setForm({ nazov: "", urovne: [[]], podmienky: {}, predvolena: !d.cesty.length, poradie: d.cesty.length })
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Nová cesta
              </button>
            )}
          </div>

          {form && (
            <div className="mt-4 space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
              <label className="block">
                <span className="text-xs text-muted-foreground">Názov</span>
                <input value={form.nazov} onChange={(e) => setForm({ ...form, nazov: e.target.value })} className={vstup} />
              </label>
              {form.urovne.map((u, i) => (
                <div key={i}>
                  <div className="text-xs text-muted-foreground">{i + 1}. úroveň — schvaľovatelia</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {[...ludia, { id: "manazer", rola: "", meno: "manažér zákazky dokladu" }].map((l) => (
                      <label key={l.id} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={u.includes(l.id)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              urovne: form.urovne.map((x, j) =>
                                j === i ? (e.target.checked ? [...x, l.id] : x.filter((y) => y !== l.id)) : x,
                              ),
                            })
                          }
                        />
                        {l.meno}
                      </label>
                    ))}
                    {form.urovne.length > 1 && (
                      <button
                        onClick={() => setForm({ ...form, urovne: form.urovne.filter((_, j) => j !== i) })}
                        className="text-xs text-destructive hover:underline"
                      >
                        odobrať úroveň
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {form.urovne.length < 15 && (
                <button
                  onClick={() => setForm({ ...form, urovne: [...form.urovne, []] })}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Pridať ďalšiu úroveň
                </button>
              )}
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="block">
                  <span className="text-xs text-muted-foreground">Pre doklady</span>
                  <select
                    value={form.podmienky.agenda ?? ""}
                    onChange={(e) => setForm({ ...form, podmienky: { ...form.podmienky, agenda: e.target.value as any } })}
                    className={vstup}
                  >
                    <option value="">všetky</option>
                    {AGENDY.map((a) => (
                      <option key={a} value={a}>
                        {NAZVY_AGEND[a]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground">IČO dodávateľa / odberateľa</span>
                  <input
                    value={form.podmienky.ico ?? ""}
                    onChange={(e) => setForm({ ...form, podmienky: { ...form.podmienky, ico: e.target.value } })}
                    className={vstup}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground">Suma od (€)</span>
                  <input
                    value={form.podmienky.suma_od ?? ""}
                    inputMode="decimal"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        podmienky: {
                          ...form.podmienky,
                          suma_od: e.target.value.trim() ? Number(e.target.value.replace(",", ".")) : null,
                        },
                      })
                    }
                    className={vstup}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground">Predkontácia</span>
                  <input
                    value={form.podmienky.predkontacia ?? ""}
                    onChange={(e) => setForm({ ...form, podmienky: { ...form.podmienky, predkontacia: e.target.value } })}
                    className={vstup}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.predvolena}
                  onChange={(e) => setForm({ ...form, predvolena: e.target.checked })}
                />
                Predvolená cesta (pre doklady, na ktoré nesedí iné pravidlo)
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={() => setForm(null)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">
                  Zrušiť
                </button>
                <button
                  onClick={ulozCestu}
                  disabled={busy || !form.nazov.trim() || !form.urovne.some((u) => u.length)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Uložiť cestu
                </button>
              </div>
            </div>
          )}

          {d.cesty.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Zatiaľ žiadna cesta — schvaľuje sa jednoducho (jedno schválenie majiteľom, správcom alebo účtovníkom).
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {d.cesty.map((c: any) => (
                <li key={c.id} className="flex flex-wrap items-start gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {c.nazov}
                      {c.predvolena && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">predvolená</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(c.urovne ?? []).map((u: string[], i: number) => `${i + 1}. ${u.map(meno).join(", ")}`).join(" → ")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[
                        c.podmienky?.agenda ? NAZVY_AGEND[c.podmienky.agenda as AgendaSchvalovania] : null,
                        c.podmienky?.ico ? `IČO ${c.podmienky.ico}` : null,
                        c.podmienky?.suma_od != null ? `od ${c.podmienky.suma_od} €` : null,
                        c.podmienky?.predkontacia ? `predkontácia ${c.podmienky.predkontacia}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "bez pravidiel"}
                    </div>
                  </div>
                  {spravca && (
                    <>
                      <button
                        onClick={() =>
                          setForm({
                            id: c.id,
                            nazov: c.nazov,
                            urovne: c.urovne?.length ? c.urovne : [[]],
                            podmienky: c.podmienky ?? {},
                            predvolena: c.predvolena,
                            poradie: c.poradie ?? 0,
                          })
                        }
                        className="rounded p-1 text-muted-foreground hover:bg-secondary"
                        aria-label={`Upraviť ${c.nazov}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!(await potvrd(`Zmazať cestu ${c.nazov}?`))) return;
                          try {
                            await zmazC({ data: { company_id: companyId, id: c.id } });
                            await obnov();
                          } catch (e: any) {
                            toast.error(e?.message ?? "Nepodarilo sa");
                          }
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                        aria-label={`Zmazať ${c.nazov}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageBody>
    </>
  );
}
