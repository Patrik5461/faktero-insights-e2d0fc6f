/*
  Viac dokladov naraz — čistá logika dávky.

  Človek nafotí alebo vyberie z galérie viac **rôznych** dokladov a každý z
  nich ide samostatne tou istou cestou ako jeden doklad zo skenera: nahratie
  do Nespracovaných (`sken-nahraj`), doptávanie sa na rozpoznanie
  (`sken-stav`) a vytvorenie podľa druhu (`sken-vytvor`). Viacstranový doklad
  je iná vec — tam je viac strán JEDNÉHO dokladu spojených do PDF.

  Tu je len to, čo sa dá rozhodnúť bez siete a bez Reactu: v akom stave je
  ktorý doklad, ktoré sa smú nahrávať (najviac dva súčasne — desať fotiek
  naraz by zahltilo mobilnú sieť aj čítanie na serveri) a ktoré sa dajú
  uložiť hromadne bez toho, aby sa na ne človek pozrel.
*/

import { nesediZChyby, textNesedi } from "@/lib/faktero/cudzia-faktura";
import {
  chybajuce,
  nacitajUdaje,
  type DruhNespracovaneho,
  type UdajeNespracovaneho,
} from "@/lib/faktero/nespracovane";
import { PREDPONA_DUPLICITY } from "@/lib/faktero/prijate-duplicity";
import {
  doplnZNastavenia,
  rozoberDataUrl,
  STROP_CITANIA_MS,
  type NastavenieSkenu,
} from "./sken-rozpoznanie";

export type StavVDavke =
  /** Čaká, kým sa uvoľní miesto na nahratie. */
  | "caka"
  | "nahravam"
  /** Nahraté, server ho číta. */
  | "citam"
  /** Čítanie prekročilo strop — doklad je v Nespracovaných, dá sa otvoriť a počkať. */
  | "dlho"
  /** Prečítané a nič nechýba — dá sa uložiť hromadne. */
  | "rozpoznane"
  /** Prečítané, ale niečo chýba (aj druh) — doplní človek ťuknutím. */
  | "doplnit"
  /** Server pri hromadnom ukladaní ohlásil rovnaký doklad v evidencii. */
  | "duplicita"
  | "ukladam"
  | "ulozene"
  | "chyba";

export type DokladVDavke = {
  /** Kľúč v rámci dávky (nie id na serveri — to vznikne až nahratím). */
  kluc: string;
  /** Fotka alebo súbor ako data URL — na nahratie aj na náhľad. */
  subor: string;
  nazov: string;
  mime: string;
  stav: StavVDavke;
  /** Id v Nespracovaných dokladoch; `null`, kým sa doklad nenahral. */
  id: string | null;
  druh: DruhNespracovaneho | null;
  /** Prečítané údaje s doplneným nastavením zo skenera. */
  udaje: UdajeNespracovaneho | null;
  /** Výsledok `chybajuce()` — prázdny pri rozpoznanom doklade. */
  chybajuce: string[];
  povinne: string[];
  /** Správa zo servera (chyba nahratia, uloženia, duplicita). */
  chyba: string | null;
  /** Súbor je na nahratie priveľký — opakovať nemá zmysel. */
  prilisVelky: boolean;
  /**
   * Nahratie zlyhalo tak, že opakovanie nepomôže (prázdny alebo neplatný
   * súbor, neaktívne predplatné) — ťuknutie ho už neskúša znova.
   */
  natrvalo?: TrvalaChyba | null;
  zaciatokCitania: number | null;
};

/** Koľko dokladov sa nahráva súčasne. */
export const MAX_SUCASNE = 2;
/** Koľko dokladov unesie jedna dávka — všetky sú v pamäti telefónu ako data URL. */
export const MAX_V_DAVKE = 20;
/** Strop servera na jeden súbor (`nahrajNespracovaneFn`). */
export const MAX_VELKOST_B = 15 * 1024 * 1024;

/** Veľkosť súboru v data URL bez dekódovania. */
export function velkostDataUrl(dataUrl: string): number {
  const ciarka = dataUrl.indexOf(",");
  const b64 = ciarka >= 0 ? dataUrl.slice(ciarka + 1) : dataUrl;
  const vypln = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - vypln);
}

/**
 * Nový doklad v dávke.
 *
 * S `id` už je nahraný — prišiel z obrazovky jedného dokladu, kde si človek
 * povedal „Odfotiť ďalší doklad", a čaká sa len na prečítanie.
 */
export function novyDoklad(
  vstup: { subor: string; nazov?: string | null; id?: string | null },
  kluc: string,
  teraz: number,
): DokladVDavke {
  const { mime, nazov } = rozoberDataUrl(vstup.subor, vstup.nazov);
  const prilisVelky = !vstup.id && velkostDataUrl(vstup.subor) > MAX_VELKOST_B;
  return {
    kluc,
    subor: vstup.subor,
    nazov,
    mime,
    stav: vstup.id ? "citam" : prilisVelky ? "chyba" : "caka",
    id: vstup.id ?? null,
    druh: null,
    udaje: null,
    chybajuce: [],
    povinne: [],
    chyba: null,
    prilisVelky,
    natrvalo: null,
    zaciatokCitania: vstup.id ? teraz : null,
  };
}

/** Prečo sa súbor nedá nahrať ani na ďalší pokus. */
export type TrvalaChyba = "predplatne" | "prazdny" | "velky" | "neplatny";

/**
 * Chyba nahratia: dá sa to skúsiť znova (sieť, výpadok servera), alebo nie?
 *
 * Predtým každá chyba svietila „Chyba — ťuknite a skúste znova" a ťuknutie
 * nahrávalo ten istý súbor dokola — pri prázdnom súbore (fotka z iCloudu,
 * ktorá sa ešte nestiahla) či neaktívnom predplatnom zakaždým s tým istým
 * výsledkom. Kontrola vstupu na serveri (zod) navyše vracia JSON, ktorý sa
 * vypísal človeku ako správa.
 */
export function chybaNahratia(sprava: string): {
  chyba: string | null;
  natrvalo: TrvalaChyba | null;
} {
  const t = String(sprava ?? "").trim();
  if (/predplatn|plan_inactive/i.test(t)) return { chyba: t, natrvalo: "predplatne" };
  if (/súbor je prázdny/i.test(t)) return { chyba: null, natrvalo: "prazdny" };
  if (/väčší než|too large|payload too large|413/i.test(t))
    return { chyba: null, natrvalo: "velky" };
  // Odmietnutý vstup (zod): `[{"code":"too_small",…,"path":["subor"]}]`.
  if (/^\[\s*\{/.test(t) && /"code"\s*:/.test(t)) {
    const prazdny = /"path"\s*:\s*\[\s*"subor"/.test(t) && /too_small/.test(t);
    return { chyba: null, natrvalo: prazdny ? "prazdny" : "neplatny" };
  }
  return { chyba: t || null, natrvalo: null };
}

/**
 * Zmena jedného dokladu; ostatné ostanú tie isté objekty.
 *
 * S `lenVStave` sa zmena zapíše, len keď je doklad stále v tom stave. Odpoveď
 * na doptávanie môže doraziť až potom, čo človek doklad medzitým uložil na
 * jeho obrazovke — „Uložené" by inak prepísala späť na „Rozpoznané".
 */
export function zmen(
  davka: DokladVDavke[],
  kluc: string,
  zmena: Partial<DokladVDavke>,
  lenVStave?: StavVDavke,
): DokladVDavke[] {
  return davka.map((d) =>
    d.kluc === kluc && (!lenVStave || d.stav === lenVStave) ? { ...d, ...zmena } : d,
  );
}

/**
 * Ktoré doklady sa majú začať nahrávať teraz — v poradí, v akom prišli, a
 * najviac toľko, aby spolu s rozbehnutými neprekročili `max`.
 */
export function naNahratie(davka: DokladVDavke[], max = MAX_SUCASNE): string[] {
  const bezi = davka.filter((d) => d.stav === "nahravam").length;
  const volne = Math.max(0, max - bezi);
  return davka
    .filter((d) => d.stav === "caka")
    .slice(0, volne)
    .map((d) => d.kluc);
}

/** Doklady, na ktorých prečítanie sa treba doptať. */
export function naCitanie(davka: DokladVDavke[]): DokladVDavke[] {
  return davka.filter((d) => d.stav === "citam" && d.id);
}

/** Čítanie trvá dlhšie, než sa oplatí čakať. */
export function poStrope(d: DokladVDavke, teraz: number, strop = STROP_CITANIA_MS): boolean {
  return d.stav === "citam" && d.zaciatokCitania != null && teraz - d.zaciatokCitania > strop;
}

/** Odpoveď `sken-stav` — to, čo z nej dávka potrebuje. */
export type DetailSkenu = {
  stav: string;
  druh: string | null;
  udaje: unknown;
  chyba?: string | null;
  povinne?: string[];
  /** Kontroly firmy (tolerancia zaokrúhlenia, splatnosť). */
  nastavenia?: { toleranciaCenty?: number; kontrolaSplatnosti?: boolean };
};

const DRUHY = new Set<DruhNespracovaneho>(["faktura", "zalohova", "dobropis", "blocek", "ostatny"]);

/**
 * Výsledok čítania zapísaný do dokladu.
 *
 * `null` = server ešte číta. Údaje dostanú to isté nastavenie zo skenera ako
 * pri jednom doklade (`doplnZNastavenia`) a to, čo chýba, sa počíta tou istou
 * `chybajuce()` ako na serveri — inak by dávka sľúbila uloženie, ktoré server
 * odmietne. Neúspešné čítanie („chyba" na serveri) sa nehlási ako chyba
 * dávky: doklad je nahratý a dá sa doplniť ručne.
 */
export function vyhodnotDetail(
  d: DetailSkenu,
  nastavenie?: NastavenieSkenu | null,
): Pick<DokladVDavke, "stav" | "druh" | "udaje" | "chybajuce" | "povinne" | "chyba"> | null {
  if (d.stav === "cita") return null;
  const druh =
    d.druh && DRUHY.has(d.druh as DruhNespracovaneho) ? (d.druh as DruhNespracovaneho) : null;
  const povinne = d.povinne ?? [];
  const surove = nacitajUdaje(d.udaje);
  const udaje = druh ? doplnZNastavenia(surove, druh, nastavenie) : surove;
  const chyba = chybajuce(druh, udaje, povinne, d.nastavenia);
  return {
    stav: chyba.length === 0 ? "rozpoznane" : "doplnit",
    druh,
    udaje,
    chybajuce: chyba,
    povinne,
    chyba: d.stav === "chyba" ? (d.chyba ?? null) : null,
  };
}

/**
 * Čo sa uloží tlačidlom „Uložiť všetky rozpoznané".
 *
 * Len doklady s rozpoznaným druhom, kde nič nechýba. Možné duplicity sem
 * nepatria — rovnaký doklad v evidencii musí posúdiť človek, appka ho za neho
 * nepotvrdí. Rovnako tie, ktoré treba doplniť.
 */
export function naHromadneUlozenie(davka: DokladVDavke[]): DokladVDavke[] {
  return davka.filter(
    (d) => d.stav === "rozpoznane" && !!d.id && !!d.druh && !!d.udaje && d.chybajuce.length === 0,
  );
}

/** Stav po neúspešnom hromadnom uložení — duplicita sa odlíši od chyby. */
export function poChybeUlozenia(sprava: string): Pick<DokladVDavke, "stav" | "chyba"> {
  if (sprava.startsWith(PREDPONA_DUPLICITY))
    return { stav: "duplicita", chyba: sprava.slice(PREDPONA_DUPLICITY.length).trim() };
  // Faktúra inej firmy — po ťuknutí detail ponúkne „Uložiť aj tak“.
  const cudzia = nesediZChyby(sprava);
  if (cudzia) return { stav: "chyba", chyba: textNesedi(cudzia) };
  return { stav: "chyba", chyba: sprava || null };
}

/**
 * Čo urobí ťuknutie na doklad.
 *
 * - `detail` — otvorí sa obrazovka jedného dokladu (doplnenie, duplicita,
 *   dlhé čítanie, chyba uloženia),
 * - `znova` — doklad sa nenahral, skúsi sa to znova,
 * - `null` — nie je čo robiť (pracuje sa na ňom, je uložený, je priveľký).
 */
export function poTuknuti(d: DokladVDavke): "detail" | "znova" | null {
  if (d.stav === "chyba") return d.id ? "detail" : d.prilisVelky || d.natrvalo ? null : "znova";
  if (["citam", "dlho", "rozpoznane", "doplnit", "duplicita"].includes(d.stav)) return "detail";
  return null;
}

/**
 * Ďalší doklad dávky na „Uložiť a ďalší" / „Preskočiť".
 *
 * Hľadá sa za práve otvoreným (a potom od začiatku), aby sa človek dávkou
 * posúval dopredu a nevracal sa na doklad, ktorý práve preskočil. Berie sa
 * len to, čo sa dá otvoriť (`poTuknuti` = `detail`) a ešte nie je uložené.
 */
export function dalsiNaOtvorenie(davka: DokladVDavke[], kluc: string): DokladVDavke | null {
  const i = davka.findIndex((d) => d.kluc === kluc);
  const poradie = [...davka.slice(i + 1), ...davka.slice(0, Math.max(0, i))];
  return poradie.find((d) => d.kluc !== kluc && !!d.id && poTuknuti(d) === "detail") ?? null;
}

/** Súhrn dávky — pre tlačidlá a hlášku pri zatvorení. */
export function suhrn(davka: DokladVDavke[]): {
  spolu: number;
  ulozene: number;
  /** Nahraté a neuložené — ostávajú v Nespracovaných dokladoch. */
  vNespracovanych: number;
  /** Ešte sa nenahrali — zavretím dávky by sa stratili. */
  nenahrane: number;
  naHromadne: number;
  pracuje: boolean;
} {
  return {
    spolu: davka.length,
    ulozene: davka.filter((d) => d.stav === "ulozene").length,
    vNespracovanych: davka.filter((d) => d.id && d.stav !== "ulozene").length,
    nenahrane: davka.filter((d) => !d.id && !d.prilisVelky && !d.natrvalo).length,
    naHromadne: naHromadneUlozenie(davka).length,
    pracuje: davka.some((d) => d.stav === "nahravam" || d.stav === "ukladam"),
  };
}
