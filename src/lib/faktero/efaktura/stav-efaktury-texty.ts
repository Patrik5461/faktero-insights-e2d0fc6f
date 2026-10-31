import type {
  DovodEfaktury,
  OdpovedOdberatela,
  StavEfaktury,
  StavEfakturyKod,
} from "./stav-efaktury";

/*
  Texty stavu eFaktúry pre web — slovenské vety, ktoré sú zároveň kľúčmi
  slovníka `t()` (preklady v `i18n/{de,cs}/web-efaktura-stav.ts`). Sú to tie
  isté vety ako v appke (`mobile/preklady/sk.ts`, kľúče `efs.*`), pravidlá
  stavu sú spoločné v `stav-efaktury.ts`.
*/

export const TEXT_STAVU: Record<StavEfakturyKod, string> = {
  odoslana: "eFaktúra odoslaná",
  dorucena: "eFaktúra doručená",
  prijata: "Odberateľ eFaktúru prijal",
  zamietnuta: "Odberateľ eFaktúru zamietol",
  zlyhala: "Odoslanie eFaktúry zlyhalo",
};

/** Popis pri čase („Doručená 31. 10. 14:05“). */
export const TEXT_CASU: Record<StavEfakturyKod, string> = {
  odoslana: "Odoslaná",
  dorucena: "Doručená",
  prijata: "Prijatá",
  zamietnuta: "Zamietnutá",
  zlyhala: "Zlyhala",
};

export const TEXT_DOVODU: Record<DovodEfaktury, string> = {
  nie_v_peppole:
    "Odberateľ nie je zaregistrovaný v sieti Peppol. Pošlite mu faktúru inak (napríklad e-mailom); ak sa zaregistruje do 15 dní, dá sa poslať znova.",
  typ_neprijima: "Odberateľ je v sieti Peppol, ale tento druh dokladu cez eFaktúru neprijíma.",
  validacia: "Faktúra neprešla kontrolou formátu eFaktúry. Chyby ukáže detail faktúry na webe.",
  odmietnuta_technicky: "Systém odberateľa faktúru technicky odmietol.",
  adresar_nedostupny: "Adresár siete Peppol bol nedostupný. Skúste ju odoslať znova neskôr.",
  doprava_zlyhala: "Doručenie zlyhalo ani po opakovaných pokusoch. Skúste ju odoslať znova neskôr.",
  bez_efaktury: "Firma nemá zapnutú eFaktúru. Zapnete ju na webe v časti eFaktúra.",
  duplicitne_cislo:
    "Faktúra s týmto číslom už eFaktúrou odišla. Pod tým istým číslom ju poslať znova nemožno — vystavte opravný doklad alebo faktúru s novým číslom.",
  sluzba_nedostupna: "Služba eFaktúry bola dočasne nedostupná. Skúste ju odoslať znova neskôr.",
  neznamy: "Služba eFaktúry faktúru neprijala.",
};

export const TEXT_ZAMIETNUTIA =
  "Odberateľ faktúru v eFaktúre zamietol. Dohodnite sa s ním a v prípade potreby vystavte opravný doklad.";

export const TEXT_ODPOVEDE: Record<OdpovedOdberatela, string> = {
  otazka: "Odberateľ má k faktúre otázku.",
  spracuva: "Odberateľ faktúru spracúva.",
  s_vyhradou: "Prijatá s výhradou.",
  zaplatena: "Odberateľ ju označil ako zaplatenú.",
};

export function textStavuEfaktury(s: StavEfaktury): string {
  return TEXT_STAVU[s.stav];
}

export function textCasuEfaktury(s: StavEfaktury): string {
  return TEXT_CASU[s.stav];
}

/** Dôvod ľudskou rečou — len pri zlyhanej alebo zamietnutej. */
export function textDovoduEfaktury(s: StavEfaktury): string | null {
  if (s.stav === "zamietnuta") return TEXT_ZAMIETNUTIA;
  if (s.stav !== "zlyhala") return null;
  return TEXT_DOVODU[s.dovod ?? "neznamy"];
}

export function textOdpovedeEfaktury(s: StavEfaktury): string | null {
  return s.odpoved ? TEXT_ODPOVEDE[s.odpoved] : null;
}

/** Červená (chyba) — zlyhané odoslanie alebo zamietnutie odberateľom. */
export function jeChybaEfaktury(s: StavEfaktury | null | undefined): boolean {
  return s?.stav === "zlyhala" || s?.stav === "zamietnuta";
}

/**
 * Faktúra už eFaktúrou odišla (aj keď ju odberateľ zamietol) — hromadné
 * odoslanie ju preskočí. Zlyhaná sa dá poslať znova.
 */
export function efakturaUzOdisla(s: StavEfaktury | null | undefined): boolean {
  return !!s && s.stav !== "zlyhala";
}

/**
 * Podrobnosti od služby ukázať len vtedy, keď dôvod nevieme pomenovať sami —
 * pri známom dôvode by technický text len mátol.
 */
export function ukazatDetailEfaktury(s: StavEfaktury): boolean {
  return s.stav === "zlyhala" && (s.dovod ?? "neznamy") === "neznamy" && !!s.detail;
}

/** Všetky texty (na kontrolu prekladov v teste). */
export const VSETKY_TEXTY_STAVU: string[] = [
  ...Object.values(TEXT_STAVU),
  ...Object.values(TEXT_CASU),
  ...Object.values(TEXT_DOVODU),
  TEXT_ZAMIETNUTIA,
  ...Object.values(TEXT_ODPOVEDE),
];
