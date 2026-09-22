import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/faktero/Logo";
import { bezpecnyCiel } from "@/lib/faktero/auth-potvrdenie";
import { overKod, potrebujeKod } from "@/lib/faktero/dvojfaktor";

export const Route = createFileRoute("/overenie")({
  ssr: false,
  head: () => ({ meta: [{ title: "Overenie — Faktero" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" ? { next: s.next } : {},
  component: OvereniePage,
});

/**
 * Druhý krok prihlásenia pre toho, kto má zapnuté dvojfaktorové overenie.
 * Kód sa pýta len raz za prihlásenie — overená relácia vydrží na tomto
 * zariadení až do odhlásenia.
 */
function OvereniePage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [kod, setKod] = useState("");
  const [chyba, setChyba] = useState<string | null>(null);
  const [overujem, setOverujem] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return navigate({ to: "/prihlasenie" });
      if (!(await potrebujeKod())) window.location.replace(bezpecnyCiel(next, window.location.origin));
    })();
    // eslint-disable-next-line
  }, []);

  async function odosli(e: React.FormEvent) {
    e.preventDefault();
    setOverujem(true);
    setChyba(null);
    try {
      await overKod(kod);
      window.location.replace(bezpecnyCiel(next, window.location.origin));
    } catch (err: any) {
      setChyba(err?.message ?? "Overenie sa nepodarilo.");
      setOverujem(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <Logo variant="header" className="mb-6 h-8" />
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">Dvojfaktorové overenie</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Zadajte 6-miestny kód z overovacej appky (Google Authenticator, Microsoft Authenticator…).
        </p>
        <form onSubmit={odosli} className="mt-5 space-y-3">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={7}
            value={kod}
            onChange={(e) => setKod(e.target.value)}
            aria-label="Kód z overovacej appky"
            placeholder="123 456"
            className="w-full rounded-md border border-input bg-background px-3 py-3 text-center font-mono text-2xl tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring"
          />
          {chyba && <p className="text-sm text-destructive">{chyba}</p>}
          <button
            type="submit"
            disabled={overujem}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {overujem ? "Overujem…" : "Overiť"}
          </button>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">
          Na tomto zariadení sa kód znova vypýta až po odhlásení. Stratili ste telefón s appkou?
          Napíšte na servis@faktero.sk.
        </p>
        <button
          onClick={async () => {
            await supabase.auth.signOut({ scope: "local" });
            navigate({ to: "/prihlasenie" });
          }}
          className="mt-3 text-sm font-medium text-primary hover:underline"
        >
          Prihlásiť sa iným účtom
        </button>
      </div>
    </div>
  );
}
