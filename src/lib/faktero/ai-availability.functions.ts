import { createServerFn } from "@tanstack/react-start";

/**
 * Public feature flag: zistí, či sú AI funkcie dostupné (nakonfigurovaný OPENAI_API_KEY).
 * Self-hosted: používame priamo OpenAI, nie Lovable gateway.
 * Klient používa na skrytie/disable AI UI bez crashu.
 */
export const getAiAvailabilityFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ available: boolean; reason?: string }> => {
    if (process.env.OPENAI_API_KEY) return { available: true };
    return { available: false, reason: "AI funkcie momentálne nedostupné" };
  },
);
