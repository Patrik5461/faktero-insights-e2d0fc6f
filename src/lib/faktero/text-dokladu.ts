/*
  Text prijatého dokladu do účtovného programu (Pohoda `text`, Omega EUD
  stĺpec 41 a text zápisov) — jedno pravidlo pre všetky exporty.

  Text má povedať, čo sa kupuje, nie kto to predal (dodávateľ je v adrese):

  - prijatá faktúra: predmet faktúry (`intro_note`) → názvy položiek →
    „Faktúra č. …“ (pripomienka 4. 11. 2026, faktúra 20260001 od SFC išla
    len s „Faktúra č.“, hoci eFaktúra niesla položku),
  - bloček: popis dokladu (poznámka bez systémových viet) → názov účtovnej
    položky (popis predkontácie z číselníka) → názvy položiek → dodávateľ
    s číslom (pripomienka 4. 11. 2026 — OCR názvy „Viac. kva. b. 400g, Nite
    neúd. …“ nie sú popis dokladu, patria až na koniec).

  Do textu nikdy nejde kód predkontácie ani poznámka, ktorú doklad dostal od
  systému („Prenesené z Doklada.“, „Prijaté cez eFaktúru (Peppol).“).
  Čisté funkcie, testy v `text-dokladu.test.ts`.
*/
import { jePolozkaZaokruhlenia } from "./zaokruhlenie-blocku";

const t = (v: unknown) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** Vety, ktoré do poznámky dokladu píše Faktero samo — nie sú popisom dokladu. */
const SYSTEMOVE_VETY: RegExp[] = [
  /^Prenesené z Doklada\.?$/i,
  /^(Zálohová faktúra |Dobropis )?prijat[ýáé] cez eFaktúru \(Peppol\).*$/i,
  /^Prijaté e-mailom.*$/i,
  /^Dodávateľ odpočítal zaplatenú zálohu.*$/i,
  /^Zaokrúhlenie -?\d.*$/i,
  /^Bez nároku na odpočet DPH\.?$/i,
];

/**
 * Popis dokladu z poznámky: prvý riadok, ktorý nie je systémová veta.
 * „poistne\nPrenesené z Doklada.“ → „poistne“; „Prenesené z Doklada.“ → null.
 */
export function popisZPoznamky(poznamka: unknown): string | null {
  const riadky = String(poznamka ?? "")
    .split(/\r?\n/)
    .flatMap((r) => r.split(/(?<=\.)\s+(?=[A-ZÁČĎÉÍĽĹŇÓÔŔŠŤÚÝŽ])/))
    .map(t)
    .filter((r) => r && !SYSTEMOVE_VETY.some((re) => re.test(r)));
  return riadky.length ? riadky.join(" ").slice(0, 240) : null;
}

/** Názov položky bez kódu tovaru z eKasy („* 3 03     OMV Diesel“ → „OMV Diesel“). */
export function nazovPolozky(nazov: unknown): string {
  return t(nazov).replace(/^\*\s*(\d+\s+)*/, "").trim();
}

/** Názvy položiek dokladu (bez riadku zaokrúhlenia). */
export function nazvyPoloziek(polozky: unknown): string[] {
  return (Array.isArray(polozky) ? polozky : [])
    .filter((x: any) => !jePolozkaZaokruhlenia(x))
    .map((x: any) => nazovPolozky(x?.name ?? x?.nazov))
    .filter(Boolean);
}

/** Prvé tri názvy položiek („a ďalšie“ pri viacerých), najviac 240 znakov. */
export function textZNazvov(nazvy: string[]): string {
  if (!nazvy.length) return "";
  return (nazvy.slice(0, 3).join(", ") + (nazvy.length > 3 ? " a ďalšie" : "")).slice(0, 240);
}

/** Text prijatej faktúry: predmet → názvy položiek → „Faktúra č. …“. */
export function textPrijatejFaktury(p: {
  intro_note?: unknown;
  items?: unknown;
  invoice_number?: unknown;
}): string {
  const predmet = t(p?.intro_note);
  if (predmet) return predmet.slice(0, 240);
  const zPoloziek = textZNazvov(nazvyPoloziek(p?.items));
  if (zPoloziek) return zPoloziek;
  return `Faktúra č. ${t(p?.invoice_number)}`.trim();
}

/** Má prijatá faktúra vlastný popis (predmet alebo položky)? Inak ide len „Faktúra č.“. */
export function maPopisPrijatej(p: { intro_note?: unknown; items?: unknown }): boolean {
  return Boolean(t(p?.intro_note)) || nazvyPoloziek(p?.items).length > 0;
}

/**
 * Text bločku: popis z poznámky → účtovná položka (popis predkontácie) →
 * názvy položiek → náhradný text (dodávateľ s číslom). Prázdny reťazec len
 * vtedy, keď chýba aj náhradný.
 */
export function textBlockuNaExport(o: {
  poznamka?: unknown;
  /** Popis predkontácie z číselníka firmy — nikdy samotný kód. */
  uctovnaPolozka?: unknown;
  polozky?: unknown;
  nahradny?: unknown;
}): string {
  return (
    popisZPoznamky(o.poznamka) ||
    t(o.uctovnaPolozka).slice(0, 240) ||
    textZNazvov(nazvyPoloziek(o.polozky)) ||
    t(o.nahradny).slice(0, 240)
  );
}
