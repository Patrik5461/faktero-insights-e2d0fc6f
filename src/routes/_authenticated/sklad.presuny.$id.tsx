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
import { StavOdznak, tonStavu, type TonStavu } from "@/components/faktero/web/Stav";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { useKlikNaRiadok } from "@/hooks/useKlikNaRiadok";
import {
  BunkaPolozky,
  PolozkyHlavicka,
  PolozkyKontajner,
  RiadokPolozky,
} from "@/components/faktero/PolozkyResponzivne";

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
/** Tón stavu presunu — rovnaký jazyk ako doklady (koncept, hotovo, neplatí). */
const TON_PRESUNU: Record<string, TonStavu> = {
  draft: "neutralny",
  completed: "uspech",
  cancelled: "zruseny",
};

function TransferDetailPage() {
  const { t, jazyk } = useT();
  const mena = useMenaFirmy();
  const { id } = Route.useParams();
  const nav = useNavigate();
  const fetchDetail = useServerFn(getTransferDetail);
  const complete = useServerFn(completeTransfer);
  const cancelFn = useServerFn(cancelTransfer);
  const klik = useKlikNaRiadok();

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
          <div className="rounded-xl border border-border bg-card">
            <NacitavanieStav />
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
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {t("Presun sa nenašiel. Možno bol zrušený alebo patrí inej firme.")}{" "}
            <Link to="/sklad/presuny" className="font-semibold text-primary hover:underline">
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
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StavOdznak ton={tonStavu(TON_PRESUNU, transfer.status)}>
                {t(STATUS_LABEL[transfer.status] ?? transfer.status)}
              </StavOdznak>
              {transfer.status === "draft" && (
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={busy}
                    onClick={doCancel}
                    className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" /> {t("Zrušiť")}
                  </button>
                  <button
                    disabled={busy}
                    onClick={doComplete}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> {t("Dokončiť presun")}
                  </button>
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-muted-foreground">{t("Zo skladu")}</div>
                <div className="break-words font-semibold">
                  {whMap[transfer.warehouse_from_id]?.name ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {coMap[transfer.company_id]?.name ?? ""}
                </div>
              </div>
              <ArrowRightLeft className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-muted-foreground">{t("presun::Do")}</div>
                <div className="break-words font-semibold">
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
              <div className="mt-3 break-words border-t border-border pt-3 text-sm text-muted-foreground">
                {transfer.note}
              </div>
            )}
          </div>

          {/* Položky podľa šírky kontajnera (PolozkyResponzivne): úzko karta, široko riadok — bez vodorovného posúvania. */}
          <div className="rounded-xl border border-border bg-card px-4 py-2 sm:px-5">
            <PolozkyKontajner
              stlpce={`minmax(0,1fr) minmax(4rem,auto) minmax(4.5rem,auto) minmax(5.5rem,auto) minmax(6rem,auto)${transfer.target_company_id ? " minmax(6rem,auto)" : ""}`}
              className="text-sm"
            >
              <PolozkyHlavicka
                stlpce={[
                  { text: t("Položka") },
                  { text: t("Kód") },
                  { text: t("Množstvo"), vpravo: true },
                  { text: t("Jedn. cena"), vpravo: true },
                  { text: t("Spolu"), vpravo: true },
                  ...(transfer.target_company_id ? [{ text: t("Cieľ. položka") }] : []),
                ]}
              />
              {items.map((it: any) => {
                const src = siMap[it.source_stock_item_id];
                const tgt = it.target_stock_item_id ? siMap[it.target_stock_item_id] : null;
                const name = src?.product_id ? prodMap[src.product_id]?.name : null;
                const riadok = klik(
                  src?.product_id
                    ? { to: "/sklad/produkty/$id", params: { id: src.product_id } }
                    : null,
                );
                return (
                  <div key={it.id} {...riadok}>
                    <RiadokPolozky className="items-start @min-[560px]:items-center">
                      <BunkaPolozky popis={t("Položka")} uzky={8} poradie={1} skrytyPopis>
                        <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                          {name ?? "—"}
                        </span>
                      </BunkaPolozky>
                      <BunkaPolozky popis={t("Kód")} uzky={4} poradie={3}>
                        <span className="text-muted-foreground [overflow-wrap:anywhere]">
                          {src?.sku ?? "—"}
                        </span>
                      </BunkaPolozky>
                      <BunkaPolozky popis={t("Množstvo")} uzky={4} poradie={4} vpravo>
                        <span className="tabular-nums [overflow-wrap:anywhere]">
                          {formatujMnozstvo(it.quantity, lokalJazyka(jazyk))}
                        </span>
                      </BunkaPolozky>
                      <BunkaPolozky popis={t("Jedn. cena")} uzky={4} poradie={5} vpravo>
                        <span className="suma font-normal [overflow-wrap:anywhere]">
                          {formatujJednotkovuCenu(it.unit_price, mena.kod)}
                        </span>
                      </BunkaPolozky>
                      <BunkaPolozky popis={t("Spolu")} uzky={4} poradie={2} vpravo skrytyPopis>
                        <span className="suma [overflow-wrap:anywhere]">
                          {formatujMenu(Number(it.quantity) * Number(it.unit_price), mena.kod)}
                        </span>
                      </BunkaPolozky>
                      {transfer.target_company_id && (
                        <BunkaPolozky popis={t("Cieľ. položka")} poradie={6}>
                          <span className="text-muted-foreground [overflow-wrap:anywhere]">
                            {tgt
                              ? (tgt.sku ?? tgt.id.slice(0, 8))
                              : transfer.status === "draft"
                                ? t("Bude priradená pri dokončení")
                                : "—"}
                          </span>
                        </BunkaPolozky>
                      )}
                    </RiadokPolozky>
                  </div>
                );
              })}
              <div className="flex items-baseline justify-between gap-3 border-t border-border py-2 font-semibold">
                <span>{t("Spolu")}</span>
                <span className="suma [overflow-wrap:anywhere]">
                  {formatujMenu(total, mena.kod)}
                </span>
              </div>
            </PolozkyKontajner>
          </div>
        </div>
      </PageBody>
    </>
  );
}
