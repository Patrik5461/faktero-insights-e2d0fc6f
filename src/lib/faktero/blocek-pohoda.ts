/*
  Hotovostný bloček do Pohody (pokladničný doklad) — údaje, ktoré chýbali
  oproti prijatej faktúre (pripomienka účtovníčky 2. 11. 2026):

  - adresa dodávateľa: bloček v DB nemá ulicu, PSČ, mesto ani DIČ — eKasa ich
    vydá, ale neukladali sa. Doplnia sa pri exporte z adresára, z prijatých
    faktúr toho istého dodávateľa alebo z registra (`blocek-pohoda.server.ts`);
  - text dokladu: ako pri prijatej faktúre popis plnenia (názvy položiek),
    nie len „dodávateľ č. …“;
  - členenie DPH: bloček bez vlastného ani predvoleného členenia dostane to,
    čo podľa zákona patrí (`odvodClenenia` — tuzemský bloček s DPH = PD);
    Pohoda bez neho doklad do priznania ani do KV nezaradí;
  - položky bločku nesú predkontáciu, členenie DPH a členenie KV ako položky
    prijatej faktúry — Pohoda si ich z hlavičky dokladu s položkami nevezme.

  Čisté funkcie (bez siete a DB), testy v `blocek-pohoda.test.ts`.
*/
import { jePolozkaZaokruhlenia } from "./zaokruhlenie-blocku";
import { odvodClenenia, type KodCiselnika } from "./auto-uctovanie";
import { jeNeplatitel, jeNezahrnovat } from "./uctovanie-agenda";

/** Adresa dodávateľa tak, ako ide do `typ:address`. */
export type AdresaDodavatela = {
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  dic?: string | null;
  ic_dph?: string | null;
  name?: string | null;
};

const t = (v: unknown) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** IČO na porovnanie — bez medzier, slovenské 6-miestne doplnené nulami. */
export function icoKluc(v: unknown): string {
  const s = String(v ?? "").replace(/\s+/g, "");
  if (!/^\d{6,8}$/.test(s)) return "";
  return s.padStart(8, "0");
}

/**
 * Adresa z eKasy je jeden riadok (`Ulica 5, 949 01 Nitra, Slovenská republika`
 * — `adresaOrganizacie` v `ekasa.ts`). Pohoda chce ulicu, PSČ a obec zvlášť.
 */
export function rozdelAdresu(riadok: unknown): AdresaDodavatela {
  const casti = t(riadok)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!casti.length) return {};
  // Časť s PSČ: „949 01 Nitra“ alebo „94901 Nitra“ (CZ „110 00 Praha 1“).
  const iPsc = casti.findIndex((c) => /^\d{3}\s?\d{2}\b/.test(c));
  if (iPsc < 0) return { street: casti[0] };
  const m = /^(\d{3})\s?(\d{2})\s*(.*)$/.exec(casti[iPsc])!;
  const krajinaText = casti.slice(iPsc + 1).join(", ");
  const krajina = /^(sk|slovensk|slovakia)/i.test(krajinaText)
    ? "SK"
    : /^(cz|česk|cesk|czech)/i.test(krajinaText)
      ? "CZ"
      : /^[A-Z]{2}$/.test(krajinaText)
        ? krajinaText
        : null;
  return {
    street: casti.slice(0, iPsc).join(", ") || null,
    zip: `${m[1]}${m[2]}`,
    city: m[3] || null,
    country: krajina,
  };
}

/**
 * Bloček doplnený o adresu dodávateľa podľa IČO — to, čo na bločku je,
 * má prednosť; doplní sa len prázdne pole.
 */
export function sAdresouDodavatela<T extends Record<string, any>>(
  d: T,
  adresy: Record<string, AdresaDodavatela> | null | undefined,
): T {
  const a = adresy?.[icoKluc(d?.supplier_ico)];
  if (!a) return d;
  const dopln = (pole: string, hodnota: unknown) =>
    t(d?.[pole]) || !t(hodnota) ? {} : { [pole]: t(hodnota) };
  return {
    ...d,
    ...dopln("supplier_street", a.street),
    ...dopln("supplier_city", a.city),
    ...dopln("supplier_zip", a.zip),
    ...dopln("supplier_country", a.country),
    ...dopln("supplier_dic", a.dic),
    ...dopln("supplier_ic_dph", a.ic_dph),
    ...dopln("supplier_name", a.name),
  };
}

/**
 * Text bločku ako text prijatej faktúry (`textPrijatej`): čo sa kúpilo —
 * prvé tri položky. Bez položiek prázdny (volajúci použije dodávateľa s číslom).
 */
export function textBlocku(d: { items?: unknown } | null | undefined): string {
  const polozky = (Array.isArray(d?.items) ? d!.items : [])
    // Zaokrúhlenie nie je tovar — do textu dokladu nepatrí.
    .filter((x: any) => !jePolozkaZaokruhlenia(x))
    .map((x: any) =>
      t(x?.name)
        // eKasa: kód tovaru a hviezdička pred názvom („* 3 03     OMV Diesel“).
        .replace(/^\*\s*(\d+\s+)*/, "")
        .trim(),
    )
    .filter(Boolean);
  if (!polozky.length) return "";
  return (polozky.slice(0, 3).join(", ") + (polozky.length > 3 ? " a ďalšie" : "")).slice(0, 240);
}

/**
 * Členenie DPH hotovostného bločku, keď ho nemá doklad, kategória ani
 * predvolené firmy: to, čo dáva zákon pre režim dokladu (tuzemský bloček
 * s DPH = PD, bez DPH či bez nároku na odpočet = PN, neplatiteľ = PN) —
 * z číselníka firmy, ak ho má načítaný z Pohody.
 */
export function clenenieBlockuPodlaZakona(o: {
  company: Record<string, any>;
  doklad: Record<string, any>;
  dph: number;
  ciselnik?: KodCiselnika[] | null;
}): string | null {
  const krajina = String(o.company?.country ?? "SK").toUpperCase() === "CZ" ? "CZ" : "SK";
  // Česká Pohoda má iné kódy členenia; tam sa nehádá.
  if (krajina === "CZ") return null;
  return odvodClenenia(
    {
      smer: "prijate",
      krajinaFirmy: krajina,
      firmaPlatitel: !jeNeplatitel(o.company as any),
      blocek: true,
      dph: o.dph,
      odpocet: o.doklad?.odpocet,
      partnerIcDph: o.doklad?.supplier_ic_dph ?? null,
      partnerKrajina: o.doklad?.supplier_country ?? null,
    },
    o.ciselnik ?? [],
  ).clenenieDph;
}

/**
 * Kódy položky bločku pre Pohodu: predkontácia (vlastná položky, inak
 * dokladu), členenie DPH (vlastné položky, inak dokladu) a členenie KV —
 * len položka s DPH a mimo „nezahŕňať“, rovnako ako riadok rozúčtovania.
 */
export function kodyPolozkyBlocku(o: {
  polozka: { predkontacia?: unknown; clenenie?: unknown; vat_rate?: unknown };
  predkontacia?: string | null;
  clenenie?: string | null;
  kv?: string | null;
}): { predkontacia: string; clenenie: string; kv: string } {
  const predkontacia = t(o.polozka?.predkontacia) || t(o.predkontacia);
  const clenenie = t(o.polozka?.clenenie) || t(o.clenenie);
  const sDph = Math.abs(Number(o.polozka?.vat_rate ?? 0)) > 0;
  const kv = sDph && !jeNezahrnovat(clenenie) ? t(o.kv) : "";
  return { predkontacia, clenenie, kv };
}

/**
 * Bloček zaplatený v hotovosti (nie prijatá faktúra ani daňový doklad
 * k platbe — tie nesú `_typPohody`). Bloček z vyúčtovania výdavkov zaplatil
 * zamestnanec, to nie je hotovosť firmy.
 */
export function jeHotovostnyBlocek(d: Record<string, any> | null | undefined): boolean {
  return (
    Boolean(d) &&
    !d!._typPohody &&
    !d!.vyuctovanie_id &&
    String(d!.payment_method ?? "") === "hotovost"
  );
}
