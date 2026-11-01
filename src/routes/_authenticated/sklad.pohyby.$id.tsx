import { createFileRoute, Link } from "@tanstack/react-router";
import {
  hodnotaPohybu,
  nakladovaCenaPohybu,
  pohybDelta,
  pohybText,
} from "@/lib/faktero/stock-pohyb";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { getMovementDetail } from "@/lib/faktero/stock.functions";
import { useMenaFirmy } from "@/lib/faktero/krajina-firmy";
import { formatujJednotkovuCenu, formatujMenu } from "@/lib/faktero/mena";
import { useT } from "@/lib/i18n/useT";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { EmptyState } from "@/components/faktero/ListControls";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/sklad/pohyby/$id")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Detail pohybu — Faktero") }],
  }),
  component: MovementDetail,
});

const TYPE_LABEL: Record<string, string> = {
  prijem: "Príjem",
  vydaj: "Výdaj",
  oprava: "Oprava",
  inventura: "Inventúra",
  faktura: "Faktúra",
  dobropis: "Dobropis",
};
/** Nadpis stránky podľa typu pohybu — „Pohyb Príjem“ nie je veta. */
const NADPIS: Record<string, string> = {
  prijem: "Príjem na sklad",
  vydaj: "Výdaj zo skladu",
  oprava: "Oprava stavu skladu",
  inventura: "Inventúrny rozdiel",
  faktura: "Výdaj faktúrou",
  dobropis: "Vrátenie na sklad dobropisom",
};
const SHOW_STOCK_DEBUG =
  import.meta.env.DEV ||
  (typeof window !== "undefined" && window.location.hostname.includes("lovable"));

function MovementDetail() {
  const { t } = useT();
  const mena = useMenaFirmy();
  const { id } = Route.useParams();
  const fetchDetail = useServerFn(getMovementDetail);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    fetchDetail({ data: { company_id: cid, movement_id: id } })
      .then((d) => {
        if (SHOW_STOCK_DEBUG)
          console.info("[sklad-debug:movement-detail:success]", {
            company_id: cid,
            movement_id: id,
            result: d,
          });
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (SHOW_STOCK_DEBUG)
          console.error("[sklad-debug:movement-detail:error]", {
            company_id: cid,
            movement_id: id,
            error: e,
          });
        setError(e?.message ?? String(e));
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [id, fetchDetail]);

  if (loading)
    return (
      <PageBody>
        <NacitavanieStav />
      </PageBody>
    );
  if (!data?.movement)
    return (
      <PageBody>
        <div className="rounded-xl border border-border bg-card">
          <EmptyState title="Pohyb sa nenašiel." />
        </div>
        {SHOW_STOCK_DEBUG && error && (
          <pre className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </pre>
        )}
      </PageBody>
    );

  const m = data.movement;
  return (
    <>
      <PageHeader
        title={
          NADPIS[m.type]
            ? t(NADPIS[m.type])
            : t("Skladový pohyb — {typ}", { typ: t(TYPE_LABEL[m.type] ?? m.type) })
        }
        description={new Date(m.created_at).toLocaleString("sk-SK")}
      />
      <PageBody>
        <div className="grid max-w-5xl gap-4 md:grid-cols-2 md:gap-6">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <dl className="grid gap-4 text-sm">
              <Pair label="Typ pohybu" value={t(TYPE_LABEL[m.type] ?? m.type)} />
              <Pair
                label="Množstvo"
                value={pohybText(m.type, m.quantity)}
                accent={
                  pohybDelta(m.type, m.quantity) >= 0
                    ? "suma text-[var(--stav-uspech-text)]"
                    : "suma text-destructive"
                }
              />
              {/* Nákladová cena ako v zozname pohybov; pri výdaji je `unit_price`
                  predajná a ukáže sa zvlášť (SA-06). */}
              <Pair
                label="Jednotková cena"
                value={formatujJednotkovuCenu(nakladovaCenaPohybu(m), mena.kod)}
                accent="suma"
              />
              <Pair
                label="Celková hodnota"
                value={formatujMenu(hodnotaPohybu(m), mena.kod)}
                accent="suma"
              />
              {(m.type === "vydaj" || m.type === "faktura") &&
                Number(m.unit_cost) > 0 &&
                Number(m.unit_price) > 0 &&
                Math.abs(Number(m.unit_price) - Number(m.unit_cost)) > 1e-9 && (
                  <Pair
                    label="Predajná cena"
                    value={formatujJednotkovuCenu(m.unit_price, mena.kod)}
                    accent="suma"
                  />
                )}
              <Pair label="Sklad" value={data.warehouse?.name ?? "—"} />
              <Pair
                label="Skladová karta"
                value={
                  data.product ? (
                    <Link
                      to="/sklad/produkty/$id"
                      params={{ id: data.product.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {data.product.name}
                    </Link>
                  ) : (
                    (data.stockItem?.sku ?? "—")
                  )
                }
              />
            </dl>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <dl className="grid gap-4 text-sm">
              <Pair label="Vytvoril" value={data.createdByEmail ?? "—"} accent="break-words" />
              <Pair
                label="Dátum vytvorenia"
                value={new Date(m.created_at).toLocaleString("sk-SK")}
                accent="whitespace-nowrap tabular-nums"
              />
              <Pair
                label="Referencia"
                value={
                  data.invoice ? (
                    <Link
                      to="/faktury/$id"
                      params={{ id: data.invoice.id }}
                      className="cislo-dokladu text-primary hover:underline"
                    >
                      {t("Faktúra {cislo}", { cislo: data.invoice.invoice_number })}
                    </Link>
                  ) : (
                    (m.reference_type ?? "—")
                  )
                }
              />
              <Pair
                label="Poznámka"
                value={m.note ?? "—"}
                accent="whitespace-pre-line break-words"
              />
            </dl>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Pair({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  const { t } = useT();
  return (
    <div>
      <dt className="text-xs font-semibold text-muted-foreground">{t(label)}</dt>
      <dd className={`mt-1 min-w-0 text-foreground ${accent ?? ""}`}>{value}</dd>
    </div>
  );
}
