/**
 * Sekcie manuálov, ktoré platia len pri zapnutej integrácii.
 *
 * Stránka ich pri vypnutej integrácii skryje (napr. `sekciePodpory` v
 * pomoc.podpora.tsx), ale `znalosti-manualy.mjs` číta zdroják a videl by ich
 * vždy — asistent by potom sľuboval číslo a tlačidlá, ktoré nikde nie sú.
 * Sekcia sa spozná podľa `id` zo zdrojáku, a keby ho nemala (alebo pri čistení
 * už vyrobeného JSON, kde `id` nie je), podľa nadpisu.
 */
export const PODMIENENE_SEKCIE = [
  { cesta: "/pomoc/podpora", id: "whatsapp", nadpis: "Cez WhatsApp", podmienka: "whatsapp" },
];

/** Podmienka sekcie, alebo `undefined`, keď platí vždy. */
export function podmienkaSekcie(cesta, sekcia) {
  return PODMIENENE_SEKCIE.find(
    (p) =>
      p.cesta === cesta &&
      ((sekcia.id && sekcia.id === p.id) || sekcia.nadpis?.trim() === p.nadpis),
  )?.podmienka;
}

/**
 * Ktoré podmienky platia. WhatsApp je zapnutý, keď server má token aj ID
 * čísla (rovnako ako `jeWhatsAppZapnuty` vo whatsapp.server.ts), alebo keď
 * to pri generovaní niekto výslovne povie `ZNALOSTI_WHATSAPP=1`.
 */
export function zapnutePodmienky(env = {}) {
  const zapnute = new Set();
  const ano = (v) => v === "1" || v === "true";
  if ((env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) || ano(env.ZNALOSTI_WHATSAPP))
    zapnute.add("whatsapp");
  if (env.ZNALOSTI_WHATSAPP === "0") zapnute.delete("whatsapp");
  return zapnute;
}

/** Sekcie článku bez tých, ktorých podmienka neplatí. */
export function vyradPodmienene(cesta, sekcie, zapnute) {
  return sekcie.filter((s) => {
    const podmienka = podmienkaSekcie(cesta, s);
    return !podmienka || zapnute.has(podmienka);
  });
}

/** Vyradí podmienené sekcie z celej bázy (aj z už vyrobeného JSON). */
export function vyradZBazy(clanky, zapnute) {
  return clanky
    .map((c) => ({ ...c, sekcie: vyradPodmienene(c.cesta, c.sekcie, zapnute) }))
    .filter((c) => c.sekcie.length);
}
