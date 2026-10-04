/*
  Hľadanie v manuáloch pre Pomoc a podpora. Zdroj je ten istý ako pri Faktero
  AI (`znalosti-manualy.json`, generuje `npm run znalosti`), takže čo vie AI,
  nájde sa aj tu — len bez čakania a bez kreditu.
*/

export type Clanok = { cesta: string; titulok: string; sekcie: { nadpis: string; text: string }[] };

export type Vysledok = {
  cesta: string;
  titulok: string;
  nadpis: string;
  ukazka: string;
  skore: number;
};

const holy = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Text sekcie bez značiek, ktoré generátor nechal v zdroji. */
function cisty(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ukazka(text: string, slova: string[], dlzka = 180): string {
  const t = cisty(text);
  const h = holy(t);
  const pozicie = slova.map((s) => h.indexOf(s)).filter((i) => i >= 0);
  const od = pozicie.length ? Math.max(0, Math.min(...pozicie) - 60) : 0;
  const kus = t.slice(od, od + dlzka).trim();
  return `${od > 0 ? "…" : ""}${kus}${od + dlzka < t.length ? "…" : ""}`;
}

/**
 * Najlepšie sekcie manuálov k otázke. Slovo v nadpise článku váži najviac, v
 * nadpise sekcie menej, v texte najmenej; sekcia, ktorá má všetky slová,
 * predbehne tú, ktorá má len niektoré.
 */
export function hladajVManualoch(clanky: Clanok[], otazka: string, max = 8): Vysledok[] {
  const slova = [
    ...new Set(
      holy(otazka)
        .split(/[^a-z0-9]+/)
        .filter((s) => s.length >= 3),
    ),
  ];
  if (!slova.length) return [];
  const vysledky: Vysledok[] = [];
  for (const c of clanky) {
    const ht = holy(c.titulok);
    for (const s of c.sekcie) {
      const hn = holy(s.nadpis);
      const hx = holy(cisty(s.text));
      let skore = 0;
      let najdenych = 0;
      for (const w of slova) {
        const vText = Math.min(hx.split(w).length - 1, 5);
        const tu = (ht.includes(w) ? 5 : 0) + (hn.includes(w) ? 3 : 0) + vText;
        if (tu > 0) najdenych++;
        skore += tu;
      }
      if (!najdenych) continue;
      if (najdenych === slova.length) skore += 10;
      vysledky.push({
        cesta: c.cesta,
        titulok: c.titulok,
        nadpis: s.nadpis,
        ukazka: ukazka(s.text, slova),
        skore,
      });
    }
  }
  return vysledky.sort((a, b) => b.skore - a.skore).slice(0, max);
}
