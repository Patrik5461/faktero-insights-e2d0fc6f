import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Building2,
  Camera,
  Menu,
  Check,
  FileText,
  Files,
  FilePlus2,
  LogOut,
  QrCode,
  Receipt,
  ScanLine,
  Fingerprint,
  Car,
  AlertTriangle,
  Landmark,
  Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchMyCompanies,
  getActiveCompanyId,
  setActiveCompanyId,
} from "@/lib/faktero/active-company";
import { nacitajBlocekFn, type BlocekVysledok } from "@/lib/faktero/blocek.functions";
import { createExpenseFn } from "@/lib/faktero/expenses.functions";
import { dokladNaZaznam, nahrajPrilohu, stranyDoPdf } from "@/lib/faktero/mobil-doklad";
import { captureReceipt } from "@/lib/mobile/receipt-scanner";
import { scanQrCode, scanQrFromImage } from "@/lib/mobile/qr-scanner";
import { odosliCakajuceJazdy } from "@/lib/mobile/auto-jazdy-sync";
import { QrSkener } from "@/components/faktero/mobil/QrSkener";
import { StavPushu } from "@/components/faktero/mobil/StavPushu";
import { PrijateDoklady, datum } from "@/components/faktero/mobil/PrijateDoklady";
import { NovaFaktura } from "@/components/faktero/mobil/NovaFaktura";
import { VystaveneFaktury } from "@/components/faktero/mobil/VystaveneFaktury";
import { Jazda } from "@/components/faktero/mobil/Jazda";
import { Banka } from "@/components/faktero/mobil/Banka";
import { ZrusenieUctu } from "@/components/faktero/ZrusenieUctu";
import { dniDoZrusenia, terminSlovom } from "@/lib/faktero/ucet-zrusenie";
import { DNI, sPoctom } from "@/lib/faktero/mnozne";
import { MobilPanel } from "@/components/faktero/mobil/MobilPanel";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  loginWithBiometric,
  overBiometriu,
} from "@/lib/mobile/biometric";
import {
  HlavneTlacidlo,
  MobilObrazovka,
  Pracujem,
  VelkeTlacidlo,
} from "@/components/faktero/mobil/MobilChrome";
import { Logo } from "@/components/faktero/Logo";
import { ZELENA_DOLE, ZELENA_HORE } from "@/lib/mobile/brand";

/**
 * Mobilná aplikácia — prihlásenie, výber firmy a skenovanie dokladov.
 *
 * Natívny obal (Capacitor) ukazuje živý web, takže appka je táto stránka.
 * Zámerne je oddelená od webovej aplikácie: na telefóne treba tri veci —
 * dostať sa dnu, vedieť za ktorú firmu, a odfotiť doklad. Nič viac tu nie je.
 */

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Faktero" },
      // Bez `viewport-fit=cover` sa na iPhone nedá odsadiť od výrezu.
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: MobilnaApka,
});

type Firma = { id: string; name: string };
type Uhrada = "hotovost" | "karta" | "prevod";
type Krok =
  | "nacitavam"
  | "prihlasenie"
  | "firma"
  | "domov"
  | "zachyt"
  | "doklady"
  | "novaFaktura"
  | "faktury"
  | "jazda"
  | "banka"
  | "ucet";
type Zachyt = "blocek" | "pdf" | "strany";

function MobilnaApka() {
  const [krok, setKrok] = useState<Krok>("nacitavam");
  const [firmy, setFirmy] = useState<Firma[]>([]);
  const [firma, setFirma] = useState<Firma | null>(null);
  const [zachyt, setZachyt] = useState<Zachyt>("blocek");
  const [email, setEmail] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [zamknute, setZamknute] = useState(false);
  const [zrusiSa, setZrusiSa] = useState<string | null>(null);

  /**
   * Kto je prihlásený a za akú firmu — to isté sa rieši pri štarte aj po prihlásení.
   *
   * `studenyStart` rozlišuje spustenie appky od návratu po prihlásení. Pri
   * spustení sa zamyká: relácia prežije zabitie appky, takže bez tohto by stačilo
   * appku zavrieť a otvoriť znova a biometria by sa nikdy nespýtala. Po
   * prihlásení sa naopak pýtať nesmie — človek sa práve preukázal.
   */
  async function zisti(studenyStart = false) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setKrok("prihlasenie");
      return;
    }
    if (studenyStart && (await isBiometricEnabled()) && (await isBiometricAvailable())) {
      setZamknute(true);
    }
    setEmail(data.session.user?.email ?? null);
    // Token na push mohol doraziť skôr, než bol používateľ prihlásený.
    void import("@/lib/mobile/push").then((m) => m.dorucCakajuciPushToken());
    // Naplánované zrušenie účtu musí byť vidieť aj v telefóne — kto oň požiadal
    // omylom, otvorí najskôr appku, nie nastavenia na webe.
    supabase
      .from("profiles")
      .select("deletion_scheduled_for")
      .eq("id", data.session.user.id)
      .maybeSingle()
      .then(({ data: p }) => setZrusiSa((p?.deletion_scheduled_for as string | null) ?? null));
    try {
      const zoznam = (await fetchMyCompanies()) as Firma[];
      setFirmy(zoznam);
      const ulozena = getActiveCompanyId();
      const najdena = zoznam.find((f) => f.id === ulozena);
      // Pri jedinej firme nemá zmysel pýtať sa — vyberie sa sama.
      const jedina = zoznam.length === 1 ? zoznam[0] : null;
      const vybrana = najdena ?? jedina;
      if (vybrana) {
        setFirma(vybrana);
        setActiveCompanyId(vybrana.id);
        setKrok("domov");
        // Jazdy, ktoré telefón nahral, kým bola appka zavretá, netreba držať
        // v telefóne do chvíle, kým sa človek preklikne na obrazovku Jazda.
        // Vozidlá pre offline obrazovku — odkladajú sa hneď pri štarte, nie až
        // keď človek otvorí knihu jázd. Kto ide rovno do terénu, na tú obrazovku
        // nemusí zablúdiť vôbec.
        void (async () => {
          try {
            const [{ data: auta }, { ulozOfflinePodklady }, { mojeVozidlo }] = await Promise.all([
              supabase
                .from("vehicles")
                .select("id, name, license_plate")
                .eq("company_id", vybrana.id)
                .eq("active", true)
                .order("name"),
              import("@/lib/mobile/offline-podklady"),
              import("@/lib/mobile/moje-vozidlo"),
            ]);
            await ulozOfflinePodklady({
              companyId: vybrana.id,
              companyName: vybrana.name,
              vozidla: auta ?? [],
              mojeVozidloId: mojeVozidlo(vybrana.id) ?? auta?.[0]?.id ?? null,
            });
          } catch {
            /* offline obrazovka si poradí aj bez zoznamu áut */
          }
        })();

        // Doklady odfotené na offline obrazovke prevezme appka do svojej fronty.
        void import("@/lib/mobile/offline-prevzatie")
          .then((m) => m.prevezmiOfflineDoklady(vybrana.id))
          .then((pocet) => {
            if (pocet > 0) {
              toast.success(
                pocet === 1
                  ? "Doklad odfotený bez signálu čaká na odoslanie"
                  : `${pocet} dokladov odfotených bez signálu čaká na odoslanie`,
              );
            }
          })
          .catch(() => {});

        void odosliCakajuceJazdy(vybrana.id)
          .then(({ ulozene }) => {
            if (ulozene > 0) {
              toast.success(
                ulozene === 1 ? "Rozpoznaná jazda uložená" : `Uložených ${ulozene} rozpoznaných jázd`,
              );
            }
          })
          .catch(() => {
            /* jazda ostane čakať na obrazovke Jazda, nie je to dôvod na hlášku */
          });
      } else {
        setKrok("firma");
      }
    } catch {
      setKrok("firma");
    }
  }

  useEffect(() => {
    zisti(true);
  }, []);

  /*
   * Zámok pri návrate do appky.
   *
   * Biometria dosiaľ chránila len prihlásenie — kto mal appku otvorenú, mal
   * po odomknutí telefónu prístup k celej fakturácii. Po návrate z pozadia sa
   * preto pýta znova, ale až po minúte: pri odskočení do fotoaparátu alebo do
   * správ by inak otravovala pri každom kroku skenovania.
   */
  useEffect(() => {
    let odstran: (() => void) | undefined;
    let odNeaktivity: number | null = null;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("appStateChange", async ({ isActive }) => {
          if (!isActive) {
            odNeaktivity = Date.now();
            return;
          }
          const prec = odNeaktivity ? Date.now() - odNeaktivity : 0;
          odNeaktivity = null;
          if (prec < 60_000) return;
          if (await isBiometricEnabled()) setZamknute(true);
        });
        odstran = () => h.remove();
      } catch {
        // na webe plugin nie je — appka sa nezamyká
      }
    })();
    return () => odstran?.();
  }, []);

  /*
   * Hardvérové tlačidlo Späť na Androide inak appku rovno zavrie — aj keď je
   * človek uprostred skenovania. Na domovskej obrazovke ho necháme tak.
   */
  useEffect(() => {
    let odstran: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("backButton", () => {
          setKrok((k) => (k === "domov" || k === "prihlasenie" || k === "nacitavam" ? k : "domov"));
        });
        odstran = () => h.remove();
      } catch {
        // na webe plugin nie je — gesto potiahnutím funguje aj tak
      }
    })();
    return () => odstran?.();
  }, []);

  async function odhlas() {
    await supabase.auth.signOut();
    setFirma(null);
    setKrok("prihlasenie");
  }

  if (zamknute) return <Zamok onOdomknute={() => setZamknute(false)} onOdhlasit={odhlas} />;
  if (krok === "nacitavam") return <Pracujem text="Spúšťam Faktero…" />;
  if (krok === "prihlasenie") return <Prihlasenie onHotovo={() => zisti()} />;
  if (krok === "firma")
    return (
      <VyberFirmy
        firmy={firmy}
        onVyber={(f) => {
          setFirma(f);
          setActiveCompanyId(f.id);
          setKrok("domov");
        }}
        onOdhlasit={odhlas}
      />
    );
  if (krok === "doklady" && firma)
    return <PrijateDoklady firma={firma} onSpat={() => setKrok("domov")} />;
  if (krok === "novaFaktura" && firma)
    return (
      <NovaFaktura
        firma={firma}
        onSpat={() => setKrok("domov")}
        onHotovo={() => setKrok("faktury")}
      />
    );
  if (krok === "jazda" && firma) return <Jazda firma={firma} onSpat={() => setKrok("domov")} />;
  if (krok === "banka" && firma) return <Banka firma={firma} onSpat={() => setKrok("domov")} />;
  if (krok === "ucet")
    return (
      <MobilObrazovka title="Účet" subtitle={email ?? undefined} onBack={() => setKrok("domov")}>
        <div className="space-y-4">
          <StavPushu />
          <ZrusenieUctu onZrusene={() => zisti()} />
        </div>
      </MobilObrazovka>
    );
  if (krok === "faktury" && firma)
    return (
      <VystaveneFaktury
        firma={firma}
        onSpat={() => setKrok("domov")}
        onNova={() => setKrok("novaFaktura")}
      />
    );
  if (krok === "zachyt" && firma)
    return (
      <ZachytDokladu
        druh={zachyt}
        firma={firma}
        onSpat={() => setKrok("domov")}
        // Po uložení ukážeme zoznam — inak doklad zmizne a nedá sa overiť,
        // či sa vôbec uložil.
        onUlozene={() => setKrok("doklady")}
      />
    );

  return (
    <>
      <Domov
        firma={firma}
        viacFiriem={firmy.length > 1}
        zrusiSa={zrusiSa}
        onUcet={() => setKrok("ucet")}
        onZachyt={(d) => {
          setZachyt(d);
          setKrok("zachyt");
        }}
        onDoklady={() => setKrok("doklady")}
        onNovaFaktura={() => setKrok("novaFaktura")}
        onFaktury={() => setKrok("faktury")}
        onJazda={() => setKrok("jazda")}
        onBanka={() => setKrok("banka")}
        onZmenitFirmu={() => setKrok("firma")}
        onPanel={() => setPanel(true)}
      />
      <MobilPanel
        otvoreny={panel}
        onZavri={() => setPanel(false)}
        email={email}
        firma={firma}
        viacFiriem={firmy.length > 1}
        onZmenitFirmu={() => setKrok("firma")}
        onDoklady={() => setKrok("doklady")}
        onFaktury={() => setKrok("faktury")}
        onUcet={() => {
          setPanel(false);
          setKrok("ucet");
        }}
        onOdhlasit={odhlas}
      />
    </>
  );
}

/* ------------------------- Prihlásenie ------------------------- */

function Prihlasenie({ onHotovo }: { onHotovo: () => void }) {
  const [email, setEmail] = useState("");
  const [heslo, setHeslo] = useState("");
  const [busy, setBusy] = useState(false);
  const [biometria, setBiometria] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBiometria);
  }, []);

  async function prihlas() {
    if (!email.trim() || !heslo) return toast.error("Vyplňte e-mail aj heslo.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: heslo,
      });
      if (error) throw new Error(error.message);
      onHotovo();
    } catch (e: any) {
      toast.error(e?.message ?? "Prihlásenie zlyhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function odomkni() {
    const r = await loginWithBiometric();
    if (r.ok) onHotovo();
    else toast.error(r.error ?? "Odomknutie zlyhalo.");
  }

  return (
    <div
      className="flex min-h-[100dvh] flex-col justify-center bg-background px-6"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 2rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)",
      }}
    >
      <div className="mx-auto w-full max-w-sm">
        <Logo variant="header" className="mb-8 h-9" />
        <h1 className="text-2xl font-semibold tracking-tight">Prihlásenie</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prihláste sa do svojho účtu vo Faktere.
        </p>

        <div className="mt-6 space-y-3">
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base"
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Heslo"
            value={heslo}
            onChange={(e) => setHeslo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && prihlas()}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base"
          />
          <button
            onClick={prihlas}
            disabled={busy}
            className="w-full rounded-xl bg-primary px-4 py-3 text-base font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Prihlasujem…" : "Prihlásiť sa"}
          </button>

          {biometria && (
            <button
              onClick={odomkni}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-base"
            >
              <Fingerprint className="h-5 w-5" /> Odomknúť biometriou
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Zabudnuté heslo alebo nový účet vybavíte na faktero.sk.
        </p>
      </div>
    </div>
  );
}

/* ------------------------- Zámok ------------------------- */

function Zamok({ onOdomknute, onOdhlasit }: { onOdomknute: () => void; onOdhlasit: () => void }) {
  const [busy, setBusy] = useState(false);

  async function odomkni() {
    setBusy(true);
    const r = await overBiometriu();
    setBusy(false);
    if (r.ok) onOdomknute();
    else toast.error(r.error ?? "Odomknutie zlyhalo.");
  }

  /* Pýtame sa hneď — ďalšie ťuknutie navyše nikoho nechráni. */
  useEffect(() => {
    odomkni();
    // eslint-disable-next-line
  }, []);

  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-8"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="grid h-20 w-20 place-items-center rounded-3xl bg-primary/10 text-primary">
        <Lock className="h-9 w-9" />
      </div>
      <div className="text-center">
        <p className="text-[17px] font-semibold">Faktero je zamknuté</p>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Odomknite ho biometriou a pokračujte tam, kde ste skončili.
        </p>
      </div>
      <button
        onClick={odomkni}
        disabled={busy}
        className="w-full max-w-xs rounded-2xl px-4 py-3.5 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
        style={{ backgroundImage: "var(--brand-gradient)" }}
      >
        {busy ? "Odomykám…" : "Odomknúť"}
      </button>
      <button onClick={onOdhlasit} className="text-[14px] text-muted-foreground">
        Odhlásiť sa
      </button>
    </div>
  );
}

/* ------------------------- Výber firmy ------------------------- */

function VyberFirmy({
  firmy,
  onVyber,
  onOdhlasit,
}: {
  firmy: Firma[];
  onVyber: (f: Firma) => void;
  onOdhlasit: () => void;
}) {
  return (
    <MobilObrazovka title="Vyberte firmu" subtitle="Doklady sa uložia do vybranej firmy">
      {firmy.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          K tomuto účtu nie je pripojená žiadna firma. Vytvorte ju na faktero.sk.
        </p>
      ) : (
        <div className="space-y-2">
          {firmy.map((f) => (
            <VelkeTlacidlo key={f.id} icon={Building2} label={f.name} onClick={() => onVyber(f)} />
          ))}
        </div>
      )}
      <button
        onClick={onOdhlasit}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground"
      >
        <LogOut className="h-4 w-4" /> Odhlásiť sa
      </button>
    </MobilObrazovka>
  );
}

/* ------------------------- Domovská obrazovka ------------------------- */

function Domov({
  firma,
  viacFiriem,
  onZachyt,
  onDoklady,
  onNovaFaktura,
  onFaktury,
  onJazda,
  onBanka,
  onUcet,
  onZmenitFirmu,
  onPanel,
  zrusiSa,
}: {
  firma: Firma | null;
  viacFiriem: boolean;
  onZachyt: (d: Zachyt) => void;
  onDoklady: () => void;
  onNovaFaktura: () => void;
  onFaktury: () => void;
  onJazda: () => void;
  onBanka: () => void;
  onUcet: () => void;
  onZmenitFirmu: () => void;
  onPanel: () => void;
  zrusiSa: string | null;
}) {
  /*
   * Panel sa otvára aj potiahnutím od ľavého okraja. Na ostatných obrazovkách
   * to isté gesto znamená „späť" — tu späť nie je kam, tak je voľné.
   */
  useEffect(() => {
    let x0: number | null = null;
    const dole = (e: TouchEvent) => {
      const t = e.touches[0];
      x0 = t && t.clientX <= 28 ? t.clientX : null;
    };
    const pohyb = (e: TouchEvent) => {
      if (x0 == null) return;
      const t = e.touches[0];
      if (t && t.clientX - x0 > 60) {
        x0 = null;
        onPanel();
      }
    };
    const hore = () => {
      x0 = null;
    };
    window.addEventListener("touchstart", dole, { passive: true });
    window.addEventListener("touchmove", pohyb, { passive: true });
    window.addEventListener("touchend", hore, { passive: true });
    return () => {
      window.removeEventListener("touchstart", dole);
      window.removeEventListener("touchmove", pohyb);
      window.removeEventListener("touchend", hore);
    };
  }, [onPanel]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/*
        Hlavička je jediné farebné miesto v appke — nesie značku a hovorí, za
        ktorú firmu sa práve skenuje. To je údaj, ktorý musí byť vidieť stále:
        doklad uložený do zlej firmy sa hľadá ťažko.
      */}
      {/*
        Pás pod hodinami a batériou musí byť jednoliaty s hlavičkou.

        Odsadenie pre výrez drží ten istý prvok, ktorý kreslí pozadie, a to
        pozadie je jednoliata značková zelená — do oblasti výrezu sa tak nemá
        ako dostať svetlejší koniec prechodu. Presvetlenie smerom dole je až na
        vnútornom prvku pod výrezom.
      */}
      {/*
        Hlavička ostáva na mieste aj pri posúvaní. Inak pri prvom pohybe prsta
        odíde hore a s ňou aj údaj o tom, za ktorú firmu sa práve pracuje —
        pod ním sa objaví holé pozadie a horný pás stratí farbu.
      */}
      <header
        className="sticky top-0 z-20 text-primary-foreground"
        style={{
          backgroundColor: ZELENA_HORE,
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div
          className="px-5 pb-6 pt-3"
          style={{
            backgroundImage: `linear-gradient(180deg, ${ZELENA_HORE} 0%, ${ZELENA_HORE} 30%, ${ZELENA_DOLE} 100%)`,
          }}
        >
          <div className="flex items-center gap-2.5">
            <button
              onClick={onPanel}
              aria-label="Nastavenia"
              className="-ml-2 rounded-full bg-white/15 p-2.5 active:bg-white/25"
            >
              <Menu className="h-[20px] w-[20px]" />
            </button>
            <h1 className="min-w-0 truncate text-[20px] font-semibold leading-tight">
              Faktúry a doklady
            </h1>
          </div>

          <button
            onClick={viacFiriem ? onZmenitFirmu : undefined}
            className={`mt-4 flex w-full items-center gap-2 rounded-xl bg-white/15 px-3 py-2.5 text-left ${
              viacFiriem ? "active:bg-white/25" : "cursor-default"
            }`}
          >
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
              {firma?.name ?? "Bez firmy"}
            </span>
            {viacFiriem && (
              <span className="shrink-0 text-[12px] text-primary-foreground/80">zmeniť</span>
            )}
          </button>
        </div>
      </header>

      {/*
        Appka robí dve veci: vystavuje faktúry a zbiera prijaté doklady. Sú to
        opačné strany účtovníctva, takže sú oddelené — inak sa v štyroch
        rovnakých tlačidlách ľahko ťukne vedľa a doklad skončí v zlej agende.
      */}
      <main className="flex-1 space-y-3 px-4 pt-5">
        {zrusiSa && (
          <button
            onClick={onUcet}
            className="flex w-full items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-left"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span className="min-w-0 text-[13px]">
              Účet je naplánovaný na zrušenie {terminSlovom(zrusiSa)} — o{" "}
              {sPoctom(dniDoZrusenia(zrusiSa), DNI)}.
              <span className="block font-medium text-primary">Odvolať žiadosť</span>
            </span>
          </button>
        )}

        <Skupina nazov="Fakturácia" />
        <VelkeTlacidlo
          icon={FilePlus2}
          label="Nová faktúra"
          hint="Odberateľ, položky, splatnosť — a rovno odoslať"
          variant="primary"
          onClick={onNovaFaktura}
        />
        <VelkeTlacidlo
          icon={FileText}
          label="Vystavené faktúry"
          hint="Kto ešte nezaplatil, PDF a odoslanie"
          onClick={onFaktury}
        />

        <Skupina nazov="Skenovanie dokladov" />
        <VelkeTlacidlo
          icon={QrCode}
          label="Bloček s QR kódom"
          hint="Načíta sa z Finančnej správy aj s položkami"
          onClick={() => onZachyt("blocek")}
        />
        <VelkeTlacidlo
          icon={FileText}
          label="Faktúra v PDF"
          hint="Vyberte súbor z telefónu alebo z cloudu"
          onClick={() => onZachyt("pdf")}
        />
        <VelkeTlacidlo
          icon={Files}
          label="Viacstranový doklad"
          hint="Strana po strane, uloží sa ako jedno PDF"
          onClick={() => onZachyt("strany")}
        />
        <VelkeTlacidlo
          icon={Receipt}
          label="Prijaté doklady"
          hint="Bločky a faktúry, ktoré ste už naskenovali"
          onClick={onDoklady}
        />

        <Skupina nazov="Banka" />
        <VelkeTlacidlo
          icon={Landmark}
          label="Pohyby na účte"
          hint="Či prišli peniaze — zostatok a posledné platby"
          onClick={onBanka}
        />

        <Skupina nazov="Kniha jázd" />
        <VelkeTlacidlo
          icon={Car}
          label="Nová jazda"
          hint="Kilometre odmeria telefón, stačí štart a stop"
          onClick={onJazda}
        />
      </main>

      <div style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }} />
    </div>
  );
}

function Skupina({ nazov }: { nazov: string }) {
  return (
    <p className="px-1 pb-0.5 pt-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
      {nazov}
    </p>
  );
}

/* ------------------------- Zachytenie dokladu ------------------------- */

const NAZVY: Record<Zachyt, string> = {
  blocek: "Bloček s QR kódom",
  pdf: "Faktúra v PDF",
  strany: "Viacstranový doklad",
};

function ZachytDokladu({
  druh,
  firma,
  onSpat,
  onUlozene,
}: {
  druh: Zachyt;
  firma: Firma;
  onSpat: () => void;
  onUlozene: () => void;
}) {
  const nacitaj = useServerFn(nacitajBlocekFn);
  const uloz = useServerFn(createExpenseFn);

  const [stav, setStav] = useState<"start" | "citam" | "potvrdenie" | "ukladam">("start");
  const [vysledok, setVysledok] = useState<BlocekVysledok | null>(null);
  const [uhrada, setUhrada] = useState<Uhrada | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [strany, setStrany] = useState<string[]>([]);
  const [skenujem, setSkenujem] = useState(false);
  /** QR kód sa odloží aj vtedy, keď ho server nemal ako prečítať. */
  const [qrKod, setQrKod] = useState<string | null>(null);

  /** Doklad prečítaný — ďalej sa pýtame na úhradu a na fotku. */
  function prijmi(r: BlocekVysledok, prilozene?: string | null) {
    setVysledok(r);
    setUhrada(r.payment_method ?? null);
    if (prilozene) setFoto(prilozene);
    setStav("potvrdenie");
    if (r.zdroj === "nic") toast.error(r.poznamka ?? "Doklad sa nepodarilo prečítať.");
  }

  /*
   * Bez signálu sa doklad prečítať nedá — čítanie z Finančnej správy aj OCR
   * bežia na serveri. Namiesto chyby a straty bločku sa preto pokračuje na
   * potvrdenie s prázdnym výsledkom a celý doklad sa odloží do fronty.
   */
  async function precitaj(
    vstup: { qr?: string; image_data_url?: string },
    prilozene?: string | null,
  ) {
    setQrKod(vstup.qr ?? null);
    setStav("citam");
    try {
      prijmi((await nacitaj({ data: vstup })) as BlocekVysledok, prilozene);
    } catch (e: any) {
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      if (!(await isOnline())) {
        const { nedostupnyDoklad } = await import("@/lib/mobile/doklady-odoslanie");
        prijmi(nedostupnyDoklad(vstup.qr), prilozene);
        return;
      }
      toast.error(e?.message ?? "Čítanie zlyhalo.");
      setStav("start");
    }
  }

  /* --- Bloček: najprv QR, potom sa pýtame na úhradu a fotku --- */
  async function precitajQr(raw: string) {
    setSkenujem(false);
    await precitaj({ qr: raw });
  }

  /**
   * Natívny skener skúsime prvý — kde je (Android), je rýchlejší. Na iOS v
   * projekte nie je, tak sa otvorí skener priamo v stránke.
   */
  async function nasnimajQr() {
    const res = await scanQrCode();
    if (res) return precitajQr(res.raw);
    setSkenujem(true);
  }

  async function odfotDoklad() {
    const cap = await captureReceipt();
    if (!cap) return;
    // QR sa hľadá v obrázku ešte v telefóne, takže ho fronta má aj bez signálu.
    const qr = await scanQrFromImage(cap.dataUrl);
    await precitaj({ qr: qr?.raw, image_data_url: cap.dataUrl }, cap.dataUrl);
  }

  /* --- PDF faktúra --- */
  async function vyberPdf() {
    const dataUrl = await vyberSubor("application/pdf,image/*");
    if (!dataUrl) return;
    await precitaj({ image_data_url: dataUrl }, dataUrl);
  }

  /* --- Viacstranový doklad --- */
  async function pridajStranu() {
    const cap = await captureReceipt();
    if (!cap) return;
    setStrany((s) => [...s, cap.dataUrl]);
  }

  async function dokonciStrany() {
    if (strany.length === 0) return;
    setStav("citam");
    let pdf: string;
    try {
      pdf = await stranyDoPdf(strany);
    } catch (e: any) {
      toast.error(e?.message ?? "Spojenie strán zlyhalo.");
      setStav("start");
      return;
    }
    await precitaj({ image_data_url: pdf }, pdf);
  }

  /* --- Uloženie --- */

  /** Doklad, ktorý sa nedá odoslať teraz, si počká vo fronte v telefóne. */
  async function odlozDoklad(dovod: string) {
    const { pridajDoFronty } = await import("@/lib/mobile/doklady-fronta");
    await pridajDoFronty({
      company_id: firma.id,
      qr_raw: qrKod ?? vysledok?.qr_raw ?? null,
      obrazok: foto,
      uhrada: uhrada!,
      vysledok: vysledok,
    });
    toast.success(dovod);
    onUlozene();
  }

  async function ulozDoklad() {
    if (!vysledok || !uhrada) return;
    setStav("ukladam");

    const { isOnline } = await import("@/lib/mobile/offline-queue");
    if (!(await isOnline())) {
      await odlozDoklad("Bez signálu — doklad sa odošle sám, keď bude pripojenie.");
      return;
    }

    try {
      const priloha = foto ? await nahrajPrilohu(firma.id, foto) : null;
      if (foto && !priloha) toast.error("Prílohu sa nepodarilo nahrať, doklad uložím bez nej.");
      await uloz({ data: dokladNaZaznam(firma.id, vysledok, uhrada, priloha) as any });
      toast.success("Doklad uložený");
      onUlozene();
    } catch (e: any) {
      /*
       * Signál vie vypadnúť aj uprostred ukladania. Doklad sa preto nezahodí
       * ani tu — odloží sa a odošle neskôr; človek už fotí ďalší.
       */
      if (!(await isOnline())) {
        await odlozDoklad("Spojenie vypadlo — doklad sa odošle sám neskôr.");
        return;
      }
      toast.error(e?.message ?? "Uloženie zlyhalo.");
      setStav("potvrdenie");
    }
  }

  if (skenujem) return <QrSkener onNajdene={precitajQr} onZrusit={() => setSkenujem(false)} />;
  if (stav === "citam") return <Pracujem text="Čítam doklad…" />;
  if (stav === "ukladam") return <Pracujem text="Ukladám doklad…" />;

  if (stav === "potvrdenie" && vysledok) {
    return (
      <Potvrdenie
        vysledok={vysledok}
        uhrada={uhrada}
        setUhrada={setUhrada}
        foto={foto}
        onOdfotit={async () => {
          const cap = await captureReceipt();
          if (cap) setFoto(cap.dataUrl);
        }}
        onUloz={ulozDoklad}
        onSpat={() => {
          setVysledok(null);
          setFoto(null);
          setStrany([]);
          setStav("start");
        }}
      />
    );
  }

  return (
    <MobilObrazovka title={NAZVY[druh]} subtitle={firma.name} onBack={onSpat}>
      {druh === "blocek" && (
        <div className="space-y-3">
          <VelkeTlacidlo
            icon={ScanLine}
            label="Nasnímať QR kód"
            hint="Namierte na QR kód na bločku"
            variant="primary"
            onClick={nasnimajQr}
          />
          <VelkeTlacidlo
            icon={Camera}
            label="Odfotiť celý bloček"
            hint="QR sa nájde aj na fotke"
            onClick={odfotDoklad}
          />
        </div>
      )}

      {druh === "pdf" && (
        <div className="space-y-3">
          <VelkeTlacidlo
            icon={FileText}
            label="Vybrať súbor"
            hint="PDF alebo obrázok faktúry"
            variant="primary"
            onClick={vyberPdf}
          />
          <p className="text-xs text-muted-foreground">
            Z faktúry sa prečíta dodávateľ, dátum, suma aj DPH. Údaje pred uložením skontrolujte.
          </p>
        </div>
      )}

      {druh === "strany" && (
        <div className="space-y-3">
          <VelkeTlacidlo
            icon={Camera}
            label={strany.length === 0 ? "Odfotiť prvú stranu" : "Pridať ďalšiu stranu"}
            hint={strany.length > 0 ? `Zatiaľ ${strany.length} strán` : "Doklad odfoťte celý"}
            variant="primary"
            onClick={pridajStranu}
          />
          {strany.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {strany.map((s, i) => (
                  <div key={i} className="relative overflow-hidden rounded-lg border border-border">
                    <img src={s} alt={`strana ${i + 1}`} className="h-24 w-full object-cover" />
                    <button
                      onClick={() => setStrany((p) => p.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-xs text-white"
                      aria-label={`Odstrániť stranu ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <VelkeTlacidlo
                icon={Check}
                label={`Hotovo — ${strany.length} strán`}
                hint="Strany sa spoja do jedného PDF"
                onClick={dokonciStrany}
              />
            </>
          )}
        </div>
      )}
    </MobilObrazovka>
  );
}

/* ------------------------- Potvrdenie dokladu ------------------------- */

function Potvrdenie({
  vysledok,
  uhrada,
  setUhrada,
  foto,
  onOdfotit,
  onUloz,
  onSpat,
}: {
  vysledok: BlocekVysledok;
  uhrada: Uhrada | null;
  setUhrada: (u: Uhrada) => void;
  foto: string | null;
  onOdfotit: () => void;
  onUloz: () => void;
  onSpat: () => void;
}) {
  const mena = vysledok.currency ?? "EUR";
  const suma = (n?: number) =>
    n == null
      ? "—"
      : new Intl.NumberFormat("sk-SK", { style: "currency", currency: mena }).format(n);

  return (
    <MobilObrazovka
      title="Skontrolujte doklad"
      subtitle={vysledok.zdroj === "ekasa" ? "Z Finančnej správy" : "Prečítané z dokladu"}
      onBack={onSpat}
      footer={
        <HlavneTlacidlo onClick={onUloz} disabled={!uhrada}>
          {uhrada ? "Uložiť doklad" : "Vyberte spôsob úhrady"}
        </HlavneTlacidlo>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="text-[32px] font-semibold leading-none tabular-nums">
            {suma(vysledok.total)}
          </div>
          <div className="mt-2 text-[14px] text-muted-foreground">
            {vysledok.supplier ?? "Neznámy predajca"}
            {vysledok.date ? ` · ${datum(vysledok.date)}` : ""}
          </div>
          {vysledok.vat_amount != null && (
            <div className="mt-2 text-xs text-muted-foreground">
              z toho DPH {suma(vysledok.vat_amount)}
              {vysledok.vat_breakdown?.length
                ? ` (${vysledok.vat_breakdown.map((s) => `${s.sadzba} %`).join(" + ")})`
                : ""}
            </div>
          )}
          {vysledok.items.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              {vysledok.items.length} položiek z dokladu
            </div>
          )}
        </div>

        {/*
          Spôsob úhrady sa z bločku vyčítať väčšinou nedá — pokladnica ho do
          eKasy posielať nemusí. Pýtame sa hneď, lebo z pokladne uberá len
          doklad platený hotovosťou.
        */}
        <div>
          <div className="mb-2 text-sm font-medium">
            Ako ste platili?
            {vysledok.payment_method && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                (prečítané z dokladu)
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["hotovost", "Hotovosť"],
                ["karta", "Kartou"],
                ["prevod", "Prevodom"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setUhrada(id)}
                className={`rounded-2xl border py-3.5 text-[14px] transition active:scale-[0.98] ${
                  uhrada === id
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border/70 bg-card text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {uhrada === "hotovost" && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Hotovostný doklad uberie zo stavu pokladne.
            </p>
          )}
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Fotka dokladu</div>
          {foto ? (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-xl border border-border">
                {foto.startsWith("data:application/pdf") ? (
                  <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                    <FileText className="h-5 w-5" /> Priložené PDF
                  </div>
                ) : (
                  <img src={foto} alt="doklad" className="max-h-56 w-full object-contain" />
                )}
              </div>
              <button
                onClick={onOdfotit}
                className="w-full rounded-xl border border-border px-4 py-2.5 text-sm"
              >
                Odfotiť znova
              </button>
            </div>
          ) : (
            <VelkeTlacidlo
              icon={Camera}
              label="Odfotiť doklad"
              hint="Papierový doklad si treba odložiť aj tak — fotka ho nahradí"
              onClick={onOdfotit}
            />
          )}
        </div>
      </div>
    </MobilObrazovka>
  );
}

/** Výber súboru z telefónu; vráti data URL. */
function vyberSubor(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(f);
    };
    input.click();
  });
}
