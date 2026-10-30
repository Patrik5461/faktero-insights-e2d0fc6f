/**
 * Mobilná aplikácia Faktera.
 *
 * Býva to trasa `/app` na webe, ale rovnaký komponent sa zostavuje aj do
 * samostatného balíčka v telefóne (`src/mobile/main.tsx`), aby appka fungovala
 * aj bez pripojenia. Preto tu nie je nič z routera — obrazovky prepína stav.
 */
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { useKrajinaDane } from "@/lib/faktero/krajina-firmy";
import { agendaPreKrajinu } from "@/lib/faktero/agendy-krajiny";
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
import { zachytStrany } from "@/lib/mobile/skener-dokumentov";
import { scanQrCode, scanQrFromImage } from "@/lib/mobile/qr-scanner";
import { odosliCakajuceJazdy } from "@/lib/mobile/auto-jazdy-sync";
import { QrSkener } from "@/components/faktero/mobil/QrSkener";
import { RozpoznanyDoklad } from "@/components/faktero/mobil/RozpoznanyDoklad";
import { DavkaDokladov, type VstupDavky } from "@/components/faktero/mobil/DavkaDokladov";
import { KameraDokladuHost } from "@/components/faktero/mobil/KameraDokladu";
import { vyberSubory } from "@/lib/mobile/vyber-suborov";
import { jeBlockovyQr } from "@/lib/mobile/sken-rozpoznanie";
import { coChybaBlocku } from "@/lib/faktero/blocek-z-appky";
import { kameraVStrankeMozna } from "@/lib/mobile/kamera-dokladu";
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
const Ponuky = lazy(() =>
  import("@/components/faktero/mobil/Ponuky").then((m) => ({ default: m.Ponuky })),
);
const NovaPonuka = lazy(() =>
  import("@/components/faktero/mobil/NovaPonuka").then((m) => ({ default: m.NovaPonuka })),
);
const Jazda = lazy(() =>
  import("@/components/faktero/mobil/Jazda").then((m) => ({ default: m.Jazda })),
);
const Banka = lazy(() =>
  import("@/components/faktero/mobil/Banka").then((m) => ({ default: m.Banka })),
);
const Prehlad = lazy(() =>
  import("@/components/faktero/mobil/Prehlad").then((m) => ({ default: m.Prehlad })),
);

/**
 * Kým sa obrazovka načíta z disku. V telefóne je to zlomok sekundy.
 *
 * Poistka je tam kvôli tomu, že sa obrazovky načítavajú zvlášť: keby sa jeden
 * súbor nenačítal (pokazená inštalácia, zle prebehnutá aktualizácia), bez nej
 * by ostala biela obrazovka bez slova a bez cesty späť.
 */
class PoistkaObrazovky extends Component<
  { children: React.ReactNode; onSpat: () => void; nadpis: string; spat: string },
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
        <p className="text-[15px]">{this.props.nadpis}</p>
        <p className="text-[12px] text-app-text-2">{this.state.chyba}</p>
        <button
          onClick={this.props.onSpat}
          className="rounded-app border border-app-ramik px-4 py-3 text-[15px] text-app-text"
        >
          {this.props.spat}
        </button>
      </div>
    );
  }
}

function Obrazovka({ children, onSpat }: { children: React.ReactNode; onSpat: () => void }) {
  const { t } = usePreklad();
  return (
    <PoistkaObrazovky onSpat={onSpat} nadpis={t("app.chybaObrazovky")} spat={t("spolocne.spat")}>
      <Suspense fallback={<Pracujem text={t("app.otvaram")} />}>{children}</Suspense>
    </PoistkaObrazovky>
  );
}
import { ZrusenieUctu } from "@/components/faktero/ZrusenieUctu";
import { dniDoZrusenia, terminSlovom } from "@/lib/faktero/ucet-zrusenie";
import { MobilPanel } from "@/components/faktero/mobil/MobilPanel";
import { RegistraciaUctu } from "@/components/faktero/mobil/RegistraciaUctu";
import {
  Skener,
  vychodzieNastavenie,
  type NastavenieDokladu,
} from "@/components/faktero/mobil/Skener";
import { TabBar, type Zalozka } from "@/components/faktero/mobil/TabBar";
import { SPODNA_LISTA } from "@/lib/mobile/rozmery";
import { BehNaPozadiOkno } from "@/components/faktero/mobil/BehNaPozadi";
import { PovoleniaJazd } from "@/components/faktero/mobil/PovoleniaJazd";
import { VytvorFirmu } from "@/components/faktero/mobil/VytvorFirmu";
import { OverenieKodu, Prihlasenie, VyberFirmy, Zamok } from "@/components/faktero/mobil/Vstup";
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
import { VYCHODZI_APKA, nacitajMotiv, nasadMotiv, sledujSystem } from "@/lib/faktero/motiv";

import { usePreklad } from "@/lib/mobile/preklady/hook";
import { UDALOST_RYCHLEJ_AKCIE, vyzdvihniAkciu } from "@/lib/mobile/rychla-akcia";
import type { Kluc } from "@/lib/mobile/preklady";
/**
 * Mobilná aplikácia — prihlásenie, výber firmy a skenovanie dokladov.
 *
 * Natívny obal (Capacitor) ukazuje živý web, takže appka je táto stránka.
 * Zámerne je oddelená od webovej aplikácie: na telefóne treba tri veci —
 * dostať sa dnu, vedieť za ktorú firmu, a odfotiť doklad. Nič viac tu nie je.
 */

type Firma = { id: string; name: string };
type Uhrada = "hotovost" | "karta" | "prevod";
export type Krok =
  | "nacitavam"
  | "prihlasenie"
  | "overenie"
  | "registracia"
  | "prehlad"
  | "skener"
  | "firma"
  | "novaFirma"
  | "domov"
  | "zachyt"
  | "doklady"
  | "novaFaktura"
  | "upravaFaktury"
  | "faktury"
  | "ponuky"
  | "novaPonuka"
  | "jazda"
  | "banka"
  | "ucet"
  | "zmazanieUctu";
type Zachyt = "blocek" | "pdf" | "strany" | "davka";

/** Obrazovky bez rozpísaných údajov — z nich smie rýchla akcia odskočiť na skener. */
const KROKY_PRE_RYCHLU_AKCIU = new Set<Krok>([
  "prehlad",
  "domov",
  "skener",
  "doklady",
  "faktury",
  "ponuky",
  "jazda",
  "banka",
  "ucet",
]);

/** Obrazovky, na ktoré sa smie skener po zavretí vrátiť. */
const NAVRAT_ZO_SKENERA = new Set<Krok>(["prehlad", "faktury", "doklady", "banka", "jazda", "ponuky"]);

/** Doklad, ktorý vo firme už je — toľko z neho stačí, aby sa dal spoznať. */
type NajdenyDoklad = {
  id: string;
  document_number: string | null;
  issue_date: string | null;
  total_amount: number | null;
  currency: string | null;
  supplier_name: string | null;
};

/**
 * Kam viesť po odchode zo zachytávania dokladu.
 *
 * Skener je celoobrazovková kamera. Kto sa do dokladu dostal cez ňu, chce sa
 * na ňu aj vrátiť — či už doklad uložil, alebo sa vrátil späť. Zoznam dokladov
 * po uložení má zmysel len pri vstupe z Prehľadu, kde človek inak nevidí, či
 * sa doklad vôbec uložil.
 */
export function navratZoZachytu(odkial: Krok, ulozene: boolean): Krok {
  if (odkial === "skener") return "skener";
  return ulozene ? "doklady" : odkial;
}

/**
 * Appka má veľa stavov a každý sa vracia vlastným `return` — prihlásenie, výber
 * firmy, jednotlivé obrazovky. Zelený pás preto visí tu, nad nimi všetkými:
 * inak by sa musel opakovať v každej vetve a raz by sa na niektorú zabudlo.
 */
export function MobilnaApka() {
  /*
    Motív sa nasadzuje tu, nie v AppShelle: appka AppShell nemá, takže bez
    tohto by ostala navždy svetlá bez ohľadu na voľbu. Predvolený je svetlý —
    appka je tak navrhnutá a nočný režim telefónu ju prepínať nemá.
  */
  useEffect(() => {
    const volba = nacitajMotiv(VYCHODZI_APKA);
    nasadMotiv(volba);
    return sledujSystem(() => nacitajMotiv(VYCHODZI_APKA));
  }, []);

  return (
    <>
      <PasHore />
      <ObsahApky />
      {/* Kamera dokladu pre fotenie mimo skenera (dávka, ďalšia strana, prefotenie). */}
      <KameraDokladuHost />
    </>
  );
}

function ObsahApky() {
  const { t, mnozne, locale, jazyk } = usePreklad();
  const [krok, setKrok] = useState<Krok>("nacitavam");
  /* Neskoro dobehnutá relácia sa rozhoduje mimo renderu — `krok` v uzávere je
     v tej chvíli už zastaraný. */
  const krokRef = useRef<Krok>("nacitavam");
  krokRef.current = krok;
  /*
    Agenda, z ktorej sa išlo na skener — krížik na skeneri vráti sem. Skener
    nemá spodnú lištu, takže inak by viedol vždy na Prehľad.
  */
  const predSkenerom = useRef<Krok>("prehlad");
  if (NAVRAT_ZO_SKENERA.has(krok)) predSkenerom.current = krok;
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
  /*
    Nemecká firma knihu jázd nemá (Fahrtenbuch musí byť nemenné, agendy-krajiny.ts) —
    rovnaké pravidlo ako menu na webe. Bez `onJazda` panel, prehľad aj domov
    položku Jazda vynechajú.
  */
  const krajinaFirmy = useKrajinaDane();
  const naJazdu = agendaPreKrajinu("/jazdy", krajinaFirmy) ? () => setKrok("jazda") : undefined;
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
  /**
   * Kam vedie „späť" z agend.
   *
   * Po redizajne je to všade Prehľad — aj v appke, aj na webe. Skener je
   * odteraz rovnocenná záložka v spodnej lište, takže úvodnou obrazovkou byť
   * nemusí; predtým ňou bol preto, že sa inak k nemu nedalo dostať na jedno
   * ťuknutie.
   */
  const DOMOV: Krok = "prehlad";
  const [nastavenieDokladu, setNastavenieDokladu] =
    useState<NastavenieDokladu>(vychodzieNastavenie);
  /** Kód prečítaný na skeneri, ktorý čaká na spracovanie v toku dokladu. */
  const [qrZoSkenera, setQrZoSkenera] = useState<string | null>(null);
  /*
    Odkiaľ sa do zachytávania dokladu vošlo. Zo skenera sa treba vrátiť späť
    naň — je to celoobrazovková kamera a človek chce fotiť ďalší doklad, nie
    prezerať zoznam.
  */
  const [zachytZo, setZachytZo] = useState<Krok>("prehlad");
  /** Spúšť na skeneri, keď kamera v stránke nejde — na telefóne sa hneď otvorí fotoaparát. */
  const [zachytHned, setZachytHned] = useState(false);
  /** Strany odfotené a upravené už na skeneri — zachytávanie ich len spracuje. */
  const [stranyZoSkenera, setStranyZoSkenera] = useState<string[] | null>(null);

  /*
   * Povolenie na notifikácie sa pýta až tu: na domovskej obrazovke, teda po
   * prihlásení a po prípadnom odomknutí biometriou.
   *
   * Pri štarte appky vyskakovalo systémové okno skôr, než človek vedel, čo
   * appka robí — a kto vtedy ťukol „Nepovoliť", mal push nadobro vypnutý,
   * lebo iOS sa druhýkrát nepýta. Čakať treba aj na odomknutie: dve systémové
   * okná naraz (Face ID a notifikácie) si preliezajú cez seba.
   */
  /*
    Rýchla akcia z ikony („Naskenovať bloček"). Prísť môže kedykoľvek — pri
    studenom štarte ešte pred prihlásením, alebo uprostred rozpísanej faktúry.
    Vyzdvihne sa až na obrazovke, z ktorej sa dá odísť bez straty: rozpísaný
    doklad by skok na kameru zahodil, tak akcia počká, kým ho človek dokončí.
  */
  const [akciaTik, setAkciaTik] = useState(0);
  useEffect(() => {
    const ozvi = () => setAkciaTik((t) => t + 1);
    window.addEventListener(UDALOST_RYCHLEJ_AKCIE, ozvi);
    return () => window.removeEventListener(UDALOST_RYCHLEJ_AKCIE, ozvi);
  }, []);
  useEffect(() => {
    if (!firma || zamknute || !KROKY_PRE_RYCHLU_AKCIU.has(krok)) return;
    if (vyzdvihniAkciu() === "skener") {
      setQrZoSkenera(null);
      setKrok("skener");
    }
  }, [akciaTik, firma, zamknute, krok]);

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
    // Zapnuté dvojfaktorové overenie: kým relácia nezadá kód, databáza nevydá nič.
    const { potrebujeKod } = await import("@/lib/faktero/dvojfaktor");
    if (await potrebujeKod()) {
      setKrok("overenie");
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
        if (!(await isOnline())) throw new Error(t("app.bezPripojeniaKratke"));
        zoznam = (await Promise.race([
          fetchMyCompanies(),
          new Promise((_, zamietni) =>
            setTimeout(() => zamietni(new Error(t("app.bezOdpovede"))), 8000),
          ),
        ])) as Firma[];
        void ulozDoPamate(klucFiriem, zoznam);
      } catch (e) {
        const zapamatane = await zPamate<Firma[]>(klucFiriem);
        if (!zapamatane?.hodnota?.length) {
          // Bez siete a bez zapamätaného zoznamu sa nedá povedať nič iné, než
          // ako to je. Tvrdiť, že k účtu nepatrí firma, by bola nepravda.
          setChybaStartu(t("app.bezPripojeniaFirmy"));
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
        setKrok("prehlad");
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
                  ? t("app.fakturaOdoslana")
                  : t("app.odoslanychOdlozenych", { pocet: odoslane }),
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
                ulozene === 1 ? t("app.jazdaUlozena") : t("app.jazdUlozenych", { pocet: ulozene }),
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
            t("app.cakajuceFaktury", {
              pocet: `${zostava} ${mnozne(zostava, {
                one: t("spolocne.faktura1"),
                few: t("spolocne.faktura2"),
                other: t("spolocne.faktura5"),
              })}`,
            }),
            { duration: 8000 },
          );
          return;
        }
      } catch {
        /* keď sa to nedá ani zistiť, odhlásenie neblokujeme */
      }
    }

    /*
      Nepoužité rezervované čísla treba vrátiť ešte s platnou reláciou — po
      odhlásení by ich appka zabudla, ale server by ich držal dva týždne.
    */
    try {
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      if (await isOnline()) {
        const { uvolniNepouziteCisla } = await import("@/lib/mobile/faktury-fronta");
        const { volajOperaciu } = await import("@/lib/mobile/server-most-volanie");
        await uvolniNepouziteCisla((companyId, cisla) =>
          volajOperaciu("cisla-uvolni", { company_id: companyId, numbers: cisla }),
        );
      }
    } catch {
      /* čísla prepadnú samy po vypršaní */
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
      return <Pracujem text={t("app.spustam", { faza, balicek: peciatka })} />;
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-app-pozadie p-6 text-center">
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("app.startZasekol", { faza })}</p>
          <p className="text-[13px] text-app-text-2">{t("app.slabePripojenie")}</p>
          {chybaStartu && (
            <p className="rounded-lg bg-app-chyba-jemna p-2 text-[12px] text-app-chyba">
              {chybaStartu}
            </p>
          )}
          <p className="text-[11px] text-app-text-2">{t("app.balicek", { peciatka })}</p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => {
                setDlho(false);
                zisti();
              }}
              className="rounded-app bg-app-zelena-plocha px-4 py-3 text-[15px] font-medium text-white"
            >
              {t("app.skusitZnova")}
            </button>
            <button
              onClick={odhlas}
              className="rounded-app border border-app-ramik px-4 py-3 text-[15px] text-app-text"
            >
              {t("app.prihlasitNanovo")}
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (krok === "prihlasenie")
    return <Prihlasenie onHotovo={() => zisti()} onRegistracia={() => setKrok("registracia")} />;
  if (krok === "overenie")
    return (
      <OverenieKodu
        onHotovo={() => zisti()}
        onOdhlasit={async () => {
          await supabase.auth.signOut({ scope: "local" });
          setKrok("prihlasenie");
        }}
      />
    );
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
  /** Spodná lišta prepína agendy; plavák uprostred otvára novú faktúru. */
  function prepniZalozku(z: Zalozka) {
    if (z === "prehlad") return setKrok("prehlad");
    if (z === "faktury") return setKrok("faktury");
    if (z === "doklady") return setKrok("doklady");
    if (z === "skener") return setKrok("skener");
    if (z === "banka") return setKrok("banka");
    if (naJazdu) naJazdu();
  }
  const naNovuFakturu = () => setKrok("novaFaktura");
  /** Otvorí zachytávanie dokladu a zapamätá si, kam sa z neho vrátiť. */
  const doZachytu = (druh: Zachyt, odkial: Krok, hnedSkenovat = false, strany?: string[]) => {
    setZachyt(druh);
    setZachytZo(odkial);
    setZachytHned(hnedSkenovat);
    setStranyZoSkenera(strany?.length ? strany : null);
    setKrok("zachyt");
  };

  /*
    Bočný panel pre všetky agendy so spodnou lištou. Otvára ho „Viac" v lište
    — sú v ňom Banka a Kniha jázd (od smeru „A" bez vlastného miesta v lište),
    ponuky, prepnutie firmy a nastavenia.
  */
  const bocnyPanel = firma ? (
    <MobilPanel
      otvoreny={panel}
      onZavri={() => setPanel(false)}
      email={email}
      firma={firma}
      viacFiriem={firmy.length > 1}
      onZmenitFirmu={() => setKrok("firma")}
      onPrehlad={() => setKrok(DOMOV)}
      onDoklady={() => setKrok("doklady")}
      onFaktury={() => setKrok("faktury")}
      onPonuky={() => setKrok("ponuky")}
      onBanka={() => setKrok("banka")}
      onJazda={naJazdu}
      onUcet={() => {
        setPanel(false);
        setKrok("ucet");
      }}
      onZmazatUcet={() => {
        setPanel(false);
        setKrok("zmazanieUctu");
      }}
      onOdhlasit={odhlas}
    />
  ) : null;
  const listaProps = { onPrepni: prepniZalozku, onViac: () => setPanel(true), panel: bocnyPanel };

  if (krok === "prehlad" && firma)
    return (
      <SoSpodnouListou aktivna="prehlad" {...listaProps}>
        <Obrazovka onSpat={() => setPanel(true)}>
          <div className="flex min-h-[calc(100dvh-var(--spodna-lista,0px))] flex-col bg-app-pozadie">
            <Prehlad
              firma={firma}
              /*
                V hlavičke nie je názov obrazovky, ale za koho sa pracuje. Doklad
                uložený do zlej firmy sa hľadá ťažko, takže to musí byť vidieť
                stále — a keď je firiem viac, dá sa to odtiaľto rovno prepnúť.
              */
              viacFiriem={firmy.length > 1}
              onZmenitFirmu={() => setKrok("firma")}
              oznamy={
                novsia || zrusiSa ? (
                  <>
                    {novsia && (
                      <button
                        onClick={() => window.open(novsia.odkaz, "_blank")}
                        className="w-full rounded-app bg-app-zelena-jemna px-4 py-3 text-left text-[13px] font-semibold text-app-zelena"
                      >
                        {t("app.novaVerzia")}
                      </button>
                    )}
                    {zrusiSa && (
                      <button
                        onClick={() => setKrok("ucet")}
                        className="flex w-full items-start gap-2 rounded-app border border-app-chyba/40 bg-app-chyba-jemna px-4 py-3 text-left"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-app-chyba" />
                        <span className="min-w-0 text-[13px] text-app-text">
                          {t("app.zrusenieNaplanovane", {
                            termin: terminSlovom(zrusiSa, locale),
                            dni: `${dniDoZrusenia(zrusiSa)} ${mnozne(dniDoZrusenia(zrusiSa), {
                              one: t("spolocne.den1"),
                              few: t("spolocne.den2"),
                              other: t("spolocne.den5"),
                            })}`,
                          })}
                          <span className="block font-medium text-app-zelena">
                            {t("app.odvolatZiadost")}
                          </span>
                        </span>
                      </button>
                    )}
                  </>
                ) : undefined
              }
              onNovaFaktura={naNovuFakturu}
              onSkener={() => setKrok("skener")}
              onJazda={naJazdu}
              onBanka={() => setKrok("banka")}
              onFaktury={() => setKrok("faktury")}
              onDoklady={() => setKrok("doklady")}
            />
          </div>
        </Obrazovka>
      </SoSpodnouListou>
    );

  /*
    Skener-first. Kamera je celá obrazovka, takže hlavička aj spodná lišta sú
    tu priamo — `MobilObrazovka` počíta s obsahom, ktorý sa roluje, a tu sa
    rolovať nemá nič.
  */
  if (krok === "skener" && firma)
    return (
      <div className="flex h-[100dvh] flex-col bg-black">
        {/*
          Skener nemá hornú ani spodnú lištu. Hľadáčik má ísť od okraja po
          okraj — svetlý pruh nad ním by z neho spravil okno v aplikácii.
        */}
        <div aria-hidden style={{ paddingTop: "var(--safe-top)" }} className="bg-black" />
        <Skener
          companyId={firma.id}
          nastavenie={nastavenieDokladu}
          onNastavenie={setNastavenieDokladu}
          onQr={(raw) => {
            setQrZoSkenera(raw);
            doZachytu("blocek", "skener");
          }}
          onOdfotit={() => {
            setQrZoSkenera(null);
            doZachytu("blocek", "skener", true);
          }}
          onZachytene={(strany) => {
            setQrZoSkenera(null);
            doZachytu(strany.length > 1 ? "strany" : "blocek", "skener", false, strany);
          }}
          onZGalerie={() => {
            setQrZoSkenera(null);
            doZachytu("pdf", "skener");
          }}
          onViacstranovy={() => {
            setQrZoSkenera(null);
            doZachytu("strany", "skener", true);
          }}
          onViacDokladov={() => {
            setQrZoSkenera(null);
            doZachytu("davka", "skener");
          }}
          onPrijateDoklady={() => setKrok("doklady")}
          /*
            Skener je od smeru „A" celá obrazovka bez spodnej lišty — biely
            panel s ovládaním je dole namiesto nej. Krížik vráti tam, odkiaľ
            človek na skener prišiel.
          */
          onZavriet={() => setKrok(predSkenerom.current)}
        />
      </div>
    );

  if (krok === "doklady" && firma)
    return (
      <SoSpodnouListou aktivna="doklady" {...listaProps}>
        <Obrazovka onSpat={() => setKrok(DOMOV)}>
          <PrijateDoklady firma={firma} onSpat={() => setKrok(DOMOV)} />
        </Obrazovka>
      </SoSpodnouListou>
    );
  if (krok === "novaFaktura" && firma)
    return (
      <SoSpodnouListou aktivna="faktury" {...listaProps}>
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
      <SoSpodnouListou aktivna="jazda" {...listaProps}>
        <Obrazovka onSpat={() => setKrok(DOMOV)}>
          <Jazda firma={firma} onSpat={() => setKrok(DOMOV)} />
        </Obrazovka>
      </SoSpodnouListou>
    );
  if (krok === "banka" && firma)
    return (
      <SoSpodnouListou aktivna="banka" {...listaProps}>
        <Obrazovka onSpat={() => setKrok(DOMOV)}>
          <Banka firma={firma} onSpat={() => setKrok(DOMOV)} />
        </Obrazovka>
      </SoSpodnouListou>
    );
  if (krok === "ucet")
    return (
      <MobilObrazovka
        title={t("app.ucet")}
        subtitle={email ?? undefined}
        onBack={() => setKrok(DOMOV)}
      >
        <div className="space-y-4">
          <StavPushu />
          {firma && <CislaDopredu firma={firma} />}
          <button
            onClick={() => setDiagnostika(true)}
            className="w-full rounded-app border border-app-ramik p-4 text-left text-sm"
          >
            {t("app.diagnostika")}
            <span className="mt-1 block text-xs text-app-text-2">{t("app.diagnostikaPopis")}</span>
          </button>
          <ZrusenieUctu jazyk={jazyk} onZmena={setZrusiSa} />
        </div>
      </MobilObrazovka>
    );
  /*
    Zmazanie účtu samo, bez stavu notifikácií a rezervácií čísel nad ním. Na
    obrazovke Účet bolo až dole, mimo prvého pohľadu.
  */
  if (krok === "zmazanieUctu")
    return (
      <MobilObrazovka
        title={t("panel.zmazatUcet")}
        subtitle={email ?? undefined}
        onBack={() => setKrok(DOMOV)}
      >
        <ZrusenieUctu jazyk={jazyk} onZmena={setZrusiSa} />
      </MobilObrazovka>
    );
  if (krok === "faktury" && firma)
    return (
      <SoSpodnouListou aktivna="faktury" {...listaProps}>
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
  if (krok === "ponuky" && firma)
    return (
      <SoSpodnouListou aktivna="faktury" {...listaProps}>
        <Obrazovka onSpat={() => setKrok(DOMOV)}>
          <Ponuky
            firma={firma}
            onSpat={() => setKrok(DOMOV)}
            onNova={() => setKrok("novaPonuka")}
            /* Po prevode vedieme človeka do faktúr — nech vidí, že doklad je. */
            onFakturaVytvorena={() => setKrok("faktury")}
          />
        </Obrazovka>
      </SoSpodnouListou>
    );
  if (krok === "novaPonuka" && firma)
    return (
      <Obrazovka onSpat={() => setKrok("ponuky")}>
        <NovaPonuka
          firma={firma}
          onSpat={() => setKrok("ponuky")}
          onHotovo={() => setKrok("ponuky")}
        />
      </Obrazovka>
    );
  if (krok === "zachyt" && firma)
    return (
      <ZachytDokladu
        druh={zachyt}
        firma={firma}
        prednastavene={skenerPrvy ? nastavenieDokladu : undefined}
        hotovyQr={qrZoSkenera}
        zoSkenera={zachytZo === "skener"}
        hnedSkenovat={zachytHned}
        hotoveStrany={stranyZoSkenera}
        onSpat={() => setKrok(navratZoZachytu(zachytZo, false))}
        /*
          Zo skenera sa po uložení vraciame na skener, aby sa dal hneď nasnímať
          ďalší doklad; že sa uložil, povie hláška a odkaz na Prijaté doklady
          je priamo na ňom. Odinakiaľ ukážeme zoznam — inak doklad zmizne a
          nedá sa overiť, či sa vôbec uložil.
        */
        onUlozene={() => setKrok(navratZoZachytu(zachytZo, true))}
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
          className="w-full bg-app-zelena-jemna px-4 py-2 text-left text-[13px] text-app-zelena"
        >
          {t("app.novaVerzia")}
        </button>
      )}
      <Domov
        firma={firma}
        viacFiriem={firmy.length > 1}
        zrusiSa={zrusiSa}
        onUcet={() => setKrok("ucet")}
        onZachyt={(d) => doZachytu(d, DOMOV)}
        onDoklady={() => setKrok("doklady")}
        onNovaFaktura={() => setKrok("novaFaktura")}
        onFaktury={() => setKrok("faktury")}
        onJazda={naJazdu}
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
        onPonuky={() => setKrok("ponuky")}
        onUcet={() => {
          setPanel(false);
          setKrok("ucet");
        }}
        onZmazatUcet={() => {
          setPanel(false);
          setKrok("zmazanieUctu");
        }}
        onOdhlasit={odhlas}
      />
    </>
  );
}

/**
 * Prepnutie záložky vracia stránku na začiatok.
 *
 * Obrazovky sú rôzne vysoké a rolovanie je na celom dokumente. Bez tohto sa
 * posun z predošlej záložky prenesie do novej: keď je nová kratšia, prehliadač
 * ho musí orezať a spodok stránky poskočí. A na iPhone to nie je len skok —
 * v odkrytom páse pri spodnom okraji na okamih presvitá podklad WebView.
 *
 * `useLayoutEffect`, nie `useEffect`: posun sa musí zmeniť v tom istom
 * prekreslení ako nový obsah, inak je skok aj tak vidieť.
 */
function useNaZaciatokPriPrepnuti(aktivna: string) {
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [aktivna]);
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
  aktivna,
  onPrepni,
  onViac,
  panel,
  children,
}: {
  aktivna: Zalozka;
  onPrepni: (z: Zalozka) => void;
  /** „Viac" v lište — otvorí bočný panel. */
  onViac: () => void;
  /** Bočný panel; patrí k lište, lebo bez neho by „Viac" nemalo čo otvoriť. */
  panel: React.ReactNode;
  children: React.ReactNode;
}) {
  useNaZaciatokPriPrepnuti(aktivna);
  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-app-pozadie [&>*:first-child]:min-h-[calc(100dvh-var(--spodna-lista))]"
      style={
        {
          "--spodna-lista": SPODNA_LISTA,
          // Lišta bezpečnú zónu už drží; keby si ju pripočítala aj lepivá
          // pätka, ostala by nad lištou prázdna medzera na výšku palca.
          "--patka-spodok": "0px",
        } as React.CSSProperties
      }
    >
      {children}
      {/* Povolenia pre knihu jázd — pýtajú sa hneď, rovnako ako v Knihe jázd. */}
      <PovoleniaJazd />
      <BehNaPozadiOkno />
      <TabBar aktivna={aktivna} onPrepni={onPrepni} onViac={onViac} />
      {panel}
    </div>
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
  /** Chýba pri firme, ktorá knihu jázd nemá (nemecká). */
  onJazda?: () => void;
  onBanka: () => void;
  onUcet: () => void;
  onZmenitFirmu: () => void;
  onPanel: () => void;
  zrusiSa: string | null;
}) {
  const { t, mnozne, locale: loc } = usePreklad();
  /*
   * Českej firme sa nesmie sľubovať načítanie z Finančnej správy — evidencia
   * tržieb (EET) skončila v roku 2023 a register dokladov neexistuje. Z českého
   * QR kódu sa prečíta hlavička, položky ostávajú na fotku (`eet-cz.ts`).
   */
  const krajina = useKrajinaDane();
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
    <div className="flex min-h-[100dvh] flex-col bg-app-pozadie">
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
        title={t("app.fakturyADoklady")}
        subtitle={firma?.name ?? "Bez firmy"}
        left={
          <button
            onClick={onPanel}
            aria-label={t("panel.nastavenia")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full active:bg-app-ramik"
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
            <div className="px-4 pb-3 pt-1">
              <button
                onClick={viacFiriem ? onZmenitFirmu : undefined}
                className={`flex w-full items-center gap-2 rounded-app-sm border border-app-ramik bg-app-karta px-3 py-2.5 text-left ${
                  viacFiriem ? "active:bg-app-pozadie" : "cursor-default"
                }`}
              >
                <Building2 className="h-4 w-4 shrink-0 text-app-text-2" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-app-text">
                  {firma?.name ?? t("panel.bezFirmy")}
                </span>
                {viacFiriem && (
                  <span className="shrink-0 text-[12px] text-app-text-2">{t("ponuky.zmenit")}</span>
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
            className="flex w-full items-start gap-2 rounded-app-sm border border-app-chyba/40 bg-app-chyba-jemna px-4 py-3 text-left"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-app-chyba" />
            <span className="min-w-0 text-[13px]">
              {t("app.zrusenieNaplanovane", {
                termin: terminSlovom(zrusiSa, loc),
                dni: `${dniDoZrusenia(zrusiSa)} ${mnozne(dniDoZrusenia(zrusiSa), {
                  one: t("spolocne.den1"),
                  few: t("spolocne.den2"),
                  other: t("spolocne.den5"),
                })}`,
              })}
              <span className="block font-medium text-app-zelena">{t("app.odvolatZiadost")}</span>
            </span>
          </button>
        )}

        <Skupina nazov={t("domov.skupina.fakturacia")} />
        <VelkeTlacidlo
          icon={FilePlus2}
          label={t("domov.novaFaktura")}
          hint={t("domov.novaFakturaPopis")}
          variant="primary"
          onClick={onNovaFaktura}
        />
        <VelkeTlacidlo
          icon={FileText}
          label={t("domov.vystaveneFaktury")}
          hint={t("domov.vystaveneFakturyPopis")}
          onClick={onFaktury}
        />

        <Skupina nazov={t("domov.skupina.skenovanie")} />
        <VelkeTlacidlo
          icon={QrCode}
          label={t("domov.blocek")}
          hint={t(krajina === "CZ" ? "domov.blocekPopisCz" : "domov.blocekPopis")}
          onClick={() => onZachyt("blocek")}
        />
        <VelkeTlacidlo
          icon={FileText}
          label={t("domov.fakturaPdf")}
          hint={t("domov.fakturaPdfPopis")}
          onClick={() => onZachyt("pdf")}
        />
        <VelkeTlacidlo
          icon={Files}
          label={t("domov.viacstranovy")}
          hint={t("domov.viacstranovyPopis")}
          onClick={() => onZachyt("strany")}
        />
        <VelkeTlacidlo
          icon={Receipt}
          label={t("domov.prijateDoklady")}
          hint={t("domov.prijateDokladyPopis")}
          onClick={onDoklady}
        />

        <Skupina nazov={t("domov.skupina.banka")} />
        <VelkeTlacidlo
          icon={Landmark}
          label={t("domov.pohybyNaUcte")}
          hint={t("domov.pohybyNaUctePopis")}
          onClick={onBanka}
        />

        {onJazda && (
          <>
            <Skupina nazov={t("domov.skupina.jazdy")} />
            <VelkeTlacidlo
              icon={Car}
              label={t("domov.novaJazda")}
              hint={t("domov.novaJazdaPopis")}
              onClick={onJazda}
            />
          </>
        )}
      </main>

      <div style={{ paddingBottom: "calc(var(--safe-bottom) + 1rem)" }} />
    </div>
  );
}

function Skupina({ nazov }: { nazov: string }) {
  const { t } = usePreklad();
  return (
    <p className="px-1 pb-0.5 pt-3 text-[12px] font-semibold uppercase tracking-wide text-app-text-2">
      {nazov}
    </p>
  );
}

/* ------------------------- Zachytenie dokladu ------------------------- */

const NAZVY: Record<Zachyt, Kluc> = {
  blocek: "app.blocekQr",
  pdf: "app.fakturaPdf",
  strany: "app.viacstranovyDoklad",
  davka: "davka.nadpis",
};

function ZachytDokladu({
  druh,
  firma,
  onSpat,
  onUlozene,
  prednastavene,
  hotovyQr,
  zoSkenera,
  hnedSkenovat,
  hotoveStrany,
}: {
  druh: Zachyt;
  firma: Firma;
  onSpat: () => void;
  onUlozene: () => void;
  /** Úhrada a kategória vybrané na skeneri — človek ich už nemusí klikať znova. */
  prednastavene?: NastavenieDokladu;
  /** QR prečítaný už na úvodnej obrazovke; čítanie sa nespúšťa druhý raz. */
  hotovyQr?: string | null;
  /** Sem sa vošlo z celoobrazovkového skenera — „späť" vedie naň. */
  zoSkenera?: boolean;
  /**
   * Na telefóne hneď otvoriť fotenie (spúšť alebo „Viacstranový" na skeneri,
   * keď kamera v stránke nejde). Na webe sa ignoruje — tam ostáva obrazovka
   * s tlačidlom, lebo výber súboru prehliadač pustí len z ťuknutia.
   */
  hnedSkenovat?: boolean;
  /**
   * Strany už odfotené a upravené na skeneri („Upraviť doklad"). Spracujú
   * sa hneď, rovnako ako predtým výsledok systémového skenera.
   */
  hotoveStrany?: string[] | null;
}) {
  const { t } = usePreklad();
  /* Sadzby DPH a mena pri čítaní z fotky sa riadia krajinou firmy. */
  const krajina = useKrajinaDane();
  const nacitaj = useOperacia<BlocekVysledok>("blocek-precitaj");
  const uloz = useOperacia("vydavok-uloz");
  const hladajDuplikat = useOperacia<NajdenyDoklad | null>("vydavok-duplikat");
  /* Zálohová faktúra od dodávateľa nie je bloček — ide rovno medzi prijaté zálohy. */
  const ulozZalohu = useOperacia<{ id: string; invoice_number: string }>("prijata-zaloha-uloz");

  const [stav, setStav] = useState<"start" | "citam" | "potvrdenie">("start");
  const [vysledok, setVysledok] = useState<BlocekVysledok | null>(null);
  const [uhrada, setUhrada] = useState<Uhrada | null>(prednastavene?.uhrada ?? null);
  const [foto, setFoto] = useState<string | null>(null);
  const [strany, setStrany] = useState<string[]>([]);
  const [skenujem, setSkenujem] = useState(false);
  /** QR kód sa odloží aj vtedy, keď ho server nemal ako prečítať. */
  const [qrKod, setQrKod] = useState<string | null>(null);
  /** Doklad, ktorý už vo firme je. Neblokuje uloženie, len naň upozorní. */
  const [duplikat, setDuplikat] = useState<NajdenyDoklad | null>(null);
  /** Súbor odovzdaný na rozpoznanie (jeden skener na všetko). */
  const [naRozpoznanie, setNaRozpoznanie] = useState<string | null>(null);
  /**
   * Viac rôznych dokladov naraz — z galérie (viac súborov) alebo fotených za
   * sebou. `null` = dávka nie je otvorená; vstup „Viac dokladov" zo skenera
   * ju otvára prázdnu.
   */
  const [davka, setDavka] = useState<VstupDavky[] | null>(druh === "davka" ? [] : null);

  /** Doklad prečítaný — ďalej sa pýtame na úhradu a na fotku. */
  function prijmi(r: BlocekVysledok, prilozene?: string | null) {
    setVysledok(r);
    // Úhrada z dokladu má prednosť; inak ostáva tá, ktorú človek zvolil na skeneri.
    setUhrada(r.payment_method ?? prednastavene?.uhrada ?? null);
    if (prilozene) setFoto(prilozene);
    setStav("potvrdenie");
    if (r.zdroj === "nic") toast.error(r.poznamka ?? t("app.nepodariloPrecitat"));
    void overDuplicitu(r);
  }

  /*
    Ten istý bloček sa naskenuje ľahko — raz v obchode a raz doma z fotky.
    Pýtame sa na to hneď po prečítaní, nie až pri ukladaní: kým človek vyberá
    úhradu, odpoveď je späť a upozornenie je na obrazovke skôr, než stlačí
    uložiť. Keď hľadanie zlyhá, mlčíme — duplicita je pomoc, nie podmienka, a
    zápis ju aj tak druhý raz nepustí.
  */
  async function overDuplicitu(r: BlocekVysledok) {
    setDuplikat(null);
    try {
      const najdeny = await hladajDuplikat({
        data: {
          company_id: firma.id,
          qr_raw: r.qr_raw ?? null,
          supplier_ico: r.supplier_ico ?? null,
          supplier_name: r.supplier ?? null,
          document_number: r.document_number ?? null,
          issue_date: r.date ?? null,
          total_amount: r.total ?? null,
        },
      });
      setDuplikat(najdeny ?? null);
    } catch {
      /* bez signálu alebo pri chybe sa na duplicitu nepýtame druhý raz */
    }
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
      prijmi((await nacitaj({ data: { ...vstup, krajina } })) as BlocekVysledok, prilozene);
    } catch (e: any) {
      const { isOnline } = await import("@/lib/mobile/offline-queue");
      if (!(await isOnline())) {
        const { nedostupnyDoklad } = await import("@/lib/mobile/doklady-odoslanie");
        prijmi(nedostupnyDoklad(vstup.qr), prilozene);
      } else {
        toast.error(e?.message ?? t("app.citanieZlyhalo"));
        setStav("start");
        return;
      }
    }
    /*
      Načítaný len QR kód (kamera na skeneri, „Nasnímať QR kód"). Bez fotky
      sa bloček uložiť nedá, takže kamera sa otvorí hneď — človek drží bloček
      ešte v ruke. Keď fotenie zruší, na obrazovke ostane výzva odfotiť ho.
      Bez ťuknutia sa dá otvoriť len kamera v stránke alebo natívna; výber
      súboru na webe by prehliadač nepustil, tam ostáva tlačidlo.
    */
    if (vstup.qr && !prilozene && (Capacitor.isNativePlatform() || kameraVStrankeMozna()))
      await odfotBlocek();
  }

  /** Fotka k bločku — jedna strana tou istou kamerou ako všade v appke. */
  async function odfotBlocek() {
    const [obrazok] = (await zachytStrany({ jednaStrana: true })) ?? [];
    if (obrazok) setFoto(obrazok);
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

  /*
    Jeden skener na všetko. Fotka, súbor aj spojené strany idú do
    Nespracovaných dokladov a server sám rozpozná, či je to bloček, prijatá
    faktúra, zálohová, dobropis alebo iný doklad — človek nemusí vopred
    vedieť, kam čo patrí.

    Rozpoznanie robí AI na serveri, takže potrebuje sieť. Bez signálu ide
    doklad po starom ako bloček do fronty v telefóne: tá vie počkať aj
    prežiť zatvorenie appky, a bloček je to, čo sa fotí v teréne najčastejšie.
  */
  async function rozpoznajAleboPrecitaj(dataUrl: string, qr?: string) {
    const { isOnline } = await import("@/lib/mobile/offline-queue");
    if (!(await isOnline())) return precitaj({ qr, image_data_url: dataUrl }, dataUrl);
    setNaRozpoznanie(dataUrl);
  }

  /**
   * Odfotenie dokladu. Kamera dokladu (jedna v celej appke, s úpravou rohov
   * a filtrami), kde nejde, fotoaparát alebo výber súboru. Vráti `false`,
   * keď človek fotenie zrušil.
   */
  async function odfotDoklad(): Promise<boolean> {
    return spracujStrany(await zachytStrany());
  }

  /**
   * Odfotené strany do toku. Viac strán je tu jeden doklad — spoja sa do PDF
   * rovnako ako pri „Viacstranovom". Kto chce viac rôznych dokladov, má na
   * to dávku.
   */
  async function spracujStrany(naskenovane: string[] | null): Promise<boolean> {
    if (!naskenovane?.length) return false;
    if (naskenovane.length > 1) {
      await spojAOdosli(naskenovane);
      return true;
    }
    const [obrazok] = naskenovane;
    // QR sa hľadá v obrázku ešte v telefóne, takže ho fronta má aj bez signálu.
    // Na vyrovnanej snímke je kód väčší a rovný, takže sa prečíta častejšie.
    const qr = await scanQrFromImage(obrazok);
    /*
      Kód bločku (eKasa, český EET) sa číta ďalej po starom cez Finančnú
      správu — je presnejší než AI. Platobný QR na faktúre bloček nerobí.
    */
    if (qr?.raw && jeBlockovyQr(qr.raw))
      await precitaj({ qr: qr.raw, image_data_url: obrazok }, obrazok);
    else await rozpoznajAleboPrecitaj(obrazok, qr?.raw);
    return true;
  }

  /*
    Strany odfotené už na skeneri. Spracujú sa raz — pri prekreslení by sa
    inak nahrávali znova. Kým sa spracúvajú, svieti „Čítam doklad…", nie
    obrazovka s tlačidlami.
  */
  const hotoveSpracovane = useRef(false);
  const [skenerOtvoreny, setSkenerOtvoreny] = useState(!!hotoveStrany?.length);
  useEffect(() => {
    if (!hotoveStrany?.length || hotoveSpracovane.current) return;
    hotoveSpracovane.current = true;
    void (async () => {
      try {
        if (!(await spracujStrany(hotoveStrany))) onSpat();
      } finally {
        setSkenerOtvoreny(false);
      }
    })();
    // eslint-disable-next-line
  }, [hotoveStrany]);

  /*
    Zo skenera (keď kamera v stránke nejde) sa na telefóne ide rovno do
    fotenia — medzikrok s tlačidlom „Odfotiť" by bol zbytočný. Na webe
    ostáva: prehliadač pustí fotoaparát aj výber súboru len z ťuknutia.
    Zrušené fotenie vráti človeka späť na skener, bez chyby.
  */
  const hnedSpustene = useRef(false);
  useEffect(() => {
    if (!hnedSkenovat || hnedSpustene.current) return;
    hnedSpustene.current = true;
    void (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      setSkenerOtvoreny(true);
      try {
        const zachytene = druh === "strany" ? await pridajStranu() : await odfotDoklad();
        if (!zachytene) onSpat();
      } finally {
        setSkenerOtvoreny(false);
      }
    })();
    // eslint-disable-next-line
  }, [hnedSkenovat]);

  /*
    --- Súbor z telefónu: PDF alebo obrázok, aj viac naraz ---

    Jeden súbor ide po starom (aj bez signálu ako bloček). Viac súborov je viac
    dokladov — každý sa rozpozná zvlášť v dávke. Dávka potrebuje sieť: fronta
    bez signálu vie len bločky a desať faktúr by z nej vyšlo ako desať bločkov.
  */
  async function vyberPdf() {
    const subory = await vyberSubory("application/pdf,image/*", true);
    if (subory.length === 0) return;
    /*
      Fotka z galérie ide tou istou cestou ako odfotená: QR bločku sa hľadá
      v telefóne a bloček sa načíta z Finančnej správy. Predtým išla rovno na
      AI — pomalšie, drahšie a bez položiek z eKasy.
    */
    if (subory.length === 1)
      return subory[0].dataUrl.startsWith("data:image/")
        ? void (await spracujStrany([subory[0].dataUrl]))
        : rozpoznajAleboPrecitaj(subory[0].dataUrl);
    const { isOnline } = await import("@/lib/mobile/offline-queue");
    if (!(await isOnline())) {
      toast.error(t("davka.bezSignalu"));
      return;
    }
    setDavka(subory.map((s) => ({ subor: s.dataUrl, nazov: s.nazov })));
  }

  /*
    „Odfotiť ďalší doklad" z obrazovky rozpoznaného dokladu. Ten je už
    nahratý, takže ide do dávky s id a dočíta sa tam. Kamera sa otvára hneď v
    tom istom ťuknutí — na webe by ju prehliadač mimo ťuknutia nepustil.
  */
  async function dalsiDoklad(id: string) {
    const prvy = naRozpoznanie;
    if (!prvy) return;
    // V dávke je každá odfotená strana samostatný doklad (pozri DavkaDokladov).
    const dalsie = (await zachytStrany({ davka: true })) ?? [];
    setDavka([{ subor: prvy, id }, ...dalsie.map((subor) => ({ subor }))]);
    setNaRozpoznanie(null);
  }

  /* --- Viacstranový doklad --- */
  /**
   * Kamera dokladu vie odfotiť viac strán za sebou („Pridať stranu"), takže
   * jedno ťuknutie môže pridať celý doklad. Ďalšie ťuknutie pridá ďalšie
   * strany na koniec.
   */
  async function pridajStranu(): Promise<boolean> {
    const nove = await zachytStrany();
    if (!nove?.length) return false;
    setStrany((s) => [...s, ...nove]);
    return true;
  }

  /** Strany jedného dokladu → jedno PDF → rozpoznanie. Jedna strana ostáva obrázkom. */
  async function spojAOdosli(zoznam: string[]) {
    if (zoznam.length === 0) return;
    if (zoznam.length === 1) return rozpoznajAleboPrecitaj(zoznam[0]);
    setStav("citam");
    let pdf: string;
    try {
      pdf = await stranyDoPdf(zoznam);
    } catch (e: any) {
      toast.error(e?.message ?? t("app.spojenieStranZlyhalo"));
      setStav("start");
      return;
    }
    // Všetky strany idú ako jedno PDF — AI číta celý doklad naraz.
    setStav("start");
    await rozpoznajAleboPrecitaj(pdf);
  }

  async function dokonciStrany() {
    await spojAOdosli(strany);
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
      kategoria: prednastavene?.kategoria ?? null,
      // Táto verzia nepustí bloček bez fotky — server ho podľa toho uloží do Bločkov.
      fotkaPovinna: true,
      predvolby: prednastavene
        ? { zakazka: prednastavene.zakazka, predkontacia: prednastavene.predkontacia, poznamka: prednastavene.poznamka }
        : null,
      vysledok: vysledok,
    });
    toast.success(dovod);
    onUlozene();
  }

  /*
    Ukladá sa na pozadí.

    Fotka dokladu má bežne jeden až tri megabajty a na mobilnej sieti trvá jej
    nahratie aj so zápisom desiatky sekúnd. Človek dovtedy stál nad obrazovkou
    „Ukladám doklad…" s ďalším bločkom v ruke. Doklad preto ide do tej istej
    fronty, ktorá drží doklady bez signálu — tá vie počkať, opakovať pokus aj
    prežiť zatvorenie appky — a obrazovka sa vráti hneď.

    Zdvojeniu bráni zápis na serveri: doklad s rovnakým QR kódom sa druhý raz
    nezaloží, nech sa pokus zopakuje koľkokrát chce.
  */
  /**
    Zálohová faktúra od dodávateľa.

    Nie je daňový doklad, takže medzi bločky nepatrí — daň z nej odpočítať
    nemožno a v Dokladoch by ju niekto musel prekliknúť ručne. Ukladá sa preto
    rovno medzi prijaté zálohové faktúry, aj s fotkou. Bez signálu to nejde
    (treba nahrať prílohu), vtedy doklad ostane vo fronte ako doteraz a
    zaradí sa pri presune.
  */
  async function ulozZalohovuFakturu(): Promise<boolean> {
    if (!vysledok?.zalohova || !foto) return false;
    const { isOnline } = await import("@/lib/mobile/offline-queue");
    if (!(await isOnline())) return false;
    try {
      const ciarka = foto.indexOf(",");
      const mime = foto.slice(5, foto.indexOf(";")) || "image/jpeg";
      const v = await ulozZalohu({
        data: {
          company_id: firma.id,
          subor: foto.slice(ciarka + 1),
          nazov: `zalohova-faktura.${mime === "application/pdf" ? "pdf" : "jpg"}`,
          mime,
          druh: "proforma",
        },
      });
      toast.success(t("app.zalohaUlozena", { cislo: v.invoice_number }));
      onUlozene();
      return true;
    } catch {
      /* Keď to zlyhá, doklad sa uloží obvyklou cestou a nič sa nestratí. */
      return false;
    }
  }

  async function ulozDoklad() {
    // Bez fotky a úhrady sa bloček neuloží; tlačidlo je dovtedy neaktívne.
    if (!vysledok || !uhrada || coChybaBlocku({ foto, uhrada })) return;
    if (await ulozZalohovuFakturu()) return;
    const { isOnline } = await import("@/lib/mobile/offline-queue");
    const online = await isOnline();
    await odlozDoklad(online ? t("app.dokladSaUklada") : t("app.bezSignaluOdosleSa"));
    if (!online) return;

    const { odosliCakajuce } = await import("@/lib/mobile/doklady-odoslanie");
    void odosliCakajuce(firma.id, nacitaj as any, uloz as any)
      .then(({ odoslane }) => {
        if (odoslane > 0) toast.success(t("app.dokladUlozeny"));
      })
      .catch(() => {
        /* doklad ostáva vo fronte aj s dôvodom; vidieť ho v Prijatých dokladoch */
      });
  }

  if (skenujem) return <QrSkener onNajdene={precitajQr} onZrusit={() => setSkenujem(false)} />;
  if (davka)
    return (
      <DavkaDokladov
        firma={firma}
        pociatocne={davka}
        nastavenie={prednastavene}
        onHotovo={onUlozene}
        onSpat={() => {
          setDavka(null);
          if (zoSkenera || druh === "davka") onSpat();
        }}
      />
    );
  if (naRozpoznanie)
    return (
      <RozpoznanyDoklad
        firma={firma}
        subor={naRozpoznanie}
        nastavenie={prednastavene}
        onUlozene={onUlozene}
        // Doklad je v Nespracovaných — odchádza sa rovnako ako po uložení.
        onNechat={onUlozene}
        onDalsi={(id) => void dalsiDoklad(id)}
        onSpat={() => {
          setNaRozpoznanie(null);
          setStrany([]);
          if (zoSkenera) onSpat();
        }}
      />
    );
  if (stav === "citam" || (skenerOtvoreny && stav === "start"))
    return <Pracujem text={t("app.citamDoklad")} />;

  if (stav === "potvrdenie" && vysledok) {
    return (
      <Potvrdenie
        vysledok={vysledok}
        duplikat={duplikat}
        uhrada={uhrada}
        setUhrada={setUhrada}
        foto={foto}
        onOdfotit={odfotBlocek}
        onUloz={ulozDoklad}
        onSpat={() => {
          /*
            Zo skenera sa „späť" vracia rovno naň. Krok nižšie je náhrada
            kamery pre web — po nasnímaní na telefóne by pôsobil ako druhý,
            zjednodušený skener.
          */
          if (zoSkenera) return onSpat();
          setVysledok(null);
          setFoto(null);
          setStrany([]);
          setStav("start");
        }}
      />
    );
  }

  return (
    <MobilObrazovka title={t(NAZVY[druh])} subtitle={firma.name} onBack={onSpat}>
      {druh === "blocek" && (
        <div className="space-y-3">
          <VelkeTlacidlo
            icon={ScanLine}
            label={t("app.nasnimatQr")}
            hint={t("app.namierteNaBlocek")}
            variant="primary"
            onClick={nasnimajQr}
          />
          <VelkeTlacidlo
            icon={Camera}
            label={t("app.odfotitBlocek")}
            hint={t("app.qrNaFotke")}
            onClick={odfotDoklad}
          />
        </div>
      )}

      {druh === "pdf" && (
        <div className="space-y-3">
          <VelkeTlacidlo
            icon={FileText}
            label={t("app.vybratSubor")}
            hint={t("app.pdfAleboObrazokViac")}
            variant="primary"
            onClick={vyberPdf}
          />
          <p className="text-xs text-app-text-2">{t("app.zFakturyPrecita")}</p>
        </div>
      )}

      {druh === "strany" && (
        <div className="space-y-3">
          <VelkeTlacidlo
            icon={Camera}
            label={strany.length === 0 ? t("app.odfotitPrvuStranu") : t("app.pridatDalsiuStranu")}
            hint={
              strany.length > 0
                ? t("app.zatialStran", { pocet: strany.length })
                : t("app.dokladOdfotteCely")
            }
            variant="primary"
            onClick={pridajStranu}
          />
          {strany.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {strany.map((s, i) => (
                  <div
                    key={i}
                    className="relative overflow-hidden rounded-lg border border-app-ramik"
                  >
                    <img src={s} alt={`strana ${i + 1}`} className="h-24 w-full object-cover" />
                    <button
                      onClick={() => setStrany((p) => p.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-xs text-white"
                      aria-label={t("app.odstranitStranu", { n: i + 1 })}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <VelkeTlacidlo
                icon={Check}
                label={t("app.hotovoStran", { pocet: strany.length })}
                hint={t("app.stranySaSpoja")}
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

export function Potvrdenie({
  vysledok,
  duplikat,
  uhrada,
  setUhrada,
  foto,
  onOdfotit,
  onUloz,
  onSpat,
}: {
  vysledok: BlocekVysledok;
  /** Ten istý doklad, ktorý vo firme už je — inak `null`. */
  duplikat: NajdenyDoklad | null;
  uhrada: Uhrada | null;
  setUhrada: (u: Uhrada) => void;
  foto: string | null;
  onOdfotit: () => void;
  onUloz: () => void;
  onSpat: () => void;
}) {
  const { t, locale: loc } = usePreklad();
  const mena = vysledok.currency ?? "EUR";
  const suma = (n?: number) => (n == null ? "—" : formatovacMeny(mena, loc)(n));
  /* Fotka je povinná (Patrik, 2026-10-29) — chýba skôr než úhrada, pýta sa prvá. */
  const chyba = coChybaBlocku({ foto, uhrada });

  return (
    <MobilObrazovka
      title={t("app.skontrolujteDoklad")}
      subtitle={vysledok.zdroj === "ekasa" ? t("pd.zFinancnejSpravy") : t("app.precitaneZDokladu")}
      onBack={onSpat}
      footer={
        <HlavneTlacidlo onClick={onUloz} disabled={chyba !== null}>
          {chyba === "foto" ? (
            <span className="inline-flex items-center gap-1.5" data-chyba-fotka>
              <Camera className="h-4 w-4" /> {t("app.najprvOdfotte")}
            </span>
          ) : uhrada ? (
            /* Pri známom duplikáte sa tlačidlo prizná, čo sa stane. */
            duplikat ? (
              t("app.ulozitAjTak")
            ) : (
              t("app.ulozitDoklad")
            )
          ) : (
            /*
              Šípka nahor je tu naschvál: tlačidlo drží spodok obrazovky a
              výber úhrady môže byť odrolovaný mimo dohľadu. Bez nej človek
              číta „vyberte spôsob úhrady" a nevie kde.
            */
            <span className="inline-flex items-center gap-1.5">
              <ArrowUp className="h-4 w-4" /> {t("app.vyberteUhradu")}
            </span>
          )}
        </HlavneTlacidlo>
      }
    >
      <div className="space-y-4">
        {/*
          Bez fotky sa bloček neuloží. Výzva je hore, nie pri fotke dole —
          po načítaní QR kódu je to jediná vec, ktorá chýba, a tlačidlo
          Uložiť je dovtedy neaktívne.
        */}
        {!foto && (
          <div
            role="alert"
            data-fotka-povinna
            className="rounded-app border border-primary/50 bg-primary/5 p-4 ring-4 ring-primary/10"
          >
            <div className="text-[15px] font-semibold text-app-zelena">{t("app.fotkaPovinna")}</div>
            <div className="mt-1 text-[13px] text-app-text-2">{t("app.fotkaPovinnaPopis")}</div>
            <div className="mt-3">
              <VelkeTlacidlo
                icon={Camera}
                label={t("app.odfotitBlocekTeraz")}
                hint={t("app.papierovyDoklad")}
                variant="primary"
                onClick={onOdfotit}
              />
            </div>
          </div>
        )}

        {/*
          Upozornenie na už uložený doklad. Nie je to zákaz — bloček s tým istým
          číslom môže vzniknúť aj omylom pokladnice — ale má byť vidieť skôr,
          než sa siahne na tlačidlo, tak je nad sumou, nie pod ňou.
        */}
        {duplikat && (
          <div
            role="status"
            className="rounded-app border border-app-pozor/40 bg-app-pozor-jemna p-4 text-[14px]"
          >
            <div className="font-semibold text-app-pozor">{t("app.dokladUzMate")}</div>
            <div className="mt-1 text-app-text-2">
              {t("app.dokladUzMatePopis", {
                datum: duplikat.issue_date ? datum(duplikat.issue_date, loc) : "—",
                suma:
                  duplikat.total_amount == null
                    ? "—"
                    : formatovacMeny(duplikat.currency ?? mena, loc)(duplikat.total_amount),
              })}
            </div>
          </div>
        )}

        <div className="rounded-app border border-app-ramik bg-app-karta p-4 shadow-[var(--shadow-card)]">
          <div className="text-[32px] font-semibold leading-none tabular-nums">
            {suma(vysledok.total)}
          </div>
          <div className="mt-2 text-[14px] text-app-text-2">
            {vysledok.supplier ?? t("app.neznamyPredajca")}
            {vysledok.date ? ` · ${datum(vysledok.date, loc)}` : ""}
          </div>
          {vysledok.vat_amount != null && (
            <div className="mt-2 text-xs text-app-text-2">
              {t("app.zTohoDph", { suma: suma(vysledok.vat_amount) })}
              {vysledok.vat_breakdown?.length
                ? ` (${vysledok.vat_breakdown.map((s) => `${s.sadzba} %`).join(" + ")})`
                : ""}
            </div>
          )}
          {vysledok.items.length > 0 && (
            <div className="mt-2 text-xs text-app-text-2">
              {t("app.poloziekZDokladu", { pocet: vysledok.items.length })}
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
          className={`rounded-app transition-colors ${
            uhrada ? "" : "border border-primary/50 bg-primary/5 p-3 ring-4 ring-primary/10"
          }`}
        >
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
            {t("rd.uhrada")}
            {!uhrada && (
              <span className="rounded-full bg-app-zelena-plocha px-2 py-0.5 text-[11px] font-semibold text-white">
                {t("app.povinne")}
              </span>
            )}
            {vysledok.payment_method && (
              <span className="text-xs font-normal text-app-text-2">
                {t("app.zDokladuZatvorka")}
              </span>
            )}
          </div>
          {!uhrada && <p className="mb-2 text-xs text-app-zelena">{t("app.vyberteMoznost")}</p>}
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["hotovost", t("pd.hotovost")],
                ["karta", t("pd.kartou")],
                ["prevod", t("pd.prevodom")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setUhrada(id)}
                className={`rounded-app border py-3.5 text-[14px] transition active:scale-[0.98] ${
                  uhrada === id
                    ? "border-primary bg-primary/10 font-semibold text-app-zelena"
                    : uhrada
                      ? "border-app-ramik bg-app-karta text-foreground"
                      : "border-primary/40 bg-app-karta font-medium text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {uhrada === "hotovost" && (
            <p className="mt-1.5 text-xs text-app-text-2">{t("app.hotovostnyDoklad")}</p>
          )}
        </div>

        {foto && (
          <div>
            <div className="mb-2 text-sm font-medium">{t("app.fotkaDokladu")}</div>
            <div className="space-y-2">
              <div className="overflow-hidden rounded-app-sm border border-app-ramik">
                {foto.startsWith("data:application/pdf") ? (
                  <div className="flex items-center gap-2 p-4 text-sm text-app-text-2">
                    <FileText className="h-5 w-5" /> {t("app.prilozenePdf")}
                  </div>
                ) : (
                  <img src={foto} alt="doklad" className="max-h-56 w-full object-contain" />
                )}
              </div>
              <button
                onClick={onOdfotit}
                className="w-full rounded-app-sm border border-app-ramik px-4 py-2.5 text-sm"
              >
                {t("app.odfotitZnova")}
              </button>
            </div>
          </div>
        )}
      </div>
    </MobilObrazovka>
  );
}
