/**
 * Prečítanie JSON z odpovede jazykového modelu.
 *
 * Modely rady zabalia JSON do bloku ```json … ``` alebo pred neho pridajú vetu
 * — aj keď sa v zadaní píše, že to robiť nemajú. Doterajší `JSON.parse` na tom
 * spadol, chybu spolkol a vrátil prázdny objekt; stránka potom ukázala samé
 * pomlčky a vyzeralo to, akoby sa z dokladu nedalo prečítať nič.
 *
 * Občas odpoveď aj nedopíšu: Gemini vrátil zmluvu bez poslednej zátvorky, hoci
 * hlásil, že skončil normálne. Taký text sa dá dočítať — chýbajúce zátvorky sa
 * doplnia — a je to lepšie než zahodiť celý dokument.
 */
export function odpovedNaJson<T = any>(raw: string | null | undefined): T | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;

  // Keď odpoveď začína zloženou zátvorkou, výsledkom musí byť objekt. Pole by
  // znamenalo, že sme z nej vylúpli iba kúsok (napríklad prázdne `splatky`).
  const chceObjekt = t.startsWith("{");

  for (const kandidat of kandidati(t)) {
    try {
      const v = JSON.parse(kandidat);
      if (!v || typeof v !== "object") continue;
      if (chceObjekt && Array.isArray(v)) continue;
      return v as T;
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
  if (blok?.[1]) {
    yield blok[1].trim();
    yield* dopisZatvorky(blok[1].trim());
  }

  // Nedopísaná odpoveď: doplnia sa chýbajúce zátvorky. Musí to ísť pred
  // vylupovaním kúskov nižšie, inak by z celej zmluvy ostalo prázdne pole.
  yield* dopisZatvorky(t);

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

/**
 * Tvary nedopísanej odpovede s doplnenými zátvorkami.
 *
 * Text sa prejde ako čítačka: vie sa, či sme vnútri reťazca, a vedie sa
 * zásobník otvorených zátvoriek. Miesta, kde práve skončila nejaká hodnota, sú
 * bezpečné rezy — z posledných pár sa vyrobia kandidáti od najdlhšieho po
 * najkratší. Prvý, ktorý sa dá prečítať, vyhráva; keď žiadny, odpoveď sa
 * jednoducho neprečíta a volajúci to povie nahlas.
 */
function* dopisZatvorky(t: string): Generator<string> {
  const stack: string[] = [];
  const rezy: { pos: number; zavri: string[] }[] = [];
  let vReetazci = false;
  let escape = false;

  const zapamataj = (i: number) => {
    if (stack.length === 0) return;
    rezy.push({ pos: i, zavri: [...stack].reverse() });
    if (rezy.length > 6) rezy.shift();
  };

  for (let i = 0; i < t.length; i++) {
    const z = t[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (vReetazci) {
      if (z === "\\") escape = true;
      else if (z === '"') {
        vReetazci = false;
        zapamataj(i);
      }
      continue;
    }
    if (z === '"') vReetazci = true;
    else if (z === "{" || z === "[") stack.push(z === "{" ? "}" : "]");
    else if (z === "}" || z === "]") {
      stack.pop();
      zapamataj(i);
    } else if (z === "," || /\s/.test(z)) {
      /* čiarka ani medzera hodnotu nekončia — rez je už zapamätaný */
    } else if (!/[0-9eE+\-.]/.test(t[i + 1] ?? "") && /[0-9a-z]/i.test(z)) {
      // koniec čísla, true/false/null
      zapamataj(i);
    }
  }

  if (stack.length === 0) return;

  for (const rez of [...rezy].reverse()) {
    // Kľúč bez hodnoty ("interest_rate": ) sa dopísať nedá, tak ide preč.
    const telo = t
      .slice(0, rez.pos + 1)
      .replace(/,\s*$/, "")
      .replace(/,?\s*"[^"]*"\s*:\s*$/, "");
    yield telo + rez.zavri.join("");
  }
}
