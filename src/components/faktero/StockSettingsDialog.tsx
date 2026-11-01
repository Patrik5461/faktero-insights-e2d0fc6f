import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import {
  listCategoriesWithCounts,
  createStockCategory,
  updateStockCategory,
  deleteStockCategory,
} from "@/lib/faktero/stock.functions";
import { toast } from "sonner";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { Plus, Pencil, Trash2, Tags, Warehouse as WarehouseIcon, X } from "lucide-react";
import { potvrd } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { StavOdznak } from "@/components/faktero/web/Stav";

const PALETTE = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];

export function StockSettingsDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}) {
  const { t } = useT();
  const [tab, setTab] = useState<"kategorie" | "sklady">("kategorie");
  useZatvorNaEscape(open ? () => onOpenChange(false) : null);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-[var(--w-prekrytie,rgb(0_0_0/0.4))] backdrop-blur-[2px]"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Nastavenia skladu")}
        className="w-full max-w-3xl rounded-2xl border border-border bg-popover p-0 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="text-lg font-semibold">{t("Nastavenia skladu")}</div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={t("Zavrieť")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-1 border-b border-border px-5 pt-3">
          <TabBtn
            active={tab === "kategorie"}
            onClick={() => setTab("kategorie")}
            icon={<Tags className="h-3.5 w-3.5" />}
          >
            {t("Kategórie")}
          </TabBtn>
          <TabBtn
            active={tab === "sklady"}
            onClick={() => setTab("sklady")}
            icon={<WarehouseIcon className="h-3.5 w-3.5" />}
          >
            {t("Sklady")}
          </TabBtn>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {tab === "kategorie" ? (
            <CategoriesTab onChanged={onChanged} />
          ) : (
            <WarehousesTab onChanged={onChanged} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function CategoriesTab({ onChanged }: { onChanged?: () => void }) {
  const { t } = useT();
  const listFn = useServerFn(listCategoriesWithCounts);
  const createFn = useServerFn(createStockCategory);
  const updateFn = useServerFn(updateStockCategory);
  const deleteFn = useServerFn(deleteStockCategory);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  useZatvorNaEscape(editing ? () => setEditing(null) : null);
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

  function reset() {
    setEditing(null);
    setName("");
    setColor("");
    setNote("");
  }

  async function save() {
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
      reset();
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Chyba"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, count: number) {
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
      onChanged?.();
    } catch (e: any) {
      toast.error(t(e?.message ?? "Chyba"));
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_18rem]">
      <div className="min-w-0 self-start overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">{t("Kategória")}</th>
              <th className="p-2 text-right">{t("Produkty")}</th>
              <th className="p-2">
                <span className="sr-only">{t("Akcie")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-muted-foreground">
                  {t("Načítavam…")}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-muted-foreground">
                  {t("Žiadne kategórie.")}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-2">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-border"
                      style={{ background: r.color ?? "transparent" }}
                    />
                    <span className="break-words font-medium">{r.name}</span>
                  </span>
                </td>
                <td className="p-2 text-right font-medium tabular-nums">{r.product_count}</td>
                <td className="p-2 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => {
                        setEditing(r);
                        setName(r.name);
                        setColor(r.color ?? "");
                        setNote(r.note ?? "");
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title={t("Upraviť")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(r.id, r.product_count)}
                      className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
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
      <div className="self-start rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-semibold">
          {editing ? t("Upraviť") : t("Nová kategória")}
        </div>
        <label className="block text-sm font-semibold">{t("Názov")}</label>
        <input
          aria-label={t("Názov")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder={t("napr. Elektro")}
        />
        <label className="mt-3 block text-sm font-semibold">{t("Farba")}</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            onClick={() => setColor("")}
            className={`h-6 w-6 rounded-full border ${color === "" ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : "border-border"}`}
            title={t("Bez farby")}
          />
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full border border-border ${color === c ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <label className="mt-3 block text-sm font-semibold">
          {t("Poznámka")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="mt-3 flex gap-2">
          <button
            disabled={busy || !name.trim()}
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            {editing ? t("Uložiť") : t("Vytvoriť")}
          </button>
          {editing && (
            <button
              onClick={reset}
              className="rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold hover:bg-accent"
            >
              {t("Zrušiť")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type WH = { id?: string; name: string; address?: string | null; active: boolean };
const EMPTY_WH: WH = { name: "", address: "", active: true };

function WarehousesTab({ onChanged }: { onChanged?: () => void }) {
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
    if (error) return toast.error(error.message);
    toast.success(t("Uložené"));
    setEditing(null);
    load();
    onChanged?.();
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setEditing(EMPTY_WH)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          <Plus className="h-3.5 w-3.5" /> {t("Nový sklad")}
        </button>
      </div>
      <div className="min-w-0 self-start overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">{t("Názov")}</th>
              <th className="p-2">{t("Adresa")}</th>
              <th className="p-2">{t("Stav")}</th>
              <th>
                <span className="sr-only">{t("Akcie")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  {t("Načítavam…")}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  {t("Žiadne sklady.")}
                </td>
              </tr>
            )}
            {rows.map((w) => (
              <tr key={w.id}>
                <td className="break-words p-2 font-medium">{w.name}</td>
                <td className="break-words p-2 text-muted-foreground">{w.address ?? "—"}</td>
                <td className="p-2">
                  {w.active ? (
                    <StavOdznak ton="uspech" maly>{t("Aktívny")}</StavOdznak>
                  ) : (
                    <StavOdznak ton="neutralny" maly>{t("Neaktívny")}</StavOdznak>
                  )}
                </td>
                <td className="p-2 text-right">
                  <button
                    onClick={() => setEditing(w)}
                    aria-label={t("Upraviť")}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center p-4 bg-[var(--w-prekrytie,rgb(0_0_0/0.4))] backdrop-blur-[2px]"
          onClick={() => setEditing(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("Sklad")}
            className="w-full max-w-lg rounded-2xl border border-border bg-popover p-5 shadow-2xl sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
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
              className="mt-4 grid gap-3"
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
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                {t("Aktívny")}
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-md border border-input bg-card px-4 py-2 text-sm font-semibold hover:bg-accent"
                >
                  {t("Zrušiť")}
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  {t("Uložiť")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
