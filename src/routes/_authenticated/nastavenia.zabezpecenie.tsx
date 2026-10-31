import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, LogOut, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/faktero/AppShell";
import { prelozAuthChybu } from "@/lib/faktero/auth-chyby";
import {
  dokonciZapinanie,
  overenyFaktor,
  vypni,
  zacniZapinanie,
} from "@/lib/faktero/dvojfaktor";
import { potvrd as potvrdAkciu } from "@/lib/potvrdenie";
import { useT } from "@/lib/i18n/useT";
import { preloz } from "@/lib/i18n/jazyk";

export const Route = createFileRoute("/_authenticated/nastavenia/zabezpecenie")({
  // `?admin=1` — sem posiela /admin administrátora bez dvojfaktorového overenia.
  validateSearch: (s: Record<string, unknown>): { admin?: 1 } =>
    s.admin === 1 || s.admin === "1" ? { admin: 1 } : {},
  head: ({ match }) => ({
    meta: [{ title: preloz(match.context.jazyk ?? "sk", "Zabezpečenie účtu — Faktero") }],
  }),
  component: ZabezpeceniePage,
});

function ZabezpeceniePage() {
  const { t } = useT();
  const { admin } = Route.useSearch();
  return (
    <>
      <PageHeader title={t("Zabezpečenie účtu")} description={t("Heslo a dvojfaktorové overenie vášho účtu.")} />
      <PageBody>
        <div className="mx-auto grid max-w-2xl gap-6">
          {admin === 1 && (
            <div
              role="alert"
              className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200"
            >
              {t(
                "Administrácia platformy je prístupná len s dvojfaktorovým overením. Zapnite ho nižšie — hneď potom sa do administrácie dostanete. Ak ho už máte zapnuté, odhláste sa a prihláste znova s kódom.",
              )}{" "}
              <Link to="/admin" className="font-medium underline">
                {t("Späť do administrácie")}
              </Link>
            </div>
          )}
          <Dvojfaktor />
          <ZmenaHesla />
          <OdhlasitOstatne />
        </div>
      </PageBody>
    </>
  );
}

function Dvojfaktor() {
  const { t } = useT();
  const [faktor, setFaktor] = useState<{ id: string } | null | undefined>(undefined);
  const [zapinanie, setZapinanie] = useState<{ factorId: string; qr: string; tajomstvo: string } | null>(null);
  const [kod, setKod] = useState("");
  const [pracujem, setPracujem] = useState(false);

  async function nacitaj() {
    try {
      setFaktor(await overenyFaktor());
    } catch {
      setFaktor(null);
    }
  }
  useEffect(() => {
    void nacitaj();
  }, []);

  async function zacni() {
    setPracujem(true);
    try {
      setZapinanie(await zacniZapinanie());
      setKod("");
    } catch (e: any) {
      toast.error(e?.message ?? t("Zapnutie sa nepodarilo."));
    } finally {
      setPracujem(false);
    }
  }

  async function potvrd(e: React.FormEvent) {
    e.preventDefault();
    if (!zapinanie) return;
    setPracujem(true);
    try {
      await dokonciZapinanie(zapinanie.factorId, kod);
      setZapinanie(null);
      toast.success(t("Dvojfaktorové overenie je zapnuté."));
      await nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? t("Kód nesedí."));
    } finally {
      setPracujem(false);
    }
  }

  async function vypnut() {
    if (!faktor) return;
    if (!(await potvrdAkciu(t("Naozaj vypnúť dvojfaktorové overenie? Na prihlásenie potom bude stačiť heslo.")))) return;
    setPracujem(true);
    try {
      await vypni(faktor.id);
      toast.success(t("Dvojfaktorové overenie je vypnuté."));
      await nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? t("Vypnutie sa nepodarilo."));
    } finally {
      setPracujem(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">{t("Dvojfaktorové overenie")}</h2>
        {faktor && (
          <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {t("zapnuté")}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(
          "Pri prihlásení sa okrem hesla zadá aj 6-miestny kód z overovacej appky v telefóne (Google Authenticator, Microsoft Authenticator, 1Password…). Kto pozná vaše heslo, sa bez telefónu do účtu nedostane. Kód sa pýta len pri prihlásení — na zariadení, kde ste prihlásený, až do odhlásenia nie.",
        )}
      </p>

      {faktor === undefined ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("Načítavam…")}</p>
      ) : faktor ? (
        <button
          onClick={vypnut}
          disabled={pracujem}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
        >
          <ShieldOff className="h-4 w-4" /> {t("Vypnúť")}
        </button>
      ) : zapinanie ? (
        <form onSubmit={potvrd} className="mt-4 space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t("V overovacej appke zvoľte pridanie účtu a naskenujte QR kód.")}</li>
            <li>{t("Zadajte kód, ktorý appka ukáže.")}</li>
          </ol>
          <div className="flex flex-wrap items-center gap-6">
            <img src={zapinanie.qr} alt={t("QR kód pre overovaciu appku")} className="h-44 w-44 rounded-lg border border-border bg-white p-2" />
            <div className="min-w-0 text-xs text-muted-foreground">
              {t("Nejde naskenovať? Zadajte kľúč ručne:")}
              <code className="mt-1 block break-all rounded bg-secondary px-2 py-1 font-mono text-foreground">
                {zapinanie.tajomstvo}
              </code>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={kod}
              onChange={(e) => setKod(e.target.value)}
              aria-label={t("Kód z overovacej appky")}
              placeholder="123 456"
              className="w-40 rounded-md border border-input bg-background px-3 py-2 text-center font-mono text-lg tracking-widest"
            />
            <button
              type="submit"
              disabled={pracujem}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {pracujem && <Loader2 className="h-4 w-4 animate-spin" />} {t("Zapnúť")}
            </button>
            <button type="button" onClick={() => setZapinanie(null)} className="rounded-md border border-border px-3 py-2 text-sm">
              {t("Zrušiť")}
            </button>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t(
              "Mobilné appky vedia kód zadať od najbližšej verzie. Kým ju nemáte, v appke sa po zapnutí neukážu údaje — odhláste sa v nej a prihláste znova po aktualizácii.",
            )}
          </p>
        </form>
      ) : (
        <button
          onClick={zacni}
          disabled={pracujem}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pracujem ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {t("Zapnúť")}
        </button>
      )}
    </section>
  );
}

function ZmenaHesla() {
  const { t } = useT();
  const [heslo, setHeslo] = useState("");
  const [znova, setZnova] = useState("");
  const [ukladam, setUkladam] = useState(false);

  async function uloz(e: React.FormEvent) {
    e.preventDefault();
    if (heslo.length < 8) return toast.error(t("Heslo musí mať aspoň 8 znakov."));
    if (heslo !== znova) return toast.error(t("Heslá sa nezhodujú."));
    setUkladam(true);
    const { error } = await supabase.auth.updateUser({ password: heslo });
    setUkladam(false);
    if (error) return toast.error(t(prelozAuthChybu(error.message).sprava));
    setHeslo("");
    setZnova("");
    toast.success(t("Heslo je zmenené."));
  }

  const pole = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">{t("Zmena hesla")}</h2>
      </div>
      <form onSubmit={uloz} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">{t("Nové heslo")}</span>
          <input type="password" autoComplete="new-password" minLength={8} required value={heslo} onChange={(e) => setHeslo(e.target.value)} className={pole} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{t("Nové heslo znova")}</span>
          <input type="password" autoComplete="new-password" minLength={8} required value={znova} onChange={(e) => setZnova(e.target.value)} className={pole} />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={ukladam}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {ukladam && <Loader2 className="h-4 w-4 animate-spin" />} {t("Zmeniť heslo")}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Aspoň 8 znakov. Heslo, ktoré uniklo z iných služieb, neprejde.")}
          </p>
        </div>
      </form>
    </section>
  );
}

/**
 * Odhlási všetky ostatné zariadenia (stratený telefón, cudzí počítač). Toto
 * zariadenie ostane prihlásené. Server relácie overuje, takže starý token
 * prestane platiť najneskôr do minúty.
 */
function OdhlasitOstatne() {
  const { t } = useT();
  const [pracujem, setPracujem] = useState(false);

  async function odhlas() {
    const ano = await potvrdAkciu(
      t(
        "Odhlásiť všetky ostatné zariadenia? Toto zariadenie ostane prihlásené, na ostatných (telefón, iný počítač) sa bude treba prihlásiť znova.",
      ),
      { potvrdit: t("Odhlásiť ostatné"), nebezpecne: true },
    );
    if (!ano) return;
    setPracujem(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      toast.success(t("Ostatné zariadenia sú odhlásené."));
    } catch (e: any) {
      toast.error(t(prelozAuthChybu(e?.message ?? "Odhlásenie sa nepodarilo.").sprava));
    } finally {
      setPracujem(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <LogOut className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">{t("Prihlásené zariadenia")}</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(
          "Stratili ste telefón alebo ste sa prihlásili na cudzom počítači? Odhláste všetky ostatné zariadenia naraz. Ak máte podozrenie, že niekto pozná vaše heslo, zmeňte ho aj vyššie.",
        )}
      </p>
      <button
        type="button"
        onClick={odhlas}
        disabled={pracujem}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
      >
        {pracujem ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}{" "}
        {t("Odhlásiť ostatné zariadenia")}
      </button>
    </section>
  );
}
