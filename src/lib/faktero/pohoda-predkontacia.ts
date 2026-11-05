/*
  Predkontácia do Pohody ako SKRATKA, nie ako dvojica účtov.

  Pohoda v `typ:accounting/typ:ids` čaká skratku predkontácie (type.xsd,
  `accountingType/ids`: „Zkratka předkontace“), napr. „1Fp“ alebo „4V“.
  Keď skratku nenájde, dá dokladu „Neviem“ (voucher.xsd, intDoc.xsd: „Pokud
  není uveden typ předkontace, je nastaveno 'Nevím'“) a položkám nič.

  Firmy prenesené z Doklada (PALIERA) majú v číselníku predkontácie pomenované
  účtami MD/D („501000 325000“, zdroj `subor`). Skratka predkontácie v Pohode
  MÔŽE byť aj dvojica účtov — v číselníkoch načítaných z Pohody (BÝVAJLEPŠIE,
  MaxiTicket) také skratky naozaj sú —, preto sa kód z číselníka firmy
  nezahadzuje (overené 5. 11. 2026; zahodenie by PALIERE vzalo predkontáciu
  z väčšiny dokladov). Poradie:

   1. kód, ktorý je v číselníku firmy zo zdroja Pohoda, ide tak, ako je;
   2. ručná tabuľka v nastaveniach exportu (Predkontácie → Export →
      Skratky predkontácií v Pohode) — výslovná voľba firmy má prednosť;
   3. predkontácia z číselníka Pohody s rovnakými účtami MD a D — ak je
      práve jedna;
   4. kód, ktorý je v číselníku firmy z iného zdroja (súbor/Doklado, ručne),
      ide tak, ako je — v Pohode musí existovať predkontácia s touto skratkou
      v agende dokladu (inak Pohoda dá „Neviem“);
   5. inak (dvojica účtov, ktorá nie je v žiadnom číselníku) sa predkontácia
      NEPOŠLE a kontrola pred exportom na to upozorní.

  Kód, ktorý dvojicou účtov nie je („1Fp“, „PHM“, „Rozúčtovať“), ide ako
  doteraz — firma ho zadala ako skratku.
*/

export type MapaPredkontaciiPohody = {
  /** Skratky predkontácií z číselníka Pohody (zdroj `pohoda`). */
  pohoda: string[];
  /** „MD D“ → skratky Pohody s týmito účtami (z číselníka Pohody). */
  podlaUctov: Record<string, string[]>;
  /** Ručná tabuľka firmy: kód Faktera („501000 325000“) → skratka v Pohode. */
  rucne: Record<string, string>;
  /** Kódy z číselníka firmy z iného zdroja než Pohoda (súbor/Doklado, ručne). Voliteľné kvôli starším mapám. */
  ostatne?: string[];
};

const t = (v: unknown) => String(v ?? "").trim();

/** Kód je dvojica účtov MD a D („501000 325000“, „501003/321000“). */
export function jeParUctov(kod: unknown): boolean {
  return /^\d{3,7}\s*[\s/]\s*\d{3,7}$/.test(t(kod));
}

/** Dvojica účtov v jednotnom tvare „MD D“, inak null. */
export function normParUctov(kod: unknown): string | null {
  const m = /^(\d{3,7})\s*[\s/]\s*(\d{3,7})$/.exec(t(kod));
  return m ? `${m[1]} ${m[2]}` : null;
}

/** Mapa z číselníka firmy (tabuľka `predkontacie`) a ručnej tabuľky z nastavení exportu. */
export function mapaPredkontacii(
  ciselnik: { druh?: unknown; kod: unknown; zdroj?: unknown; ucet_md?: unknown; ucet_d?: unknown; aktivne?: unknown }[],
  rucne?: Record<string, unknown> | null,
): MapaPredkontaciiPohody {
  const pohoda = new Set<string>();
  const ostatne = new Set<string>();
  const podlaUctov: Record<string, string[]> = {};
  for (const r of ciselnik ?? []) {
    if (r.druh && r.druh !== "predkontacia") continue;
    if (r.aktivne === false) continue;
    if (r.zdroj !== "pohoda") {
      const kodIny = t(r.kod);
      if (kodIny) ostatne.add(kodIny);
      continue;
    }
    const kod = t(r.kod);
    if (!kod) continue;
    pohoda.add(kod);
    const md = t(r.ucet_md);
    const d = t(r.ucet_d);
    if (!md || !d) continue;
    const k = `${md} ${d}`;
    if (!(podlaUctov[k] ??= []).includes(kod)) podlaUctov[k].push(kod);
  }
  return { pohoda: [...pohoda], podlaUctov, rucne: ocistiRucne(rucne), ostatne: [...ostatne] };
}

/** Ručná tabuľka bez prázdnych riadkov, kľúče v tvare „MD D“. */
export function ocistiRucne(v: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, s] of Object.entries(v)) {
    const kod = normParUctov(k) ?? t(k);
    const skratka = t(s).slice(0, 19);
    if (kod && skratka) out[kod] = skratka;
  }
  return out;
}

export type SkratkaPredkontacie = {
  /** Čo ide do `typ:ids`; prázdne = predkontácia sa nepošle. */
  skratka: string;
  /** Odkiaľ skratka je. `chyba` = dvojica účtov bez skratky. */
  zdroj: "kod" | "pohoda" | "ciselnik" | "nastavenia" | "ciselnik_firmy" | "chyba";
};

/** Skratka predkontácie Pohody pre kód Faktera. */
export function skratkaPredkontacie(kod: unknown, mapa: MapaPredkontaciiPohody): SkratkaPredkontacie {
  const k = t(kod);
  if (!k) return { skratka: "", zdroj: "kod" };
  if (mapa.pohoda.includes(k)) return { skratka: k, zdroj: "pohoda" };
  const par = normParUctov(k);
  const rucne = mapa.rucne[k] ?? (par ? mapa.rucne[par] : undefined);
  if (rucne) return { skratka: rucne, zdroj: "nastavenia" };
  if (!par) return { skratka: k, zdroj: "kod" };
  const zCiselnika = mapa.podlaUctov[par] ?? [];
  if (zCiselnika.length === 1) return { skratka: zCiselnika[0]!, zdroj: "ciselnik" };
  if (mapa.ostatne?.includes(k)) return { skratka: k, zdroj: "ciselnik_firmy" };
  return { skratka: "", zdroj: "chyba" };
}

const RE_PREDKONTACIA = /(\n[ \t]*)?<(\w+):accounting><typ:ids>([^<]*)<\/typ:ids><\/\2:accounting>/g;

const odEsc = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const doEsc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/**
 * Preloží predkontácie v hotovom XML Pohody (hlavičky aj položky všetkých
 * agend) na skratky. Robí sa nad hotovým XML, lebo predkontácia sa skladá na
 * vyše desiatich miestach (doklad, položka, rozúčtovanie, pomer, vozidlo,
 * kategória, predvolené firmy, zaokrúhlenie) a preklad nesmie žiadne
 * vynechať. Bez mapy (miesta, ktoré číselník nenačítavajú) sa XML nemení.
 */
export function predkontacieNaSkratky(xml: string, mapa: MapaPredkontaciiPohody | null | undefined): string {
  if (!mapa || !xml) return xml;
  return xml.replace(RE_PREDKONTACIA, (cely, odsadenie: string | undefined, p: string, ids: string) => {
    const { skratka } = skratkaPredkontacie(odEsc(ids), mapa);
    if (!skratka) return "";
    return `${odsadenie ?? ""}<${p}:accounting><typ:ids>${doEsc(skratka)}</typ:ids></${p}:accounting>`;
  });
}

/** Kódy predkontácií v XML (pred prekladom), bez opakovania. */
export function predkontacieVXml(xml: string): string[] {
  const out = new Set<string>();
  for (const m of xml.matchAll(RE_PREDKONTACIA)) out.add(odEsc(m[3]!).trim());
  return [...out].filter(Boolean);
}

/** Kódy, pre ktoré skratka v Pohode chýba (dvojice účtov bez prekladu). */
export function chybajuceSkratky(kody: string[], mapa: MapaPredkontaciiPohody | null | undefined): string[] {
  if (!mapa) return [];
  return [...new Set(kody.filter((k) => skratkaPredkontacie(k, mapa).zdroj === "chyba"))];
}

/** Text upozornenia pred exportom, alebo null. */
export function varovanieSkratky(cislo: unknown, chybajuce: string[]): string | null {
  if (!chybajuce.length) return null;
  return `${t(cislo) || "?"} — predkontácia ${chybajuce
    .map((k) => `„${k}“`)
    .join(", ")} je dvojica účtov, ktorá nie je v číselníku predkontácií firmy ani Pohody — doklad pôjde bez predkontácie (v Pohode „Neviem“); doplňte skratku v Predkontácie → Export → Skratky predkontácií v Pohode`;
}
