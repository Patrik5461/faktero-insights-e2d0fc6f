import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Serverové funkcie testovacej firmy. V `*.functions.ts` sa smú exportovať
  len serverové funkcie — obyčajný export zhodí build.
*/

/** Vymaže údaje testovacej firmy (súbory + obnova zo skutočnej firmy). */
export const vymazTestovaciuFirmuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { vymazTestovaciuFirmu } = await import("./testovacia-firma-vymazanie.server");
    const { subory } = await vymazTestovaciuFirmu(
      { supabase, userId },
      data.company_id,
      supabaseAdmin as any,
    );
    return { ok: true, subory };
  });
