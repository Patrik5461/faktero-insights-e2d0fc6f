import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageBody } from "@/components/faktero/AppShell";
import {
  DocumentDetailHeader,
  MenuAkcia,
  MenuSkupina,
  MetaRiadok,
  PoTermine,
  PrimarnaAkcia,
  StavOdznak,
} from "@/components/faktero/DocumentDetailHeader";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { listWarehousesForCompany } from "@/lib/faktero/stock.functions";
import {
  cancelPurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrder,
  receivePurchaseOrder,
  sendPurchaseOrder,
} from "@/lib/faktero/purchase-orders.functions";
import { STAV_POPIS, type StavObjednavky } from "@/lib/faktero/objednavky-dodavatel";
import { PackageCheck, Send, Trash2, X } from "lucide-react";
import { formatovacMeny, formatujCislo } from "@/lib/faktero/mena";
import { potvrd } from "@/lib/potvrdenie";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/sklad/objednavky/$id")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Objednávka — Faktero") }] }),
  component: PurchaseOrderDetail,
});

const FARBA_STAVU: Record<StavObjednavky, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/10 text-blue-600",
  partially_received: "bg-amber-500/10 text-amber-800",
  received: "bg-emerald-500/10 text-emerald-700",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function suma(n: number, mena = "EUR") {
  return formatovacMeny(mena, "sk-SK")(n || 0);
}

function PurchaseOrderDetail() {
  const { t } = useT();
  const { id } = Route.useParams();
  const nav = useNavigate();
  const fetchOrder = useServerFn(getPurchaseOrder);
  const fetchWarehouses = useServerFn(listWarehousesForCompany);
  const doSend = useServerFn(sendPurchaseOrder);
  const doCancel = useServerFn(cancelPurchaseOrder);
  const doDelete = useServerFn(deletePurchaseOrder);
  const doReceive = useServerFn(receivePurchaseOrder);

  const [data, setData] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sprava, setSprava] = useState<string | null>(null);
  const [prijemSklad, setPrijemSklad] = useState("");
  const [prijem, setPrijem] = useState<Record<string, number>>({});

  const cid = useMemo(() => getActiveCompanyId(), []);

  const nacitaj = useCallback(() => {
    if (!cid) {
      setLoading(false);
      return;
    }
    return (
      fetchOrder({ data: { company_id: cid, id } })
        .then((d: any) => {
          setData(d);
          setPrijemSklad((s) => s || d?.order?.warehouse_id || "");
          // Predvyplní sa to, čo ešte neprišlo — najčastejší prípad je, že dorazí
          // celý zvyšok objednávky.
          const predvolba: Record<string, number> = {};
          (d?.items ?? []).forEach((it: any) => {
            if (it.zostava > 0) predvolba[it.id] = it.zostava;
          });
          setPrijem(predvolba);
        })
        /* Neexistujúca alebo cudzia objednávka: server ju odmietne a stránka
         ukáže „Objednávka sa nenašla". Bez zachytenia odišla chyba ako
         neošetrená výnimka do konzoly. */
        .catch(() => setData(null))
        .finally(() => setLoading(false))
    );
  }, [cid, id, fetchOrder]);

  useEffect(() => {
    nacitaj();
    if (cid)
      fetchWarehouses({ data: { company_id: cid } }).then((w: any) => setWarehouses(w ?? []));
  }, [nacitaj, cid, fetchWarehouses]);

  async function akcia(fn: () => Promise<any>, hlaska?: string) {
    setBusy(true);
    setError(null);
    setSprava(null);
    try {
      await fn();
      if (hlaska) setSprava(hlaska);
      await nacitaj();
    } catch (e: any) {
      setError(e?.message ?? t("Akcia zlyhala"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">{t("Načítavam…")}</div>
      </PageBody>
    );
  }
  if (!data) {
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">{t("Objednávka sa nenašla.")}</div>
      </PageBody>
    );
  }

  const o = data.order;
  const stav = o.status as StavObjednavky;
  const otvorena = stav === "sent" || stav === "partially_received";
  const meskaDodanie =
    otvorena &&
    !!o.expected_date &&
    new Date(o.expected_date) < new Date(new Date().toDateString());
  const riadkyNaPrijem = (data.items ?? []).filter((it: any) => it.zostava > 0);

  return (
    <>
      <DocumentDetailHeader
        title={t("Objednávka")}
        number={o.order_number}
        status={
          <StavOdznak className={FARBA_STAVU[stav]}>{t(STAV_POPIS[stav] ?? stav)}</StavOdznak>
        }
        meta={
          <MetaRiadok
            polozky={[
              o.supplier_name ?? t("Bez dodávateľa"),
              t("Vystavená {datum}", { datum: datumNaDoklade(o.order_date) }),
              o.expected_date ? (
                <PoTermine aktivne={meskaDodanie}>
                  {t("dodanie {datum}", { datum: datumNaDoklade(o.expected_date) })}
                </PoTermine>
              ) : null,
            ]}
          />
        }
        primaryAction={
          stav === "draft" ? (
            <PrimarnaAkcia
              disabled={busy}
              onClick={() =>
                akcia(
                  () => doSend({ data: { company_id: cid!, id } }),
                  t("Objednávka je odoslaná — od teraz sa počíta ako tovar na ceste."),
                )
              }
            >
              <Send /> {t("Označiť ako odoslanú")}
            </PrimarnaAkcia>
          ) : null
        }
        menuActions={
          <MenuSkupina>
            {otvorena && (
              <MenuAkcia
                ikona={X}
                disabled={busy}
                onClick={() =>
                  akcia(
                    () => doCancel({ data: { company_id: cid!, id } }),
                    t("Objednávka je zrušená."),
                  )
                }
              >
                {t("Zrušiť objednávku")}
              </MenuAkcia>
            )}
            {/* Zrušená objednávka je len riadok v zozname — nech sa dá upratať.
                Či z nej neprišiel tovar, dozerá server. */}
            {(stav === "draft" || stav === "cancelled") && (
              <MenuAkcia
                ikona={Trash2}
                nebezpecna
                disabled={busy}
                onClick={async () => {
                  if (!(await potvrd(t("Naozaj zmazať objednávku?")))) return;
                  akcia(async () => {
                    await doDelete({ data: { company_id: cid!, id } });
                    nav({ to: "/sklad/objednavky" });
                  });
                }}
              >
                {t("Zmazať")}
              </MenuAkcia>
            )}
          </MenuSkupina>
        }
      />
      <PageBody>
        <div className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {sprava && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              {sprava}
            </div>
          )}

          <div className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">{t("Vystavená")}</div>
              <div>{datumNaDoklade(o.order_date)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("Očakávané dodanie")}</div>
              <div>{o.expected_date ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("Sklad")}</div>
              <div>{data.warehouse?.name ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("Spolu")}</div>
              <div className="font-semibold">{suma(data.total, o.currency)}</div>
            </div>
            {data.job && (
              <div className="sm:col-span-4">
                <div className="text-xs text-muted-foreground">{t("Zákazka")}</div>
                <Link
                  to="/zakazky/$id"
                  params={{ id: data.job.id }}
                  className="text-primary hover:underline"
                >
                  {data.job.job_number} — {data.job.name}
                </Link>
              </div>
            )}
            {o.note && (
              <div className="sm:col-span-4">
                <div className="text-xs text-muted-foreground">{t("Poznámka")}</div>
                <div>{o.note}</div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">{t("Položka")}</th>
                  <th className="p-3 text-right">{t("Objednané")}</th>
                  <th className="p-3 text-right">{t("sklad::Prijaté")}</th>
                  <th className="p-3 text-right">{t("Zostáva")}</th>
                  <th className="p-3 text-right">{t("Cena / MJ")}</th>
                  {otvorena && <th className="p-3 text-right">{t("Prijať teraz")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data.items ?? []).map((it: any) => (
                  <tr key={it.id}>
                    <td className="p-3">
                      {it.name}
                      {!it.stock_item_id && (
                        <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-800">
                          {t("bez skladovej karty")}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatujCislo(it.quantity, 0, 2)} {it.unit ?? ""}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatujCislo(it.received_quantity, 0, 2)}
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium">
                      {formatujCislo(it.zostava, 0, 2)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {suma(Number(it.unit_price), o.currency)}
                    </td>
                    {otvorena && (
                      <td className="p-3 text-right">
                        {it.zostava > 0 ? (
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            max={it.zostava}
                            value={prijem[it.id] ?? 0}
                            onChange={(e) =>
                              setPrijem((p) => ({ ...p, [it.id]: Number(e.target.value) }))
                            }
                            className="input w-24 text-right"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("vybavené")}</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {otvorena && riadkyNaPrijem.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">{t("Príjem na sklad")}</div>
              <p className="mb-3 text-xs text-muted-foreground">
                {t(
                  "Príjem vytvorí skladový pohyb s cenou z objednávky, takže sa premietne do váženej nákupnej ceny zásoby. Prijať sa dá najviac to, čo zostáva.",
                )}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{t("Sklad")}</span>
                  <select
                    value={prijemSklad}
                    onChange={(e) => setPrijemSklad(e.target.value)}
                    className="input"
                  >
                    <option value="">{t("— vyberte —")}</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || !prijemSklad}
                  onClick={() => {
                    const lines = Object.entries(prijem)
                      .map(([item_id, quantity]) => ({ item_id, quantity: Number(quantity) }))
                      .filter((l) => l.quantity > 0);
                    if (lines.length === 0) {
                      setError(t("Zadajte aspoň jedno množstvo na príjem."));
                      return;
                    }
                    akcia(
                      () =>
                        doReceive({
                          data: { company_id: cid!, id, warehouse_id: prijemSklad, lines },
                        }),
                      t("Tovar je naskladnený."),
                    );
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <PackageCheck className="h-4 w-4" /> {t("Prijať na sklad")}
                </button>
              </div>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
