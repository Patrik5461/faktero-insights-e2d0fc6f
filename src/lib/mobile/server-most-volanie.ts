/**
 * Volanie operácie mimo komponentu (dynamické importy, fronty).
 *
 * Na webe zavolá serverovú funkciu priamo, v zabalenej appke pôjde cez
 * endpoint — o to sa stará most, ktorý sa pri builde vymieňa.
 */
import { SERVEROVE_FUNKCIE } from "./server-most";
import type { Operacia } from "./operacie";

export async function volajOperaciu<T = any>(kluc: Operacia, data: any): Promise<T> {
  return (await SERVEROVE_FUNKCIE[kluc]({ data })) as T;
}
