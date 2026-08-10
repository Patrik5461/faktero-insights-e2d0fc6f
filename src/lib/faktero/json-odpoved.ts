/**
 * Prečítanie JSON z odpovede jazykového modelu.
 *
 * Modely rady zabalia JSON do bloku ```json … ``` alebo pred neho pridajú vetu
 * — aj keď sa v zadaní píše, že to robiť nemajú. Doterajší `JSON.parse` na tom
 * spadol, chybu spolkol a vrátil prázdny objekt; stránka potom ukázala samé
 * pomlčky a vyzeralo to, akoby sa z dokladu nedalo prečítať nič.
 */
export function odpovedNaJson<T = any>(raw: string | null | undefined): T | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;

  for (const kandidat of kandidati(t)) {
    try {
      const v = JSON.parse(kandidat);
      if (v && typeof v === "object") return v as T;
    } catch {
      /* skúsi sa ďalší tvar */
    }
  }
  return null;
}

function* kandidati(t: string): Generator<string> {
  yield t;

  // Blok ohraničený trojicou spätných apostrofov, s jazykom aj bez neho.
  const blok = t.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (blok?.[1]) yield blok[1].trim();

  // Text okolo objektu alebo poľa: berie sa od prvej zátvorky po poslednú.
  for (const [o, c] of [
    ["{", "}"],
    ["[", "]"],
  ] as const) {
    const zac = t.indexOf(o);
    const kon = t.lastIndexOf(c);
    if (zac >= 0 && kon > zac) yield t.slice(zac, kon + 1);
  }
}
