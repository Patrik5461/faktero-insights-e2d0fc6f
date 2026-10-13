/*
  Rozpoznanie pohonných hmôt na položke bločku — aby nafta na bločku s
  bagetou dostala predkontáciu PHM (často účtovanú pomerom 50/50) sama,
  ako v Doklado. Názvy z čerpacích staníc: Slovnaft, OMV, Shell, MOL,
  Orlen, Tesco, Lukoil, Jurki… (eKasa ich posiela skrátené a veľkými).
*/
const PALIVO = new RegExp(
  [
    "\\bnaft",
    "\\bdiesel",
    "\\bdiesl",
    "\\bmotorov[aá] nafta",
    "\\bnatural\\b",
    "\\bnat\\.?\\s?9[58]\\b",
    "\\bba\\s?9[58]\\b",
    "\\bbenz[ií]n",
    "\\bbenzin",
    "\\bsuper\\s?(plus\\s?)?9[58]\\b",
    "\\b9[58]\\s?(oktan|okt)",
    "\\blpg\\b",
    "\\bcng\\b",
    "\\bautoplyn",
    "\\badblue\\b",
    "\\bad\\s?blue\\b",
    "\\bv-?power\\b",
    "\\bevo\\s?(diesel|95|100)\\b",
    "\\bmaxxmotion\\b",
    "\\bmaxx\\s?motion\\b",
    "\\bverva\\b",
    "\\befecta\\b",
    "\\bultimate\\s?(diesel|95|100|102)\\b",
    "\\bdynamic\\s?(diesel|95|100)\\b",
    "\\bnaftamax\\b",
    "\\bhvo\\b",
  ].join("|"),
  "i",
);

/** Položky, ktoré nie sú palivo, hoci sa tak môžu volať (umývanie, olej, kvapalina). */
const NIE_PALIVO = /(um[yý]v|wash|olej|oil|kvapalin|ostrekov|kava|káva|cola|voda|bageta|parfum)/i;

export function jePalivo(nazov: string | null | undefined): boolean {
  const n = String(nazov ?? "").normalize("NFC");
  if (!n.trim()) return false;
  return PALIVO.test(n) && !NIE_PALIVO.test(n);
}
