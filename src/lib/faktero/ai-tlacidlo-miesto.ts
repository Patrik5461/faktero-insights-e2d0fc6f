/**
 * Kam s plávajúcim tlačidlom AI na úzkej obrazovke, aby nič neprekrývalo.
 *
 * Tlačidlo sedí vpravo dole (`ODSTUP` od okraja, `VELKOST` veľké). Obsah stránky
 * pod neho nikdy nezapadne natrvalo — `main` má na telefóne rezervu na spodku
 * (`html[data-ai-tlacidlo]` v styles.css), takže posledné tlačidlo stránky sa
 * dá vždy odrolovať nad neho. Čo sa odrolovať nedá, sú pevné (`fixed`) alebo
 * prilepené (`sticky`) lišty pri spodku obrazovky — pätička s Uložiť/Zaúčtovať,
 * súčtová lista výberu… Nad takú lištu sa tlačidlo zdvihne.
 */
export const VELKOST = 40;
export const ODSTUP = 16;
/** Medzera medzi lištou a zdvihnutým tlačidlom. */
export const MEDZERA = 8;

export type Prekazka = { top: number; bottom: number; left: number; right: number };

/**
 * O koľko pixelov zdvihnúť tlačidlo (0 = ostáva dole), keď sa jeho pôvodné
 * miesto kryje s pevnými/prilepenými lištami `prekazky` (súradnice okna).
 * Berú sa len lišty v spodnej polovici obrazovky — hornú hlavičku nie.
 * Výsledok je obmedzený tak, aby tlačidlo ostalo na obrazovke.
 */
export function zdvihTlacidla(
  prekazky: Prekazka[],
  okno: { sirka: number; vyska: number },
): number {
  const tlacidlo = {
    left: okno.sirka - ODSTUP - VELKOST,
    right: okno.sirka - ODSTUP,
    top: okno.vyska - ODSTUP - VELKOST,
    bottom: okno.vyska - ODSTUP,
  };
  let najvyssie = Infinity;
  for (const p of prekazky) {
    if (p.top < okno.vyska / 2) continue;
    const x = Math.min(p.right, tlacidlo.right) - Math.max(p.left, tlacidlo.left);
    const y = Math.min(p.bottom, tlacidlo.bottom) - Math.max(p.top, tlacidlo.top);
    if (x > 0 && y > 0) najvyssie = Math.min(najvyssie, p.top);
  }
  if (najvyssie === Infinity) return 0;
  const zdvih = tlacidlo.bottom - najvyssie + MEDZERA;
  return Math.max(0, Math.min(zdvih, okno.vyska - VELKOST - 2 * ODSTUP - 56));
}

/** Je fokus v poli, nad ktorým sa na telefóne otvára klávesnica? */
export function pisaciePole(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (tag !== "INPUT") return false;
  const typ = (el as HTMLInputElement).type;
  return ![
    "checkbox",
    "radio",
    "button",
    "submit",
    "reset",
    "file",
    "range",
    "color",
    "image",
  ].includes(typ);
}
