import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Ziadost = z.object({
  client_id: z.string().max(200),
  redirect_uri: z.string().max(2000),
  code_challenge: z.string().max(200),
  code_challenge_method: z.string().max(20).optional(),
  response_type: z.string().max(20).optional(),
  state: z.string().max(2000).optional(),
  scope: z.string().max(500).optional(),
  resource: z.string().max(500).optional(),
});

/** Firmy, kde smie človek prístup povoliť — vydanie kľúča je vec majiteľa alebo správcu. */
async function spravovaneFirmy(supabase: any, userId: string) {
  const { data } = await supabase
    .from("company_users")
    .select("company_id, role, companies(name)")
    .eq("user_id", userId)
    .in("role", ["owner", "admin"]);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.company_id as string,
    nazov: (r.companies?.name as string) ?? "—",
  }));
}

export const oauthNahladFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Ziadost.parse(d))
  .handler(async ({ data, context }) => {
    const { overZiadost, OAuthChyba } = await import("./oauth.server");
    try {
      const { klient } = await overZiadost(data);
      let host = "";
      try {
        host = new URL(data.redirect_uri).host;
      } catch {
        /* overené vyššie */
      }
      return {
        ok: true as const,
        klient: klient.client_name || host,
        host,
        firmy: await spravovaneFirmy((context as any).supabase, (context as any).userId),
      };
    } catch (e) {
      return {
        ok: false as const,
        chyba: e instanceof OAuthChyba ? e.message : String((e as Error)?.message ?? e),
      };
    }
  });

export const oauthSchvalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ ziadost: Ziadost, company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmy = await spravovaneFirmy((context as any).supabase, (context as any).userId);
    if (!firmy.some((f) => f.id === data.company_id)) {
      throw new Error("Prístup k firme môže povoliť len jej majiteľ alebo správca.");
    }
    const { vydajKod } = await import("./oauth.server");
    return { url: await vydajKod(data.ziadost, data.company_id, (context as any).userId) };
  });

export const oauthZamietniFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Ziadost.parse(d))
  .handler(async ({ data }) => {
    const { overZiadost, zamietnutie } = await import("./oauth.server");
    await overZiadost(data);
    return { url: zamietnutie(data) };
  });
