import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { preloz, lokalJazyka } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
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
import { PrilohyFaktury } from "@/components/faktero/PrilohyFaktury";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  deleteSalesOrder,
  getSalesOrder,
  setSalesOrderStatus,
} from "@/lib/faktero/sales-orders.functions";
import {
  STAV_POPIS,
  jePoTermine,
  percentoVybavenia,
  saDaZmazat,
  zostavaVybavit,
  type StavPrijatejObjednavky,
} from "@/lib/faktero/objednavky-odberatel";
import { FileText, Pencil, Trash2, Ban, Check } from "lucide-react";
import { toast } from "sonner";
import { formatovacMeny, formatujMnozstvo } from "@/lib/faktero/mena";
import { potvrd } from "@/lib/potvrdenie";

export const Route = createFileRoute("/_authenticated/objednavky/$id")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Objednávka — Faktero") }] }),
  component: OrderDetail,
});

const FARBA: Record<StavPrijatejObjednavky, string> = {
  draft: "bg-muted text-muted-foreground",
  confirmed: "bg-blue-500/10 text-blue-600",
  partially_invoiced: "bg-amber-500/10 text-amber-800",
  completed: "bg-emerald-500/10 text-emerald-700",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function suma(n: unknown) {
  return formatovacMeny("EUR", "sk-SK")(Number(n) || 0);
}

function dnesLokalne(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function datum(s?: string | null) {
  if (!s) return "—";
  const [r, m, d] = s.split("-");
  return `${Number(d)}. ${Number(m)}. ${r}`;
}

function OrderDetail() {
  const { t, jazyk } = useT();
  const { id } = Route.useParams();
  const nav = useNavigate();
  const nacitaj = useServerFn(getSalesOrder);
  const zmenStav = useServerFn(setSalesOrderStatus);
  const zmaz = useServerFn(deleteSalesOrder);

  const [o, setO] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const cid = useMemo(() => getActiveCompanyId(), []);
  const dnes = useMemo(dnesLokalne, []);

  const nacitajDetail = useCallback(() => {
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    nacitaj({ data: { company_id: cid, id } })
      .then((d: any) => setO(d))
      .catch((e: any) => setChyba(e?.message ?? t("Objednávku sa nepodarilo načítať")))
      .finally(() => setLoading(false));
  }, [cid, id, nacitaj]);

  useEffect(nacitajDetail, [nacitajDetail]);

  if (loading) {
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">{t("Načítavam…")}</div>
      </PageBody>
    );
  }
  if (chyba || !o) {
    return (
      <PageBody>
        <div className="rounded-xl border border-border bg-card p-6 text-sm">
          {chyba ?? t("Objednávka sa nenašla.")}{" "}
          <Link to="/objednavky" className="text-primary underline">
            {t("Späť na zoznam")}
          </Link>
        </div>
      </PageBody>
    );
  }

  const stav = (o.stav_vypocitany ?? o.status) as StavPrijatejObjednavky;
  const polozky = o.sales_order_items ?? [];
  const percento = percentoVybavenia(polozky);
  const meska = jePoTermine(o.requested_date, stav, dnes);
  const zostavaNieco = polozky.some((p: any) => zostavaVybavit(p) > 0);
  const daSaFakturovat = zostavaNieco && stav !== "cancelled" && stav !== "draft";

  async function nastav(novy: "draft" | "confirmed" | "cancelled", otazka?: string) {
    if (otazka && !(await potvrd(otazka))) return;
    try {
      await zmenStav({ data: { company_id: cid!, id, status: novy } });
      nacitajDetail();
      toast.success(t("Stav objednávky zmenený"));
    } catch (e: any) {
      toast.error(e?.message ?? t("Stav sa nepodarilo zmeniť"));
    }
  }

  return (
    <>
      <DocumentDetailHeader
        title={t("Objednávka")}
        number={o.order_number}
        status={<StavOdznak className={FARBA[stav]}>{t(STAV_POPIS[stav])}</StavOdznak>}
        meta={
          <MetaRiadok
            polozky={[
              o.customers?.name ?? o.customer_name ?? t("bez odberateľa"),
              o.customer_order_number
                ? t("Objednávka odberateľa č. {cislo}", { cislo: o.customer_order_number })
                : t("Prijatá objednávka od odberateľa"),
              o.order_date ? t("Objednané {datum}", { datum: datum(o.order_date) }) : null,
              o.requested_date ? (
                <PoTermine aktivne={meska}>{t("termín {datum}", { datum: datum(o.requested_date) })}</PoTermine>
              ) : null,
            ]}
          />
        }
        primaryAction={
          /* Potvrdenie a fakturácia sa nikdy neukazujú naraz (fakturovať sa dá až potvrdenú). */
          stav === "draft" ? (
            <PrimarnaAkcia onClick={() => nastav("confirmed")}>
              <Check /> {t("Potvrdiť")}
            </PrimarnaAkcia>
          ) : daSaFakturovat ? (
            <PrimarnaAkcia asChild>
              <Link to="/faktury/nova" search={{ sales_order: id }}>
                <FileText /> {t("Vyfakturovať")}
              </Link>
            </PrimarnaAkcia>
          ) : null
        }
        menuActions={
          <>
            {stav !== "completed" && stav !== "cancelled" && (
              <MenuSkupina label={t("Úpravy")}>
                <MenuAkcia asChild>
                  <Link to="/objednavky/nova" search={{ id }}>
                    <Pencil className="h-4 w-4" /> {t("Upraviť")}
                  </Link>
                </MenuAkcia>
              </MenuSkupina>
            )}
            <MenuSkupina>
              {stav !== "cancelled" && stav !== "completed" && (
                <MenuAkcia
                  ikona={Ban}
                  onClick={() =>
                    nastav(
                      "cancelled",
                      t("Zrušiť objednávku? Rezervácie tovaru sa uvoľnia, objednávka ostane v zozname."),
                    )
                  }
                >
                  {t("Zrušiť objednávku")}
                </MenuAkcia>
              )}
              {saDaZmazat(stav) && (
                <MenuAkcia
                  ikona={Trash2}
                  nebezpecna
                  onClick={async () => {
                    if (!(await potvrd(t("Zmazať rozpracovanú objednávku?")))) return;
                    try {
                      await zmaz({ data: { company_id: cid!, id } });
                      nav({ to: "/objednavky" });
                    } catch (e: any) {
                      toast.error(e?.message ?? t("Objednávku sa nepodarilo zmazať"));
                    }
                  }}
                >
                  {t("Zmazať")}
                </MenuAkcia>
              )}
            </MenuSkupina>
          </>
        }
      />
      <PageBody>
        <div className="space-y-4">
          {/* Prehľad */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Karta popis={t("Stav")}>
              <span className={`rounded-full px-2 py-0.5 text-sm ${FARBA[stav]}`}>
                {t(STAV_POPIS[stav])}
              </span>
            </Karta>
            <Karta popis={t("Hodnota objednávky")}>{suma(o.total)}</Karta>
            <Karta popis={t("Zostáva vyfakturovať")}>
              <span className={o.zostava > 0 ? "" : "text-emerald-700"}>{suma(o.zostava)}</span>
            </Karta>
            <Karta popis={t("Vybavené")}>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${percento}%` }}
                  />
                </div>
                <span className="text-sm tabular-nums">{percento} %</span>
              </div>
            </Karta>
          </div>

          {meska && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t("Požadovaný termín {datum} už uplynul a objednávka nie je vybavená.", { datum: datum(o.requested_date) })}
            </div>
          )}

          {/* Údaje */}
          <div className="rounded-xl border border-border bg-card p-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-3">
              <Udaj popis={t("Objednané")}>{datum(o.order_date)}</Udaj>
              <Udaj popis={t("Požadovaný termín")}>{datum(o.requested_date)}</Udaj>
              <Udaj popis={t("Zákazka")}>
                {o.jobs ? (
                  <Link
                    to="/zakazky/$id"
                    params={{ id: o.job_id }}
                    className="text-primary hover:underline"
                  >
                    {o.jobs.job_number} — {o.jobs.name}
                  </Link>
                ) : (
                  "—"
                )}
              </Udaj>
              {o.quote_id && (
                <Udaj popis={t("Vznikla z ponuky")}>
                  <Link
                    to="/ponuky/$id"
                    params={{ id: o.quote_id }}
                    className="text-primary hover:underline"
                  >
                    {t("zobraziť ponuku")}
                  </Link>
                </Udaj>
              )}
              {o.reserve_stock && <Udaj popis={t("Sklad")}>{t("tovar sa rezervuje")}</Udaj>}
            </dl>
            {o.note && <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{o.note}</p>}
          </div>

          {/* Položky */}
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium">{t("Položka")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("Objednané")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("Vyfakturované")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("Zostáva")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("Cena")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("Spolu")}</th>
                </tr>
              </thead>
              <tbody>
                {polozky.map((p: any) => {
                  const zostava = zostavaVybavit(p);
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        {p.name}
                        {p.description && (
                          <div className="text-xs text-muted-foreground">{p.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatujMnozstvo(p.quantity, lokalJazyka(jazyk))} {p.unit}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatujMnozstvo(p.invoiced_quantity, lokalJazyka(jazyk))}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums ${zostava > 0 ? "font-medium" : "text-emerald-700"}`}
                      >
                        {zostava > 0 ? zostava : t("vybavené")}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{suma(p.unit_price)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {suma(Number(p.quantity) * Number(p.unit_price))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Faktúry z objednávky */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-sm font-medium">{t("Faktúry z tejto objednávky")}</div>
            {(o.faktury ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("Zatiaľ žiadna. Tlačidlo „Vyfakturovať\" prenesie do novej faktúry to, čo ešte zostáva.")}
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {o.faktury.map((f: any) => (
                  <li key={f.id} className="flex items-center justify-between">
                    <Link
                      to="/faktury/$id"
                      params={{ id: f.id }}
                      className="text-primary hover:underline"
                    >
                      {f.invoice_number}
                    </Link>
                    <span className="text-muted-foreground">
                      {datum(f.issue_date)} · {suma(f.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <PrilohyFaktury druh="sales_order" dokladId={id} mozeMenit={stav !== "cancelled"} />

        </div>
      </PageBody>
    </>
  );
}

function Karta({ popis, children }: { popis: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{popis}</div>
      <div className="mt-1 text-lg font-medium tabular-nums">{children}</div>
    </div>
  );
}

function Udaj({ popis, children }: { popis: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{popis}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
