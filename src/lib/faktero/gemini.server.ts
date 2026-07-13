// Gemini vision client via oficiálny @google/genai SDK.
// Podporuje inline obrázky aj PDF (application/pdf) — SDK to spracuje interne.
import { GoogleGenAI } from "@google/genai";

export async function geminiVision(
  base64: string,
  mimeType: string,
  prompt: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY nie je nastavený");

  const ai = new GoogleGenAI({ apiKey });

  const interaction = await (ai as any).interactions.create({
    model: "gemini-3.5-flash",
    input: [
      { text: prompt },
      { inlineData: { mimeType, data: base64 } },
    ],
  });

  return (interaction as any).output_text ?? "[]";
}

/**
 * Rozdelí data URL na base64 payload a mime type.
 * "data:image/png;base64,AAAA..." → { base64: "AAAA...", mimeType: "image/png" }
 */
export function splitDataUrl(
  dataUrl: string,
  fallbackMime?: string,
): { base64: string; mimeType: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (m) return { mimeType: m[1], base64: m[2] };
  return { mimeType: fallbackMime ?? "application/octet-stream", base64: dataUrl };
}
