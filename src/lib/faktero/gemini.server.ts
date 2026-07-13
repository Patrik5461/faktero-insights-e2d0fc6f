// Gemini vision/text client for OCR/vision tasks.
// Uses Interactions API (gemini-3.5-flash) via generativelanguage.googleapis.com.

const SUPPORTED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
]);

function isSupportedImageMime(mimeType: string): boolean {
  return SUPPORTED_IMAGE_MIME.has(mimeType.toLowerCase());
}

async function callInteractions(input: any[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY nie je nastavený");

  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      "Api-Revision": "2026-05-20",
    },
    body: JSON.stringify({ model: "gemini-3.5-flash", input }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  return data.output_text ?? "[]";
}

/**
 * Pošle obrázok + prompt ako inline image do Interactions API.
 * Podporované: image/png, image/jpeg, image/webp, image/gif, image/bmp, image/tiff.
 */
async function geminiVision(base64: string, mimeType: string, prompt: string): Promise<string> {
  if (!isSupportedImageMime(mimeType)) {
    throw new Error(`Gemini vision: nepodporovaný mime_type "${mimeType}" (podporované: ${[...SUPPORTED_IMAGE_MIME].join(", ")})`);
  }
  return callInteractions([
    { type: "text", text: prompt },
    { type: "image", data: base64, mime_type: mimeType },
  ]);
}

/**
 * Text-only prompt (pre PDF text alebo iné textové vstupy).
 */
async function geminiText(prompt: string): Promise<string> {
  return callInteractions([{ type: "text", text: prompt }]);
}

/**
 * Extrahuje text zo všetkých strán PDF (base64) pomocou unpdf (Worker-safe).
 */
async function extractPdfText(base64: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const pdf = await getDocumentProxy(bin);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

/**
 * Rozdelí data URL na base64 payload a mime type.
 * "data:image/png;base64,AAAA..." → { base64: "AAAA...", mimeType: "image/png" }
 */
function splitDataUrl(dataUrl: string, fallbackMime?: string): { base64: string; mimeType: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (m) return { mimeType: m[1], base64: m[2] };
  return { mimeType: fallbackMime ?? "application/octet-stream", base64: dataUrl };
}

export { geminiVision, geminiText, extractPdfText, splitDataUrl, isSupportedImageMime };
