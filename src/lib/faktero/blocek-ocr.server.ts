/**
 * Vyčítanie bločku z fotky.
 *
 * Používa sa až vtedy, keď doklad nemá čitateľný QR kód — je to odhad, nie
 * úradný údaj. Preto tu nič nepadá: keď model vráti nezmysel, funkcia vráti
 * `null` a stránka povie, že sa nepodarilo prečítať nič.
 */
import { odpovedNaJson } from "./json-odpoved";

export type OcrBlocek = {
  supplier?: string | null;
  ico?: string | null;
  ic_dph?: string | null;
  total?: number | null;
  vat_amount?: number | null;
  vat_rate?: number | null;
  currency?: string | null;
  date?: string | null;
  document_number?: string | null;
  items?: Array<{ name: string; quantity: number; unit_price: number; vat_rate: number }>;
};

const PROMPT = `Si OCR asistent pre slovenské pokladničné bločky a faktúry. Z dokladu prečítaj údaje.
Doklad môže mať viac strán — položky pozbieraj zo všetkých a sumy vezmi z tej, kde je celkový súčet.
Sadzby DPH na Slovensku sú 23, 19, 5 alebo 0 percent — inú nevracaj.
Dátum vráť tak, ako je na doklade, vo formáte YYYY-MM-DD.
Keď údaj na doklade nie je, daj null; nič si nevymýšľaj.
Vráť VÝHRADNE JSON bez sprievodného textu:
{"supplier":string|null,"ico":string|null,"ic_dph":string|null,"total":number|null,"vat_amount":number|null,"vat_rate":23|19|5|0|null,"currency":"EUR","date":"YYYY-MM-DD"|null,"document_number":string|null,"items":[{"name":string,"quantity":number,"unit_price":number,"vat_rate":23|19|5|0}]}`;

export async function ocrBlocek(imageDataUrl: string): Promise<OcrBlocek | null> {
  const jePdf = imageDataUrl.startsWith("data:application/pdf");
  if (!imageDataUrl.startsWith("data:image/") && !jePdf) return null;

  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!geminiKey && !openaiKey) throw new Error("Čítanie z dokladu nie je nastavené.");
  // PDF (aj viacstranové) číta Gemini priamo; obrázkový vstup OpenAI ho nezoberie.
  if (jePdf && !geminiKey) throw new Error("Čítanie PDF nie je na tomto serveri dostupné.");

  let text = "";
  if (geminiKey) {
    const { splitDataUrl } = await import("./gemini.server");
    const { aiVision } = await import("./ai.server");
    const { base64, mimeType } = splitDataUrl(
      imageDataUrl,
      jePdf ? "application/pdf" : "image/jpeg",
    );
    text = await aiVision(base64, mimeType, PROMPT);
  } else {
    const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Prečítaj údaje z tohto dokladu." },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`Čítanie z fotky zlyhalo (${res.status}).`);
    const json: any = await res.json();
    text = json?.choices?.[0]?.message?.content ?? "";
  }

  const parsed = odpovedNaJson<OcrBlocek>(text);
  if (!parsed) return null;

  // Prázdna odpoveď vyzerá ako úspech, ale nie je — stránka by ukázala samé
  // pomlčky a používateľ by nevedel, či sa niečo pokazilo.
  const maNieco =
    parsed.total != null ||
    (parsed.supplier ?? "").trim() !== "" ||
    (Array.isArray(parsed.items) && parsed.items.length > 0);
  return maNieco ? parsed : null;
}
