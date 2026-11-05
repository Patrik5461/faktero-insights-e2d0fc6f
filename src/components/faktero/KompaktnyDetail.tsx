import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  RotateCcw,
  RotateCw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { NahladPdf } from "./NahladPdf";
import { PanelNahladu } from "./PanelNahladu";
import { PrepinacStranyNahladu, RozlozenieSNahladom } from "./RozlozenieSNahladom";
import {
  ObrazokSoZvyraznenim,
  PrepinacZvyraznenia,
  useAktivnePoleDetailu,
  useZvyraznenieDokladu,
  type ZvyraznenieNahladu,
} from "./ZvyraznenieVytazenych";
import type { UdajeNespracovaneho } from "@/lib/faktero/nespracovane";
import type { KlucPola } from "@/lib/faktero/vyber-z-dokladu";
import type { StranaNahladu } from "@/hooks/useStranaNahladu";
import { useT } from "@/lib/i18n/useT";
import { lokalJazyka } from "@/lib/i18n/jazyk";
import { formatujMenu, formatujMnozstvo } from "@/lib/faktero/mena";

/*
  Spoločné kúsky kompaktného rozloženia dokladu — podľa nespracovaného
  dokladu (NespracovanyKompaktny): veľký náhľad s nástrojmi na jednej strane,
  úzky panel (400 px) so sekciami a poľami s popisom v rámčeku na druhej,
  tlačidlá stále na spodku panelu. Používa ich nespracovaný doklad aj detail
  vystavenej a zálohovej faktúry. Farby len z témy — rozloženie mení tvary.
*/

/** Rámček poľa (výška 10, popis sedí na hornej hrane). */
export const ramik =
  "h-10 w-full rounded-lg border bg-background px-3 pt-1 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

/** Pole s popisom v rámčeku; výkričník pri chýbajúcom, fajka pri overenom údaji. */
export function Pole({
  popis,
  chyba,
  ok,
  children,
}: {
  popis: string;
  chyba?: boolean;
  ok?: boolean;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <label className="relative block" data-hodnota={popis}>
      <span className="pointer-events-none absolute -top-2 left-2.5 z-10 bg-card px-1 text-[11px] leading-none text-muted-foreground">
        {t(popis)}
      </span>
      {children}
      {chyba ? (
        <AlertCircle className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 fill-red-500 text-white" />
      ) : ok ? (
        <Check className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-emerald-700" />
      ) : null}
    </label>
  );
}

/**
 * Údaj len na čítanie v tom istom rámčeku ako pole (napr. na vystavenej
 * faktúre — mení sa cez Opraviť faktúru, lebo je aj v PDF u odberateľa).
 */
export function Hodnota({
  popis,
  ok,
  title,
  className = "",
  children,
}: {
  popis: string;
  ok?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useT();
  const prazdne = children === null || children === undefined || children === "";
  return (
    <div className="relative block" data-hodnota={popis}>
      <span className="pointer-events-none absolute -top-2 left-2.5 z-10 bg-card px-1 text-[11px] leading-none text-muted-foreground">
        {t(popis)}
      </span>
      <div
        title={title}
        className={`${ramik} flex items-center border-input ${ok ? "pr-8" : ""} ${className}`}
      >
        <span className="min-w-0 truncate">{prazdne ? "—" : children}</span>
      </div>
      {ok ? (
        <Check className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-emerald-700" />
      ) : null}
    </div>
  );
}

/** Sekcia panelu: nadpis, vpravo fajka (všetko sedí) alebo vlastná akcia/stav. */
export function Sekcia({
  nadpis,
  ok,
  akcia,
  id,
  children,
}: {
  nadpis: string;
  ok?: boolean;
  /** Vpravo od nadpisu namiesto fajky — stav, odkaz „Zmeniť“… */
  akcia?: ReactNode;
  id?: string;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <section
      id={id}
      data-sekcia={nadpis}
      className="scroll-mt-24 border-b border-border px-4 py-4 transition-shadow last:border-b-0"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium">{t(nadpis)}</h2>
        {akcia ?? (ok ? <Check className="h-5 w-5 text-emerald-700" /> : null)}
      </div>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

/** Menej dôležité polia pod „Zobraziť viac“ — dôležité ostávajú vždy viditeľné. */
export function Rozsirene({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [otvorene, setOtvorene] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOtvorene((o) => !o)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs text-muted-foreground hover:bg-secondary"
      >
        {otvorene ? t("Zobraziť menej") : t("Zobraziť viac")}{" "}
        {otvorene ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {otvorene ? <div className="space-y-3.5">{children}</div> : null}
    </>
  );
}

/**
 * Obsah, ktorý má vlastnú kartu (komentáre, prílohy, zálohy…), vložený do
 * sekcie panelu bez druhého rámu — karta v karte by panel rozbila.
 */
export const BEZ_RAMU =
  "[&>*]:rounded-none! [&>*]:border-0! [&>*]:bg-transparent! [&>*]:p-0! [&>*]:shadow-none!";

/** Súbor v náhľade: `undefined` = načítava sa, `null` = súbor nie je. */
export type SuborKompaktny = {
  url: string | null;
  nazov: string | null;
  mime: string | null;
};

/**
 * Náhľad dokladu s nástrojmi — otočiť, priblížiť, zvýraznenie vyťažených
 * údajov, stiahnuť, zmazať, prepínač strany. Na širokej obrazovke má výšku
 * výrezu a roluje len jeho obsah (nástroje ostávajú hore).
 */
export function NahladKompaktny({
  subor,
  zvyraznenie: zvyraznenieZvonka,
  udaje,
  aktivnePole = null,
  onPrepniZvyraznenie: onPrepniZvonka,
  onZmaz,
  onSkryt,
  busy,
  prazdne = "Doklad nemá súbor.",
}: {
  subor: SuborKompaktny | null | undefined;
  zvyraznenie?: Omit<ZvyraznenieNahladu, "aktivne">;
  /**
   * Uložené údaje dokladu (detail prijatej faktúry, bločku) — zvýraznia sa
   * v texte PDF tou istou logikou ako v Nespracovaných, s vlastným prepínačom.
   * Bez `zvyraznenie` zvonka.
   */
  udaje?: UdajeNespracovaneho | null;
  aktivnePole?: string | null;
  onPrepniZvyraznenie?: () => void;
  /** „Zmazať do koša“ v nástrojoch (nespracovaný doklad). */
  onZmaz?: () => void;
  /** „Skryť náhľad“ v nástrojoch (detail faktúry). */
  onSkryt?: () => void;
  busy?: boolean;
  /** Text, keď doklad súbor nemá (kľúč pre t()). */
  prazdne?: string;
}) {
  const { t } = useT();
  const [otocenie, setOtocenie] = useState(0);
  const [zvacsenie, setZvacsenie] = useState(1);
  const vlastne = useZvyraznenieDokladu(zvyraznenieZvonka ? null : udaje);
  const zvyraznenie: Omit<ZvyraznenieNahladu, "aktivne"> | undefined =
    zvyraznenieZvonka ?? vlastne.zvyraznenie;
  const onPrepniZvyraznenie = zvyraznenieZvonka ? onPrepniZvonka : vlastne.prepni;
  // Uložený doklad: miesto údaja, na ktorý človek ukáže v paneli vedľa.
  const poleDetailu = useAktivnePoleDetailu(!zvyraznenieZvonka && Boolean(udaje));
  const url = subor?.url ?? null;
  const pdf = String(subor?.mime ?? "").includes("pdf");
  const zv = zvyraznenie
    ? { ...zvyraznenie, aktivne: zvyraznenieZvonka ? aktivnePole : (aktivnePole ?? poleDetailu) }
    : undefined;
  return (
    <PanelNahladu
      className={NAHLAD_PANEL}
      obsahClassName="p-4"
      data-nahlad-kompaktny=""
      aria-label={subor?.nazov ? `${t("Náhľad dokladu")} — ${subor.nazov}` : t("Náhľad dokladu")}
      role="region"
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
          <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary-hover">
            {t("Náhľad")}
          </span>
          <div className="flex items-center gap-1 text-muted-foreground">
            {[
              {
                ikona: RotateCcw,
                popis: "Otočiť doľava",
                akcia: () => setOtocenie((o) => o - 90),
              },
              {
                ikona: RotateCw,
                popis: "Otočiť doprava",
                akcia: () => setOtocenie((o) => o + 90),
              },
              {
                ikona: ZoomIn,
                popis: "Priblížiť",
                akcia: () => setZvacsenie((z) => Math.min(3, z + 0.25)),
              },
              {
                ikona: ZoomOut,
                popis: "Oddialiť",
                akcia: () => setZvacsenie((z) => Math.max(0.5, z - 0.25)),
              },
            ].map(({ ikona: I, popis, akcia }) => (
              <button
                key={popis}
                type="button"
                title={t(popis)}
                aria-label={t(popis)}
                onClick={akcia}
                className="rounded-md p-2 hover:bg-secondary"
              >
                <I className="h-4 w-4" />
              </button>
            ))}
            {(pdf || Boolean(zvyraznenie?.polohy?.length)) && zvyraznenie && onPrepniZvyraznenie ? (
              <PrepinacZvyraznenia zap={zvyraznenie.zobrazit} onPrepni={onPrepniZvyraznenie} />
            ) : null}
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                title={t("Stiahnuť")}
                aria-label={t("Stiahnuť")}
                className="rounded-md p-2 hover:bg-secondary"
              >
                <Download className="h-4 w-4" />
              </a>
            ) : null}
            {onZmaz ? (
              <button
                type="button"
                title={t("Zmazať do koša")}
                aria-label={t("Zmazať do koša")}
                onClick={onZmaz}
                disabled={busy}
                className="rounded-md p-2 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
            <PrepinacStranyNahladu className="p-2" />
            {onSkryt ? (
              <button
                type="button"
                title={t("Skryť náhľad")}
                aria-label={t("Skryť náhľad")}
                onClick={onSkryt}
                className="rounded-md p-2 hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      {subor === undefined ? (
        <div className="flex justify-center p-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : url ? (
        <OtocenyPriblizeny otocenie={otocenie} zvacsenie={zvacsenie}>
          {pdf ? (
            <NahladPdf key={url} url={url} zvyraznenie={zv} />
          ) : (
            <ObrazokSoZvyraznenim
              url={url}
              alt={subor?.nazov ?? t("Doklad")}
              className="w-full rounded-md"
              zvyraznenie={zv}
            />
          )}
        </OtocenyPriblizeny>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">{t(prazdne)}</p>
      )}
    </PanelNahladu>
  );
}

/**
 * Obal panela náhľadu v kompaktnom rozložení: na širokej obrazovke drží pri
 * vrchu a má výšku výrezu (ako panel s údajmi), na úzkej je v toku stránky.
 *
 * Vrch je pod skutočnou výškou hlavičky (`--vyska-hlavicky` — pás podmenu sa
 * zalamuje na dva riadky). Výška odráta aj spodné odsadenie stránky (pb-24):
 * mriežka je na stránke posledná a rovnako vysoká ako panel, takže pri
 * dorolovaní na koniec ho ťahala nahor a pás podmenu zakryl vrch náhľadu.
 */
export const NAHLAD_PANEL =
  "h-auto min-w-0 overflow-hidden rounded-2xl border border-border bg-card lg:sticky lg:top-[calc(var(--vyska-hlavicky)+1.5rem)] lg:h-[calc(100vh-var(--vyska-hlavicky)-7.5rem)] lg:self-start";

/**
 * Otočenie a priblíženie dokladu tak, aby ostal v rolovacej časti panela.
 * Priblíženie mení šírku (nie `scale`) — zväčšený doklad potom roluje
 * do všetkých strán, nič nevylezie doľava ani mimo panel. Pri otočení
 * o 90°/270° má miesto, ktoré obsah zaberie v toku, prehodené rozmery.
 */
export function OtocenyPriblizeny({
  otocenie,
  zvacsenie,
  children,
}: {
  otocenie: number;
  zvacsenie: number;
  children: ReactNode;
}) {
  const ram = useRef<HTMLDivElement>(null);
  const obsah = useRef<HTMLDivElement>(null);
  const [sirka, setSirka] = useState(0);
  const [pomer, setPomer] = useState(0);
  useEffect(() => {
    const r = ram.current;
    const o = obsah.current;
    if (!r || !o || typeof ResizeObserver === "undefined") return;
    const zmeraj = () => {
      setSirka(r.clientWidth);
      if (o.offsetWidth > 0 && o.offsetHeight > 0) setPomer(o.offsetHeight / o.offsetWidth);
    };
    zmeraj();
    const ro = new ResizeObserver(zmeraj);
    ro.observe(r);
    ro.observe(o);
    return () => ro.disconnect();
  }, []);
  const bokom = ((otocenie % 360) + 360) % 180 !== 0;
  // Kým nie je zmerané (server, prvé vykreslenie), šírka v percentách.
  const w = sirka ? sirka * zvacsenie : null;
  const naBok = bokom && w !== null && pomer > 0;
  // Šírka pred otočením = výška po otočení. Jedna strana (pomer A4 a menší)
  // vyplní po otočení šírku panela; dlhší obsah (viac strán PDF pod sebou)
  // sa nezmenší pod veľkosť jednej strany — strany idú vedľa seba a roluje sa.
  const vnutri = naBok ? w / Math.min(pomer, 1.5) : 0;
  // Po otočení na začiatok dokladu: pri 90° doprava je prvá strana vpravo.
  const uhol = ((otocenie % 360) + 360) % 360;
  useEffect(() => {
    const rol = ram.current?.parentElement;
    if (!rol) return;
    rol.scrollTop = 0;
    rol.scrollLeft = uhol === 90 ? rol.scrollWidth : 0;
  }, [uhol, naBok]);
  return (
    <div ref={ram} className="w-full">
      <div
        className="relative mx-auto"
        style={{
          width: naBok ? `${vnutri * pomer}px` : w !== null ? `${w}px` : `${zvacsenie * 100}%`,
          height: naBok ? `${vnutri}px` : undefined,
        }}
      >
        <div
          ref={obsah}
          data-otoceny-priblizeny=""
          style={
            naBok
              ? {
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: `${vnutri}px`,
                  transform: `translate(-50%, -50%) rotate(${otocenie}deg)`,
                }
              : { transform: otocenie ? `rotate(${otocenie}deg)` : undefined }
          }
          className="transition-transform"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Panel s údajmi: sekcie rolujú, `pata` (tlačidlá) ostáva stále na spodku.
 * Na širokej obrazovke sa drží pri vrchu stránky.
 */
export function PanelKompaktny({
  pata,
  children,
  className = "",
  ...zvysok
}: {
  pata?: ReactNode;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...zvysok}
      data-panel-kompaktny=""
      className={`flex min-w-0 flex-col rounded-2xl border border-border bg-card lg:sticky lg:top-[calc(var(--vyska-hlavicky)+1.5rem)] lg:max-h-[calc(100vh-var(--vyska-hlavicky)-7.5rem)] ${className}`}
    >
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      {pata ? <div className="space-y-2 border-t border-border p-4">{pata}</div> : null}
    </div>
  );
}

/**
 * Náhľad a panel vedľa seba — náhľad zaberie zvyšok, panel 400 px; strana
 * podľa voľby používateľa (`useStranaNahladu`). Na úzkej obrazovke sú pod
 * sebou v jednom stĺpci `minmax(0, 1fr)` — široká tabuľka v paneli tak
 * nerozťahuje stránku do strany.
 */
export function RozlozenieKompaktne({
  nahlad,
  children,
  strana,
}: {
  nahlad: ReactNode;
  children: ReactNode;
  strana?: StranaNahladu;
}) {
  return (
    <RozlozenieSNahladom
      className="grid grid-cols-1 gap-4"
      stlpceVlavo="lg:grid-cols-[minmax(0,1fr)_400px]"
      stlpceVpravo="lg:grid-cols-[400px_minmax(0,1fr)]"
      nahlad={nahlad}
      strana={strana}
    >
      {children}
    </RozlozenieSNahladom>
  );
}

/** Hlavné tlačidlo pätičky (Vytvoriť, Zaúčtovať). */
export const TLACIDLO_HLAVNE =
  "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60";
/** Druhé tlačidlo pätičky (Uložiť zmeny). */
export const TLACIDLO_DRUHE =
  "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 py-2.5 text-sm font-medium text-primary-hover hover:bg-primary/10 disabled:opacity-60";

/** Položka dokladu v zozname panelu. */
export type PolozkaKompaktna = {
  id?: string;
  name?: string | null;
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  vat_rate?: number | null;
  total?: number | null;
  discount_percent?: number | null;
  prenesenie?: boolean | null;
};

/**
 * Položky dokladu v úzkom paneli — názov a suma na riadku, pod nimi počet,
 * cena a sadzba (tabuľka so siedmimi stĺpcami sa do 400 px nezmestí).
 */
export function ZoznamPoloziek({
  polozky,
  mena,
  prenesenie,
  vypnute,
}: {
  polozky: PolozkaKompaktna[];
  mena: string;
  /** Celý doklad je s prenesením daňovej povinnosti — namiesto sadzby „PDP“. */
  prenesenie?: boolean;
  /** Položky sú vypnuté (účtuje sa podľa súčtov) — preškrtnuté. */
  vypnute?: boolean;
}) {
  const { t, jazyk } = useT();
  if (!polozky.length)
    return <p className="text-xs text-muted-foreground">{t("Doklad nemá položky.")}</p>;
  return (
    <ul
      data-zoznam-poloziek=""
      className={`divide-y divide-border rounded-lg border border-border ${vypnute ? "line-through opacity-50" : ""}`}
    >
      {polozky.map((p, i) => (
        <li key={p.id ?? i} className="px-3 py-2 text-sm">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 break-words font-medium">{p.name || "—"}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {typeof p.total === "number" ? formatujMenu(p.total, mena) : "—"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {p.quantity != null ? formatujMnozstvo(p.quantity, lokalJazyka(jazyk)) : "—"}
            {p.unit ? ` ${p.unit}` : ""}
            {typeof p.unit_price === "number"
              ? ` × ${formatujMenu(p.unit_price, mena)}`
              : ""} · {prenesenie || p.prenesenie ? t("PDP") : `${p.vat_rate ?? 0} %`}
            {Number(p.discount_percent ?? 0) > 0
              ? ` · ${t("Zľava {n} %", { n: Number(p.discount_percent) })}`
              : ""}
          </div>
          {p.description ? (
            <div className="whitespace-pre-line text-xs text-muted-foreground">{p.description}</div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
