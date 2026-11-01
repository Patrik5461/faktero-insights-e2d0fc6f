import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listTransfers } from "@/lib/faktero/stock.functions";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { ArrowRightLeft, Plus } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { StavOdznak, tonStavu, type TonStavu } from "@/components/faktero/web/Stav";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { KlikatelnyRiadok } from "@/components/faktero/KlikatelnyRiadok";
import { EmptyState } from "@/components/faktero/ListControls";

export const Route = createFileRoute("/_authenticated/sklad/presuny/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Presuny — Faktero") }] }),
  component: TransfersListPage,
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

function TransfersListPage() {
  const { t } = useT();
  const fetchList = useServerFn(listTransfers);
  const [rows, setRows] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Record<string, string>>({});
  const [companies, setCompanies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;
    (async () => {
      setLoading(true);
      const [list, whRes, coRes] = await Promise.all([
        fetchList({ data: { company_id: cid } }),
        supabase.from("warehouses").select("id, name"),
        supabase.from("companies").select("id, name"),
      ]);
      const wm: Record<string, string> = {};
      (whRes.data ?? []).forEach((w: any) => {
        wm[w.id] = w.name;
      });
      const cm: Record<string, string> = {};
      (coRes.data ?? []).forEach((c: any) => {
        cm[c.id] = c.name;
      });
      setWarehouses(wm);
      setCompanies(cm);
      setRows(list ?? []);
      setLoading(false);
    })();
  }, [fetchList]);

  return (
    <>
      <PageHeader
        title={t("Presuny skladu")}
        description={t("Presúvajte tovar medzi skladmi alebo firmami")}
        action={
          <Link
            to="/sklad/presuny/nova"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" /> {t("Nový presun")}
          </Link>
        }
      />
      <PageBody>
        {loading ? (
          <div className="rounded-xl border border-border bg-card">
            <NacitavanieStav />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-14 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl border border-border bg-card text-primary shadow-sm">
              <ArrowRightLeft className="h-5 w-5" aria-hidden />
            </div>
            {t("Zatiaľ nemáte žiadne presuny.")}{" "}
            <Link className="font-semibold text-primary underline" to="/sklad/presuny/nova">
              {t("Vytvorte prvý")}
            </Link>
            .
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">{t("Vytvorený")}</th>
                  <th className="p-3">{t("Zo skladu")}</th>
                  <th className="p-3">{t("presun::Do")}</th>
                  <th className="p-3">{t("Stav")}</th>
                  <th className="p-3">{t("Poznámka")}</th>
                  <th className="p-3">
                    <span className="sr-only">{t("Akcie")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <KlikatelnyRiadok key={r.id} ciel={{ to: "/sklad/presuny/$id", params: { id: r.id } }}>
                    <td className="whitespace-nowrap p-3 tabular-nums">{new Date(r.created_at).toLocaleString("sk-SK")}</td>
                    <td className="p-3 font-medium">{warehouses[r.warehouse_from_id] ?? "—"}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5">
                        <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {r.target_company_id
                          ? `${companies[r.target_company_id] ?? t("Iná firma")}${r.warehouse_to_id ? ` · ${warehouses[r.warehouse_to_id] ?? ""}` : ""}`
                          : (warehouses[r.warehouse_to_id] ?? "—")}
                      </span>
                    </td>
                    <td className="p-3">
                      <StavOdznak ton={tonStavu(TON_PRESUNU, r.status)}>
                        {t(STATUS_LABEL[r.status] ?? r.status)}
                      </StavOdznak>
                    </td>
                    <td className="max-w-[240px] truncate p-3 text-muted-foreground">
                      {r.note ?? ""}
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        to="/sklad/presuny/$id"
                        params={{ id: r.id }}
                        className="font-semibold text-primary hover:underline"
                      >
                        {t("Detail")}
                      </Link>
                    </td>
                  </KlikatelnyRiadok>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}
