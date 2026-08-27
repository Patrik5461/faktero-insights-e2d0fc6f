import { X } from "lucide-react";
import { useKameraQr } from "./KameraQr";

import { usePreklad } from "@/lib/mobile/preklady/hook";
/**
 * Živý skener QR kódu na celú obrazovku.
 *
 * Otvára sa vtedy, keď človek skenuje z inej obrazovky než z úvodnej (napríklad
 * z viacstranového dokladu). Samotnú kameru aj čítanie kódu vlastní
 * {@link useKameraQr} — spoločne s úvodným skenerom, aby v appke nebežali dva
 * nezávislé prúdy z kamery.
 */
export function QrSkener({
  onNajdene,
  onZrusit,
}: {
  onNajdene: (raw: string) => void;
  onZrusit: () => void;
}) {
  const { t } = usePreklad();
  const { videoRef, chyba } = useKameraQr({ onNajdene });

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

      {/* Rámik, kam mieriť. Bez neho ľudia mieria na celý bloček. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-56 w-56 rounded-app border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>

      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3"
        style={{ paddingTop: "calc(var(--safe-top) + 0.75rem)" }}
      >
        <span className="text-sm font-medium text-white">{t("qr.namierte")}</span>
        <button
          onClick={onZrusit}
          aria-label={t("qr.zrusitSkenovanie")}
          className="rounded-full bg-white/20 p-2 text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {chyba && (
        <div
          className="absolute inset-x-0 bottom-0 bg-app-karta p-4 text-sm"
          style={{ paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}
        >
          <p className="mb-3">{chyba}</p>
          <button
            onClick={onZrusit}
            className="w-full rounded-app-sm border border-app-ramik px-4 py-2.5 text-sm"
          >
            {t("spolocne.spat")}
          </button>
        </div>
      )}
    </div>
  );
}
