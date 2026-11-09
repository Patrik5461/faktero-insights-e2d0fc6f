/**
 * Veriteľ zmluvy o financovaní — leasingová spoločnosť alebo banka.
 *
 * Nie je to nájomca ani dlžník (to je firma používateľa). Údaje veriteľa idú
 * do Pohody ako partner záväzku za splátku a IČ DPH potrebuje kontrolný výkaz
 * pri B.2 — bez neho Pohoda záväzok do KV nezaradí.
 *
 * Čistý modul bez siete a databázy: úprava prečítaných/zadaných hodnôt a
 * doplnenie z registra „len do prázdnych polí“.
 */

export type VeritelZmluvy = {
  provider_ico: string | null;
  provider_dic: string | null;
  provider_ic_dph: string | null;
  provider_street: string | null;
  provider_city: string | null;
  provider_zip: string | null;
  provider_country: string | null;
};

export const POLIA_VERITELA = [
  "provider_ico",
  "provider_dic",
  "provider_ic_dph",
  "provider_street",
  "provider_city",
  "provider_zip",
  "provider_country",
] as const satisfies readonly (keyof VeritelZmluvy)[];

const txt = (v: unknown, max = 200): string | null => {
  const s = typeof v === "string" || typeof v === "number" ? String(v).replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, max) : null;
};

/** IČO bez medzier; slovenské/české (6–8 číslic) doplnené nulami na 8. */
export function normIco(v: unknown): string | null {
  const s = String(v ?? "").replace(/\s+/g, "").trim();
  if (!s) return null;
  if (/^\d{6,8}$/.test(s)) return s.padStart(8, "0");
  return s.slice(0, 15);
}

/** DIČ / IČ DPH bez medzier, veľkými písmenami. */
export function normDanoveCislo(v: unknown, max = 18): string | null {
  const s = String(v ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
  return s ? s.slice(0, max) : null;
}

/** Kód krajiny (SK, CZ…); slovom zapísaná krajina sa preloží, inak null. */
export function normKrajina(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return null;
  if (/^(CZ|CZE|ČESK|CESK|CZECH)/.test(s)) return "CZ";
  if (/^(SK|SVK|SLOVENSK|SLOVAK)/.test(s)) return "SK";
  if (/^(AT|AUT|RAKÚS|RAKOUS|AUSTRIA|ÖSTERR)/.test(s)) return "AT";
  if (/^(DE|DEU|NEMEC|NĚMEC|GERMAN|DEUTSCH)/.test(s)) return "DE";
  if (/^(HU|HUN|MAĎAR|MAĎARS|HUNGAR)/.test(s)) return "HU";
  if (/^(PL|POL|POĽSK|POLSK|POLAND)/.test(s)) return "PL";
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

/** Uprace údaje veriteľa z odpovede modelu alebo z formulára. */
export function normalizujVeritela(v: Partial<Record<keyof VeritelZmluvy, unknown>> | null | undefined): VeritelZmluvy {
  const ico = normIco(v?.provider_ico);
  let dic = normDanoveCislo(v?.provider_dic);
  let icDph = normDanoveCislo(v?.provider_ic_dph);
  /*
    Model občas dá IČ DPH do DIČ („SK2020264818“). Slovenské DIČ je bez
    predpony — keď ju má, je to IČ DPH.
  */
  if (dic && /^SK\d{10}$/.test(dic)) {
    if (!icDph) icDph = dic;
    dic = dic.slice(2);
  }
  return {
    provider_ico: ico,
    provider_dic: dic,
    provider_ic_dph: icDph,
    provider_street: txt(v?.provider_street, 64),
    provider_city: txt(v?.provider_city, 45),
    provider_zip: txt(v?.provider_zip, 15),
    provider_country: normKrajina(v?.provider_country),
  };
}

/** Má zmysel pýtať sa registra? (IČO je, niečo z ostatného chýba.) */
export function chybaVeriteloviNieco(v: VeritelZmluvy): boolean {
  return (
    !v.provider_dic ||
    !v.provider_ic_dph ||
    !v.provider_street ||
    !v.provider_city ||
    !v.provider_zip ||
    !v.provider_country
  );
}

/** Firma z registra (podmnožina `NormalizedCompany`). */
export type FirmaZRegistra = {
  ico: string;
  name?: string | null;
  dic: string | null;
  ic_dph: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
};

/**
 * Doplní prázdne polia veriteľa z registra. Čo už je vyplnené (z dokumentu
 * alebo ručne), sa neprepisuje.
 */
export function doplnZRegistra(v: VeritelZmluvy, f: FirmaZRegistra): VeritelZmluvy {
  const r = normalizujVeritela({
    provider_ico: f.ico,
    provider_dic: f.dic,
    provider_ic_dph: f.ic_dph,
    provider_street: f.street,
    provider_city: f.city,
    provider_zip: f.zip,
    provider_country: f.country,
  });
  const out = { ...v };
  for (const k of POLIA_VERITELA) if (!out[k] && r[k]) out[k] = r[k];
  return out;
}

/** Názov firmy na porovnanie: bez diakritiky, interpunkcie a právnej formy. */
export function normNazovFirmy(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(a\s*s|s\s*r\s*o|spol|s\s*r\s*o|k\s*s|v\s*o\s*s|se)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
