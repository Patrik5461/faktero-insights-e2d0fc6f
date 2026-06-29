import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/nastavenia")({
  head: () => ({ meta: [{ title: "Nastavenia — Faktero" }] }),
  component: SettingsPage,
});

const MODE_OPTIONS: { value: "invoicing" | "logbook" | "both"; label: string; desc: string }[] = [
  { value: "invoicing", label: "Fakturačný systém", desc: "Faktúry, eFaktúra, API, sklad, banky." },
  { value: "logbook", label: "Kniha jázd", desc: "Jazdy, vozidlá, Commander GPS, Tesla." },
  { value: "both", label: "Oboje", desc: "Fakturácia aj kniha jázd v jednom účte." },
];

function SettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from("profiles").select("*").eq("id", data.user.id).single().then(({ data }) => setProfile(data));
    });
  }, []);
  if (!profile) return <PageBody>Načítavam…</PageBody>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("profiles").update({ full_name: profile.full_name }).eq("id", profile.id);
    if (error) return toast.error(error.message);
    toast.success("Uložené");
  }

  async function saveMode(mode: "invoicing" | "logbook" | "both") {
    const { error } = await supabase.from("profiles").update({ product_mode: mode }).eq("id", profile.id);
    if (error) return toast.error(error.message);
    setProfile({ ...profile, product_mode: mode });
    toast.success("Produkt aktualizovaný — obnovujem…");
    setTimeout(() => window.location.reload(), 500);
  }

  return (
    <>
      <PageHeader title="Nastavenia účtu" description="Vaše osobné údaje." />
      <PageBody>
        <form onSubmit={save} className="max-w-lg space-y-4 rounded-xl border border-border bg-card p-6">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input value={profile.email ?? ""} disabled className="mt-1 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Meno a priezvisko</span>
            <input value={profile.full_name ?? ""} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Uložiť</button>
        </form>

        <div className="mt-8 max-w-3xl rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Používané produkty</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Vyberte, čo má byť v menu. Voľbu môžete kedykoľvek zmeniť.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {MODE_OPTIONS.map((o) => {
              const active = profile.product_mode === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => saveMode(o.value)}
                  className={`rounded-lg border p-4 text-left transition ${
                    active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-primary/40 hover:bg-secondary/40"
                  }`}
                >
                  <div className="text-sm font-semibold">{o.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{o.desc}</div>
                  {active && <div className="mt-2 text-xs font-medium text-primary">Aktívne</div>}
                </button>
              );
            })}
          </div>
        </div>
      </PageBody>
    </>
  );
}
