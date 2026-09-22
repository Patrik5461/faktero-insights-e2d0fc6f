import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { prelozAuthChybu } from "@/lib/faktero/auth-chyby";
import { Logo } from "@/components/faktero/Logo";
import { toast } from "sonner";

export const Route = createFileRoute("/nove-heslo")({
  head: () => ({ meta: [{ title: "Nové heslo — Faktero" }, { name: "robots", content: "noindex" }] }),
  component: NoveHesloPage,
});

/**
 * Nastavenie nového hesla po kliknutí na odkaz z e-mailu. Odkaz človeka
 * prihlási (cez `/auth/potvrdenie`, alebo po starom cez `#access_token` v
 * adrese, ktorý spracuje klient Supabase) — tu sa už len mení heslo.
 */
function NoveHesloPage() {
  const [stav, setStav] = useState<"overujem" | "formular" | "bez-relacie" | "hotovo">("overujem");
  const [heslo, setHeslo] = useState("");
  const [znova, setZnova] = useState("");
  const [ukladam, setUkladam] = useState(false);

  useEffect(() => {
    let zive = true;
    // Relácia z `#access_token` sa nastaví až po chvíli — počkáme na ňu.
    const { data: odber } = supabase.auth.onAuthStateChange((udalost, relacia) => {
      if (zive && relacia && (udalost === "PASSWORD_RECOVERY" || udalost === "SIGNED_IN")) setStav("formular");
    });
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!zive) return;
      if (data.session) setStav("formular");
      else setTimeout(() => zive && setStav((s) => (s === "overujem" ? "bez-relacie" : s)), 2500);
    })();
    return () => {
      zive = false;
      odber.subscription.unsubscribe();
    };
  }, []);

  async function uloz(e: React.FormEvent) {
    e.preventDefault();
    if (heslo.length < 8) return toast.error("Heslo musí mať aspoň 8 znakov.");
    if (heslo !== znova) return toast.error("Heslá sa nezhodujú.");
    setUkladam(true);
    const { error } = await supabase.auth.updateUser({ password: heslo });
    setUkladam(false);
    if (error) return toast.error(prelozAuthChybu(error.message).sprava);
    setStav("hotovo");
  }

  const pole =
    "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <Link to="/" className="mb-6 inline-flex items-center">
          <Logo variant="header" className="h-8" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nové heslo</h1>

        {stav === "overujem" && <p className="mt-3 text-sm text-muted-foreground">Overujem odkaz…</p>}

        {stav === "bez-relacie" && (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Odkaz na zmenu hesla vypršal alebo už bol použitý. Vyžiadajte si nový.
            </p>
            <Link
              to="/zabudnute-heslo"
              className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Poslať nový odkaz
            </Link>
          </>
        )}

        {stav === "formular" && (
          <form onSubmit={uloz} className="mt-5 space-y-3">
            <label className="block">
              <span className="text-sm font-medium">Nové heslo</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={heslo}
                onChange={(e) => setHeslo(e.target.value)}
                className={pole}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Nové heslo znova</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={znova}
                onChange={(e) => setZnova(e.target.value)}
                className={pole}
              />
            </label>
            <p className="text-xs text-muted-foreground">Aspoň 8 znakov. Heslo, ktoré uniklo z iných služieb, neprejde.</p>
            <button
              type="submit"
              disabled={ukladam}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {ukladam ? "Ukladám…" : "Uložiť nové heslo"}
            </button>
          </form>
        )}

        {stav === "hotovo" && (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Heslo je zmenené a ste prihlásený. V mobilnej appke sa prihláste novým heslom.
            </p>
            <Link
              to="/dashboard"
              className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Pokračovať do Faktera
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
