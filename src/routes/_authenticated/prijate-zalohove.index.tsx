import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/faktero/ListControls";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { formatovacMeny, formatujMenu } from "@/lib/faktero/mena";
import { NahratDoklad } from "@/components/faktero/NahratDoklad";
import { datumNaDoklade } from "@/lib/faktero/faktura-jazyk";
import { DocumentListToolbar } from "@/components/faktero/DocumentListToolbar";
import { useListFilters, zoznamSearch } from "@/hooks/useListFilters";

export const Route = createFileRoute("/_authenticated/prijate-zalohove/")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Prijaté zálohové faktúry — Faktero") }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ...zoznamSearch(s) }),
  component: PrijateZalohovePage,
});

type Riadok = {
  id: string;
  invoice_number: string;
  supplier_name: string;
  issue_date: string;
  due_date: string;
  amount_total: number;
  currency: string;
  payment_date: string | null;
  status: string;
};

/**
 * Zálohové faktúry od dodávateľov.
 *
 * Nie sú daňové doklady: platia sa, ale daň prinesie až ostrá faktúra —
 * preto majú vlastný zoznam a do výkazov k DPH nevstupujú. Keď ostrá faktúra
 * zálohu zúčtuje, ukáže sa to tu ako „zúčtovaná“, aby sa tá istá dodávka
 * nezaplatila dvakrát.
 */
function PrijateZalohovePage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Riadok[]>([]);
  const [zuctovane, setZuctovane] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [mazane, setMazane] = useState<Riadok | null>(null);
  // Hľadanie a filtre sú v adrese; zoznam sa načíta celý a filtruje sa tu.
  const lf = useListFilters({ pageSizeKey: "prijate-zalohove" });

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setLoading(true);
    const { data } = await supabase
      .from("purchase_invoices")
      .select(
        "id, invoice_number, supplier_name, issue_date, due_date, amount_total, currency, payment_date, status",
      )
      .eq("company_id", cid)
      .eq("type", "proforma")
      .is("deleted_at", null)
      .order("issue_date", { ascending: false })
      .limit(500);
    const zoznam = (data ?? []) as Riadok[];
    setRows(zoznam);
    setLoading(false);

    const ids = zoznam.map((r) => r.id);
    if (!ids.length) {
      setZuctovane({});
      return;
    }
    const { data: faktury } = await supabase
      .from("purchase_invoices")
      .select("invoice_number, advance_invoice_id")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .in("advance_invoice_id", ids);
    const mapa: Record<string, string> = {};
    for (const f of (faktury ?? []) as any[]) {
      if (f.advance_invoice_id) mapa[f.advance_invoice_id] = f.invoice_number;
    }
    setZuctovane(mapa);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hladane = lf.q.trim().toLowerCase();
  const stav = lf.filter("stav");
  const podla = lf.filter("podla") === "splatnost" ? "due_date" : "issue_date";
  const { od: obdobieOd, do: obdobieDo } = lf.rozsah("obdobie");
  const zobrazene = useMemo(
    () =>
      rows.filter((r) => {
        if (
          hladane &&
          !`${r.invoice_number ?? ""} ${r.supplier_name ?? ""}`.toLowerCase().includes(hladane)
        )
          return false;
        // Stav rovnako ako odznak StavZalohy: zúčtovaná > zaplatená > čaká.
        const s = zuctovane[r.id] ? "zuctovana" : r.payment_date ? "zaplatena" : "caka";
        if (stav && s !== stav) return false;
        const d = r[podla];
        if (obdobieOd && (!d || d < obdobieOd)) return false;
        if (obdobieDo && (!d || d > obdobieDo)) return false;
        return true;
      }),
    [rows, zuctovane, hladane, stav, podla, obdobieOd, obdobieDo],
  );

  const fmt = useMemo(() => formatovacMeny("EUR"), []);
  const sucty = useMemo(() => {
    let spolu = 0;
    let nezaplatene = 0;
    for (const r of zobrazene) {
      spolu += Number(r.amount_total ?? 0);
      if (!r.payment_date && r.status !== "cancelled") nezaplatene += Number(r.amount_total ?? 0);
    }
    return { spolu, nezaplatene };
  }, [zobrazene]);

  async function zmaz() {
    if (!mazane) return;
    const { error } = await supabase
      .from("purchase_invoices")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", mazane.id);
    if (error) return toast.error(error.message);
    toast.success(t("Zálohová faktúra vymazaná"));
    setMazane(null);
    await load();
  }

  return (
    <>
      <PageHeader
        title={t("Prijaté zálohové faktúry")}
        description={t("Zálohy, ktoré vám vystavili dodávatelia. Platia sa, daň prinesie až ostrá faktúra.")}
        action={
          <div className="flex flex-wrap gap-2">
            <NahratDoklad druh="proforma" label={t("Nahrať zálohovú faktúru")} />
            <Link
              to="/prijate-faktury/nova"
              search={{ typ: "proforma" } as never}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> {t("Nová prijatá zálohová faktúra")}
            </Link>
          </div>
        }
      />
      <PageBody>
        <div className="grid gap-4 sm:grid-cols-3">
          <Statistika label={t("Počet záloh")} hodnota={String(zobrazene.length)} />
          <Statistika label={t("Celková suma")} hodnota={fmt(sucty.spolu)} />
          <Statistika label={t("Nezaplatené")} hodnota={fmt(sucty.nezaplatene)} />
        </div>

        <div className="mt-6">
          <DocumentListToolbar
            lf={lf}
            searchPlaceholder="Hľadať dodávateľa alebo číslo"
            filters={[
              {
                key: "stav",
                label: "Stav",
                type: "select",
                options: [
                  { value: "caka", label: "Čaká na úhradu" },
                  { value: "zaplatena", label: "Zaplatená" },
                  { value: "zuctovana", label: "Zúčtovaná" },
                ],
              },
              {
                key: "obdobie",
                label: "Obdobie",
                type: "dateRange",
                dateFieldOptions: [
                  { value: "vystavenie", label: "dátumu vystavenia" },
                  { value: "splatnost", label: "dátumu splatnosti" },
                ],
              },
            ]}
          />
          {loading ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {t("Načítavam…")}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-10 text-center">
              <div className="font-medium">{t("Zatiaľ žiadna prijatá záloha")}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Zálohovú faktúru od dodávateľa zaevidujete rovnako ako bežnú — pri druhu dokladu vyberiete „Prijatá zálohová faktúra“.")}
              </p>
            </div>
          ) : zobrazene.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {t("Nič sa nenašlo.")}
            </div>
          ) : (
            <ResponsiveTable
              items={zobrazene}
              loading={loading}
              emptyText={t("Zatiaľ žiadna prijatá záloha.")}
              desktop={
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-foreground">
                        <th className="p-3">{t("Číslo")}</th>
                        <th className="p-3">{t("Dodávateľ")}</th>
                        <th className="p-3">{t("Vystavená")}</th>
                        <th className="p-3">{t("Splatnosť")}</th>
                        <th className="p-3 text-right">{t("Suma")}</th>
                        <th className="p-3">{t("Stav")}</th>
                        <th className="p-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {zobrazene.map((r) => (
                        <tr
                          key={r.id}
                          onClick={() =>
                            navigate({ to: "/prijate-faktury/$id", params: { id: r.id } })
                          }
                          className="cursor-pointer border-b border-border/60 hover:bg-muted/40"
                        >
                          <td className="p-3 font-medium">{r.invoice_number}</td>
                          <td className="p-3">{r.supplier_name}</td>
                          <td className="p-3">{datumNaDoklade(r.issue_date)}</td>
                          <td className="p-3">{datumNaDoklade(r.due_date)}</td>
                          <td className="p-3 text-right tabular-nums">
                            {formatujMenu(r.amount_total, r.currency)}
                          </td>
                          <td className="p-3">
                            <StavZalohy riadok={r} zuctovanaNa={zuctovane[r.id]} />
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMazane(r);
                              }}
                              className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title={t("Vymazať")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
              mobileCard={(r: Riadok) => (
                <MobileListCard
                  key={r.id}
                  onClick={() => navigate({ to: "/prijate-faktury/$id", params: { id: r.id } })}
                  title={r.invoice_number}
                  subtitle={r.supplier_name}
                  amount={formatujMenu(r.amount_total, r.currency)}
                  status={<StavZalohy riadok={r} zuctovanaNa={zuctovane[r.id]} />}
                  meta={t("splatná {datum}", { datum: datumNaDoklade(r.due_date) })}
                />
              )}
            />
          )}
        </div>

        <ConfirmDialog
          open={!!mazane}
          title={t("Vymazať zálohovú faktúru?")}
          message={
            mazane
              ? t("{cislo} od {dodavatel} sa skryje zo zoznamu.", {
                  cislo: mazane.invoice_number,
                  dodavatel: mazane.supplier_name,
                })
              : ""
          }
          confirmLabel={t("Vymazať")}
          onConfirm={zmaz}
          onCancel={() => setMazane(null)}
        />
      </PageBody>
    </>
  );
}

function StavZalohy({ riadok, zuctovanaNa }: { riadok: Riadok; zuctovanaNa?: string }) {
  const { t } = useT();
  if (zuctovanaNa) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
        {t("Zúčtovaná — {cislo}", { cislo: zuctovanaNa })}
      </span>
    );
  }
  if (riadok.payment_date) {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">
        {t("Zaplatená")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
      {t("Čaká na úhradu")}
    </span>
  );
}

function Statistika({ label, hodnota }: { label: string; hodnota: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{hodnota}</div>
    </div>
  );
}
