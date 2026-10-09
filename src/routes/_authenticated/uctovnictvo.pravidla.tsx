import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { ConfirmDialog } from "@/components/faktero/ListControls";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useServerFn } from "@tanstack/react-start";
import { KodPohody } from "@/components/faktero/KodPohody";
import { navrhyKodovFn } from "@/lib/faktero/zauctovanie.functions";
import type { Navrhy } from "@/components/faktero/ZauctovaniePanel";
import { KATEGORIE_VYDAVKOV } from "@/lib/mobile/kategorie-vydavkov";
import { KV_CLENENIA, KV_PRIJATE } from "@/lib/faktero/kv-clenenie";
import { OZNACENIA } from "@/lib/faktero/vypis-oznacenie";
import {
  DRUHY_PRAVIDIEL,
  SMERY_POHYBU,
  TYPY_DOKLADU,
  ocistiPodlaDruhu,
  typPrijatej,
  type DruhPravidla,
  SPOSOBY_UHRADY_DOKLADU,
  chybaPravidla,
  naUlozenie,
  popisPravidla,
  PREMENNE_POZNAMKY,
  premennePoznamky,
  pravidloSedi,
  type DokladNaPorovnanie,
  type Pravidlo,
} from "@/lib/faktero/pravidla-uctovania";

const KV_VYDANE = KV_CLENENIA.filter((k) => ["A1", "A2", "C1", "D1", "D2", "X"].includes(k.kod));

/** Predvyplnenie nového pravidla z dokladu (odkaz „Vytvoriť pravidlo"). */
type Hladanie = {
  novy?: string;
  nazov?: string;
  ico?: string;
  predkontacia?: string;
  clenenie?: string;
  kv?: string;
  kategoria?: string;
};
const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined;

export const Route = createFileRoute("/_authenticated/uctovnictvo/pravidla")({
  head: () => ({ meta: [{ title: "Pravidlá účtovania — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>): Hladanie => ({
    novy: text(s.novy),
    nazov: text(s.nazov),
    ico: text(s.ico),
    predkontacia: text(s.predkontacia),
    clenenie: text(s.clenenie),
    kv: text(s.kv),
    kategoria: text(s.kategoria),
  }),
  component: PravidlaPage,
});

type Zalozka = "vsetky" | DruhPravidla;
const ZALOZKY: { kod: Zalozka; nazov: string }[] = [
  { kod: "vsetky", nazov: "Všetky" },
  { kod: "blocek", nazov: "Bločky" },
  { kod: "prijata", nazov: "Prijaté faktúry" },
  { kod: "vystavena", nazov: "Vystavené faktúry" },
  { kod: "banka", nazov: "Banka" },
];
/** Patrí pravidlo do záložky? Pôvodné pravidlá (bez druhu) sú v bločkoch aj prijatých. */
const vZalozke = (r: Pravidlo, z: Zalozka) =>
  z === "vsetky" || r.druh === z || (!r.druh && (z === "blocek" || z === "prijata"));

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
  druh: null,
  typ_dokladu: null,
  kv_clenenie: null,
  bankovy_ucet: null,
  smer: null,
  oznacenie: null,
};

const vstup = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function PravidlaPage() {
  const cid = useMemo(() => getActiveCompanyId(), []);
  const [pravidla, setPravidla] = useState<Riadok[] | null>(null);
  const nacitajMena = useServerFn(menaClenovFirmy);
  const [mena, setMena] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!cid) return;
    nacitajMena({ data: { company_id: cid } })
      .then((m) => setMena(m as Record<string, string>))
      .catch(() => setMena({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);
  const [doklady, setDoklady] = useState<DokladNaPorovnanie[]>([]);
  const [uprava, setUprava] = useState<Pravidlo | null>(null);
  const [mazane, setMazane] = useState<Riadok | null>(null);
  const [uplatnujem, setUplatnujem] = useState(false);
  const [zalozka, setZalozka] = useState<Zalozka>("vsetky");
  const [ucty, setUcty] = useState<string[]>([]);
  const hladanie = Route.useSearch();
  const navigate = Route.useNavigate();
  /* Prišiel z dokladu cez „Vytvoriť pravidlo" — formulár sa otvorí predvyplnený. */
  useEffect(() => {
    if (!hladanie.novy) return;
    const druh =
      (["blocek", "prijata", "vystavena"] as const).find((d) => d === hladanie.novy) ?? null;
    setUprava({
      ...NOVE,
      druh,
      nazov: hladanie.nazov ?? "",
      dodavatel_text: hladanie.ico ? null : (hladanie.nazov ?? null),
      dodavatel_ico: hladanie.ico ?? null,
      predkontacia: hladanie.predkontacia ?? null,
      clenenie_dph: hladanie.clenenie ?? null,
      kv_clenenie: hladanie.kv ?? null,
      kategoria: druh === "vystavena" ? null : (hladanie.kategoria ?? null),
    });
    if (druh) setZalozka(druh);
    void navigate({ search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hladanie.novy]);

  const nacitaj = useCallback(async () => {
    if (!cid) return;
    const [
      { data: p, error },
      { data: d },
      { data: pf },
      { data: vf },
      { data: u1 },
      { data: u2 },
    ] = await Promise.all([
      supabase
        .from("pravidla_uctovania")
        .select("*")
        .eq("company_id", cid)
        .order("poradie")
        .order("created_at"),
      // Na náhľad, koľkých dokladov by sa pravidlo týkalo.
      supabase
        .from("expense_documents")
        .select("supplier_ico, supplier_name, payment_method, created_by, predmet_mailu")
        .eq("company_id", cid)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("purchase_invoices")
        .select(
          "supplier_ico, supplier_name, payment_method, created_by, predmet_mailu, type, amount_total, opravuje_cislo",
        )
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("invoices")
        .select("customer_ico, customer_name, created_by, type")
        .eq("company_id", cid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("company_bank_accounts").select("iban").eq("company_id", cid),
      supabase.from("bank_accounts").select("iban").eq("company_id", cid),
    ]);
    if (error) toast.error(error.message);
    setPravidla((p ?? []) as unknown as Riadok[]);
    setDoklady([
      ...((d ?? []) as DokladNaPorovnanie[]).map((x) => ({ ...x, druh: "blocek" as const })),
      ...((pf ?? []) as any[]).map((x) => ({
        ...x,
        druh: "prijata" as const,
        typ: typPrijatej(x.type, x.amount_total, x.opravuje_cislo),
      })),
      ...((vf ?? []) as any[]).map((x) => ({
        supplier_ico: x.customer_ico,
        supplier_name: x.customer_name,
        payment_method: null,
        created_by: x.created_by,
        druh: "vystavena" as const,
        typ: x.type,
      })),
    ]);
    setUcty([
      ...new Set(
        [...(u1 ?? []), ...(u2 ?? [])]
          .map((x: any) =>
            String(x.iban ?? "")
              .replace(/\s+/g, "")
              .toUpperCase(),
          )
          .filter(Boolean),
      ),
    ]);
  }, [cid]);

  useEffect(() => {
    void nacitaj();
  }, [nacitaj]);

  async function prepni(r: Riadok) {
    const { error } = await supabase
      .from("pravidla_uctovania")
      .update({ aktivne: !r.aktivne, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    void nacitaj();
  }

  async function zmaz() {
    if (!mazane) return;
    const { error } = await supabase
      .from("pravidla_uctovania")
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
          : `Pravidlá doplnili ${n} ${n === 1 ? "doklad" : n < 5 ? "doklady" : "dokladov"} (bločky, prijaté aj vystavené faktúry).`,
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
        description="Automatické účtovanie: bloček, prijatá aj vystavená faktúra či pohyb v banke dostane predkontáciu, členenie DPH a KV sám — hneď, ako vznikne."
        action={
          <button
            onClick={() => setUprava({ ...NOVE, druh: zalozka === "vsetky" ? null : zalozka })}
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
          . Keď na doklad sedí viac pravidiel, platí to s menším poradím; pravidlo podľa partnera má
          prednosť pred pravidlom podľa používateľa. Pravidlá pre banku zaberú pri vývoze výpisu do
          Pohody — majú prednosť pred predkontáciou podľa označenia pohybu.
        </div>

        <div role="tablist" aria-label="Druh pravidla" className="mt-4 flex flex-wrap gap-1">
          {ZALOZKY.map((z) => {
            const pocet = (pravidla ?? []).filter((r) => vZalozke(r, z.kod)).length;
            return (
              <button
                key={z.kod}
                role="tab"
                aria-selected={zalozka === z.kod}
                onClick={() => setZalozka(z.kod)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  zalozka === z.kod
                    ? "bg-primary text-primary-foreground"
                    : "border border-border hover:bg-secondary"
                }`}
              >
                {z.nazov}
                {pravidla ? <span className="ml-1 opacity-70">{pocet}</span> : null}
              </button>
            );
          })}
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
                  {pravidla
                    .filter((r) => vZalozke(r, zalozka))
                    .map((r) => {
                      const { ked, doplni } = popisPravidla(r, mena);
                      const pocet =
                        r.druh === "banka"
                          ? null
                          : doklady.filter((d) => pravidloSedi({ ...r, aktivne: true }, d)).length;
                      return (
                        <tr
                          key={r.id}
                          className={`border-b border-border last:border-0 ${r.aktivne ? "" : "opacity-50"}`}
                        >
                          <td className="p-3 tabular-nums">{r.poradie}</td>
                          <td className="p-3 font-medium">
                            {r.nazov}
                            {zalozka === "vsetky" && (
                              <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                                {DRUHY_PRAVIDIEL.find((d) => d.kod === (r.druh ?? null))?.nazov}
                              </span>
                            )}
                            {!r.aktivne && (
                              <span className="ml-2 text-xs font-normal">(vypnuté)</span>
                            )}
                          </td>
                          <td className="p-3">{ked}</td>
                          <td className="p-3">{doplni}</td>
                          <td className="p-3 text-right tabular-nums text-muted-foreground">
                            {pocet === null ? (
                              <span title="Pohyby z výpisov sa neukladajú — pravidlo zaberie pri vývoze">
                                pri vývoze
                              </span>
                            ) : (
                              <>
                                {pocet}{" "}
                                {pocet === 1
                                  ? "doklad"
                                  : pocet >= 2 && pocet <= 4
                                    ? "doklady"
                                    : "dokladov"}
                              </>
                            )}
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
                Uplatniť na doklady a faktúry, ktoré už sú
              </button>
              <span className="text-xs text-muted-foreground">
                Týka sa bločkov a prijatých či vystavených faktúr, ktoré ešte neodišli do
                účtovníctva (vystavené: nie sú zaúčtované) a žiadne pravidlo ich zatiaľ nedoplnilo.
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
          ucty={ucty}
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
  ucty,
  onClose,
  onUlozene,
}: {
  companyId: string;
  pravidlo: Pravidlo;
  doklady: DokladNaPorovnanie[];
  ucty: string[];
  onClose: () => void;
  onUlozene: () => void;
}) {
  useZatvorNaEscape(onClose);
  const [p, setP] = useState<Pravidlo>(pravidlo);
  const [busy, setBusy] = useState(false);
  const zmen = (z: Partial<Pravidlo>) => setP((x) => ({ ...x, ...z }));
  const nacitajKody = useServerFn(navrhyKodovFn);
  const [kody, setKody] = useState<Navrhy | null>(null);
  useEffect(() => {
    nacitajKody({
      data: { company_id: companyId, pre: p.druh === "vystavena" ? "vystavena" : "doklad" },
    })
      .then(setKody)
      .catch(() => {});
  }, [companyId, nacitajKody, p.druh]);
  const banka = p.druh === "banka";
  const vystavena = p.druh === "vystavena";
  const partner = vystavena ? "Odberateľ" : "Dodávateľ";
  const chyba = chybaPravidla(p);
  const nacitajMenaClenov = useServerFn(menaClenovFirmy);
  const [clenovia, setClenovia] = useState<Record<string, string>>({});
  useEffect(() => {
    nacitajMenaClenov({ data: { company_id: companyId } })
      .then((m) => setClenovia(m as Record<string, string>))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);
  const sedi =
    banka || chybaPravidla({ ...p, nazov: p.nazov || "x" })
      ? null
      : doklady.filter((d) => pravidloSedi({ ...ocistiPodlaDruhu(p), aktivne: true }, d)).length;

  async function uloz() {
    if (chyba) return toast.error(chyba);
    setBusy(true);
    try {
      const riadok = { ...naUlozenie(ocistiPodlaDruhu(p)), updated_at: new Date().toISOString() };
      const { error } = p.id
        ? await supabase
            .from("pravidla_uctovania")
            .update(riadok)
            .eq("id", p.id)
        : await supabase
            .from("pravidla_uctovania")
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

        <label className="mt-4 block text-sm">
          <span className="text-xs font-medium text-muted-foreground">Platí pre</span>
          <select
            value={p.druh ?? ""}
            onChange={(e) => zmen({ druh: (e.target.value || null) as DruhPravidla | null })}
            className={vstup}
          >
            {DRUHY_PRAVIDIEL.map((d) => (
              <option key={d.kod ?? ""} value={d.kod ?? ""}>
                {d.nazov}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 text-sm font-medium">
          {banka ? "Keď pohyb na výpise…" : "Keď doklad…"}
        </div>
        {banka ? (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">Na účte (IBAN)</span>
              <input
                value={p.bankovy_ucet ?? ""}
                onChange={(e) => zmen({ bankovy_ucet: e.target.value })}
                list="pravidla-ucty"
                placeholder="Ktorýkoľvek účet"
                className={vstup}
              />
              <datalist id="pravidla-ucty">
                {ucty.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">Smer</span>
              <select
                value={p.smer ?? ""}
                onChange={(e) => zmen({ smer: (e.target.value || null) as Pravidlo["smer"] })}
                className={vstup}
              >
                <option value="">Príjem aj výdaj</option>
                {SMERY_POHYBU.map((x) => (
                  <option key={x.kod} value={x.kod}>
                    {x.nazov}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">Typ pohybu</span>
              <select
                value={p.oznacenie ?? ""}
                onChange={(e) => zmen({ oznacenie: e.target.value || null })}
                className={vstup}
              >
                <option value="">Akýkoľvek</option>
                {OZNACENIA.map((o) => (
                  <option key={o.kod} value={o.kod}>
                    {o.nazov}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">
                Protistrana alebo popis obsahuje
              </span>
              <input
                value={p.dodavatel_text ?? ""}
                onChange={(e) => zmen({ dodavatel_text: e.target.value })}
                placeholder="napr. Finančná správa"
                className={vstup}
              />
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
        ) : (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{partner} obsahuje</span>
              <input
                value={p.dodavatel_text ?? ""}
                onChange={(e) => zmen({ dodavatel_text: e.target.value })}
                placeholder={vystavena ? "napr. Kaufland" : "Slovnaft"}
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
            {(p.druh === "prijata" || vystavena) && (
              <label className="block text-sm">
                <span className="text-xs text-muted-foreground">Typ faktúry</span>
                <select
                  value={p.typ_dokladu ?? ""}
                  onChange={(e) => zmen({ typ_dokladu: e.target.value || null })}
                  className={vstup}
                >
                  <option value="">Akýkoľvek</option>
                  {TYPY_DOKLADU.filter((t) => vystavena || t.prijata).map((t) => (
                    <option key={t.kod} value={t.kod}>
                      {t.nazov}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!vystavena && (
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
            )}
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">
                {vystavena ? "Faktúru vystavil" : "Doklad nahral"}
              </span>
              <select
                value={p.pouzivatel_id ?? ""}
                onChange={(e) => zmen({ pouzivatel_id: e.target.value || null })}
                className={vstup}
              >
                <option value="">Ktokoľvek</option>
                {Object.entries(clenovia).map(([id, meno]) => (
                  <option key={id} value={id}>
                    {meno}
                  </option>
                ))}
              </select>
            </label>
            {!vystavena && (
              <label className="block text-sm">
                <span className="text-xs text-muted-foreground">Predmet mailu obsahuje</span>
                <input
                  value={p.predmet_text ?? ""}
                  onChange={(e) => zmen({ predmet_text: e.target.value })}
                  placeholder="napr. Orange faktúra"
                  className={vstup}
                />
              </label>
            )}
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
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Vyplnené podmienky musia platiť naraz. IČO aj názov sa dajú kombinovať.
        </p>

        <div className="mt-5 text-sm font-medium">…doplní sa</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {!banka && !vystavena && (
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
          )}
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Predkontácia (Pohoda)</span>
            <KodPohody
              value={p.predkontacia ?? ""}
              onChange={(v) => zmen({ predkontacia: v })}
              moznosti={kody?.predkontacie ?? []}
              placeholder="napr. PHM, 1Fp"
              className={vstup}
              vyber
            />
          </label>
          {!banka && (
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">Členenie DPH (Pohoda)</span>
              <KodPohody
                value={p.clenenie_dph ?? ""}
                onChange={(v) => zmen({ clenenie_dph: v })}
                moznosti={kody?.clenenia ?? []}
                vyber
                placeholder="napr. PD, PN"
                className={vstup}
              />
            </label>
          )}
          {!banka && (
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">Členenie kontrolného výkazu</span>
              <select
                value={p.kv_clenenie ?? ""}
                onChange={(e) => zmen({ kv_clenenie: e.target.value || null })}
                className={vstup}
              >
                <option value="">Nemeniť (automaticky)</option>
                {(vystavena ? KV_VYDANE : KV_PRIJATE).map((k) => (
                  <option key={k.kod} value={k.kod}>
                    {k.nazov}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!banka && !vystavena && (
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
          )}
          {!banka && !vystavena && (
            <label className="block text-sm sm:col-span-2">
              <span className="text-xs text-muted-foreground">Poznámka</span>
              <input
                value={p.poznamka ?? ""}
                onChange={(e) => zmen({ poznamka: e.target.value })}
                placeholder="napr. Telefón #MM-1/YYYY#"
                className={vstup}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Premenné podľa dátumu dokladu:{" "}
                {PREMENNE_POZNAMKY.map((x) => (
                  <span key={x.kod} className="mr-2 whitespace-nowrap" title={x.popis}>
                    <code>{x.kod}</code>
                  </span>
                ))}
                {p.poznamka?.includes("#") ? (
                  <span className="block">Náhľad: {premennePoznamky(p.poznamka, null)}</span>
                ) : null}
              </span>
            </label>
          )}
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
