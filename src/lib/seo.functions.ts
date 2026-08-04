import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const PageInput = z.object({
  path: z.string().min(1),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  og_title: z.string().nullable().optional(),
  og_description: z.string().nullable().optional(),
  og_image: z.string().nullable().optional(),
  canonical: z.string().nullable().optional(),
  robots: z.string().nullable().optional(),
  google_verification: z.string().nullable().optional(),
  ga_measurement_id: z.string().nullable().optional(),
  priority: z.number().nullable().optional(),
});

function publicClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

// Public read (used by sitemap, robots, __root head)
export const listSeoPagesPublic = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data, error } = await supabase.from("seo_pages" as any).select("*");
  if (error) throw error;
  return (data ?? []) as any[];
});

// Admin: list all
export const listSeoPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase
      .from("platform_admins")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!admin) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("seo_pages" as any)
      .select("*")
      .order("path");
    if (error) throw error;
    return (data ?? []) as any[];
  });

// Admin: upsert page
export const upsertSeoPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PageInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase
      .from("platform_admins")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!admin) throw new Error("Forbidden");
    const { error } = await context.supabase
      .from("seo_pages" as any)
      .upsert(data as any, { onConflict: "path" });
    if (error) throw error;
    return { ok: true };
  });

// Admin: delete
export const deleteSeoPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ path: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase
      .from("platform_admins")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!admin) throw new Error("Forbidden");
    if (data.path === "_global") throw new Error("Cannot delete global settings");
    const { error } = await context.supabase
      .from("seo_pages" as any)
      .delete()
      .eq("path", data.path);
    if (error) throw error;
    return { ok: true };
  });

// Admin: AI generate title + description
export const generateSeoAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        path: z.string(),
        hint: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase
      .from("platform_admins")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!admin) throw new Error("Forbidden");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const prompt = `Vygeneruj SEO meta title a description pre slovenskú stránku fakturačného programu Faktero.
Stránka: ${data.path}
${data.hint ? `Doplňujúci kontext: ${data.hint}` : ""}

Kľúčové slová pre SK trh: fakturácia, fakturačný program, faktúry online, eFaktúra 2027, online faktúry Slovensko, elektronická fakturácia.

Požiadavky:
- title: max 60 znakov, obsahuje relevantné kľúčové slovo, končí "— Faktero" alebo podobne
- description: max 160 znakov, výstižné, prirodzené, call-to-action
- jazyk: slovenský
- vráť LEN JSON: {"title": "...", "description": "..."}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "Si SEO expert pre slovenský trh. Vraciaš iba čistý JSON bez markdownu.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`AI Gateway ${resp.status}: ${body}`);
    }
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { title?: string; description?: string } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      // try to strip markdown code fences
      const m = content.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    return {
      title: (parsed.title ?? "").slice(0, 60),
      description: (parsed.description ?? "").slice(0, 160),
    };
  });
