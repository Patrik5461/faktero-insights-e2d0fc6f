import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { prelozAuthChybu } from "@/lib/faktero/auth-chyby";
import { Logo } from "@/components/faktero/Logo";
import { toast } from "sonner";

export const Route = createFileRoute("/zabudnute-heslo")({
  head: () => ({ meta: [{ title: "Zabudnuté heslo — Faktero" }] }),
  validateSearch: (s: Record<string, unknown>): { email?: string } =>
    typeof s.email === "string" ? { email: s.email.slice(0, 200) } : {},
  component: ZabudnuteHesloPage,
});

/**
 * Žiadosť o odkaz na nové heslo. Hlásenie je vždy rovnaké, či účet existuje
 * alebo nie — inak by sa dalo zisťovať, kto vo Fakteri účet má.
 */
function ZabudnuteHesloPage() {
  const { email: zAdresy } = Route.useSearch();
  const [email, setEmail] = useState(zAdresy ?? "");
  const [posielam, setPosielam] = useState(false);
  const [odoslane, setOdoslane] = useState(false);

  async function odosli(e: React.FormEvent) {
    e.preventDefault();
    setPosielam(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nove-heslo`,
    });
    setPosielam(false);
    // Neexistujúci účet Supabase chybou nehlási; chyba je napr. príliš časté posielanie.
    if (error) return toast.error(prelozAuthChybu(error.message).sprava);
    setOdoslane(true);
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <Link to="/" className="mb-6 inline-flex items-center">
          <Logo variant="header" className="h-8" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Zabudnuté heslo</h1>
        {odoslane ? (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Ak k adrese <strong className="text-foreground">{email.trim()}</strong> existuje účet,
              poslali sme na ňu odkaz na nastavenie nového hesla. Platí hodinu.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              E-mail neprišiel? Pozrite aj priečinok nevyžiadanej pošty, prípadne to o minútu
              skúste znova.
            </p>
            <button
              onClick={() => setOdoslane(false)}
              className="mt-4 text-sm font-medium text-primary hover:underline"
            >
              Poslať znova
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Zadajte e-mail, s ktorým sa prihlasujete. Pošleme vám odkaz na nastavenie nového
              hesla.
            </p>
            <form onSubmit={odosli} className="mt-5 space-y-3">
              <label className="block">
                <span className="text-sm font-medium">Email</span>
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <button
                type="submit"
                disabled={posielam}
                className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {posielam ? "Posielam…" : "Poslať odkaz"}
              </button>
            </form>
          </>
        )}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/prihlasenie" className="font-medium text-primary hover:underline">
            Späť na prihlásenie
          </Link>
        </p>
      </div>
    </div>
  );
}
