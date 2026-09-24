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
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function naCsv(riadky: Record<string, unknown>[], stlpce?: string[]): string {
  const hlavicka = stlpce ?? [...new Set(riadky.flatMap((r) => Object.keys(r)))];
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

/** Čo všetko balík obsahuje — vypisuje sa aj do sprievodného súboru. */
export const OBSAH_EXPORTU = [
  ["firma.csv", "údaje firmy vrátane nastavení DPH a číslovania"],
  ["faktury.csv", "vystavené faktúry, zálohové faktúry a dobropisy"],
  ["faktury-polozky.csv", "položky vystavených faktúr"],
  ["prijate-faktury.csv", "prijaté faktúry vrátane režimu DPH"],
  ["doklady.csv", "bločky a ostatné doklady s DPH"],
  ["ostatne-doklady.csv", "listy, predpisy, exekúcie a zmluvy"],
  ["odberatelia.csv", "karty odberateľov"],
  ["produkty.csv", "cenník a skladové karty"],
  ["pokladna.csv", "pokladničné pohyby"],
  ["banka.csv", "bankové pohyby"],
  ["jazdy.csv", "kniha jázd"],
  ["zakazky.csv", "zákazky"],
  ["faktury-pdf/", "PDF vystavených faktúr (ak ste ich zahrnuli)"],
] as const;

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
    `Účtovné doklady je potrebné uchovávať desať rokov (§ 76 zákona o DPH,`,
    `§ 35 zákona o účtovníctve). Táto povinnosť trvá aj po zrušení účtu.`,
  ].join("\n");
}
