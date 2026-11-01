import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { createCashEntry, deleteCashEntry, getCashBook } from "@/lib/faktero/pokladna.functions";
import { formatujDatum } from "@/lib/faktero/uzavierka";
import { Wallet, Plus, Trash2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { EmptyState } from "@/components/faktero/ListControls";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { formatovacMeny } from "@/lib/faktero/mena";
import { OdkazNaRady } from "@/components/faktero/OdkazNaRady";
import { VyberRadu } from "@/components/faktero/VyberRadu";
import { potvrd } from "@/lib/potvrdenie";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

import { dnesBratislava } from "@/lib/faktero/datum-vystavenia";
export const Route = createFileRoute("/_authenticated/pokladna")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Pokladňa — Faktero") }] }),
  component: PokladnaPage,
});

function suma(n: number) {
  return formatovacMeny("EUR", "sk-SK")(n || 0);
}

/** Príjem s „+“, výdaj záporný — rovnaké znamienko ako pri zostatku (formatujMenu). */
function sumaSoZnamienkom(r: { typ: string; suma: number }) {
  const n = Math.abs(Number(r.suma) || 0);
  return r.typ === "prijem" ? `+${suma(n)}` : suma(-n);
}

/** Kladný pohyb (príjem) — zelený text stavového tónu „úspech“ (svetlý aj tmavý motív). */
const TEXT_PRIJMU = "text-[color:var(--stav-uspech-text)]";

function tentoMesiac() {
  return new Date().toISOString().slice(0, 7);
}

function PokladnaPage() {
  const { t } = useT();
  const mena = useMenaFirmy();
  const fetchBook = useServerFn(getCashBook);
  const doCreate = useServerFn(createCashEntry);
  const doDelete = useServerFn(deleteCashEntry);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [mesiac, setMesiac] = useState(tentoMesiac());
  const [otvoreny, setOtvoreny] = useState(false);
  const [form, setForm] = useState({
    type: "vydaj" as "prijem" | "vydaj",
    amount: "",
    description: "",
    entry_date: dnesBratislava(),
    category: "",
    /* Číselný rad dokladu; prázdne = predvolený. */
    number_series_id: "",
  });

  const cid = useMemo(() => getActiveCompanyId(), []);

  const nacitaj = useCallback(() => {
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchBook({ data: { company_id: cid, month: mesiac } })
      .then((d: any) => setData(d))
      .catch((e: any) => setChyba(e?.message ?? t("Pokladňu sa nepodarilo načítať")))
      .finally(() => setLoading(false));
  }, [cid, fetchBook, mesiac, t]);

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

  const stav = data?.stav;
  const pole = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <>
      <PageHeader
        title={t("Pokladňa")}
        description={t("Stav hotovosti z pokladničných dokladov a z dokladov zaplatených v hotovosti.")}
        action={
          <div className="flex flex-wrap gap-2">
            <OdkazNaRady />
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
              {suma(stav?.zostatok ?? 0)}
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
              {suma(stav?.prijmy ?? 0)}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm text-muted-foreground">
              {t("Výdavky spolu")}
            </div>
            <div className="suma mt-1 text-xl">
              {suma(stav?.vydavky ?? 0)}
            </div>
          </div>
        </div>

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
                {t("Suma ({mena})", { mena: mena.symbol })}
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
              suma: suma(data?.pociatocny_stav_obdobia ?? 0),
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
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("Suma")}</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">{t("Zostatok")}</th>
                    <th className="p-3"><span className="sr-only">{t("Akcie")}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(data?.riadky ?? []).map((r: any) => (
                    <tr key={`${r.zdroj}-${r.id}`} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap p-3 text-muted-foreground">{formatujDatum(r.datum)}</td>
                      <td className="whitespace-nowrap p-3">
                        {r.cislo ? <span className="cislo-dokladu">{r.cislo}</span> : "—"}
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
                          <Link to="/doklady" className="hover:underline">
                            {t("Doklad v hotovosti")}
                          </Link>
                        ) : (
                          t("Pokladničný doklad")
                        )}
                      </td>
                      <td
                        className={`suma p-3 text-right ${
                          r.typ === "prijem" ? TEXT_PRIJMU : ""
                        }`}
                      >
                        {sumaSoZnamienkom(r)}
                      </td>
                      <td className="suma p-3 text-right">
                        {suma(r.zostatok)}
                      </td>
                      <td className="p-3 text-right">
                        {r.zdroj === "pokladnicny" && (
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* Na mobile karty — tabuľka by Zdroj, Sumu a Zostatok orezala. */}
            <div className="space-y-2 md:hidden">
              {(data?.riadky ?? []).map((r: any) => (
                <div
                  key={`${r.zdroj}-${r.id}`}
                  className="rounded-xl border border-border bg-card p-3"
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
                    </span>
                    <span className="whitespace-nowrap">
                      {t("Zostatok:")}{" "}
                      <strong className="suma text-foreground">{suma(r.zostatok)}</strong>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    {r.zdroj === "doklad" ? (
                      <Link to="/doklady" className="hover:underline">
                        {t("Doklad v hotovosti")}
                      </Link>
                    ) : (
                      <span>{t("Pokladničný doklad")}</span>
                    )}
                    {r.zdroj === "pokladnicny" && (
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
              ))}
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
