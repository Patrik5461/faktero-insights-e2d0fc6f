import { createServerFn } from "@tanstack/react-start";

/**
 * Public feature flag: zistí, či sú AI funkcie dostupné (t.j. nakonfigurovaný OPENAI_API_KEY).
 * Klient používa na skrytie/disable AI UI bez crashu.
 */
export const getAiAvailabilityFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ available: boolean; reason?: string }> => {
    const hasKey = Boolean(process.env.OPENAI_API_KEY);
    if (!hasKey) {
      return { available: false, reason: "AI funkcie momentálne nedostupné" };
    }
    return { available: true };
  },
);
