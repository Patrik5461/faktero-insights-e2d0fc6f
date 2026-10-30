import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";
import { STAV_TRANSEU, daSaFakturovat } from "@/lib/faktero/transeu";
import {
  nastavAutoSyncTranseuFn,
  objednavkyTranseuFn,
  odosliFakturuTranseuFn,
  odpojTranseuFn,
  stavTranseuFn,
  stiahniTranseuFn,
  ulozAplikaciuTranseuFn,
  vystavFakturuTranseuFn,
  zacniPrihlasenieTranseuFn,
  zalozObjednavkuTranseuFn,
} from "@/lib/faktero/transeu.functions";

export const Route = createFileRoute("/_authenticated/nastavenia/transeu")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Trans.eu — Faktero") }],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    pripojene: s.pripojene ? String(s.pripojene) : undefined,
    chyba: typeof s.chyba === "string" ? s.chyba : undefined,
  }),
  component: Stranka,
});

const vstup = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
type Stav = Awaited<ReturnType<typeof stavTranseuFn>>;
type Riadok = Awaited<ReturnType<typeof objednavkyTranseuFn>>[number];

function Stranka() {
  const { t } = useT();
  const search = Route.useSearch();
  const cid = useMemo(() => getActiveCompanyId(), []);
  const nacitaj = useServerFn(stavTranseuFn);
  const [stav, setStav] = useState<Stav | null>(null);
  const obnov = () => {
    if (cid)
      nacitaj({ data: { company_id: cid } })
        .then(setStav)
        .catch((e) => toast.error(e?.message ?? t("Chyba")));
  };
  useEffect(obnov, [cid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (search.pripojene) toast.success(t("Trans.eu je pripojený."));
    if (search.chyba)
      toast.error(t("Prihlásenie do Trans.eu sa nepodarilo ({kod}).", { kod: search.chyba }), {
        duration: 10000,
      });
  }, [search.pripojene, search.chyba]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cid) return null;
  return (
    <>
      <PageHeader
        title="Trans.eu"
        description={t(
          "Prijaté prepravné objednávky z burzy Trans.eu ako prijaté objednávky a faktúry. Vystavenú faktúru pošlete späť k objednávke.",
        )}
      />
      <PageBody>
        {stav === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
          </div>
        ) : (
          <div className="space-y-6">
            <Pripojenie companyId={cid} stav={stav} onZmena={obnov} />
            {stav.napojenie?.prihlaseny ? <Objednavky companyId={cid} /> : null}
            <p className="text-sm text-muted-foreground">
              {t("Ako to funguje, nájdete v")}{" "}
              <Link to="/pomoc/prepojenia" hash="transeu" className="text-primary hover:underline">
                {t("manuáli k Trans.eu")}
              </Link>
              .
            </p>
          </div>
        )}
      </PageBody>
    </>
  );
}

function Pripojenie({
  companyId,
  stav,
  onZmena,
}: {
  companyId: string;
  stav: Stav;
  onZmena: () => void;
}) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const ulozAplikaciu = useServerFn(ulozAplikaciuTranseuFn);
  const zacni = useServerFn(zacniPrihlasenieTranseuFn);
  const odpoj = useServerFn(odpojTranseuFn);
  const auto = useServerFn(nastavAutoSyncTranseuFn);
  const [busy, setBusy] = useState(false);
  const [vlastna, setVlastna] = useState(!stav.aplikaciaFaktera);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [apiKluc, setApiKluc] = useState("");
  const n = stav.napojenie;

  async function prihlasit() {
    setBusy(true);
    try {
      if (vlastna && clientId && secret && apiKluc)
        await ulozAplikaciu({
          data: {
            company_id: companyId,
            client_id: clientId,
            client_secret: secret,
            api_kluc: apiKluc,
          },
        });
      const { url } = await zacni({ data: { company_id: companyId } });
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message ?? t("Pripojenie zlyhalo"), { duration: 10000 });
      setBusy(false);
    }
  }

  const maVlastnuUlozenu = Boolean(n?.vlastnaAplikacia);
  const daSaPrihlasit =
    maVlastnuUlozenu || (vlastna ? Boolean(clientId && secret && apiKluc) : stav.aplikaciaFaktera);

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Truck className="mt-0.5 hidden h-5 w-5 shrink-0 text-primary sm:block" />
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            <Truck className="h-5 w-5 text-primary sm:hidden" />
            {t("Účet Trans.eu")}
            {n?.prihlaseny ? (
              <span
                className={
                  n.stav === "chyba"
                    ? "rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300"
                    : "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                }
              >
                {n.stav === "chyba" ? t("treba sa prihlásiť znova") : t("pripojené")}
              </span>
            ) : null}
          </h2>
          {n?.prihlaseny ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="min-w-0 break-words">
                  {n.firma_nazov ?? t("firma v Trans.eu")}
                </strong>
                {n.firma_vat_id ? (
                  <span className="text-muted-foreground">{n.firma_vat_id}</span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {n.vlastnaAplikacia
                    ? t("vlastná aplikácia {id}", { id: n.client_id ?? "" })
                    : t("aplikácia Faktera")}
                </span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <button
                    onClick={() => void prihlasit()}
                    disabled={busy}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                  >
                    {t("Prihlásiť znova")}
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        !(await potvrd(
                          t(
                            "Odpojiť Trans.eu?\nStiahnuté objednávky, prijaté objednávky aj faktúry ostanú.",
                          ),
                        ))
                      )
                        return;
                      await odpoj({ data: { company_id: companyId } });
                      onZmena();
                    }}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                  >
                    {t("Odpojiť")}
                  </button>
                </div>
              </div>
              {n.posledna_chyba ? (
                <p className="text-xs text-red-700 dark:text-red-300">{n.posledna_chyba}</p>
              ) : null}
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={n.auto_sync}
                  onChange={async (e) => {
                    try {
                      await auto({ data: { company_id: companyId, zapnut: e.target.checked } });
                      onZmena();
                    } catch (err: any) {
                      toast.error(err?.message ?? t("Chyba"));
                    }
                  }}
                />
                <span>
                  {t("Sťahovať nové objednávky automaticky každú hodinu")}
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      "Prijatú objednávku ani faktúru automaticky nezaloží — o tých rozhodujete vy.",
                    )}
                    {n.posledna_sync_at
                      ? " " +
                        t("Naposledy: {kedy}.", {
                          kedy: new Date(n.posledna_sync_at).toLocaleString(loc),
                        })
                      : ""}
                  </span>
                </span>
              </label>
            </div>
          ) : (
            <div className="mt-3 max-w-xl space-y-3 text-sm">
              <p className="text-muted-foreground">
                {t(
                  "Po kliknutí vás presmerujeme do Trans.eu, kde prístup povolíte. Heslo do Trans.eu Faktero nevidí; uloží si len zašifrovaný prístupový token.",
                )}
              </p>
              {stav.aplikaciaFaktera ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={vlastna}
                    onChange={(e) => setVlastna(e.target.checked)}
                  />
                  {t("Mám vlastné prístupové údaje k API Trans.eu")}
                </label>
              ) : (
                <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
                  {t(
                    "Na pripojenie potrebujete prístup k API Trans.eu: Client ID, Client Secret a Api-key. Vyžiadate si ich v Trans.eu formulárom „API Keys Request“.",
                  )}
                </p>
              )}
              {vlastna && !maVlastnuUlozenu ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="block min-w-0">
                    <span className="text-xs text-muted-foreground">Client ID</span>
                    <input
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value.trim())}
                      autoComplete="off"
                      className={vstup}
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="text-xs text-muted-foreground">Client Secret</span>
                    <input
                      type="password"
                      value={secret}
                      onChange={(e) => setSecret(e.target.value.trim())}
                      autoComplete="off"
                      className={vstup}
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="text-xs text-muted-foreground">Api-key</span>
                    <input
                      type="password"
                      value={apiKluc}
                      onChange={(e) => setApiKluc(e.target.value.trim())}
                      autoComplete="off"
                      className={vstup}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground sm:col-span-3">
                    {t("V nastavení aplikácie v Trans.eu zadajte ako Redirect URI:")}{" "}
                    <code className="break-all">{stav.navratovaAdresa}</code>
                  </p>
                </div>
              ) : null}
              <button
                onClick={() => void prihlasit()}
                disabled={busy || !daSaPrihlasit}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("Pripojiť Trans.eu")}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Objednavky({ companyId }: { companyId: string }) {
  const { t, jazyk } = useT();
  const loc = lokalJazyka(jazyk);
  const zoznam = useServerFn(objednavkyTranseuFn);
  const stiahni = useServerFn(stiahniTranseuFn);
  const zaloz = useServerFn(zalozObjednavkuTranseuFn);
  const vystav = useServerFn(vystavFakturuTranseuFn);
  const odosli = useServerFn(odosliFakturuTranseuFn);
  const [rows, setRows] = useState<Riadok[] | null>(null);
  const [dni, setDni] = useState(60);
  const [busy, setBusy] = useState<string | null>(null);

  async function nacitaj() {
    try {
      setRows(await zoznam({ data: { company_id: companyId } }));
    } catch (e: any) {
      toast.error(e?.message ?? t("Objednávky sa nepodarilo načítať"));
    }
  }
  useEffect(() => {
    void nacitaj();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function akcia(kluc: string, fn: () => Promise<unknown>, ok: (v: any) => string) {
    setBusy(kluc);
    try {
      const v = await fn();
      toast.success(ok(v));
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba"), { duration: 12000 });
    } finally {
      setBusy(null);
      await nacitaj();
    }
  }

  const datum = (s: string | null) => (s ? new Date(s).toLocaleDateString(loc) : "—");

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{t("Prijaté prepravné objednávky")}</h2>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="text-xs text-muted-foreground">{t("Objednávky za posledných")}</span>
          <select value={dni} onChange={(e) => setDni(Number(e.target.value))} className={vstup}>
            {[14, 60, 180, 365].map((d) => (
              <option key={d} value={d}>
                {t("{n} dní", { n: d })}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() =>
            void akcia(
              "stiahni",
              () => stiahni({ data: { company_id: companyId, dni } }),
              (v) => t("Stiahnuté objednávky: {n}", { n: v.stiahnute }),
            )
          }
          disabled={busy !== null}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"
        >
          {busy === "stiahni" && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("Stiahnuť z Trans.eu")}
        </button>
      </div>
      {rows === null ? null : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {t("Zatiaľ žiadne objednávky. Stiahnite ich tlačidlom vyššie.")}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {rows.map((r) => {
            const fakturovat = daSaFakturovat(r.stav);
            return (
              <li key={r.id} className="flex flex-wrap items-start gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{r.cislo ?? r.transeu_id.slice(0, 8)}</strong>
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-xs">
                      {t(STAV_TRANSEU[r.stav ?? ""] ?? r.stav ?? "—")}
                    </span>
                    <span className="min-w-0 break-words">{r.zakaznik_nazov ?? "—"}</span>
                    {r.zakaznik_vat_id ? (
                      <span className="text-xs text-muted-foreground">{r.zakaznik_vat_id}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 break-words text-xs text-muted-foreground">
                    {r.nakladka ?? "?"} ({datum(r.nakladka_od)}) → {r.vykladka ?? "?"} (
                    {datum(r.vykladka_do)}){r.vzdialenost_km ? ` · ${r.vzdialenost_km} km` : ""}
                  </div>
                  {r.chyba ? (
                    <div className="mt-1 text-xs text-red-700 dark:text-red-300">{r.chyba}</div>
                  ) : null}
                </div>
                <div className="text-right tabular-nums">
                  {Number(r.cena ?? 0).toFixed(2)} {r.mena}
                  {r.typ_ceny === "km" ? (
                    <div className="text-xs text-muted-foreground">{t("cena za km")}</div>
                  ) : null}
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                  {r.objednavka ? (
                    <Link
                      to="/objednavky/$id"
                      params={{ id: r.objednavka.id }}
                      className="text-xs text-primary hover:underline"
                    >
                      {t("Objednávka {cislo}", { cislo: r.objednavka.cislo })}
                    </Link>
                  ) : fakturovat ? (
                    <button
                      onClick={() =>
                        void akcia(
                          `obj-${r.id}`,
                          () => zaloz({ data: { company_id: companyId, id: r.id } }),
                          () => t("Prijatá objednávka je založená."),
                        )
                      }
                      disabled={busy !== null}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                    >
                      {t("Založiť objednávku")}
                    </button>
                  ) : null}
                  {r.faktura ? (
                    <>
                      <Link
                        to="/faktury/$id"
                        params={{ id: r.faktura.id }}
                        className="text-xs text-primary hover:underline"
                      >
                        {t("Faktúra {cislo}", { cislo: r.faktura.cislo })}
                      </Link>
                      {r.faktura_odoslana_at ? (
                        <span className="text-xs text-emerald-700 dark:text-emerald-300">
                          {t("v Trans.eu od {kedy}", { kedy: datum(r.faktura_odoslana_at) })}
                        </span>
                      ) : (
                        <button
                          onClick={async () => {
                            if (
                              r.ma_fakturu_v_transeu &&
                              !(await potvrd(
                                t("Objednávka už v Trans.eu faktúru má. Poslať ďalšiu?"),
                              ))
                            )
                              return;
                            void akcia(
                              `odosli-${r.id}`,
                              () => odosli({ data: { company_id: companyId, id: r.id } }),
                              () => t("Faktúra je priložená k objednávke v Trans.eu."),
                            );
                          }}
                          disabled={busy !== null}
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
                        >
                          {t("Poslať faktúru do Trans.eu")}
                        </button>
                      )}
                    </>
                  ) : fakturovat ? (
                    <>
                      <button
                        onClick={async () => {
                          if (
                            !(await potvrd(
                              t(
                                "Vystaviť faktúru za prepravu {cislo}?\nČíslo dostane podľa číselného radu faktúr, režim DPH podľa zákazníka.",
                                { cislo: r.cislo ?? "" },
                              ),
                              { potvrdit: t("Vystaviť") },
                            ))
                          )
                            return;
                          void akcia(
                            `fakt-${r.id}`,
                            () => vystav({ data: { company_id: companyId, id: r.id } }),
                            (v) => t("Vystavená faktúra {cislo}", { cislo: v.invoice_number }),
                          );
                        }}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {busy === `fakt-${r.id}` && <Loader2 className="h-3 w-3 animate-spin" />}
                        {t("Vystaviť faktúru")}
                      </button>
                      {r.objednavka ? (
                        <Link
                          to="/faktury/nova"
                          search={{ sales_order: r.objednavka.id } as any}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          {t("upraviť pred vystavením")}
                        </Link>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
