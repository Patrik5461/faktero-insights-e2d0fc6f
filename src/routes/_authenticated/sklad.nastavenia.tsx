import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { StavOdznak } from "@/components/faktero/web/Stav";
import { NacitavanieStav } from "@/components/faktero/web/StavyObsahu";
import { EmptyState } from "@/components/faktero/ListControls";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/sklad/nastavenia")({
  head: ({ match }) => ({ meta: [{ title: preloz(match.context.jazyk, "Sklady — Faktero") }] }),
  component: WarehousesPage,
});

type WH = { id?: string; name: string; address?: string | null; active: boolean };
const EMPTY: WH = { name: "", address: "", active: true };

function WarehousesPage() {
  const { t } = useT();
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<WH | null>(null);
  useZatvorNaEscape(editing ? () => setEditing(null) : null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) return;
    setLoading(true);
    const { data } = await supabase
      .from("warehouses")
      .select("*")
      .eq("company_id", cid)
      .order("created_at");
    // Prázdny zoznam sa tu nezapĺňa — otvorenie stránky nemá nič zapisovať
    // (čitateľovi bez práva zápisu to hlásilo chybu RLS). Sklad pridá
    // používateľ tlačidlom alebo ho založí prvý pohyb (SA-14).
    setRows(data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(w: WH) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const payload = { ...w, company_id: cid };
    const op = w.id
      ? supabase.from("warehouses").update(payload).eq("id", w.id)
      : supabase.from("warehouses").insert(payload);
    const { error } = await op;
    if (error) {
      // Jediné, čo tu človek reálne trafí, je rovnaký názov skladu.
      return toast.error(
        error.code === "23505"
          ? t("Sklad s týmto názvom už existuje.")
          : (error.message ?? t("Sklad sa nepodarilo uložiť.")),
      );
    }
    toast.success(t("Uložené"));
    setEditing(null);
    load();
  }

  /**
   * Sklad založený omylom sa nedal odstrániť vôbec. Mazať sa dá, kým v ňom nie
   * je pohyb, inventúra, presun ani zásoba — na to má databáza RESTRICT, tu ide
   * len o zrozumiteľný dôvod. Posledný sklad ostáva: bez neho si ho stránka pri
   * najbližšom otvorení aj tak vyrobí znova.
   */
  async function zmaz(w: any) {
    if (rows.length <= 1) {
      return toast.error(t("Aspoň jeden sklad musí ostať."));
    }
    const [{ count: pohyby }, { count: inventury }, { count: presuny }, { data: zasoby }] =
      await Promise.all([
        supabase
          .from("stock_movements")
          .select("id", { count: "exact", head: true })
          .eq("warehouse_id", w.id),
        supabase
          .from("inventory_counts")
          .select("id", { count: "exact", head: true })
          .eq("warehouse_id", w.id),
        supabase
          .from("stock_transfers")
          .select("id", { count: "exact", head: true })
          .or(`warehouse_from_id.eq.${w.id},warehouse_to_id.eq.${w.id}`),
        supabase.from("stock_levels").select("quantity").eq("warehouse_id", w.id).gt("quantity", 0),
      ]);
    const drzi = [
      pohyby && t("pohyby ({n})", { n: pohyby }),
      inventury && t("inventúry ({n})", { n: inventury }),
      presuny && t("presuny ({n})", { n: presuny }),
      zasoby?.length && t("zásoba na {n} kartách", { n: zasoby.length }),
    ].filter(Boolean);
    if (drzi.length) {
      return toast.error(
        t("Sklad sa nedá zmazať, sú v ňom {co}. Namiesto toho ho nastavte ako neaktívny.", {
          co: drzi.join(", "),
        }),
      );
    }
    if (!(await potvrd(t("Naozaj zmazať sklad {nazov}?", { nazov: w.name })))) return;
    const { error } = await supabase.from("warehouses").delete().eq("id", w.id);
    if (error) return toast.error(error.message);
    toast.success(t("Sklad zmazaný"));
    load();
  }

  return (
    <>
      <PageHeader
        title={t("Sklady")}
        description={t("Spravujte sklady vašej firmy.")}
        action={
          <button
            onClick={() => setEditing(EMPTY)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t("Nový sklad")}
          </button>
        }
      />
      <PageBody>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="p-3">{t("Názov")}</th>
                <th className="p-3">{t("Adresa")}</th>
                <th className="p-3">{t("Stav")}</th>
                <th>
                  <span className="sr-only">{t("Akcie")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={4} className="p-0">
                    <NacitavanieStav />
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-0">
                    <EmptyState title="Žiadne sklady." />
                  </td>
                </tr>
              )}
              {rows.map((w) => (
                <tr key={w.id}>
                  <td className="p-3 min-w-[8rem] font-medium break-words">{w.name}</td>
                  <td className="p-3 min-w-[10rem] break-words text-muted-foreground">
                    {w.address ?? "—"}
                  </td>
                  <td className="p-3">
                    {w.active ? (
                      <StavOdznak ton="uspech">{t("Aktívny")}</StavOdznak>
                    ) : (
                      <StavOdznak ton="neutralny">{t("Neaktívny")}</StavOdznak>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap text-right">
                    <button
                      onClick={() => setEditing(w)}
                      title={t("Upraviť sklad")}
                      aria-label={t("Upraviť sklad")}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => zmaz(w)}
                      title={t("Zmazať sklad")}
                      aria-label={t("Zmazať sklad")}
                      className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>

      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[var(--w-prekrytie)] p-4 backdrop-blur-[2px]"
          onClick={() => setEditing(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("Sklad")}
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-[var(--w-tien-okno)] sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              {editing.id ? t("Upraviť sklad") : t("Nový sklad")}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(editing);
              }}
              className="mt-4 grid gap-4"
            >
              <label className="block">
                <span className="text-sm font-semibold">{t("Názov *")}</span>
                <input
                  required
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">{t("Adresa")}</span>
                <input
                  value={editing.address ?? ""}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                {t("Aktívny")}
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-md border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-secondary"
                >
                  {t("Zrušiť")}
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  {t("Uložiť")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
