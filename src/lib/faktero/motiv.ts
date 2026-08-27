/**
 * Svetlý a tmavý režim.
 *
 * Farby pre tmavý režim v `styles.css` existovali od začiatku a v komponentoch
 * je vyše sto tried `dark:` — chýbalo len to, čo triedu `dark` na stránku
 * nasadí. Toto je tá chýbajúca časť.
 *
 * Sú tri možnosti, nie dve: `system` znamená „ako to má telefón či počítač".
 * Bez nej by človek s nočným režimom v systéme musel Faktero prepínať ručne
 * dvakrát denne.
 */

export type Motiv = "svetly" | "tmavy" | "system";

export const KLUC_MOTIVU = "faktero.motiv";

/** Predvolene sa riadime systémom — je to najmenej prekvapivé. */
export const VYCHODZI: Motiv = "system";

/**
 * V mobilnej aplikácii je predvolený svetlý režim.
 *
 * Appka je navrhnutá ako svetlá — doklady, sumy a stavy sa čítajú na bielom.
 * Tmavý ostáva k dispozícii, ale zapína sa vedome, nie tým, že má človek
 * v telefóne nočný režim.
 */
export const VYCHODZI_APKA: Motiv = "svetly";

export function jeMotiv(hodnota: unknown): hodnota is Motiv {
  return hodnota === "svetly" || hodnota === "tmavy" || hodnota === "system";
}

/** Čo si človek zvolil. Nečitateľné úložisko nie je dôvod appku zhodiť. */
export function nacitajMotiv(vychodzi: Motiv = VYCHODZI): Motiv {
  try {
    const ulozene = localStorage.getItem(KLUC_MOTIVU);
    return jeMotiv(ulozene) ? ulozene : vychodzi;
  } catch {
    return vychodzi;
  }
}

/** Ako to má systém. Mimo prehliadača (server) predpokladáme svetlý. */
export function systemChceTmavy(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** Výsledok voľby — čo sa má naozaj zobraziť. */
export function vyslednyMotiv(volba: Motiv, systemTmavy: boolean): "svetly" | "tmavy" {
  if (volba === "system") return systemTmavy ? "tmavy" : "svetly";
  return volba;
}

/**
 * Nasadí motív na stránku.
 *
 * Trieda ide na `<html>`, nie na `<body>`: variant je definovaný ako
 * `&:is(.dark *)`, čiže platí pre **potomkov** označeného prvku. Na `<body>`
 * by sa samotné pozadie stránky nezmenilo.
 *
 * `color-scheme` mení aj to, čo kreslí prehliadač sám — posuvníky, výber
 * dátumu, políčka. Bez neho ostane v tmavom režime biely kalendár.
 */
export function nasadMotiv(volba: Motiv): void {
  try {
    const tmavy = vyslednyMotiv(volba, systemChceTmavy()) === "tmavy";
    const koren = document.documentElement;
    koren.classList.toggle("dark", tmavy);
    koren.style.colorScheme = tmavy ? "dark" : "light";
  } catch {
    /* bez DOM sa nedá nasadiť nič a nie je to chyba */
  }
}

/**
 * Je práve tma? Pre veci mimo CSS — status bar telefónu farbu z triedy
 * `dark` prečítať nevie a musí ju dostať ako hodnotu.
 */
export function jeTmavy(volba: Motiv = nacitajMotiv(VYCHODZI_APKA)): boolean {
  return vyslednyMotiv(volba, systemChceTmavy()) === "tmavy";
}

/** Uloží voľbu a hneď ju nasadí. */
export function ulozMotiv(volba: Motiv): void {
  try {
    localStorage.setItem(KLUC_MOTIVU, volba);
  } catch {
    /* v súkromnom okne sa uložiť nedá; aspoň nech platí do zatvorenia */
  }
  nasadMotiv(volba);
}

/**
 * Sleduje zmenu systémového nastavenia.
 *
 * Má zmysel len pri voľbe `system` — kto si vybral pevne, ten nechce, aby mu
 * to o polnoci preplo. Vracia funkciu na odhlásenie.
 */
export function sledujSystem(dajVolbu: () => Motiv): () => void {
  try {
    if (typeof matchMedia !== "function") return () => {};
    const dotaz = matchMedia("(prefers-color-scheme: dark)");
    const reakcia = () => {
      if (dajVolbu() === "system") nasadMotiv("system");
    };
    dotaz.addEventListener("change", reakcia);
    return () => dotaz.removeEventListener("change", reakcia);
  } catch {
    return () => {};
  }
}

/**
 * Skript do hlavičky stránky.
 *
 * Beží pred prvým vykreslením, takže tmavý režim nezačne bielym bliknutím.
 * Je zámerne krátky a bez závislostí — do `<head>` sa nedá dostať nič, čo by
 * sa muselo najprv stiahnuť.
 */
export const SKRIPT_DO_HLAVICKY = `(function(){try{
var v=localStorage.getItem(${JSON.stringify(KLUC_MOTIVU)})||${JSON.stringify(VYCHODZI)};
var t=v==="tmavy"||(v==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
var k=document.documentElement;
k.classList.toggle("dark",t);k.style.colorScheme=t?"dark":"light";
}catch(e){}})();`;
