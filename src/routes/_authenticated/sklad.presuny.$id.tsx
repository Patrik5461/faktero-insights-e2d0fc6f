import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { formatujJednotkovuCenu, formatujMenu, formatujMnozstvo } from "@/lib/faktero/mena";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getTransferDetail, completeTransfer, cancelTransfer } from "@/lib/faktero/stock.functions";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { ArrowRightLeft, CheckCircle2, XCircle } from "lucide-react";
import { potvrd } from "@/lib/potvrdenie";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { useT } from "@/lib/i18n/useT";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/sklad/presuny/$id")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Detail presunu — Faktero") }],
  }),
  component: TransferDetailPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Koncept",
  completed: "Dokončený",
  cancelled: "Zrušený",
};
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-muted text-muted-foreground",
};

function TransferDetailPage() {
  const { t, jazyk } = useT();
  const mena = useMenaFirmy();
  const { id } = Route.useParams();
  const nav = useNavigate();
  const fetchDetail = useServerFn(getTransferDetail);
  const complete = useServerFn(completeTransfer);
  const cancelFn = useServerFn(cancelTransfer);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchDetail({ data: { id } });
      setData(res);
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa načítať presun."));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [id]);

  if (loading) {
    return (
      <>
        <PageHeader title={t("Detail presunu")} />
        <PageBody>
          <div className="rounded-md border p-6 text-sm text-muted-foreground">
            {t("Načítavam…")}
          </div>
        </PageBody>
      </>
    );
  }
  /*
    Načítanie a nenájdený presun sa musia rozlíšiť. Kým to bola jedna vetva,
    zostala na neexistujúcom presune navždy hláška „Načítavam…" — chybová
    bublina medzitým zmizla a človek čakal na niečo, čo už neprišlo.
  */
  if (!data?.transfer) {
    return (
      <>
        <PageHeader title={t("Detail presunu")} />
        <PageBody>
          <div className="rounded-md border p-6 text-sm text-muted-foreground">
            {t("Presun sa nenašiel. Možno bol zrušený alebo patrí inej firme.")}{" "}
            <Link to="/sklad/presuny" className="text-primary hover:underline">
              {t("Späť na presuny")}
            </Link>
          </div>
        </PageBody>
      </>
    );
  }

  const { transfer, items, stockItems, warehouses, companies, products } = data;
  const whMap: Record<string, any> = Object.fromEntries(
    (warehouses ?? []).map((w: any) => [w.id, w]),
  );
  const coMap: Record<string, any> = Object.fromEntries(
    (companies ?? []).map((c: any) => [c.id, c]),
  );
  const siMap: Record<string, any> = Object.fromEntries(
    (stockItems ?? []).map((s: any) => [s.id, s]),
  );
  const prodMap: Record<string, any> = Object.fromEntries(
    (products ?? []).map((p: any) => [p.id, p]),
  );

  const doComplete = async () => {
    if (!(await potvrd(t("Naozaj dokončiť presun? Vytvoria sa skladové pohyby (výdaj + príjem)."))))
      return;
    setBusy(true);
    try {
      await complete({ data: { id } });
      toast.success(t("Presun dokončený."));
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Presun sa nepodarilo dokončiť."));
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    if (!(await potvrd(t("Zrušiť presun?")))) return;
    setBusy(true);
    try {
      await cancelFn({ data: { id } });
      toast.success(t("Presun zrušený."));
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? t("Nepodarilo sa zrušiť."));
    } finally {
      setBusy(false);
    }
  };

  const total = items.reduce(
    (s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price),
    0,
  );

  return (
    <>
      <PageHeader
        title={t("Presun {cislo}", { cislo: transfer.id.slice(0, 8) })}
        description={t("Vytvorený {datum}", {
          datum: new Date(transfer.created_at).toLocaleString("sk-SK"),
        })}
      />
      <PageBody>
        <div className="mx-auto max-w-4xl space-y-5">
          <div className="rounded-md border p-4">
            <div className="flex items-center justify-between">
              <span
                className={`inline-block rounded px-2 py-0.5 text-xs ${STATUS_STYLE[transfer.status] ?? ""}`}
              >
                {t(STATUS_LABEL[transfer.status] ?? transfer.status)}
              </span>
              {transfer.status === "draft" && (
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={doCancel}
                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" /> {t("Zrušiť")}
                  </button>
                  <button
                    disabled={busy}
                    onClick={doComplete}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> {t("Dokončiť presun")}
                  </button>
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">{t("Zo skladu")}</div>
                <div className="font-medium">{whMap[transfer.warehouse_from_id]?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {coMap[transfer.company_id]?.name ?? ""}
                </div>
              </div>
              <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">{t("presun::Do")}</div>
                <div className="font-medium">
                  {transfer.warehouse_to_id ? (whMap[transfer.warehouse_to_id]?.name ?? "—") : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {transfer.target_company_id
                    ? (coMap[transfer.target_company_id]?.name ?? t("Iná firma"))
                    : (coMap[transfer.company_id]?.name ?? "")}
                </div>
              </div>
            </div>
            {transfer.note && (
              <div className="mt-3 text-sm text-muted-foreground">{transfer.note}</div>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">{t("Položka")}</th>
                  <th className="px-3 py-2">{t("Kód")}</th>
                  <th className="px-3 py-2 text-right">{t("Množstvo")}</th>
                  <th className="px-3 py-2 text-right">{t("Jedn. cena")}</th>
                  <th className="px-3 py-2 text-right">{t("Spolu")}</th>
                  {transfer.target_company_id && (
                    <th className="px-3 py-2">{t("Cieľ. položka")}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((it: any) => {
                  const src = siMap[it.source_stock_item_id];
                  const tgt = it.target_stock_item_id ? siMap[it.target_stock_item_id] : null;
                  const name = src?.product_id ? prodMap[src.product_id]?.name : null;
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="px-3 py-2">{name ?? "—"}</td>
                      <td className="px-3 py-2">{src?.sku ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {formatujMnozstvo(it.quantity, lokalJazyka(jazyk))}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatujJednotkovuCenu(it.unit_price, mena.kod)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatujMenu(Number(it.quantity) * Number(it.unit_price), mena.kod)}
                      </td>
                      {transfer.target_company_id && (
                        <td className="px-3 py-2 text-muted-foreground">
                          {tgt
                            ? (tgt.sku ?? tgt.id.slice(0, 8))
                            : transfer.status === "draft"
                              ? t("Bude priradená pri dokončení")
                              : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="px-3 py-2" colSpan={4}>
                    {t("Spolu")}
                  </td>
                  <td className="px-3 py-2 text-right">{formatujMenu(total, mena.kod)}</td>
                  {transfer.target_company_id && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </PageBody>
    </>
  );
}
