import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Crosshair, Loader2, X } from "lucide-react";
import { NahladPdf } from "@/components/faktero/NahladPdf";
import {
  ObrazokSoZvyraznenim,
  PrepinacZvyraznenia,
  usePosunNaAktivne,
  useZvyraznenia,
  ZvyrazneniaStrany,
  type ZvyraznenieNahladu,
} from "@/components/faktero/ZvyraznenieVytazenych";
import { slovaStranyPdf } from "@/lib/faktero/pdf-slova";
import { precitajVyrezFn } from "@/lib/faktero/vyber-z-dokladu.functions";
import {
  NAZOV_TYPU,
  hodnotaNaUkazku,
  hodnotaZKliku,
  normalizuj,
  obdlznikZBodov,
  polePodlaPopisu,
  poleVyberu,
  slovaVObdlzniku,
  slovoNaBode,
  textZoSlov,
  type Hodnota,
  type KlucPola,
  type Obdlznik,
  type SlovoNahladu,
} from "@/lib/faktero/vyber-z-dokladu";
import { POLIA_VYBERU } from "@/lib/faktero/vyber-z-dokladu";
import { preloz } from "@/lib/i18n/jazyk";
import { useT } from "@/lib/i18n/useT";

/**
 * Náhľad nespracovaného dokladu, z ktorého sa dá vybrať hodnota do poľa
 * (ako v Rossume). Človek klikne do poľa vo formulári — alebo pole zvolí tu
 * a stlačí „Vybrať z dokladu" — a potom klikne na text v náhľade.
 *
 * - PDF s textovou vrstvou: slová sú z pdf.js (`getTextContent`), kliknutie
 *   vezme slovo (pri sume, dátume či IBAN-e celú hodnotu, aj keď má medzery),
 *   ťahanie vezme všetky slová v obdĺžniku.
 * - Obrázok a skenované PDF: textu niet, oblasť sa označí ťahaním, prehliadač
 *   ju vyreže a prečíta ju AI (`precitajVyrezFn`).
 *
 * Výber funguje len na počítači (od šírky `lg`): v telefóne je náhľad nad
 * formulárom a ťahanie by sa bilo s posúvaním stránky. Tam ostáva obyčajný náhľad.
 */

const MAX_STRAN = 10;
const SIRKA = 1100;
/** Dlhšia strana výrezu, ktorý ide na AI. */
const MAX_VYREZ = 1000;
/** Pohyb menší ako toto (v px) je kliknutie, nie ťahanie. */
const PRAH_TAHU = 5;

type Strana = {
  cislo: number;
  /** Výška / šírka — obal drží pomer, aby rámčeky slov sedeli. */
  pomer: number;
  platno?: HTMLCanvasElement;
  slova: SlovoNahladu[];
};

type Subor = { url: string | null; mime?: string | null; nazov?: string | null };

type Props = {
  dokladId: string;
  subor: Subor;
  /** Pole, pre ktoré sa práve vyberá; null = nevyberá sa. */
  pole: KlucPola | null;
  /** Polia, ktoré formulár pri tomto druhu dokladu ukazuje. */
  polia: KlucPola[];
  onVyberPola: (kluc: KlucPola) => void;
  onZrus: () => void;
  onHodnota: (kluc: KlucPola, hodnota: Hodnota) => void;
  /** Zvýraznenie vyťažených údajov (aktívne pole = to, pre ktoré sa vyberá). */
  zvyraznenie?: ZvyraznenieNahladu;
  onPrepniZvyraznenie?: () => void;
};

function useJeDesktop(): boolean {
  const [ano, setAno] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const zmena = () => setAno(mq.matches);
    zmena();
    mq.addEventListener("change", zmena);
    return () => mq.removeEventListener("change", zmena);
  }, []);
  return ano;
}

/* ------------------------------------------------ pomôcky pre formulár */

/** Popis poľa formulára — aria-label, inak text nad ním v `<label>`. */
export function popisPola(el: Element | null): string | null {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;
  return (
    el.getAttribute("aria-label") || el.closest("label")?.querySelector("span")?.textContent || null
  );
}

/**
 * Pole podľa popisu — aj keď je formulár preložený do nemčiny či češtiny. Popisy
 * polí v `POLIA_VYBERU` sú slovenské; preložený popis sa preto najprv vráti na
 * slovenský (dlhší preklad má prednosť) a až potom sa porovná.
 */
function poleZPopisu(popis: string | null): KlucPola | null {
  const priamo = polePodlaPopisu(popis);
  if (priamo || !popis) return priamo;
  const text = popis.trim().toLowerCase();
  let najlepsie: { sk: string; de: string } | null = null;
  for (const p of POLIA_VYBERU)
    for (const sk of p.popisy)
      for (const jazyk of ["de", "cs"] as const) {
        const de = preloz(jazyk, sk);
        if (de === sk) continue;
        const z = de.toLowerCase();
        if (
          (text === z || (text.startsWith(z) && !/[\p{L}\d]/u.test(text[z.length] ?? ""))) &&
          (!najlepsie || de.length > najlepsie.de.length)
        )
          najlepsie = { sk, de };
      }
  return najlepsie ? polePodlaPopisu(najlepsie.sk + popis.trim().slice(najlepsie.de.length)) : null;
}

/** Ktoré pole výberu je to, do ktorého človek klikol (null = žiadne). */
export function poleZPrvku(el: EventTarget | null): KlucPola | null {
  return poleZPopisu(popisPola(el as Element | null));
}

/** Krátko zvýrazní pole formulára, do ktorého sa práve zapísalo. */
export function zablikajPole(kontajner: HTMLElement | null, kluc: KlucPola) {
  if (!kontajner) return;
  const el = [...kontajner.querySelectorAll("input, textarea")].find(
    (x) => poleZPopisu(popisPola(x)) === kluc,
  ) as HTMLElement | undefined;
  el?.animate?.(
    [{ boxShadow: "0 0 0 3px rgb(34 197 94 / 0.7)" }, { boxShadow: "0 0 0 0 rgb(34 197 94 / 0)" }],
    { duration: 1400, easing: "ease-out" },
  );
}

/* ---------------------------------------------------------- výrezy */

function naBase64(platno: HTMLCanvasElement): string {
  return platno.toDataURL("image/jpeg", 0.9).split(",")[1] ?? "";
}

/** Výrez strany PDF vykreslený nanovo vo väčšom rozlíšení — sken má viac bodov než náhľad. */
async function vyrezPdf(strana: any, r: Obdlznik): Promise<string> {
  const zaklad = strana.getViewport({ scale: 1 });
  const dlhsia = Math.max(r.w * zaklad.width, r.h * zaklad.height) || 1;
  const mierka = Math.min(8, Math.max(1, MAX_VYREZ / dlhsia));
  const vp = strana.getViewport({ scale: mierka });
  const platno = document.createElement("canvas");
  platno.width = Math.max(1, Math.round(r.w * vp.width));
  platno.height = Math.max(1, Math.round(r.h * vp.height));
  const ctx = platno.getContext("2d");
  if (!ctx) throw new Error("Plátno sa nedá pripraviť.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, platno.width, platno.height);
  await strana.render({
    canvas: platno,
    canvasContext: ctx,
    viewport: vp,
    transform: [1, 0, 0, 1, -r.x * vp.width, -r.y * vp.height],
  }).promise;
  return naBase64(platno);
}

/** Výrez obrázka. Obrázok sa načíta cez fetch, aby plátno nebolo „zašpinené" cudzím pôvodom. */
async function vyrezObrazka(bitmapa: ImageBitmap, r: Obdlznik): Promise<string> {
  const sx = r.x * bitmapa.width;
  const sy = r.y * bitmapa.height;
  const sw = Math.max(1, r.w * bitmapa.width);
  const sh = Math.max(1, r.h * bitmapa.height);
  const mierka = Math.min(3, MAX_VYREZ / Math.max(sw, sh));
  const platno = document.createElement("canvas");
  platno.width = Math.max(1, Math.round(sw * mierka));
  platno.height = Math.max(1, Math.round(sh * mierka));
  const ctx = platno.getContext("2d");
  if (!ctx) throw new Error("Plátno sa nedá pripraviť.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, platno.width, platno.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmapa, sx, sy, sw, sh, 0, 0, platno.width, platno.height);
  return naBase64(platno);
}

/* ------------------------------------------------------- komponent */

export function NahladSVyberom(props: Props) {
  const { t } = useT();
  const desktop = useJeDesktop();
  const { subor } = props;
  const jePdf = String(subor.mime ?? "").includes("pdf");
  if (!subor.url)
    return <p className="p-6 text-sm text-muted-foreground">{t("Doklad nemá súbor.")}</p>;
  if (!desktop)
    return jePdf ? (
      <NahladPdf url={subor.url} zvyraznenie={props.zvyraznenie} />
    ) : (
      <ObrazokSoZvyraznenim
        url={subor.url}
        alt={subor.nazov ?? t("Doklad")}
        className="w-full rounded-md"
        zvyraznenie={props.zvyraznenie}
      />
    );
  return <Vyber {...props} url={subor.url} jePdf={jePdf} />;
}

type Tah = {
  strana: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  px: number;
  py: number;
  tahane: boolean;
};
/** Označený obdĺžnik, keď sa nevyberalo pre konkrétne pole — čaká na „Použiť do poľa". */
type Oznacene = { strana: number; r: Obdlznik; text: string };

function Vyber({
  dokladId,
  url,
  jePdf,
  subor,
  pole,
  polia,
  onVyberPola,
  onZrus,
  onHodnota,
  zvyraznenie,
  onPrepniZvyraznenie,
}: Props & { url: string; jePdf: boolean }) {
  const { t } = useT();
  const precitajVyrez = useServerFn(precitajVyrezFn);
  const [strany, setStrany] = useState<Strana[]>([]);
  const [stav, setStav] = useState<"citam" | "hotovo" | "zlyhalo">("citam");
  const [pocetStran, setPocetStran] = useState(0);
  const [hover, setHover] = useState<{ strana: number; i: number } | null>(null);
  const [tah, setTah] = useState<Tah | null>(null);
  const [oznacene, setOznacene] = useState<Oznacene | null>(null);
  const [cielOznaceneho, setCielOznaceneho] = useState<KlucPola | "">("");
  const [citamVyrez, setCitamVyrez] = useState(false);
  const [poslednyVyber, setPoslednyVyber] = useState<{ strana: number; r: Obdlznik } | null>(null);
  const [volbaPola, setVolbaPola] = useState<KlucPola | "">("");
  const pdfStrany = useRef<any[]>([]);
  const bitmapa = useRef<Promise<ImageBitmap> | null>(null);
  const obal = useRef<HTMLDivElement>(null);

  const maText = strany.some((s) => s.slova.length > 0);
  // Zvýraznenie vyťažených údajov — z tých istých slov, ktoré slúžia na výber.
  const slovaStran = useMemo(() => strany.map((s) => s.slova), [strany]);
  const zvyraznenia = useZvyraznenia(slovaStran, zvyraznenie);
  const zobrazitZvyraznenie = Boolean(zvyraznenie?.zobrazit);
  const aktivne = zvyraznenie?.aktivne ?? pole;
  usePosunNaAktivne(obal, aktivne, zvyraznenia, zobrazitZvyraznenie);

  // Vykreslenie PDF aj s textovou vrstvou.
  useEffect(() => {
    if (!jePdf) return;
    let zrusene = false;
    setStrany([]);
    setStav("citam");
    pdfStrany.current = [];
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const dokument = await pdfjs.getDocument({ url }).promise;
        if (zrusene) return;
        setPocetStran(dokument.numPages);
        const meradlo = document.createElement("canvas").getContext("2d");
        for (let i = 1; i <= Math.min(dokument.numPages, MAX_STRAN); i++) {
          const strana = await dokument.getPage(i);
          if (zrusene) return;
          const zaklad = strana.getViewport({ scale: 1 });
          const viewport = strana.getViewport({ scale: SIRKA / zaklad.width });
          const platno = document.createElement("canvas");
          platno.width = Math.floor(viewport.width);
          platno.height = Math.floor(viewport.height);
          platno.className = "block h-full w-full";
          const kontext = platno.getContext("2d");
          if (!kontext) throw new Error(t("Plátno sa nedá pripraviť."));
          await strana.render({ canvas: platno, canvasContext: kontext, viewport }).promise;
          if (zrusene) return;

          const slova = await slovaStranyPdf(pdfjs, strana, viewport, meradlo);
          if (zrusene) return;
          pdfStrany.current[i - 1] = strana;
          setStrany((pred) => [
            ...pred,
            { cislo: i, pomer: viewport.height / viewport.width, platno, slova },
          ]);
        }
        setStav("hotovo");
      } catch (e) {
        if (!zrusene) {
          console.warn("[vyber] PDF sa nepodarilo vykresliť:", e);
          setStav("zlyhalo");
        }
      }
    })();
    return () => {
      zrusene = true;
    };
  }, [url, jePdf]);

  // Obrázok — rozmery z načítania, bitmapa na výrezy až keď treba.
  useEffect(() => {
    if (jePdf) return;
    setStrany([]);
    setStav("citam");
    bitmapa.current = null;
  }, [url, jePdf]);

  // Esc zruší výber aj označenie.
  useEffect(() => {
    if (!pole && !oznacene) return;
    const kl = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOznacene(null);
      setTah(null);
      if (pole) onZrus();
    };
    window.addEventListener("keydown", kl);
    return () => window.removeEventListener("keydown", kl);
  }, [pole, oznacene, onZrus]);

  useEffect(() => {
    if (pole) setOznacene(null);
  }, [pole]);

  function bodVStrane(e: ReactPointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  async function vyrez(strana: number, r: Obdlznik): Promise<string> {
    if (jePdf) return vyrezPdf(pdfStrany.current[strana], r);
    if (!bitmapa.current)
      bitmapa.current = fetch(url)
        .then((o) => {
          if (!o.ok)
            throw new Error(t("Súbor sa nepodarilo načítať ({status}).", { status: o.status }));
          return o.blob();
        })
        .then((b) => createImageBitmap(b));
    try {
      return await vyrezObrazka(await bitmapa.current, r);
    } catch (e) {
      bitmapa.current = null;
      throw e;
    }
  }

  /** Text z oblasti: zo slov PDF, a keď tam žiadne nie sú, cez AI. */
  async function textOblasti(strana: number, r: Obdlznik): Promise<string> {
    const slova = slovaVObdlzniku(strany[strana]?.slova ?? [], r);
    if (slova.length) return textZoSlov(slova);
    setCitamVyrez(true);
    try {
      const obrazok = await vyrez(strana, r);
      const { text } = await precitajVyrez({ data: { id: dokladId, obrazok, mime: "image/jpeg" } });
      return text;
    } finally {
      setCitamVyrez(false);
    }
  }

  function zapis(
    kluc: KlucPola,
    h: Hodnota | null,
    zdroj: string,
    kde: { strana: number; r: Obdlznik },
  ) {
    const p = poleVyberu(kluc);
    if (h == null) {
      toast.error(
        zdroj.trim()
          ? t('V texte „{text}" som nenašiel {typ}.', {
              text: zdroj.trim().slice(0, 60),
              typ: t(NAZOV_TYPU[p.typ]),
            })
          : t("V označenej oblasti nie je žiadny text."),
      );
      return;
    }
    onHodnota(kluc, h);
    setPoslednyVyber(kde);
    setTimeout(() => setPoslednyVyber((x) => (x === kde ? null : x)), 1400);
    toast.success(`${t(p.nazov)}: ${hodnotaNaUkazku(p.typ, h)}`, { duration: 2500 });
  }

  async function dokonciOblast(strana: number, r: Obdlznik) {
    if (pole) {
      try {
        const text = await textOblasti(strana, r);
        zapis(pole, normalizuj(poleVyberu(pole).typ, text), text, { strana, r });
      } catch (e: any) {
        toast.error(t(e?.message ?? "Oblasť sa nepodarilo prečítať."));
      }
      return;
    }
    // Bez zvoleného poľa: ukáž, čo je označené, a pole sa vyberie v okienku.
    const slova = slovaVObdlzniku(strany[strana]?.slova ?? [], r);
    setOznacene({ strana, r, text: textZoSlov(slova) });
    setCielOznaceneho((c) => c || polia[0] || "");
  }

  async function pouziOznacene() {
    if (!oznacene || !cielOznaceneho) return;
    const { strana, r } = oznacene;
    try {
      const text = oznacene.text || (await textOblasti(strana, r));
      zapis(cielOznaceneho, normalizuj(poleVyberu(cielOznaceneho).typ, text), text, { strana, r });
      setOznacene(null);
    } catch (e: any) {
      toast.error(t(e?.message ?? "Oblasť sa nepodarilo prečítať."));
    }
  }

  function dole(e: ReactPointerEvent<HTMLDivElement>, strana: number) {
    if (e.button !== 0 || citamVyrez) return;
    const b = bodVStrane(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    setTah({
      strana,
      ax: b.x,
      ay: b.y,
      bx: b.x,
      by: b.y,
      px: e.clientX,
      py: e.clientY,
      tahane: false,
    });
    e.preventDefault();
  }

  function pohyb(e: ReactPointerEvent<HTMLDivElement>, strana: number) {
    const b = bodVStrane(e);
    if (tah && tah.strana === strana) {
      const tahane = tah.tahane || Math.hypot(e.clientX - tah.px, e.clientY - tah.py) > PRAH_TAHU;
      setTah({ ...tah, bx: b.x, by: b.y, tahane });
      return;
    }
    if (!pole) return;
    const i = slovoNaBode(strany[strana]?.slova ?? [], b.x, b.y);
    setHover(i >= 0 ? { strana, i } : null);
  }

  function hore(_e: ReactPointerEvent<HTMLDivElement>, strana: number) {
    if (!tah || tah.strana !== strana) return;
    const ta = tah;
    setTah(null);
    if (ta.tahane) {
      const r = obdlznikZBodov(ta.ax, ta.ay, ta.bx, ta.by);
      if (r.w > 0.003 && r.h > 0.003) void dokonciOblast(strana, r);
      return;
    }
    // Kliknutie — len keď sa vyberá pre pole.
    if (!pole) return;
    const slova = strany[strana]?.slova ?? [];
    const i = slovoNaBode(slova, ta.ax, ta.ay);
    if (i < 0) {
      if (!slova.length)
        toast.info(
          jePdf
            ? t("Tento doklad je sken bez textu — označte oblasť ťahaním myši, prečíta ju AI.")
            : t("Na obrázku označte oblasť s hodnotou ťahaním myši — prečíta ju AI."),
        );
      return;
    }
    const s = slova[i];
    zapis(pole, hodnotaZKliku(poleVyberu(pole), s.usek, s.od, s.po), s.usek, {
      strana,
      r: { x: s.x, y: s.y, w: s.w, h: s.h },
    });
  }

  const nazovPola = pole ? t(poleVyberu(pole).nazov) : null;
  const moznosti = useMemo(() => polia.map((k) => poleVyberu(k)), [polia]);

  const obdlznik = (r: Obdlznik, trieda: string) => (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute ${trieda}`}
      style={{
        left: `${r.x * 100}%`,
        top: `${r.y * 100}%`,
        width: `${r.w * 100}%`,
        height: `${r.h * 100}%`,
      }}
    />
  );

  return (
    <div>
      {/* Lišta výberu */}
      {pole ? (
        <div
          role="status"
          className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm"
        >
          <Crosshair className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {t("Vyberte text pre pole")} <strong>{nazovPola}</strong> —{" "}
            {maText
              ? t("kliknite na text v doklade alebo označte oblasť ťahaním.")
              : t("označte oblasť ťahaním, prečíta ju AI.")}
          </span>
          {citamVyrez && (
            <Loader2 className="h-4 w-4 animate-spin" aria-label={t("Čítam označenú oblasť")} />
          )}
          {onPrepniZvyraznenie && (maText || zvyraznenia.length > 0) ? (
            <PrepinacZvyraznenia
              zap={zobrazitZvyraznenie}
              onPrepni={onPrepniZvyraznenie}
              className="rounded-md border border-border bg-background p-1 hover:bg-secondary"
            />
          ) : null}
          <button
            type="button"
            onClick={onZrus}
            aria-label={t("Zrušiť výber z dokladu (Esc)")}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-secondary"
          >
            <X className="h-3.5 w-3.5" /> {t("Zrušiť (Esc)")}
          </button>
        </div>
      ) : (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{t("Opraviť pole z dokladu:")}</span>
          <select
            aria-label={t("Pole, ktoré sa vyberie z dokladu")}
            value={volbaPola}
            onChange={(e) => setVolbaPola(e.target.value as KlucPola)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
          >
            <option value="">{t("— pole —")}</option>
            {moznosti.map((p) => (
              <option key={p.kluc} value={p.kluc}>
                {t(p.nazov)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!volbaPola}
            onClick={() => volbaPola && onVyberPola(volbaPola)}
            aria-label={t("Vybrať hodnotu poľa z dokladu")}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-secondary disabled:opacity-50"
          >
            <Crosshair className="h-3.5 w-3.5" /> {t("Vybrať z dokladu")}
          </button>
          {onPrepniZvyraznenie && (maText || zvyraznenia.length > 0) ? (
            <PrepinacZvyraznenia
              zap={zobrazitZvyraznenie}
              onPrepni={onPrepniZvyraznenie}
              className="ml-auto rounded-md border border-border p-1 hover:bg-secondary"
            />
          ) : null}
          <span className="basis-full">
            {t("alebo kliknite do poľa vo formulári a potom na text v doklade.")}
          </span>
        </div>
      )}

      {stav === "citam" && jePdf && strany.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {t("Načítavam náhľad…")}
        </div>
      )}
      {stav === "zlyhalo" && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {t("Náhľad sa nepodarilo vykresliť.")}{" "}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {t("Otvoriť doklad")}
          </a>
        </div>
      )}

      <div ref={obal} className="bg-muted/20">
        {jePdf ? (
          strany.map((s, i) => (
            <StranaNahladu
              key={s.cislo}
              strana={s}
              index={i}
              aktivna={!!pole}
              hover={hover?.strana === i ? hover.i : -1}
              tah={
                tah?.strana === i && tah.tahane
                  ? obdlznikZBodov(tah.ax, tah.ay, tah.bx, tah.by)
                  : null
              }
              oznacene={oznacene?.strana === i ? oznacene.r : null}
              hotovo={poslednyVyber?.strana === i ? poslednyVyber.r : null}
              zvyraznenia={
                zobrazitZvyraznenie ? (
                  <ZvyrazneniaStrany zvyraznenia={zvyraznenia} strana={i} aktivne={aktivne} />
                ) : null
              }
              obdlznik={obdlznik}
              onDole={dole}
              onPohyb={pohyb}
              onHore={hore}
              onOdid={() => setHover(null)}
              onZrusTah={() => setTah(null)}
            />
          ))
        ) : (
          <StranaNahladu
            strana={strany[0] ?? { cislo: 1, pomer: 0, slova: [] }}
            index={0}
            aktivna={!!pole}
            hover={-1}
            tah={
              tah?.strana === 0 && tah.tahane
                ? obdlznikZBodov(tah.ax, tah.ay, tah.bx, tah.by)
                : null
            }
            oznacene={oznacene?.strana === 0 ? oznacene.r : null}
            hotovo={poslednyVyber?.strana === 0 ? poslednyVyber.r : null}
            zvyraznenia={
              zobrazitZvyraznenie && strany.length ? (
                <ZvyrazneniaStrany zvyraznenia={zvyraznenia} strana={0} aktivne={aktivne} />
              ) : null
            }
            obdlznik={obdlznik}
            onDole={dole}
            onPohyb={pohyb}
            onHore={hore}
            onOdid={() => setHover(null)}
            onZrusTah={() => setTah(null)}
          >
            <img
              src={url}
              alt={subor.nazov ?? t("Doklad")}
              draggable={false}
              className="block w-full select-none rounded-md"
              onLoad={(e) => {
                const im = e.currentTarget;
                setStrany([
                  { cislo: 1, pomer: im.naturalHeight / (im.naturalWidth || 1), slova: [] },
                ]);
                setStav("hotovo");
              }}
              onError={() => setStav("zlyhalo")}
            />
          </StranaNahladu>
        )}
      </div>

      {stav === "hotovo" && pocetStran > MAX_STRAN && (
        <div className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
          {t("Náhľad ukazuje prvých {max} strán z {stran}.", { max: MAX_STRAN, stran: pocetStran })}
        </div>
      )}

      {/* Označená oblasť bez zvoleného poľa — kam ju zapísať? */}
      {oznacene && (
        <div
          role="dialog"
          aria-label={t("Použiť označený text do poľa")}
          className="sticky bottom-0 mt-2 space-y-2 rounded-md border border-border bg-card p-3 text-sm shadow-lg"
        >
          <div className="text-xs text-muted-foreground">
            {oznacene.text ? (
              <>
                {t("Označené:")}{" "}
                <span className="whitespace-pre-wrap font-medium text-foreground">
                  {oznacene.text.slice(0, 200)}
                </span>
              </>
            ) : (
              t("V oblasti nie je text z PDF — prečíta ju AI.")
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t("Pole, do ktorého sa označený text zapíše")}
              value={cielOznaceneho}
              onChange={(e) => setCielOznaceneho(e.target.value as KlucPola)}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            >
              {moznosti.map((p) => (
                <option key={p.kluc} value={p.kluc}>
                  {t(p.nazov)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!cielOznaceneho || citamVyrez}
              onClick={() => void pouziOznacene()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {citamVyrez ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("Použiť do poľa")} {cielOznaceneho ? t(poleVyberu(cielOznaceneho).nazov) : ""}
            </button>
            <button
              type="button"
              onClick={() => setOznacene(null)}
              aria-label={t("Zrušiť označenie (Esc)")}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
            >
              {t("Zrušiť")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StranaNahladu({
  strana,
  index,
  aktivna,
  hover,
  tah,
  oznacene,
  hotovo,
  obdlznik,
  onDole,
  onPohyb,
  onHore,
  onOdid,
  onZrusTah,
  zvyraznenia,
  children,
}: {
  strana: Strana;
  index: number;
  aktivna: boolean;
  hover: number;
  tah: Obdlznik | null;
  oznacene: Obdlznik | null;
  hotovo: Obdlznik | null;
  obdlznik: (r: Obdlznik, trieda: string) => ReactNode;
  onDole: (e: ReactPointerEvent<HTMLDivElement>, strana: number) => void;
  onPohyb: (e: ReactPointerEvent<HTMLDivElement>, strana: number) => void;
  onHore: (e: ReactPointerEvent<HTMLDivElement>, strana: number) => void;
  onOdid: () => void;
  onZrusTah: () => void;
  /** Rámčeky vyťažených údajov (pod vrstvou výberu). */
  zvyraznenia?: ReactNode;
  children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || !strana.platno) return;
    el.replaceChildren(strana.platno);
  }, [strana.platno]);
  const slovo = hover >= 0 ? strana.slova[hover] : null;

  return (
    <div
      className="relative border-b border-border last:border-b-0"
      style={strana.platno ? { aspectRatio: `1 / ${strana.pomer}` } : undefined}
      aria-label={`Strana ${index + 1} dokladu`}
    >
      {strana.platno ? <div ref={box} className="absolute inset-0" /> : children}
      {zvyraznenia}
      <div
        className={`absolute inset-0 touch-none select-none ${aktivna ? "cursor-crosshair" : "cursor-cell"}`}
        onPointerDown={(e) => onDole(e, index)}
        onPointerMove={(e) => onPohyb(e, index)}
        onPointerUp={(e) => onHore(e, index)}
        onPointerCancel={onZrusTah}
        onPointerLeave={onOdid}
      >
        {aktivna &&
          strana.slova.map((s, i) =>
            i === hover ? null : (
              <div
                key={i}
                aria-hidden="true"
                className="pointer-events-none absolute rounded-sm bg-primary/5"
                style={{
                  left: `${s.x * 100}%`,
                  top: `${s.y * 100}%`,
                  width: `${s.w * 100}%`,
                  height: `${s.h * 100}%`,
                }}
              />
            ),
          )}
        {slovo && obdlznik(slovo, "rounded-sm bg-primary/25 ring-2 ring-primary")}
        {tah && obdlznik(tah, "border-2 border-dashed border-primary bg-primary/10")}
        {oznacene && obdlznik(oznacene, "border-2 border-primary bg-primary/15")}
        {hotovo && obdlznik(hotovo, "rounded-sm bg-green-500/25 ring-2 ring-green-500")}
      </div>
    </div>
  );
}
