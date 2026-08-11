import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { prelozAuthChybu } from "@/lib/faktero/auth-chyby";
import { recordLegalAcceptance } from "@/lib/legal.functions";
import { LEGAL_VERSION } from "@/components/faktero/LegalShell";
import { Logo } from "@/components/faktero/Logo";
import { MailCheck } from "lucide-react";

export const Route = createFileRoute("/registracia")({
  head: () => ({
    meta: [
      { title: "Registrácia — Faktero" },
      { name: "description", content: "Vytvorte si účet vo Faktere zdarma." },
    ],
  }),
  /** `?plan=` prichádza z objednávky — voľbu si prenesieme až za nastavenie firmy. */
  validateSearch: (s: Record<string, unknown>): { plan?: string } => ({
    plan: typeof s.plan === "string" && s.plan ? s.plan : undefined,
  }),
  component: RegisterPage,
});

/** Kľúč, pod ktorým prežije vybraný plán prihlásenie cez Google aj onboarding. */
export const PLAN_PENDING_KEY = "faktero_plan_pending";

function RegisterPage() {
  const navigate = useNavigate();
  const { plan } = Route.useSearch();

  /** Voľbu plánu si odložíme rovnako ako súhlasy — prežije presmerovanie z Googlu. */
  function stashPlan() {
    if (!plan) return;
    try {
      sessionStorage.setItem(PLAN_PENDING_KEY, plan);
    } catch {
      // sessionStorage môže byť zakázané — používateľ si plán vyberie znova
    }
  }
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptGdpr, setAcceptGdpr] = useState(false);
  /* Účet vznikol, ale čaká na potvrdenie e-mailu — bez neho sa ďalej nedostane. */
  const [cakaNaPotvrdenie, setCakaNaPotvrdenie] = useState(false);
  const [posielamZnova, setPosielamZnova] = useState(false);

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
    if (error) return toast.error(prelozAuthChybu(error.message).sprava);
    if (data.user?.id && data.session) await persistAcceptances();
    stashPlan();

    /*
     * Bez potvrdeného e-mailu Supabase reláciu nevydá. Doteraz sa aj tak
     * pokračovalo na /onboarding, odkiaľ človeka ochrana trás vyhodila späť na
     * prihlásenie — po úspešnej registrácii, s hláškou „Účet vytvorený".
     * Vyzeralo to ako pokazená aplikácia. Preto sa to teraz povie rovno.
     */
    if (!data.session) {
      setCakaNaPotvrdenie(true);
      return;
    }

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
    stashPlan();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/onboarding" },
    });
    if (error) toast.error(error.message);
  }

  async function posliPotvrdenieZnova() {
    setPosielamZnova(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setPosielamZnova(false);
    if (error) return toast.error(prelozAuthChybu(error.message).sprava);
    toast.success("E-mail sme poslali znova.");
  }

  if (cakaNaPotvrdenie) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
          <Link to="/" className="mb-6 inline-flex items-center">
            <Logo variant="header" className="h-8" />
          </Link>
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <MailCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Potvrďte si e-mail</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Účet <strong className="text-foreground">{email}</strong> je vytvorený. Poslali sme naň
            odkaz — otvorte ho a budete rovno v aplikácii. Bez potvrdenia sa prihlásiť nedá.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Ak e-mail do pár minút nepríde, pozrite si priečinok s nevyžiadanou poštou.
          </p>
          <button
            onClick={posliPotvrdenieZnova}
            disabled={posielamZnova}
            className="mt-6 w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary disabled:opacity-60"
          >
            {posielamZnova ? "Posielam…" : "Poslať e-mail znova"}
          </button>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Už potvrdené?{" "}
            <Link to="/prihlasenie" className="font-medium text-primary hover:underline">
              Prihlásiť sa
            </Link>
          </p>
        </div>
      </div>
    );
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
          {/*
            Pole je vnútri <label>, takže patrí k svojmu popisu — ťuknutie na
            popis kurzor postaví do poľa a čítačka obrazovky vie, čo sa pýta.
            Predtým to boli dva nezávislé prvky vedľa seba.

            `autoComplete` je tu kvôli telefónu: bez neho správca hesiel ani
            iOS nevedia, čo do poľa patrí, a registrácia sa vypĺňa ručne.
          */}
          <label className="block">
            <span className="text-sm font-medium">Meno a priezvisko</span>
            <input
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Heslo</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
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
