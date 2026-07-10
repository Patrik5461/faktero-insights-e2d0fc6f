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
  .inputValidator((input: { image_data_url: string }) => input)
  .handler(async ({ data }): Promise<ReceiptResult> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("AI funkcie nedostupné");
    if (!data.image_data_url?.startsWith("data:image/")) throw new Error("Neplatný obrázok");

    const system = `Si OCR asistent pre slovenské bločky a faktúry. Z fotky extrahuj polia.
Vráť VÝLUČNE JSON: {"supplier":string|null,"total":number|null,"vat_rate":0|5|19|23|null,"currency":"EUR","date":"YYYY-MM-DD"|null,"items":[{"name":string,"quantity":number,"unit_price":number,"vat_rate":0|5|19|23}]}`;

    const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: [
            { type: "text", text: "Extrahuj údaje z tohto bločka/faktúry." },
            { type: "image_url", image_url: { url: data.image_data_url } },
          ] },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`OpenAI: ${res.status} ${t.slice(0, 200)}`);
    }
    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    try { return JSON.parse(content); } catch { return {}; }
  });
