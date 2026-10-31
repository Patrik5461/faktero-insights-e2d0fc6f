import type {
  DovodEfaktury,
  OdpovedOdberatela,
  StavEfaktury,
  StavEfakturyKod,
} from "@/lib/faktero/efaktura/stav-efaktury";
import type { Ton } from "@/components/faktero/mobil/ui";
import type { Kluc } from "./preklady";

/*
  Stav eFaktúry pre appku — len kľúče slovníka a farby. Samotné pravidlá
  (čo je odoslaná, doručená, zlyhaná…) sú spoločné s webom v
  `lib/faktero/efaktura/stav-efaktury.ts`. Funkcie vracajú kľúč, nie text:
  sú mimo komponentu a preklad tam nedosiahne.
*/

const STAV: Record<StavEfakturyKod, Kluc> = {
  odoslana: "efs.stav.odoslana",
  dorucena: "efs.stav.dorucena",
  prijata: "efs.stav.prijata",
  zamietnuta: "efs.stav.zamietnuta",
  zlyhala: "efs.stav.zlyhala",
};

/** Popis pri čase („Doručená 31. 10. 14:05“). */
const CAS: Record<StavEfakturyKod, Kluc> = {
  odoslana: "efs.cas.odoslana",
  dorucena: "efs.cas.dorucena",
  prijata: "efs.cas.prijata",
  zamietnuta: "efs.cas.zamietnuta",
  zlyhala: "efs.cas.zlyhala",
};

const DOVOD: Record<DovodEfaktury, Kluc> = {
  nie_v_peppole: "efs.dovod.nieVPeppole",
  typ_neprijima: "efs.dovod.typNeprijima",
  validacia: "efs.dovod.validacia",
  odmietnuta_technicky: "efs.dovod.odmietnutaTechnicky",
  adresar_nedostupny: "efs.dovod.adresarNedostupny",
  doprava_zlyhala: "efs.dovod.dopravaZlyhala",
  bez_efaktury: "efs.dovod.bezEfaktury",
  duplicitne_cislo: "efs.dovod.duplicitneCislo",
  sluzba_nedostupna: "efs.dovod.sluzbaNedostupna",
  neznamy: "efs.dovod.neznamy",
};

const ODPOVED: Record<OdpovedOdberatela, Kluc> = {
  otazka: "efs.odpoved.otazka",
  spracuva: "efs.odpoved.spracuva",
  s_vyhradou: "efs.odpoved.sVyhradou",
  zaplatena: "efs.odpoved.zaplatena",
};

const KANAL: Record<string, Kluc> = {
  peppol: "efs.kanal.peppol",
  digitalny_postar: "efs.kanal.digitalnyPostar",
  email: "efs.kanal.email",
  manual: "efs.kanal.manual",
};

export function klucStavuEfaktury(s: StavEfaktury): Kluc {
  return STAV[s.stav];
}

export function klucCasuEfaktury(s: StavEfaktury): Kluc {
  return CAS[s.stav];
}

/** Dôvod chyby ľudskou rečou — len pri zlyhanej alebo zamietnutej. */
export function klucDovoduEfaktury(s: StavEfaktury): Kluc | null {
  if (s.stav === "zamietnuta") return "efs.zamietnutaPopis";
  if (s.stav !== "zlyhala") return null;
  return DOVOD[s.dovod ?? "neznamy"];
}

export function klucOdpovedeEfaktury(s: StavEfaktury): Kluc | null {
  return s.odpoved ? ODPOVED[s.odpoved] : null;
}

/** Kanál doručenia; neznámy sa vráti ako `null` a ukáže sa surový. */
export function klucKanalaEfaktury(kanal: string | null | undefined): Kluc | null {
  return kanal ? (KANAL[kanal] ?? null) : null;
}

export function tonEfaktury(s: StavEfaktury): Ton {
  return s.stav === "zlyhala" || s.stav === "zamietnuta" ? "cervena" : "zelena";
}

/**
 * Podrobnosti od služby ukázať len vtedy, keď dôvod nevieme pomenovať sami —
 * pri známom dôvode by technický text len mátol.
 */
export function ukazatDetail(s: StavEfaktury): boolean {
  return s.stav === "zlyhala" && (s.dovod ?? "neznamy") === "neznamy" && !!s.detail;
}
