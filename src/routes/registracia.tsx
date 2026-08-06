import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { recordLegalAcceptance } from "@/lib/legal.functions";
import { LEGAL_VERSION } from "@/components/faktero/LegalShell";
import { Logo } from "@/components/faktero/Logo";

export const Route = createFileRoute("/registracia")({
  head: () => ({
    meta: [
      { title: "Registrácia — Faktero" },
      { name: "description", content: "Vytvorte si účet vo Faktere zdarma." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptGdpr, setAcceptGdpr] = useState(false);

  async function persistAcceptances() {
    try {
      await recordLegalAcceptance({
        data: {
          documents: [
            { document_type: "obchodne-podmienky", version: LEGAL_VERSION },
            { document_type: "gdpr", version: LEGAL_VERSION },
            { document_type: "cookies", version: LEGAL_VERSION },
          ],
        },
      });
    } catch (e) {
      console.warn("legal acceptance log failed", e);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptTerms || !acceptGdpr) {
      toast.error("Pre pokračovanie potvrďte obidva súhlasy.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (data.user?.id) await persistAcceptances();
    toast.success("Účet vytvorený. Pokračujte do nastavenia firmy.");
    navigate({ to: "/onboarding" });
  }

  async function onGoogle() {
    if (!acceptTerms || !acceptGdpr) {
      toast.error("Pre pokračovanie potvrďte obidva súhlasy.");
      return;
    }
    try {
      sessionStorage.setItem("faktero_legal_pending", LEGAL_VERSION);
    } catch {
      // sessionStorage môže byť zakázané — súhlas sa potom zapíše až po prihlásení
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/onboarding" },
    });
    if (error) toast.error(error.message);
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <Link to="/" className="mb-6 inline-flex items-center">
          <Logo variant="header" className="h-8" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Vytvorte si účet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          30 dní zadarmo na pláne Premium. Bez platobnej karty.
        </p>

        <button
          onClick={onGoogle}
          className="mt-6 w-full rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary"
        >
          Pokračovať cez Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> alebo <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium">Meno a priezvisko</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Heslo</label>
            <input
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-2 pt-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1"
              />
              <span>
                Súhlasím s{" "}
                <Link
                  to="/pravne/obchodne-podmienky"
                  target="_blank"
                  className="text-primary underline"
                >
                  Obchodnými podmienkami
                </Link>
                .
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acceptGdpr}
                onChange={(e) => setAcceptGdpr(e.target.checked)}
                className="mt-1"
              />
              <span>
                Beriem na vedomie{" "}
                <Link to="/pravne/gdpr" target="_blank" className="text-primary underline">
                  Spracúvanie osobných údajov
                </Link>
                .
              </span>
            </label>
          </div>
          <button
            type="submit"
            disabled={loading || !acceptTerms || !acceptGdpr}
            className="mt-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Vytváram..." : "Vytvoriť účet"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Už máte účet?{" "}
          <Link to="/prihlasenie" className="font-medium text-primary hover:underline">
            Prihlásiť sa
          </Link>
        </p>
      </div>
    </div>
  );
}
