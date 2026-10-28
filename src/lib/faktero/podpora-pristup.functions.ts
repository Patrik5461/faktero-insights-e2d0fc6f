import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  „Pridať technickú podporu" v Používateľoch firmy. Udeliť smie len
  majiteľ, vidieť a odobrať aj správca. Bez súhlasu majiteľa podpora do
  firmy nevidí — v `company_users` ju pridá jedine tento kód.
*/

async function rolaVoFirme(context: any, companyId: string): Promise<string | null> {
  const { data } = await context.supabase
    .from("company_users")
    .select("role, podpora_pristup_id")
    .eq("company_id", companyId)
    .eq("user_id", context.userId)
    .maybeSingle();
  // Podpora sama sebe prístup nepredĺži ani neodoberie cudzí.
  if (data?.podpora_pristup_id) return null;
  return (data?.role as string | undefined) ?? null;
}

/** Zoznam udelení (aj história) s menami, kto ho udelil a ukončil. */
export const pristupyPodporyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const rola = await rolaVoFirme(context, data.company_id);
    if (!["owner", "admin"].includes(String(rola)))
      throw new Error("Na správu prístupov nemáte oprávnenie.");
    const { data: rows, error } = await (context.supabase as any)
      .from("podpora_pristupy")
      .select("id, rozsah, platne_do, stav, dovod, udelil, created_at, ukoncil, ukoncene_at")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const ids = [
      ...new Set(((rows ?? []) as any[]).flatMap((r) => [r.udelil, r.ukoncil]).filter(Boolean)),
    ] as string[];
    const mena: Record<string, string> = {};
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Len ľudia z tejto firmy — cudzie profily sa nevydávajú.
      const { data: cu } = await supabaseAdmin
        .from("company_users")
        .select("user_id")
        .eq("company_id", data.company_id)
        .in("user_id", ids);
      const clenovia = ((cu ?? []) as any[]).map((r) => r.user_id as string);
      if (clenovia.length) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", clenovia);
        for (const p of (prof ?? []) as any[]) mena[p.id] = p.full_name || p.email || "";
      }
    }
    return {
      mozemUdelit: rola === "owner",
      pristupy: ((rows ?? []) as any[]).map((r) => ({
        ...r,
        udelil_meno: r.udelil ? (mena[r.udelil] ?? null) : null,
        ukoncil_meno: r.ukoncil ? (mena[r.ukoncil] ?? null) : null,
      })),
    };
  });

export const udelPristupPodporeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        rozsah: z.enum(["citanie", "plny"]),
        dni: z.number().int().min(1).max(30),
        dovod: z.string().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if ((await rolaVoFirme(context, data.company_id)) !== "owner")
      throw new Error("Prístup technickej podpore môže udeliť len majiteľ firmy.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { udelPristup } = await import("./podpora-pristup.server");
    return udelPristup(supabaseAdmin, {
      companyId: data.company_id,
      userId: context.userId,
      rozsah: data.rozsah,
      dni: data.dni,
      dovod: data.dovod,
    });
  });

export const odoberPristupPodporyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const rola = await rolaVoFirme(context, data.company_id);
    if (!["owner", "admin"].includes(String(rola)))
      throw new Error("Na správu prístupov nemáte oprávnenie.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { odoberPristup } = await import("./podpora-pristup.server");
    await odoberPristup(supabaseAdmin, {
      companyId: data.company_id,
      id: data.id,
      userId: context.userId,
    });
    return { ok: true };
  });
