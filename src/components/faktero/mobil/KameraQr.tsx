import { useEffect, useRef, useState } from "react";

import { usePreklad } from "@/lib/mobile/preklady/hook";
import { oznacStavKamery } from "@/lib/mobile/kamera-dokladu";

/**
 * Zadná kamera v najvyššom rozlíšení, aké telefón dá. Z toho istého prúdu sa
 * fotí aj doklad (`odfotZVidea`), takže rozlíšenie prúdu je rozlíšenie fotky.
 * `ideal` nič nevynucuje — slabší telefón dá menej a nezlyhá.
 */
export const OBRAZ_KAMERY: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 3840 },
  height: { ideal: 2160 },
};

/**
 * Kamera, ktorá číta QR kód.
 *
 * Vytiahnuté z `QrSkener`, lebo to isté potrebuje aj úvodná obrazovka skenera —
 * a dva vlastné `getUserMedia` v jednej appke znamenajú dva prúdy z kamery a
 * dve miesta, kde sa dá zabudnúť ho zastaviť.
 *
 * Natívny skener (ML Kit) sa na iOS použiť nedá: ten plugin existuje len pre
 * CocoaPods, kým projekt stojí na Swift Package Manageri. Kamera cez
 * `getUserMedia` vo WKWebView funguje od iOS 14.3 a kód sa číta tou istou
 * knižnicou ako z fotky, takže výsledok je rovnaký.
 */
export function useKameraQr({
  onNajdene,
  aktivne = true,
  citajQr = true,
  naFotenie = false,
  prijmi,
}: {
  onNajdene: (raw: string) => void;
  /**
   * Ktorý kód stojí za to odovzdať. Iný (napr. platobný QR na faktúre pred
   * skenerom bločkov) sa prejde a číta sa ďalej — doklad sa potom odfotí.
   */
  prijmi?: (raw: string) => boolean;
  /** Kým je `false`, kamera nebeží — nesvieti kontrolka a nežerie batériu. */
  aktivne?: boolean;
  /**
   * Kým je `false`, obraz beží, ale QR sa nečíta — napr. kým je otvorená
   * „Upraviť doklad". Cez odkaz, aby sa kamera kvôli tomu nereštartovala.
   */
  citajQr?: boolean;
  /** Z prúdu sa bude fotiť doklad — pýtame si najvyššie rozlíšenie. */
  naFotenie?: boolean;
}) {
  const { t } = usePreklad();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [bezi, setBezi] = useState(false);
  /*
    Cez odkaz, nie cez závislosť efektu: keby sa kamera reštartovala pri každom
    prekreslení rodiča, obraz by preblikával a povolenie by sa pýtalo dokola.
  */
  const posledny = useRef(onNajdene);
  posledny.current = onNajdene;
  const citajRef = useRef(citajQr);
  citajRef.current = citajQr;
  const prijmiRef = useRef(prijmi);
  prijmiRef.current = prijmi;

  useEffect(() => {
    if (!aktivne) return;
    let stream: MediaStream | null = null;
    let citaj = true;
    let timer: number | undefined;

    (async () => {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices) {
          throw Object.assign(new Error("bez kamery"), { name: "NotFoundError" });
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: naFotenie ? OBRAZ_KAMERY : { facingMode: { ideal: "environment" } },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        oznacStavKamery(true);
        video.srcObject = stream;
        // Bez `playsinline` prehrá iOS video na celú obrazovku vo vlastnom
        // prehrávači a zo skenera nezostane nič.
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play();
        setChyba(null);
        setBezi(true);

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const { default: jsQR } = await import("jsqr");

        const krok = async () => {
          if (!citaj || !ctx || !videoRef.current) return;
          const v = videoRef.current;
          if (v.videoWidth > 0 && citajRef.current) {
            /*
              Čítame zmenšený obraz — na QR to stačí a telefón sa nezadýcha.
              Prúd je teraz vo vysokom rozlíšení kvôli fotke dokladu, preto
              o kúsok väčší rámec než kedysi (800): kód na bločku je malý.
              Pri bežnom prúde (640–1280 px) to vyjde na plné rozlíšenie.
            */
            const mierka = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight));
            canvas.width = Math.round(v.videoWidth * mierka);
            canvas.height = Math.round(v.videoHeight * mierka);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const kod = jsQR(data.data, canvas.width, canvas.height, {
              inversionAttempts: "attemptBoth",
            });
            if (kod?.data && (!prijmiRef.current || prijmiRef.current(kod.data))) {
              citaj = false;
              posledny.current(kod.data);
              return;
            }
          }
          timer = window.setTimeout(krok, 120);
        };
        void krok();
      } catch (e: any) {
        setBezi(false);
        // Ďalšie fotenie dokladu pôjde rovno cez fotoaparát / výber súboru.
        oznacStavKamery(false);
        setChyba(
          e?.name === "NotAllowedError"
            ? t("qr.kameraZamietnuta")
            : t("qr.kameraNejde"),
        );
      }
    })();

    return () => {
      citaj = false;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      setBezi(false);
    };
  }, [aktivne]);

  return { videoRef, chyba, bezi };
}
