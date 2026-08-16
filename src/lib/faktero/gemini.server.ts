// Gemini vision cez generateContent API (podporuje obrázky aj PDF ako inline_data).
// Vracia text odpovede; volajúci ho prečíta cez `odpovedNaJson`, lebo model
// rád zabalí JSON do bloku so spätnými apostrofmi.
export async function geminiVision(
  base64: string,
  mimeType: string,
  prompt: string,
  nastavenie?: {
    /** Strop odpovede. Dlhý splátkový kalendár sa do predvoleného nezmestí. */
    maxOutputTokens?: number;
    /** Vypýta si čistý JSON, takže odpoveď nechodí zabalená v apostrofoch. */
    json?: boolean;
  },
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY nie je nastavený");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }],
          },
        ],
        ...(nastavenie
          ? {
              generationConfig: {
                temperature: 0,
                ...(nastavenie.maxOutputTokens
                  ? { maxOutputTokens: nastavenie.maxOutputTokens }
                  : {}),
                ...(nastavenie.json ? { responseMimeType: "application/json" } : {}),
              },
            }
          : {}),
      }),
      signal: controller.signal,
    },
  );

  clearTimeout(timeout);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  /*
   * Odrezanú odpoveď treba povedať nahlas. Pri dlhom splátkovom kalendári sa
   * JSON nedopíše do konca, ticho sa neprečíta a volajúci to vidí ako
   * „v dokumente nič nebolo“ — pritom tam bolo, len sa nezmestilo.
   */
  const dovod = data.candidates?.[0]?.finishReason;
  if (dovod === "MAX_TOKENS") {
    throw new Error("Odpoveď modelu sa nezmestila — dokument je príliš dlhý, rozdeľte ho.");
  }
  // Modely s uvažovaním vracajú viac častí a odpoveď nemusí byť tá prvá —
  // `parts[0].text` z nich vytiahne prázdno alebo úvahu namiesto výsledku.
  const parts = data.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p: any) => typeof p?.text === "string" && !p?.thought)
    .map((p: any) => p.text)
    .join("")
    .trim();
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
