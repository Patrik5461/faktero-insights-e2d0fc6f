/**
 * Prekladač textov do popisov v knižniciach (`t` z `useT`). Bez neho ostane
 * slovenčina — kľúč je slovenská veta a `{x}` sa nahradí parametrom.
 */
export type PrekladPopisu = (kluc: string, p?: Record<string, string | number>) => string;

export const bezPrekladu: PrekladPopisu = (k, p) =>
  k.replace(/\{(\w+)\}/g, (_, x: string) => (p && x in p ? String(p[x]) : `{${x}}`));
