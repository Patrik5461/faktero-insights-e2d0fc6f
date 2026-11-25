import { createFileRoute, Link } from "@tanstack/react-router";
import { PoleHesla } from "@/components/faktero/PoleHesla";
import { useWebRedizajn } from "@/lib/faktero/web-redizajn";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { prelozAuthChybu } from "@/lib/faktero/auth-chyby";
import { useServerFn } from "@tanstack/react-start";
import { nastavenieRegistracieFn, registrujUcetFn } from "@/lib/faktero/registracia.functions";
import { odlozSuhlasy } from "@/lib/faktero/pravne-suhlasy";
import { TurnstileWidget } from "@/components/faktero/TurnstileWidget";
import { Logo } from "@/components/faktero/Logo";
import { MailCheck } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";
import { normalizujKodPartnera } from "@/lib/faktero/partner-program";
import {
  normalizujTypUctu,
  odlozKodPartnera,
  odlozTypUctu,
  type TypUctu,
} from "@/lib/faktero/partner-odkaz";

export const Route = createFileRoute("/registracia")({
  head: ({ match }) => ({
    meta: [
      { title: preloz(match.context.jazyk ?? "sk", "Registrácia — Faktero") },
      {
        name: "description",
        content: preloz(match.context.jazyk ?? "sk", "Vytvorte si účet vo Faktere zdarma."),
      },
    ],
  }),
  /**
   * `?plan=` prichádza z objednávky — voľbu si prenesieme až za nastavenie firmy.
   * `?partner=` je odkaz na odporúčanie účtovnej kancelárie (partnerský program).
   * `?typ=uctovnik` predvolí voľbu „Som účtovník“ (odkaz zo stránky programu).
   */
  validateSearch: (
    s: Record<string, unknown>,
  ): { plan?: string; partner?: string; typ?: TypUctu } => ({
    plan: typeof s.plan === "string" && s.plan ? s.plan : undefined,
    partner: normalizujKodPartnera(s.partner) ?? undefined,
    typ: normalizujTypUctu(s.typ) ?? undefined,
  }),
  /* Verejný kľúč captchy je v env servera (ecosystem), nie v builde. */
  loader: () => nastavenieRegistracieFn(),
  component: RegisterPage,
});

/** Kľúč, pod ktorým prežije vybraný plán prihlásenie cez Google aj onboarding. */
export const PLAN_PENDING_KEY = "faktero_plan_pending";

function RegisterPage() {
  // Vzhľad webu (redizajn) aj mimo AppShell — len web, appka túto stránku nemá.
  useWebRedizajn();
  const { t, jazyk } = useT();
  const { plan, partner, typ: typZOdkazu } = Route.useSearch();
  const { siteKey } = Route.useLoaderData();
  /*
    Firma alebo účtovník. Klient, ktorý prišiel cez odkaz kancelárie, je firma
    a voľbu nevidí. Účtovníka onboarding po založení firmy zavedie na
    prihlášku do partnerského programu; schvaľuje ju admin.
  */
  const [typUctu, setTypUctu] = useState<TypUctu>(
    !partner && typZOdkazu === "uctovnik" ? "uctovnik" : "firma",
  );
  useEffect(() => {
    odlozTypUctu(partner ? "firma" : typUctu);
  }, [typUctu, partner]);

  /*
    Kód partnera si odložíme hneď (localStorage) — uplatní sa po založení
    firmy, aj keď sa človek vráti cez potvrdenie e-mailu v inom okne alebo
    sa prihlási Googlom.
  */
  useEffect(() => {
    if (partner) odlozKodPartnera(partner);
  }, [partner]);

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
  const registruj = useServerFn(registrujUcetFn);
  /* Token captchy; jednorazový, po každom odoslaní sa widget resetuje. */
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetCaptchy, setResetCaptchy] = useState(0);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptGdpr, setAcceptGdpr] = useState(false);
  /* Účet vznikol, ale čaká na potvrdenie e-mailu — bez neho sa ďalej nedostane. */
  const [cakaNaPotvrdenie, setCakaNaPotvrdenie] = useState(false);
  const [posielamZnova, setPosielamZnova] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptTerms || !acceptGdpr) {
      toast.error(t("Pre pokračovanie potvrďte obidva súhlasy."));
      return;
    }
    if (!captcha) {
      toast.error(t("Počkajte, kým sa dokončí overenie, že nie ste robot."));
      return;
    }
    setLoading(true);
    /*
      Účet zakladá server: overí captchu, limit pokusov, jednorazovú doménu
      a MX a pošle potvrdzovací e-mail (odkaz na /auth/potvrdenie). Priamy
      `signUp` z prehliadača sa nepoužíva — verejná registrácia v Supabase
      sa dá potom vypnúť a falošné účty nemajú kade vznikať.
    */
    let vysledok: Awaited<ReturnType<typeof registruj>>;
    try {
      vysledok = await registruj({
        data: {
          email,
          heslo: password,
          meno: fullName,
          jazyk,
          token: captcha,
          podmienky: acceptTerms,
          gdpr: acceptGdpr,
        },
      });
    } catch (e: any) {
      setLoading(false);
      setResetCaptchy((x) => x + 1);
      return toast.error(t(prelozAuthChybu(e?.message).sprava));
    }
    setLoading(false);
    // Token je spotrebovaný v každom prípade — aj po úspechu (späť na formulár).
    setResetCaptchy((x) => x + 1);
    if (!vysledok.ok) return toast.error(t(vysledok.sprava, vysledok.parametre));

    /*
      Súhlasy zapisuje server hneď pri založení účtu. Keď sa to nepodarí
      (alebo účet s adresou už existoval), odložia sa a zapíše ich prvé
      prihlásenie ako doteraz.
    */
    if (!vysledok.suhlasyZapisane) odlozSuhlasy();
    stashPlan();
    if (!vysledok.emailOdoslany) {
      toast.error(
        t(
          "Účet je vytvorený, ale potvrdzovací e-mail sa nepodarilo odoslať. Kliknite na „Poslať e-mail znova“.",
        ),
      );
    }
    /*
     * Bez potvrdeného e-mailu Supabase reláciu nevydá — účet z registrácie
     * je vždy nepotvrdený, takže sa vždy čaká na odkaz z e-mailu.
     */
    setCakaNaPotvrdenie(true);
  }

  async function posliPotvrdenieZnova() {
    setPosielamZnova(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setPosielamZnova(false);
    if (error) return toast.error(t(prelozAuthChybu(error.message).sprava));
    toast.success(t("E-mail sme poslali znova."));
  }

  if (cakaNaPotvrdenie) {
    return (
      <main
        id="obsah"
        tabIndex={-1}
        className="grid min-h-screen place-items-center bg-page px-4 py-10 outline-none"
      >
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <Link to="/" className="mb-6 inline-flex items-center">
            <Logo variant="header" className="h-8" />
          </Link>
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <MailCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t("Potvrďte si e-mail")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Účet")} <strong className="text-foreground">{email}</strong>{" "}
            {t(
              "je vytvorený. Poslali sme naň odkaz — otvorte ho a budete rovno v aplikácii. Bez potvrdenia sa prihlásiť nedá.",
            )}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Ak e-mail do pár minút nepríde, pozrite si priečinok s nevyžiadanou poštou.")}
          </p>
          <button
            onClick={posliPotvrdenieZnova}
            disabled={posielamZnova}
            className="mt-6 w-full rounded-md border border-input bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
          >
            {posielamZnova ? t("Posielam…") : t("Poslať e-mail znova")}
          </button>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("Už potvrdené?")}{" "}
            <Link to="/prihlasenie" className="font-medium text-primary hover:underline">
              {t("Prihlásiť sa")}
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      id="obsah"
      tabIndex={-1}
      className="grid min-h-screen place-items-center bg-page px-4 py-10 outline-none"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <Link to="/" className="mb-6 inline-flex items-center">
          <Logo variant="header" className="h-8" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("Vytvorte si účet")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("30 dní zadarmo na pláne Premium. Bez platobnej karty.")}
        </p>
        {partner && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Registrujete sa cez odporúčanie vašej účtovnej kancelárie.")}
          </p>
        )}

        {!partner && (
          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">{t("Kto ste?")}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  [
                    "firma",
                    t("Firma alebo živnostník"),
                    t("Fakturujem a vediem doklady svojej firmy."),
                  ],
                  [
                    "uctovnik",
                    t("Účtovník alebo kancelária"),
                    t("Vediem účtovníctvo klientom. Ponúkneme vám partnerský program."),
                  ],
                ] as const
              ).map(([hodnota, nazov, popis]) => (
                <label
                  key={hodnota}
                  className={`flex min-w-0 cursor-pointer gap-2 rounded-lg border p-3 text-sm transition-colors ${
                    typUctu === hodnota
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-input bg-background hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="typ-uctu"
                    value={hodnota}
                    checked={typUctu === hodnota}
                    onChange={() => setTypUctu(hodnota)}
                    className="mt-0.5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">{nazov}</span>
                    <span className="block text-xs text-muted-foreground">{popis}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          {/*
            Pole je vnútri <label>, takže patrí k svojmu popisu — ťuknutie na
            popis kurzor postaví do poľa a čítačka obrazovky vie, čo sa pýta.
            Predtým to boli dva nezávislé prvky vedľa seba.

            `autoComplete` je tu kvôli telefónu: bez neho správca hesiel ani
            iOS nevedia, čo do poľa patrí, a registrácia sa vypĺňa ručne.
          */}
          <label className="block">
            <span className="text-sm font-semibold">{t("Meno a priezvisko")}</span>
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
            <span className="text-sm font-semibold">{t("Email")}</span>
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
            <span className="text-sm font-semibold">{t("Heslo")}</span>
            <PoleHesla
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              obal="mt-1"
              popisZobraz={t("Zobraziť heslo")}
              popisSkry={t("Skryť heslo")}
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
                {t("Súhlasím s")}{" "}
                <Link
                  to="/pravne/obchodne-podmienky"
                  target="_blank"
                  className="text-primary underline"
                >
                  {t("Obchodnými podmienkami")}
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
                {t("Beriem na vedomie")}{" "}
                <Link to="/pravne/gdpr" target="_blank" className="text-primary underline">
                  {t("Spracúvanie osobných údajov")}
                </Link>
                .
              </span>
            </label>
          </div>
          <TurnstileWidget
            siteKey={siteKey}
            jazyk={jazyk}
            akcia="registracia"
            onToken={setCaptcha}
            reset={resetCaptchy}
            popis={t("Overenie, že nie ste robot")}
            chybaNacitania={t(
              "Overenie sa nenačítalo — skontrolujte blokovanie reklám alebo obnovte stránku.",
            )}
            className="pt-2"
          />
          <button
            type="submit"
            disabled={loading || !acceptTerms || !acceptGdpr}
            className="mt-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {loading ? t("Vytváram...") : t("Vytvoriť účet")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("Už máte účet?")}{" "}
          <Link to="/prihlasenie" className="font-medium text-primary hover:underline">
            {t("Prihlásiť sa")}
          </Link>
        </p>
      </div>
    </main>
  );
}
