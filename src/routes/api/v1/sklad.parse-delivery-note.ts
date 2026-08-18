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

    // Dodávateľa a číslo dokladu si formulár pýta, ale prompt ich predtým
    // priamo zakazoval („ignoruj informácie o firme") — obe políčka preto
    // zostávali prázdne a prepisovali sa ručne.
    const prompt = `ÚLOHA: Extrahuj z tohto dodacieho listu alebo faktúry hlavičku a KOMPLETNÝ zoznam všetkých produktov/položiek.

POVINNÉ PRAVIDLÁ:
- Extrahuj KAŽDÝ riadok tabuľky s produktom
- NIKDY nevynechaj žiadnu položku
- Ak je 50 položiek, vráť 50 položiek
- Do položiek nedávaj: hlavičky stĺpcov, súhrny, spolu, DPH
- "supplier" je firma, ktorá tovar DODÁVA (nie odberateľ, nie príjemca)
- "delivery_number" je číslo dodacieho listu; keď tam nie je, daj číslo faktúry
- Keď údaj na doklade nie je, daj null a nič si nevymýšľaj

FORMÁT ODPOVEDE - VÝHRADNE JSON objekt, žiadny iný text:
{"supplier":"názov dodávateľa alebo null","delivery_number":"číslo alebo null","items":[{"name":"presný názov","code":"kód alebo null","quantity":číslo,"unit":"ks/kg/m/l/bal","unit_price":číslo alebo null,"total_price":číslo alebo null}]}`;

    const { aiVision } = await import("@/lib/faktero/ai.server");
    const content = await aiVision(base64, mt, prompt, { json: true, maxOutputTokens: 4000 });

    const { debugLog } = await import("@/lib/faktero/debug.server");
    debugLog("parse", "ai raw response (first 300):", (content || "").slice(0, 300));
    debugLog("parse", "ai raw response length:", (content || "").length);

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
      console.error("[job] JSON parse failed:", parseErr?.message);
      debugLog("parse", "cleaned prefix:", cleaned.slice(0, 200));
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

    debugLog("parse", "raw items count:", rawItems.length);

    const items = rawItems
      .map((r) => ({
        name: String(r?.name ?? r?.nazov ?? "").trim(),
        code: r?.code ? String(r.code).trim() : null,
        quantity: Number(r?.quantity ?? r?.mnozstvo ?? 0) || 0,
        // Dodacie listy píšu jednotku raz „KS", raz „ks"; na skladovej karte
        // by z toho boli dve rôzne jednotky.
        unit:
          String(r?.unit ?? r?.jednotka ?? "ks")
            .trim()
            .toLowerCase() || "ks",
        unit_price: r?.unit_price != null ? Number(r.unit_price) : null,
        total_price: r?.total_price != null ? Number(r.total_price) : null,
      }))
      .filter((r) => r.name.length > 0 && r.quantity > 0);

    debugLog("parse", "parsed items count:", items.length);

    const result = {
      items,
      supplier: (parsed && !Array.isArray(parsed) ? parsed.supplier : null) ?? null,
      delivery_number: (parsed && !Array.isArray(parsed) ? parsed.delivery_number : null) ?? null,
    };
    const { error: updErr } = await supabaseAdmin
      .from("delivery_parse_jobs")
      .update({ status: "done", result })
      .eq("id", jobId);
    if (updErr) {
      console.error("[job] db update failed:", updErr.message, { jobId });
    } else {
      debugLog("parse", "db update ok", { jobId, items: items.length });
    }
  } catch (e: any) {
    console.error("[parse-delivery-note] job failed", { jobId, error: e?.message ?? String(e) });
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("delivery_parse_jobs")
        .update({ status: "error", error_message: e?.message ?? String(e) })
        .eq("id", jobId);
    } catch (markErr) {
      // Ak sa job nepodarí označiť ako chybný, klient ho bude pollovať až do
      // 5-minútového timeoutu — bez tohto logu by sa to nedalo dohľadať.
      console.error("[parse-delivery-note] nepodarilo sa označiť job ako chybný", {
        jobId,
        error: (markErr as any)?.message ?? String(markErr),
      });
    }
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

          /*
            Súbor sťahuje `supabaseAdmin`, ktorý politiky úložiska obchádza —
            bez tejto kontroly by stačilo poslať cestu do priečinka cudzej firmy
            a doklad by sa prečítal aj tak. Rovnaká podmienka stráži fotky
            produktov v `stock.functions.ts`.
          */
          if (!storage_path.startsWith(`${company_id}/`)) {
            return json(403, { error: "cudzia_cesta" });
          }

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
