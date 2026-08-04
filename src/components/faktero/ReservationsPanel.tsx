import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, XCircle } from "lucide-react";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { supabase } from "@/integrations/supabase/client";
import {
  createManualReservation,
  cancelReservation,
  listReservationsForItem,
} from "@/lib/faktero/reservations.functions";

const SRC_LABEL: Record<string, string> = {
  quote: "Ponuka",
  order: "Objednávka",
  invoice_deferred: "Faktúra (odložený výdaj)",
  manual: "Ručná",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Aktívna",
  fulfilled: "Splnená",
  cancelled: "Zrušená",
};

export function ReservationsPanel({
  companyId,
  stockItemId,
  unit,
}: {
  companyId: string;
  stockItemId: string;
  unit?: string | null;
}) {
  const listFn = useServerFn(listReservationsForItem);
  const cancelFn = useServerFn(cancelReservation);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await listFn({ data: { company_id: companyId, stock_item_id: stockItemId } });
      setRows(r as any[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba načítania rezervácií.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [stockItemId]);

  async function doCancel(id: string) {
    if (!confirm("Zrušiť rezerváciu?")) return;
    try {
      await cancelFn({ data: { company_id: companyId, id } });
      toast.success("Rezervácia zrušená.");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba.");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Rezervácie</div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary"
        >
          <Plus className="h-3.5 w-3.5" /> Rezervovať ručne
        </button>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Načítavam…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">Žiadne rezervácie.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-2">Zdroj</th>
              <th className="p-2 text-right">Množstvo</th>
              <th className="p-2">Stav</th>
              <th className="p-2">Expiruje</th>
              <th className="p-2">Poznámka</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className={r.status !== "active" ? "opacity-60" : ""}>
                <td className="p-2">
                  {r.source_document_type === "quote" && r.source_document_id ? (
                    <Link
                      to="/ponuky/$id"
                      params={{ id: r.source_document_id }}
                      className="text-primary hover:underline"
                    >
                      {SRC_LABEL[r.source_document_type]}
                    </Link>
                  ) : (
                    (SRC_LABEL[r.source_document_type] ?? r.source_document_type)
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {Number(r.quantity).toFixed(2)} {unit ?? ""}
                </td>
                <td className="p-2 text-xs">{STATUS_LABEL[r.status] ?? r.status}</td>
                <td className="p-2 text-xs text-muted-foreground">
                  {r.expires_at ? new Date(r.expires_at).toLocaleDateString("sk-SK") : "—"}
                </td>
                <td className="p-2 text-xs text-muted-foreground">{r.note ?? "—"}</td>
                <td className="p-2 text-right">
                  {r.status === "active" && r.source_document_type === "manual" && (
                    <button
                      onClick={() => doCancel(r.id)}
                      className="inline-flex items-center gap-1 rounded p-1 text-destructive hover:bg-destructive/10"
                      title="Zrušiť"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && (
        <ManualReservationDialog
          companyId={companyId}
          stockItemId={stockItemId}
          unit={unit}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ManualReservationDialog({
  companyId,
  stockItemId,
  unit,
  onClose,
  onCreated,
}: {
  companyId: string;
  stockItemId: string;
  unit?: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const createFn = useServerFn(createManualReservation);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [qty, setQty] = useState("1");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("warehouses")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("created_at")
      .then(({ data }) => {
        setWarehouses(data ?? []);
        if (data?.[0]) setWarehouse(data[0].id);
      });
  }, [companyId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(qty);
    if (!warehouse || !(q > 0)) return toast.error("Vyplňte sklad a množstvo.");
    setBusy(true);
    try {
      await createFn({
        data: {
          company_id: companyId,
          stock_item_id: stockItemId,
          warehouse_id: warehouse,
          quantity: q,
          expires_at: expires || null,
          note: note || null,
        },
      });
      toast.success("Rezervácia vytvorená.");
      onCreated();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-xl border border-border bg-card p-5"
      >
        <div className="text-base font-semibold">Ručná rezervácia</div>
        <label className="block">
          <span className="text-sm font-medium">Sklad</span>
          <select
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Množstvo {unit ? `(${unit})` : ""}</span>
          <input
            type="number"
            step="0.001"
            min="0.001"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Platnosť do (voliteľné)</span>
          <input
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Poznámka</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
          >
            Zrušiť
          </button>
          <button
            disabled={busy}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Ukladám…" : "Rezervovať"}
          </button>
        </div>
      </form>
    </div>
  );
}
