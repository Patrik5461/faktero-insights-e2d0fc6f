import { createServerFn } from "@tanstack/react-start";

/**
 * Public feature flag: zistí, či sú AI funkcie dostupné.
 * Preferuje LOVABLE_API_KEY (gateway), fallback na OPENAI_API_KEY.
 * Klient používa na skrytie/disable AI UI bez crashu.
 */
export const getAiAvailabilityFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ available: boolean; provider?: "lovable" | "openai"; reason?: string }> => {
    if (process.env.LOVABLE_API_KEY) return { available: true, provider: "lovable" };
    if (process.env.OPENAI_API_KEY) return { available: true, provider: "openai" };
    return { available: false, reason: "AI funkcie momentálne nedostupné" };
  },
);
