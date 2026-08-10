/**
 * QR skener pre pokladničné bloky.
 * - Natívne (iOS/Android): @capacitor-mlkit/barcode-scanning (moderný ML Kit).
 * - Web: BarcodeDetector API tam, kde je dostupné (Chrome/Edge/Android).
 *   Ako fallback vráti null a používateľ použije foto + AI OCR.
 */
export type QrScanResult = { raw: string } | null;

/**
 * QR kód z už odfotenej snímky.
 *
 * Skener dokladov posielal fotku rovno do OCR a QR na bločku si nikdy
 * nevšimol — pritom práve v ňom je identifikátor, pod ktorým Finančná správa
 * vydá celý doklad. Čítať sa dá bez ďalšej knižnice: natívne cez ML Kit, na
 * webe cez `BarcodeDetector`. Kde ani jedno nie je (Safari, Firefox), vráti sa
 * `null` a doklad sa prečíta z fotky.
 */
export async function scanQrFromImage(dataUrl: string): Promise<QrScanResult> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
      const { barcodes } = await BarcodeScanner.readBarcodesFromImage({
        path: dataUrl,
        formats: [],
      });
      const first = barcodes?.[0]?.rawValue;
      if (first) return { raw: first };
    }
  } catch {
    /* natívne čítanie nie je dostupné — nižšie web */
  }

  const BD = (globalThis as any).BarcodeDetector;
  if (BD) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const bitmap = await createImageBitmap(blob);
      const detector = new BD({ formats: ["qr_code"] });
      const codes = await detector.detect(bitmap);
      bitmap.close?.();
      const raw = codes?.[0]?.rawValue;
      if (raw) return { raw };
    } catch {
      /* skúsi sa čítanie nižšie */
    }
  }

  /*
   * `BarcodeDetector` na iPhone ani vo Firefoxe nie je — a bločky ľudia
   * skenujú práve telefónom. Preto sa QR číta aj bez neho, z obrazových bodov.
   */
  try {
    const obrazok = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("obrázok sa nedá načítať"));
      img.src = dataUrl;
    });
    // Veľké fotky sa zmenšujú — čítanie je potom rýchlejšie a QR na bločku
    // ostáva čitateľné aj na dlhšej strane okolo 1600 bodov.
    const mierka = Math.min(1, 1600 / Math.max(obrazok.width, obrazok.height));
    const w = Math.max(1, Math.round(obrazok.width * mierka));
    const h = Math.max(1, Math.round(obrazok.height * mierka));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(obrazok, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const { default: jsQR } = await import("jsqr");
    const kod = jsQR(data.data, w, h, { inversionAttempts: "attemptBoth" });
    return kod?.data ? { raw: kod.data } : null;
  } catch {
    return null;
  }
}

export async function scanQrCode(): Promise<QrScanResult> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
      const perm = await BarcodeScanner.requestPermissions();
      if (perm.camera !== "granted" && perm.camera !== "limited") return null;
      const { barcodes } = await BarcodeScanner.scan();
      const first = barcodes?.[0];
      return first?.rawValue ? { raw: first.rawValue } : null;
    }
  } catch {
    /* fallthrough to web */
  }

  // Web fallback — BarcodeDetector (Chrome/Edge/Android)
  const BD = (globalThis as any).BarcodeDetector;
  if (!BD) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    const detector = new BD({ formats: ["qr_code"] });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const codes = await detector.detect(video);
      if (codes?.[0]?.rawValue) {
        stream.getTracks().forEach((t) => t.stop());
        return { raw: codes[0].rawValue };
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    return null;
  }
  return null;
}
