import { formatujCislo, formatujJednotkovuCenu, formatujMenu } from "@/lib/faktero/mena";
import { createFileRoute, Link } from "@tanstack/react-router";
import { hodnotaPohybu, pohybDelta, pohybText } from "@/lib/faktero/stock-pohyb";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { getProductStockDetail, recomputeStockAvgCost } from "@/lib/faktero/stock.functions";
import { useStockPermissions } from "@/hooks/useStockPermissions";
import { ReservationsPanel } from "@/components/faktero/ReservationsPanel";
import { Download, FileText, Package, Pencil, Warehouse, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/sklad/produkty/$id/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Skladová karta — Faktero") }] }),
  component: ProductStockDetail,
});

const TYPE_LABEL: Record<string, string> = {
  prijem: "Príjem",
  vydaj: "Výdaj",
  oprava: "Oprava",
  inventura: "Inventúra",
  faktura: "Faktúra",
  dobropis: "Dobropis",
};

const STAV_FAKTURY: Record<string, string> = {
  draft: "Koncept",
  issued: "Vystavená",
  sent: "Odoslaná",
  paid: "Uhradená",
  partially_paid: "Čiastočne uhradená",
  overdue: "Po splatnosti",
  cancelled: "Stornovaná",
};

function ProductStockDetail() {
  const { t } = useT();
  const mena = useMenaFirmy();
  const { id } = Route.useParams();
  const fetchDetail = useServerFn(getProductStockDetail);
  const recompute = useServerFn(recomputeStockAvgCost);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const { canMutate, canManage } = useStockPermissions();

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    fetchDetail({ data: { company_id: cid, product_id: id } })
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id, fetchDetail]);

  async function handleRecompute() {
    const cid = getActiveCompanyId();
    if (!cid || !data?.stockItem?.id) return;
    setRecomputing(true);
    try {
      await recompute({ data: { company_id: cid, stock_item_id: data.stockItem.id } });
      toast.success(t("Priemerná nákupná cena prepočítaná."));
      const d = await fetchDetail({ data: { company_id: cid, product_id: id } });
      setData(d);
    } catch (e: any) {
      toast.error(e?.message ?? t("Prepočet zlyhal."));
    } finally {
      setRecomputing(false);
    }
  }

  function exportMovementsCsv() {
    if (!data?.movements) return;
    const headers = ["Dátum", "Typ", "Množstvo", "Jedn. cena", "Hodnota", "Poznámka"].map((h) => t(h));
    const lines = [headers.join(";")];
    for (const m of data.movements) {
      lines.push(
        [
          new Date(m.created_at).toLocaleString("sk-SK"),
          t(TYPE_LABEL[m.type] ?? m.type),
          String(m.quantity),
          Number(m.unit_price).toFixed(5),
          Number(m.total_value).toFixed(2),
          (m.note ?? "").replaceAll(";", ","),
        ].join(";"),
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pohyby-${data.product?.code ?? id}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading)
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">{t("Načítavam…")}</div>
      </PageBody>
    );
  if (!data?.product)
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">{t("Produkt sa nenašiel.")}</div>
      </PageBody>
    );

  const p = data.product;
  const si = data.stockItem;
  const stockValue = si ? data.totalQuantity * Number(si.purchase_price ?? 0) : 0;

  return (
    <>
      <PageHeader
        title={p.name}
        description={t("Kód {kod}", { kod: si?.sku ?? p.code ?? "—" })}
        action={
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Link
                to="/sklad/produkty/$id/upravit"
                params={{ id }}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Pencil className="h-4 w-4" /> {t("Upraviť kartu")}
              </Link>
            )}
            <button
              onClick={exportMovementsCsv}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
            >
              <Download className="h-4 w-4" /> {t("Export pohybov CSV")}
            </button>
          </div>
        }
      />
      <PageBody>
        {/* Deväť kariet: 3 × 3 na desktope, po dvoch na mobile. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <Stat label="Na sklade" value={`${formatujCislo(data.totalQuantity, 0, 2)} ${si?.unit ?? ""}`} />
          <Stat
            label="Rezervované"
            value={`${formatujCislo(data.reservedQuantity ?? 0, 0, 2)} ${si?.unit ?? ""}`}
          />
          <Stat
            label="K dispozícii"
            value={`${formatujCislo(Number(data.totalQuantity) - Number(data.reservedQuantity ?? 0), 0, 2)} ${si?.unit ?? ""}`}
          />
          <Stat label="Hodnota skladu" value={formatujMenu(stockValue, mena.kod)} />
          <Stat
            label="Minimálny stav"
            value={si ? `${formatujCislo(si.min_stock, 0, 2)} ${si.unit}` : "—"}
          />
          <Stat
            label="Nákupná cena"
            value={si ? formatujJednotkovuCenu(si.purchase_price, mena.kod) : "—"}
          />
          <Stat
            label="Predajná cena"
            value={si ? formatujJednotkovuCenu(si.sale_price, mena.kod) : "—"}
          />
          <Stat
            label="Priemerná nákupná cena"
            value={si ? formatujJednotkovuCenu(si.avg_purchase_price ?? 0, mena.kod) : "—"}
          />
          <Stat
            label="Posledná nákupná cena"
            value={
              si?.last_purchase_price != null
                ? formatujJednotkovuCenu(si.last_purchase_price, mena.kod)
                : "—"
            }
          />
        </div>
        {canManage && si && (
          <div className="mt-3">
            <button
              onClick={handleRecompute}
              disabled={recomputing}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${recomputing ? "animate-spin" : ""}`} />
              {recomputing ? t("Prepočítavam…") : t("Prepočítať priemernú cenu")}
            </button>
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              {t("Fotografia")}
            </div>
            {data.photoSignedUrl ? (
              <img
                src={data.photoSignedUrl}
                alt={p.name}
                className="aspect-square w-full rounded-md object-cover"
              />
            ) : (
              <div className="flex h-24 w-full items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground md:h-auto md:aspect-square">
                {t("Bez fotografie")}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Package className="h-4 w-4 text-primary" /> {t("Detaily produktu")}
            </div>
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <Pair label="Názov (SK)" value={p.name} />
              <Pair label="Názov (EN)" value={si?.name_en ?? "—"} />
              <Pair label="Kód" value={p.code ?? "—"} />
              <Pair label="Skladový kód (SKU)" value={si?.sku ?? "—"} />
              <Pair label="Čiarový kód / EAN" value={si?.barcode ?? "—"} />
              <Pair label="Jednotka" value={si?.unit ?? p.unit} />
              <Pair label="DPH" value={`${formatujCislo(si?.vat_rate ?? p.vat_rate, 0, 2)} %`} />
              <Pair label="Kategória" value={data.category?.name ?? "—"} />
              <Pair label="Dodávateľ" value={data.supplier?.name ?? "—"} />
              <Pair label="Lokácia (regál/pozícia)" value={si?.location ?? "—"} />
              <Pair label="Sledovať zásoby" value={si?.track_stock ? t("Áno") : t("Nie")} />
            </dl>
            {(si?.description || p.description) && (
              <div className="mt-3 border-t border-border pt-3 text-sm">
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {t("Popis")}
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {si?.description ?? p.description}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <ReservationsPanel
            companyId={data.stockItem?.company_id ?? p.company_id}
            stockItemId={si?.id ?? ""}
            unit={si?.unit}
          />
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Warehouse className="h-4 w-4 text-primary" /> {t("Stav v skladoch")}
          </div>
          {data.levels.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("Žiadne zaznamenané stavy.")}</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-2">{t("Sklad")}</th>
                  <th className="p-2 text-right">{t("Množstvo")}</th>
                  <th className="p-2 text-right">{t("Rezervované")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.levels.map((l: any) => (
                  <tr key={l.warehouse_id}>
                    <td className="p-2">{l.warehouses?.name ?? l.warehouse_id.slice(0, 8)}</td>
                    <td className="p-2 text-right tabular-nums">
                      {formatujCislo(l.quantity, 0, 2)} {si?.unit ?? ""}
                    </td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">
                      {formatujCislo(l.reserved_quantity ?? 0, 0, 2)} {si?.unit ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {canMutate && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/sklad/prijem"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {t("Príjem")}
            </Link>
            <Link
              to="/sklad/vydaj"
              className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
            >
              {t("Výdaj")}
            </Link>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" /> {t("Posledných 20 pohybov")}
          </div>
          {data.movements.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("Žiadne pohyby.")}</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-2">{t("Dátum")}</th>
                  <th className="p-2">{t("Typ")}</th>
                  <th className="p-2 text-right">{t("Množstvo")}</th>
                  <th className="p-2 text-right">{t("Cena/MJ")}</th>
                  <th className="p-2 text-right">{t("Hodnota")}</th>
                  <th className="p-2">{t("Zdroj")}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.movements.map((m: any) => (
                  <tr key={m.id}>
                    <td className="p-2 whitespace-nowrap text-muted-foreground">
                      {new Date(m.created_at).toLocaleString("sk-SK")}
                    </td>
                    <td className="p-2">{t(TYPE_LABEL[m.type] ?? m.type)}</td>
                    <td
                      className={`p-2 text-right tabular-nums ${pohybDelta(m.type, m.quantity) >= 0 ? "text-emerald-600" : "text-destructive"}`}
                    >
                      {pohybText(m.type, m.quantity)}
                    </td>
                    <td className="p-2 text-right tabular-nums whitespace-nowrap">
                      {m.unit_cost != null ? formatujJednotkovuCenu(m.unit_cost, mena.kod) : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums whitespace-nowrap">
                      {formatujMenu(hodnotaPohybu(m), mena.kod)}
                    </td>
                    <td className="p-2">
                      <SourceBadge type={m.source_document_type} id={m.source_document_id} />
                    </td>
                    <td className="p-2 text-right">
                      <Link
                        to="/sklad/pohyby/$id"
                        params={{ id: m.id }}
                        className="text-xs text-primary hover:underline"
                      >
                        {t("Detail")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {data.invoiceRefs.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">{t("Súvisiace faktúry")}</div>
            <ul className="divide-y divide-border text-sm">
              {data.invoiceRefs.map((inv: any) => (
                <li key={inv.id} className="flex items-center justify-between py-2">
                  <Link
                    to="/faktury/$id"
                    params={{ id: inv.id }}
                    className="text-primary hover:underline"
                  >
                    {inv.invoice_number}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {t(STAV_FAKTURY[inv.status] ?? inv.status)} · {formatujMenu(inv.total ?? 0, mena.kod)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PageBody>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{t(label)}</div>
      <div className="mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl">{value}</div>
    </div>
  );
}
function SourceBadge({ type, id }: { type: string | null; id: string | null }) {
  const { t } = useT();
  if (!type) return <span className="text-xs text-muted-foreground">—</span>;
  const label: Record<string, string> = {
    invoice: "Faktúra",
    receipt_note: "Príjemka",
    issue_note: "Výdajka",
    manual: "Manuálne",
    inventory: "Inventúra",
    self_billing: "Samofaktúra",
  };
  const cls =
    "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground";
  if (type === "invoice" && id) {
    return (
      <Link to="/faktury/$id" params={{ id }} className={cls + " hover:underline"}>
        {t(label[type])}
      </Link>
    );
  }
  if (type === "self_billing" && id) {
    return (
      <Link to="/prijate-faktury/$id" params={{ id }} className={cls + " hover:underline"}>
        {t(label[type])}
      </Link>
    );
  }
  return <span className={cls}>{t(label[type] ?? type)}</span>;
}
function Pair({ label, value }: { label: string; value: string }) {
  const { t } = useT();
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t(label)}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
