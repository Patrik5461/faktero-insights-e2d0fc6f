import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * „Načítať z registra“ v nastaveniach firmy. SK: najprv FinStat (ten istý zdroj
 * ako vyhľadanie podľa IČO, s 24 h cache), keď zápis nepovie, RPO. CZ: ARES.
 * Nič neukladá — vráti text do formulára, uloží ho až človek.
 */
export const nacitajZapisVRegistriFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { ico: string; country?: string | null }) => {
    if (!input || typeof input.ico !== "string") throw new Error("invalid_input");
    const ico = input.ico.replace(/\s+/g, "").trim();
    if (!/^\d{6,8}$/.test(ico)) throw new Error("invalid_ico");
    return { ico, country: typeof input.country === "string" ? input.country : null };
  })
  .handler(async ({ data }) => {
    const z = await import("./zapis-v-registri-zdroje");
    const { zapisZFinstatTextu } = await import("./zapis-v-registri");
    if (z.jeCeskaKrajina(data.country)) return z.zapisZAresPodlaIco(data.ico);

    try {
      const reg = await import("./company-registry.server");
      if (reg.isRegistryConfigured()) {
        const r = await reg.firmaZRegistraBezRezimu(data.ico);
        if (r.status === "ok") {
          const raw: any = r.raw;
          const zapis = zapisZFinstatTextu(r.data.registrationNumber ?? raw?.RegisterNumberText);
          if (zapis?.text) return { stav: "ok" as const, zapis, zdroj: "finstat" as const };
        }
      }
    } catch (e) {
      console.warn("[zapis-v-registri] FinStat:", e instanceof Error ? e.message : e);
    }
    return z.zapisZRpoPodlaIco(data.ico);
  });
