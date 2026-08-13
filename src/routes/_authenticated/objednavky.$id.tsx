import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
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
import { ArrowLeft, FileText, Pencil, Trash2, Ban, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/objednavky/$id")({
  head: () => ({ meta: [{ title: "Objednávka — Faktero" }] }),
  component: OrderDetail,
});

const FARBA: Record<StavPrijatejObjednavky, string> = {
  draft: "bg-muted text-muted-foreground",
  confirmed: "bg-blue-500/10 text-blue-600",
  partially_invoiced: "bg-amber-500/10 text-amber-600",
  completed: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function suma(n: unknown) {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(
    Number(n) || 0,
  );
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
      .catch((e: any) => setChyba(e?.message ?? "Objednávku sa nepodarilo načítať"))
      .finally(() => setLoading(false));
  }, [cid, id, nacitaj]);

  useEffect(nacitajDetail, [nacitajDetail]);

  if (loading) {
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">Načítavam…</div>
      </PageBody>
    );
  }
  if (chyba || !o) {
    return (
      <PageBody>
        <div className="rounded-xl border border-border bg-card p-6 text-sm">
          {chyba ?? "Objednávka sa nenašla."}{" "}
          <Link to="/objednavky" className="text-primary underline">
            Späť na zoznam
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
    if (otazka && !confirm(otazka)) return;
    try {
      await zmenStav({ data: { company_id: cid!, id, status: novy } });
      nacitajDetail();
      toast.success("Stav objednávky zmenený");
    } catch (e: any) {
      toast.error(e?.message ?? "Stav sa nepodarilo zmeniť");
    }
  }

  return (
    <>
      <PageHeader
        title={`${o.order_number} — ${o.customers?.name ?? o.customer_name ?? "bez odberateľa"}`}
        description={
          o.customer_order_number
            ? `Objednávka odberateľa č. ${o.customer_order_number}`
            : "Prijatá objednávka od odberateľa"
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/objednavky"
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" /> Späť
            </Link>
            {stav !== "completed" && stav !== "cancelled" && (
              <Link
                to="/objednavky/nova"
                search={{ id }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <Pencil className="h-4 w-4" /> Upraviť
              </Link>
            )}
            {stav === "draft" && (
              <button
                type="button"
                onClick={() => nastav("confirmed")}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Check className="h-4 w-4" /> Potvrdiť
              </button>
            )}
            {daSaFakturovat && (
              <Link
                to="/faktury/nova"
                search={{ sales_order: id }}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <FileText className="h-4 w-4" /> Vyfakturovať
              </Link>
            )}
          </div>
        }
      />
      <PageBody>
        <div className="space-y-4">
          {/* Prehľad */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Karta popis="Stav">
              <span className={`rounded-full px-2 py-0.5 text-sm ${FARBA[stav]}`}>
                {STAV_POPIS[stav]}
              </span>
            </Karta>
            <Karta popis="Hodnota objednávky">{suma(o.total)}</Karta>
            <Karta popis="Zostáva vyfakturovať">
              <span className={o.zostava > 0 ? "" : "text-emerald-600"}>{suma(o.zostava)}</span>
            </Karta>
            <Karta popis="Vybavené">
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
              Požadovaný termín {datum(o.requested_date)} už uplynul a objednávka nie je vybavená.
            </div>
          )}

          {/* Údaje */}
          <div className="rounded-xl border border-border bg-card p-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-3">
              <Udaj popis="Objednané">{datum(o.order_date)}</Udaj>
              <Udaj popis="Požadovaný termín">{datum(o.requested_date)}</Udaj>
              <Udaj popis="Zákazka">
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
                <Udaj popis="Vznikla z ponuky">
                  <Link
                    to="/ponuky/$id"
                    params={{ id: o.quote_id }}
                    className="text-primary hover:underline"
                  >
                    zobraziť ponuku
                  </Link>
                </Udaj>
              )}
              {o.reserve_stock && <Udaj popis="Sklad">tovar sa rezervuje</Udaj>}
            </dl>
            {o.note && <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{o.note}</p>}
          </div>

          {/* Položky */}
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium">Položka</th>
                  <th className="px-4 py-2 text-right font-medium">Objednané</th>
                  <th className="px-4 py-2 text-right font-medium">Vyfakturované</th>
                  <th className="px-4 py-2 text-right font-medium">Zostáva</th>
                  <th className="px-4 py-2 text-right font-medium">Cena</th>
                  <th className="px-4 py-2 text-right font-medium">Spolu</th>
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
                        {Number(p.quantity)} {p.unit}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {Number(p.invoiced_quantity)}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums ${zostava > 0 ? "font-medium" : "text-emerald-600"}`}
                      >
                        {zostava > 0 ? zostava : "vybavené"}
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
            <div className="mb-2 text-sm font-medium">Faktúry z tejto objednávky</div>
            {(o.faktury ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Zatiaľ žiadna. Tlačidlo „Vyfakturovať" prenesie do novej faktúry to, čo ešte
                zostáva.
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

          {/* Nebezpečné akcie */}
          <div className="flex flex-wrap gap-2">
            {stav !== "cancelled" && stav !== "completed" && (
              <button
                type="button"
                onClick={() =>
                  nastav(
                    "cancelled",
                    "Zrušiť objednávku? Rezervácie tovaru sa uvoľnia, objednávka ostane v zozname.",
                  )
                }
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                <Ban className="h-4 w-4" /> Zrušiť objednávku
              </button>
            )}
            {saDaZmazat(stav) && (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("Zmazať rozpracovanú objednávku?")) return;
                  try {
                    await zmaz({ data: { company_id: cid!, id } });
                    nav({ to: "/objednavky" });
                  } catch (e: any) {
                    toast.error(e?.message ?? "Objednávku sa nepodarilo zmazať");
                  }
                }}
                className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" /> Zmazať
              </button>
            )}
          </div>
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
