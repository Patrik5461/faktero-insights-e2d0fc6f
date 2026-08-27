import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useOperacia } from "@/lib/mobile/server-most";
import { SERVER } from "@/lib/mobile/operacie";
import { adresaPotvrdenia, overRegistraciu } from "@/lib/mobile/registracia";
import { odlozSuhlasy, zapisOdlozeneSuhlasy } from "@/lib/faktero/pravne-suhlasy";
import { prelozAuthChybu } from "@/lib/faktero/auth-chyby";
import { Logo } from "@/components/faktero/Logo";
import { toast } from "sonner";
import { ArrowLeft, MailCheck } from "lucide-react";

import { usePreklad } from "@/lib/mobile/preklady/hook";
/**
 * Registrácia účtu priamo v telefóne.
 *
 * Appka doteraz posielala nového človeka na faktero.sk — čo znamenalo stiahnuť
 * appku, zistiť, že sa v nej registrovať nedá, ísť do prehliadača a vrátiť sa.
 * Prvý dojem z appky bola slepá ulička.
 *
 * Po účte nasleduje firma, nie nástenka: bez firmy nemá appka kam ukladať
 * doklady. To zariadi obrazovka `VytvorFirmu`, na ktorú sa človek dostane sám,
 * lebo zoznam jeho firiem je po registrácii prázdny.
 */
export function RegistraciaUctu({
  onHotovo,
  onSpat,
}: {
  /** Účet vznikol aj s reláciou — appka môže pokračovať k firme. */
  onHotovo: () => void;
  onSpat: () => void;
}) {
  const { t } = usePreklad();
  const [meno, setMeno] = useState("");
  const [email, setEmail] = useState("");
  const [heslo, setHeslo] = useState("");
  const [podmienky, setPodmienky] = useState(false);
  const [gdpr, setGdpr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cakaNaPotvrdenie, setCakaNaPotvrdenie] = useState(false);
  const [posielamZnova, setPosielamZnova] = useState(false);
  const [overujem, setOverujem] = useState(false);
  const zapisSuhlasy = useOperacia("pravne-suhlasy");

  const presmerovanie = adresaPotvrdenia(
    Capacitor.isNativePlatform(),
    typeof window !== "undefined" ? window.location.origin : null,
    SERVER,
  );

  async function registruj() {
    const chyba = overRegistraciu({ meno, email, heslo, podmienky, gdpr });
    if (chyba) return toast.error(t(chyba));
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: heslo,
        options: { emailRedirectTo: presmerovanie, data: { full_name: meno.trim() } },
      });
      if (error) throw new Error(prelozAuthChybu(error.message).sprava);

      // Súhlas sa odloží vždy. Keď relácia je, zapíše sa hneď; keď účet čaká na
      // potvrdenie e-mailu, zapíše sa pri prvom prihlásení — inak by sa
      // nezaznamenal nikdy, hoci ho človek udelil.
      odlozSuhlasy();
      if (data.session) {
        await zapisOdlozeneSuhlasy(zapisSuhlasy);
        toast.success(t("reg.ucetJeVytvoreny"));
        onHotovo();
        return;
      }
      setCakaNaPotvrdenie(true);
    } catch (e: any) {
      toast.error(e?.message ?? t("reg.registraciaZlyhala"));
    } finally {
      setBusy(false);
    }
  }

  /*
   * Po ťuknutí na odkaz v e-maile sa potvrdenie odohrá v prehliadači — appka
   * o ňom sama nevie a človek by pred ňou ostal stáť. Skúsime sa teda prihlásiť
   * údajmi, ktoré pred chvíľou napísal: keď je už účet potvrdený, prejde to a
   * appka pokračuje k firme.
   */
  const skusPrihlasit = async (ticho: boolean) => {
    if (!ticho) setOverujem(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: heslo,
      });
      if (error) {
        if (!ticho) {
          const p = prelozAuthChybu(error.message);
          toast.error(
            p.nepotvrdeny
              ? t("reg.nepotvrdene")
              : p.sprava,
          );
        }
        return false;
      }
      await zapisOdlozeneSuhlasy(zapisSuhlasy);
      onHotovo();
      return true;
    } finally {
      if (!ticho) setOverujem(false);
    }
  };

  /*
    Cez odkaz, nie cez závislosť efektu: `useOperacia` vracia pri každom
    prekreslení novú funkciu a časovač by sa tým donekonečna zakladal odznova.
  */
  const posledny = useRef(skusPrihlasit);
  posledny.current = skusPrihlasit;

  /*
   * Návrat z prehliadača je presne tá chvíľa, keď je potvrdenie hotové —
   * skúsime to teda samo, bez ťukania. Na webe plugin nie je, tam to zachytí
   * opakovaný pokus nižšie.
   */
  useEffect(() => {
    if (!cakaNaPotvrdenie) return;
    let odstran: (() => void) | undefined;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void posledny.current(true);
        });
        odstran = () => h.remove();
      } catch {
        /* mimo appky plugin neexistuje */
      }
    })();
    // Poistka pre web a pre prípad, že sa potvrdzuje na inom zariadení.
    // Riedko, nech sa neklope na server zbytočne — a nie donekonečna.
    let zostava = 30;
    const casovac = setInterval(() => {
      if (zostava-- <= 0) return clearInterval(casovac);
      void posledny.current(true);
    }, 10_000);
    return () => {
      odstran?.();
      clearInterval(casovac);
    };
  }, [cakaNaPotvrdenie]);

  async function posliZnova() {
    setPosielamZnova(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: presmerovanie },
    });
    setPosielamZnova(false);
    if (error) return toast.error(prelozAuthChybu(error.message).sprava);
    toast.success(t("reg.emailPoslanyZnova"));
  }

  const ramec = "flex min-h-[100dvh] flex-col justify-center bg-background px-6";
  const odsadenie = {
    paddingTop: "calc(var(--safe-top) + 2rem)",
    paddingBottom: "calc(var(--safe-bottom) + 2rem)",
  };

  if (cakaNaPotvrdenie) {
    return (
      <div className={ramec} style={odsadenie}>
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <MailCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("reg.potvrdteEmail")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("reg.potvrdenieText", { email: email.trim() })}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("reg.spamPriecinok")}
          </p>
          <button
            onClick={() => skusPrihlasit(false)}
            disabled={overujem}
            style={overujem ? undefined : { backgroundImage: "var(--brand-gradient)" }}
            className="mt-6 w-full rounded-xl px-4 py-3 text-base font-medium text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground"
          >
            {overujem ? t("reg.overujem") : t("reg.uzSomPotvrdil")}
          </button>
          <button
            onClick={posliZnova}
            disabled={posielamZnova}
            className="mt-3 w-full rounded-xl border border-border px-4 py-3 text-base disabled:opacity-60"
          >
            {posielamZnova ? t("reg.posielam") : t("reg.poslatZnova")}
          </button>
          <button onClick={onSpat} className="mt-3 w-full py-2 text-center text-sm text-primary">
            {t("reg.spatNaPrihlasenie")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={ramec} style={odsadenie}>
      <div className="mx-auto w-full max-w-sm">
        <Logo variant="header" className="mb-8 h-9" />
        <h1 className="text-2xl font-semibold tracking-tight">{t("reg.vytvorteSiUcet")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("reg.zadarmo")}
        </p>

        <div className="mt-6 space-y-3">
          <input
            type="text"
            autoComplete="name"
            placeholder={t("reg.meno")}
            value={meno}
            onChange={(e) => setMeno(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base"
          />
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="email"
            placeholder={t("reg.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("reg.heslo")}
            value={heslo}
            onChange={(e) => setHeslo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && registruj()}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base"
          />
        </div>

        <div className="mt-4 space-y-3">
          <Suhlas checked={podmienky} onChange={setPodmienky}>
            <SOdkazom text={t("reg.suhlasPodmienky")} cesta="/pravne/obchodne-podmienky">
              {t("reg.obchodnePodmienky")}
            </SOdkazom>
          </Suhlas>
          <Suhlas checked={gdpr} onChange={setGdpr}>
            <SOdkazom text={t("reg.suhlasGdpr")} cesta="/pravne/gdpr">
              {t("reg.spracuvanieUdajov")}
            </SOdkazom>
          </Suhlas>
        </div>

        <button
          onClick={registruj}
          disabled={busy}
          style={busy ? undefined : { backgroundImage: "var(--brand-gradient)" }}
          className="mt-5 w-full rounded-xl px-4 py-3 text-base font-medium text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground"
        >
          {busy ? t("reg.vytvaram") : t("reg.vytvoritUcet")}
        </button>

        <button
          onClick={onSpat}
          className="mt-4 flex w-full items-center justify-center gap-2 py-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("reg.uzMamUcet")}
        </button>
      </div>
    </div>
  );
}

function Suhlas({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 text-sm leading-snug">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        /* Palcom sa musí trafiť — na telefóne je predvolená veľkosť políčka priúzka. */
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
      />
      <span>{children}</span>
    </label>
  );
}

/**
 * Právne dokumenty žijú na webe. V zabalenej appke ich otvorí systémový
 * prehliadač, takže sa človek nestratí mimo appky a späť sa vráti jedným ťuknutím.
 */
/**
 * Veta so vloženým odkazom.
 *
 * Text nie je poskladaný z kúskov: v každom jazyku stojí odkaz inde vo vete
 * („Ich stimme den AGB zu."), takže sa vkladá do miesta označeného `{odkaz}`.
 */
function SOdkazom({
  text,
  cesta,
  children,
}: {
  text: string;
  cesta: string;
  children: React.ReactNode;
}) {
  const [pred, po = ""] = text.split("{odkaz}");
  return (
    <>
      {pred}
      <OdkazNaWeb cesta={cesta}>{children}</OdkazNaWeb>
      {po}
    </>
  );
}

function OdkazNaWeb({ cesta, children }: { cesta: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.open(`${SERVER}${cesta}`, "_blank", "noopener")}
      className="text-primary underline"
    >
      {children}
    </button>
  );
}
