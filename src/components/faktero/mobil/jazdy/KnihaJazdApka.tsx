import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { nacitajUlozenuRelaciu } from "@/lib/mobile/relacia";
import { vyberFirmy } from "@/lib/mobile/start";
import {
  fetchMyCompanies,
  getActiveCompanyId,
  setActiveCompanyId,
} from "@/lib/faktero/active-company";
import { isBiometricAvailable, isBiometricEnabled } from "@/lib/mobile/biometric";
import { beziacaJazda } from "@/lib/mobile/auto-jazdy-sync";
import { VYCHODZI_APKA, nacitajMotiv, nasadMotiv, sledujSystem } from "@/lib/faktero/motiv";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { ZrusenieUctu } from "@/components/faktero/ZrusenieUctu";
import { Prihlasenie, VyberFirmy, Zamok } from "../Vstup";
import { RegistraciaUctu } from "../RegistraciaUctu";
import { VytvorFirmu } from "../VytvorFirmu";
import { MobilPanel } from "../MobilPanel";
import { PovoleniaJazd } from "../PovoleniaJazd";
import { AppHeader, MobilObrazovka, PasHore, Pracujem } from "../MobilChrome";
import { PrehladJazd } from "./PrehladJazd";
import { HistoriaVozidiel } from "./HistoriaVozidiel";
import { VozidlaJazd } from "./VozidlaJazd";
import { TabBarJazd, type ZalozkaJazd } from "./TabBarJazdy";

/**
 * Kniha jázd — samostatná aplikácia.
 *
 * Tá istá kniha jázd, aká je vo Fakteri, ale bez fakturácie: pre firmy, ktoré
 * len evidujú jazdy. Obrazovky sú spoločné (`Jazda`, `HistoriaJazd`,
 * `NoveVozidlo`), spoločný je aj vstup — prihlásenie, zámok a výber firmy sú
 * v `Vstup.tsx`. Vlastný je len tento obal a spodná lišta.
 *
 * Štart je zámerne vlastný a nie zdieľaný s `MobilApp.tsx`: tá je práve
 * v obchode a jej štart rieši aj skener, doklady a hlboké odkazy, ktoré tu
 * neexistujú. Pravidlá, na ktorých záleží — strop na overenie relácie, druhý
 * pokus po načítaní úložiska a posledný známy zoznam firiem — sú tu tie isté;
 * sú to práve tie, ktoré appku kedysi „samu odhlasovali".
 */

const Jazda = lazy(() => import("../Jazda").then((m) => ({ default: m.Jazda })));
const Diagnostika = lazy(() => import("../Diagnostika").then((m) => ({ default: m.Diagnostika })));

type Firma = { id: string; name: string };
/** Relácia zo Supabase — z celého objektu nás zaujíma len prihlásený človek. */
type Relacia = { user?: { email?: string | null } | null };

type Krok =
  | "nacitavam"
  | "prihlasenie"
  | "registracia"
  | "novaFirma"
  | "firma"
  | "prehlad"
  | "jazda"
  | "historia"
  | "vozidla"
  | "ucet";

export function KnihaJazdApka() {
  /* Motív nasadzuje appka sama — AppShell tu nie je. Predvolený je svetlý. */
  useEffect(() => {
    const volba = nacitajMotiv(VYCHODZI_APKA);
    nasadMotiv(volba);
    return sledujSystem(() => nacitajMotiv(VYCHODZI_APKA));
  }, []);

  return (
    <>
      <PasHore />
      <ObsahJazd />
    </>
  );
}

function ObsahJazd() {
  const { t } = usePreklad();
  const [krok, setKrok] = useState<Krok>("nacitavam");
  /* Neskoro dobehnutá relácia sa rozhoduje mimo renderu — `krok` v uzávere je
     v tej chvíli už zastaraný. */
  const krokRef = useRef<Krok>("nacitavam");
  krokRef.current = krok;
  const [firmy, setFirmy] = useState<Firma[]>([]);
  const [firma, setFirma] = useState<Firma | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [faza, setFaza] = useState("štart");
  const [chybaStartu, setChybaStartu] = useState<string | null>(null);
  const [dlho, setDlho] = useState(false);
  const [zamknute, setZamknute] = useState(false);
  const [panel, setPanel] = useState(false);
  const [diagnostika, setDiagnostika] = useState(false);
  const [bezi, setBezi] = useState(false);

  /**
   * Kto je prihlásený a za akú firmu.
   *
   * `studenyStart` rozlišuje spustenie appky od návratu po prihlásení: pri
   * spustení sa zamyká biometriou (relácia prežije zabitie appky), po
   * prihlásení nie — človek sa práve preukázal.
   */
  async function zisti(studenyStart = false) {
    setFaza("prihlásenie");
    /*
      Ticho a prázdno sa musia rozlíšiť. Keď `getSession()` neodpovie, môže na
      pozadí obnovovať token — a tá obnova prejde. Brať mlčanie ako „nie je
      prihlásený" znamená poslať človeka zadávať heslo, ktoré nepotrebuje.
    */
    const STROP = Symbol("strop");
    const dotaz = supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    type Odpoved = { data: { session: Relacia | null } };
    const vysledok = (await Promise.race([
      dotaz,
      new Promise((res) => setTimeout(() => res(STROP), 6000)),
    ])) as Odpoved | typeof STROP;
    const stroplo = vysledok === STROP;
    const zoServera = stroplo ? null : (vysledok as Odpoved).data.session;

    let relacia = zoServera ?? nacitajUlozenuRelaciu();

    /*
      Ani jedno z toho nečíta Keychain priamo — obe siahajú do pamäte, ktorú
      napĺňa `pripravUlozisko()`. Kým sa nedočíta, platná relácia vyzerá ako
      žiadna. Presne tak sa appka „sama odhlasovala".
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
        .catch(() => ({ data: { session: null } }))) as { data: { session: Relacia | null } };
      relacia = znova.session ?? nacitajUlozenuRelaciu();
    }

    if (!relacia) {
      setKrok("prihlasenie");
      /* Keď obnova dobehne až teraz, appka to má prijať — nie čakať, kým človek
         odklepe heslo, ktoré nepotreboval. */
      if (stroplo)
        void dotaz.then((neskoro) => {
          if (!(neskoro as { data?: { session?: Relacia | null } })?.data?.session) return;
          if (krokRef.current === "prihlasenie") void zisti(false);
        });
      return;
    }

    setFaza("odomknutie");
    if (studenyStart && (await isBiometricEnabled()) && (await isBiometricAvailable()))
      setZamknute(true);
    setEmail(relacia.user?.email ?? null);

    setFaza("firmy");
    const { ulozDoPamate, zPamate } = await import("@/lib/mobile/jazdy-lokalne");
    /* Kľúč zámerne bez id používateľa — pri núdzovom čítaní relácie nemusí byť
       po ruke a zoznam by sa hľadal pod iným menom. */
    const klucFiriem = "firmy";
    try {
      let zoznam: Firma[];
      try {
        const { isOnline } = await import("@/lib/mobile/offline-queue");
        if (!(await isOnline())) throw new Error(t("app.bezPripojeniaKratke"));
        zoznam = (await Promise.race([
          fetchMyCompanies(),
          new Promise((_, zamietni) =>
            setTimeout(() => zamietni(new Error(t("app.bezOdpovede"))), 8000),
          ),
        ])) as Firma[];
        void ulozDoPamate(klucFiriem, zoznam);
      } catch {
        const zapamatane = await zPamate<Firma[]>(klucFiriem);
        if (!zapamatane?.hodnota?.length) {
          /* Tvrdiť bez siete, že k účtu nepatrí firma, by bola nepravda. */
          setChybaStartu(t("app.bezPripojeniaFirmy"));
          setKrok("firma");
          return;
        }
        zoznam = zapamatane.hodnota;
      }
      setFirmy(zoznam);
      const vybrana = vyberFirmy(zoznam, getActiveCompanyId());
      if (vybrana) {
        setFirma(vybrana);
        setActiveCompanyId(vybrana.id);
        setKrok("prehlad");
        void nacitajVozidlaDoPamate(vybrana.id);
        return;
      }
      setKrok(zoznam.length ? "firma" : "novaFirma");
    } catch (e) {
      setChybaStartu(e instanceof Error ? e.message : String(e));
      setKrok("firma");
    }
  }

  /**
   * Vozidlá do telefónu hneď po štarte.
   *
   * Kto obrazovku s vozidlami pred cestou neotvorí, mal by v aute bez signálu
   * prázdny zoznam — teda presne tam, kde ho potrebuje najviac.
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
    void zisti(true);
    /* Zaseknutý štart musí byť po chvíli vidieť — inak je to len točenie. */
    const cas = setTimeout(() => setDlho(true), 12000);
    return () => clearTimeout(cas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Beží jazda? Plavák v lište sa podľa toho mení. */
  useEffect(() => {
    let zrusene = false;
    const pozri = () =>
      beziacaJazda()
        .then((j) => !zrusene && setBezi(!!j))
        .catch(() => {});
    pozri();
    const id = setInterval(pozri, 15000);
    return () => {
      zrusene = true;
      clearInterval(id);
    };
  }, [krok]);

  async function odhlas() {
    /* Bez `scope` odhlási Supabase všetky zariadenia — telefón smie odhlásiť
       len sám seba. */
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    setFirma(null);
    setFirmy([]);
    setEmail(null);
    setKrok("prihlasenie");
  }

  if (diagnostika)
    return (
      <Suspense fallback={<Pracujem text={t("spolocne.nacitavam")} />}>
        <Diagnostika onSpat={() => setDiagnostika(false)} />
      </Suspense>
    );

  if (zamknute) return <Zamok onOdomknute={() => setZamknute(false)} onOdhlasit={odhlas} />;

  if (krok === "nacitavam") {
    if (!dlho && !chybaStartu) return <Pracujem text={t("app.spustam", { faza, balicek: "—" })} />;
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
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => {
                setDlho(false);
                void zisti();
              }}
              className="rounded-app bg-app-zelena px-4 py-3 text-[15px] font-medium text-white"
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

  if (krok === "registracia")
    return <RegistraciaUctu onHotovo={() => zisti()} onSpat={() => setKrok("prihlasenie")} />;

  if (krok === "novaFirma")
    return (
      <VytvorFirmu
        prve={firmy.length === 0}
        onSpat={firmy.length > 0 ? () => setKrok("firma") : undefined}
        onHotovo={() => {
          setChybaStartu(null);
          setKrok("nacitavam");
          void zisti();
        }}
      />
    );

  if (krok === "firma")
    return (
      <VyberFirmy
        firmy={firmy}
        poznamka={chybaStartu}
        firmaSaNeda={!!chybaStartu}
        onDiagnostika={() => setDiagnostika(true)}
        onVyber={(f) => {
          setFirma(f);
          setActiveCompanyId(f.id);
          setKrok("prehlad");
        }}
        onNovaFirma={() => setKrok("novaFirma")}
        onOdhlasit={odhlas}
      />
    );

  if (krok === "ucet")
    return (
      <MobilObrazovka
        title={t("app.ucet")}
        subtitle={email ?? undefined}
        onBack={() => setKrok("prehlad")}
      >
        <div className="space-y-4">
          <button
            onClick={() => setDiagnostika(true)}
            className="w-full rounded-app border border-app-ramik p-4 text-left text-sm"
          >
            {t("app.diagnostika")}
            <span className="mt-1 block text-xs text-app-text-2">{t("app.diagnostikaPopis")}</span>
          </button>
          <ZrusenieUctu onZrusene={() => zisti()} />
        </div>
      </MobilObrazovka>
    );

  if (!firma) return <Pracujem text={t("spolocne.nacitavam")} />;

  const panelovka = (
    <MobilPanel
      otvoreny={panel}
      onZavri={() => setPanel(false)}
      email={email}
      firma={firma}
      viacFiriem={firmy.length > 1}
      onZmenitFirmu={() => setKrok("firma")}
      onUcet={() => setKrok("ucet")}
      onOdhlasit={odhlas}
    />
  );

  /** Hlavička agend — meno firmy a vstup do panela. Späť sa odtiaľto nechodí. */
  const hlavicka = (
    <AppHeader
      variant="root"
      title={firma.name}
      right={
        <button
          onClick={() => setPanel(true)}
          aria-label={t("panel.nastavenia")}
          className="grid h-11 w-11 place-items-center rounded-app-sm text-app-text active:bg-app-ramik"
        >
          <Menu className="h-5 w-5" />
        </button>
      }
    />
  );

  function prepni(z: ZalozkaJazd) {
    setKrok(z);
  }

  const aktivna: ZalozkaJazd =
    krok === "jazda"
      ? "jazda"
      : krok === "historia"
        ? "historia"
        : krok === "vozidla"
          ? "vozidla"
          : "prehlad";

  /*
    Jazda si nesie vlastnú hlavičku aj pätku s hlavným tlačidlom, takže sa
    vykresľuje sama; ostatné záložky dostanú spoločnú hlavičku s menom firmy.
  */
  if (krok === "jazda")
    return (
      <SoSpodnouListou aktivna={aktivna} onPrepni={prepni} bezi={bezi}>
        <Suspense fallback={<Pracujem text={t("spolocne.nacitavam")} />}>
          <Jazda firma={firma} onSpat={() => setKrok("prehlad")} />
        </Suspense>
        {panelovka}
      </SoSpodnouListou>
    );

  return (
    <SoSpodnouListou aktivna={aktivna} onPrepni={prepni} bezi={bezi}>
      <div className="flex min-h-[calc(100dvh-var(--spodna-lista,0px))] flex-col bg-app-pozadie">
        {hlavicka}
        {krok === "historia" ? (
          <HistoriaVozidiel firma={firma} onSpat={() => setKrok("prehlad")} />
        ) : krok === "vozidla" ? (
          <VozidlaJazd firma={firma} />
        ) : (
          <PrehladJazd
            firma={firma}
            onJazda={() => setKrok("jazda")}
            onHistoria={() => setKrok("historia")}
          />
        )}
      </div>
      {panelovka}
    </SoSpodnouListou>
  );
}

/**
 * Obal so spodnou lištou.
 *
 * Prvému dieťaťu zníži minimálnu výšku o lištu — inak stránka roluje za ňu
 * a koniec obsahu ostane schovaný pod ikonami.
 */
function SoSpodnouListou({
  aktivna,
  onPrepni,
  bezi,
  children,
}: {
  aktivna: ZalozkaJazd;
  onPrepni: (z: ZalozkaJazd) => void;
  bezi?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-[100dvh] flex-col [&>*:first-child]:min-h-[calc(100dvh-var(--spodna-lista))]"
      style={
        {
          "--spodna-lista": "calc(3.75rem + var(--safe-bottom))",
          "--patka-spodok": "0px",
        } as React.CSSProperties
      }
    >
      {children}
      {/* Kniha jázd bez povolení nerobí nič, tak si o ne povie hneď na začiatku. */}
      <PovoleniaJazd />
      <TabBarJazd aktivna={aktivna} onPrepni={onPrepni} bezi={bezi} />
    </div>
  );
}
