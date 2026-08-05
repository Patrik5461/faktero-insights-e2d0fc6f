import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ReceiptResult = {
  supplier?: string;
  total?: number;
  vat_rate?: number;
  currency?: string;
  date?: string;
  items?: Array<{ name: string; quantity: number; unit_price: number; vat_rate: number }>;
};

export const aiParseReceiptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { image_data_url: string }) => input)
  .handler(async ({ data }): Promise<ReceiptResult> => {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!geminiKey && !openaiKey) throw new Error("AI funkcie nedostupné");
    if (!data.image_data_url?.startsWith("data:image/")) throw new Error("Neplatný obrázok");

    const prompt = `Si OCR asistent pre slovenské bločky a faktúry. Z fotky extrahuj polia.
Vráť VÝHRADNE JSON (žiadny markdown, žiadne backticky):
{"supplier":string|null,"total":number|null,"vat_rate":0|5|19|23|null,"currency":"EUR","date":"YYYY-MM-DD"|null,"items":[{"name":string,"quantity":number,"unit_price":number,"vat_rate":0|5|19|23}]}`;

    let content = "{}";

    if (geminiKey) {
      const { geminiVision, splitDataUrl } = await import("./gemini.server");
      const { base64, mimeType } = splitDataUrl(data.image_data_url, "image/jpeg");
      content = await geminiVision(base64, mimeType, prompt);
    } else {
      const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: prompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Extrahuj údaje z tohto bločka/faktúry." },
                { type: "image_url", image_url: { url: data.image_data_url } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`OpenAI: ${res.status} ${t.slice(0, 200)}`);
      }
      const json: any = await res.json();
      content = json?.choices?.[0]?.message?.content ?? "{}";
    }
    try {
      return JSON.parse(content);
    } catch {
      return {};
    }
  });
