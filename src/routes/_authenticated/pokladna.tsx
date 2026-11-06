import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { createCashEntry, deleteCashEntry, getCashBook } from "@/lib/faktero/pokladna.functions";
import { formatujDatum } from "@/lib/faktero/uzavierka";
import { Wallet, Plus, Trash2, ArrowDownCircle, ArrowUpCircle, Settings2, Undo2 } from "lucide-react";
import { vratZPohodyFn } from "@/lib/faktero/vratenie.functions";
import { VyberPokladne } from "@/components/faktero/Pokladne";
import { pokladnaDoFormulara, type Pokladna } from "@/lib/faktero/pokladne";
import { MENY } from "@/lib/faktero/mena";
import { useFormatMenyFirmy } from "@/components/faktero/SuctyPoMenach";
import { EmptyState } from "@/components/faktero/ListControls";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { OdkazNaRady } from "@/components/faktero/OdkazNaRady";
import { VyberRadu } from "@/components/faktero/VyberRadu";
import { potvrd } from "@/lib/potvrdenie";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { useT } from "@/lib/i18n/useT";
import { useKlikNaRiadok } from "@/hooks/useKlikNaRiadok";
import { cn } from "@/lib/utils";
import { preloz } from "@/lib/i18n/jazyk";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
export const Route = createFileRoute("/_authenticated/pokladna")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Pokladňa — Faktero") }] }),
  component: PokladnaPage,
});

/** Kladný pohyb (príjem) — zelený text stavového tónu „úspech“ (svetlý aj tmavý motív). */
const TEXT_PRIJMU = "text-[color:var(--stav-uspech-text)]";

function tentoMesiac() {
  return new Date().toISOString().slice(0, 7);
}

function PokladnaPage() {
  const { t } = useT();
  const klik = useKlikNaRiadok();
  /** Doklad v hotovosti vedie do svojho detailu; pokladničný doklad detail nemá. */
  const cielRiadku = (r: any) =>
    r.zdroj === "doklad" && r.id ? { to: "/doklady/novy" as const, search: { id: r.id } as any } : null;
  const mena = useMenaFirmy();
  // Sumy v mene pokladne (inak firmy: CZ → Kč) a jazyku rozhrania.
  const formatMeny = useFormatMenyFirmy();
  const suma = (n: number, m?: string | null) => formatMeny.suma(n || 0, m || undefined);
  /** Príjem s „+“, výdaj záporný — rovnaké znamienko ako pri zostatku (formatujMenu). */
  const sumaSoZnamienkom = (r: { typ: string; suma: number; mena?: string }) => {
    const n = Math.abs(Number(r.suma) || 0);
    return r.typ === "prijem" ? `+${suma(n, r.mena)}` : suma(-n, r.mena);
  };
  const fetchBook = useServerFn(getCashBook);
  const doCreate = useServerFn(createCashEntry);
  const doDelete = useServerFn(deleteCashEntry);
  const doVrat = useServerFn(vratZPohodyFn);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [mesiac, setMesiac] = useState(tentoMesiac());
  const [otvoreny, setOtvoreny] = useState(false);
  /** Vybraná pokladňa; "" = všetky. */
  const [pokladnaId, setPokladnaId] = useState("");
  const [form, setForm] = useState({
    type: "vydaj" as "prijem" | "vydaj",
    amount: "",
    description: "",
    entry_date: dnesBratislava(),
    category: "",
    /* Číselný rad dokladu; prázdne = predvolený. */
    number_series_id: "",
    /* Pokladňa pohybu; prázdne = predvolená (doplní databáza). */
    pokladna_id: "",
  });

  const cid = useMemo(() => getActiveCompanyId(), []);

  const nacitaj = useCallback(() => {
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchBook({ data: { company_id: cid, month: mesiac, pokladna_id: pokladnaId || null } })
      .then((d: any) => setData(d))
      .catch((e: any) => setChyba(e?.message ?? t("Pokladňu sa nepodarilo načítať")))
      .finally(() => setLoading(false));
  }, [cid, fetchBook, mesiac, pokladnaId, t]);

  useEffect(nacitaj, [nacitaj]);

  async function uloz(e: React.FormEvent) {
    e.preventDefault();
    if (!cid) return;
    setBusy(true);
    setChyba(null);
    try {
      await doCreate({
        data: {
          company_id: cid,
          type: form.type,
          amount: Number(form.amount),
          description: form.description.trim(),
          entry_date: form.entry_date,
          category: form.category.trim() || null,
          number_series_id: form.number_series_id || null,
          pokladna_id: pokladnaFormulara || null,
        },
      });
      setForm({ ...form, amount: "", description: "", category: "" });
      setOtvoreny(false);
      nacitaj();
    } catch (err: any) {
      setChyba(err?.message ?? t("Doklad sa nepodarilo uložiť"));
    } finally {
      setBusy(false);
    }
  }

  async function zmaz(id: string) {
    if (!cid || !(await potvrd(t("Naozaj zmazať tento pokladničný doklad?")))) return;
    setBusy(true);
    setChyba(null);
    try {
      await doDelete({ data: { company_id: cid, id } });
      nacitaj();
    } catch (err: any) {
      setChyba(err?.message ?? t("Doklad sa nepodarilo zmazať"));
    } finally {
      setBusy(false);
    }
  }

  /*
    Vrátenie z Pohody: odovzdaný pokladničný doklad sa odomkne (dá sa zmazať
    a opraviť) a ďalšia dávka ho pošle znova. V Pohode ho treba zmazať ručne.
  */
  async function vratit(id: string) {
    if (
      !cid ||
      !(await potvrd(
        t(
          "Vrátiť pokladničný doklad z Pohody? Pri ďalšom odovzdaní pôjde znova. V Pohode ho treba zmazať ručne, inak tam bude dvakrát.",
        ),
        { potvrdit: t("Vrátiť a opraviť") },
      ))
    )
      return;
    setBusy(true);
    setChyba(null);
    try {
      await doVrat({ data: { company_id: cid, druh: "pokladna", ids: [id] } });
      nacitaj();
    } catch (err: any) {
      setChyba(err?.message ?? t("Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }
  const odznakPohody = (r: any) =>
    r.odovzdane ? (
      <span
        className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800"
        title={t("Odovzdané do Pohody {kedy}", { kedy: formatujDatum(String(r.odovzdane).slice(0, 10)) })}
      >
        {t("V Pohode")}
      </span>
    ) : null;
  const tlacidloVratit = (r: any, trieda: string) => (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        void vratit(r.id);
      }}
      className={trieda}
      aria-label={t("Vrátiť z Pohody (opraviť)")}
      title={t("Vrátiť z Pohody (opraviť)")}
    >
      <Undo2 className="h-4 w-4" />
    </button>
  );

  const stav = data?.stav;
  const pole = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  const pokladne: (Pokladna & { stav: any })[] = data?.pokladne ?? [];
  // Prepínač a stĺpec „Pokladňa“ až pri viac ako jednej — firme s jednou sa nič nemení.
  const viac = pokladne.filter((p) => p.id && (p.aktivna || p.stav?.pocet)).length > 1;
  const vsetky = viac && !data?.vybrana;
  const sucty: { mena: string; prijmy: number; vydavky: number; zostatok: number; pociatocny: number; zaporny: boolean }[] =
    data?.sucty ?? [];
  // Nový pohyb ide do vybranej pokladne, pri „Všetky“ do predvolenej.
  const pokladnaFormulara = pokladnaDoFormulara(pokladne, form.pokladna_id || pokladnaId || null);
  const menaFormulara = pokladne.find((p) => p.id === pokladnaFormulara)?.mena ?? mena.kod;
  const menaKnihy = stav?.mena ?? mena.kod;

  return (
    <>
      <PageHeader
        title={t("Pokladňa")}
        description={t("Stav hotovosti z pokladničných dokladov a z dokladov zaplatených v hotovosti.")}
        action={
          <div className="flex flex-wrap gap-2">
            <OdkazNaRady />
            <Link
              to="/uctovnictvo/pokladne"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Settings2 className="h-4 w-4" /> {t("Spravovať pokladne")}
            </Link>
            <button
              type="button"
              onClick={() => setOtvoreny((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" /> {t("Nový pokladničný doklad")}
            </button>
          </div>
        }
      />
      <PageBody>
        {chyba && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {chyba}
          </div>
        )}

        {viac && (
          <div role="group" aria-label={t("Pokladňa")} className="flex flex-wrap gap-2">
            {[{ id: "", nazov: t("Všetky pokladne"), mena: "" }, ...pokladne.filter((p) => p.aktivna || p.stav?.pocet)].map(
              (p: any) => (
                <button
                  key={p.id || "vsetky"}
                  type="button"
                  aria-pressed={pokladnaId === p.id}
                  onClick={() => setPokladnaId(p.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                    pokladnaId === p.id
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {p.nazov}
                  {p.mena && <span className="text-xs text-muted-foreground">{p.mena}</span>}
                </button>
              ),
            )}
          </div>
        )}

        {vsetky ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4" /> {t("Stav pokladní")}
              </div>
              {sucty.map((s) => (
                <div key={s.mena} className={`suma mt-1 text-2xl ${s.zaporny ? "text-destructive" : ""}`}>
                  {suma(s.zostatok, s.mena)}
                </div>
              ))}
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {pokladne
                  .filter((p) => p.aktivna || p.stav?.pocet)
                  .map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{p.nazov}</span>
                      <span className={`suma shrink-0 ${p.stav?.zaporny ? "text-destructive" : ""}`}>
                        {suma(p.stav?.zostatok ?? 0, p.mena)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm text-muted-foreground">{t("Príjmy spolu")}</div>
              {sucty.map((s) => (
                <div key={s.mena} className={`suma mt-1 text-xl ${TEXT_PRIJMU}`}>
                  {suma(s.prijmy, s.mena)}
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm text-muted-foreground">{t("Výdavky spolu")}</div>
              {sucty.map((s) => (
                <div key={s.mena} className="suma mt-1 text-xl">
                  {suma(s.vydavky, s.mena)}
                </div>
              ))}
            </div>
          </div>
        ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="h-4 w-4" /> {t("Stav pokladne")}
            </div>
            <div
              className={`suma mt-1 text-2xl ${
                stav?.zaporny ? "text-destructive" : ""
              }`}
            >
              {suma(stav?.zostatok ?? 0, menaKnihy)}
            </div>
            {stav?.zaporny && (
              <div className="mt-1 text-xs text-destructive">
                {t("Záporná pokladňa znamená chýbajúci príjem alebo vklad — v hotovosti sa do mínusu ísť nedá.")}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm text-muted-foreground">
              {t("Príjmy spolu")}
            </div>
            <div className={`suma mt-1 text-xl ${TEXT_PRIJMU}`}>
              {suma(stav?.prijmy ?? 0, menaKnihy)}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm text-muted-foreground">
              {t("Výdavky spolu")}
            </div>
            <div className="suma mt-1 text-xl">
              {suma(stav?.vydavky ?? 0, menaKnihy)}
            </div>
          </div>
        </div>

        )}

        {otvoreny && (
          <form
            onSubmit={uloz}
            className="grid max-w-3xl gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-5"
          >
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">{t("Druh")}</span>
              <select
                className={pole}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as "prijem" | "vydaj" })}
              >
                <option value="prijem">{t("Príjem do pokladne")}</option>
                <option value="vydaj">{t("Výdaj z pokladne")}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">{t("Dátum")}</span>
              <input
                type="date"
                required
                className={pole}
                value={form.entry_date}
                onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
              />
            </label>
            <VyberPokladne
              className="sm:col-span-2"
              pokladne={pokladne}
              value={pokladnaFormulara}
              onChange={(id) => setForm({ ...form, pokladna_id: id })}
            />
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">{t("Popis")}</span>
              <input
                required
                className={pole}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t("napr. Vklad do pokladne, Tržba v hotovosti")}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">
                {t("Suma ({mena})", { mena: MENY.find((m) => m.code === menaFormulara)?.symbol ?? menaFormulara })}
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                className={pole}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">{t("Kategória")}</span>
              <input
                className={pole}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </label>
            <VyberRadu
              druh="cash"
              hodnota={form.number_series_id}
              onZmena={(id) => setForm({ ...form, number_series_id: id })}
              datum={form.entry_date}
            />
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
              >
                {busy ? t("Ukladám…") : t("Uložiť doklad")}
              </button>
            </div>
          </form>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("Obdobie")}</span>
            <input
              type="month"
              value={mesiac}
              onChange={(e) => setMesiac(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </label>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("Zostatok na začiatku obdobia: {suma}", {
              suma: vsetky
                ? sucty.map((s) => suma(s.pociatocny, s.mena)).join(" · ") || suma(0)
                : suma(data?.pociatocny_stav_obdobia ?? 0, menaKnihy),
            })}
          </span>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-card">
            <NacitavanieStav />
          </div>
        ) : (data?.riadky ?? []).length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState
              icon={Wallet}
              title="V tomto období nie je v pokladni žiadny pohyb."
              action={
                <p className="mx-auto -mt-3 max-w-lg text-sm text-muted-foreground">
                  {t("Do pokladne vstupujú pokladničné doklady a")}{" "}
                  <Link to="/doklady" className="text-primary hover:underline">
                    {t("doklady zaplatené v hotovosti")}
                  </Link>
                  {t(". Doklad zaplatený kartou alebo prevodom hotovosť neuberá.")}
                </p>
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5">{t("Dátum")}</th>
                    <th className="whitespace-nowrap px-3 py-2.5">{t("Číslo")}</th>
                    <th className="px-3 py-2.5">{t("Popis")}</th>
                    <th className="whitespace-nowrap px-3 py-2.5">{t("Zdroj")}</th>
                    {vsetky && <th className="whitespace-nowrap px-3 py-2.5">{t("Pokladňa")}</th>}
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("Suma")}</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("Zostatok")}</th>
                    <th className="p-3"><span className="sr-only">{t("Akcie")}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(data?.riadky ?? []).map((r: any) => {
                    const pr = klik(cielRiadku(r));
                    return (
                    <tr key={`${r.zdroj}-${r.id}-${r.pokladna_id}`} {...pr} className={cn(pr.className, "hover:bg-muted/30")}>
                      <td className="whitespace-nowrap p-3 text-muted-foreground">{formatujDatum(r.datum)}</td>
                      <td className="whitespace-nowrap p-3">
                        {r.cislo ? <span className="cislo-dokladu">{r.cislo}</span> : "—"}
                        {odznakPohody(r)}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1.5">
                          {r.typ === "prijem" ? (
                            <ArrowDownCircle className={`h-4 w-4 shrink-0 ${TEXT_PRIJMU}`} />
                          ) : (
                            <ArrowUpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          {r.popis}
                        </span>
                      </td>
                      <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                        {r.zdroj === "doklad" ? (
                          <Link to="/doklady/novy" search={{ id: r.id } as any} className="hover:underline">
                            {t("Doklad v hotovosti")}
                          </Link>
                        ) : (
                          t("Pokladničný doklad")
                        )}
                      </td>
                      {vsetky && <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{r.pokladna}</td>}
                      <td
                        className={`suma p-3 text-right ${
                          r.typ === "prijem" ? TEXT_PRIJMU : ""
                        }`}
                      >
                        {sumaSoZnamienkom(r)}
                      </td>
                      <td className="suma p-3 text-right">
                        {suma(r.zostatok, r.mena)}
                      </td>
                      <td className="p-3 text-right">
                        {r.zdroj === "pokladnicny" && r.odovzdane
                          ? tlacidloVratit(r, "rounded-md p-1 text-muted-foreground hover:bg-secondary disabled:opacity-50")
                          : null}
                        {r.zdroj === "pokladnicny" && !r.odovzdane && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => zmaz(r.id)}
                            className="rounded-md p-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            aria-label={t("Zmazať doklad")}
                            title={t("Zmazať doklad")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Na mobile karty — tabuľka by Zdroj, Sumu a Zostatok orezala. */}
            <div className="space-y-2 md:hidden">
              {(data?.riadky ?? []).map((r: any) => {
                const pk = klik(cielRiadku(r), { klavesnica: false });
                return (
                <div
                  key={`${r.zdroj}-${r.id}-${r.pokladna_id}`}
                  {...pk}
                  className={cn(pk.className, "rounded-xl border border-border bg-card p-3")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
                      {r.typ === "prijem" ? (
                        <ArrowDownCircle className={`h-4 w-4 shrink-0 ${TEXT_PRIJMU}`} />
                      ) : (
                        <ArrowUpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 break-words">{r.popis}</span>
                    </span>
                    <span
                      className={`suma shrink-0 ${r.typ === "prijem" ? TEXT_PRIJMU : ""}`}
                    >
                      {sumaSoZnamienkom(r)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="whitespace-nowrap">
                      {formatujDatum(r.datum)}
                      {r.cislo ? <span className="cislo-dokladu">{` · ${r.cislo}`}</span> : ""}
                      {odznakPohody(r)}
                    </span>
                    <span className="whitespace-nowrap">
                      {t("Zostatok:")}{" "}
                      <strong className="suma text-foreground">{suma(r.zostatok, r.mena)}</strong>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    {r.zdroj === "doklad" ? (
                      <Link to="/doklady/novy" search={{ id: r.id } as any} className="hover:underline">
                        {t("Doklad v hotovosti")}
                      </Link>
                    ) : (
                      <span>{t("Pokladničný doklad")}</span>
                    )}
                    {vsetky && <span className="min-w-0 truncate">{r.pokladna}</span>}
                    {r.zdroj === "pokladnicny" && r.odovzdane
                      ? tlacidloVratit(r, "p-1 text-muted-foreground disabled:opacity-50")
                      : null}
                    {r.zdroj === "pokladnicny" && !r.odovzdane && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => zmaz(r.id)}
                        className="p-1 text-destructive disabled:opacity-50"
                        aria-label={t("Zmazať doklad")}
                        title={t("Zmazať doklad")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </>
        )}

        {data?.locked_until && (
          <p className="text-xs text-muted-foreground">
            {t(
              "Obdobie je uzamknuté do {datum} — doklady s tým a starším dátumom sa už nedajú pridať ani zmazať.",
              { datum: formatujDatum(data.locked_until) },
            )}
          </p>
        )}
      </PageBody>
    </>
  );
}
