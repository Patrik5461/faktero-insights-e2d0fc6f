/**
 * Skener dokladov: kamera → base64 JPEG → OpenAI Vision parser.
 * Na webe používa file input (fallback). Na natívnych zariadeniach Capacitor Camera.
 */
import { supabase } from "@/integrations/supabase/client";

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

/**
 * Pošle obrázok do OpenAI Vision a vráti extrahované polia faktúry/dokladu.
 * Volá rovnaký endpoint ako aiParseInvoiceFn — len s vision payloadom.
 */
export async function parseReceiptImage(dataUrl: string): Promise<{
  supplier?: string;
  total?: number;
  vat_rate?: number;
  currency?: string;
  date?: string;
  items?: Array<{ name: string; quantity: number; unit_price: number; vat_rate: number }>;
}> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const res = await fetch("/api/v1/ai/parse-receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
    body: JSON.stringify({ image_data_url: dataUrl }),
  });
  if (!res.ok) throw new Error(`Parse error ${res.status}`);
  return res.json();
}
