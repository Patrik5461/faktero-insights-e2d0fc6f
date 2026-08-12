import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { CreateCompanyDialog } from "@/components/faktero/CreateCompanyDialog";
import { getActiveCompanyId, setActiveCompanyId } from "@/lib/faktero/active-company";
import { Plus, Check, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/firmy")({
  head: () => ({ meta: [{ title: "Správa firiem — Faktero" }] }),
  component: CompanyManagementPage,
});

type Row = { id: string; name: string; role: string; created_at: string };

function CompanyManagementPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [activeId, setAid] = useState<string | null>(getActiveCompanyId());
  const [open, setOpen] = useState(false);

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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
      <CreateCompanyDialog open={open} onOpenChange={setOpen} onCreated={load} />
    </>
  );
}
