/**
 * Overovanie tokenov cron hookov.
 *
 * Bežné `a !== b` porovnáva reťazce znak po znaku a skončí pri prvom rozdiele,
 * takže čas odpovede prezrádza, koľko znakov predpony útočník uhádol. Pri
 * endpointe dostupnom z internetu sa tak dá token postupne odvodiť.
 *
 * Server-only — neimportovať z klientskeho kódu.
 */
import { timingSafeEqual } from "crypto";

/**
 * Porovnanie v konštantnom čase vzhľadom na obsah. Rozdielna dĺžka sa vracia
 * hneď — to je v poriadku, dĺžka tokenu nie je tajomstvo.
 */
export function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * `expected` býva z process.env, takže môže chýbať. Nenastavený token znamená
 * odmietnutie — nikdy nie voľný prechod.
 */
export function isValidCronToken(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;
  return secureEquals(provided, expected);
}
