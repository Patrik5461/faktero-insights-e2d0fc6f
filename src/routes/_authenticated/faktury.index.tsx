import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { StatusBadge } from "./dashboard";
import {
  Plus,
  FileCode2,
  Loader2,
  Trash2,
  RotateCcw,
  Copy,
  Bell,
  CheckCircle2,
  Mail,
  CalendarPlus,
  Archive,
  X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { exportInvoicesFn } from "@/lib/faktero/export.functions";
import { cloneInvoiceFn } from "@/lib/faktero/invoice-clone.functions";
import { bulkMarkPaidFn } from "@/lib/faktero/invoice-bulk.functions";
import { sendInvoiceEmailFn } from "@/lib/faktero/email.functions";
import { sendReminderFn } from "@/lib/faktero/reminders.functions";
import { generateInvoicePdf } from "@/lib/faktero/pdf.functions";
import { toast } from "sonner";
import { usePagedList } from "@/hooks/usePagedList";
import {
  Pagination,
  PageSizeSelect,
  ConfirmDialog,
  BulkBar,
  DeletedToggle,
} from "@/components/faktero/ListControls";
import { ResponsiveTable, MobileListCard } from "@/components/faktero/ResponsiveTable";
import { supabase } from "@/integrations/supabase/client";

type BulkAction = null | "paid" | "email" | "clone" | "reminder" | "zip";

/** Filtre z menu (Dobropisy, Koncepty) a `q` z vyhľadávania v hlavičke. */
type InvoiceSearch = { type?: "credit"; status?: "draft"; q?: string };

export const Route = createFileRoute("/_authenticated/faktury/")({
  head: () => ({ meta: [{ title: "Faktúry — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>): InvoiceSearch => ({
    type: s.type === "credit" ? "credit" : undefined,
    status: s.status === "draft" ? "draft" : undefined,
    q: typeof s.q === "string" && s.q.trim() ? s.q : undefined,
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const { type, status, q } = Route.useSearch();
  // V databáze je dobropis `credit_note`; v adrese je kratšie `credit`.
  const equals = useMemo(
    () => ({
      ...(type === "credit" ? { type: "credit_note" } : {}),
      ...(status === "draft" ? { status: "draft" } : {}),
    }),
    [type, status],
  );
  const list = usePagedList({
    resource: "invoices",
    searchColumns: ["invoice_number", "customer_name", "customer_ico"],
    equals: Object.keys(equals).length ? equals : undefined,
  });
  // Hľadanie z hlavičky príde ako `?q=`. Prepíšeme ním hľadacie pole zoznamu,
  // aby bolo vidieť, čo sa hľadá, a dalo sa to odtiaľ upraviť.
  const setListSearch = list.setSearch;
  useEffect(() => {
    if (q) setListSearch(q);
  }, [q, setListSearch]);
  const [busy, setBusy] = useState(false);
  const [rowDelete, setRowDelete] = useState<any | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [reminderMap, setReminderMap] = useState<Record<string, number>>({});
  const [overdueNoReminder, setOverdueNoReminder] = useState(false);
  const exportFn = useServerFn(exportInvoicesFn);
  const cloneFn = useServerFn(cloneInvoiceFn);
  const markPaidFn = useServerFn(bulkMarkPaidFn);
  const emailFn = useServerFn(sendInvoiceEmailFn);
  const reminderFn = useServerFn(sendReminderFn);
  const pdfFn = useServerFn(generateInvoicePdf);

  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    const ids = list.rows.map((r: any) => r.id);
    if (ids.length === 0) {
      setReminderMap({});
      return;
    }
    supabase
      .from("invoice_reminders")
      .select("invoice_id, reminder_number")
      .in("invoice_id", ids)
      .eq("status", "sent")
      .then(({ data }) => {
        const m: Record<string, number> = {};
        for (const r of data ?? []) {
          const n = (r as any).reminder_number as number;
          const id = (r as any).invoice_id as string;
          if (!m[id] || m[id] < n) m[id] = n;
        }
        setReminderMap(m);
      });
  }, [list.rows]);

  const today = new Date().toISOString().slice(0, 10);
  const visibleRows = useMemo(() => {
    if (!overdueNoReminder) return list.rows;
    return list.rows.filter(
      (r: any) =>
        (r.status === "issued" || r.status === "sent") &&
        r.due_date &&
        r.due_date < today &&
        !r.paid_at &&
        !reminderMap[r.id],
    );
  }, [list.rows, overdueNoReminder, reminderMap, today]);

  async function cloneRow(invoiceId: string) {
    try {
      const r = await cloneFn({ data: { invoiceId } });
      toast.success("Faktúra bola skopírovaná");
      window.location.href = `/faktury/${r.id}/upravit`;
    } catch (e: any) {
      toast.error(e?.message ?? "Klonovanie zlyhalo");
    }
  }

  const sensitiveSelected = list.rows.filter(
    (r) => list.selected[r.id] && (r.status === "paid" || r.status === "sent"),
  ).length;

  async function bulkExport() {
    const cid = getActiveCompanyId();
    if (!cid || !list.selectedIds.length) return;
    setBusy(true);
    try {
      const r = await exportFn({
        data: { companyId: cid, invoiceIds: list.selectedIds, format: "pohoda_xml" },
      });
      const blob = new Blob([r.content], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exportovaných ${r.invoiceCount} faktúr`);
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? "Export zlyhal");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRowDelete() {
    if (!rowDelete) return;
    try {
      await list.softDelete([rowDelete.id]);
      toast.success("Faktúra vymazaná");
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setRowDelete(null);
    }
  }
  async function confirmBulkDelete() {
    try {
      await list.softDelete(list.selectedIds);
      toast.success(`Vymazaných ${list.selectedIds.length} faktúr`);
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBulkDelete(false);
    }
  }
  async function bulkRestoreNow() {
    try {
      await list.restore(list.selectedIds);
      toast.success("Obnovené");
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }

  const selectedRows = useMemo(
    () => list.rows.filter((r: any) => list.selected[r.id]),
    [list.rows, list.selected],
  );
  const emailableCount = selectedRows.filter(
    (r: any) => (r.status === "issued" || r.status === "sent") && r.customer_email,
  ).length;
  const overdueSelectedCount = selectedRows.filter(
    (r: any) =>
      (r.status === "issued" || r.status === "sent") &&
      r.due_date &&
      r.due_date < today &&
      !r.paid_at,
  ).length;

  async function runBulkPaid() {
    setBusy(true);
    setBulkAction(null);
    try {
      const r = await markPaidFn({ data: { invoiceIds: list.selectedIds } });
      toast.success(
        r.skipped > 0
          ? `${r.updated} faktúr označených ako zaplatené (${r.skipped} preskočených)`
          : `${r.updated} faktúr označených ako zaplatené`,
      );
      list.clearSelection();
      list.reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Označenie zlyhalo");
    } finally {
      setBusy(false);
    }
  }

  async function runBulkEmail() {
    setBulkAction(null);
    const targets = selectedRows.filter(
      (r: any) => (r.status === "issued" || r.status === "sent") && r.customer_email,
    );
    if (!targets.length) {
      toast.error("Žiadne odosielateľné faktúry (chýba email alebo nesprávny stav).");
      return;
    }
    setBusy(true);
    setProgress({ current: 0, total: targets.length });
    let ok = 0,
      fail = 0;
    for (let i = 0; i < targets.length; i++) {
      const inv = targets[i];
      try {
        await emailFn({ data: { invoiceId: inv.id, recipient_email: inv.customer_email } });
        ok++;
      } catch (e) {
        console.error("bulk email failed", inv.id, e);
        fail++;
      }
      setProgress({ current: i + 1, total: targets.length });
    }
    setProgress(null);
    setBusy(false);
    if (fail === 0) toast.success(`Odoslaných ${ok} emailov`);
    else toast.error(`Odoslaných ${ok}, zlyhalo ${fail}`);
    list.clearSelection();
    list.reload();
  }

  async function runBulkClone() {
    setBulkAction(null);
    const ids = list.selectedIds;
    setBusy(true);
    setProgress({ current: 0, total: ids.length });
    let ok = 0,
      fail = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await cloneFn({ data: { invoiceId: ids[i] } });
        ok++;
      } catch (e) {
        console.error("bulk clone failed", ids[i], e);
        fail++;
      }
      setProgress({ current: i + 1, total: ids.length });
    }
    setProgress(null);
    setBusy(false);
    if (fail === 0) toast.success(`Vytvorených ${ok} kópií pre ďalší mesiac`);
    else toast.error(`Vytvorených ${ok}, zlyhalo ${fail}`);
    list.clearSelection();
    list.reload();
  }

  async function runBulkReminder() {
    setBulkAction(null);
    const targets = selectedRows.filter(
      (r: any) =>
        (r.status === "issued" || r.status === "sent") &&
        r.due_date &&
        r.due_date < today &&
        !r.paid_at &&
        r.customer_email,
    );
    if (!targets.length) {
      toast.error("Žiadne po splatnosti faktúry s emailom.");
      return;
    }
    setBusy(true);
    setProgress({ current: 0, total: targets.length });
    let ok = 0,
      fail = 0;
    for (let i = 0; i < targets.length; i++) {
      const inv = targets[i];
      const next = Math.min(3, (reminderMap[inv.id] ?? 0) + 1) as 1 | 2 | 3;
      try {
        await reminderFn({
          data: { invoiceId: inv.id, reminderNumber: next, recipient_email: inv.customer_email },
        });
        ok++;
      } catch (e) {
        console.error("bulk reminder failed", inv.id, e);
        fail++;
      }
      setProgress({ current: i + 1, total: targets.length });
    }
    setProgress(null);
    setBusy(false);
    if (fail === 0) toast.success(`Odoslaných ${ok} upomienok`);
    else toast.error(`Odoslaných ${ok}, zlyhalo ${fail}`);
    list.clearSelection();
    list.reload();
  }

  async function runBulkZip() {
    setBulkAction(null);
    const ids = list.selectedIds;
    setBusy(true);
    setProgress({ current: 0, total: ids.length });
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    let ok = 0,
      fail = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        const r = await pdfFn({ data: { invoiceId: ids[i] } });
        const resp = await fetch(r.signedUrl);
        if (!resp.ok) throw new Error("PDF fetch failed");
        const bytes = new Uint8Array(await resp.arrayBuffer());
        zip.file(r.fileName, bytes);
        ok++;
      } catch (e) {
        console.error("bulk pdf failed", ids[i], e);
        fail++;
      }
      setProgress({ current: i + 1, total: ids.length });
    }
    setProgress(null);
    if (ok > 0) {
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `faktury-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    setBusy(false);
    if (fail === 0) toast.success(`ZIP so ${ok} faktúrami stiahnutý`);
    else toast.error(`Do ZIPu pridaných ${ok}, zlyhalo ${fail}`);
    list.clearSelection();
  }

  // Žiadna z týchto akcií nič nemaže, preto majú vlastný text tlačidla.
  const confirmMessages: Record<
    Exclude<BulkAction, null>,
    { title: string; message: string; confirmLabel: string }
  > = {
    paid: {
      title: `Označiť ${list.selectedIds.length} faktúr ako zaplatené?`,
      message: "Stornované a už zaplatené faktúry budú preskočené. Nastaví sa dnešný dátum úhrady.",
      confirmLabel: "Označiť ako zaplatené",
    },
    email: {
      title: `Odoslať emailom ${emailableCount} faktúr?`,
      message: "Odosielajú sa iba vystavené/odoslané faktúry s emailom odberateľa.",
      confirmLabel: "Odoslať",
    },
    clone: {
      title: `Vytvoriť kópie ${list.selectedIds.length} faktúr pre ďalší mesiac?`,
      message: "Vytvoria sa nové koncepty s inkrementovaným mesiacom v popisoch.",
      confirmLabel: "Vytvoriť kópie",
    },
    reminder: {
      title: `Odoslať upomienky pre ${overdueSelectedCount} faktúr?`,
      message:
        "Odosielajú sa iba po splatnosti faktúry s emailom odberateľa. Číslo upomienky sa určí automaticky.",
      confirmLabel: "Odoslať upomienky",
    },
    zip: {
      title: `Stiahnuť PDF ZIP pre ${list.selectedIds.length} faktúr?`,
      message: "Pre každú faktúru sa vygeneruje PDF a spakuje do jedného ZIP archívu.",
      confirmLabel: "Stiahnuť ZIP",
    },
  };
  const runners: Record<Exclude<BulkAction, null>, () => Promise<void>> = {
    paid: runBulkPaid,
    email: runBulkEmail,
    clone: runBulkClone,
    reminder: runBulkReminder,
    zip: runBulkZip,
  };

  const rowWarning = rowDelete && (rowDelete.status === "paid" || rowDelete.status === "sent");
  return (
    <>
      <PageHeader
        title={type === "credit" ? "Dobropisy" : status === "draft" ? "Koncepty" : "Faktúry"}
        description={
          q
            ? `Výsledky hľadania „${q}“.`
            : type === "credit"
              ? "Vystavené dobropisy."
              : status === "draft"
                ? "Rozpracované faktúry, ktoré ešte neboli vystavené."
                : "Všetky vystavené faktúry, koncepty aj stornované."
        }
        action={
          <div className="flex flex-wrap gap-2">
            {(type || status || q) && (
              <Link
                to="/faktury"
                search={{} as any}
                onClick={() => list.setSearch("")}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <X className="h-4 w-4" /> Zrušiť filter
              </Link>
            )}
            {list.selectedIds.length > 0 && !list.showDeleted && (
              <button
                onClick={bulkExport}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileCode2 className="h-4 w-4" />
                )}
                Export {list.selectedIds.length} do Pohody XML
              </button>
            )}
            <Link
              to="/exporty"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
            >
              <FileCode2 className="h-4 w-4" /> Účtovné exporty
            </Link>
            <Link
              to="/faktury/nova"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Nová faktúra
            </Link>
          </div>
        }
      />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <input
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder="Hľadať číslo, odberateľa, IČO…"
            className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overdueNoReminder}
                onChange={(e) => setOverdueNoReminder(e.target.checked)}
              />
              Po splatnosti bez upomienky
            </label>
            <DeletedToggle value={list.showDeleted} onChange={list.setShowDeleted} />
            <PageSizeSelect value={list.pageSize} onChange={list.setPageSize} />
          </div>
        </div>
        <BulkBar
          count={list.selectedIds.length}
          showDeleted={list.showDeleted}
          onDelete={() => setBulkDelete(true)}
          onRestore={bulkRestoreNow}
          onClear={list.clearSelection}
        />
        {list.selectedIds.length > 0 && !list.showDeleted && (
          <div className="sticky top-16 z-20 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-card/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
            <span className="font-medium text-primary">
              {list.selectedIds.length} faktúr vybraných
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() => setBulkAction("paid")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Označiť ako zaplatené
              </button>
              <button
                disabled={busy || emailableCount === 0}
                onClick={() => setBulkAction("email")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
              >
                <Mail className="h-3.5 w-3.5" /> Odoslať emailom{" "}
                {emailableCount > 0 ? `(${emailableCount})` : ""}
              </button>
              <button
                disabled={busy}
                onClick={() => setBulkAction("clone")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
              >
                <CalendarPlus className="h-3.5 w-3.5" /> Vystaviť pre ďalší mesiac
              </button>
              <button
                disabled={busy || overdueSelectedCount === 0}
                onClick={() => setBulkAction("reminder")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
              >
                <Bell className="h-3.5 w-3.5" /> Poslať upomienku{" "}
                {overdueSelectedCount > 0 ? `(${overdueSelectedCount})` : ""}
              </button>
              <button
                disabled={busy}
                onClick={() => setBulkAction("zip")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
              >
                <Archive className="h-3.5 w-3.5" /> Exportovať PDF (ZIP)
              </button>
              {progress && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Spracováva sa {progress.current}/
                  {progress.total}…
                </span>
              )}
            </div>
          </div>
        )}
        <ResponsiveTable
          className="mt-3"
          items={visibleRows}
          loading={list.loading}
          emptyText={list.showDeleted ? "Žiadne vymazané faktúry." : "Žiadne faktúry."}
          mobileCard={(i: any) => (
            <MobileListCard
              onClick={() => (window.location.href = `/faktury/${i.id}`)}
              title={
                <span className="inline-flex items-center gap-2">
                  {i.invoice_number}
                  {reminderMap[i.id] ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      <Bell className="h-3 w-3" /> Upomienka #{reminderMap[i.id]}
                    </span>
                  ) : null}
                </span>
              }
              subtitle={i.customer_name ?? "—"}
              status={<StatusBadge status={i.status} />}
              meta={`${i.issue_date} · splat. ${i.due_date}`}
              amount={`${Number(i.total).toFixed(2)} ${i.currency}`}
              actions={
                list.showDeleted ? (
                  <button
                    onClick={async () => {
                      try {
                        await list.restore([i.id]);
                        toast.success("Obnovené");
                      } catch (e: any) {
                        toast.error(e?.message ?? "Chyba");
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Obnoviť
                  </button>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={() => cloneRow(i.id)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Copy className="h-3.5 w-3.5" /> Klonovať
                    </button>
                    <button
                      onClick={() => setRowDelete(i)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Vymazať
                    </button>
                  </div>
                )
              }
            />
          )}
          desktop={
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 p-3">
                      <input
                        type="checkbox"
                        checked={list.allOnPageSelected}
                        onChange={(e) => list.toggleAllOnPage(e.target.checked)}
                      />
                    </th>
                    <th className="p-3">Číslo</th>
                    <th className="p-3">Odberateľ</th>
                    <th className="p-3">Vystavená</th>
                    <th className="p-3">Splatnosť</th>
                    <th className="p-3 text-right">Suma</th>
                    <th className="p-3">Stav</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.loading && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        Načítavam…
                      </td>
                    </tr>
                  )}
                  {!list.loading && visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        {list.showDeleted ? "Žiadne vymazané faktúry." : "Žiadne faktúry."}
                      </td>
                    </tr>
                  )}
                  {visibleRows.map((i) => (
                    <tr key={i.id} className="hover:bg-muted/30">
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={!!list.selected[i.id]}
                          onChange={(e) => list.toggleSelect(i.id, e.target.checked)}
                        />
                      </td>
                      <td
                        className="p-3 font-medium cursor-pointer"
                        onClick={() => (window.location.href = `/faktury/${i.id}`)}
                      >
                        <span className="inline-flex items-center gap-2">
                          {i.invoice_number}
                          {reminderMap[i.id] ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                              title="Upomienka bola odoslaná"
                            >
                              <Bell className="h-3 w-3" /> #{reminderMap[i.id]}
                            </span>
                          ) : null}
                        </span>
                      </td>

                      <td
                        className="p-3 cursor-pointer"
                        onClick={() => (window.location.href = `/faktury/${i.id}`)}
                      >
                        {i.customer_name ?? "—"}
                      </td>
                      <td
                        className="p-3 cursor-pointer"
                        onClick={() => (window.location.href = `/faktury/${i.id}`)}
                      >
                        {i.issue_date}
                      </td>
                      <td
                        className="p-3 cursor-pointer"
                        onClick={() => (window.location.href = `/faktury/${i.id}`)}
                      >
                        {i.due_date}
                      </td>
                      <td
                        className="p-3 text-right cursor-pointer"
                        onClick={() => (window.location.href = `/faktury/${i.id}`)}
                      >
                        {Number(i.total).toFixed(2)} {i.currency}
                      </td>
                      <td
                        className="p-3 cursor-pointer"
                        onClick={() => (window.location.href = `/faktury/${i.id}`)}
                      >
                        <StatusBadge status={i.status} />
                      </td>
                      <td className="p-3 text-right">
                        {list.showDeleted ? (
                          <button
                            title="Obnoviť"
                            onClick={async () => {
                              try {
                                await list.restore([i.id]);
                                toast.success("Obnovené");
                              } catch (e: any) {
                                toast.error(e?.message ?? "Chyba");
                              }
                            }}
                            className="rounded p-1.5 text-primary hover:bg-primary/10"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <button
                              title="Klonovať"
                              onClick={() => cloneRow(i.id)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              title="Vymazať"
                              onClick={() => setRowDelete(i)}
                              className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
        <Pagination
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onPageChange={list.setPage}
        />
      </PageBody>

      <ConfirmDialog
        open={!!rowDelete}
        title="Naozaj chcete vymazať túto faktúru?"
        message={
          rowDelete
            ? `Faktúra ${rowDelete.invoice_number} bude skrytá z rozhrania. Môžete ju neskôr obnoviť.`
            : ""
        }
        warning={
          rowWarning
            ? "Táto faktúra je už odoslaná alebo zaplatená. Mazanie môže narušiť účtovnú stopu."
            : undefined
        }
        onCancel={() => setRowDelete(null)}
        onConfirm={confirmRowDelete}
      />
      <ConfirmDialog
        open={bulkDelete}
        title={`Vymazať ${list.selectedIds.length} faktúr?`}
        message="Vybraté faktúry budú skryté z rozhrania. Môžete ich neskôr obnoviť."
        warning={
          sensitiveSelected > 0
            ? `${sensitiveSelected} z vybratých je odoslaných alebo zaplatených. Mazanie môže narušiť účtovnú stopu.`
            : undefined
        }
        onCancel={() => setBulkDelete(false)}
        onConfirm={confirmBulkDelete}
      />
      <ConfirmDialog
        open={!!bulkAction}
        title={bulkAction ? confirmMessages[bulkAction].title : ""}
        message={bulkAction ? confirmMessages[bulkAction].message : ""}
        confirmLabel={bulkAction ? confirmMessages[bulkAction].confirmLabel : ""}
        danger={false}
        busy={busy}
        onCancel={() => setBulkAction(null)}
        onConfirm={() => {
          if (bulkAction) runners[bulkAction]();
        }}
      />
    </>
  );
}
