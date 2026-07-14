// Gemini vision client via oficiálny @google/genai SDK (flat input array format).
import { GoogleGenAI } from "@google/genai";

export async function geminiVision(
  base64: string,
  mimeType: string,
  prompt: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY nie je nastavený");

  const client = new GoogleGenAI({ apiKey });

  const interaction = await client.interactions.create({
    model: "gemini-3.5-flash",
    input: [
      { type: "text", text: prompt },
      { type: "image", data: base64, mime_type: mimeType },
    ],
  });

  const lastStep = interaction.steps?.at(-1);
  const contentArray = (lastStep as { content?: Array<{ text?: string }> } | undefined)?.content;
  return contentArray?.[0]?.text ?? "[]";
}

/**
 * Pre PDF (a iné súbory nepodporované ako inline data) — nahrá súbor cez Files API
 * a odošle referenciu na uploadovaný file URI.
 */
export async function geminiVisionFile(
  base64: string,
  mimeType: string,
  prompt: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY nie je nastavený");

  const client = new GoogleGenAI({ apiKey });

  const buffer = Buffer.from(base64, "base64");
  const blob = new Blob([buffer], { type: mimeType });

  const uploadedFile = await (client as any).files.upload({
    file: blob,
    config: { mimeType },
  });

  const interaction = await (client as any).interactions.create({
    model: "gemini-3.5-flash",
    input: [
      { type: "text", text: prompt },
      {
        type: "image",
        uri: uploadedFile.uri,
        mime_type: uploadedFile.mimeType ?? mimeType,
      },
    ],
  });

  const lastStep = interaction.steps?.at(-1);
  const contentArray = (lastStep as { content?: Array<{ text?: string }> } | undefined)?.content;
  return contentArray?.[0]?.text ?? "[]";
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
