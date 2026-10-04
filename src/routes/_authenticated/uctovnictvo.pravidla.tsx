import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { ConfirmDialog } from "@/components/faktero/ListControls";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { KATEGORIE_VYDAVKOV } from "@/lib/mobile/kategorie-vydavkov";
import {
  SPOSOBY_UHRADY_DOKLADU,
  chybaPravidla,
  naUlozenie,
  popisPravidla,
  pravidloSedi,
  type DokladNaPorovnanie,
  type Pravidlo,
} from "@/lib/faktero/pravidla-uctovania";

export const Route = createFileRoute("/_authenticated/uctovnictvo/pravidla")({
  head: () => ({ meta: [{ title: "Pravidlá účtovania — Faktero" }] }),
  component: PravidlaPage,
});

type Riadok = Pravidlo & { id: string };

const NOVE: Pravidlo = {
  nazov: "",
  poradie: 100,
  aktivne: true,
  dodavatel_ico: null,
  dodavatel_text: null,
  sposob_uhrady: null,
  kategoria: null,
  predkontacia: null,
  clenenie_dph: null,
  odpocet: null,
  poznamka: null,
};

const vstup = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function PravidlaPage() {
  const cid = useMemo(() => getActiveCompanyId(), []);
  const [pravidla, setPravidla] = useState<Riadok[] | null>(null);
  const [doklady, setDoklady] = useState<DokladNaPorovnanie[]>([]);
  const [uprava, setUprava] = useState<Pravidlo | null>(null);
  const [mazane, setMazane] = useState<Riadok | null>(null);
  const [uplatnujem, setUplatnujem] = useState(false);

  const nacitaj = useCallback(async () => {
    if (!cid) return;
    const [{ data: p, error }, { data: d }] = await Promise.all([
      supabase
        .from("pravidla_uctovania" as any)
        .select("*")
        .eq("company_id", cid)
        .order("poradie")
        .order("created_at"),
      // Na náhľad, koľkých dokladov by sa pravidlo týkalo.
      supabase
        .from("expense_documents")
        .select("supplier_ico, supplier_name, payment_method")
        .eq("company_id", cid)
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);
    if (error) toast.error(error.message);
    setPravidla((p ?? []) as unknown as Riadok[]);
    setDoklady((d ?? []) as DokladNaPorovnanie[]);
  }, [cid]);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  async function prepni(r: Riadok) {
    const { error } = await supabase
      .from("pravidla_uctovania" as any)
      .update({ aktivne: !r.aktivne, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    void nacitaj();
  }

  async function zmaz() {
    if (!mazane) return;
    const { error } = await supabase
      .from("pravidla_uctovania" as any)
      .delete()
      .eq("id", mazane.id);
    setMazane(null);
    if (error) return toast.error(error.message);
    toast.success("Pravidlo zmazané. Doklady, ktoré už doplnilo, ostávajú, ako sú.");
    void nacitaj();
  }

  async function uplatni() {
    if (!cid) return;
    setUplatnujem(true);
    try {
      const { data, error } = await supabase.rpc("uplatni_pravidla_uctovania" as any, {
        _company: cid,
      });
      if (error) throw new Error(error.message);
      const n = Number(data ?? 0);
      toast.success(
        n === 0
          ? "Žiadny neodovzdaný doklad bez pravidla na pravidlá nesedí."
          : `Pravidlá doplnili ${n} ${n === 1 ? "doklad" : n < 5 ? "doklady" : "dokladov"}.`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUplatnujem(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Pravidlá účtovania"
        description="Doklad od známeho dodávateľa dostane predkontáciu, kategóriu či členenie DPH sám — hneď, ako vznikne."
        action={
          <button
            onClick={() => setUprava({ ...NOVE })}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nové pravidlo
          </button>
        }
      />
      <PageBody>
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Pravidlo zaberie pri každom novom doklade — naskenovanom, z e-mailu, z appky aj z importu.
          Dopĺňa len to, čo je prázdne; čo vyplníte sami, neprepíše. Predkontácia a členenie DPH idú
          do Pohody namiesto spoločných z{" "}
          <Link to="/uctovnictvo/pohoda" className="text-primary hover:underline">
            nastavení prepojenia
          </Link>
          . Keď na doklad sedí viac pravidiel, platí to s menším poradím.
        </div>

        {pravidla === null ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
          </div>
        ) : pravidla.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Zatiaľ žiadne pravidlo. Typický začiatok: „dodávateľ obsahuje <em>Slovnaft</em> →
            kategória Palivo, predkontácia PHM".
          </div>
        ) : (
          <>
            <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">Poradie</th>
                    <th className="p-3">Pravidlo</th>
                    <th className="p-3">Keď</th>
                    <th className="p-3">Doplní</th>
                    <th className="p-3 text-right">Sedí na</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {pravidla.map((r) => {
                    const { ked, doplni } = popisPravidla(r);
                    const pocet = doklady.filter((d) =>
                      pravidloSedi({ ...r, aktivne: true }, d),
                    ).length;
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-border last:border-0 ${r.aktivne ? "" : "opacity-50"}`}
                      >
                        <td className="p-3 tabular-nums">{r.poradie}</td>
                        <td className="p-3 font-medium">
                          {r.nazov}
                          {!r.aktivne && (
                            <span className="ml-2 text-xs font-normal">(vypnuté)</span>
                          )}
                        </td>
                        <td className="p-3">{ked}</td>
                        <td className="p-3">{doplni}</td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">
                          {pocet}{" "}
                          {pocet === 1
                            ? "doklad"
                            : pocet >= 2 && pocet <= 4
                              ? "doklady"
                              : "dokladov"}
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => void prepni(r)}
                              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                            >
                              {r.aktivne ? "Vypnúť" : "Zapnúť"}
                            </button>
                            <button
                              onClick={() => setUprava({ ...r })}
                              aria-label={`Upraviť ${r.nazov}`}
                              className="rounded-md border border-border p-1.5 hover:bg-secondary"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setMazane(r)}
                              aria-label={`Zmazať ${r.nazov}`}
                              className="rounded-md border border-destructive/40 p-1.5 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => void uplatni()}
                disabled={uplatnujem}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
              >
                {uplatnujem ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Uplatniť na doklady, ktoré už sú
              </button>
              <span className="text-xs text-muted-foreground">
                Týka sa dokladov, ktoré ešte neodišli do účtovníctva a žiadne pravidlo ich zatiaľ
                nedoplnilo.
              </span>
            </div>
          </>
        )}
      </PageBody>

      {uprava && cid && (
        <UpravaPravidla
          companyId={cid}
          pravidlo={uprava}
          doklady={doklady}
          onClose={() => setUprava(null)}
          onUlozene={() => {
            setUprava(null);
            void nacitaj();
          }}
        />
      )}
      <ConfirmDialog
        open={!!mazane}
        title="Zmazať pravidlo?"
        message={`Pravidlo „${mazane?.nazov ?? ""}" sa prestane uplatňovať na nové doklady. Doklady, ktoré už doplnilo, ostávajú, ako sú.`}
        confirmLabel="Zmazať"
        onCancel={() => setMazane(null)}
        onConfirm={() => void zmaz()}
      />
    </>
  );
}

function UpravaPravidla({
  companyId,
  pravidlo,
  doklady,
  onClose,
  onUlozene,
}: {
  companyId: string;
  pravidlo: Pravidlo;
  doklady: DokladNaPorovnanie[];
  onClose: () => void;
  onUlozene: () => void;
}) {
  useZatvorNaEscape(onClose);
  const [p, setP] = useState<Pravidlo>(pravidlo);
  const [busy, setBusy] = useState(false);
  const zmen = (z: Partial<Pravidlo>) => setP((x) => ({ ...x, ...z }));
  const chyba = chybaPravidla(p);
  const sedi = chybaPravidla({ ...p, nazov: p.nazov || "x" })
    ? null
    : doklady.filter((d) => pravidloSedi({ ...p, aktivne: true }, d)).length;

  async function uloz() {
    if (chyba) return toast.error(chyba);
    setBusy(true);
    try {
      const riadok = { ...naUlozenie(p), updated_at: new Date().toISOString() };
      const { error } = p.id
        ? await supabase
            .from("pravidla_uctovania" as any)
            .update(riadok)
            .eq("id", p.id)
        : await supabase
            .from("pravidla_uctovania" as any)
            .insert({ ...riadok, company_id: companyId });
      if (error) throw new Error(error.message);
      toast.success(p.id ? "Pravidlo uložené." : "Pravidlo pridané — zaberie pri ďalšom doklade.");
      onUlozene();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={p.id ? "Upraviť pravidlo" : "Nové pravidlo"}
        className="w-full max-w-xl rounded-xl border border-border bg-card p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">{p.id ? "Upraviť pravidlo" : "Nové pravidlo"}</h3>

        <label className="mt-4 block text-sm">
          <span className="text-xs font-medium text-muted-foreground">Názov</span>
          <input
            value={p.nazov}
            onChange={(e) => zmen({ nazov: e.target.value })}
            placeholder="napr. Tankovanie Slovnaft"
            className={vstup}
          />
        </label>

        <div className="mt-5 text-sm font-medium">Keď doklad…</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Dodávateľ obsahuje</span>
            <input
              value={p.dodavatel_text ?? ""}
              onChange={(e) => zmen({ dodavatel_text: e.target.value })}
              placeholder="Slovnaft"
              className={vstup}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">alebo má IČO</span>
            <input
              value={p.dodavatel_ico ?? ""}
              onChange={(e) => zmen({ dodavatel_ico: e.target.value })}
              inputMode="numeric"
              placeholder="31322832"
              className={vstup}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Spôsob úhrady</span>
            <select
              value={p.sposob_uhrady ?? ""}
              onChange={(e) => zmen({ sposob_uhrady: e.target.value || null })}
              className={vstup}
            >
              <option value="">Akýkoľvek</option>
              {SPOSOBY_UHRADY_DOKLADU.map((s) => (
                <option key={s.kod} value={s.kod}>
                  {s.nazov}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Poradie (menšie vyhráva)</span>
            <input
              type="number"
              value={p.poradie}
              onChange={(e) => zmen({ poradie: Number(e.target.value) })}
              className={vstup}
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Vyplnené podmienky musia platiť naraz. IČO aj názov sa dajú kombinovať.
        </p>

        <div className="mt-5 text-sm font-medium">…doplní sa</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Kategória</span>
            <select
              value={p.kategoria ?? ""}
              onChange={(e) => zmen({ kategoria: e.target.value || null })}
              className={vstup}
            >
              <option value="">—</option>
              {KATEGORIE_VYDAVKOV.map((k) => (
                <option key={k.kod} value={k.kod}>
                  {k.nazov}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Predkontácia (Pohoda)</span>
            <input
              value={p.predkontacia ?? ""}
              onChange={(e) => zmen({ predkontacia: e.target.value })}
              placeholder="napr. PHM, 1Fp"
              className={vstup}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Členenie DPH (Pohoda)</span>
            <input
              value={p.clenenie_dph ?? ""}
              onChange={(e) => zmen({ clenenie_dph: e.target.value })}
              placeholder="napr. PD, PN"
              className={vstup}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Odpočet DPH</span>
            <select
              value={p.odpocet === null ? "" : p.odpocet ? "ano" : "nie"}
              onChange={(e) =>
                zmen({ odpocet: e.target.value === "" ? null : e.target.value === "ano" })
              }
              className={vstup}
            >
              <option value="">Nemeniť</option>
              <option value="ano">S odpočtom</option>
              <option value="nie">Bez odpočtu (napr. reprezentácia)</option>
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-xs text-muted-foreground">Poznámka</span>
            <input
              value={p.poznamka ?? ""}
              onChange={(e) => zmen({ poznamka: e.target.value })}
              placeholder="napr. Služobné auto BA-123XY"
              className={vstup}
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Skratky predkontácie a členenia sú tie, ktoré máte v Pohode — Faktero ich pošle tak, ako
          ich napíšete.
        </p>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={p.aktivne}
            onChange={(e) => zmen({ aktivne: e.target.checked })}
          />
          Pravidlo je zapnuté
        </label>

        {sedi !== null && (
          <p className="mt-4 rounded-md bg-secondary/50 p-3 text-sm">
            Zo súčasných dokladov by sedelo na{" "}
            <strong>
              {sedi} {sedi === 1 ? "doklad" : sedi >= 2 && sedi <= 4 ? "doklady" : "dokladov"}
            </strong>
            .
          </p>
        )}
        {chyba && p.nazov && <p className="mt-3 text-sm text-destructive">{chyba}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            Zrušiť
          </button>
          <button
            onClick={() => void uloz()}
            disabled={busy || !!chyba}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Uložiť
          </button>
        </div>
      </div>
    </div>
  );
}
