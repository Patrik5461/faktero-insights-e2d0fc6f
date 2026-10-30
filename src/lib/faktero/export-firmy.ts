import { bezVzorca } from "@/lib/bezpecny-text";
/**
 * Prevod záznamov na CSV pre kompletný export firmy.
 *
 * Formát je zámerne najhlúpejší možný — bodkočiarka a UTF-8 s BOM, teda to, čo
 * Excel otvorí bez sprievodcu importom. Účelom nie je pekný súbor, ale to, aby
 * sa dáta dali otvoriť aj o desať rokov a bez Faktera.
 */

export function csvHodnota(v: unknown): string {
  if (v === null || v === undefined) return "";
  // Objekt (napríklad rozpis DPH) sa uloží ako JSON — a ten musí prejsť tým
  // istým escapovaním, inak úvodzovky vnútri rozbijú celý riadok.
  const s = typeof v === "object" ? JSON.stringify(v) : bezVzorca(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Stĺpce, ktoré do exportu ani zálohy nepatria: prístupové tokeny verejných
 * odkazov (faktúra, schválenie, ponuka), šifrované a tajné hodnoty. Kto má
 * balík, nesmie sa nimi dostať k dokladom mimo aplikácie.
 */
const TAJNE_STLPCE = /(token|sifrovan|secret|tajomstv|heslo|password|api_key|_hash$)/i;

export function naCsv(riadky: Record<string, unknown>[], stlpce?: string[]): string {
  const hlavicka = (stlpce ?? [...new Set(riadky.flatMap((r) => Object.keys(r)))]).filter(
    (k) => !TAJNE_STLPCE.test(k),
  );
  const telo = riadky.map((r) => hlavicka.map((k) => csvHodnota(r[k])).join(";"));
  // BOM, inak Excel zje diakritiku.
  return "﻿" + [hlavicka.join(";"), ...telo].join("\r\n") + "\r\n";
}

/** Bezpečný názov súboru v balíku. */
export function nazovSuboru(text: string, pripona: string): string {
  const zaklad = String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${zaklad || "subor"}.${pripona}`;
}

/**
 * Názov, ktorý v priečinku balíka ešte nie je. Dva skeny s rovnakým dátumom,
 * dodávateľom a číslom (alebo bez čísla) sa predtým prepísali a v balíku
 * ostal len jeden — hoci počet hlásil oba.
 */
export function volnyNazov(pouzite: Set<string>, nazov: string): string {
  const bodka = nazov.lastIndexOf(".");
  const [zaklad, pripona] = bodka > 0 ? [nazov.slice(0, bodka), nazov.slice(bodka)] : [nazov, ""];
  let kandidat = nazov;
  for (let i = 2; pouzite.has(kandidat.toLowerCase()); i++) kandidat = `${zaklad}-${i}${pripona}`;
  pouzite.add(kandidat.toLowerCase());
  return kandidat;
}

/** Čo všetko balík obsahuje — vypisuje sa aj do sprievodného súboru. */
export const OBSAH_EXPORTU = [
  ["firma.csv", "údaje firmy vrátane nastavení DPH a číslovania"],
  ["faktury.csv", "vystavené faktúry, zálohové faktúry a dobropisy"],
  ["faktury-polozky.csv", "položky vystavených faktúr"],
  ["prijate-faktury.csv", "prijaté faktúry vrátane režimu DPH"],
  ["doklady.csv", "bločky a iné doklady s DPH"],
  ["ostatne-doklady.csv", "listy, predpisy, exekúcie a zmluvy"],
  ["uhrady-faktur.csv, uhrady-prijatych.csv", "úhrady vystavených a prijatých faktúr"],
  ["zalohy-faktur.csv", "zúčtovanie záloh na faktúrach"],
  ["ponuky.csv, ponuky-polozky.csv", "cenové ponuky"],
  ["objednavky.csv, objednavky-polozky.csv", "prijaté objednávky"],
  ["objednavky-dodavatelom.csv, …-polozky.csv", "objednávky dodávateľom"],
  ["pravidelne-faktury.csv", "pravidelné (opakované) faktúry"],
  ["odberatelia.csv", "karty odberateľov a dodávateľov"],
  ["produkty.csv", "cenník"],
  ["cennik-ceny.csv, cenove-skupiny.csv", "osobitné ceny a cenové skupiny"],
  ["sklad-*.csv", "sklady, skladové karty a pohyby"],
  ["pokladna.csv", "pokladničné pohyby"],
  ["bankove-ucty.csv", "bankové účty firmy"],
  ["banka.csv", "bankové pohyby"],
  ["jazdy.csv", "kniha jázd"],
  ["vozidla.csv, tankovanie.csv", "vozový park"],
  ["financovanie*.csv", "leasingy a úvery so splátkami"],
  ["vyuctovania-vydavkov.csv", "vyúčtovania výdavkov"],
  ["zakazky.csv", "zákazky"],
  ["prilohy*.csv", "zoznam príloh dokladov"],
  ["faktury-pdf/", "PDF vystavených faktúr (ak ste ich zahrnuli)"],
  ["kos/", "doklady a karty z koša — zmazané, ale obnoviteľné (rovnaké CSV, PDF a skeny)"],
  ["skeny/, prilohy/", "skeny prijatých dokladov, ostatné doklady a prílohy (ak ste ich zahrnuli)"],
] as const;

/** Priečinok balíka pre záznamy z koša. */
export const PRIECINOK_KOSA = "kos";

/**
 * Rozdelí riadky na živé a tie z koša (`deleted_at` vyplnené).
 *
 * Kôš sa z exportu nevyhadzuje: doklad v ňom môže byť vystavený, odoslaný
 * a zaúčtovaný — zmazaný len omylom a stále obnoviteľný. Pri desaťročnej
 * archivácii alebo pred zrušením účtu by inak zmizol bez stopy. Do hlavných
 * súborov ale nepatrí, aby ich súčty sedeli s tým, čo človek vidí v aplikácii.
 */
export function rozdelPodlaKosa<T extends Record<string, unknown>>(
  riadky: T[],
): { zive: T[]; vKosi: T[] } {
  const zive: T[] = [];
  const vKosi: T[] = [];
  for (const r of riadky ?? []) (r.deleted_at ? vKosi : zive).push(r);
  return { zive, vKosi };
}

export function sprievodnyText(firma: string, kedy: string): string {
  return [
    `Export údajov z Faktera`,
    `Firma: ${firma}`,
    `Vytvorené: ${kedy}`,
    ``,
    `Obsah balíka:`,
    ...OBSAH_EXPORTU.map(([s, p]) => `  ${s} — ${p}`),
    ``,
    `CSV súbory sú oddelené bodkočiarkou a uložené v UTF-8 s BOM, takže sa`,
    `otvoria v Exceli aj v tabuľkovom editore bez nastavovania.`,
    ``,
    `Priečinok ${PRIECINOK_KOSA}/ obsahuje doklady a karty presunuté do koša. Nie sú`,
    `zarátané v hlavných súboroch; ak bol niektorý z nich vystavený alebo`,
    `zaúčtovaný, uchovajte ho rovnako ako ostatné doklady.`,
    ``,
    `Účtovné doklady je potrebné uchovávať desať rokov (§ 76 zákona o DPH,`,
    `§ 35 zákona o účtovníctve). Táto povinnosť trvá aj po zrušení účtu.`,
  ].join("\n");
}
