import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
  Prihlásenie appky v telefóne QR kódom z webu („Prihlásiť appku v
  telefóne"). Logika je v `parovanie-zariadenia.server.ts`.
*/

/** Nový QR kód pre prihláseného — platí 2 minúty a dá sa použiť raz. */
export const vytvorParovanieFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { vytvorParovanie } = await import("./parovanie-zariadenia.server");
    return vytvorParovanie(supabaseAdmin, context.userId);
  });

/** Či už kód appka použila — web podľa toho ukáže „Appka je prihlásená". */
export const stavParovaniaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS pustí človeka len k vlastným kódom.
    const { data: r } = await (context.supabase as any)
      .from("parovanie_zariadenia")
      .select("pouzite_at, expires_at")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!r) return { stav: "nenajdene" as const };
    if (r.pouzite_at) return { stav: "pouzite" as const };
    return {
      stav:
        new Date(r.expires_at).getTime() <= Date.now() ? ("vyprsane" as const) : ("caka" as const),
    };
  });

/**
 * Appka vymení naskenovaný kód za prihlásenie. Bez prihlásenia — appka ešte
 * nikoho prihláseného nemá; preukazom je jednorazový kód.
 */
export const vymenParovanieFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ kod: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    let ip: string | null = null;
    let zariadenie: string | null = null;
    try {
      const req = getRequest();
      const { ipKlienta } = await import("./registracia.server");
      ip = ipKlienta(req.headers);
      zariadenie = req.headers.get("user-agent");
    } catch {
      /* bez požiadavky (testy) — len bez stopy o zariadení */
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { vymenParovanie } = await import("./parovanie-zariadenia.server");
    return vymenParovanie(supabaseAdmin, data.kod, { ip, zariadenie });
  });
