import { useEffect, useRef, useState } from "react";
import { Camera, RotateCw, SlidersHorizontal } from "lucide-react";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import {
  cssFiltra,
  otocRohy,
  pouziFilter,
  predvoleneRohy,
  vyrovnaj,
  type Bod,
  type Filter,
  type Rohy,
} from "@/lib/mobile/perspektiva";

/** Snímka z kamery: plné rozlíšenie prúdu a rohy, ktoré na nej našla detekcia. */
export type Snimka = {
  /** V testoch (vykreslenie na serveri) plátno nie je — stačia rozmery. */
  platno?: HTMLCanvasElement;
  sirka: number;
  vyska: number;
  rohy?: Rohy | null;
};

/** Kvalita uloženého JPEG. Písmo ostane ostré, A4 má okolo 1 MB. */
export const KVALITA_ULOZENIA = 0.82;
/** Najdlhšia strana náhľadu v „Upraviť doklad" — viac oko na telefóne nevidí. */
const STRANA_NAHLADU = 1400;

/**
 * Upraviť doklad — po odfotení, pred uložením.
 *
 * Rovnaká tmavá obrazovka ako skener: snímka, cez ňu štyri rohy dokladu,
 * ktoré sa dajú potiahnuť prstom (predvyplnené z detekcie okrajov; keď
 * detekcia nič nenašla, celý obraz s malým okrajom). Pod tým filtre,
 * otočenie, „Odfotiť znova" a hlavné „Uložiť doklad".
 *
 * Uloženie vyrovná perspektívu (`perspektiva.ts`), použije filter a odovzdá
 * hotový JPEG ďalej. Čo sa s ním stane potom (QR bločku, PDF zo strán,
 * dávka), rieši volajúci — tu sa len upravuje obraz.
 */
export function UpravaDokladu({
  snimka,
  strana = 1,
  viacStran = false,
  davka = false,
  odfotenych = 0,
  onUlozit,
  onPridatStranu,
  onZnova,
}: {
  snimka: Snimka;
  /** Poradie tejto strany (od 1) — vidieť ho len pri viacerých stranách. */
  strana?: number;
  /** Viacstranový doklad alebo dávka — pribudne „Pridať stranu". */
  viacStran?: boolean;
  /** Každá strana je samostatný doklad — iné texty tlačidiel. */
  davka?: boolean;
  /** Koľko strán je už odfotených pred touto. */
  odfotenych?: number;
  onUlozit: (dataUrl: string) => void;
  onPridatStranu?: (dataUrl: string) => void;
  onZnova: () => void;
}) {
  const { t, mnozne } = usePreklad();
  const [platno, setPlatno] = useState(snimka.platno);
  const [rozmer, setRozmer] = useState({ sirka: snimka.sirka, vyska: snimka.vyska });
  const [rohy, setRohy] = useState<Rohy>(
    () => snimka.rohy ?? predvoleneRohy(snimka.sirka, snimka.vyska),
  );
  const [filter, setFilter] = useState<Filter>("povodny");
  const [jas, setJas] = useState(0);
  const [kontrast, setKontrast] = useState(0);
  const [filtreOtvorene, setFiltreOtvorene] = useState(false);
  const [pracujem, setPracujem] = useState(false);

  useZatvorNaEscape(pracujem ? null : onZnova);

  /* --- Náhľad: zmenšená snímka na plátne (bez kódovania do JPEG) --- */
  const nahladRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const n = nahladRef.current;
    if (!n || !platno) return;
    const k = Math.min(1, STRANA_NAHLADU / Math.max(platno.width, platno.height));
    n.width = Math.round(platno.width * k);
    n.height = Math.round(platno.height * k);
    n.getContext("2d")?.drawImage(platno, 0, 0, n.width, n.height);
  }, [platno]);

  /*
    Snímka sa zmestí do voľného miesta celá (ako `object-contain`). Veľkosť
    rámika sa počíta z miesta, ktoré je k dispozícii — rohy sú potom v
    percentách rámika, takže sedia pri každej veľkosti obrazovky.
  */
  const miestoRef = useRef<HTMLDivElement | null>(null);
  const [miesto, setMiesto] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const m = miestoRef.current;
    if (!m) return;
    const zmeraj = () => setMiesto({ w: m.clientWidth, h: m.clientHeight });
    zmeraj();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(zmeraj);
    ro.observe(m);
    return () => ro.disconnect();
  }, []);
  const mierka = miesto ? Math.min(miesto.w / rozmer.sirka, miesto.h / rozmer.vyska) : 0;
  const ramik = miesto
    ? { width: rozmer.sirka * mierka, height: rozmer.vyska * mierka }
    : { width: "100%", aspectRatio: `${rozmer.sirka} / ${rozmer.vyska}` };

  /* --- Ťahanie rohov --- */
  const ramikRef = useRef<HTMLDivElement | null>(null);
  const tahany = useRef<number | null>(null);
  function posun(i: number, e: React.PointerEvent) {
    const r = ramikRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    const x = Math.min(Math.max(((e.clientX - r.left) / r.width) * rozmer.sirka, 0), rozmer.sirka);
    const y = Math.min(Math.max(((e.clientY - r.top) / r.height) * rozmer.vyska, 0), rozmer.vyska);
    setRohy((p) => p.map((b, j) => (j === i ? { x, y } : b)) as Rohy);
  }

  /** Otočí snímku aj rohy o 90° v smere hodinových ručičiek. */
  function otoc() {
    if (platno) {
      const nove = document.createElement("canvas");
      nove.width = platno.height;
      nove.height = platno.width;
      const ctx = nove.getContext("2d");
      if (!ctx) return;
      ctx.translate(nove.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(platno, 0, 0);
      setPlatno(nove);
    }
    setRohy((r) => otocRohy(r, rozmer.vyska));
    setRozmer((r) => ({ sirka: r.vyska, vyska: r.sirka }));
  }

  /** Vyrovná, prefiltruje a zakóduje stranu. `null`, keď to nejde. */
  async function hotovaStrana(): Promise<string | null> {
    if (!platno) return null;
    setPracujem(true);
    try {
      // Nech sa „Upravujem…" ukáže skôr, než sa začne počítať.
      await new Promise((r) => setTimeout(r, 30));
      const ctx = platno.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      const zdroj = ctx.getImageData(0, 0, platno.width, platno.height);
      const vystup = document.createElement("canvas");
      const vctx = vystup.getContext("2d");
      if (!vctx) return null;
      let data: ImageData | null = null;
      await vyrovnaj(zdroj, rohy, {
        vytvor: (w, h) => {
          vystup.width = w;
          vystup.height = h;
          data = vctx.createImageData(w, h);
          return data;
        },
        prestavka: () => new Promise((r) => setTimeout(r, 0)),
      });
      if (!data) return null;
      pouziFilter(data, filter, jas, kontrast);
      vctx.putImageData(data, 0, 0);
      return vystup.toDataURL("image/jpeg", KVALITA_ULOZENIA);
    } catch (e) {
      console.warn("Úprava dokladu zlyhala:", e);
      return null;
    } finally {
      setPracujem(false);
    }
  }

  async function uloz(pridat: boolean) {
    const s = await hotovaStrana();
    if (!s) {
      const { toast } = await import("sonner");
      toast.error(t("uprava.nepodarilo"));
      return;
    }
    if (pridat && onPridatStranu) onPridatStranu(s);
    else onUlozit(s);
  }

  const spolu = odfotenych + 1;
  const hlavny = viacStran
    ? t("uprava.hotovo", {
        pocet: `${spolu} ${mnozne(
          spolu,
          davka
            ? { one: t("uprava.doklad1"), few: t("uprava.doklad2"), other: t("uprava.doklad5") }
            : { one: t("uprava.strana1"), few: t("uprava.strana2"), other: t("uprava.strana5") },
        )}`,
      })
    : t("uprava.ulozit");

  const polygon = rohy.map((b) => `${b.x},${b.y}`).join(" ");
  const css = cssFiltra(filter, jas, kontrast);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("uprava.nazov")}
      data-uprava-dokladu
      className="fixed inset-0 z-[80] flex flex-col bg-black text-white"
    >
      <header
        className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2"
        style={{ paddingTop: "calc(var(--safe-top) + 0.75rem)" }}
      >
        <h2 className="text-[17px] font-semibold">{t("uprava.nazov")}</h2>
        {viacStran && (
          <span className="rounded-full bg-white/15 px-3 py-1 text-[12px] font-medium">
            {davka ? `${spolu}.` : t("uprava.stranaCislo", { n: strana })}
          </span>
        )}
      </header>
      <p className="shrink-0 px-4 text-[13px] text-white/70 [@media(max-height:700px)]:hidden">
        {t("uprava.popis")}
      </p>

      {/* Miesto pre snímku. Rohy majú okolo seba voľno, aby sa dali chytiť aj pri okraji. */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-4">
        <div ref={miestoRef} className="flex h-full w-full items-center justify-center">
          <div
            ref={ramikRef}
            data-ramik-snimky
            className="relative touch-none select-none"
            style={ramik as React.CSSProperties}
          >
            <canvas
              ref={nahladRef}
              aria-hidden
              className="absolute inset-0 h-full w-full bg-white/5"
              style={{ filter: css === "none" ? undefined : css }}
            />
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${rozmer.sirka} ${rozmer.vyska}`}
              preserveAspectRatio="none"
            >
              <polygon
                points={polygon}
                fill="var(--app-zelena)"
                fillOpacity={0.18}
                stroke="var(--app-zelena)"
                strokeWidth={Math.max(rozmer.sirka, rozmer.vyska) / 300}
                strokeLinejoin="round"
              />
            </svg>
            {rohy.map((b: Bod, i) => (
              <div
                key={i}
                role="slider"
                tabIndex={0}
                data-roh={i}
                aria-label={t("uprava.roh", { n: i + 1 })}
                aria-valuetext={`${Math.round(b.x)} × ${Math.round(b.y)}`}
                onPointerDown={(e) => {
                  tahany.current = i;
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={(e) => tahany.current === i && posun(i, e)}
                onPointerUp={() => (tahany.current = null)}
                onPointerCancel={() => (tahany.current = null)}
                /* Dotyková plocha 48 px, viditeľný krúžok menší — prst ho nezakryje celý. */
                className="absolute grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center"
                style={{
                  left: `${(b.x / rozmer.sirka) * 100}%`,
                  top: `${(b.y / rozmer.vyska) * 100}%`,
                }}
              >
                <span className="h-6 w-6 rounded-full border-[3px] border-white bg-app-zelena/70 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="shrink-0 px-4 pt-2"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
      >
        {filtreOtvorene && (
          <section
            aria-label={t("uprava.filtre")}
            data-filtre
            className="mb-2 rounded-app bg-white/10 p-2.5"
          >
            <div role="group" className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["povodny", t("uprava.filterPovodny")],
                  ["vylepseny", t("uprava.filterVylepseny")],
                  ["ciernobiely", t("uprava.filterCiernobiely")],
                ] as const
              ).map(([kod, nazov]) => (
                <button
                  key={kod}
                  onClick={() => setFilter(kod)}
                  aria-pressed={filter === kod}
                  className={`min-h-[40px] min-w-0 truncate rounded-app-sm px-1 text-[13px] ${
                    filter === kod
                      ? "bg-app-zelena font-semibold text-white"
                      : "bg-white/10 text-white/80"
                  }`}
                >
                  {nazov}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(
                [
                  [t("uprava.jas"), jas, setJas],
                  [t("uprava.kontrast"), kontrast, setKontrast],
                ] as const
              ).map(([nazov, hodnota, nastav]) => (
                <label key={nazov} className="block min-w-0 text-[11px] text-white/70">
                  {nazov}
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    value={hodnota}
                    onChange={(e) => nastav(Number(e.target.value))}
                    className="mt-1 block h-8 w-full accent-app-zelena"
                  />
                </label>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Nastroj
            icon={SlidersHorizontal}
            label={t("uprava.filtre")}
            onClick={() => setFiltreOtvorene((v) => !v)}
            stlacene={filtreOtvorene}
          />
          <Nastroj icon={RotateCw} label={t("uprava.otocit")} onClick={otoc} />
          <Nastroj icon={Camera} label={t("uprava.znova")} onClick={onZnova} />
        </div>

        <div className={`mt-2 grid gap-2 ${viacStran ? "grid-cols-2" : "grid-cols-1"}`}>
          {viacStran && onPridatStranu && (
            <button
              onClick={() => void uloz(true)}
              disabled={pracujem}
              className="min-h-[52px] min-w-0 truncate rounded-app border border-white/40 px-2 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {davka ? t("uprava.dalsiDoklad") : t("uprava.pridatStranu")}
            </button>
          )}
          <button
            onClick={() => void uloz(false)}
            disabled={pracujem}
            data-ulozit-doklad
            className="min-h-[52px] min-w-0 truncate rounded-app bg-app-zelena px-2 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {hlavny}
          </button>
        </div>
      </div>

      {pracujem && (
        <div
          role="status"
          className="absolute inset-0 grid place-items-center bg-black/60 text-[15px] font-medium"
        >
          {t("uprava.upravujem")}
        </div>
      )}
    </div>
  );
}

function Nastroj({
  icon: Icon,
  label,
  onClick,
  stlacene,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  stlacene?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={stlacene}
      className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-app-sm text-[12px] ${
        stlacene ? "bg-white/20 text-white" : "text-white/85 active:bg-white/10"
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
