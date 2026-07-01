/**
 * QR skener pre pokladničné bloky.
 * - Natívne (iOS/Android): @capacitor-mlkit/barcode-scanning (moderný ML Kit).
 * - Web: BarcodeDetector API tam, kde je dostupné (Chrome/Edge/Android).
 *   Ako fallback vráti null a používateľ použije foto + AI OCR.
 */
export type QrScanResult = { raw: string } | null;

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
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
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
