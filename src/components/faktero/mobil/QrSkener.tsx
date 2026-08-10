import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Živý skener QR kódu priamo v stránke.
 *
 * Natívny skener (ML Kit) sa na iOS nedá použiť: ten plugin existuje len pre
 * CocoaPods, kým projekt je postavený cez Swift Package Manager — v appke by
 * teda vôbec nebol a tlačidlo by hlásilo „skener nie je dostupný". Kamera cez
 * `getUserMedia` funguje vo WKWebView od iOS 14.3 a kód sa číta rovnakou
 * knižnicou ako z fotky, takže výsledok je ten istý.
 */
export function QrSkener({
  onNajdene,
  onZrusit,
}: {
  onNajdene: (raw: string) => void;
  onZrusit: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let bezi = true;
    let timer: number | undefined;

    (async () => {
      try {
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

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const { default: jsQR } = await import("jsqr");

        const krok = async () => {
          if (!bezi || !ctx || !videoRef.current) return;
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
              bezi = false;
              onNajdene(kod.data);
              return;
            }
          }
          timer = window.setTimeout(krok, 120);
        };
        krok();
      } catch (e: any) {
        setChyba(
          e?.name === "NotAllowedError"
            ? "Prístup ku kamere je zamietnutý. Povoľte ho v nastaveniach telefónu."
            : "Kameru sa nepodarilo spustiť. Skúste doklad odfotiť.",
        );
      }
    })();

    return () => {
      bezi = false;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onNajdene]);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

      {/* Rámik, kam mieriť. Bez neho ľudia mieria na celý bloček. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-56 w-56 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>

      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <span className="text-sm font-medium text-white">Namierte na QR kód</span>
        <button
          onClick={onZrusit}
          aria-label="Zrušiť skenovanie"
          className="rounded-full bg-white/20 p-2 text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {chyba && (
        <div
          className="absolute inset-x-0 bottom-0 bg-card p-4 text-sm"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <p className="mb-3">{chyba}</p>
          <button
            onClick={onZrusit}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm"
          >
            Späť
          </button>
        </div>
      )}
    </div>
  );
}
