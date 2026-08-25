import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getInvitationByTokenFn, acceptInvitationFn } from "@/lib/faktero/invitations.functions";
import { setActiveCompanyId } from "@/lib/faktero/active-company";
import { toast } from "sonner";

/** Rola z databázy po slovensky — v pozvánke svietilo „accountant". */
const ROLA_POPIS: Record<string, string> = {
  owner: "majiteľ",
  admin: "administrátor",
  accountant: "účtovník",
  employee: "používateľ",
};

export const Route = createFileRoute("/pridat-pouzivatela")({
  head: () => ({ meta: [{ title: "Pozvánka do firmy — Faktero" }] }),
  component: AcceptInvitationPage,
  validateSearch: (s: Record<string, unknown>) => ({ token: (s.token as string) ?? "" }),
});

function AcceptInvitationPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const getInv = useServerFn(getInvitationByTokenFn);
  const acceptInv = useServerFn(acceptInvitationFn);
  const [inv, setInv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [{ data: userData }, res] = await Promise.all([
          supabase.auth.getUser(),
          getInv({ data: { token } }),
        ]);
        setUserEmail(userData.user?.email ?? null);
        setInv(res);
      } catch {
        // Token v zlom formáte neprejde validáciou na serveri. Z pohľadu
        // používateľa je to to isté ako neexistujúca pozvánka — inak by
        // stránka zostala navždy v stave „načítavam".
        setInv({ valid: false });
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!inv?.valid) return;
    setBusy(true);
    try {
      // If not signed in, sign up / sign in first
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        if (pwd.length < 8) {
          toast.error("Heslo musí mať aspoň 8 znakov");
          setBusy(false);
          return;
        }
        const { error: signUpErr } = await supabase.auth.signUp({
          email: inv.email,
          password: pwd,
          options: {
            emailRedirectTo: `${window.location.origin}/pridat-pouzivatela?token=${token}`,
          },
        });
        if (signUpErr) {
          // Try signing in (user might exist)
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: inv.email,
            password: pwd,
          });
          if (signInErr) throw signInErr;
        }
      }
      await acceptInv({ data: { token } });
      setActiveCompanyId(inv.company_id);
      toast.success(`Pripojili ste sa k firme ${inv.company_name}`);
      navigate({ to: "/dashboard" });
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba pri prijímaní pozvánky");
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">
        Načítavam pozvánku…
      </div>
    );

  if (!token || !inv || !inv.valid) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">Neplatná pozvánka</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {inv?.reason === "expired"
            ? "Pozvánka expirovala."
            : inv?.reason === "already_accepted"
              ? "Pozvánka už bola využitá."
              : "Odkaz je neplatný."}
        </p>
      </div>
    );
  }

  const alreadySignedIn = !!userEmail;
  const emailMismatch = alreadySignedIn && userEmail?.toLowerCase() !== inv.email.toLowerCase();

  return (
    <div className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">Pozvánka do firmy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Firma <strong>{inv.company_name}</strong> vás pozvala ako{" "}
        <strong>{ROLA_POPIS[inv.role] ?? inv.role}</strong>.
      </p>
      <form
        onSubmit={handleAccept}
        className="mt-6 space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            value={inv.email}
            disabled
            className="mt-1 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm"
          />
        </label>
        {!alreadySignedIn && (
          <label className="block">
            <span className="text-sm font-medium">Zvoľte heslo (min. 8 znakov)</span>
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              required
              minLength={8}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
        )}
        {emailMismatch && (
          <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Ste prihlásený ako <strong>{userEmail}</strong>. Pozvánka je pre {inv.email} — buď sa
            odhláste a prijmite ju pod správnym účtom, alebo pokračujte a pripojte túto firmu k
            svojmu súčasnému účtu.
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? "Prijímam…"
            : alreadySignedIn
              ? "Pripojiť k firme"
              : "Vytvoriť účet a pripojiť sa"}
        </button>
      </form>
    </div>
  );
}
