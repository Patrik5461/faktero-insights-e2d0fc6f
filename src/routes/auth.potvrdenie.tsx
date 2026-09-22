import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { bezpecnyCiel, jeTypPotvrdenia, type TypPotvrdenia } from "@/lib/faktero/auth-potvrdenie";

export const Route = createFileRoute("/auth/potvrdenie")({
  head: () => ({ meta: [{ title: "Potvrdenie — Faktero" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>): { token_hash?: string; type?: TypPotvrdenia; next?: string } => ({
    ...(typeof s.token_hash === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(s.token_hash) ? { token_hash: s.token_hash } : {}),
    ...(jeTypPotvrdenia(s.type) ? { type: s.type } : {}),
    ...(typeof s.next === "string" ? { next: s.next } : {}),
  }),
  component: PotvrdeniePage,
});

/**
 * Stránka, na ktorú mieri odkaz z potvrdzovacieho e-mailu. Overí jednorazový
 * kód, prihlási a pošle ďalej tam, kam registrácia pôvodne smerovala.
 */
function PotvrdeniePage() {
  const { token_hash, type, next } = Route.useSearch();
  const [chyba, setChyba] = useState<string | null>(null);
  const spustene = useRef(false);

  useEffect(() => {
    // Kód je jednorazový — druhé overenie (napr. pri prekreslení) by zlyhalo.
    if (spustene.current) return;
    spustene.current = true;
    if (!token_hash || !type) {
      setChyba("Odkaz je neúplný. Skopírujte ho z e-mailu celý, alebo si pošlite nový.");
      return;
    }
    void (async () => {
      const { error } = await supabase.auth.verifyOtp({ token_hash, type });
      if (error) {
        setChyba(
          /expired|invalid/i.test(error.message)
            ? "Platnosť odkazu vypršala alebo už bol použitý. Prihláste sa — ak účet ešte nie je potvrdený, pošleme nový odkaz."
            : `Potvrdenie sa nepodarilo: ${error.message}`,
        );
        return;
      }
      // Tvrdé presmerovanie: nová relácia sa tak načíta všade od začiatku.
      window.location.replace(bezpecnyCiel(next, window.location.origin));
    })();
  }, [token_hash, type, next]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        {chyba ? (
          <>
            <h1 className="text-lg font-semibold">Odkaz nefunguje</h1>
            <p className="mt-2 text-sm text-muted-foreground">{chyba}</p>
            <Link
              to="/prihlasenie"
              className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Prihlásiť sa
            </Link>
          </>
        ) : (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Overujem odkaz…
          </p>
        )}
      </div>
    </div>
  );
}
