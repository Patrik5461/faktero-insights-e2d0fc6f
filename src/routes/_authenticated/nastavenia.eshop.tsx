import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Package, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import {
  fakturujShoptetFn,
  nastavAutoImportFn,
  objednavkyShoptetFn,
  odpojNapojenieFn,
  pripojShoptetFn,
  pripojZasielkovnuFn,
  stavNapojeniFn,
} from "@/lib/faktero/eshop-napojenia.functions";

export const Route = createFileRoute("/_authenticated/nastavenia/eshop")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "E-shop a doprava — Faktero") }],
  }),
  component: Stranka,
});

const vstup = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
type Stav = Awaited<ReturnType<typeof stavNapojeniFn>>;

function Stranka() {
  const { t } = useT();
  const cid = useMemo(() => getActiveCompanyId(), []);
  const nacitaj = useServerFn(stavNapojeniFn);
  const [stav, setStav] = useState<Stav | null>(null);
  const obnov = () => {
    if (cid)
      nacitaj({ data: { company_id: cid } })
        .then(setStav)
        .catch((e) => toast.error(e?.message ?? t("Chyba")));
  };
  useEffect(obnov, [cid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cid) return null;
  return (
    <>
      <PageHeader
        title={t("E-shop a doprava")}
        description={t(
          "Objednávky zo Shoptetu ako faktúry a zásielky Zásielkovne priamo z faktúry. WooCommerce má vlastný doplnok.",
        )}
      />
      <PageBody>
        {stav === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("Načítavam…")}
          </div>
        ) : (
          <div className="space-y-6">
            <ShoptetPanel companyId={cid} stav={stav.shoptet} onZmena={obnov} />
            <ZasielkovnaPanel companyId={cid} stav={stav.zasielkovna} onZmena={obnov} />
            <p className="text-sm text-muted-foreground">
              {t("E-shop na WordPresse? Pozrite si")}{" "}
              <Link to="/pomoc/woocommerce" className="text-primary hover:underline">
                {t("doplnok pre WooCommerce")}
              </Link>
              .
            </p>
          </div>
        )}
      </PageBody>
    </>
  );
}

function ShoptetPanel({
  companyId,
  stav,
  onZmena,
}: {
  companyId: string;
  stav: Stav["shoptet"];
  onZmena: () => void;
}) {
  const { t, jazyk } = useT();
  const loc = jazyk === "de" ? "de-DE" : "sk-SK";
  const pripoj = useServerFn(pripojShoptetFn);
  const odpoj = useServerFn(odpojNapojenieFn);
  const objednavky = useServerFn(objednavkyShoptetFn);
  const fakturuj = useServerFn(fakturujShoptetFn);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [dni, setDni] = useState(30);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof objednavkyShoptetFn>> | null>(null);
  const [vybrane, setVybrane] = useState<Set<string>>(new Set());

  async function nacitajObj() {
    setBusy(true);
    try {
      const r = await objednavky({ data: { company_id: companyId, dni } });
      setRows(r);
      setVybrane(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? t("Objednávky sa nepodarilo načítať"));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (stav) void nacitajObj();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(stav)]);

  async function pripojit() {
    setBusy(true);
    try {
      const r = await pripoj({ data: { company_id: companyId, token } });
      toast.success(t("Pripojené: {nazov}", { nazov: r.nazov ?? t("e-shop") }));
      setToken("");
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Pripojenie zlyhalo"), { duration: 10000 });
    } finally {
      setBusy(false);
    }
  }

  async function vystavit() {
    const kody = [...vybrane];
    if (
      !(await potvrd(
        t(
          kody.length === 1
            ? "Vystaviť {n} faktúru z objednávky?\nČíslo dostane podľa číselného radu faktúr; zaplatená objednávka sa označí ako uhradená."
            : kody.length < 5
              ? "Vystaviť {n} faktúry z objednávok?\nČíslo dostanú podľa číselného radu faktúr; zaplatené objednávky sa označia ako uhradené."
              : "Vystaviť {n} faktúr z objednávok?\nČíslo dostanú podľa číselného radu faktúr; zaplatené objednávky sa označia ako uhradené.",
          { n: kody.length },
        ),
        { potvrdit: t("Vystaviť") },
      ))
    )
      return;
    setBusy(true);
    try {
      const v = await fakturuj({ data: { company_id: companyId, kody } });
      const ok = v.filter((x) => x.ok);
      const zle = v.filter((x) => !x.ok);
      if (ok.length) toast.success(t("Vystavené: {cisla}", { cisla: ok.map((x) => x.faktura).join(", ") }));
      if (zle.length)
        toast.error(zle.map((x) => `${x.kod}: ${x.chyba}`).join("\n"), { duration: 15000 });
      await nacitajObj();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <ShoppingBag className="mt-0.5 hidden h-5 w-5 shrink-0 text-primary sm:block" />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShoppingBag className="h-5 w-5 text-primary sm:hidden" />
            Shoptet
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Z objednávok e-shopu vystavíte faktúry jedným klikom — s položkami, dopravou a zľavami presne tak, ako ich zákazník zaplatil. Tá istá objednávka nedostane faktúru dvakrát.",
            )}
          </p>
          {!stav ? (
            <div className="mt-4 max-w-xl">
              <label className="block text-sm">
                <span className="text-xs text-muted-foreground">{t("Súkromný API token")}</span>
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value.trim())}
                  autoComplete="off"
                  className={vstup}
                />
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "V administrácii Shoptetu: Prepojenia → API partneri → Súkromný API token (vyžaduje tarif Premium). Tokenu stačí skupina Objednávky na čítanie. Uložený je zašifrovaný.",
                )}
              </p>
              <button
                onClick={() => void pripojit()}
                disabled={busy || token.length < 20}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("Pripojiť e-shop")}
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {t("pripojené")}
                </span>
                <strong>{stav.eshop_nazov ?? t("e-shop")}</strong>
                {stav.eshop_url ? (
                  <span className="text-muted-foreground">{stav.eshop_url}</span>
                ) : null}
                <button
                  onClick={async () => {
                    if (!(await potvrd(t("Odpojiť Shoptet?\nVystavené faktúry ostanú.")))) return;
                    await odpoj({ data: { company_id: companyId, co: "shoptet" } });
                    onZmena();
                  }}
                  className="ml-auto rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                >
                  {t("Odpojiť")}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  <span className="text-xs text-muted-foreground">{t("Objednávky za posledných")}</span>
                  <select
                    value={dni}
                    onChange={(e) => setDni(Number(e.target.value))}
                    className={vstup}
                  >
                    {[7, 30, 90, 180].map((d) => (
                      <option key={d} value={d}>
                        {t("{n} dní", { n: d })}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => void nacitajObj()}
                  disabled={busy}
                  className="h-9 rounded-md border border-border px-3 text-sm hover:bg-secondary"
                >
                  {t("Načítať")}
                </button>
                <button
                  onClick={() => void vystavit()}
                  disabled={busy || !vybrane.size}
                  className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {t("Vystaviť faktúry ({n})", { n: vybrane.size })}
                </button>
                {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {rows && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="p-2 w-8">
                          <input
                            type="checkbox"
                            aria-label={t("Vybrať všetky bez faktúry")}
                            checked={
                              rows.some((r) => !r.faktura) &&
                              rows.filter((r) => !r.faktura).every((r) => vybrane.has(r.kod))
                            }
                            onChange={(e) =>
                              setVybrane(
                                new Set(
                                  e.target.checked
                                    ? rows.filter((r) => !r.faktura).map((r) => r.kod)
                                    : [],
                                ),
                              )
                            }
                          />
                        </th>
                        <th className="p-2">{t("Objednávka")}</th>
                        <th className="p-2">{t("Zákazník")}</th>
                        <th className="p-2">{t("Stav")}</th>
                        <th className="p-2">{t("Platba")}</th>
                        <th className="p-2 text-right">{t("Suma")}</th>
                        <th className="p-2">{t("Faktúra")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground">
                            {t("Žiadne objednávky v tomto období.")}
                          </td>
                        </tr>
                      ) : (
                        rows.map((r) => (
                          <tr key={r.kod} className="border-b border-border last:border-0">
                            <td className="p-2">
                              <input
                                type="checkbox"
                                aria-label={t("Vybrať {kod}", { kod: r.kod })}
                                disabled={Boolean(r.faktura)}
                                checked={vybrane.has(r.kod)}
                                onChange={(e) =>
                                  setVybrane((s) => {
                                    const n = new Set(s);
                                    if (e.target.checked) n.add(r.kod);
                                    else n.delete(r.kod);
                                    return n;
                                  })
                                }
                              />
                            </td>
                            <td className="p-2 font-medium">
                              {r.kod}
                              <div className="text-xs font-normal text-muted-foreground">
                                {r.vytvorena
                                  ? new Date(r.vytvorena).toLocaleDateString(loc)
                                  : ""}
                              </div>
                            </td>
                            <td className="p-2">{r.zakaznik ?? "—"}</td>
                            <td className="p-2 text-xs">{r.stav ?? "—"}</td>
                            <td className="p-2 text-xs">
                              {r.platba ?? "—"}
                              {r.zaplatena ? (
                                <span className="ml-1 text-emerald-700">· {t("zaplatená")}</span>
                              ) : null}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {r.suma.toFixed(2)} {r.mena}
                            </td>
                            <td className="p-2 text-xs">
                              {r.faktura ? (
                                <Link
                                  to="/faktury/$id"
                                  params={{ id: r.faktura.id }}
                                  className="text-primary hover:underline"
                                >
                                  {r.faktura.invoice_number}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <AutoImport companyId={companyId} stav={stav} onZmena={onZmena} />
              {stav.posledna_chyba ? (
                <p className="mt-2 text-xs text-amber-700">{t("Posledná chyba: {chyba}", { chyba: stav.posledna_chyba })}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ZasielkovnaPanel({
  companyId,
  stav,
  onZmena,
}: {
  companyId: string;
  stav: Stav["zasielkovna"];
  onZmena: () => void;
}) {
  const { t } = useT();
  const pripoj = useServerFn(pripojZasielkovnuFn);
  const odpoj = useServerFn(odpojNapojenieFn);
  const [heslo, setHeslo] = useState("");
  const [odosielatel, setOdosielatel] = useState("");
  const [busy, setBusy] = useState(false);
  async function pripojit() {
    setBusy(true);
    try {
      await pripoj({ data: { company_id: companyId, heslo, odosielatel } });
      toast.success(t("Zásielkovňa pripojená — zásielku vytvoríte na detaile faktúry."));
      setHeslo("");
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Pripojenie zlyhalo"), { duration: 10000 });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Package className="mt-0.5 hidden h-5 w-5 shrink-0 text-primary sm:block" />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Package className="h-5 w-5 text-primary sm:hidden" />
            Zásielkovňa
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Na detaile faktúry vytvoríte zásielku na výdajné miesto alebo na adresu, aj s dobierkou vo výške faktúry, a vytlačíte štítok. Vybrané dobierky potom nahráte ako výpis z brány (Účtovníctvo → Výpis z platobnej brány).",
            )}
          </p>
          {!stav ? (
            <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-xs text-muted-foreground">
                  {t("API heslo (klientská sekcia Zásielkovne → Nastavenia API)")}
                </span>
                <input
                  value={heslo}
                  onChange={(e) => setHeslo(e.target.value.trim())}
                  autoComplete="off"
                  className={vstup}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-xs text-muted-foreground">
                  {t("Označenie odosielateľa (e-shop v klientskej sekcii)")}
                </span>
                <input
                  value={odosielatel}
                  onChange={(e) => setOdosielatel(e.target.value)}
                  placeholder={t("napr. mojobchod.sk")}
                  className={vstup}
                />
              </label>
              <div>
                <button
                  onClick={() => void pripojit()}
                  disabled={busy || heslo.length !== 32}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("Pripojiť")}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {t("pripojené")}
              </span>
              <span>{t("odosielateľ: {meno}", { meno: stav.odosielatel ?? t("názov firmy") })}</span>
              <button
                onClick={async () => {
                  if (
                    !(await potvrd(
                      t("Odpojiť Zásielkovňu?\nVytvorené zásielky ostanú v Zásielkovni."),
                    ))
                  )
                    return;
                  await odpoj({ data: { company_id: companyId, co: "zasielkovna" } });
                  onZmena();
                }}
                className="ml-auto rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
              >
                {t("Odpojiť")}
              </button>
              {stav.posledna_chyba ? (
                <p className="w-full text-xs text-amber-700">
                  {t("Posledná chyba: {chyba}", { chyba: stav.posledna_chyba })}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Automatický import každú hodinu — z objednávok vo zvolených stavoch, vytvorených od zapnutia. */
function AutoImport({
  companyId,
  stav,
  onZmena,
}: {
  companyId: string;
  stav: NonNullable<Stav["shoptet"]>;
  onZmena: () => void;
}) {
  const { t, jazyk } = useT();
  const loc = jazyk === "de" ? "de-DE" : "sk-SK";
  const nastav = useServerFn(nastavAutoImportFn);
  const stavy = (Array.isArray(stav.stavy) ? stav.stavy : []) as { id: number; name: string }[];
  const [zapnut, setZapnut] = useState(Boolean(stav.auto_import));
  const [vybrane, setVybrane] = useState<number[]>(stav.auto_stavy ?? []);
  const [busy, setBusy] = useState(false);
  async function ulozit() {
    setBusy(true);
    try {
      await nastav({ data: { company_id: companyId, zapnut, stavy: vybrane } });
      toast.success(
        t(
          zapnut
            ? "Automatický import je zapnutý — prvý beh do hodiny."
            : "Automatický import je vypnutý.",
        ),
      );
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-5 rounded-lg border border-border p-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={zapnut} onChange={(e) => setZapnut(e.target.checked)} />
        {t("Vystavovať faktúry automaticky každú hodinu")}
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(
          "Z objednávok vytvorených po zapnutí, keď sú v niektorom zo stavov nižšie. Staršie objednávky vystavíte ručne vyššie.",
        )}{" "}
        {stav.auto_import && stav.auto_od
          ? t("Zapnuté od {datum}.", { datum: new Date(stav.auto_od).toLocaleString(loc) })
          : ""}
        {stav.posledny_import_at
          ? " " + t("Posledný beh {datum}.", { datum: new Date(stav.posledny_import_at).toLocaleString(loc) })
          : ""}
      </p>
      {zapnut && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {stavy.length === 0 ? (
            <span className="text-xs text-amber-700">
              {t("Stavy objednávok sa nenačítali — pripojte e-shop znova.")}
            </span>
          ) : (
            stavy.map((x) => (
              <label key={x.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={vybrane.includes(x.id)}
                  onChange={(e) =>
                    setVybrane((v) =>
                      e.target.checked ? [...v, x.id] : v.filter((y) => y !== x.id),
                    )
                  }
                />
                {x.name}
              </label>
            ))
          )}
        </div>
      )}
      <button
        onClick={() => void ulozit()}
        disabled={busy}
        className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
      >
        {t("Uložiť")}
      </button>
    </div>
  );
}
