import { createHash } from "node:crypto";
import { teloNaOdtlacok } from "./prilohy-efaktury";

/**
 * Odtlačok tela pre `Idempotency-Key` (`<id faktúry>:<odtlačok>`). Prílohy
 * vstupujú hashom obsahu, nie celým base64 — iný súbor či iný výber príloh je
 * iná požiadavka, tá istá požiadavka má ten istý kľúč.
 */
export function odtlacokTela(body: Record<string, unknown>): string {
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  return sha(JSON.stringify(teloNaOdtlacok(body, sha))).slice(0, 16);
}
