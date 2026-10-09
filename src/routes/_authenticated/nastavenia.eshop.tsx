import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Package, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { potvrd } from "@/lib/potvrdenie";
import {
  fakturujShoptetFn,
  objednavkyShoptetFn,
  odpojNapojenieFn,
  pripojShoptetFn,
  pripojZasielkovnuFn,
  stavNapojeniFn,
} from "@/lib/faktero/eshop-napojenia.functions";

export const Route = createFileRoute("/_authenticated/nastavenia/eshop")({
  head: () => ({ meta: [{ title: "E-shop a doprava — Faktero" }] }),
  component: Stranka,
});

const vstup = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
type Stav = Awaited<ReturnType<typeof stavNapojeniFn>>;

function Stranka() {
  const cid = useMemo(() => getActiveCompanyId(), []);
  const nacitaj = useServerFn(stavNapojeniFn);
  const [stav, setStav] = useState<Stav | null>(null);
  const obnov = () => {
    if (cid)
      nacitaj({ data: { company_id: cid } })
        .then(setStav)
        .catch((e) => toast.error(e?.message ?? "Chyba"));
  };
  useEffect(obnov, [cid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cid) return null;
  return (
    <>
      <PageHeader
        title="E-shop a doprava"
        description="Objednávky zo Shoptetu ako faktúry a zásielky Zásielkovne priamo z faktúry. WooCommerce má vlastný doplnok."
      />
      <PageBody>
        {stav === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
          </div>
        ) : (
          <div className="space-y-6">
            <ShoptetPanel companyId={cid} stav={stav.shoptet} onZmena={obnov} />
            <ZasielkovnaPanel companyId={cid} stav={stav.zasielkovna} onZmena={obnov} />
            <p className="text-sm text-muted-foreground">
              E-shop na WordPresse? Pozrite si{" "}
              <Link to="/pomoc/woocommerce" className="text-primary hover:underline">
                doplnok pre WooCommerce
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
      toast.error(e?.message ?? "Objednávky sa nepodarilo načítať");
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
      toast.success(`Pripojené: ${r.nazov ?? "e-shop"}`);
      setToken("");
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Pripojenie zlyhalo", { duration: 10000 });
    } finally {
      setBusy(false);
    }
  }

  async function vystavit() {
    const kody = [...vybrane];
    if (
      !(await potvrd(
        `Vystaviť ${kody.length} faktúr z objednávok?\nČíslo dostanú podľa číselného radu faktúr; zaplatené objednávky sa označia ako uhradené.`,
        { potvrdit: "Vystaviť" },
      ))
    )
      return;
    setBusy(true);
    try {
      const v = await fakturuj({ data: { company_id: companyId, kody } });
      const ok = v.filter((x) => x.ok);
      const zle = v.filter((x) => !x.ok);
      if (ok.length) toast.success(`Vystavené: ${ok.map((x) => x.faktura).join(", ")}`);
      if (zle.length)
        toast.error(zle.map((x) => `${x.kod}: ${x.chyba}`).join("\n"), { duration: 15000 });
      await nacitajObj();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <ShoppingBag className="mt-0.5 h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Shoptet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Z objednávok e-shopu vystavíte faktúry jedným klikom — s položkami, dopravou a zľavami
            presne tak, ako ich zákazník zaplatil. Tá istá objednávka nedostane faktúru dvakrát.
          </p>
          {!stav ? (
            <div className="mt-4 max-w-xl">
              <label className="block text-sm">
                <span className="text-xs text-muted-foreground">Súkromný API token</span>
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value.trim())}
                  autoComplete="off"
                  className={vstup}
                />
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                V administrácii Shoptetu: Prepojenia → API partneri → Súkromný API token (vyžaduje
                tarif Premium). Tokenu stačí skupina Objednávky na čítanie. Uložený je zašifrovaný.
              </p>
              <button
                onClick={() => void pripojit()}
                disabled={busy || token.length < 20}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Pripojiť e-shop
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  pripojené
                </span>
                <strong>{stav.eshop_nazov ?? "e-shop"}</strong>
                {stav.eshop_url ? (
                  <span className="text-muted-foreground">{stav.eshop_url}</span>
                ) : null}
                <button
                  onClick={async () => {
                    if (!(await potvrd("Odpojiť Shoptet?\nVystavené faktúry ostanú."))) return;
                    await odpoj({ data: { company_id: companyId, co: "shoptet" } });
                    onZmena();
                  }}
                  className="ml-auto rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                >
                  Odpojiť
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  <span className="text-xs text-muted-foreground">Objednávky za posledných</span>
                  <select
                    value={dni}
                    onChange={(e) => setDni(Number(e.target.value))}
                    className={vstup}
                  >
                    {[7, 30, 90, 180].map((d) => (
                      <option key={d} value={d}>
                        {d} dní
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => void nacitajObj()}
                  disabled={busy}
                  className="h-9 rounded-md border border-border px-3 text-sm hover:bg-secondary"
                >
                  Načítať
                </button>
                <button
                  onClick={() => void vystavit()}
                  disabled={busy || !vybrane.size}
                  className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Vystaviť faktúry ({vybrane.size})
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
                            aria-label="Vybrať všetky bez faktúry"
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
                        <th className="p-2">Objednávka</th>
                        <th className="p-2">Zákazník</th>
                        <th className="p-2">Stav</th>
                        <th className="p-2">Platba</th>
                        <th className="p-2 text-right">Suma</th>
                        <th className="p-2">Faktúra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground">
                            Žiadne objednávky v tomto období.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r) => (
                          <tr key={r.kod} className="border-b border-border last:border-0">
                            <td className="p-2">
                              <input
                                type="checkbox"
                                aria-label={`Vybrať ${r.kod}`}
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
                                  ? new Date(r.vytvorena).toLocaleDateString("sk-SK")
                                  : ""}
                              </div>
                            </td>
                            <td className="p-2">{r.zakaznik ?? "—"}</td>
                            <td className="p-2 text-xs">{r.stav ?? "—"}</td>
                            <td className="p-2 text-xs">
                              {r.platba ?? "—"}
                              {r.zaplatena ? (
                                <span className="ml-1 text-emerald-700">· zaplatená</span>
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
              {stav.posledna_chyba ? (
                <p className="mt-2 text-xs text-amber-700">Posledná chyba: {stav.posledna_chyba}</p>
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
  const pripoj = useServerFn(pripojZasielkovnuFn);
  const odpoj = useServerFn(odpojNapojenieFn);
  const [heslo, setHeslo] = useState("");
  const [odosielatel, setOdosielatel] = useState("");
  const [busy, setBusy] = useState(false);
  async function pripojit() {
    setBusy(true);
    try {
      await pripoj({ data: { company_id: companyId, heslo, odosielatel } });
      toast.success("Zásielkovňa pripojená — zásielku vytvoríte na detaile faktúry.");
      setHeslo("");
      onZmena();
    } catch (e: any) {
      toast.error(e?.message ?? "Pripojenie zlyhalo", { duration: 10000 });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <Package className="mt-0.5 h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Zásielkovňa</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Na detaile faktúry vytvoríte zásielku na výdajné miesto alebo na adresu, aj s dobierkou
            vo výške faktúry, a vytlačíte štítok. Vybrané dobierky potom nahráte ako výpis z brány
            (Účtovníctvo → Výpis z platobnej brány).
          </p>
          {!stav ? (
            <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-xs text-muted-foreground">
                  API heslo (klientská sekcia Zásielkovne → Nastavenia API)
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
                  Označenie odosielateľa (e-shop v klientskej sekcii)
                </span>
                <input
                  value={odosielatel}
                  onChange={(e) => setOdosielatel(e.target.value)}
                  placeholder="napr. mojobchod.sk"
                  className={vstup}
                />
              </label>
              <div>
                <button
                  onClick={() => void pripojit()}
                  disabled={busy || heslo.length !== 32}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Pripojiť
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                pripojené
              </span>
              <span>odosielateľ: {stav.odosielatel ?? "názov firmy"}</span>
              <button
                onClick={async () => {
                  if (
                    !(await potvrd(
                      "Odpojiť Zásielkovňu?\nVytvorené zásielky ostanú v Zásielkovni.",
                    ))
                  )
                    return;
                  await odpoj({ data: { company_id: companyId, co: "zasielkovna" } });
                  onZmena();
                }}
                className="ml-auto rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
              >
                Odpojiť
              </button>
              {stav.posledna_chyba ? (
                <p className="w-full text-xs text-amber-700">
                  Posledná chyba: {stav.posledna_chyba}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
