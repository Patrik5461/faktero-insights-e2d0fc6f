import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/nastavenia")({
  head: () => ({ meta: [{ title: "Nastavenia — Faktero" }] }),
  component: SettingsPage,
});

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
      </PageBody>
    </>
  );
}