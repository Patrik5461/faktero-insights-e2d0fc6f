import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  ChevronRight,
  Loader2,
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { hlasPotvrdFn, hlasPrepisFn, hlasPrikazFn } from "@/lib/faktero/hlas.functions";
import {
  NAZVY_ZAPISOV,
  hlasyNaVyber,
  jazykReci,
  jeZrusenie,
  krokTicha,
  naPotvrdenie,
  navigaciaPolozky,
  novyStavTicha,
  pocetNaPotvrdenie,
  poPrepise,
  smiePotvrdit,
  textNaPrecitanie,
  vyberFormatNahravky,
  vyberHlas,
  type DokladNaObrazovke,
  type FirmaHlasu,
  type KoloHlasu,
  type Navigacia,
  type NavrhAkcie,
  type NavrhHlasu,
  type PolozkaZoznamuHlasu,
  type StavTicha,
} from "@/lib/faktero/hlas";
import { dajKontextHlasu } from "@/lib/faktero/hlas-kontext";
import { getActiveCompanyId } from "@/lib/faktero/active-company";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { useT } from "@/lib/i18n/useT";

/*
  Hlasové ovládanie (TEST, len administrátori platformy — `HLAS_PRE` v hlas.ts).

  Mikrofón v hlavičke otvorí panel a začne nahrávať. Nahrávka (webm/opus,
  Safari mp4) sa zastaví po ~1,2 s ticha (detekcia hlasitosti cez WebAudio),
  pustením držaného tlačidla (push-to-talk) alebo po 30 s, a server ju prepíše
  (OpenAI gpt-4o-transcribe so slovníkom Faktera a menami partnerov). Web
  Speech API beží v Chrome popri tom len ako záloha, keď serverový prepis
  zlyhá; prehliadač bez nahrávania (alebo bez prepisu) použije len ju.

  Odpoveď sa ukáže v paneli a prečíta ženským hlasom (speechSynthesis).
  Výsledky hľadania sú v paneli ako klikací zoznam. Zápis (zatiaľ len
  zaúčtovanie) čaká na Potvrdiť / Zrušiť — alebo „potvrď“ / „zruš“ hlasom —
  a vykoná ho `VYKONAVACE_ZAPISOV` existujúcou serverovou funkciou.
*/

const KLUC_HLASU = "faktero.hlas.hlas";
const KLUC_TICHO = "faktero.hlas.ticho";
/** Prepnutie firmy znovu načíta stránku — panel sa po ňom otvorí s potvrdením. */
const KLUC_PO_PREPNUTI = "faktero.hlas.po_prepnuti";
/** Kratšie podržanie tlačidla je klik (nahráva do ticha), dlhšie push-to-talk. */
const DRZANIE_MS = 400;

function citaj(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function zapis(k: string, v: string | null) {
  try {
    if (v == null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    /* súkromné okno — voľba sa len nezapamätá */
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function konstruktorRozpoznavania(): any {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function vieNahravat(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/** Záložné rozpoznávanie popri nahrávaní len v Chrome/Edge — Safari pri súbehu s mikrofónom zlyháva. */
function tienoveRozpoznavanie(): boolean {
  return typeof navigator !== "undefined" && /Chrome|Edg\//.test(navigator.userAgent);
}

function naBase64(b: Blob): Promise<string> {
  return new Promise((ok, chyba) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => chyba(r.error);
    r.readAsDataURL(b);
  });
}

const fmtSuma = (n: number | null | undefined, mena: string | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("sk-SK", { style: "currency", currency: mena || "EUR" }).format(n);

const NAZVY_TYPU: Record<PolozkaZoznamuHlasu["typ"], string> = {
  nespracovany: "Nespracovaný",
  prijata: "Prijatá",
  blocek: "Bloček",
  vystavena: "Vystavená",
  ponuka: "Ponuka",
  zakazka: "Zákazka",
  odberatel: "Odberateľ",
  dodavatel: "Dodávateľ",
  transakcia: "Banka",
  produkt: "Produkt",
};

export function HlasoveTlacidlo({
  className = "",
  onPrepniFirmu,
}: {
  className?: string;
  /** Prepnutie firmy tou istou cestou ako prepínač v hlavičke (`prepniFirmu`). */
  onPrepniFirmu?: (id: string) => void;
}) {
  const { t } = useT();
  const [otvorene, setOtvorene] = useState(false);
  const [spustit, setSpustit] = useState(0);
  const [uvod, setUvod] = useState<string | null>(null);

  // Po prepnutí firmy hlasom sa stránka načíta znova — panel ukáže, kam sa prepla.
  useEffect(() => {
    try {
      const z = window.sessionStorage.getItem(KLUC_PO_PREPNUTI);
      if (!z) return;
      window.sessionStorage.removeItem(KLUC_PO_PREPNUTI);
      const { nazov, cas } = JSON.parse(z) as { nazov: string; cas: number };
      if (Date.now() - cas < 60_000) {
        setUvod(nazov);
        setOtvorene(true);
      }
    } catch {
      /* bez úložiska — nič */
    }
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOtvorene(true);
          setSpustit((n) => n + 1);
        }}
        title={t("Hlasové ovládanie (test)")}
        aria-label={t("Hlasové ovládanie")}
        className={`grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground ${className}`}
      >
        <Mic className="h-3.5 w-3.5" />
      </button>
      {otvorene && (
        <HlasovyPanel
          spustit={spustit}
          uvod={uvod}
          onPrepniFirmu={onPrepniFirmu}
          onZavri={() => setOtvorene(false)}
        />
      )}
    </>
  );
}

type Stav = "pripraveny" | "pocuva" | "prepisuje" | "mysli" | "zapisuje";

type Nahravanie = {
  rec: MediaRecorder;
  stream: MediaStream;
  ctx: AudioContext | null;
  kusy: Blob[];
  mime: string;
  ticho: StavTicha;
  drzi: boolean;
  casovac: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tien: any;
  tienText: string;
  zrusene: boolean;
};

function HlasovyPanel({
  spustit,
  uvod,
  onPrepniFirmu,
  onZavri,
}: {
  spustit: number;
  uvod: string | null;
  onPrepniFirmu?: (id: string) => void;
  onZavri: () => void;
}) {
  const { t, jazyk } = useT();
  const navigate = useNavigate();
  const cesta = useRouterState({ select: (s) => s.location.pathname });
  const prikaz = useServerFn(hlasPrikazFn);
  const prepisFn = useServerFn(hlasPrepisFn);
  const potvrdFn = useServerFn(hlasPotvrdFn);

  const [stav, setStav] = useState<Stav>("pripraveny");
  const [priebezny, setPriebezny] = useState("");
  const [kola, setKola] = useState<KoloHlasu[]>(() =>
    uvod ? [{ kto: "asistent", text: t("Prepnuté na firmu {f}.", { f: uvod }) }] : [],
  );
  const [cakajuca, setCakajuca] = useState<NavrhAkcie | null>(null);
  const [zoznam, setZoznam] = useState<{
    nadpis: string;
    polozky: PolozkaZoznamuHlasu[];
    celkom: number;
  } | null>(null);
  const [vyberFiriem, setVyberFiriem] = useState<FirmaHlasu[] | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [ticho, setTicho] = useState(() => citaj(KLUC_TICHO) === "1");
  const [hlasy, setHlasy] = useState<SpeechSynthesisVoice[]>([]);
  const [zvolenyHlas, setZvolenyHlas] = useState<string | null>(() => citaj(KLUC_HLASU));
  const znameRef = useRef<DokladNaObrazovke[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rozpoznavanieRef = useRef<any>(null);
  const nahravanieRef = useRef<Nahravanie | null>(null);
  const stlacenieRef = useRef<number>(0);
  const kolaRef = useRef<KoloHlasu[]>([]);
  kolaRef.current = kola;
  const cakajucaRef = useRef<NavrhAkcie | null>(null);
  cakajucaRef.current = cakajuca;

  useZatvorNaEscape(onZavri);

  const Rozpoznavanie = konstruktorRozpoznavania();
  const recDostupna = Boolean(Rozpoznavanie);
  const nahravanieDostupne = vieNahravat();
  const mikrofonDostupny = nahravanieDostupne || recDostupna;
  const ttsDostupna = typeof window !== "undefined" && "speechSynthesis" in window;

  // Hlasy prehliadač načíta neskôr (Chrome až po `voiceschanged`).
  useEffect(() => {
    if (!ttsDostupna) return;
    const nacitaj = () => setHlasy(window.speechSynthesis.getVoices());
    nacitaj();
    window.speechSynthesis.addEventListener?.("voiceschanged", nacitaj);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", nacitaj);
      window.speechSynthesis.cancel();
    };
  }, [ttsDostupna]);

  const { hlas, zensky } = vyberHlas(hlasy, jazyk, zvolenyHlas);
  const naVyber = hlasyNaVyber(hlasy, jazyk);

  const stopniHovor = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* nič */
    }
  }, []);

  const povedz = useCallback(
    (veta: string) => {
      if (ticho || !ttsDostupna || !veta) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(textNaPrecitanie(veta));
        u.lang = hlas?.lang ?? jazykReci(jazyk);
        if (hlas) u.voice = hlas;
        u.rate = 1.05;
        window.speechSynthesis.speak(u);
      } catch {
        /* reč je doplnok — text je v paneli */
      }
    },
    [ticho, ttsDostupna, hlas, jazyk],
  );

  const pridajKolo = (k: KoloHlasu) => setKola((p) => [...p, k].slice(-12));

  const odpovedz = useCallback(
    (veta: string) => {
      pridajKolo({ kto: "asistent", text: veta });
      povedz(veta);
    },
    [povedz],
  );

  const jazykPrikazu = (jazyk === "cs" || jazyk === "de" ? jazyk : "sk") as "sk" | "cs" | "de";

  /* ---------- Zápisy: jeden vykonávač na druh návrhu ---------- */

  /**
   * Register zápisov. Každý druh `NavrhAkcie` má vykonávač, ktorý volá
   * existujúcu serverovú funkciu a vráti vetu na odpoveď. Nový zápis =
   * nový riadok tu + náhľad v `NahladNavrhu`.
   */
  const VYKONAVACE_ZAPISOV: {
    [K in NavrhAkcie["druh"]]: (
      a: Extract<NavrhAkcie, { druh: K }>,
      cid: string,
    ) => Promise<string>;
  } = {
    zauctovanie: async (a, cid) => {
      const kontext = dajKontextHlasu(cesta);
      let zapisanych = 0;
      const preskocene: string[] = [];
      const naServer = [];
      for (const p of naPotvrdenie(a.navrh)) {
        // Otvorený nespracovaný doklad: potvrdí sa vo formulári a uloží jeho tlačidlom.
        if (
          p.typ === "nespracovany" &&
          kontext.otvoreny?.id === p.id &&
          kontext.akcie.potvrdNavrh &&
          (await kontext.akcie.potvrdNavrh(p.id))
        ) {
          zapisanych++;
          continue;
        }
        naServer.push({ typ: p.typ, id: p.id, predkontacia: p.predkontacia! });
      }
      if (naServer.length) {
        const r = await potvrdFn({ data: { company_id: cid, polozky: naServer } });
        zapisanych += r.zapisanych;
        preskocene.push(...r.preskocene);
      }
      kontext.akcie.obnov?.();
      return preskocene.length
        ? t("Zapísané: {n}. Preskočené: {m} — {dovod}", {
            n: zapisanych,
            m: preskocene.length,
            dovod: preskocene.slice(0, 2).join("; "),
          })
        : t("Hotovo, zapísané: {n}.", { n: zapisanych });
    },
  };

  async function potvrd(args: { klik?: boolean; text?: string }) {
    const a = cakajucaRef.current;
    if (!smiePotvrdit({ maNavrh: pocetNaPotvrdenie(a) > 0, ...args }) || !a) return;
    const cid = getActiveCompanyId();
    if (!cid) return;
    setStav("zapisuje");
    setChyba(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const veta = await (VYKONAVACE_ZAPISOV[a.druh] as any)(a, cid);
      setCakajuca(null);
      odpovedz(veta);
    } catch (e) {
      setChyba(String((e as Error)?.message ?? e));
    } finally {
      setStav("pripraveny");
    }
  }

  function zrus() {
    setCakajuca(null);
    odpovedz(t("Návrh som zrušila, nič sa neuložilo."));
  }

  function chod(nav: Navigacia | null) {
    if (!nav) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void navigate({ to: nav.to as any, params: nav.params as any, search: nav.search as any });
  }

  function prepniFirmu(f: FirmaHlasu) {
    if (!onPrepniFirmu) {
      setChyba(t("Prepnutie firmy tu nie je dostupné — použite prepínač v hlavičke."));
      return;
    }
    try {
      window.sessionStorage.setItem(
        KLUC_PO_PREPNUTI,
        JSON.stringify({ nazov: f.nazov, cas: Date.now() }),
      );
    } catch {
      /* bez úložiska sa panel po prepnutí len neotvorí */
    }
    onPrepniFirmu(f.id);
  }

  async function odosli(veta: string) {
    const v = veta.trim();
    if (!v) return;
    const cid = getActiveCompanyId();
    if (!cid) {
      setChyba(t("Vyberte firmu."));
      return;
    }
    setChyba(null);
    const historia = kolaRef.current;
    pridajKolo({ kto: "user", text: v });
    const caka = pocetNaPotvrdenie(cakajucaRef.current) > 0;
    // Súhlas a odmietnutie čakajúceho návrhu rozhodne prehliadač sám — bez modelu.
    if (caka && smiePotvrdit({ maNavrh: true, text: v })) return potvrd({ text: v });
    if (caka && jeZrusenie(v)) return zrus();

    setStav("mysli");
    try {
      const k = dajKontextHlasu(cesta);
      const r = await prikaz({
        data: {
          company_id: cid,
          text: v,
          jazyk: jazykPrikazu,
          kontext: {
            stranka: k.stranka,
            cesta: k.cesta,
            doklady: k.doklady,
            oznacene: k.oznacene,
            otvoreny: k.otvoreny,
          },
          historia,
          caka_navrh: caka,
          zname: znameRef.current,
        },
      });
      znameRef.current = r.zname;
      let potvrdit = false;
      let prepnut: FirmaHlasu | null = null;
      for (const a of r.akcie) {
        if (a.typ === "navigovat") chod(a.navigacia);
        else if (a.typ === "navrh_akcie") setCakajuca(a.akcia);
        else if (a.typ === "zrusit") setCakajuca(null);
        else if (a.typ === "potvrdit") potvrdit = true;
        else if (a.typ === "zoznam")
          setZoznam({ nadpis: a.nadpis, polozky: a.polozky, celkom: a.celkom });
        else if (a.typ === "vyber_firmy") setVyberFiriem(a.firmy);
        else if (a.typ === "prepnut_firmu") prepnut = a.firma;
      }
      setStav("pripraveny");
      if (prepnut) {
        odpovedz(r.text);
        return prepniFirmu(prepnut);
      }
      if (potvrdit) {
        // Model súhlas rozpoznal, ale zapíše sa len po vete, ktorá súhlasom naozaj je.
        if (smiePotvrdit({ maNavrh: caka, text: v })) return potvrd({ text: v });
        return odpovedz(t("Na uloženie povedzte „potvrď“ alebo kliknite Potvrdiť."));
      }
      odpovedz(r.text);
    } catch (e) {
      setStav("pripraveny");
      setChyba(String((e as Error)?.message ?? e));
    }
  }

  /* ---------- Rozpoznávanie prehliadačom (záloha) ---------- */

  function pocuvajPrehliadacom() {
    if (!Rozpoznavanie) return;
    stopniHovor();
    if (rozpoznavanieRef.current) {
      try {
        rozpoznavanieRef.current.stop();
      } catch {
        /* nič */
      }
      return;
    }
    const r = new Rozpoznavanie();
    r.lang = jazykReci(jazyk);
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let finalny = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      let docasny = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const x = e.results[i];
        if (x.isFinal) finalny += x[0].transcript;
        else docasny += x[0].transcript;
      }
      setPriebezny((finalny + " " + docasny).trim());
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => {
      const kod = String(e?.error ?? "");
      if (kod === "not-allowed" || kod === "service-not-allowed")
        setChyba(t("Prehliadač nedovolil mikrofón — povoľte ho pri adrese stránky."));
      else if (kod !== "no-speech" && kod !== "aborted")
        setChyba(t("Rozpoznávanie reči zlyhalo ({kod}).", { kod }));
    };
    r.onend = () => {
      rozpoznavanieRef.current = null;
      setStav((s) => (s === "pocuva" ? "pripraveny" : s));
      setPriebezny("");
      if (finalny.trim()) void odosli(finalny);
    };
    rozpoznavanieRef.current = r;
    setPriebezny("");
    setStav("pocuva");
    try {
      r.start();
    } catch {
      rozpoznavanieRef.current = null;
      setStav("pripraveny");
    }
  }

  /* ---------- Nahrávanie a prepis na serveri ---------- */

  function upracNahravanie(n: Nahravanie) {
    if (n.casovac != null) window.clearInterval(n.casovac);
    n.casovac = null;
    for (const tr of n.stream.getTracks()) tr.stop();
    void n.ctx?.close().catch(() => undefined);
    try {
      n.tien?.abort();
    } catch {
      /* nič */
    }
  }

  function zastavNahravanie() {
    const n = nahravanieRef.current;
    if (!n) return;
    if (n.casovac != null) window.clearInterval(n.casovac);
    n.casovac = null;
    if (n.rec.state !== "inactive") n.rec.stop();
  }

  async function nahravaj(drzi = false) {
    stopniHovor();
    setChyba(null);
    if (nahravanieRef.current) {
      zastavNahravanie();
      return;
    }
    if (!nahravanieDostupne) return pocuvajPrehliadacom();
    const mime = vyberFormatNahravky((m) => MediaRecorder.isTypeSupported(m));
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const meno = String((e as Error)?.name ?? "");
      if (meno === "NotAllowedError" || meno === "SecurityError")
        setChyba(t("Prehliadač nedovolil mikrofón — povoľte ho pri adrese stránky."));
      else if (recDostupna) return pocuvajPrehliadacom();
      else setChyba(t("Mikrofón sa nepodarilo zapnúť."));
      return;
    }
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const n: Nahravanie = {
      rec,
      stream,
      ctx: null,
      kusy: [],
      mime: (rec.mimeType || mime || "audio/webm").replace(/\s+/g, ""),
      ticho: novyStavTicha(performance.now()),
      // Push-to-talk len keď je tlačidlo stále stlačené (pustené počas povolenia mikrofónu = klik).
      drzi: drzi && stlacenieRef.current > 0,
      casovac: null,
      tien: null,
      tienText: "",
      zrusene: false,
    };
    nahravanieRef.current = n;
    rec.ondataavailable = (e) => {
      if (e.data.size) n.kusy.push(e.data);
    };
    rec.onstop = () => {
      upracNahravanie(n);
      nahravanieRef.current = null;
      setPriebezny("");
      if (n.zrusene) {
        setStav("pripraveny");
        return;
      }
      void prepis(n);
    };

    // Detekcia ticha: hlasitosť (RMS) každých 50 ms.
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const zdroj = ctx.createMediaStreamSource(stream);
      const analyzator = ctx.createAnalyser();
      analyzator.fftSize = 1024;
      zdroj.connect(analyzator);
      const buf = new Float32Array(analyzator.fftSize);
      n.ctx = ctx;
      n.casovac = window.setInterval(() => {
        analyzator.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const { stav: dalsi, koniec } = krokTicha(
          n.ticho,
          Math.sqrt(s / buf.length),
          performance.now(),
          n.drzi,
        );
        n.ticho = dalsi;
        if (koniec === "bez_reci") n.zrusene = true;
        if (koniec) zastavNahravanie();
      }, 50);
    } catch {
      // Bez WebAudio nahráva do kliknutia, najviac 30 s.
      n.casovac = window.setInterval(() => {
        if (performance.now() - n.ticho.zaciatok > 30_000) zastavNahravanie();
      }, 500);
    }

    // Záloha a priebežný text: rozpoznávanie prehliadača popri nahrávaní (Chrome).
    if (Rozpoznavanie && tienoveRozpoznavanie()) {
      try {
        const r = new Rozpoznavanie();
        r.lang = jazykReci(jazyk);
        r.interimResults = true;
        r.continuous = true;
        let finalny = "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        r.onresult = (e: any) => {
          let docasny = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const x = e.results[i];
            if (x.isFinal) finalny += x[0].transcript + " ";
            else docasny += x[0].transcript;
          }
          n.tienText = (finalny + docasny).trim();
          if (nahravanieRef.current === n) setPriebezny(n.tienText);
        };
        r.onerror = () => undefined;
        r.start();
        n.tien = r;
      } catch {
        n.tien = null;
      }
    }

    rec.start(250);
    setPriebezny("");
    setStav("pocuva");
  }

  async function prepis(n: Nahravanie) {
    const cid = getActiveCompanyId();
    const blob = new Blob(n.kusy, { type: n.mime.split(";")[0] });
    if (!cid) {
      setStav("pripraveny");
      setChyba(t("Vyberte firmu."));
      return;
    }
    // Bez reči (alebo len kašeľ, klik) sa nič neposiela — prepis ticha si slová vymyslí.
    if (n.ticho.reciMs < 150 && !n.drzi) {
      setStav("pripraveny");
      setChyba(t("Nič som nepočula — skúste to znova bližšie k mikrofónu."));
      return;
    }
    setStav("prepisuje");
    let server: { text: string; prazdny: boolean; ozvena: boolean } | { chyba: string };
    try {
      if (blob.size < 500) throw new Error(t("Nahrávka je prázdna."));
      const r = await prepisFn({
        data: {
          company_id: cid,
          audio_base64: await naBase64(blob),
          mime: n.mime,
          jazyk: jazykPrikazu,
        },
      });
      server = { text: r.text, prazdny: r.prazdny, ozvena: r.ozvena };
    } catch (e) {
      server = { chyba: String((e as Error)?.message ?? e) };
    }
    setStav("pripraveny");
    const d = poPrepise({ server, prehliadac: n.tienText, recDostupna, reciMs: n.ticho.reciMs });
    if (d.akcia === "odoslat") {
      void odosli(d.text);
      // Až po odoslaní — `odosli` hlášku na začiatku maže.
      if (d.zdroj === "prehliadac")
        setChyba(t("Prepis na serveri zlyhal — použila som rozpoznávanie prehliadača."));
    } else if (d.akcia === "nic") setChyba(t("Nerozumela som — skúste to povedať znova."));
    else if (d.akcia === "pocuvat_prehliadacom") {
      setChyba(t("Prepis na serveri zlyhal — povedzte to ešte raz, počúva prehliadač."));
      pocuvajPrehliadacom();
    } else setChyba(d.text);
  }

  // Klik na mikrofón v hlavičke (aj keď je panel otvorený) spustí nahrávanie.
  useEffect(() => {
    if (spustit && mikrofonDostupny) void nahravaj(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spustit]);

  useEffect(
    () => () => {
      try {
        rozpoznavanieRef.current?.abort();
      } catch {
        /* nič */
      }
      const n = nahravanieRef.current;
      if (n) {
        n.zrusene = true;
        zastavNahravanie();
        upracNahravanie(n);
      }
    },
    [],
  );

  const pocetPotvrdit = pocetNaPotvrdenie(cakajuca);
  const zaneprazdneny = stav === "mysli" || stav === "zapisuje" || stav === "prepisuje";

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t("Hlasové ovládanie")}
      data-hlasovy-panel=""
      className="fixed bottom-4 right-4 z-50 flex max-h-[min(80vh,640px)] w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-xl"
      onClick={stopniHovor}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Mic className="h-4 w-4 text-primary" />
        <strong className="text-sm">{t("Hlasové ovládanie")}</strong>
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
          {t("test")}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {ttsDostupna && (
            <button
              type="button"
              onClick={() => {
                const n = !ticho;
                setTicho(n);
                zapis(KLUC_TICHO, n ? "1" : null);
                if (n) window.speechSynthesis.cancel();
              }}
              aria-label={ticho ? t("Zapnúť hlas") : t("Stlmiť hlas")}
              title={ticho ? t("Zapnúť hlas") : t("Stlmiť hlas")}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
            >
              {ticho ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={onZavri}
            aria-label={t("Zavrieť")}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {!mikrofonDostupny && (
          <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
            {t("Tento prehliadač nevie nahrávať zvuk. Príkaz môžete napísať do poľa nižšie.")}
          </p>
        )}
        {kola.length === 0 && !priebezny && stav !== "pocuva" && (
          <p className="text-xs text-muted-foreground">
            {t(
              "Skúste napríklad: „nájdi faktúru od Orange za október“, „otvor faktúru od Slovak Telekom“, „čo mi chýba zaúčtovať“, „ukáž neuhradené“, „prepni na firmu …“, „otvor pokladňu“. Tlačidlo mikrofónu môžete aj podržať a hovoriť.",
            )}
          </p>
        )}
        {kola.map((k, i) => (
          <p
            key={i}
            className={
              k.kto === "user"
                ? "ml-8 rounded-md bg-primary/10 px-2 py-1.5"
                : "mr-8 rounded-md bg-muted px-2 py-1.5"
            }
          >
            {k.text}
          </p>
        ))}
        {stav === "pocuva" && (
          <p className="ml-8 rounded-md border border-dashed border-primary/40 px-2 py-1.5 italic text-muted-foreground">
            {priebezny || t("Počúvam…")}
          </p>
        )}
        {zaneprazdneny && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {stav === "zapisuje"
              ? t("Zapisujem…")
              : stav === "prepisuje"
                ? t("Prepisujem…")
                : t("Premýšľam…")}
          </p>
        )}
        {chyba && (
          <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            {chyba}
          </p>
        )}

        {vyberFiriem && vyberFiriem.length > 0 && (
          <div className="rounded-md border border-border">
            <div className="border-b border-border px-2 py-1.5 text-xs font-semibold">
              {t("Ktorú firmu?")}
            </div>
            <ul>
              {vyberFiriem.map((f) => (
                <li key={f.id} className="border-t border-border first:border-t-0">
                  <button
                    type="button"
                    onClick={() => prepniFirmu(f)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-secondary"
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{f.nazov}</span>
                    {f.testovacia && (
                      <span className="rounded bg-warning px-1 text-[10px] font-bold uppercase text-warning-foreground">
                        {t("Testovacia")}
                      </span>
                    )}
                    {f.ico && <span className="text-muted-foreground">{f.ico}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {zoznam && zoznam.polozky.length > 0 && (
          <div className="rounded-md border border-border" data-hlas-zoznam="">
            <div className="flex items-center gap-2 border-b border-border px-2 py-1.5 text-xs font-semibold">
              <span className="min-w-0 flex-1 truncate">{t(zoznam.nadpis)}</span>
              <span className="font-normal text-muted-foreground">
                {zoznam.celkom > zoznam.polozky.length
                  ? t("{n} z {m}", { n: zoznam.polozky.length, m: zoznam.celkom })
                  : zoznam.polozky.length}
              </span>
              <button
                type="button"
                onClick={() => setZoznam(null)}
                aria-label={t("Zavrieť zoznam")}
                className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-secondary"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <ul className="max-h-60 overflow-y-auto">
              {zoznam.polozky.map((p) => {
                const nav = navigaciaPolozky(p);
                return (
                  <li key={`${p.typ}:${p.id}`} className="border-t border-border first:border-t-0">
                    <button
                      type="button"
                      disabled={!nav}
                      onClick={() => chod(nav)}
                      className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1.5 text-left text-xs hover:bg-secondary disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                        {t(NAZVY_TYPU[p.typ])}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {p.partner ?? "—"}
                      </span>
                      {p.cislo && <span className="shrink-0 text-muted-foreground">{p.cislo}</span>}
                      {p.datum && <span className="shrink-0 text-muted-foreground">{p.datum}</span>}
                      {p.suma != null && (
                        <span className="shrink-0 tabular-nums">{fmtSuma(p.suma, p.mena)}</span>
                      )}
                      {p.stav && (
                        <span className="shrink-0 text-muted-foreground">{t(p.stav)}</span>
                      )}
                      {nav && (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {cakajuca && (
          <div className="rounded-md border border-border">
            <div className="border-b border-border px-2 py-1.5 text-xs font-semibold">
              {t(NAZVY_ZAPISOV[cakajuca.druh])} — {t("nič nie je uložené")}
            </div>
            <NahladNavrhu akcia={cakajuca} />
            <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
              <button
                type="button"
                disabled={!pocetPotvrdit || zaneprazdneny}
                onClick={() => void potvrd({ klik: true })}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
              >
                {t("Potvrdiť ({n})", { n: pocetPotvrdit })}
              </button>
              <button
                type="button"
                disabled={zaneprazdneny}
                onClick={zrus}
                className="rounded-md border border-input bg-card px-2.5 py-1 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
              >
                {t("Zrušiť")}
              </button>
            </div>
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-1.5 border-t border-border px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = text;
          setText("");
          void odosli(v);
        }}
      >
        {mikrofonDostupny && (
          <button
            type="button"
            // Klik = nahráva do ticha; podržanie = push-to-talk (pustenie zastaví).
            onPointerDown={(e) => {
              if (e.button !== 0 || zaneprazdneny) return;
              stlacenieRef.current = performance.now();
              if (!nahravanieRef.current && !rozpoznavanieRef.current) void nahravaj(true);
              else stlacenieRef.current = -1;
            }}
            onPointerUp={() => {
              const od = stlacenieRef.current;
              stlacenieRef.current = 0;
              const n = nahravanieRef.current;
              if (od === -1) {
                // Druhé stlačenie počas nahrávania = stop.
                if (n) zastavNahravanie();
                else
                  try {
                    rozpoznavanieRef.current?.stop();
                  } catch {
                    /* nič */
                  }
                return;
              }
              if (!n) return;
              if (performance.now() - od >= DRZANIE_MS) zastavNahravanie();
              // Krátky klik: nahrávanie pokračuje a skončí po tichu.
              else n.drzi = false;
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              if (nahravanieRef.current) zastavNahravanie();
              else void nahravaj(false);
            }}
            disabled={zaneprazdneny}
            aria-label={stav === "pocuva" ? t("Prestať počúvať") : t("Hovoriť")}
            title={
              stav === "pocuva"
                ? t("Prestať počúvať")
                : t("Hovoriť (podržte a hovorte, alebo kliknite)")
            }
            className={`grid h-8 w-8 shrink-0 touch-none select-none place-items-center rounded-full ${
              stav === "pocuva"
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
            } disabled:opacity-50`}
          >
            {stav === "pocuva" ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("Napíšte príkaz…")}
          aria-label={t("Príkaz")}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        />
        <button
          type="submit"
          disabled={zaneprazdneny || !text.trim()}
          aria-label={t("Odoslať príkaz")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-input hover:bg-secondary disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {ttsDostupna && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          <span>{t("Hlas:")}</span>
          <select
            value={hlas?.name ?? ""}
            onChange={(e) => {
              setZvolenyHlas(e.target.value || null);
              zapis(KLUC_HLASU, e.target.value || null);
            }}
            aria-label={t("Hlas asistenta")}
            className="h-6 min-w-0 max-w-[16rem] rounded border border-input bg-background px-1 text-[11px]"
          >
            {!hlas && <option value="">{t("žiadny slovenský ani český hlas")}</option>}
            {naVyber.map((h) => (
              <option key={h.name} value={h.name}>
                {h.name} ({h.lang})
              </option>
            ))}
          </select>
          {hlas && !zensky && <span>{t("(ženský hlas v prehliadači nie je)")}</span>}
        </div>
      )}
    </div>
  );
}

/** Náhľad čakajúceho zápisu — jeden prípad na druh `NavrhAkcie`. */
function NahladNavrhu({ akcia }: { akcia: NavrhAkcie }) {
  switch (akcia.druh) {
    case "zauctovanie":
      return <NahladZauctovania navrh={akcia.navrh} />;
  }
}

function NahladZauctovania({ navrh }: { navrh: NavrhHlasu }) {
  const { t } = useT();
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-1 font-medium">{t("Doklad")}</th>
              <th className="px-2 py-1 font-medium">{t("Dodávateľ")}</th>
              <th className="px-2 py-1 text-right font-medium">{t("Suma")}</th>
              <th className="px-2 py-1 font-medium">{t("Predkontácia")}</th>
              <th className="px-2 py-1 font-medium">{t("Členenie DPH")}</th>
              <th className="px-2 py-1 font-medium">{t("KV")}</th>
              <th className="px-2 py-1 font-medium">{t("Zdroj")}</th>
            </tr>
          </thead>
          <tbody>
            {navrh.polozky.map((p) => (
              <tr key={p.id} className="border-t border-border align-top" data-navrh-riadok={p.id}>
                <td className="px-2 py-1 whitespace-nowrap">{p.cislo ?? "—"}</td>
                <td className="max-w-[9rem] truncate px-2 py-1" title={p.partner ?? ""}>
                  {p.partner ?? "—"}
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {fmtSuma(p.suma, p.mena)}
                </td>
                {p.nedaSa ? (
                  <td colSpan={4} className="px-2 py-1 text-muted-foreground">
                    {p.nedaSa}
                  </td>
                ) : (
                  <>
                    <td className="px-2 py-1 font-mono">{p.predkontacia ?? "—"}</td>
                    <td className="px-2 py-1 font-mono">{p.clenenieDph ?? "—"}</td>
                    <td className="px-2 py-1 font-mono">{p.kvClenenie ?? "—"}</td>
                    <td className="px-2 py-1" title={p.upozornenia.join(", ")}>
                      {p.zdroj ? t(NAZVY_ZDROJA[p.zdroj] ?? p.zdroj) : "—"}
                      {p.istota != null && p.zdroj === "ai" ? ` ${p.istota} %` : ""}
                      {p.upozornenia.length > 0 && <span className="ml-1 text-destructive">!</span>}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {navrh.vynechane > 0 && (
        <p className="border-t border-border px-2 py-1 text-xs text-muted-foreground">
          {t(
            "Ďalších {n} dokladov som nestihla — povedzte „navrhni zaúčtovanie“ znova pre ďalšie.",
            {
              n: navrh.vynechane,
            },
          )}
        </p>
      )}
    </>
  );
}

const NAZVY_ZDROJA: Record<string, string> = {
  pravidlo: "pravidlo",
  zvyk: "zvyk",
  navyk: "naučené",
  ai: "AI",
  doklad: "doklad",
};
