import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/sklad/parse-delivery-note")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cors = {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "POST, OPTIONS",
        };
        const json = (status: number, body: unknown) =>
          new Response(JSON.stringify(body), { status, headers: cors });

        try {
          const auth = request.headers.get("authorization") ?? "";
          if (!auth.toLowerCase().startsWith("bearer ")) {
            return json(401, { error: "missing_token" });
          }
          const token = auth.slice(7).trim();
          if (!token) return json(401, { error: "missing_token" });

          const SUPABASE_URL = process.env.SUPABASE_URL;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
            return json(500, { error: "supabase_not_configured" });
          }

          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
          if (claimsErr || !claimsData?.claims?.sub) {
            return json(401, { error: "invalid_token" });
          }

          let body: any;
          try {
            body = await request.json();
          } catch {
            return json(400, { error: "invalid_json" });
          }
          const storage_path = typeof body?.storage_path === "string" ? body.storage_path : "";
          const mime_type = typeof body?.mime_type === "string" ? body.mime_type : "";
          if (!storage_path) return json(400, { error: "missing_storage_path" });

          console.log("[parse-delivery-note] start", { storage_path, mime_type });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: blob, error: dlErr } = await supabaseAdmin.storage
            .from("imports")
            .download(storage_path);
          if (dlErr || !blob) {
            return json(400, { error: "download_failed", message: dlErr?.message ?? "unknown" });
          }
          const arrayBuf = await blob.arrayBuffer();
          const base64 = Buffer.from(arrayBuf).toString("base64");
          const mimeType = (blob.type || mime_type || "application/octet-stream").toLowerCase();

          const prompt = `ÚLOHA: Extrahuj KOMPLETNÝ zoznam všetkých produktov/položiek z tohto dodacieho listu alebo faktúry.

POVINNÉ PRAVIDLÁ:
- Extrahuj KAŽDÝ riadok tabuľky s produktom
- NIKDY nevynechaj žiadnu položku
- Ak je 50 položiek, vráť 50 položiek
- Ignoruj: hlavičky stĺpcov, súhrny, spolu, DPH, informácie o firme, adresa, dátum

FORMÁT ODPOVEDE - VÝHRADNE JSON array, žiadny iný text:
[{"name":"presný názov","code":"kód alebo null","quantity":číslo,"unit":"ks/kg/m/l/bal","unit_price":číslo alebo null,"total_price":číslo alebo null}]`;

          const geminiKey = process.env.GEMINI_API_KEY;
          const openaiKey = process.env.OPENAI_API_KEY;
          if (!geminiKey && !openaiKey) {
            return json(500, { error: "ai_not_configured" });
          }

          let content = "[]";
          if (geminiKey) {
            const { geminiVision } = await import("@/lib/faktero/gemini.server");
            content = await geminiVision(base64, mimeType, prompt);
          } else {
            const isPdf = mimeType === "application/pdf";
            const dataUrl = `data:${mimeType};base64,${base64}`;
            const userContent: any[] = [{ type: "text", text: "Extrahuj položky z tohto dodacieho listu." }];
            if (isPdf) userContent.push({ type: "file", file: { filename: "dodaci-list.pdf", file_data: dataUrl } });
            else userContent.push({ type: "image_url", image_url: { url: dataUrl } });
            const resp = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
              body: JSON.stringify({
                model: process.env.OPENAI_VISION_MODEL || "gpt-4o",
                messages: [
                  { role: "system", content: prompt },
                  { role: "user", content: userContent },
                ],
                response_format: { type: "json_object" },
                max_tokens: 4000,
              }),
            });
            if (!resp.ok) {
              const text = await resp.text();
              return json(502, { error: "ai_error", status: resp.status, message: text.slice(0, 300) });
            }
            const j = await resp.json();
            content = j.choices?.[0]?.message?.content ?? "[]";
          }

          let parsed: any = {};
          try { parsed = JSON.parse(content); } catch {}
          const rawItems: any[] = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.items) ? parsed.items
            : Array.isArray(parsed?.results) ? parsed.results
            : parsed?.name ? [parsed] : [];

          const items = rawItems
            .map((r) => ({
              name: String(r?.name ?? "").trim(),
              code: r?.code ? String(r.code).trim() : null,
              quantity: Number(r?.quantity ?? 0) || 0,
              unit: String(r?.unit ?? "ks").trim() || "ks",
              unit_price: r?.unit_price != null ? Number(r.unit_price) : null,
              total_price: r?.total_price != null ? Number(r.total_price) : null,
            }))
            .filter((r) => r.name.length > 0 && r.quantity > 0);

          console.log("[parse-delivery-note] items:", items.length);
          return json(200, {
            items,
            supplier: parsed?.supplier ?? null,
            delivery_number: parsed?.delivery_number ?? null,
          });
        } catch (e: any) {
          console.error("[parse-delivery-note] ERROR:", e?.message ?? String(e));
          return json(500, { error: "internal_error", message: e?.message ?? String(e) });
        }
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "authorization, content-type",
            "access-control-allow-methods": "POST, OPTIONS",
          },
        }),
    },
  },
});
