import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/nastavenia/zabezpecenie")({
  head: () => ({ meta: [{ title: "Zabezpečenie účtu — Faktero" }] }),
  component: ZabezpeceniePage,
});

function ZabezpeceniePage() {
  return (
    <>
      <PageHeader title="Zabezpečenie účtu" description="Heslo a dvojfaktorové overenie vášho účtu." />
      <PageBody>
        <div className="mx-auto grid max-w-2xl gap-6">
          <Dvojfaktor />
          <ZmenaHesla />
        </div>
      </PageBody>
    </>
  );
}

function Dvojfaktor() {
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
      toast.error(e?.message ?? "Zapnutie sa nepodarilo.");
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
      toast.success("Dvojfaktorové overenie je zapnuté.");
      await nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? "Kód nesedí.");
    } finally {
      setPracujem(false);
    }
  }

  async function vypnut() {
    if (!faktor) return;
    if (!confirm("Naozaj vypnúť dvojfaktorové overenie? Na prihlásenie potom bude stačiť heslo.")) return;
    setPracujem(true);
    try {
      await vypni(faktor.id);
      toast.success("Dvojfaktorové overenie je vypnuté.");
      await nacitaj();
    } catch (e: any) {
      toast.error(e?.message ?? "Vypnutie sa nepodarilo.");
    } finally {
      setPracujem(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">Dvojfaktorové overenie</h2>
        {faktor && (
          <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            zapnuté
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Pri prihlásení sa okrem hesla zadá aj 6-miestny kód z overovacej appky v telefóne (Google
        Authenticator, Microsoft Authenticator, 1Password…). Kto pozná vaše heslo, sa bez telefónu
        do účtu nedostane. Kód sa pýta len pri prihlásení — na zariadení, kde ste prihlásený,
        až do odhlásenia nie.
      </p>

      {faktor === undefined ? (
        <p className="mt-4 text-sm text-muted-foreground">Načítavam…</p>
      ) : faktor ? (
        <button
          onClick={vypnut}
          disabled={pracujem}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
        >
          <ShieldOff className="h-4 w-4" /> Vypnúť
        </button>
      ) : zapinanie ? (
        <form onSubmit={potvrd} className="mt-4 space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>V overovacej appke zvoľte pridanie účtu a naskenujte QR kód.</li>
            <li>Zadajte kód, ktorý appka ukáže.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-6">
            <img src={zapinanie.qr} alt="QR kód pre overovaciu appku" className="h-44 w-44 rounded-lg border border-border bg-white p-2" />
            <div className="min-w-0 text-xs text-muted-foreground">
              Nejde naskenovať? Zadajte kľúč ručne:
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
              aria-label="Kód z overovacej appky"
              placeholder="123 456"
              className="w-40 rounded-md border border-input bg-background px-3 py-2 text-center font-mono text-lg tracking-widest"
            />
            <button
              type="submit"
              disabled={pracujem}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {pracujem && <Loader2 className="h-4 w-4 animate-spin" />} Zapnúť
            </button>
            <button type="button" onClick={() => setZapinanie(null)} className="rounded-md border border-border px-3 py-2 text-sm">
              Zrušiť
            </button>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Mobilné appky vedia kód zadať od najbližšej verzie. Kým ju nemáte, v appke sa po zapnutí
            neukážu údaje — odhláste sa v nej a prihláste znova po aktualizácii.
          </p>
        </form>
      ) : (
        <button
          onClick={zacni}
          disabled={pracujem}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pracujem ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Zapnúť
        </button>
      )}
    </section>
  );
}

function ZmenaHesla() {
  const [heslo, setHeslo] = useState("");
  const [znova, setZnova] = useState("");
  const [ukladam, setUkladam] = useState(false);

  async function uloz(e: React.FormEvent) {
    e.preventDefault();
    if (heslo.length < 8) return toast.error("Heslo musí mať aspoň 8 znakov.");
    if (heslo !== znova) return toast.error("Heslá sa nezhodujú.");
    setUkladam(true);
    const { error } = await supabase.auth.updateUser({ password: heslo });
    setUkladam(false);
    if (error) return toast.error(prelozAuthChybu(error.message).sprava);
    setHeslo("");
    setZnova("");
    toast.success("Heslo je zmenené.");
  }

  const pole = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">Zmena hesla</h2>
      </div>
      <form onSubmit={uloz} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Nové heslo</span>
          <input type="password" autoComplete="new-password" minLength={8} required value={heslo} onChange={(e) => setHeslo(e.target.value)} className={pole} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Nové heslo znova</span>
          <input type="password" autoComplete="new-password" minLength={8} required value={znova} onChange={(e) => setZnova(e.target.value)} className={pole} />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={ukladam}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {ukladam && <Loader2 className="h-4 w-4 animate-spin" />} Zmeniť heslo
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            Aspoň 8 znakov. Heslo, ktoré uniklo z iných služieb, neprejde.
          </p>
        </div>
      </form>
    </section>
  );
}
