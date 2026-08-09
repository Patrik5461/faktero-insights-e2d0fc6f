import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { Plus, Pencil, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { triggerEventFn } from "@/lib/faktero/email.functions";
import { IcoLookupButton } from "@/components/faktero/IcoLookupButton";
import { CompanyNameAutocomplete } from "@/components/faktero/CompanyNameAutocomplete";
import { mergeCompanyAutofill } from "@/lib/faktero/company-autofill";
import { findCustomerByIcoFn } from "@/lib/faktero/company-lookup.functions";
import { JobPicker } from "@/components/faktero/JobPicker";
import { usePagedList } from "@/hooks/usePagedList";
import {
  Pagination,
  PageSizeSelect,
  ConfirmDialog,
  BulkBar,
  DeletedToggle,
} from "@/components/faktero/ListControls";

export const Route = createFileRoute("/_authenticated/odberatelia")({
  head: () => ({ meta: [{ title: "Odberatelia — Faktero" }] }),
  /** `?new=1` z menu („Nový odberateľ“) rovno otvorí formulár. */
  validateSearch: (s: Record<string, unknown>): { new?: "1" } => ({
    new: s.new === "1" || s.new === 1 ? "1" : undefined,
  }),
  component: CustomersPage,
});

type Customer = {
  id?: string;
  name: string;
  ico?: string;
  dic?: string;
  ic_dph?: string;
  street?: string;
  city?: string;
  zip?: string;
  country?: string;
  email?: string;
  phone?: string;
  contact_person?: string;
  notes?: string;
  /** Doplní sa do nového dokladu tohto odberateľa. */
  default_job_id?: string | null;
};

const EMPTY: Customer = { name: "", country: "SK" };

function CustomersPage() {
  const list = usePagedList({
    resource: "customers",
    searchColumns: ["name", "ico", "email"],
  });
  const [editing, setEditing] = useState<Customer | null>(null);
  const [rowDelete, setRowDelete] = useState<any | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const triggerEvt = useServerFn(triggerEventFn);

  // Príchod z menu cez `?new=1`. Parameter hneď odstránime, aby sa formulár
  // po zavretí neotvoril znova pri obnovení stránky alebo návrate späť.
  const { new: openNew } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (!openNew) return;
    setEditing(EMPTY);
    navigate({ to: "/odberatelia", search: {} as any, replace: true });
  }, [openNew, navigate]);

  async function save(c: Customer) {
    const cid = getActiveCompanyId();
    if (!cid) return;
    const payload = { ...c, company_id: cid };
    if (c.id) {
      const { error } = await supabase.from("customers").update(payload).eq("id", c.id);
      if (error) return toast.error(error.message);
    } else {
      const { data: created, error } = await supabase
        .from("customers")
        .insert(payload)
        .select()
        .single();
      if (error || !created) {
        const { friendlyError } = await import("@/lib/faktero/plan-error");
        return toast.error(friendlyError(error));
      }
      try {
        await triggerEvt({
          data: {
            companyId: cid,
            event: "customer.created",
            data: {
              customer_id: created.id,
              name: created.name,
              email: created.email,
              ico: created.ico,
            },
          },
        });
      } catch (e) {
        console.warn("[webhook] customer.created trigger zlyhal", e);
      }
    }
    toast.success("Uložené");
    setEditing(null);
    list.reload();
  }

  async function confirmRow() {
    if (!rowDelete) return;
    try {
      await list.softDelete([rowDelete.id]);
      toast.success("Odberateľ vymazaný");
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setRowDelete(null);
    }
  }
  async function confirmBulk() {
    try {
      await list.softDelete(list.selectedIds);
      toast.success(`Vymazaných ${list.selectedIds.length}`);
      list.clearSelection();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setBulkDelete(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Odberatelia"
        description="Vaši zákazníci a ich fakturačné údaje."
        action={
          <button
            onClick={() => setEditing(EMPTY)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nový odberateľ
          </button>
        }
      />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <input
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder="Hľadať názov, IČO, email…"
            className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-4">
            <DeletedToggle value={list.showDeleted} onChange={list.setShowDeleted} />
            <PageSizeSelect value={list.pageSize} onChange={list.setPageSize} />
          </div>
        </div>
        <BulkBar
          count={list.selectedIds.length}
          showDeleted={list.showDeleted}
          onDelete={() => setBulkDelete(true)}
          onRestore={async () => {
            try {
              await list.restore(list.selectedIds);
              toast.success("Obnovené");
              list.clearSelection();
            } catch (e: any) {
              toast.error(e?.message ?? "Chyba");
            }
          }}
          onClear={list.clearSelection}
        />
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
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
                <th className="p-3">Názov</th>
                <th className="p-3">IČO</th>
                <th className="p-3">DIČ</th>
                <th className="p-3">Email</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.loading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    Načítavam…
                  </td>
                </tr>
              )}
              {!list.loading && list.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    {list.showDeleted ? "Žiadni vymazaní odberatelia." : "Žiadni odberatelia."}
                  </td>
                </tr>
              )}
              {list.rows.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!list.selected[c.id]}
                      onChange={(e) => list.toggleSelect(c.id, e.target.checked)}
                    />
                  </td>
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">{c.ico ?? "—"}</td>
                  <td className="p-3">{c.dic ?? "—"}</td>
                  <td className="p-3">{c.email ?? "—"}</td>
                  <td className="p-3 text-right">
                    {!list.showDeleted && (
                      <button
                        onClick={() => setEditing(c)}
                        className="rounded p-1.5 hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {list.showDeleted ? (
                      <button
                        onClick={async () => {
                          try {
                            await list.restore([c.id]);
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
                      <button
                        onClick={() => setRowDelete(c)}
                        className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            onPageChange={list.setPage}
          />
        </div>
      </PageBody>

      {editing && (
        <CustomerDialog initial={editing} onClose={() => setEditing(null)} onSave={save} />
      )}
      <ConfirmDialog
        open={!!rowDelete}
        title="Naozaj chcete vymazať tohto odberateľa?"
        message={
          rowDelete ? `${rowDelete.name} bude skrytý z rozhrania. Existujúce faktúry ostanú.` : ""
        }
        onCancel={() => setRowDelete(null)}
        onConfirm={confirmRow}
      />
      <ConfirmDialog
        open={bulkDelete}
        title={`Vymazať ${list.selectedIds.length} odberateľov?`}
        message="Vybraní odberatelia budú skrytí z rozhrania."
        onCancel={() => setBulkDelete(false)}
        onConfirm={confirmBulk}
      />
    </>
  );
}

function CustomerDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: Customer;
  onClose: () => void;
  onSave: (c: Customer) => void;
}) {
  const [c, setC] = useState<Customer>(initial);
  const [dup, setDup] = useState<null | { id: string; name: string }>(null);
  const findDup = useServerFn(findCustomerByIcoFn);
  function f<K extends keyof Customer>(k: K, v: any) {
    setC((p) => ({ ...p, [k]: v }));
  }
  useEffect(() => {
    const cid = getActiveCompanyId();
    const ico = (c.ico ?? "").replace(/\s+/g, "");
    if (!cid || !/^\d{6,8}$/.test(ico)) {
      setDup(null);
      return;
    }
    const h = setTimeout(async () => {
      try {
        const r = await findDup({ data: { ico, companyId: cid } });
        if (r.match && r.match.id !== c.id) setDup({ id: r.match.id, name: r.match.name });
        else setDup(null);
      } catch {
        setDup(null);
      }
    }, 500);
    return () => clearTimeout(h);
  }, [c.ico, c.id]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{c.id ? "Upraviť odberateľa" : "Nový odberateľ"}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(c);
          }}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium">Názov *</span>
            <div className="mt-1">
              <CompanyNameAutocomplete
                value={c.name}
                onChange={(v) => f("name", v)}
                onPick={(d, { auto }) =>
                  setC(
                    (prev) =>
                      mergeCompanyAutofill(prev, d, {
                        mode: auto ? "fill-empty" : "overwrite",
                      }) as Customer,
                  )
                }
              />
            </div>
          </label>
          {dup && (
            <div className="sm:col-span-2 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
              Odberateľ s týmto IČO už existuje: <strong>{dup.name}</strong>.
            </div>
          )}
          <label className="block">
            <span className="text-sm font-medium">IČO</span>
            <div className="mt-1 flex -space-x-px items-start">
              <input
                value={c.ico ?? ""}
                onChange={(e) => f("ico", e.target.value)}
                className="w-full rounded-l-md border border-input bg-background px-3 py-2 text-sm focus:z-10"
              />
              <IcoLookupButton
                ico={c.ico ?? ""}
                onResult={(d, { auto }) =>
                  setC(
                    (prev) =>
                      mergeCompanyAutofill(prev, d, {
                        mode: auto ? "fill-empty" : "overwrite",
                      }) as Customer,
                  )
                }
              />
            </div>
          </label>
          <In label="DIČ" value={c.dic ?? ""} onChange={(v) => f("dic", v)} />
          <In label="IČ DPH" value={c.ic_dph ?? ""} onChange={(v) => f("ic_dph", v)} />
          <In
            label="Kontaktná osoba"
            value={c.contact_person ?? ""}
            onChange={(v) => f("contact_person", v)}
          />
          <In label="Ulica" value={c.street ?? ""} onChange={(v) => f("street", v)} full />
          <In label="Mesto" value={c.city ?? ""} onChange={(v) => f("city", v)} />
          <In label="PSČ" value={c.zip ?? ""} onChange={(v) => f("zip", v)} />
          <In label="Krajina" value={c.country ?? "SK"} onChange={(v) => f("country", v)} />
          <In label="Email" type="email" value={c.email ?? ""} onChange={(v) => f("email", v)} />
          <In label="Telefón" value={c.phone ?? ""} onChange={(v) => f("phone", v)} />
          <JobPicker
            className="sm:col-span-2"
            label="Predvolená zákazka"
            value={c.default_job_id ?? ""}
            // Prázdny výber musí ísť do databázy ako NULL — prázdny reťazec
            // nie je platné UUID a uloženie by padlo.
            onChange={(v) => f("default_job_id", v || null)}
          />
          <label className="sm:col-span-2 block">
            <span className="text-sm font-medium">Poznámky</span>
            <textarea
              value={c.notes ?? ""}
              onChange={(e) => f("notes", e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
            >
              Zrušiť
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Uložiť
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function In({
  label,
  value,
  onChange,
  type = "text",
  required,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
