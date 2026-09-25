/**
 * Znalosti asistenta z manuálov.
 *
 * Asistent dovtedy poznal len zoznam funkcií — teda čo Faktero vie, nie ako sa
 * to robí. Návody pritom v aplikácii sú; `scripts/znalosti-manualy.mjs` z nich
 * vyrobí text a tento modul z neho vyberie to, čo sa hodí k otázke.
 *
 * Celá báza má takmer sto kilobajtov. Posielať ju celú pri každej otázke by
 * bolo drahé a model by sa v nej strácal, preto ide do promptu vždy obsah
 * (zoznam článkov s nadpismi) a k tomu plné znenie zopár najbližších sekcií.
 */

import baza from "./znalosti-manualy.json";

export type Sekcia = { nadpis: string; text: string };
export type Clanok = { cesta: string; titulok: string; sekcie: Sekcia[] };

export const MANUALY: Clanok[] = (baza as { clanky: Clanok[] }).clanky;
export const ZNALOSTI_VYTVORENE: string = (baza as { vytvorene: string }).vytvorene;

/** Bez diakritiky a malé písmená — „faktúra" a „faktura" musia byť to isté slovo. */
export function bezDiakritiky(s: string): string {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Slová, podľa ktorých sa hľadá.
 *
 * Krátke slová a bežné spojky sa zahadzujú — „ako", „sa", „to" sú v každom
 * článku a skóre by len rozriedili.
 */
const STOPKY = new Set([
  "ako","kde","kedy","preco","prečo","co","čo","ci","či","som","ste","sme","mam","mám","ma","má",
  "sa","to","na","do","od","pre","pri","za","zo","so","vo","aby","ale","alebo","aj","the","and",
  "mi","mu","ich","moj","môj","moje","toto","tento","ten","tie","tam","tu","je","su","sú","nie",
  "ked","keď","potom","este","ešte","uz","už","by","bol","bola","bolo","budem","bude",
]);

export function slovaOtazky(otazka: string): string[] {
  return [
    ...new Set(
      bezDiakritiky(otazka)
        .replace(/[^a-z0-9§\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPKY.has(w)),
    ),
  ];
}

export type Najdene = { clanok: Clanok; sekcia: Sekcia; skore: number };

/**
 * Sekcie zoradené podľa toho, ako sedia na otázku.
 *
 * Nadpis váži viac než telo: keď sa slovo objaví v nadpise, sekcia je takmer
 * isto o ňom, kým v texte môže byť len mimochodom.
 */
export function najdiSekcie(otazka: string, limit = 4): Najdene[] {
  const slova = slovaOtazky(otazka);
  if (!slova.length) return [];

  const najdene: Najdene[] = [];
  for (const clanok of MANUALY) {
    const titulok = bezDiakritiky(clanok.titulok);
    for (const sekcia of clanok.sekcie) {
      const nadpis = bezDiakritiky(sekcia.nadpis);
      const text = bezDiakritiky(sekcia.text);
      let skore = 0;
      for (const slovo of slova) {
        if (titulok.includes(slovo)) skore += 4;
        if (nadpis.includes(slovo)) skore += 3;
        const vyskyty = text.split(slovo).length - 1;
        if (vyskyty) skore += Math.min(3, vyskyty);
      }
      if (skore > 0) najdene.push({ clanok, sekcia, skore });
    }
  }

  return najdene.sort((a, b) => b.skore - a.skore || a.sekcia.text.length - b.sekcia.text.length).slice(0, limit);
}

/** Obsah celej pomoci — aby asistent vedel, na čo sa dá odkázať. */
export function obsahManualov(): string {
  const riadky = ["# Manuály Faktera (obsah)", ""];
  for (const c of MANUALY) {
    riadky.push(`- **${c.titulok}** (${c.cesta}): ${c.sekcie.map((s) => s.nadpis).join(", ")}`);
  }
  return riadky.join("\n");
}

/** Strop, aby jedna otázka nevyhnala prompt do desiatok kilobajtov. */
export const MAX_ZNAKOV = 12000;

/** Text pre prompt: obsah pomoci a k tomu najbližšie sekcie v plnom znení. */
export function znalostiKOtazke(otazka: string, limit = 4): string {
  const najdene = najdiSekcie(otazka, limit);
  const casti = [obsahManualov()];
  if (najdene.length) {
    casti.push("", "# Úryvky z manuálov k tejto otázke", "");
    let zostava = MAX_ZNAKOV;
    for (const n of najdene) {
      const kus = `## ${n.clanok.titulok} — ${n.sekcia.nadpis}\nZdroj: ${n.clanok.cesta}\n${n.sekcia.text}`;
      if (kus.length > zostava) break;
      zostava -= kus.length;
      casti.push(kus, "");
    }
  }
  return casti.join("\n");
}
