import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/faktero/Logo";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getInvitationByTokenFn, acceptInvitationFn } from "@/lib/faktero/invitations.functions";
import { registrujPozvanehoFn } from "@/lib/faktero/registracia.functions";
import { setActiveCompanyId } from "@/lib/faktero/active-company";
import { toast } from "sonner";
import { prelozAuthChybu } from "@/lib/faktero/auth-chyby";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

/** Rola z databázy po slovensky — v pozvánke svietilo „accountant". */
const ROLA_POPIS: Record<string, string> = {
  owner: "majiteľ",
  admin: "administrátor",
  accountant: "účtovník",
  employee: "používateľ",
};

export const Route = createFileRoute("/pridat-pouzivatela")({
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Pozvánka do firmy — Faktero") }],
  }),
  component: AcceptInvitationPage,
  validateSearch: (s: Record<string, unknown>) => ({ token: (s.token as string) ?? "" }),
});

/** Logo nad každým stavom stránky — predtým bola chybová hláška sama na prázdnej ploche. */
function Obal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto mb-8 flex max-w-md justify-center">
        <Link to="/" aria-label="Faktero">
          <Logo className="h-9 w-[144px]" />
        </Link>
      </div>
      <div className={`mx-auto max-w-md ${className}`}>{children}</div>
    </div>
  );
}

function AcceptInvitationPage() {
  const { t, jazyk } = useT();
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const getInv = useServerFn(getInvitationByTokenFn);
  const acceptInv = useServerFn(acceptInvitationFn);
  const registrujPozvaneho = useServerFn(registrujPozvanehoFn);
  const [inv, setInv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  /** Účet čaká na potvrdenie e-mailu — pozvánka sa prijme až po kliknutí na odkaz. */
  const [cakaNaPotvrdenie, setCakaNaPotvrdenie] = useState(false);
  const automaticky = useRef(false);

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
          toast.error(t("Heslo musí mať aspoň 8 znakov"));
          setBusy(false);
          return;
        }
        /*
          Účet zakladá server — overí token pozvánky a adresu vezme z nej.
          Priamy `signUp` z prehliadača by po vypnutí verejnej registrácie
          v Supabase prestal fungovať.
        */
        const reg = await registrujPozvaneho({ data: { token, heslo: pwd, jazyk } });
        if (!reg.ok) throw new Error(t(reg.sprava, reg.parametre));
        if (reg.existuje) {
          // Adresa už účet má — pripojí sa ním, ak heslo sedí.
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: inv.email,
            password: pwd,
          });
          if (signInErr) {
            const p = prelozAuthChybu(signInErr.message);
            throw new Error(
              p.nepotvrdeny
                ? t(p.sprava)
                : t("S touto adresou už účet existuje. Zadajte jeho heslo, alebo si ho obnovte cez „Zabudnuté heslo“."),
            );
          }
        } else {
          /*
            Nový účet musí najprv potvrdiť e-mail. Bez prihlásenia server
            pozvánku prijať nevie — predtým tu vyskočilo anglické
            „Unauthorized“. Odkaz z e-mailu vráti človeka sem a pozvánka sa
            prijme sama.
          */
          if (!reg.emailOdoslany) {
            toast.error(t("Účet je vytvorený, ale potvrdzovací e-mail sa nepodarilo odoslať. Skúste to o chvíľu znova."));
          }
          setCakaNaPotvrdenie(true);
          return;
        }
      }
      await acceptInv({ data: { token } });
      setActiveCompanyId(inv.company_id);
      toast.success(t("Pripojili ste sa k firme {firma}", { firma: inv.company_name }));
      navigate({ to: "/dashboard" });
    } catch (e: any) {
      toast.error(e?.message ?? t("Chyba pri prijímaní pozvánky"));
    } finally {
      setBusy(false);
    }
  }

  // Po návrate z potvrdzovacieho e-mailu je človek prihlásený tou istou
  // adresou — pozvánka sa prijme bez ďalšieho klikania.
  useEffect(() => {
    if (automaticky.current || !inv?.valid || !userEmail) return;
    if (userEmail.toLowerCase() !== String(inv.email).toLowerCase()) return;
    automaticky.current = true;
    void handleAccept({ preventDefault() {} } as React.FormEvent);
    // eslint-disable-next-line
  }, [inv, userEmail]);

  if (cakaNaPotvrdenie)
    return (
      <Obal>
        <h1 className="text-2xl font-bold">{t("Potvrďte e-mail")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Na adresu")} <strong className="text-foreground">{inv?.email}</strong>{" "}
          {t("sme poslali odkaz na potvrdenie účtu. Kliknite naň — vrátite sa sem a pripojíte sa k firme")}{" "}
          <strong className="text-foreground">{inv?.company_name}</strong>.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("E-mail neprišiel? Pozrite aj priečinok nevyžiadanej pošty.")}
        </p>
      </Obal>
    );

  if (loading)
    return <Obal className="text-center text-sm text-muted-foreground">{t("Načítavam pozvánku…")}</Obal>;

  if (!token || !inv || !inv.valid) {
    return (
      <Obal className="text-center">
        <h1 className="text-2xl font-bold">{t("Neplatná pozvánka")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {inv?.reason === "expired"
            ? t("Platnosť pozvánky vypršala.")
            : inv?.reason === "already_accepted"
              ? t("Pozvánka už bola využitá.")
              : t("Odkaz je neplatný.")}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Ak už účet máte, prihláste sa. O novú pozvánku požiadajte toho, kto vás do firmy pozval.")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/prihlasenie"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t("Prihlásiť sa")}
          </Link>
          <Link
            to="/"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
          >
            {t("Na úvodnú stránku")}
          </Link>
        </div>
      </Obal>
    );
  }

  const alreadySignedIn = !!userEmail;
  const emailMismatch = alreadySignedIn && userEmail?.toLowerCase() !== inv.email.toLowerCase();

  return (
    <Obal>
      <h1 className="text-2xl font-bold">{t("Pozvánka do firmy")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("Firma")} <strong>{inv.company_name}</strong> {t("vás pozvala ako")}{" "}
        <strong>{ROLA_POPIS[inv.role] ? t(ROLA_POPIS[inv.role]) : inv.role}</strong>.
      </p>
      <form
        onSubmit={handleAccept}
        className="mt-6 space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <label className="block">
          <span className="text-sm font-medium">{t("E-mail")}</span>
          <input
            value={inv.email}
            disabled
            className="mt-1 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm"
          />
        </label>
        {!alreadySignedIn && (
          <label className="block">
            <span className="text-sm font-medium">{t("Zvoľte heslo (min. 8 znakov)")}</span>
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
            {t("Ste prihlásený ako")} <strong>{userEmail}</strong>.{" "}
            {t(
              "Pozvánka je pre {email} — buď sa odhláste a prijmite ju pod správnym účtom, alebo pokračujte a pripojte túto firmu k svojmu súčasnému účtu.",
              { email: inv.email },
            )}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? t("Prijímam…")
            : alreadySignedIn
              ? t("Pripojiť k firme")
              : t("Vytvoriť účet a pripojiť sa")}
        </button>
      </form>
    </Obal>
  );
}
