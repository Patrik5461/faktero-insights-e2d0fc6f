import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const jsonHeaders = { "content-type": "application/json; charset=utf-8", ...corsHeaders };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

async function processJob(jobId: string, storagePath: string, mimeType: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("delivery_parse_jobs")
      .update({ status: "processing" })
      .eq("id", jobId);

    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from("imports")
      .download(storagePath);
    if (dlErr || !blob) throw new Error(`download_failed: ${dlErr?.message ?? "unknown"}`);
    const arrayBuf = await blob.arrayBuffer();
    const base64 = Buffer.from(arrayBuf).toString("base64");
    const mt = (blob.type || mimeType || "application/octet-stream").toLowerCase();

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
    if (!geminiKey && !openaiKey) throw new Error("ai_not_configured");

    let content = "[]";
    if (geminiKey) {
      const { geminiVision } = await import("@/lib/faktero/gemini.server");
      content = await geminiVision(base64, mt, prompt);
    } else {
      const isPdf = mt === "application/pdf";
      const dataUrl = `data:${mt};base64,${base64}`;
      const userContent: any[] = [
        { type: "text", text: "Extrahuj položky z tohto dodacieho listu." },
      ];
      if (isPdf)
        userContent.push({
          type: "file",
          file: { filename: "dodaci-list.pdf", file_data: dataUrl },
        });
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
      if (!resp.ok)
        throw new Error(`ai_error ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
      const j = await resp.json();
      content = j.choices?.[0]?.message?.content ?? "[]";
    }

    console.log("[job] ai raw response (first 300):", (content || "").slice(0, 300));
    console.log("[job] ai raw response length:", (content || "").length);

    // Strip markdown code fences that Gemini often wraps JSON in
    let cleaned = (content || "").trim();
    const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();
    if (!cleaned.startsWith("[") && !cleaned.startsWith("{")) {
      const arrIdx = cleaned.indexOf("[");
      const objIdx = cleaned.indexOf("{");
      const start = arrIdx === -1 ? objIdx : objIdx === -1 ? arrIdx : Math.min(arrIdx, objIdx);
      if (start >= 0) cleaned = cleaned.slice(start);
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr: any) {
      console.error(
        "[job] JSON parse failed:",
        parseErr?.message,
        "cleaned prefix:",
        cleaned.slice(0, 200),
      );
    }
    const rawItems: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.items)
        ? parsed.items
        : Array.isArray(parsed?.results)
          ? parsed.results
          : Array.isArray(parsed?.products)
            ? parsed.products
            : Array.isArray(parsed?.data)
              ? parsed.data
              : parsed?.name
                ? [parsed]
                : [];

    console.log("[job] raw items count:", rawItems.length);

    const items = rawItems
      .map((r) => ({
        name: String(r?.name ?? r?.nazov ?? "").trim(),
        code: r?.code ? String(r.code).trim() : null,
        quantity: Number(r?.quantity ?? r?.mnozstvo ?? 0) || 0,
        unit: String(r?.unit ?? r?.jednotka ?? "ks").trim() || "ks",
        unit_price: r?.unit_price != null ? Number(r.unit_price) : null,
        total_price: r?.total_price != null ? Number(r.total_price) : null,
      }))
      .filter((r) => r.name.length > 0 && r.quantity > 0);

    console.log("[job] parsed items count:", items.length);

    const result = {
      items,
      supplier: (parsed && !Array.isArray(parsed) ? parsed.supplier : null) ?? null,
      delivery_number: (parsed && !Array.isArray(parsed) ? parsed.delivery_number : null) ?? null,
    };
    const { error: updErr } = await supabaseAdmin
      .from("delivery_parse_jobs")
      .update({ status: "done", result })
      .eq("id", jobId);
    console.log("[job] db update result:", updErr?.message ?? "ok", { jobId, items: items.length });
  } catch (e: any) {
    console.error("[parse-delivery-note] job failed", { jobId, error: e?.message ?? String(e) });
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("delivery_parse_jobs")
        .update({ status: "error", error_message: e?.message ?? String(e) })
        .eq("id", jobId);
    } catch {}
  }
}

export const Route = createFileRoute("/api/v1/sklad/parse-delivery-note")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          if (!auth.toLowerCase().startsWith("bearer "))
            return json(401, { error: "missing_token" });
          const token = auth.slice(7).trim();
          if (!token) return json(401, { error: "missing_token" });

          const SUPABASE_URL = process.env.SUPABASE_URL;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)
            return json(500, { error: "supabase_not_configured" });

          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
          if (claimsErr || !claimsData?.claims?.sub) return json(401, { error: "invalid_token" });
          const userId = claimsData.claims.sub as string;

          let body: any;
          try {
            body = await request.json();
          } catch {
            return json(400, { error: "invalid_json" });
          }
          const storage_path = typeof body?.storage_path === "string" ? body.storage_path : "";
          const mime_type = typeof body?.mime_type === "string" ? body.mime_type : "";
          const company_id = typeof body?.company_id === "string" ? body.company_id : "";
          if (!storage_path) return json(400, { error: "missing_storage_path" });
          if (!company_id) return json(400, { error: "missing_company_id" });

          // Verify caller is a member of company
          const { data: member } = await supabase
            .from("company_users")
            .select("company_id")
            .eq("company_id", company_id)
            .eq("user_id", userId)
            .maybeSingle();
          if (!member) return json(403, { error: "not_member" });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: job, error: insErr } = await supabaseAdmin
            .from("delivery_parse_jobs")
            .insert({
              company_id,
              user_id: userId,
              storage_path,
              mime_type: mime_type || null,
              status: "pending",
            })
            .select("id")
            .single();
          if (insErr || !job)
            return json(500, { error: "job_create_failed", message: insErr?.message });

          // Fire and forget – runs in background on Node/PM2 host.
          void processJob(job.id, storage_path, mime_type);

          return json(202, { job_id: job.id });
        } catch (e: any) {
          console.error("[parse-delivery-note] ERROR:", e?.message ?? String(e));
          return json(500, { error: "internal_error", message: e?.message ?? String(e) });
        }
      },
    },
  },
});
