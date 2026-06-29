import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { Logo } from "@/components/faktero/Logo";

export const Route = createFileRoute("/prihlasenie")({
  head: () => ({
    meta: [
      { title: "Prihlásenie — Faktero" },
      { name: "description", content: "Prihláste sa do Faktera." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/dashboard" });
  }

  async function onGoogle() {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (res.error) toast.error(res.error.message);
    if (res.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <Link to="/" className="mb-6 inline-flex items-center">
          <Logo variant="header" className="h-8" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Prihlásenie</h1>
        <p className="mt-1 text-sm text-muted-foreground">Vitajte späť. Prihláste sa do svojho účtu.</p>

        <button onClick={onGoogle} className="mt-6 w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary">
          Pokračovať cez Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> alebo <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="text-sm font-medium">Heslo</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <button type="submit" disabled={loading} className="mt-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {loading ? "Prihlasujem..." : "Prihlásiť sa"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Nemáte účet? <Link to="/registracia" className="font-medium text-primary hover:underline">Vytvoriť účet</Link>
        </p>
      </div>
    </div>
  );
}