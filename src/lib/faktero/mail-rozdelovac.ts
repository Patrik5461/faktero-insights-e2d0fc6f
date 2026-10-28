/** Rozdeľovač dokladov — čisté pravidlá bez databázy. */

export type FirmaNaRozdelenie = {
  id: string;
  name: string | null;
  ico: string | null;
  ic_dph: string | null;
  dic?: string | null;
  /** IBAN firmy aj jej bankových účtov. */
  ibany?: string[];
};

/** Podľa čoho sa firma našla. */
export type ZhodaPodla = "ico" | "ic_dph" | "dic" | "iban" | "nazov";

export type VyberFirmy = {
  /** Firma, do ktorej doklad ide; `null` = čaká na ručné priradenie. */
  firma: FirmaNaRozdelenie | null;
  podla: ZhodaPodla | null;
  /**
   * `zhoda` — sedí práve jedna firma; `nejednoznacne` — sedí viac firiem
   * alebo si údaje odporujú; `cudzi` — odberateľ je uvedený, ale nie je
   * to žiadna z firiem; `bez_udajov` — na doklade nie je nič, podľa čoho
   * by sa dalo rozhodnúť.
   */
  vysledok: "zhoda" | "nejednoznacne" | "cudzi" | "bez_udajov";
  /** Firmy, ktoré prichádzali do úvahy (pri nejednoznačnej zhode). */
  kandidati: string[];
};

const cisteIco = (v: unknown) => String(v ?? "").replace(/\s/g, "");
const cisteKod = (v: unknown) =>
  String(v ?? "")
    .replace(/[\s.\-/]/g, "")
    .toUpperCase();
/** DIČ: len číslice — „SK2020123456“ aj „2020123456“ je to isté DIČ. */
const cisteDic = (v: unknown) => cisteKod(v).replace(/^[A-Z]{2}/, "");

/** Názov bez diakritiky, interpunkcie a právnej formy (s.r.o., a.s., spol. …). */
export function normalizujNazov(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;:"'„“”()&+]/g, " ")
    .replace(
      /\b(s\s*r\s*o|spol|sro|a\s*s|as|k\s*s|v\s*o\s*s|s\s*e|se|druzstvo|gmbh|ag|ltd|z\s*s)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function zhoda(firmy: FirmaNaRozdelenie[], f: (x: FirmaNaRozdelenie) => boolean) {
  return firmy.filter(f).map((x) => x.id);
}

/**
 * Vyberie firmu, na ktorú je doklad vystavený — výhradne spomedzi `firmy`
 * (volajúci ich už obmedzil na tie, kde smie používateľ zapisovať doklady).
 *
 * Pravidlá, zámerne opatrné, lebo zlé zaradenie je horšie než ručné:
 * - Firma, ktorá je na doklade **dodávateľom**, odberateľom nie je (faktúra
 *   medzi dvoma vlastnými firmami).
 * - Silné údaje sú IČO, IČ DPH a DIČ. Keď je na doklade aspoň jeden, rozhodujú
 *   len ony: všetky nájdené firmy musia byť jedna a tá istá, inak sa nehádže.
 *   Uvedené, ale cudzie IČO znamená cudzieho odberateľa — podľa názvu ani
 *   IBAN sa potom nepriraďuje.
 * - Slabé údaje (IBAN platiteľa, názov) sa použijú len vtedy, keď silné na
 *   doklade nie sú, a len keď sedí práve jedna firma.
 */
export function vyberFirmuPodlaOdberatela(
  ai: Record<string, unknown> | null | undefined,
  vsetky: FirmaNaRozdelenie[],
): VyberFirmy {
  const ico = cisteIco(ai?.buyer_ico);
  const icDph = cisteKod(ai?.buyer_ic_dph);
  const dic = cisteDic(ai?.buyer_dic) || (/^[A-Z]{2}\d+$/.test(icDph) ? cisteDic(icDph) : "");
  const iban = cisteKod(ai?.buyer_iban);
  const nazov = normalizujNazov(ai?.buyer_name);

  // Dodávateľ dokladu nie je jeho odberateľom — pokiaľ ho tak doklad výslovne nevolá.
  const dodIco = cisteIco(ai?.supplier_ico);
  const dodIcDph = cisteKod(ai?.supplier_ic_dph);
  const firmy = vsetky.filter((f) => {
    const jeDodavatel =
      (dodIco && cisteIco(f.ico) === dodIco) || (dodIcDph && cisteKod(f.ic_dph) === dodIcDph);
    const jeOdberatel = (ico && cisteIco(f.ico) === ico) || (icDph && cisteKod(f.ic_dph) === icDph);
    return !jeDodavatel || jeOdberatel;
  });

  const nic: VyberFirmy = { firma: null, podla: null, vysledok: "bez_udajov", kandidati: [] };
  const silne: Array<[ZhodaPodla, string[]]> = [];
  if (ico) silne.push(["ico", zhoda(firmy, (f) => !!f.ico && cisteIco(f.ico) === ico)]);
  if (icDph)
    silne.push(["ic_dph", zhoda(firmy, (f) => !!f.ic_dph && cisteKod(f.ic_dph) === icDph)]);
  if (dic) silne.push(["dic", zhoda(firmy, (f) => !!f.dic && cisteDic(f.dic) === dic)]);

  if (silne.length) {
    const kandidati = [...new Set(silne.flatMap(([, ids]) => ids))];
    if (kandidati.length === 1) {
      const podla = silne.find(([, ids]) => ids.length)![0];
      return {
        firma: firmy.find((f) => f.id === kandidati[0])!,
        podla,
        vysledok: "zhoda",
        kandidati,
      };
    }
    return {
      ...nic,
      vysledok: kandidati.length ? "nejednoznacne" : "cudzi",
      kandidati,
    };
  }

  const slabe: Array<[ZhodaPodla, string[]]> = [];
  if (iban)
    slabe.push(["iban", zhoda(firmy, (f) => (f.ibany ?? []).some((i) => cisteKod(i) === iban))]);
  if (nazov.length >= 3)
    slabe.push(["nazov", zhoda(firmy, (f) => normalizujNazov(f.name) === nazov)]);
  if (!slabe.length) return nic;
  for (const [podla, ids] of slabe) {
    if (ids.length === 1)
      return {
        firma: firmy.find((f) => f.id === ids[0])!,
        podla,
        vysledok: "zhoda",
        kandidati: ids,
      };
    if (ids.length > 1) return { ...nic, vysledok: "nejednoznacne", kandidati: ids };
  }
  return { ...nic, vysledok: "cudzi" };
}

/** Skratka pre volajúcich, ktorým stačí firma alebo nič. */
export function firmaPodlaOdberatela(
  ai: Record<string, unknown> | null | undefined,
  firmy: FirmaNaRozdelenie[],
): FirmaNaRozdelenie | null {
  return vyberFirmuPodlaOdberatela(ai, firmy).firma;
}

/** Veta k dokladu, ktorý čaká na ručné priradenie. */
export function dovodNepriradenia(v: VyberFirmy): string {
  if (v.vysledok === "nejednoznacne")
    return "Odberateľ na doklade sedí na viac vašich firiem — vyberte správnu.";
  if (v.vysledok === "cudzi") return "Odberateľ na doklade nesedí na žiadnu z vašich firiem.";
  return "Na doklade chýbajú údaje odberateľa (IČO, DIČ, IČ DPH, názov).";
}

/** Poznámka do Nespracovaných: prečo doklad skončil práve v tejto firme. */
export function poznamkaRozdelovaca(podla: ZhodaPodla | null): string {
  const text: Record<ZhodaPodla, string> = {
    ico: "podľa IČO odberateľa",
    ic_dph: "podľa IČ DPH odberateľa",
    dic: "podľa DIČ odberateľa",
    iban: "podľa IBAN platiteľa",
    nazov: "podľa názvu odberateľa",
  };
  return podla ? `Zaradil rozdeľovač ${text[podla]}.` : "Do firmy priradené ručne z rozdeľovača.";
}

/**
 * Smie človek s touto rolou a vlastnými oprávneniami zapisovať doklady?
 * Rovnaké pravidlo ako `firmy_s_pravom('doklady', true)` v databáze — tu
 * kvôli webhooku, ktorý nemá prihláseného používateľa (`auth.uid()`).
 */
export function smieZapisovatDoklady(
  role: string | null | undefined,
  permissions: unknown,
): boolean {
  if (!role) return false;
  if (role !== "custom") return true;
  const p = (permissions ?? {}) as Record<string, unknown>;
  return p.doklady === "edit";
}

/** Kryptograficky náhodné číslo z [0, 1) — adresa je zároveň heslo. */
function nahodneCislo(): number {
  const b = new Uint32Array(1);
  globalThis.crypto.getRandomValues(b);
  return b[0]! / 2 ** 32;
}

/** Adresa rozdeľovača: `rozdelovac-<náhodný chvost>`, aby sa nedala uhádnuť. */
export function localPartRozdelovaca(nahodne: () => number = nahodneCislo): string {
  const znaky = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += znaky[Math.floor(nahodne() * znaky.length)];
  return `rozdelovac-${s}`;
}
