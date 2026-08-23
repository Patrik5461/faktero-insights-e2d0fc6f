import { useEffect, useRef, useState } from "react";

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
}: {
  onNajdene: (raw: string) => void;
  /** Kým je `false`, kamera nebeží — nesvieti kontrolka a nežerie batériu. */
  aktivne?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [bezi, setBezi] = useState(false);
  /*
    Cez odkaz, nie cez závislosť efektu: keby sa kamera reštartovala pri každom
    prekreslení rodiča, obraz by preblikával a povolenie by sa pýtalo dokola.
  */
  const posledny = useRef(onNajdene);
  posledny.current = onNajdene;

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
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
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
          if (v.videoWidth > 0) {
            // Čítame zmenšený obraz — na QR to stačí a telefón sa nezadýcha.
            const mierka = Math.min(1, 800 / Math.max(v.videoWidth, v.videoHeight));
            canvas.width = Math.round(v.videoWidth * mierka);
            canvas.height = Math.round(v.videoHeight * mierka);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const kod = jsQR(data.data, canvas.width, canvas.height, {
              inversionAttempts: "attemptBoth",
            });
            if (kod?.data) {
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
        setChyba(
          e?.name === "NotAllowedError"
            ? "Prístup ku kamere je zamietnutý. Povoľte ho v nastaveniach telefónu."
            : "Kameru sa nepodarilo spustiť. Skúste doklad odfotiť.",
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
