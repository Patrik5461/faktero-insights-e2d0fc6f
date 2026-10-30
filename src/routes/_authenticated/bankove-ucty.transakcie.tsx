import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listBankData,
  sumyTransakcii,
  syncBankTransactions,
} from "@/lib/faktero/tatrabanka.functions";
import type { SucetMeny } from "@/lib/faktero/bank-sumy";
import { toast } from "sonner";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { RefreshCw, Link2, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { zrusParovanie } from "@/lib/faktero/parovanie.functions";
import { usePagedLogs } from "@/hooks/usePagedLogs";
import { EmptyState, ListFooter, LogsToolbar } from "@/components/faktero/ListControls";
import { Landmark } from "lucide-react";
import { formatovacMeny } from "@/lib/faktero/mena";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { DetailPohybu } from "@/components/faktero/DetailPohybu";
import { nazovVybavenia, stavPohybu } from "@/lib/faktero/pohyb-vybavenie";

export const Route = createFileRoute("/_authenticated/bankove-ucty/transakcie")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Bankové transakcie — Faktero") }],
  }),
  validateSearch: (s: Record<string, unknown>): { account?: string } => ({
    account: typeof s.account === "string" ? s.account : undefined,
  }),
  component: TxPage,
});

const NAZVY_BANK: Record<string, string> = {
  tatrabanka: "Tatra banky",
  fio: "Fio banky",
  wise: "Wise",
  revolut: "Revolutu",
  wallester: "Wallesteru",
  email: "e-mailových notifikácií",
  import: "nahratých výpisov",
};

/** Podnadpis podľa toho, čo je naozaj pripojené — nie natvrdo Tatra banka. */
function popisZdroja(
  providers: string[] | null,
  t: (s: string, p?: Record<string, string | number>) => string = (s, p) =>
    p ? s.split("{banky}").join(String(p.banky)) : s,
): string {
  if (providers === null) return t("Pohyby z pripojených bankových účtov.");
  if (providers.length === 0) return t("Zatiaľ nie je pripojená žiadna banka.");
  const mena = [...new Set(providers)].map((p) => (NAZVY_BANK[p] ? t(NAZVY_BANK[p]) : p));
  return t("Pohyby z {banky}.", { banky: mena.join(", ") });
}

function fmtMoney(n: number, c = "EUR") {
  return formatovacMeny(c, "sk-SK")(n);
}

/** Popis obdobia nad súčtom — bez neho nie je jasné, za čo to číslo je. */
function obdobiePopis(
  od: string,
  do_: string,
  t: (s: string, p?: Record<string, string | number>) => string,
): string {
  const d = (s: string) => s.split("-").reverse().join(". ");
  if (od && do_) return `${d(od)} – ${d(do_)}`;
  if (od) return t("od {datum}", { datum: d(od) });
  if (do_) return t("do {datum}", { datum: d(do_) });
  return t("Celé obdobie");
}

function TxPage() {
  const { t } = useT();
  const search = Route.useSearch();
  const fetchData = useServerFn(listBankData);
  const sync = useServerFn(syncBankTransactions);
  const nacitajSumy = useServerFn(sumyTransakcii);
  const zrus = useServerFn(zrusParovanie);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [providers, setProviders] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string | undefined>(search.account);
  const [busy, setBusy] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [smer, setSmer] = useState<"" | "prijate" | "odoslane">("");
  /** Filter na pohyby vybavené bez dokladu (transakčná daň, „Pohyb nemá doklad“). */
  const [vybavenie, setVybavenie] = useState<"" | "bez_dokladu" | "transakcna_dan">("");
  /** Otvorený detail pohybu. */
  const [detail, setDetail] = useState<string | null>(null);

  /*
   * Smer platby sa nedá vybrať rovnosťou — banka ho ukladá znamienkom sumy.
   * Bez tohto filtra v databáze by sa filtrovalo len v rámci zobrazenej strany
   * a súčty by nesedeli s tým, čo je v tabuľke.
   */
  const compare = useMemo(
    () =>
      smer === "prijate"
        ? ([{ column: "amount", op: "gt", value: 0 }] as const)
        : smer === "odoslane"
          ? ([{ column: "amount", op: "lt", value: 0 }] as const)
          : undefined,
    [smer],
  );

  const {
    rows: txs,
    total,
    loading,
    page,
    setPage,
    pageSize,
    setPageSize,
    search: q,
    setSearch: setQ,
    reload,
  } = usePagedLogs({
    resource: "bank_transactions",
    // `iban` tu nikdy nebol — hľadanie kvôli nemu končilo chybou 400 a
    // nenašlo nič. Referencia pohybu je to, čo sa naozaj dá hľadať.
    searchColumns: ["counterparty", "variable_symbol", "description", "transaction_reference"],
    filters: { bank_account_id: selected ?? null, vybavenie: vybavenie || null },
    compare: compare as any,
    dateColumn: "booking_date",
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    orderBy: { column: "booking_date", ascending: false },
    pageSizeKey: "bank_transactions",
  });

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    // Žiadny účet sa nepredvolí. Firma ich má v jednom pripojení aj osem
    // (TB sprístupňuje aj účty v iných bankách) a predvolený prvý účet
    // vyzeral, akoby polovica platieb chýbala.
    fetchData({ data: { company_id: cid } }).then((d) => {
      setAccounts(d.accounts);
      setProviders(d.connections.map((c: { provider: string }) => c.provider));
    });
  }, []);

  /*
   * Súčty za obdobie. Rátajú sa na serveri z celého výberu, nie zo zobrazenej
   * strany — a bez ohľadu na zvolený smer, aby bolo vidieť obe strany naraz.
   */
  const [sumy, setSumy] = useState<SucetMeny[]>([]);
  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    let zrusene = false;
    nacitajSumy({
      data: {
        company_id: cid,
        account_id: selected ?? null,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        hladat: q || null,
      },
    })
      .then((r) => {
        if (!zrusene) setSumy(r.sumy);
      })
      .catch(() => {
        if (!zrusene) setSumy([]);
      });
    return () => {
      zrusene = true;
    };
  }, [selected, dateFrom, dateTo, q, total]);

  /* K spárovaným pohybom dotiahneme číslo faktúry — samotné id nikomu nič nepovie. */
  const [faktury, setFaktury] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = txs.map((t: any) => t.matched_invoice_id).filter(Boolean);
    if (ids.length === 0) return setFaktury({});
    supabase
      .from("invoices")
      .select("id, invoice_number")
      .in("id", ids)
      .then(({ data }) =>
        setFaktury(Object.fromEntries((data ?? []).map((f: any) => [f.id, f.invoice_number]))),
      );
  }, [txs]);

  async function odparuj(id: string) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    // Malá ikona hneď vedľa čísla faktúry — jedným preklepom by sa zaplatená
    // faktúra vrátila medzi otvorené (a mohla by dostať upomienku).
    if (!(await potvrd(t("Zrušiť párovanie? Faktúra sa vráti medzi otvorené.")))) return;
    try {
      await zrus({ data: { companyId: cid, transactionId: id } });
      toast.success(t("Párovanie zrušené, faktúra je znovu otvorená."));
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa zrušiť párovanie."));
    }
  }

  async function onSync() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    // Pri voľbe „Všetky účty" nie je vybratý žiadny účet — vtedy sa
    // synchronizujú všetky, inak by tlačidlo nespravilo vôbec nič.
    const ids = selected ? [selected] : accounts.map((a) => a.id);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      let inserted = 0;
      let total = 0;
      const chyby: string[] = [];
      for (const id of ids) {
        try {
          const r = await sync({ data: { company_id: cid, account_id: id } });
          inserted += r.inserted;
          total += r.total;
        } catch (e: any) {
          chyby.push(accounts.find((a) => a.id === id)?.iban ?? id);
        }
      }
      if (chyby.length) toast.error(t("Nepodarilo sa načítať: {ucty}", { ucty: chyby.join(", ") }));
      else toast.success(t("Synchronizovaných {n} nových z {m}", { n: inserted, m: total }));
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t("Bankové transakcie")} description={popisZdroja(providers, t)} />
      <PageBody>
        <LogsToolbar
          search={q}
          onSearchChange={setQ}
          searchPlaceholder={t("Hľadať protistranu, VS alebo popis…")}
          selects={[
            {
              label: t("Účet"),
              value: selected ?? "",
              onChange: (v) => setSelected(v || undefined),
              options: [
                { value: "", label: t("Všetky účty") },
                ...accounts.map((a) => ({ value: a.id, label: a.account_name ?? a.iban ?? a.id })),
              ],
            },
            {
              label: t("Smer"),
              value: smer,
              onChange: (v) => setSmer(v as "" | "prijate" | "odoslane"),
              options: [
                { value: "", label: t("Prijaté aj odoslané") },
                { value: "prijate", label: t("Iba prijaté") },
                { value: "odoslane", label: t("Iba odoslané") },
              ],
            },
            {
              label: t("Bez dokladu"),
              value: vybavenie,
              onChange: (v) => setVybavenie(v as "" | "bez_dokladu" | "transakcna_dan"),
              options: [
                { value: "", label: t("Všetky pohyby") },
                { value: "bez_dokladu", label: t("Spárované bez dokladu") },
                { value: "transakcna_dan", label: t("Transakčná daň") },
              ],
            },
          ]}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onReset={() => {
            setQ("");
            setDateFrom("");
            setDateTo("");
            setSmer("");
            setVybavenie("");
          }}
          right={
            <div className="flex flex-wrap gap-2">
              <Link
                to="/faktury/parovanie"
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-3 text-sm hover:bg-secondary"
              >
                <Link2 className="h-4 w-4" /> {t("Spárovať s faktúrami")}
              </Link>
              <button
                onClick={onSync}
                disabled={accounts.length === 0 || busy}
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> {t("Synchronizovať")}
              </button>
            </div>
          }
        />

        {sumy.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sumy.map((s) => (
              <div key={s.currency} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {obdobiePopis(dateFrom, dateTo, t)}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{s.currency}</span>
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {t("smer::Prijaté")} <span className="text-xs">({s.pocetPrijatych})</span>
                    </dt>
                    <dd className="tabular-nums font-medium text-emerald-700 dark:text-emerald-300">
                      {fmtMoney(s.prijate, s.currency)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {t("smer::Odoslané")} <span className="text-xs">({s.pocetOdoslanych})</span>
                    </dt>
                    <dd className="tabular-nums font-medium text-destructive">
                      {fmtMoney(s.odoslane, s.currency)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5">
                    <dt className="font-medium">{t("Rozdiel")}</dt>
                    <dd
                      className={`tabular-nums font-semibold ${s.rozdiel < 0 ? "text-destructive" : ""}`}
                    >
                      {fmtMoney(s.rozdiel, s.currency)}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t("Dátum")}</th>
                {!selected && <th className="px-3 py-2">{t("Účet")}</th>}
                <th className="px-3 py-2">{t("Protistrana")}</th>
                <th className="px-3 py-2">{t("VS")}</th>
                <th className="px-3 py-2">{t("Popis")}</th>
                <th className="px-3 py-2">{t("Párovanie")}</th>
                <th className="px-3 py-2 text-right">{t("Suma")}</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => (
                <tr key={tx.id} className="border-t border-border">
                  <td className="px-3 py-2 tabular-nums">{datumNaDoklade(tx.booking_date)}</td>
                  {!selected && (
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {(() => {
                        const a = accounts.find((x) => x.id === tx.bank_account_id);
                        const iban = a?.iban as string | undefined;
                        return iban ? `…${iban.slice(-6)}` : "—";
                      })()}
                    </td>
                  )}
                  <td className="px-3 py-2">{tx.counterparty ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{tx.variable_symbol ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {/* Pohyb z e-mailovej notifikácie banky — nie z banky samotnej. */}
                    {tx.zdroj === "email" && (
                      <span
                        className="mr-1.5 inline-flex rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                        title={t("Pohyb vznikol z e-mailovej notifikácie banky.")}
                      >
                        {t("z e-mailu")}
                      </span>
                    )}
                    {tx.description ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {tx.matched_invoice_id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Link
                          to="/faktury/$id"
                          params={{ id: tx.matched_invoice_id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {faktury[tx.matched_invoice_id] ?? t("faktúra")}
                        </Link>
                        <button
                          onClick={() => odparuj(tx.id)}
                          title={t("Zrušiť párovanie a vrátiť faktúru medzi otvorené")}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : (
                      (() => {
                        const stav = stavPohybu(tx);
                        const popis =
                          stav === "sparovany"
                            ? t("spárované")
                            : stav === "nesparovany"
                              ? t("nespárované")
                              : t(nazovVybavenia(stav) ?? "");
                        const farba =
                          stav === "nesparovany"
                            ? "text-muted-foreground"
                            : stav === "sparovany"
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "rounded-full bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300";
                        return (
                          <button
                            onClick={() => setDetail(tx.id)}
                            title={tx.vybavenie_poznamka ?? t("Detail pohybu")}
                            className={`text-xs hover:underline ${farba}`}
                          >
                            {popis}
                          </button>
                        );
                      })()
                    )}
                    {tx.matched_invoice_id && (
                      <button
                        onClick={() => setDetail(tx.id)}
                        className="ml-2 text-xs text-muted-foreground hover:underline"
                      >
                        {t("detail")}
                      </button>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${Number(tx.amount) < 0 ? "text-destructive" : "text-emerald-700"}`}
                  >
                    {fmtMoney(Number(tx.amount), tx.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && txs.length === 0 && (
            <EmptyState
              icon={Landmark}
              title={t("Žiadne transakcie")}
              description={t("Pre vybraté obdobie a filtre nemáme žiadne výsledky.")}
            />
          )}
          <ListFooter
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
        {detail && getActiveCompanyId() && (
          <DetailPohybu
            companyId={getActiveCompanyId()!}
            pohybId={detail}
            onClose={() => setDetail(null)}
            onZmena={reload}
          />
        )}
      </PageBody>
    </>
  );
}
