// Gemini vision client for OCR/vision tasks.
// Uses gemini-2.5-flash via generativelanguage.googleapis.com.

async function geminiVision(
  base64: string,
  mimeType: string,
  prompt: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY nie je nastavený");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8000,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }

  const data: any = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
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

export { geminiVision, splitDataUrl };
