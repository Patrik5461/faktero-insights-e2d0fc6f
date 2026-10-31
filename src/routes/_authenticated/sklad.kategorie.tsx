import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/faktero/plan-error";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listCategoriesWithCounts,
  createStockCategory,
  updateStockCategory,
  deleteStockCategory,
} from "@/lib/faktero/stock.functions";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tags, Ban } from "lucide-react";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/sklad/kategorie")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk, "Kategórie skladu — Faktero") }],
  }),
  component: CategoriesPage,
});

/*
  Farba sa vyberá krúžkom, v ktorom nie je žiadny text — bez názvu je to pre
  čítačku obrazovky sedem rovnakých „tlačidiel" a nedá sa z nich vybrať.
*/
const PALETTE: { kod: string; nazov: string }[] = [
  { kod: "#ef4444", nazov: "červená" },
  { kod: "#f59e0b", nazov: "oranžová" },
  { kod: "#10b981", nazov: "zelená" },
  { kod: "#3b82f6", nazov: "modrá" },
  { kod: "#8b5cf6", nazov: "fialová" },
  { kod: "#ec4899", nazov: "ružová" },
  { kod: "#64748b", nazov: "sivá" },
];

function CategoriesPage() {
  const { t } = useT();
  const listFn = useServerFn(listCategoriesWithCounts);
  const createFn = useServerFn(createStockCategory);
  const updateFn = useServerFn(updateStockCategory);
  const deleteFn = useServerFn(deleteStockCategory);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const cid = getActiveCompanyId();
    if (!cid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await listFn({ data: { company_id: cid } }));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setEditing(null);
    setName("");
    setColor("");
    setNote("");
  }

  async function onSave() {
    const cid = getActiveCompanyId();
    if (!cid || !name.trim()) return;
    setBusy(true);
    try {
      if (editing) {
        await updateFn({
          data: {
            company_id: cid,
            category_id: editing.id,
            name: name.trim(),
            color: color || null,
            note: note || null,
          },
        });
        toast.success(t("Kategória upravená"));
      } else {
        await createFn({
          data: { company_id: cid, name: name.trim(), color: color || null, note: note || null },
        });
        toast.success(t("Kategória vytvorená"));
      }
      resetForm();
      await load();
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string, count: number) {
    if (
      count > 0 &&
      !(await potvrd(
        t("Kategória má {n} produktov. Naozaj zmazať? Produkty zostanú bez kategórie.", {
          n: count,
        }),
      ))
    )
      return;
    if (count === 0 && !(await potvrd(t("Zmazať kategóriu?")))) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    try {
      await deleteFn({ data: { company_id: cid, category_id: id } });
      toast.success(t("Kategória zmazaná"));
      await load();
    } catch (e: any) {
      toast.error(friendlyError(e));
    }
  }

  function startEdit(r: any) {
    setEditing(r);
    setName(r.name);
    setColor(r.color ?? "");
    setNote(r.note ?? "");
  }

  return (
    <>
      <PageHeader
        title={t("Kategórie skladu")}
        description={t("Rozdeľte produkty do kategórií pre lepší prehľad a filtrovanie.")}
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">{t("Kategória")}</th>
                  <th className="p-3">{t("Poznámka")}</th>
                  <th className="p-3 text-right">{t("Produkty")}</th>
                  <th className="p-3">
                    <span className="sr-only">{t("Akcie")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      {t("Načítavam…")}
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      <Tags className="mx-auto mb-2 h-6 w-6 opacity-40" />
                      {t("Žiadne kategórie. Vytvorte prvú vo formulári.")}
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full border border-border"
                          style={{ background: r.color ?? "transparent" }}
                        />
                        <span className="font-medium">{r.name}</span>
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{r.note ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{r.product_count}</td>
                    <td className="p-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => startEdit(r)}
                          className="rounded-md border border-border p-1.5 hover:bg-muted"
                          title={t("Upraviť")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(r.id, r.product_count)}
                          className="rounded-md border border-border p-1.5 text-destructive hover:bg-destructive/10"
                          title={t("Zmazať")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">
              {editing ? t("Upraviť kategóriu") : t("Nová kategória")}
            </div>
            <label className="block text-xs font-medium text-muted-foreground">{t("Názov")}</label>
            <input
              aria-label={t("Názov")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={t("napr. Elektro")}
            />
            <label className="mt-3 block text-xs font-medium text-muted-foreground">
              {t("Farba")}
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {/* Bez farby — prečiarknutý krúžok, inak vyzeral ako biela farba. */}
              <button
                onClick={() => setColor("")}
                className={`grid h-7 w-7 place-items-center rounded-full border border-dashed border-muted-foreground/60 text-muted-foreground ${color === "" ? "ring-2 ring-primary" : ""}`}
                title={t("Bez farby")}
                aria-label={t("Bez farby")}
                aria-pressed={color === ""}
              >
                <Ban className="h-4 w-4" />
              </button>
              {PALETTE.map((f) => (
                <button
                  key={f.kod}
                  onClick={() => setColor(f.kod)}
                  aria-label={t(f.nazov)}
                  title={t(f.nazov)}
                  aria-pressed={color === f.kod}
                  className={`h-7 w-7 rounded-full border border-border ${color === f.kod ? "ring-2 ring-primary" : ""}`}
                  style={{ background: f.kod }}
                />
              ))}
            </div>
            <label className="mt-3 block text-xs font-medium text-muted-foreground">
              {t("Poznámka")}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <button
                disabled={busy || !name.trim()}
                onClick={onSave}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                {editing ? t("Uložiť") : t("Vytvoriť")}
              </button>
              {editing && (
                <button
                  onClick={resetForm}
                  className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  {t("Zrušiť")}
                </button>
              )}
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}
