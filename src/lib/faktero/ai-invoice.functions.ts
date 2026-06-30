import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AiItem = { name: string; quantity: number; unit: string; unit_price: number; vat_rate: number };
type AiResult = {
  customer_hint?: string;
  items: AiItem[];
  notes?: string;
  currency?: string;
};

export const aiParseInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { prompt: string }) => input)
  .handler(async ({ data }): Promise<AiResult> => {
    // Preferujeme Lovable AI Gateway (LOVABLE_API_KEY je auto-provisioned).
    // OPENAI_API_KEY ostáva ako voliteľný fallback pre self-hosted nasadenia.
    const lovableKey = process.env.LOVABLE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!lovableKey && !openaiKey) throw new Error("AI funkcie momentálne nedostupné");

    const system = `Si asistent pre vytváranie slovenských faktúr. Z textu používateľa extrahuj položky faktúry.
Vráť VÝLUČNE JSON v tvare:
{"customer_hint": string | null, "currency": "EUR", "notes": string | null, "items": [{"name": string, "quantity": number, "unit": "ks"|"hod"|"m"|"kg"|"l", "unit_price": number, "vat_rate": 0|10|20}]}
Ak cena je s DPH, odhadni jednotkovú cenu bez DPH. Štandardná DPH je 20%.`;

    const useGateway = Boolean(lovableKey);
    const url = useGateway
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const model = useGateway
      ? (process.env.AI_INVOICE_MODEL || "google/gemini-2.5-flash")
      : (process.env.OPENAI_MODEL || "gpt-4o-mini");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (useGateway) {
      headers["Authorization"] = `Bearer ${lovableKey}`;
    } else {
      headers["Authorization"] = `Bearer ${openaiKey}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: data.prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("AI je dočasne preťažené, skúste o chvíľu znova.");
      if (res.status === 402) throw new Error("Vyčerpaný kredit pre AI. Doplňte ho v Settings.");
      throw new Error(`AI chyba: ${res.status} ${text.slice(0, 200)}`);
    }
    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    return {
      customer_hint: parsed.customer_hint ?? undefined,
      currency: parsed.currency ?? "EUR",
      notes: parsed.notes ?? undefined,
      items: Array.isArray(parsed.items) ? parsed.items.map((it: any) => ({
        name: String(it.name ?? ""),
        quantity: Number(it.quantity ?? 1),
        unit: String(it.unit ?? "ks"),
        unit_price: Number(it.unit_price ?? 0),
        vat_rate: Number(it.vat_rate ?? 20),
      })) : [],
    };
  });
