/**
 * Odfotenie dokladu: kamera → base64 JPEG.
 * Natívne cez Capacitor Camera, na webe cez `input[type=file]` s kamerou.
 * Prečítanie údajov robí `blocek.functions` — tu ide len o snímku.
 */
export type ReceiptCapture = { dataUrl: string; mimeType: string };

export async function captureReceipt(): Promise<ReceiptCapture | null> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        quality: 75,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        correctOrientation: true,
      });
      if (!photo.dataUrl) return null;
      return { dataUrl: photo.dataUrl, mimeType: `image/${photo.format || "jpeg"}` };
    }
  } catch {
    // natívna kamera nie je dostupná — nižšie nasleduje webový fallback
  }
  // Web fallback — file input
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    (input as any).capture = "environment";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve({ dataUrl: String(r.result), mimeType: f.type || "image/jpeg" });
      r.onerror = () => resolve(null);
      r.readAsDataURL(f);
    };
    input.click();
  });
}
