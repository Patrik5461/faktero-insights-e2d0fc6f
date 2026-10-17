/*
  Windows-1252 (ANSI) — kódovanie, v ktorom DATEV číta importné súbory
  (DATEV-Format, „Zeichensatz ANSI / Windows-1252“). Od Latin-1 sa líši len
  rozsahom 0x80–0x9F, kde sú euro, úvodzovky, pomlčky a pár písmen.

  Slovenské a české písmená ako č, ť, ľ, ř v tomto kódovaní nie sú — preto
  `naAnsi` text pred zápisom prepíše: odstráni diakritiku tam, kde znak
  chýba, a otáznik dá až znaku, ktorý sa prepísať nedá vôbec.
*/

/** Znaky z rozsahu 0x80–0x9F; 0xA0–0xFF je zhodné s Unicode U+00A0–U+00FF. */
const SPECIALNE: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  ƒ: 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  ˆ: 0x88,
  "‰": 0x89,
  Š: 0x8a,
  "‹": 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  š: 0x9a,
  "›": 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
};

/** Bajt znaku vo Windows-1252, alebo null, keď tam znak nie je. */
export function bajtCp1252(z: string): number | null {
  const k = z.charCodeAt(0);
  if (k < 0x80) return k;
  if (k >= 0xa0 && k <= 0xff) return k;
  return SPECIALNE[z] ?? null;
}

/**
 * Text, ktorý sa celý dá zapísať vo Windows-1252. Znak navyše sa skúsi
 * prepísať bez diakritiky („č“ → „c“, „ľ“ → „l“), až potom otáznik.
 */
export function naAnsi(text: string): string {
  let out = "";
  for (const z of String(text ?? "")) {
    if (bajtCp1252(z) != null) {
      out += z;
      continue;
    }
    const bez = z.normalize("NFD").replace(/[̀-ͯ]/g, "");
    out += bez && [...bez].every((x) => bajtCp1252(x) != null) ? bez : "?";
  }
  return out;
}

/** Reťazec na bajty Windows-1252 (na stiahnutie súboru). */
export function doCp1252(text: string): Uint8Array {
  const s = naAnsi(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = bajtCp1252(s[i]!) ?? 0x3f;
  return out;
}
