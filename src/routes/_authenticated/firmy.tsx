import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { CreateCompanyDialog } from "@/components/faktero/CreateCompanyDialog";
import { getActiveCompanyId, setActiveCompanyId } from "@/lib/faktero/active-company";
import { Plus, Check, Building2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { zmazFirmuFn } from "@/lib/faktero/firma-zmazanie.functions";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";

export const Route = createFileRoute("/_authenticated/firmy")({
  head: () => ({ meta: [{ title: "Správa firiem — Faktero" }] }),
  component: CompanyManagementPage,
});

type Row = { id: string; name: string; role: string; created_at: string };

function CompanyManagementPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [activeId, setAid] = useState<string | null>(getActiveCompanyId());
  const [open, setOpen] = useState(false);
  const [mazem, setMazem] = useState<Row | null>(null);
  const zmazFirmu = useServerFn(zmazFirmuFn);

  async function load() {
    // Bez filtra na seba vráti RLS aj členstvá kolegov a firma sa v zozname
    // zopakuje toľkokrát, koľko má členov.
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data, error } = await supabase
      .from("company_users")
      .select("role, company:companies(id, name, created_at)")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows(
      (data ?? []).map((r: any) => ({
        role: r.role,
        id: r.company.id,
        name: r.company.name,
        created_at: r.company.created_at,
      })),
    );
  }

  useEffect(() => {
    load();
  }, []);

  /**
   * Po zmazaní firmy sa treba prepnúť inam — inak by celá aplikácia ukazovala
   * na firmu, ktorá už neexistuje, a každá stránka by skončila prázdna.
   */
  async function poZmazani(zmazana: Row) {
    setMazem(null);
    toast.success(`Firma ${zmazana.name} je zmazaná.`);
    if (zmazana.id === activeId) {
      const ina = (rows ?? []).find((r) => r.id !== zmazana.id);
      if (ina) {
        setActiveCompanyId(ina.id);
        window.location.assign("/dashboard");
        return;
      }
    }
    await load();
  }

  function switchTo(id: string) {
    setActiveCompanyId(id);
    setAid(id);
    toast.success("Firma prepnutá");
    window.location.assign("/dashboard");
  }

  return (
    <>
      <PageHeader
        title="Správa firiem"
        description="Firmy, ku ktorým máte prístup."
        action={
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Pridať firmu
          </button>
        }
      />
      <PageBody>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Firma</th>
                <th className="px-4 py-3">Rola</th>
                <th className="px-4 py-3">Vytvorené</th>
                <th className="px-4 py-3 text-right">Akcie</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    Načítavam…
                  </td>
                </tr>
              )}
              {rows?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    Žiadne firmy.
                  </td>
                </tr>
              )}
              {rows?.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{r.name}</span>
                      {r.id === activeId && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          <Check className="h-3 w-3" /> Aktívna
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.role}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("sk-SK")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      {r.id !== activeId && (
                        <button
                          onClick={() => switchTo(r.id)}
                          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
                        >
                          Prepnúť
                        </button>
                      )}
                      <a
                        href="/firma"
                        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary"
                      >
                        Upraviť
                      </a>
                      {/* Pozvánky žijú v nastaveniach firmy — tu bolo roky
                          zašednuté tlačidlo s poznámkou „Onedlho". */}
                      <Link
                        to="/firma"
                        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                      >
                        Pozvať
                      </Link>
                      {/* Skúšobná firma sa dala doteraz len založiť. Mazať smie
                          majiteľ a len keď mu ostane iná — poslednú firmu rieši
                          zrušenie účtu, ktoré má odklad. */}
                      {r.role === "owner" && (rows?.length ?? 0) > 1 && (
                        <button
                          onClick={() => setMazem(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Zmazať
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
      <CreateCompanyDialog open={open} onOpenChange={setOpen} onCreated={load} />
      {mazem && (
        <ZmazanieFirmyDialog
          firma={mazem}
          onClose={() => setMazem(null)}
          onZmazat={async (potvrdenie) => {
            await zmazFirmu({ data: { company_id: mazem.id, potvrdenie } });
            await poZmazani(mazem);
          }}
        />
      )}
    </>
  );
}

/**
 * Zmazanie firmy je nevratné a berie so sebou doklady, sklad aj prílohy —
 * preto sa názov prepisuje ručne. Server ho kontroluje ešte raz.
 */
function ZmazanieFirmyDialog({
  firma,
  onClose,
  onZmazat,
}: {
  firma: Row;
  onClose: () => void;
  onZmazat: (potvrdenie: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useZatvorNaEscape(onClose);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Zmazať firmu ${firma.name}`}
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Zmazať firmu {firma.name}?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Zmažú sa všetky doklady, sklad, jazdy aj prílohy tejto firmy. Vrátiť sa to nedá. Ak si to
          chcete nechať, firmu len prestaňte používať.
        </p>
        <label className="mt-4 block text-xs font-medium text-muted-foreground">
          Prepíšte názov firmy
        </label>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={firma.name}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Späť
          </button>
          <button
            disabled={busy || text.trim() !== firma.name.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onZmazat(text);
              } catch (e: any) {
                toast.error(e?.message ?? "Firmu sa nepodarilo zmazať.");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Mažem…" : "Zmazať natrvalo"}
          </button>
        </div>
      </div>
    </div>
  );
}
