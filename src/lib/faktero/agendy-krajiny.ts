import type { KrajinaDane } from "./vat-rates";

/**
 * Agendy postavené na slovenských predpisoch, ktoré nemecká firma nedostane.
 * Z menu zmiznú v `filterNav` (`components/faktero/nav.ts`) a priamy vstup na adresu ukáže namiesto agendy
 * vysvetlenie (`AppShell` → `NedostupnePreDe`). Dôvod je slovenský kľúč pre `t`.
 *
 *  - Pokladňa: v Nemecku musí elektronický pokladničný systém mať certifikovaný
 *    bezpečnostný modul TSE (§ 146a AO, KassenSichV) a byť nahlásený
 *    Finanzamtu — Faktero TSE nemá, eKasa je slovenská evidencia.
 *  - Kniha jázd: nemecké Fahrtenbuch musí byť vedené priebežne a zápisy sa
 *    nesmú dať dodatočne meniť bez stopy (BFH, R 8.1 Abs. 9 LStR); kniha jázd
 *    vo Fakture jazdy opraviť dovoľuje.
 *  - Zamestnanci: agenda je stavaná na slovenské pracovné právo a mzdy
 *    (rodné číslo, OP, slovenské šablóny); nemecké mzdy (Lohnsteuer, SV)
 *    nepozná.
 */
export const NIE_PRE_DE: { prefix: string; nazov: string; dovod: string }[] = [
  {
    prefix: "/pokladna",
    nazov: "Pokladňa",
    dovod:
      "Elektronická pokladnica musí mať v Nemecku certifikovaný bezpečnostný modul TSE a byť nahlásená finančnému úradu (§ 146a AO, KassenSichV). Pokladňa vo Fakture je postavená na slovenskej eKase a TSE nemá. Hotovostné príjmy zaznamenajte v certifikovanej pokladnici a vo Fakture vystavujte faktúry.",
  },
  {
    prefix: "/jazdy",
    nazov: "Kniha jázd",
    dovod:
      "Nemecký finančný úrad uzná Fahrtenbuch len vtedy, keď je vedené priebežne a zápisy sa nedajú dodatočne meniť bez stopy. Kniha jázd vo Fakture jazdy opraviť dovoľuje (podľa slovenských pravidiel), preto by ju Finanzamt mohol odmietnuť.",
  },
  {
    prefix: "/zamestnanci",
    nazov: "Zamestnanci",
    dovod:
      "Agenda zamestnancov je stavaná na slovenské pracovné právo a mzdy (rodné číslo, slovenské šablóny zmlúv). Nemecké mzdy (Lohnsteuer, sociálne poistenie) nepozná.",
  },
];

/** Agenda, ktorá pre firmu v danej krajine nie je — inak `null`. */
export function nedostupneAgendy(pathname: string, krajina: KrajinaDane | null | undefined) {
  if (krajina !== "DE") return null;
  return (
    NIE_PRE_DE.find((x) => pathname === x.prefix || pathname.startsWith(`${x.prefix}/`)) ?? null
  );
}

/**
 * Patrí agenda (podľa cesty) firme v danej krajine? Jedna podmienka pre menu,
 * nástenku, zvonček, Moje úlohy, denný súhrn aj vyhľadávanie — aby sa nemecká
 * firma nikde nestretla s odkazom na agendu, ktorú nemá.
 */
export function agendaPreKrajinu(cesta: string, krajina: KrajinaDane | null | undefined): boolean {
  return !nedostupneAgendy(cesta, krajina);
}
