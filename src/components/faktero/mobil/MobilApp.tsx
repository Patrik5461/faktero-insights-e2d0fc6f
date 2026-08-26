/**
 * Mobilná aplikácia Faktera.
 *
 * Býva to trasa `/app` na webe, ale rovnaký komponent sa zostavuje aj do
 * samostatného balíčka v telefóne (`src/mobile/main.tsx`), aby appka fungovala
 * aj bez pripojenia. Preto tu nie je nič z routera — obrazovky prepína stav.
 */
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useOperacia } from "@/lib/mobile/server-most";
import { PrebiehaJazda } from "./PrebiehaJazda";
import { toast } from "sonner";
import {
  ArrowUp,
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
  Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { nacitajUlozenuRelaciu } from "@/lib/mobile/relacia";
import { vyberFirmy } from "@/lib/mobile/start";
import { zapisOdlozeneSuhlasy } from "@/lib/faktero/pravne-suhlasy";
import {
  fetchMyCompanies,
  getActiveCompanyId,
  setActiveCompanyId,
} from "@/lib/faktero/active-company";
import type { BlocekVysledok } from "@/lib/faktero/blocek.functions";
import { dokladNaZaznam, nahrajPrilohu, stranyDoPdf } from "@/lib/faktero/mobil-doklad";
import { captureReceipt } from "@/lib/mobile/receipt-scanner";
import { scanQrCode, scanQrFromImage } from "@/lib/mobile/qr-scanner";
import { odosliCakajuceJazdy } from "@/lib/mobile/auto-jazdy-sync";
import { QrSkener } from "@/components/faktero/mobil/QrSkener";
import { StavPushu } from "@/components/faktero/mobil/StavPushu";
import { CislaDopredu } from "@/components/faktero/mobil/CislaDopredu";
import { datum } from "@/components/faktero/mobil/PrijateDoklady";
import { formatovacMeny } from "@/lib/faktero/mena";

/**
 * Obrazovky sa načítajú až keď na ne človek klikne.
 *
 * Do štartu appky patrí domov a prihlásenie; faktúry, jazda, banka a doklady sú
 * spolu vyše troch tisíc riadkov, ktoré sa pri otvorení appky nikdy nezobrazia.
 * V balíčku sú to súbory na disku telefónu, takže načítanie funguje aj bez
 * signálu — offline sa tým nič nemení.
 */
const Diagnostika = lazy(() =>
  import("@/components/faktero/mobil/Diagnostika").then((m) => ({ default: m.Diagnostika })),
);
const PrijateDoklady = lazy(() =>
  import("@/components/faktero/mobil/PrijateDoklady").then((m) => ({ default: m.PrijateDoklady })),
);
const NovaFaktura = lazy(() =>
  import("@/components/faktero/mobil/NovaFaktura").then((m) => ({ default: m.NovaFaktura })),
);
const VystaveneFaktury = lazy(() =>
  import("@/components/faktero/mobil/VystaveneFaktury").then((m) => ({
    default: m.VystaveneFaktury,
  })),
);
const Jazda = lazy(() =>
  import("@/components/faktero/mobil/Jazda").then((m) => ({ default: m.Jazda })),
);
const Banka = lazy(() =>
  import("@/components/faktero/mobil/Banka").then((m) => ({ default: m.Banka })),
);

/**
 * Kým sa obrazovka načíta z disku. V telefóne je to zlomok sekundy.
 *
 * Poistka je tam kvôli tomu, že sa obrazovky načítavajú zvlášť: keby sa jeden
 * súbor nenačítal (pokazená inštalácia, zle prebehnutá aktualizácia), bez nej
 * by ostala biela obrazovka bez slova a bez cesty späť.
 */
class PoistkaObrazovky extends Component<
  { children: React.ReactNode; onSpat: () => void },
  { chyba: string | null }
> {
  state = { chyba: null as string | null };

  static getDerivedStateFromError(e: unknown) {
    return { chyba: e instanceof Error ? e.message : "obrazovku sa nepodarilo načítať" };
  }

  render() {
    if (this.state.chyba === null) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-[15px]">Túto obrazovku sa nepodarilo otvoriť.</p>
        <p className="text-[12px] text-muted-foreground">{this.state.chyba}</p>
        <button
          onClick={this.props.onSpat}
          className="rounded-xl border border-border px-4 py-3 text-[15px]"
        >
          Späť
        </button>
      </div>
    );
  }
}

function Obrazovka({ children, onSpat }: { children: React.ReactNode; onSpat: () => void }) {
  return (
    <PoistkaObrazovky onSpat={onSpat}>
      <Suspense fallback={<Pracujem text="Otváram…" />}>{children}</Suspense>
    </PoistkaObrazovky>
  );
}
import { ZrusenieUctu } from "@/components/faktero/ZrusenieUctu";
import { dniDoZrusenia, terminSlovom } from "@/lib/faktero/ucet-zrusenie";
import { DNI, FAKTURY, sPoctom } from "@/lib/faktero/mnozne";
import { MobilPanel } from "@/components/faktero/mobil/MobilPanel";
import { RegistraciaUctu } from "@/components/faktero/mobil/RegistraciaUctu";
import {
  Skener,
  vychodzieNastavenie,
  type NastavenieDokladu,
} from "@/components/faktero/mobil/Skener";
import { TabBar, type Zalozka } from "@/components/faktero/mobil/TabBar";
import { VytvorFirmu } from "@/components/faktero/mobil/VytvorFirmu";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  loginWithBiometric,
  overBiometriu,
} from "@/lib/mobile/biometric";
import {
  AppHeader,
  HlavneTlacidlo,
  MobilObrazovka,
  PasHore,
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

type Firma = { id: string; name: string };
type Uhrada = "hotovost" | "karta" | "prevod";
type Krok =
  | "nacitavam"
  | "prihlasenie"
  | "registracia"
  | "skener"
  | "firma"
  | "novaFirma"
  | "domov"
  | "zachyt"
  | "doklady"
  | "novaFaktura"
  | "upravaFaktury"
  | "faktury"
  | "jazda"
  | "banka"
  | "ucet";
type Zachyt = "blocek" | "pdf" | "strany";

/**
 * Appka má veľa stavov a každý sa vracia vlastným `return` — prihlásenie, výber
 * firmy, jednotlivé obrazovky. Zelený pás preto visí tu, nad nimi všetkými:
 * inak by sa musel opakovať v každej vetve a raz by sa na niektorú zabudlo.
 */
export function MobilnaApka() {
  return (
    <>
      <PasHore />
      <ObsahApky />
    </>
  );
}

function ObsahApky() {
  const [krok, setKrok] = useState<Krok>("nacitavam");
  /* Neskoro dobehnutá relácia sa rozhoduje mimo renderu — `krok` v uzávere je
     v tej chvíli už zastaraný. */
  const krokRef = useRef<Krok>("nacitavam");
  krokRef.current = krok;
  /** Ktorá faktúra sa práve opravuje — obrazovku vlastní appka, nie zoznam. */
  const [upravovana, setUpravovana] = useState<{ id: string; invoice_number: string } | null>(null);
  const [firmy, setFirmy] = useState<Firma[]>([]);
  const [firma, setFirma] = useState<Firma | null>(null);
  const [faza, setFaza] = useState("štart");
  const [chybaStartu, setChybaStartu] = useState<string | null>(null);
  const [diagnostika, setDiagnostika] = useState(false);
  const [dlho, setDlho] = useState(false);
  const [zachyt, setZachyt] = useState<Zachyt>("blocek");
  const [email, setEmail] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [zamknute, setZamknute] = useState(false);
  const [zrusiSa, setZrusiSa] = useState<string | null>(null);
  const [novsia, setNovsia] = useState<{ peciatka: string; odkaz: string } | null>(null);
  /*
    Súhlasy z registrácie v telefóne sa zapisujú až po prihlásení: pri
    registrácii relácia ešte nie je a bez nej ich server neprijme.
  */
  const zapisSuhlasy = useOperacia("pravne-suhlasy");
  /*
    Skener-first režim. V appke je úvodnou obrazovkou kamera; na webe ostáva
    pôvodná domovská obrazovka, aby sa `/app` v prehliadači nezmenil.
    `?skener=1` je jediná výnimka — bez nej sa nová obrazovka nedá overiť inak
    než na telefóne.
  */
  const skenerPrvy = useMemo(() => {
    try {
      if (Capacitor.isNativePlatform()) return true;
      return new URLSearchParams(window.location.search).has("skener");
    } catch {
      return false;
    }
  }, []);
  /** Kam vedie „späť" z agend — do skenera v appke, na prehľad na webe. */
  const DOMOV: Krok = skenerPrvy ? "skener" : "domov";
  const [nastavenieDokladu, setNastavenieDokladu] =
    useState<NastavenieDokladu>(vychodzieNastavenie);
  /** Kód prečítaný na skeneri, ktorý čaká na spracovanie v toku dokladu. */
  const [qrZoSkenera, setQrZoSkenera] = useState<string | null>(null);

  /*
   * Povolenie na notifikácie sa pýta až tu: na domovskej obrazovke, teda po
   * prihlásení a po prípadnom odomknutí biometriou.
   *
   * Pri štarte appky vyskakovalo systémové okno skôr, než človek vedel, čo
   * appka robí — a kto vtedy ťukol „Nepovoliť", mal push nadobro vypnutý,
   * lebo iOS sa druhýkrát nepýta. Čakať treba aj na odomknutie: dve systémové
   * okná naraz (Face ID a notifikácie) si preliezajú cez seba.
   */
  const pytaliSmeSaNaPush = useRef(false);
  useEffect(() => {
    if (krok !== "domov" || zamknute || pytaliSmeSaNaPush.current) return;
    pytaliSmeSaNaPush.current = true;
    void (async () => {
      const m = await import("@/lib/mobile/push");
      await m.registerPushNotifications();
      await m.dorucCakajuciPushToken();
    })();
  }, [krok, zamknute]);

  /**
   * Kto je prihlásený a za akú firmu — to isté sa rieši pri štarte aj po prihlásení.
   *
   * `studenyStart` rozlišuje spustenie appky od návratu po prihlásení. Pri
   * spustení sa zamyká: relácia prežije zabitie appky, takže bez tohto by stačilo
   * appku zavrieť a otvoriť znova a biometria by sa nikdy nespýtala. Po
   * prihlásení sa naopak pýtať nesmie — človek sa práve preukázal.
   */
  async function zisti(studenyStart = false) {
    // Štart sa dá zaseknúť na ktorejkoľvek z týchto vecí a na telefóne to inak
    // vyzerá len ako večné točenie. Nech je vidieť, kde stojíme.
    setFaza("prihlásenie");
    // Overenie relácie v telefóne občas neodpovie vôbec (nie chybou, ale tichom).
    // Bez stropu by appka ostala navždy na úvodnej obrazovke, tak radšej po
    // šiestich sekundách pokračujeme a človek sa prihlási znova.
    /*
      Ticho a prázdno sa musia rozlíšiť. Keď `getSession()` mlčí, môže na
      pozadí práve obnovovať token — a tá obnova na serveri **prejde**. Keby
      sme mlčanie brali ako „nie je prihlásený", pošleme človeka zadávať heslo
      pár sekúnd predtým, než mu platná relácia dobehne. Presne to sa dialo.
    */
    const STROP = Symbol("strop");
    const dotaz = supabase.auth
      .getSession()
      .catch((e: any) => ({ data: { session: null }, chyba: String(e?.message ?? e) }));
    const vysledok = (await Promise.race([
      dotaz,
      new Promise((res) => setTimeout(() => res(STROP), 6000)),
    ])) as any;
    const stroplo = vysledok === STROP;
    const data = stroplo ? { session: null } : (vysledok.data as { session: any });
    const overenie = stroplo
      ? "strop 6 s — odpoveď neprišla"
      : vysledok.chyba
        ? `chyba: ${vysledok.chyba}`
        : data.session
          ? "relácia"
          : "prázdno";

    // Keď overenie nestihlo odpovedať, ešte sa pozrieme, či relácia v telefóne
    // je — inak by sme prihláseného človeka posielali prihlásiť sa znova pri
    // každom pomalom štarte.
    let relacia = data.session ?? nacitajUlozenuRelaciu();
    let druhyPokus: string | undefined;

    /*
      Ani jedno z toho vyššie nečíta Keychain priamo — obe siahajú do pamäte,
      ktorú napĺňa `pripravUlozisko()`. Tá sa pri štarte púšťa s trojsekundovým
      stropom, aby zaseknuté úložisko nenechalo appku pod logom; keď sa doň
      nestihne načítať (studený štart, telefón po reštarte, pomalý Keychain),
      je pamäť prázdna a **platná relácia vyzerá ako žiadna**. Presne tak sa
      appka „sama odhlasovala": server ju neodhlásil, len sme sa jej spýtali
      skôr, než mala odkiaľ odpovedať.

      Preto sa pred vyhlásením „nie je prihlásený" počká, kým sa úložisko
      dočíta, a otázka sa položí znova.
    */
    if (!relacia) {
      setFaza("úložisko");
      const { pripravUlozisko } = await import("@/lib/mobile/trvale-ulozisko");
      await Promise.race([
        pripravUlozisko().catch(() => {}),
        new Promise((res) => setTimeout(res, 7000)),
      ]);
      const { data: znova } = (await supabase.auth
        .getSession()
        .catch(() => ({ data: { session: null } }))) as { data: { session: any } };
      relacia = znova.session ?? nacitajUlozenuRelaciu();
      druhyPokus = znova.session ? "relácia" : relacia ? "relácia z úložiska" : "prázdno";
    }

    if (!relacia) {
      const { zapisStopu } = await import("@/lib/mobile/stopa-prihlasenia");
      zapisStopu({
        kedy: Date.now(),
        overenie,
        druhyPokus,
        ulozisko: nacitajUlozenuRelaciu() ? "kľúč je" : "kľúč chýba",
        vysledok: "poslaná na prihlásenie",
      });
      setKrok("prihlasenie");
      /*
        Prihlasovacia obrazovka nie je koniec. Keď obnova tokenu dobehne až
        teraz, appka to má prijať a pustiť človeka dnu — nie čakať, kým odklepe
        heslo, ktoré vôbec nepotreboval.
      */
      if (stroplo) {
        void dotaz.then(async (neskoro: any) => {
          if (!neskoro?.data?.session) return;
          const { zapisStopu: zapisZnova } = await import("@/lib/mobile/stopa-prihlasenia");
          zapisZnova({
            kedy: Date.now(),
            overenie,
            druhyPokus,
            ulozisko: "kľúč je",
            vysledok: "dobehla neskôr",
          });
          // Kto medzitým stihol zadať heslo, je už dnu — nerušiť ho.
          if (krokRef.current === "prihlasenie") void zisti(false);
        });
      }
      return;
    }
    setFaza("odomknutie");
    if (studenyStart && (await isBiometricEnabled()) && (await isBiometricAvailable())) {
      setZamknute(true);
    }
    setEmail(relacia.user?.email ?? null);
    void zapisOdlozeneSuhlasy(zapisSuhlasy);
    // Token na push mohol doraziť skôr, než bol používateľ prihlásený.
    void import("@/lib/mobile/push").then((m) => m.dorucCakajuciPushToken());
    // Naplánované zrušenie účtu musí byť vidieť aj v telefóne — kto oň požiadal
    // omylom, otvorí najskôr appku, nie nastavenia na webe.
    supabase
      .from("profiles")
      .select("deletion_scheduled_for")
      .eq("id", relacia.user.id)
      .maybeSingle()
      .then(({ data: p }) => setZrusiSa((p?.deletion_scheduled_for as string | null) ?? null));
    setFaza("firmy");
    const { ulozDoPamate, zPamate } = await import("@/lib/mobile/jazdy-lokalne");
    // Kľúč zámerne bez id používateľa: pri núdzovom čítaní relácie z telefónu
    // nemusí byť id po ruke a zoznam by sa potom hľadal pod iným menom.
    const klucFiriem = "firmy";
    try {
      // Bez pripojenia sa zoznam firiem nenačíta a appka by tvrdila, že k účtu
      // žiadna firma nepatrí. Preto sa posledný známy drží v telefóne.
      let zoznam: Firma[];
      try {
        // Keď telefón vie, že signál nie je, nemá zmysel čakať na vypršanie —
        // ideme rovno po tom, čo je uložené. Inak strop osem sekúnd.
        const { isOnline } = await import("@/lib/mobile/offline-queue");
        if (!(await isOnline())) throw new Error("bez pripojenia");
        zoznam = (await Promise.race([
          fetchMyCompanies(),
          new Promise((_, zamietni) => setTimeout(() => zamietni(new Error("bez odpovede")), 8000)),
        ])) as Firma[];
        void ulozDoPamate(klucFiriem, zoznam);
      } catch (e) {
        const zapamatane = await zPamate<Firma[]>(klucFiriem);
        if (!zapamatane?.hodnota?.length) {
          // Bez siete a bez zapamätaného zoznamu sa nedá povedať nič iné, než
          // ako to je. Tvrdiť, že k účtu nepatrí firma, by bola nepravda.
          setChybaStartu(
            "Bez pripojenia a v telefóne zatiaľ nie je uložený zoznam firiem. Otvorte appku raz s internetom.",
          );
          setKrok("firma");
          return;
        }
        zoznam = zapamatane.hodnota;
      }
      setFirmy(zoznam);
      // Pravidlo je v `start.ts`, aby sa dalo overiť testom — tu bolo zamotané
      // medzi šiestimi `await` a skúšalo sa len na telefóne.
      const vybrana = vyberFirmy(zoznam, getActiveCompanyId());
      if (vybrana) {
        setFirma(vybrana);
        setActiveCompanyId(vybrana.id);
        setKrok(skenerPrvy ? "skener" : "domov");
        // Jazdy, ktoré telefón nahral, kým bola appka zavretá, netreba držať
        // v telefóne do chvíle, kým sa človek preklikne na obrazovku Jazda.

        // Vozidlá sa dovtedy ukladali až pri otvorení Jazdy. Kto tú obrazovku
        // pred cestou neotvoril, mal v aute bez signálu prázdny zoznam a nemal
        // čím zapísať jazdu — teda presne tam, kde ju potrebuje najviac.
        void nacitajVozidlaDoPamate(vybrana.id);

        // Faktúry vystavené bez signálu a zásoba čísel na ďalšie. Obe ticho —
        // človek otvára appku kvôli niečomu inému.
        void (async () => {
          try {
            const { posliFaktury, doplnCisla } = await import("@/lib/mobile/offline-queue");
            const odoslane = await posliFaktury(vybrana.id);
            if (odoslane > 0) {
              toast.success(
                odoslane === 1
                  ? "Faktúra vystavená bez signálu je odoslaná."
                  : `Odoslaných odložených faktúr: ${odoslane}.`,
              );
            }
            await doplnCisla(vybrana.id);
          } catch {
            /* skúsi sa znova pri návrate signálu */
          }
          try {
            // Odberatelia do telefónu. Bez nich sa faktúra bez signálu nedá ani
            // začať a človek by sa to dozvedel až v teréne.
            await predzasobPodklady(vybrana.id);
          } catch {
            /* pamäť je pohodlie, nie podmienka štartu */
          }
        })();

        void odosliCakajuceJazdy(vybrana.id)
          .then(({ ulozene }) => {
            if (ulozene > 0) {
              toast.success(
                ulozene === 1
                  ? "Rozpoznaná jazda uložená"
                  : `Uložených ${ulozene} rozpoznaných jázd`,
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

  /**
   * Odberatelia a produkty do telefónu — to isté, čo si pýta Nová faktúra.
   *
   * Bez nich sa bez signálu nedá vystaviť faktúra vôbec: obrazovka nemá z čoho
   * ponúknuť odberateľa. Ukladá sa pod ten istý kľúč, z ktorého Nová faktúra
   * číta, keď sa jej server neozve.
   */
  async function predzasobPodklady(companyId: string) {
    const { isOnline } = await import("@/lib/mobile/offline-queue");
    if (!(await isOnline())) return;
    const { volajOperaciu } = await import("@/lib/mobile/server-most-volanie");
    const p = await volajOperaciu("faktura-podklady", { company_id: companyId });
    const { ulozDoPamate } = await import("@/lib/mobile/jazdy-lokalne");
    await ulozDoPamate(`podklady-faktury:${companyId}`, p);
  }

  /**
   * Zoznam áut do telefónu hneď pri štarte.
   *
   * Beží na pozadí a ticho — keď nie je signál, ostane posledný známy zoznam a
   * to je presne to, o čo ide.
   */
  async function nacitajVozidlaDoPamate(companyId: string) {
    try {
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      if (!(await isOnline())) return;
      const { data } = await supabase
        .from("vehicles")
        .select("id, name, license_plate")
        .eq("company_id", companyId)
        .eq("active", true)
        .order("name")
        .then(
          (r) => r,
          () => ({ data: null }),
        );
      if (!data?.length) return;
      const { ulozVozidla } = await import("@/lib/mobile/jazdy-lokalne");
      await ulozVozidla(
        companyId,
        data.map((v) => ({ ...v, company_id: companyId })),
      );
    } catch {
      /* pamäť je pohodlie, nie podmienka štartu */
    }
  }

  useEffect(() => {
    // Appka sa neaktualizuje sama, takže o novšej verzii sa človek inak
    // nedozvie — čas zostavenia je len v Diagnostike.
    void import("@/lib/mobile/verzia")
      .then((m) => m.zistiNovsiuVerziu())
      .then(setNovsia)
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Nezachytená výnimka v štarte nechá appku na úvodnej obrazovke bez slova.
    // Radšej nech je vidieť, čo presne padlo.
    zisti(true).catch((e: any) => setChybaStartu(String(e?.message ?? e).slice(0, 200)));
    // Keď sa štart do desiatich sekúnd nedokončí, appka to prizná a ponúkne
    // východisko namiesto točiaceho sa kolieska.
    const t = setTimeout(() => setDlho(true), 10000);
    return () => clearTimeout(t);
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
    /*
      Neodoslaná faktúra sa odhlásením stratí — obsahuje údaje zákazníka, takže
      v telefóne po odhlásení ostať nesmie. Preto sa najprv skúsi doposlať a keď
      to nejde, odhlásenie sa zastaví. Ticho ju zahodiť by znamenalo, že človek
      príde o prácu, o ktorej si myslí, že je vybavená.
    */
    if (firma) {
      try {
        const { posliFaktury } = await import("@/lib/mobile/offline-queue");
        await posliFaktury(firma.id);
        const { pocetCakajucichFaktur } = await import("@/lib/mobile/faktury-fronta");
        const zostava = pocetCakajucichFaktur(firma.id);
        if (zostava > 0) {
          toast.error(
            `V telefóne čaká ${sPoctom(zostava, FAKTURY)} na odoslanie. Pripojte sa a otvorte Vystavené faktúry — potom sa dá odhlásiť.`,
            { duration: 8000 },
          );
          return;
        }
      } catch {
        /* keď sa to nedá ani zistiť, odhlásenie neblokujeme */
      }
    }

    // Odhlásenie odvoláva token na serveri, takže bez signálu zlyhá. Relácia v
    // telefóne sa musí zmazať tak či tak — na požičanom telefóne by inak ostala.
    // `scope: "local"` odhlási len tento telefón; bez neho by Supabase odvolal
    // všetky tokeny účtu a vyhodil človeka aj z webu na počítači.
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* bez siete sa token odvolať nedá; lokálne ho zabudneme nižšie */
    }
    const { zabudniPrihlasenie } = await import("@/lib/mobile/trvale-ulozisko");
    zabudniPrihlasenie();
    // Rezervované čísla aj nastavenie patria k účtu, nie k telefónu.
    const { vycistiFaktury } = await import("@/lib/mobile/faktury-fronta");
    vycistiFaktury();
    setFirma(null);
    setKrok("prihlasenie");
  }

  if (diagnostika)
    return (
      <Obrazovka onSpat={() => setDiagnostika(false)}>
        <Diagnostika onSpat={() => setDiagnostika(false)} />
      </Obrazovka>
    );
  if (zamknute) return <Zamok onOdomknute={() => setZamknute(false)} onOdhlasit={odhlas} />;
  if (krok === "nacitavam") {
    const peciatka = typeof __PECIATKA__ === "string" ? __PECIATKA__ : "web";
    if (!dlho && !chybaStartu)
      return <Pracujem text={`Spúšťam Faktero… (${faza}) · ${peciatka}`} />;
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background p-6 text-center">
        <div className="space-y-3">
          <p className="text-sm font-medium">Štart sa zasekol na kroku „{faza}".</p>
          <p className="text-[13px] text-muted-foreground">
            Býva to slabým pripojením. Skúste to znova, alebo sa prihláste nanovo.
          </p>
          {chybaStartu && (
            <p className="rounded-lg bg-destructive/10 p-2 text-[12px] text-destructive">
              {chybaStartu}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">balíček {peciatka}</p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => {
                setDlho(false);
                zisti();
              }}
              className="rounded-xl bg-primary px-4 py-3 text-[15px] font-medium text-primary-foreground"
            >
              Skúsiť znova
            </button>
            <button
              onClick={odhlas}
              className="rounded-xl border border-border px-4 py-3 text-[15px]"
            >
              Prihlásiť sa nanovo
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (krok === "prihlasenie")
    return <Prihlasenie onHotovo={() => zisti()} onRegistracia={() => setKrok("registracia")} />;
  if (krok === "registracia")
    return <RegistraciaUctu onHotovo={() => zisti()} onSpat={() => setKrok("prihlasenie")} />;
  if (krok === "novaFirma")
    return (
      <VytvorFirmu
        prve={firmy.length === 0}
        // Bez jedinej firmy sa niet kam vrátiť — späť by viedlo na prázdny zoznam.
        onSpat={firmy.length > 0 ? () => setKrok("firma") : undefined}
        onHotovo={() => {
          // Zoznam firiem aj predzásobenie sa robia v `zisti()`; nová firma sa
          // medzitým stala vybranou, takže sa appka otvorí rovno na nej.
          setChybaStartu(null);
          setKrok("nacitavam");
          void zisti();
        }}
      />
    );
  if (krok === "firma")
    return (
      <VyberFirmy
        onDiagnostika={() => setDiagnostika(true)}
        poznamka={chybaStartu}
        firmy={firmy}
        onVyber={(f) => {
          setFirma(f);
          setActiveCompanyId(f.id);
          setKrok(DOMOV);
        }}
        onNovaFirma={() => setKrok("novaFirma")}
        // Bez pripojenia by sa firma nezaložila a chyba by prišla až po vyplnení.
        firmaSaNeda={!!chybaStartu}
        onOdhlasit={odhlas}
      />
    );
  /** Spodná lišta prepína agendy; „Vytvoriť" otvára rovno novú faktúru. */
  function prepniZalozku(z: Zalozka) {
    if (z === "skener") return setKrok("skener");
    if (z === "faktury") return setKrok("faktury");
    if (z === "vytvorit") return setKrok("novaFaktura");
    if (z === "banka") return setKrok("banka");
    setKrok("jazda");
  }

  /*
    Skener-first. Kamera je celá obrazovka, takže hlavička aj spodná lišta sú
    tu priamo — `MobilObrazovka` počíta s obsahom, ktorý sa roluje, a tu sa
    rolovať nemá nič.
  */
  if (krok === "skener" && firma)
    return (
      <div className="flex h-[100dvh] flex-col bg-black">
        <AppHeader
          variant="root"
          title={firma.name}
          subtitle="Skener dokladov"
          left={
            <button
              onClick={() => setPanel(true)}
              aria-label="Nastavenia"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full active:bg-white/20"
            >
              <Menu className="h-[20px] w-[20px]" />
            </button>
          }
          right={
            firmy.length > 1 ? (
              <button
                onClick={() => setKrok("firma")}
                aria-label="Zmeniť firmu"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full active:bg-white/20"
              >
                <Building2 className="h-[20px] w-[20px]" />
              </button>
            ) : undefined
          }
        />
        <Skener
          nastavenie={nastavenieDokladu}
          onNastavenie={setNastavenieDokladu}
          onQr={(raw) => {
            setQrZoSkenera(raw);
            setZachyt("blocek");
            setKrok("zachyt");
          }}
          onOdfotit={() => {
            setQrZoSkenera(null);
            setZachyt("blocek");
            setKrok("zachyt");
          }}
          onZGalerie={() => {
            setQrZoSkenera(null);
            setZachyt("pdf");
            setKrok("zachyt");
          }}
          onViacstranovy={() => {
            setQrZoSkenera(null);
            setZachyt("strany");
            setKrok("zachyt");
          }}
          onPrijateDoklady={() => setKrok("doklady")}
        />
        <TabBar aktivna="skener" onPrepni={prepniZalozku} />
        <MobilPanel
          otvoreny={panel}
          onZavri={() => setPanel(false)}
          firma={firma}
          email={email}
          viacFiriem={firmy.length > 1}
          onZmenitFirmu={() => setKrok("firma")}
          onPrehlad={() => setKrok("domov")}
          onDoklady={() => setKrok("doklady")}
          onFaktury={() => setKrok("faktury")}
          onUcet={() => {
            setPanel(false);
            setKrok("ucet");
          }}
          onOdhlasit={odhlas}
        />
      </div>
    );

  if (krok === "doklady" && firma)
    return (
      <Obrazovka onSpat={() => setKrok(DOMOV)}>
        <PrijateDoklady firma={firma} onSpat={() => setKrok(DOMOV)} />
      </Obrazovka>
    );
  if (krok === "novaFaktura" && firma)
    return (
      <SoSpodnouListou zobrazit={skenerPrvy} aktivna="vytvorit" onPrepni={prepniZalozku}>
        <Obrazovka onSpat={() => setKrok(DOMOV)}>
          <NovaFaktura
            firma={firma}
            onSpat={() => setKrok(DOMOV)}
            onHotovo={() => setKrok("faktury")}
          />
        </Obrazovka>
      </SoSpodnouListou>
    );
  if (krok === "upravaFaktury" && firma && upravovana)
    return (
      <Obrazovka onSpat={() => setKrok("faktury")}>
        <NovaFaktura
          firma={firma}
          upravuje={upravovana}
          onSpat={() => setKrok("faktury")}
          onHotovo={() => {
            setUpravovana(null);
            setKrok("faktury");
          }}
        />
      </Obrazovka>
    );
  if (krok === "jazda" && firma)
    return (
      <SoSpodnouListou zobrazit={skenerPrvy} aktivna="jazda" onPrepni={prepniZalozku}>
        <Obrazovka onSpat={() => setKrok(DOMOV)}>
          <Jazda firma={firma} onSpat={() => setKrok(DOMOV)} />
        </Obrazovka>
      </SoSpodnouListou>
    );
  if (krok === "banka" && firma)
    return (
      <SoSpodnouListou zobrazit={skenerPrvy} aktivna="banka" onPrepni={prepniZalozku}>
        <Obrazovka onSpat={() => setKrok(DOMOV)}>
          <Banka firma={firma} onSpat={() => setKrok(DOMOV)} />
        </Obrazovka>
      </SoSpodnouListou>
    );
  if (krok === "ucet")
    return (
      <MobilObrazovka title="Účet" subtitle={email ?? undefined} onBack={() => setKrok(DOMOV)}>
        <div className="space-y-4">
          <StavPushu />
          {firma && <CislaDopredu firma={firma} />}
          <button
            onClick={() => setDiagnostika(true)}
            className="w-full rounded-2xl border border-border/70 p-4 text-left text-sm"
          >
            Diagnostika
            <span className="mt-1 block text-xs text-muted-foreground">
              Čo appka v telefóne vidí — balíček, pamäť, pripojenie.
            </span>
          </button>
          <ZrusenieUctu onZrusene={() => zisti()} />
        </div>
      </MobilObrazovka>
    );
  if (krok === "faktury" && firma)
    return (
      <SoSpodnouListou zobrazit={skenerPrvy} aktivna="faktury" onPrepni={prepniZalozku}>
        <Obrazovka onSpat={() => setKrok(DOMOV)}>
          <VystaveneFaktury
            firma={firma}
            onSpat={() => setKrok(DOMOV)}
            onNova={() => setKrok("novaFaktura")}
            onUprav={(f) => {
              setUpravovana(f);
              setKrok("upravaFaktury");
            }}
          />
        </Obrazovka>
      </SoSpodnouListou>
    );
  if (krok === "zachyt" && firma)
    return (
      <ZachytDokladu
        druh={zachyt}
        firma={firma}
        prednastavene={skenerPrvy ? nastavenieDokladu : undefined}
        hotovyQr={qrZoSkenera}
        onSpat={() => setKrok(DOMOV)}
        // Po uložení ukážeme zoznam — inak doklad zmizne a nedá sa overiť,
        // či sa vôbec uložil.
        onUlozene={() => setKrok("doklady")}
      />
    );

  return (
    <>
      {novsia && (
        <button
          onClick={() => {
            // Odkaz do obchodu otvára systém; plugin na prehliadač v balíčku
            // nie je a kvôli jednému odkazu ho pridávať netreba.
            window.open(novsia.odkaz, "_blank");
          }}
          className="w-full bg-primary/10 px-4 py-2 text-left text-[13px] text-primary"
        >
          Je dostupná novšia verzia aplikácie — ťuknite na aktualizáciu
        </button>
      )}
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

/**
 * Obal agend, nad ktorými má byť spodná lišta.
 *
 * Obrazovky sú vysoké na celý displej (`min-h-[100dvh]`), takže by pod nimi
 * lišta vytvorila kúsok rolovania navyše — preto prvému dieťaťu uberieme jej
 * výšku. `--spodna-lista` číta `MobilObrazovka`: jej lepivá pätka sa musí
 * zastaviť nad lištou, nie pod ňou, a posledná položka zoznamu nesmie ostať
 * schovaná za lištou.
 */
function SoSpodnouListou({
  zobrazit,
  aktivna,
  onPrepni,
  children,
}: {
  zobrazit: boolean;
  aktivna: Zalozka;
  onPrepni: (z: Zalozka) => void;
  children: React.ReactNode;
}) {
  if (!zobrazit) return <>{children}</>;
  return (
    <div
      className="flex min-h-[100dvh] flex-col [&>*:first-child]:min-h-[calc(100dvh-var(--spodna-lista))]"
      style={
        {
          "--spodna-lista": "calc(3.5rem + var(--safe-bottom))",
          // Lišta bezpečnú zónu už drží; keby si ju pripočítala aj lepivá
          // pätka, ostala by nad lištou prázdna medzera na výšku palca.
          "--patka-spodok": "0px",
        } as React.CSSProperties
      }
    >
      {children}
      <TabBar aktivna={aktivna} onPrepni={onPrepni} />
    </div>
  );
}

/* ------------------------- Prihlásenie ------------------------- */

function Prihlasenie({
  onHotovo,
  onRegistracia,
}: {
  onHotovo: () => void;
  onRegistracia: () => void;
}) {
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
        paddingTop: "calc(var(--safe-top) + 2rem)",
        paddingBottom: "calc(var(--safe-bottom) + 2rem)",
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

        <button
          onClick={onRegistracia}
          className="mt-6 w-full py-2 text-center text-sm text-muted-foreground"
        >
          Nemáte účet? <span className="font-medium text-primary">Zaregistrujte sa</span>
        </button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Zabudnuté heslo si obnovíte na faktero.sk.
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
      style={{ paddingTop: "var(--safe-top)" }}
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
  poznamka,
  onDiagnostika,
  onNovaFirma,
  firmaSaNeda,
}: {
  firmy: Firma[];
  onVyber: (f: Firma) => void;
  onOdhlasit: () => void;
  /** Prečo je zoznam prázdny — bez toho by appka tvrdila nepravdu. */
  poznamka?: string | null;
  onDiagnostika?: () => void;
  onNovaFirma?: () => void;
  /** Zoznam sa nenačítal, takže o firmách nevieme nič — zakladať sa nedá. */
  firmaSaNeda?: boolean;
}) {
  return (
    <MobilObrazovka title="Vyberte firmu" subtitle="Doklady sa uložia do vybranej firmy">
      {firmy.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {poznamka ??
              "K tomuto účtu zatiaľ nepatrí žiadna firma. Bez nej nemajú doklady kam ísť — založte si ju rovno tu."}
          </p>
          {onNovaFirma && !firmaSaNeda && (
            <VelkeTlacidlo
              icon={Plus}
              variant="primary"
              label="Vytvoriť firmu"
              hint="Stačí názov, ostatné sa dá doplniť neskôr"
              onClick={onNovaFirma}
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {firmy.map((f) => (
            <VelkeTlacidlo key={f.id} icon={Building2} label={f.name} onClick={() => onVyber(f)} />
          ))}
          {onNovaFirma && !firmaSaNeda && (
            <button
              onClick={onNovaFirma}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3.5 text-[14px] text-muted-foreground"
            >
              <Plus className="h-4 w-4" /> Pridať ďalšiu firmu
            </button>
          )}
        </div>
      )}
      <button
        onClick={onOdhlasit}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground"
      >
        <LogOut className="h-4 w-4" /> Odhlásiť sa
      </button>
      {onDiagnostika && (
        // Práve tu sa človek zasekne, keď sa zoznam nenačíta — nech má odkiaľ
        // zistiť prečo, bez pripájania telefónu k počítaču.
        <button
          onClick={onDiagnostika}
          className="mt-2 w-full py-2 text-center text-[13px] text-muted-foreground underline"
        >
          Diagnostika
        </button>
      )}
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
      <AppHeader
        variant="root"
        title="Faktúry a doklady"
        subtitle={firma?.name ?? "Bez firmy"}
        left={
          <button
            onClick={onPanel}
            aria-label="Nastavenia"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full active:bg-white/20"
          >
            <Menu className="h-[20px] w-[20px]" />
          </button>
        }
        pod={
          /*
            Za ktorú firmu sa práve skenuje, hovorí podnadpis. Tento pruh je
            **prepínač** — pri jedinej firme by len zopakoval to, čo je o riadok
            vyššie, tak sa nekreslí. Presvetlenie smerom dole je až tu, pod
            lištou: keby prechod začínal hore, v oblasti výrezu by bol o odtieň
            iný pruh než spoločný pás nad ním.
          */
          viacFiriem ? (
            <div
              className="px-4 pb-5 pt-1"
              style={{
                backgroundImage: `linear-gradient(180deg, ${ZELENA_HORE} 0%, ${ZELENA_HORE} 30%, ${ZELENA_DOLE} 100%)`,
              }}
            >
              <button
                onClick={viacFiriem ? onZmenitFirmu : undefined}
                className={`flex w-full items-center gap-2 rounded-xl bg-white/15 px-3 py-2.5 text-left ${
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
          ) : null
        }
      />

      {/*
        Appka robí dve veci: vystavuje faktúry a zbiera prijaté doklady. Sú to
        opačné strany účtovníctva, takže sú oddelené — inak sa v štyroch
        rovnakých tlačidlách ľahko ťukne vedľa a doklad skončí v zlej agende.
      */}
      <main className="flex-1 space-y-3 px-4 pt-5">
        {/*
          Kým jazda beží, je to prvé, čo je na obrazovke vidieť. Notifikácia
          o rozpoznaní príde len raz a v aute sa ľahko prehliadne.
        */}
        <PrebiehaJazda onOtvor={onJazda} />

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

      <div style={{ paddingBottom: "calc(var(--safe-bottom) + 1rem)" }} />
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
  prednastavene,
  hotovyQr,
}: {
  druh: Zachyt;
  firma: Firma;
  onSpat: () => void;
  onUlozene: () => void;
  /** Úhrada a kategória vybrané na skeneri — človek ich už nemusí klikať znova. */
  prednastavene?: NastavenieDokladu;
  /** QR prečítaný už na úvodnej obrazovke; čítanie sa nespúšťa druhý raz. */
  hotovyQr?: string | null;
}) {
  const nacitaj = useOperacia<BlocekVysledok>("blocek-precitaj");
  const uloz = useOperacia("vydavok-uloz");

  const [stav, setStav] = useState<"start" | "citam" | "potvrdenie" | "ukladam">("start");
  const [vysledok, setVysledok] = useState<BlocekVysledok | null>(null);
  const [uhrada, setUhrada] = useState<Uhrada | null>(prednastavene?.uhrada ?? null);
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

  /*
    Kód prečítaný už na úvodnej obrazovke. Čítanie sa spúšťa raz — keby sa
    obrazovka prekreslila, doklad by sa načítaval znova a človek by videl
    „Čítam doklad…" dokola.
  */
  const spustene = useRef(false);
  useEffect(() => {
    if (!hotovyQr || spustene.current) return;
    spustene.current = true;
    void precitaj({ qr: hotovyQr });
    // eslint-disable-next-line
  }, [hotovyQr]);

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
      await uloz({
        data: dokladNaZaznam(
          firma.id,
          vysledok,
          uhrada,
          priloha,
          prednastavene?.kategoria ?? null,
        ) as any,
      });
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
  const suma = (n?: number) => (n == null ? "—" : formatovacMeny(mena, "sk-SK")(n));

  return (
    <MobilObrazovka
      title="Skontrolujte doklad"
      subtitle={vysledok.zdroj === "ekasa" ? "Z Finančnej správy" : "Prečítané z dokladu"}
      onBack={onSpat}
      footer={
        <HlavneTlacidlo onClick={onUloz} disabled={!uhrada}>
          {uhrada ? (
            "Uložiť doklad"
          ) : (
            /*
              Šípka nahor je tu naschvál: tlačidlo drží spodok obrazovky a
              výber úhrady môže byť odrolovaný mimo dohľadu. Bez nej človek
              číta „vyberte spôsob úhrady" a nevie kde.
            */
            <span className="inline-flex items-center gap-1.5">
              <ArrowUp className="h-4 w-4" /> Vyberte spôsob úhrady
            </span>
          )}
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
        {/*
          Kým nie je vybraté, celý blok si pýta pozornosť. Predtým sa od zvyšku
          obrazovky ničím nelíšil, tlačidlo dole bolo len zošednuté a človek
          hľadal, prečo sa doklad nedá uložiť.
        */}
        <div
          className={`rounded-2xl transition-colors ${
            uhrada ? "" : "border border-primary/50 bg-primary/5 p-3 ring-4 ring-primary/10"
          }`}
        >
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
            Ako ste platili?
            {!uhrada && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                Povinné
              </span>
            )}
            {vysledok.payment_method && (
              <span className="text-xs font-normal text-muted-foreground">
                (prečítané z dokladu)
              </span>
            )}
          </div>
          {!uhrada && (
            <p className="mb-2 text-xs text-primary">
              Vyberte jednu z možností — bez nej sa doklad uložiť nedá.
            </p>
          )}
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
                    : uhrada
                      ? "border-border/70 bg-card text-foreground"
                      : "border-primary/40 bg-card font-medium text-foreground"
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
