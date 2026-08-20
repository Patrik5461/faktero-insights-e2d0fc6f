/**
 * Označenie platby — čím ten pohyb na výpise vlastne je.
 *
 * Výpis hovorí, koľko a komu; **nehovorí, čo to bolo**. A práve to rozhoduje,
 * kam pohyb v účtovníctve patrí: poplatok, daň a úhrada faktúry sa účtujú
 * každé inak, hoci na výpise vyzerajú rovnako. Kým to označenie chýbalo,
 * dopisoval ho účtovník ku každému riadku ručne.
 *
 * Predvyplní sa samo a človek ho na obrazovke prepíše. Odhad je zámerne
 * opatrný: keď si nie je istý, nechá prázdno — nesprávne označenie sa prehliadne
 * ľahšie než žiadne.
 */

export type KodOznacenia =
  | "faktura"
  | "poplatok"
  | "urok"
  | "dan"
  | "mzda"
  | "splatka"
  | "najom"
  | "prevod"
  | "karta"
  | "hotovost"
  | "ine";

export const OZNACENIA: { kod: KodOznacenia; nazov: string }[] = [
  { kod: "faktura", nazov: "Úhrada faktúry" },
  { kod: "poplatok", nazov: "Bankový poplatok" },
  { kod: "urok", nazov: "Úrok" },
  { kod: "dan", nazov: "Daň a odvody" },
  { kod: "mzda", nazov: "Mzda" },
  { kod: "splatka", nazov: "Splátka úveru alebo leasingu" },
  { kod: "najom", nazov: "Nájom" },
  { kod: "prevod", nazov: "Prevod medzi vlastnými účtami" },
  { kod: "karta", nazov: "Platba kartou" },
  { kod: "hotovost", nazov: "Hotovosť (vklad, výber)" },
  { kod: "ine", nazov: "Iné" },
];

const PODLA_KODU = new Map(OZNACENIA.map((o) => [o.kod, o.nazov]));

/** Kód, ktorý sme naozaj vydali — čokoľvek iné z požiadavky sa zahodí. */
export function kodOznacenia(v: unknown): KodOznacenia | null {
  const s = String(v ?? "").trim();
  return PODLA_KODU.has(s as KodOznacenia) ? (s as KodOznacenia) : null;
}

export function nazovOznacenia(v: unknown): string | null {
  const kod = kodOznacenia(v);
  return kod ? (PODLA_KODU.get(kod) ?? null) : null;
}

/*
  Banky píšu popisy bez diakritiky a raz veľkými, raz malými písmenami
  („UHRADA FAKTURY", „Úhrada faktúry"). Porovnáva sa preto na holom texte.
*/
function holy(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/*
  Poradie rozhoduje: „daň z úroku" je daň, nie úrok, a „platba kartou za nájom"
  je nájom. Čo je vpredu, vyhráva.
*/
const PODLA_TEXTU: [KodOznacenia, RegExp][] = [
  [
    "dan",
    /\bdan\b|\bdane\b|\bdph\b|financna sprava|danovy urad|socialna poistovna|zdravotna poistovna|\bodvod/,
  ],
  ["mzda", /\bmzda\b|\bmzdy\b|vyplata|\bodmena\b|salary|payroll/],
  ["poplatok", /poplat|\bfee\b|cena za veden|provizia/],
  ["urok", /\burok/],
  ["splatka", /splatk|leasing|\buver|hypotek|\bloan\b/],
  ["najom", /najom|prenajom|\brent\b/],
  ["prevod", /vlastny prevod|prevod medzi|interny prevod|vlastny ucet/],
  ["karta", /platba kartou|\bkarta\b|\bkartou\b|\bcard\b|\bpos\b/],
  ["hotovost", /hotovos|bankomat|\batm\b|\bvyber\b|\bvklad\b/],
  ["faktura", /faktur|\binvoice\b|\bfa\b/],
];

/*
  Kód banky z camt (`BkTxCd`) je jediný údaj, ktorý o druhu platby hovorí
  priamo — nie je to text a nedá sa prečítať zle. Rozumie sa mu len tam, kde je
  jednoznačný: karta a hotovosť. Ostatné rodiny (`ICDT`, `RCDT`) hovoria len to,
  ktorým smerom platba išla, a to už vieme.
*/
function zKoduBanky(kod: string): KodOznacenia | null {
  const k = kod.toUpperCase();
  if (/\bCWDL\b|\bCDPT\b|\bCASH\b/.test(k)) return "hotovost";
  if (/\bCCRD\b|\bMCRD\b|\bPOSD\b|\bPOSP\b/.test(k)) return "karta";
  return null;
}

/**
 * Odhad označenia z toho, čo o pohybe vieme.
 *
 * `kodBanky` je `BkTxCd` z XML výpisu (napr. `PMNT/CCRD/POSD`); z PDF ho
 * nemáme a rozhoduje text.
 */
export function odhadniOznacenie(
  p: {
    popis?: string | null;
    protistrana?: string | null;
    smer?: "prijem" | "vydaj";
    vs?: string | null;
  },
  kodBanky?: string | null,
): KodOznacenia | null {
  /*
    Popis začínajúci `UZF` je splátka úveru alebo leasingu — takto ich značí
    banka a v texte za tým už nie je nič, čo by to prezradilo. Ide to pred
    všetkým ostatným, lebo je to istota, nie odhad.
  */
  if (/^\s*uzf/.test(holy(p.popis))) return "splatka";

  const zBanky = kodBanky ? zKoduBanky(String(kodBanky)) : null;
  if (zBanky) return zBanky;

  const text = `${holy(p.popis)} ${holy(p.protistrana)}`;
  for (const [kod, vzor] of PODLA_TEXTU) {
    if (vzor.test(text)) return kod;
  }

  /*
    Variabilný symbol je v tuzemsku znak toho, že sa platí konkrétny doklad —
    inde v texte to nemusí byť napísané. Je to posledná možnosť, nie prvá.
  */
  return p.vs ? "faktura" : null;
}

/**
 * Účel platby do camt.053 (`Purp`).
 *
 * ISO 20022 má na to vlastné pole a väčšina účtovných programov mu rozumie.
 * Kódy sú z číselníka `ExternalPurpose1Code`; čo v ňom istotne nie je (bankový
 * poplatok, úrok), ide ako vlastné označenie (`Prtry`) — vymyslený kód by
 * vyzeral ako oficiálny a bol by horší než žiadny.
 */
export function ucelCamt(
  v: unknown,
  smer: "prijem" | "vydaj",
): { cd?: string; prtry?: string } | null {
  switch (kodOznacenia(v)) {
    case "faktura":
      return { cd: smer === "vydaj" ? "SUPP" : "TRAD" };
    case "dan":
      return { cd: "TAXS" };
    case "mzda":
      return { cd: "SALA" };
    case "splatka":
      return { cd: "LOAR" };
    case "najom":
      return { cd: "RENT" };
    case "prevod":
      return { cd: "INTC" };
    case "karta":
      return { cd: "CCRD" };
    case "hotovost":
      return { cd: "CASH" };
    case "poplatok":
      return { prtry: "POPLATOK" };
    case "urok":
      return { prtry: "UROK" };
    default:
      return null;
  }
}
