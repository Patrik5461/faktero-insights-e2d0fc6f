import { menaClenovFirmy } from "@/lib/faktero/invitations.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, GripVertical, Loader2, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { AutopilotKarta } from "@/components/faktero/AutopilotKarta";
import { PredlohyUctovania } from "@/components/faktero/PredlohyUctovania";
import { PomerEditor, type PomerHodnota } from "@/components/faktero/PomerEditor";
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
import { uplatniPravidlaBankyFn } from "@/lib/faktero/pohyb-vybavenie.functions";
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
  krajinaDokladu,
  type DokladNaPorovnanie,
  type Pravidlo,
} from "@/lib/faktero/pravidla-uctovania";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

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
  /** Odosielateľ mailu a VS dokladu — podmienka, alebo ponuka na pridanie. */
  email?: string;
  vs?: string;
  pokladna?: string;
  /** Otvoriť existujúce pravidlo na úpravu (podobné už je). */
  upravit?: string;
  /** Banka — „Vytvoriť pravidlo z tohto pohybu“: IBAN a VS protistrany, smer, protistrana. */
  iban?: string;
  smer?: string;
  bvs?: string;
  protistrana?: string;
};
const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined;

export const Route = createFileRoute("/_authenticated/uctovnictvo/pravidla")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Pravidlá účtovania — Faktero") }],
  }),
  validateSearch: (s: Record<string, unknown>): Hladanie => ({
    novy: text(s.novy),
    nazov: text(s.nazov),
    ico: text(s.ico),
    predkontacia: text(s.predkontacia),
    clenenie: text(s.clenenie),
    kv: text(s.kv),
    kategoria: text(s.kategoria),
    email: text(s.email),
    vs: text(s.vs),
    pokladna: text(s.pokladna),
    upravit: text(s.upravit),
    iban: text(s.iban),
    smer: s.smer === "prijem" || s.smer === "vydaj" ? s.smer : undefined,
    bvs: text(s.bvs),
    protistrana: text(s.protistrana),
  }),
  component: PravidlaPage,
});

type Zalozka = "vsetky" | DruhPravidla | "predlohy";
const ZALOZKY: { kod: Zalozka; nazov: string }[] = [
  { kod: "vsetky", nazov: "Všetky" },
  { kod: "blocek", nazov: "Bločky" },
  { kod: "prijata", nazov: "Prijaté faktúry" },
  { kod: "vystavena", nazov: "Vystavené faktúry" },
  { kod: "banka", nazov: "Banka" },
  { kod: "predlohy", nazov: "Predlohy" },
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
/** Účtovné polia — väčšie, ako všade inde pri zaúčtovaní. */
const vstupZauctovania =
  "mt-1 h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";

function PravidlaPage() {
  const { t } = useT();
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
  /* Návrhy podmienok z dokladu (e-mail, VS), keď pravidlo už má partnera. */
  const [navrhPodmienok, setNavrhPodmienok] = useState<{ email?: string; vs?: string }>({});
  /* Prišiel z dokladu cez „Vytvoriť pravidlo" — formulár sa otvorí predvyplnený. */
  useEffect(() => {
    if (!hladanie.novy) return;
    /* Z detailu bankového pohybu — pravidlo „Spárované bez dokladu“. */
    if (hladanie.novy === "banka") {
      setUprava({
        ...NOVE,
        druh: "banka",
        nazov: hladanie.nazov ?? (hladanie.bvs ? `VS ${hladanie.bvs}` : (hladanie.iban ?? "")),
        smer: (hladanie.smer as Pravidlo["smer"]) ?? null,
        iban_protistrany: hladanie.iban ?? null,
        variabilny_symbol: hladanie.bvs ?? null,
        dodavatel_text: hladanie.protistrana ?? null,
        bez_dokladu: true,
      });
      setZalozka("banka");
      void navigate({ search: {}, replace: true });
      return;
    }
    const druh =
      (["blocek", "prijata", "vystavena"] as const).find((d) => d === hladanie.novy) ?? null;
    // Bez partnera sa podmienkou stane e-mail alebo stály VS; s partnerom sa len ponúknu.
    const partner = Boolean(hladanie.ico || hladanie.nazov);
    const vs = druh === "prijata" ? hladanie.vs : undefined;
    setUprava({
      ...NOVE,
      druh,
      nazov: hladanie.nazov ?? hladanie.email ?? (vs ? `VS ${vs}` : ""),
      dodavatel_text: hladanie.ico ? null : (hladanie.nazov ?? null),
      dodavatel_ico: hladanie.ico ?? null,
      odosielatel_text: partner ? null : (hladanie.email ?? null),
      variabilny_symbol: partner || hladanie.email ? null : (vs ?? null),
      predkontacia: hladanie.predkontacia ?? null,
      clenenie_dph: hladanie.clenenie ?? null,
      kv_clenenie: hladanie.kv ?? null,
      kategoria: druh === "vystavena" ? null : (hladanie.kategoria ?? null),
      pokladna: druh === "blocek" ? (hladanie.pokladna ?? null) : null,
    });
    setNavrhPodmienok(partner ? { email: hladanie.email, vs } : hladanie.email ? { vs } : {});
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
      { data: firma },
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
        .select(
          "supplier_ico, supplier_name, supplier_ic_dph, payment_method, created_by, predmet_mailu, odosielatel_mailu",
        )
        .eq("company_id", cid)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("purchase_invoices")
        .select(
          "supplier_ico, supplier_name, supplier_ic_dph, supplier_country, payment_method, created_by, predmet_mailu, odosielatel_mailu, variable_symbol, type, amount_total, opravuje_cislo",
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
      supabase.from("companies").select("country").eq("id", cid).maybeSingle(),
    ]);
    const krajinaFirmy = (firma?.country as string | null) ?? null;
    if (error) toast.error(error.message);
    setPravidla((p ?? []) as unknown as Riadok[]);
    setDoklady([
      ...((d ?? []) as any[]).map((x) => ({
        ...x,
        druh: "blocek" as const,
        krajina: krajinaDokladu(null, x.supplier_ic_dph),
        krajina_firmy: krajinaFirmy,
      })),
      ...((pf ?? []) as any[]).map((x) => ({
        ...x,
        druh: "prijata" as const,
        typ: typPrijatej(x.type, x.amount_total, x.opravuje_cislo),
        krajina: krajinaDokladu(x.supplier_country, x.supplier_ic_dph),
        krajina_firmy: krajinaFirmy,
        variabilny_symbol: x.variable_symbol,
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

  /* Odkaz „Upraviť pravidlo" z dokladu — podobné pravidlo už je, otvorí sa ono. */
  useEffect(() => {
    if (!hladanie.upravit || !pravidla) return;
    const r = pravidla.find((x) => x.id === hladanie.upravit);
    if (r) {
      setUprava({ ...r });
      setZalozka(r.druh ?? "vsetky");
    }
    void navigate({ search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hladanie.upravit, pravidla]);

  /*
    Poradie ťahaním (alebo šípkami — na dotyk a z klávesnice). Viditeľné
    pravidlá záložky sa prečíslujú po desiatkach, uložia sa len zmenené.
  */
  const [tahane, setTahane] = useState<string | null>(null);
  async function presun(id: string, ciel: string | null, smer?: -1 | 1) {
    if (!pravidla) return;
    const viditelne = pravidla.filter((r) => vZalozke(r, zalozka));
    const odkial = viditelne.findIndex((r) => r.id === id);
    if (odkial < 0) return;
    let kam = smer ? odkial + smer : viditelne.findIndex((r) => r.id === ciel);
    if (kam < 0 || kam >= viditelne.length || kam === odkial) return;
    const nove = [...viditelne];
    const [x] = nove.splice(odkial, 1);
    nove.splice(kam, 0, x);
    const zmenene = nove
      .map((r, i) => ({ r, poradie: (i + 1) * 10 }))
      .filter(({ r, poradie }) => r.poradie !== poradie);
    if (!zmenene.length) return;
    const mapa = new Map(zmenene.map(({ r, poradie }) => [r.id, poradie]));
    setPravidla(
      [...pravidla.map((r) => (mapa.has(r.id) ? { ...r, poradie: mapa.get(r.id)! } : r))].sort(
        (a, b) => a.poradie - b.poradie,
      ),
    );
    const vysledky = await Promise.all(
      zmenene.map(({ r, poradie }) =>
        supabase.from("pravidla_uctovania").update({ poradie }).eq("id", r.id),
      ),
    );
    const chyba = vysledky.find((v) => v.error)?.error;
    if (chyba) toast.error(chyba.message);
    void nacitaj();
  }

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
    toast.success(t("Pravidlo zmazané. Doklady, ktoré už doplnilo, ostávajú, ako sú."));
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
          ? t("Žiadny neodovzdaný doklad bez pravidla na pravidlá nesedí.")
          : t(
              n === 1
                ? "Pravidlá doplnili {n} doklad (bločky, prijaté aj vystavené faktúry)."
                : n < 5
                  ? "Pravidlá doplnili {n} doklady (bločky, prijaté aj vystavené faktúry)."
                  : "Pravidlá doplnili {n} dokladov (bločky, prijaté aj vystavené faktúry).",
              { n },
            ),
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
        title={t("Pravidlá účtovania")}
        description={t(
          "Automatické účtovanie: bloček, prijatá aj vystavená faktúra či pohyb v banke dostane predkontáciu, členenie DPH a KV sám — hneď, ako vznikne.",
        )}
        action={
          zalozka === "predlohy" ? undefined : (
          <button
            onClick={() =>
              setUprava({ ...NOVE, druh: zalozka === "vsetky" ? null : zalozka })
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t("Nové pravidlo")}
          </button>
          )
        }
      />
      <PageBody>
        {cid && (
          <div className="mb-4">
            <AutopilotKarta companyId={cid} />
          </div>
        )}
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {t(
            "Pravidlo zaberie pri každom novom doklade — naskenovanom, z e-mailu, z appky aj z importu. Dopĺňa len to, čo je prázdne; čo vyplníte sami, neprepíše. Predkontácia a členenie DPH idú do Pohody namiesto spoločných z",
          )}{" "}
          <Link to="/uctovnictvo/pohoda" className="text-primary hover:underline">
            {t("nastavení prepojenia")}
          </Link>
          {t(
            ". Keď na doklad sedí viac pravidiel, platí to s menším poradím; pravidlo podľa partnera má prednosť pred pravidlom podľa používateľa. Pravidlá pre banku zaberú pri vývoze výpisu do Pohody — majú prednosť pred predkontáciou podľa označenia pohybu.",
          )}
        </div>

        <div role="tablist" aria-label={t("Druh pravidla")} className="mt-4 flex flex-wrap gap-1">
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
                {t(z.nazov)}
                {pravidla && z.kod !== "predlohy" ? (
                  <span className="ml-1 opacity-70">{pocet}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {zalozka === "predlohy" ? (
          cid ? (
            <PredlohyUctovania companyId={cid} />
          ) : null
        ) : pravidla === null ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
          </div>
        ) : pravidla.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("Zatiaľ žiadne pravidlo. Typický začiatok: „dodávateľ obsahuje")} <em>Slovnaft</em>{" "}
            {t("→ kategória Palivo, predkontácia PHM“.")}
          </div>
        ) : (
          <>
            <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">{t("Poradie")}</th>
                    <th className="p-3">{t("Pravidlo")}</th>
                    <th className="p-3">{t("Keď")}</th>
                    <th className="p-3">{t("Doplní")}</th>
                    <th className="p-3 text-right">{t("Sedí na")}</th>
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
                          draggable
                          onDragStart={(e) => {
                            setTahane(r.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            if (tahane) e.preventDefault();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (tahane && tahane !== r.id) void presun(tahane, r.id);
                            setTahane(null);
                          }}
                          onDragEnd={() => setTahane(null)}
                          className={`border-b border-border last:border-0 ${r.aktivne ? "" : "opacity-50"} ${tahane === r.id ? "bg-secondary" : ""}`}
                        >
                          <td className="p-3 tabular-nums">
                            <div className="flex items-center gap-1">
                              <GripVertical
                                className="h-4 w-4 cursor-grab text-muted-foreground"
                                aria-hidden
                              />
                              <span title={t("Potiahnutím zmeníte poradie")}>{r.poradie}</span>
                              <span className="ml-1 flex flex-col">
                                <button
                                  onClick={() => void presun(r.id, null, -1)}
                                  aria-label={t("Posunúť vyššie: {nazov}", { nazov: r.nazov })}
                                  className="rounded p-0.5 hover:bg-secondary"
                                >
                                  <ChevronUp className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => void presun(r.id, null, 1)}
                                  aria-label={t("Posunúť nižšie: {nazov}", { nazov: r.nazov })}
                                  className="rounded p-0.5 hover:bg-secondary"
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </button>
                              </span>
                            </div>
                          </td>
                          <td className="p-3 font-medium">
                            {r.nazov}
                            {zalozka === "vsetky" && (
                              <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                                {t(DRUHY_PRAVIDIEL.find((d) => d.kod === (r.druh ?? null))?.nazov ?? "")}
                              </span>
                            )}
                            {!r.aktivne && (
                              <span className="ml-2 text-xs font-normal">{t("(vypnuté)")}</span>
                            )}
                          </td>
                          <td className="p-3">{ked}</td>
                          <td className="p-3">{doplni}</td>
                          <td className="p-3 text-right tabular-nums text-muted-foreground">
                            {pocet === null ? (
                              <span
                                title={t("Pohyby z výpisov sa neukladajú — pravidlo zaberie pri vývoze")}
                              >
                                {t("pri vývoze")}
                              </span>
                            ) : (
                              <>
                                {t(
                                  pocet === 1
                                    ? "{n} doklad"
                                    : pocet >= 2 && pocet <= 4
                                      ? "{n} doklady"
                                      : "{n} dokladov",
                                  { n: pocet },
                                )}
                              </>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => void prepni(r)}
                                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                              >
                                {r.aktivne ? t("Vypnúť") : t("Zapnúť")}
                              </button>
                              <button
                                onClick={() => setUprava({ ...r })}
                                aria-label={t("Upraviť {nazov}", { nazov: r.nazov })}
                                className="rounded-md border border-border p-1.5 hover:bg-secondary"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setMazane(r)}
                                aria-label={t("Zmazať {nazov}", { nazov: r.nazov })}
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
                {t("Uplatniť na doklady a faktúry, ktoré už sú")}
              </button>
              <span className="text-xs text-muted-foreground">
                {t(
                  "Týka sa bločkov a prijatých či vystavených faktúr, ktoré ešte neodišli do účtovníctva (vystavené: nie sú zaúčtované) a žiadne pravidlo ich zatiaľ nedoplnilo.",
                )}
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
          navrhPodmienok={navrhPodmienok}
          onClose={() => {
            setUprava(null);
            setNavrhPodmienok({});
          }}
          onUlozene={() => {
            setUprava(null);
            void nacitaj();
          }}
        />
      )}
      <ConfirmDialog
        open={!!mazane}
        title={t("Zmazať pravidlo?")}
        message={t(
          "Pravidlo „{nazov}“ sa prestane uplatňovať na nové doklady. Doklady, ktoré už doplnilo, ostávajú, ako sú.",
          { nazov: mazane?.nazov ?? "" },
        )}
        confirmLabel={t("Zmazať")}
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
  navrhPodmienok = {},
  onClose,
  onUlozene,
}: {
  companyId: string;
  pravidlo: Pravidlo;
  doklady: DokladNaPorovnanie[];
  ucty: string[];
  /** E-mail a VS z dokladu, ktoré sa dajú pridať jedným klikom. */
  navrhPodmienok?: { email?: string; vs?: string };
  onClose: () => void;
  onUlozene: () => void;
}) {
  const { t } = useT();
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
  const partner = vystavena ? t("Odberateľ") : t("Dodávateľ");
  const chyba = chybaPravidla(p);
  const nacitajMenaClenov = useServerFn(menaClenovFirmy);
  const uplatniBanku = useServerFn(uplatniPravidlaBankyFn);
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
    if (chyba) return toast.error(t(chyba));
    setBusy(true);
    try {
      // `rozuctovanie` je jsonb — v typoch tabuľky Json, v pravidle neznámy tvar pomeru.
      const riadok = { ...naUlozenie(ocistiPodlaDruhu(p)), updated_at: new Date().toISOString() } as any;
      const { error } = p.id
        ? await supabase
            .from("pravidla_uctovania")
            .update(riadok)
            .eq("id", p.id)
        : await supabase
            .from("pravidla_uctovania")
            .insert({ ...riadok, company_id: companyId });
      if (error) throw new Error(error.message);
      toast.success(
        p.id ? t("Pravidlo uložené.") : t("Pravidlo pridané — zaberie pri ďalšom doklade."),
      );
      /* Pravidlo „Spárované bez dokladu“ vybaví aj staršie nespárované pohyby, nielen nové. */
      if (riadok.druh === "banka" && riadok.bez_dokladu && riadok.aktivne) {
        try {
          const { vybavenych } = await uplatniBanku({ data: { company_id: companyId } });
          if (vybavenych > 0)
            toast.success(t("Za vybavené bez dokladu sa označilo {n} starších pohybov.", { n: vybavenych }));
        } catch {
          /* nové pohyby pravidlo aj tak vybaví pri príchode */
        }
      }
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
        aria-label={p.id ? t("Upraviť pravidlo") : t("Nové pravidlo")}
        className="w-full max-w-xl rounded-xl border border-border bg-card p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">{p.id ? t("Upraviť pravidlo") : t("Nové pravidlo")}</h3>

        <label className="mt-4 block text-sm">
          <span className="text-xs font-medium text-muted-foreground">{t("Názov")}</span>
          <input
            value={p.nazov}
            onChange={(e) => zmen({ nazov: e.target.value })}
            placeholder={t("napr. Tankovanie Slovnaft")}
            className={vstup}
          />
        </label>

        <label className="mt-4 block text-sm">
          <span className="text-xs font-medium text-muted-foreground">{t("Platí pre")}</span>
          <select
            value={p.druh ?? ""}
            onChange={(e) => zmen({ druh: (e.target.value || null) as DruhPravidla | null })}
            className={vstup}
          >
            {DRUHY_PRAVIDIEL.map((d) => (
              <option key={d.kod ?? ""} value={d.kod ?? ""}>
                {t(d.nazov)}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 text-sm font-medium">
          {banka ? t("Keď pohyb na výpise…") : t("Keď doklad…")}
        </div>
        {banka ? (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("Na účte (IBAN)")}</span>
              <input
                value={p.bankovy_ucet ?? ""}
                onChange={(e) => zmen({ bankovy_ucet: e.target.value })}
                list="pravidla-ucty"
                placeholder={t("Ktorýkoľvek účet")}
                className={vstup}
              />
              <datalist id="pravidla-ucty">
                {ucty.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("Smer")}</span>
              <select
                value={p.smer ?? ""}
                onChange={(e) => zmen({ smer: (e.target.value || null) as Pravidlo["smer"] })}
                className={vstup}
              >
                <option value="">{t("Príjem aj výdaj")}</option>
                {SMERY_POHYBU.map((x) => (
                  <option key={x.kod} value={x.kod}>
                    {t(x.nazov)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("Typ pohybu")}</span>
              <select
                value={p.oznacenie ?? ""}
                onChange={(e) => zmen({ oznacenie: e.target.value || null })}
                className={vstup}
              >
                <option value="">{t("Akýkoľvek")}</option>
                {OZNACENIA.map((o) => (
                  <option key={o.kod} value={o.kod}>
                    {t(o.nazov)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">
                {t("Protistrana alebo popis obsahuje")}
              </span>
              <input
                value={p.dodavatel_text ?? ""}
                onChange={(e) => zmen({ dodavatel_text: e.target.value })}
                placeholder={t("napr. Finančná správa")}
                className={vstup}
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("IBAN protistrany")}</span>
              <input
                value={p.iban_protistrany ?? ""}
                onChange={(e) => zmen({ iban_protistrany: e.target.value })}
                placeholder={t("Ktorýkoľvek")}
                className={vstup}
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("Variabilný symbol")}</span>
              <input
                value={p.variabilny_symbol ?? ""}
                onChange={(e) => zmen({ variabilny_symbol: e.target.value })}
                inputMode="numeric"
                placeholder={t("Akýkoľvek")}
                className={vstup}
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("Poradie (menšie vyhráva)")}</span>
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
              <span className="text-xs text-muted-foreground">{t("{partner} obsahuje", { partner })}</span>
              <input
                value={p.dodavatel_text ?? ""}
                onChange={(e) => zmen({ dodavatel_text: e.target.value })}
                placeholder={vystavena ? t("napr. {x}", { x: "Kaufland" }) : "Slovnaft"}
                className={vstup}
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("alebo má IČO")}</span>
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
                <span className="text-xs text-muted-foreground">{t("Typ faktúry")}</span>
                <select
                  value={p.typ_dokladu ?? ""}
                  onChange={(e) => zmen({ typ_dokladu: e.target.value || null })}
                  className={vstup}
                >
                  <option value="">{t("Akýkoľvek")}</option>
                  {TYPY_DOKLADU.filter((x) => vystavena || x.prijata).map((x) => (
                    <option key={x.kod} value={x.kod}>
                      {t(x.nazov)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!vystavena && (
              <label className="block text-sm">
                <span className="text-xs text-muted-foreground">{t("Spôsob úhrady")}</span>
                <select
                  value={p.sposob_uhrady ?? ""}
                  onChange={(e) => zmen({ sposob_uhrady: e.target.value || null })}
                  className={vstup}
                >
                  <option value="">{t("Akýkoľvek")}</option>
                  {SPOSOBY_UHRADY_DOKLADU.map((s) => (
                    <option key={s.kod} value={s.kod}>
                      {t(s.nazov)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">
                {vystavena ? t("Faktúru vystavil") : t("Doklad nahral")}
              </span>
              <select
                value={p.pouzivatel_id ?? ""}
                onChange={(e) => zmen({ pouzivatel_id: e.target.value || null })}
                className={vstup}
              >
                <option value="">{t("Ktokoľvek")}</option>
                {Object.entries(clenovia).map(([id, meno]) => (
                  <option key={id} value={id}>
                    {meno}
                  </option>
                ))}
              </select>
            </label>
            {!vystavena && (
              <label className="block text-sm">
                <span className="text-xs text-muted-foreground">{t("Predmet mailu obsahuje")}</span>
                <input
                  value={p.predmet_text ?? ""}
                  onChange={(e) => zmen({ predmet_text: e.target.value })}
                  placeholder={t("napr. Orange faktúra")}
                  className={vstup}
                />
              </label>
            )}
            {!vystavena && (
              <label className="block text-sm">
                <span className="text-xs text-muted-foreground">{t("E-mail odosielateľa obsahuje")}</span>
                <input
                  value={p.odosielatel_text ?? ""}
                  onChange={(e) => zmen({ odosielatel_text: e.target.value })}
                  placeholder={t("napr. {x}", { x: "@telekom.sk" })}
                  className={vstup}
                />
              </label>
            )}
            {!vystavena && (
              <label className="block text-sm">
                <span className="text-xs text-muted-foreground">{t("Krajina dodávateľa")}</span>
                <input
                  value={p.krajina ?? ""}
                  onChange={(e) => zmen({ krajina: e.target.value.toUpperCase().slice(0, 2) })}
                  placeholder={t("napr. {x}", { x: "CZ" })}
                  maxLength={2}
                  className={vstup}
                />
              </label>
            )}
            {p.druh !== "blocek" && !vystavena && (
              <label className="block text-sm">
                <span className="text-xs text-muted-foreground">
                  {t("Variabilný symbol (stály, napr. zmluva)")}
                </span>
                <input
                  value={p.variabilny_symbol ?? ""}
                  onChange={(e) => zmen({ variabilny_symbol: e.target.value })}
                  inputMode="numeric"
                  placeholder="1234567890"
                  className={vstup}
                />
              </label>
            )}
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{t("Poradie (menšie vyhráva)")}</span>
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
          {t(
            "Vyplnené podmienky musia platiť naraz. IČO aj názov sa dajú kombinovať.",
          )}
          {!banka && !vystavena
            ? ` ${t("Bez krajiny na doklade platí krajina vašej firmy; VS sa porovnáva len podľa číslic.")}`
            : ""}
        </p>
        {!banka && !vystavena && (navrhPodmienok.email || navrhPodmienok.vs) ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t("Z dokladu:")}</span>
            {navrhPodmienok.email && !p.odosielatel_text ? (
              <button
                type="button"
                onClick={() => zmen({ odosielatel_text: navrhPodmienok.email ?? null })}
                className="rounded-md border border-border px-2 py-1 hover:bg-secondary"
              >
                + {t("e-mail {x}", { x: navrhPodmienok.email })}
              </button>
            ) : null}
            {navrhPodmienok.vs && p.druh !== "blocek" && !p.variabilny_symbol ? (
              <button
                type="button"
                onClick={() => zmen({ variabilny_symbol: navrhPodmienok.vs ?? null })}
                className="rounded-md border border-border px-2 py-1 hover:bg-secondary"
              >
                + {t("VS {x}", { x: navrhPodmienok.vs })}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 text-sm font-medium">{t("…doplní sa")}</div>
        <div className="mt-2 grid max-w-2xl grid-cols-1 gap-3 [&>*]:min-w-0">
          {banka && (
            <label className="block text-sm">
              <span className="font-medium">{t("Párovanie")}</span>
              <select
                value={p.bez_dokladu ? "bez_dokladu" : ""}
                onChange={(e) => zmen({ bez_dokladu: e.target.value === "bez_dokladu" })}
                className={vstupZauctovania}
              >
                <option value="">{t("Nedefinované")}</option>
                <option value="bez_dokladu">{t("Spárované bez dokladu")}</option>
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t(
                  "Pohyb sa pri príchode z banky označí za vybavený a nebude čakať na doklad — poplatky banky, mzdy, odvody poisťovniam. Predkontácia je potom nepovinná a použije sa vo výpise do Pohody.",
                )}
              </span>
            </label>
          )}
          {banka && p.bez_dokladu && (
            <label className="block text-sm">
              <span className="font-medium">{t("Poznámka k pohybu")}</span>
              <input
                value={p.poznamka ?? ""}
                maxLength={100}
                onChange={(e) => zmen({ poznamka: e.target.value })}
                placeholder={t("napr. Odvody #MM-1/YYYY#")}
                className={vstupZauctovania}
              />
            </label>
          )}
          {!banka && !vystavena && (
            <label className="block text-sm">
              <span className="font-medium">{t("Kategória")}</span>
              <select
                value={p.kategoria ?? ""}
                onChange={(e) => zmen({ kategoria: e.target.value || null })}
                className={vstupZauctovania}
              >
                <option value="">—</option>
                {KATEGORIE_VYDAVKOV.map((k) => (
                  <option key={k.kod} value={k.kod}>
                    {t(k.nazov)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            <span className="font-medium">{t("Predkontácia (Pohoda)")}</span>
            <KodPohody
              value={p.predkontacia ?? ""}
              onChange={(v) => zmen({ predkontacia: v })}
              moznosti={kody?.predkontacie ?? []}
              placeholder={t("napr. {x}", { x: "PHM, 1Fp" })}
              className={vstupZauctovania}
              vyber
            />
          </label>
          {!banka && (
            <label className="block text-sm">
              <span className="font-medium">{t("Členenie DPH (Pohoda)")}</span>
              <KodPohody
                value={p.clenenie_dph ?? ""}
                onChange={(v) => zmen({ clenenie_dph: v })}
                moznosti={kody?.clenenia ?? []}
                vyber
                placeholder={t("napr. {x}", { x: "PD, PN" })}
                className={vstupZauctovania}
              />
            </label>
          )}
          {!banka && (
            <label className="block text-sm">
              <span className="font-medium">{t("Členenie kontrolného výkazu")}</span>
              <select
                value={p.kv_clenenie ?? ""}
                onChange={(e) => zmen({ kv_clenenie: e.target.value || null })}
                className={vstupZauctovania}
              >
                <option value="">{t("Nemeniť (automaticky)")}</option>
                {(vystavena ? KV_VYDANE : KV_PRIJATE).map((k) => (
                  <option key={k.kod} value={k.kod}>
                    {t(k.nazov)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!banka && !vystavena && (
            <label className="block text-sm">
              <span className="font-medium">{t("Odpočet DPH")}</span>
              <select
                value={p.odpocet === null ? "" : p.odpocet ? "ano" : "nie"}
                onChange={(e) =>
                  zmen({ odpocet: e.target.value === "" ? null : e.target.value === "ano" })
                }
                className={vstupZauctovania}
              >
                <option value="">{t("Nemeniť")}</option>
                <option value="ano">{t("S odpočtom")}</option>
                <option value="nie">{t("Bez odpočtu (napr. reprezentácia)")}</option>
              </select>
            </label>
          )}
          {p.druh === "blocek" || p.druh === null ? (
            <label className="block text-sm">
              <span className="font-medium">{t("Pokladňa (hotovostný bloček)")}</span>
              <KodPohody
                value={p.pokladna ?? ""}
                onChange={(v) => zmen({ pokladna: v })}
                moznosti={kody?.pokladne ?? []}
                placeholder={t("napr. {x}", { x: "HP" })}
                className={vstupZauctovania}
                vyber
              />
            </label>
          ) : null}
          {!banka && !vystavena && (
            <div className="text-sm">
              <PomerEditor
                value={(p.rozuctovanie ?? null) as PomerHodnota}
                onChange={(v) => zmen({ rozuctovanie: v })}
                predkontacie={kody?.predkontacie ?? []}
                clenenia={kody?.clenenia ?? []}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {t(
                  "Rozúčtovanie na položky: doklad sa pri odovzdaní rozdelí na časti s vlastnou predkontáciou v tomto pomere — sumy sa dopočítajú z rozpisu DPH dokladu.",
                )}
              </span>
            </div>
          )}
          {!banka && !vystavena && (
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium">{t("Poznámka")}</span>
              <input
                value={p.poznamka ?? ""}
                onChange={(e) => zmen({ poznamka: e.target.value })}
                placeholder={t("napr. Telefón #MM-1/YYYY#")}
                className={vstupZauctovania}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("Premenné podľa dátumu dokladu:")}{" "}
                {PREMENNE_POZNAMKY.map((x) => (
                  <span key={x.kod} className="mr-2 whitespace-nowrap" title={t(x.popis)}>
                    <code>{x.kod}</code>
                  </span>
                ))}
                {p.poznamka?.includes("#") ? (
                  <span className="block">
                    {t("Náhľad: {text}", { text: premennePoznamky(p.poznamka, null) })}
                  </span>
                ) : null}
              </span>
            </label>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "Skratky predkontácie a členenia sú tie, ktoré máte v Pohode — Faktero ich pošle tak, ako ich napíšete.",
          )}
        </p>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={p.aktivne}
            onChange={(e) => zmen({ aktivne: e.target.checked })}
          />
          {t("Pravidlo je zapnuté")}
        </label>

        {sedi !== null && (
          <p className="mt-4 rounded-md bg-secondary/50 p-3 text-sm">
            {t("Zo súčasných dokladov by sedelo na")}{" "}
            <strong>
              {t(
                sedi === 1 ? "{n} doklad" : sedi >= 2 && sedi <= 4 ? "{n} doklady" : "{n} dokladov",
                { n: sedi },
              )}
            </strong>
            .
          </p>
        )}
        {chyba && p.nazov && <p className="mt-3 text-sm text-destructive">{t(chyba)}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
          >
            {t("Zrušiť")}
          </button>
          <button
            onClick={() => void uloz()}
            disabled={busy || !!chyba}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("Uložiť")}
          </button>
        </div>
      </div>
    </div>
  );
}
