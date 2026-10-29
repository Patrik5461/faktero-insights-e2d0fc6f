import { useEffect, useRef, useState, type RefObject } from "react";
import { X } from "lucide-react";
import { usePreklad } from "@/lib/mobile/preklady/hook";
import { potvrd } from "@/lib/potvrdenie";
import { useZatvorNaEscape } from "@/hooks/useZatvorNaEscape";
import { najdiOkraje, STRANA_DETEKCIE, zvacsiRohy } from "@/lib/mobile/okraje-dokladu";
import type { Rohy } from "@/lib/mobile/perspektiva";
import {
  dalsiObrys,
  PRAZDNY_OBRYS,
  vyberRohyFotky,
  type StavObrysu,
  type Vzorka,
} from "@/lib/mobile/orez-dokladu";
import {
  registrujKameruDokladu,
  type VysledokKamery,
  type ZiadostKamery,
} from "@/lib/mobile/kamera-dokladu";
import { useKameraQr } from "./KameraQr";
import { UpravaDokladu, type Snimka } from "./UpravaDokladu";

/*
  Kamera dokladu — to, z čoho sa skladá fotenie v appke.

  - `odfotZVidea` vezme snímku priamo z bežiaceho videa v plnom rozlíšení
    prúdu. Žiadna druhá kamera, žiadne čakanie na fotoaparát.
  - `useObrysDokladu` počas mierenia raz za 300 ms nájde na zmenšenom rámci
    doklad a `ObrysDokladu` ho nakreslí cez video. Rohy sa vyhladzujú cez
    viac rámcov (`orez-dokladu.ts`), aby obrys neposkakoval.
  - `useSnimanie` drží odfotené strany a otvára „Upraviť doklad". Rohy pre
    fotku sa hľadajú znova na nej v ostrejšom rozlíšení; živý obrys je len
    záloha.
  - `KameraDokladuHost` je tá istá kamera na celú obrazovku pre miesta mimo
    skenera (dávka, „Pridať stranu", prefotenie fotky) — otvára ju
    `zachytStrany` cez `kamera-dokladu.ts`.
*/

/** Snímka z videa v plnom rozlíšení. `null`, keď video ešte nemá obraz. */
export function odfotZVidea(video: HTMLVideoElement | null): HTMLCanvasElement | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const c = document.createElement("canvas");
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, c.width, c.height);
  return c;
}

/** Na akú dlhšiu stranu sa zmenší odfotená snímka pred hľadaním okrajov. */
export const STRANA_FOTKY = 640;

/**
 * Zmenší zdroj na `strana` px (živý obraz ~320, fotka 640) a nájde na ňom
 * doklad; rohy sú v pixeloch zdroja.
 */
export function hladajOkraje(
  zdroj: CanvasImageSource,
  sirka: number,
  vyska: number,
  pomocne?: HTMLCanvasElement,
  strana = STRANA_DETEKCIE,
): Rohy | null {
  if (!sirka || !vyska) return null;
  const k = Math.min(1, strana / Math.max(sirka, vyska));
  const c = pomocne ?? document.createElement("canvas");
  c.width = Math.max(1, Math.round(sirka * k));
  c.height = Math.max(1, Math.round(vyska * k));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  // Zmenšenie zo 1920 px bez vyhladenia zrní a okraje papiera by trhalo.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(zdroj, 0, 0, c.width, c.height);
  const rohy = najdiOkraje(ctx.getImageData(0, 0, c.width, c.height));
  return rohy ? zvacsiRohy(rohy, sirka / c.width) : null;
}

export type Obrys = Vzorka;

/**
 * Živý obrys dokladu. Rohy sú medián z posledných rámcov a drobný posun sa
 * neprejaví — obrys stojí, kým sa ruka len trasie, a pri naozajstnom pohybe
 * skočí hneď. Jeden prázdny rámec obrys ešte nezhasne, až dva za sebou
 * (`dalsiObrys` v `orez-dokladu.ts`).
 */
export function useObrysDokladu(videoRef: RefObject<HTMLVideoElement | null>, aktivne: boolean) {
  const [obrys, setObrys] = useState<Obrys | null>(null);
  useEffect(() => {
    if (!aktivne) {
      setObrys(null);
      return;
    }
    const pomocne = document.createElement("canvas");
    let stav: StavObrysu = PRAZDNY_OBRYS;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.videoWidth || v.readyState < 2) return;
      let rohy: Rohy | null = null;
      try {
        rohy = hladajOkraje(v, v.videoWidth, v.videoHeight, pomocne);
      } catch {
        rohy = null;
      }
      const pred = stav;
      stav = dalsiObrys(stav, rohy ? { rohy, sirka: v.videoWidth, vyska: v.videoHeight } : null);
      // Prázdny rámec, po ktorom obrys ešte svieti, nič neprekresľuje.
      if (stav.zobrazene !== pred.zobrazene) setObrys(stav.zobrazene);
    }, 300);
    return () => window.clearInterval(id);
  }, [aktivne, videoRef]);
  return obrys;
}

/**
 * Obrys cez video. `preserveAspectRatio="xMidYMid slice"` orezáva presne ako
 * `object-cover` na videu, takže rohy v pixeloch videa sedia na obraz.
 */
export function ObrysDokladu({ obrys }: { obrys: Obrys | null }) {
  if (!obrys) return null;
  return (
    <svg
      aria-hidden
      data-obrys-dokladu
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${obrys.sirka} ${obrys.vyska}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <polygon
        points={obrys.rohy.map((b) => `${b.x},${b.y}`).join(" ")}
        fill="var(--app-zelena)"
        fillOpacity={0.22}
        stroke="var(--app-zelena)"
        strokeWidth={Math.max(obrys.sirka, obrys.vyska) / 200}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Odfotené strany a otvorená úprava. Spoločné pre skener aj kameru na celú
 * obrazovku, aby sa správali rovnako.
 */
export function useSnimanie() {
  const [strany, setStrany] = useState<string[]>([]);
  const [snimka, setSnimka] = useState<Snimka | null>(null);

  /**
   * Odfotí z videa a otvorí „Upraviť doklad". `false`, keď video nemá obraz.
   *
   * Doklad sa hľadá znova na fotke — najprv ostrejšie (640 px), potom ako
   * pri mierení (320 px). Živý obrys `obrys` je záloha, keď fotka nedá nič.
   * Malý okraj, aby orez neodrezal kraj papiera, pridáva už `najdiOkraje`.
   * Keď sa nenájde nič, ostane `null` a úprava ukáže celý záber.
   */
  function odfot(video: HTMLVideoElement | null, obrys?: Obrys | null): boolean {
    const platno = odfotZVidea(video);
    if (!platno) return false;
    const { width: w, height: h } = platno;
    const rohy = vyberRohyFotky(
      [() => hladajOkraje(platno, w, h, undefined, STRANA_FOTKY), () => hladajOkraje(platno, w, h)],
      obrys ?? null,
      w,
      h,
    );
    setSnimka({ platno, sirka: w, vyska: h, rohy });
    return true;
  }

  return {
    strany,
    snimka,
    odfot,
    /** Upravená strana ide do zoznamu, kamera sa vráti na mierenie. */
    pridaj(s: string) {
      setStrany((p) => [...p, s]);
      setSnimka(null);
    },
    zahodSnimku: () => setSnimka(null),
    vynuluj() {
      setStrany([]);
      setSnimka(null);
    },
  };
}

/**
 * Kamera dokladu na celú obrazovku. Prihlási sa v `kamera-dokladu.ts` a
 * ukáže sa, keď niekto zavolá `zachytStrany` (dávka, „Pridať stranu",
 * prefotenie fotky pri bločku). QR sa tu nečíta — sem sa ide fotiť.
 */
export function KameraDokladuHost() {
  const [ziadost, setZiadost] = useState<
    (ZiadostKamery & { vyries: (v: VysledokKamery) => void }) | null
  >(null);

  useEffect(() => {
    registrujKameruDokladu(
      (z) =>
        new Promise<VysledokKamery>((vyries) => {
          setZiadost((p) => {
            // Dve žiadosti naraz nebývajú; staršia sa radšej zruší, než by visela.
            p?.vyries({ stav: "zrusene" });
            return { ...z, vyries };
          });
        }),
    );
    return () => registrujKameruDokladu(null);
  }, []);

  if (!ziadost) return null;
  return (
    <KameraNaCeluObrazovku
      ziadost={ziadost}
      onKoniec={(v) => {
        ziadost.vyries(v);
        setZiadost(null);
      }}
    />
  );
}

function KameraNaCeluObrazovku({
  ziadost,
  onKoniec,
}: {
  ziadost: ZiadostKamery;
  onKoniec: (v: VysledokKamery) => void;
}) {
  const { t, mnozne } = usePreklad();
  const sn = useSnimanie();
  const { videoRef, chyba, bezi } = useKameraQr({
    onNajdene: () => {},
    citajQr: false,
    naFotenie: true,
  });
  const obrys = useObrysDokladu(videoRef, bezi && !sn.snimka);
  const viacStran = !ziadost.jednaStrana;

  // Kamera nejde — volajúci siahne po fotoaparáte / výbere súboru.
  useEffect(() => {
    if (chyba) onKoniec({ stav: "nedostupna" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chyba]);

  async function zrus() {
    if (sn.strany.length) {
      const ano = await potvrd(t("kamera.zahoditStrany", { pocet: sn.strany.length }), {
        potvrdit: t("kamera.zahodit"),
        zrusit: t("spolocne.zrusit"),
        nebezpecne: true,
      });
      if (!ano) return;
    }
    onKoniec({ stav: "zrusene" });
  }
  useZatvorNaEscape(sn.snimka ? null : () => void zrus());

  const tvary = ziadost.davka
    ? { one: t("uprava.doklad1"), few: t("uprava.doklad2"), other: t("uprava.doklad5") }
    : { one: t("uprava.strana1"), few: t("uprava.strana2"), other: t("uprava.strana5") };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("kamera.nazov")}
      className="fixed inset-0 z-[70] flex flex-col bg-black text-white"
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
      />
      <ObrysDokladu obrys={obrys} />

      <div
        className="relative flex shrink-0 items-center justify-between px-3"
        style={{ paddingTop: "calc(var(--safe-top) + 0.5rem)" }}
      >
        <button
          onClick={() => void zrus()}
          aria-label={t("kamera.zrusit")}
          className="grid h-11 w-11 place-items-center rounded-full bg-black/50"
        >
          <X className="h-5 w-5" />
        </button>
        {viacStran && sn.strany.length > 0 && (
          <span className="rounded-full bg-black/60 px-3 py-1.5 text-[13px] font-medium">
            {`${sn.strany.length} ${mnozne(sn.strany.length, tvary)}`}
          </span>
        )}
      </div>

      <div className="flex-1" />

      <div
        className="relative grid shrink-0 grid-cols-3 items-center bg-gradient-to-t from-black/85 to-transparent px-4 pt-8"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}
      >
        <div />
        <div className="flex justify-center">
          <button
            onClick={() => sn.odfot(videoRef.current, obrys)}
            aria-label={t("sken.odfotit")}
            disabled={!bezi}
            className="grid h-[72px] w-[72px] place-items-center rounded-full border-[3px] border-white bg-app-zelena-plocha transition active:scale-95 disabled:opacity-50"
          />
        </div>
        <div className="flex justify-end">
          {viacStran && sn.strany.length > 0 && (
            <button
              onClick={() => onKoniec({ stav: "ok", strany: sn.strany })}
              className="min-h-[44px] rounded-full bg-white px-3 text-[13px] font-semibold text-black"
            >
              {t("uprava.hotovo", { pocet: sn.strany.length })}
            </button>
          )}
        </div>
      </div>

      {sn.snimka && (
        <UpravaDokladu
          snimka={sn.snimka}
          strana={sn.strany.length + 1}
          odfotenych={sn.strany.length}
          viacStran={viacStran}
          davka={ziadost.davka}
          onZnova={sn.zahodSnimku}
          onPridatStranu={sn.pridaj}
          onUlozit={(s) => onKoniec({ stav: "ok", strany: [...sn.strany, s] })}
        />
      )}
    </div>
  );
}
