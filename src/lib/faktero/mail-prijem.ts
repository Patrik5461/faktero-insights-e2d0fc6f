/**
 * Príjem dokladov e-mailom — čistá logika bez siete a databázy.
 *
 * Adresa má tvar `<slug firmy>-<náhodný chvost>@doklady.faktero.sk`. Slug je tam
 * kvôli človeku (nech vie, ktorej firme adresa patrí), chvost kvôli tomu, aby sa
 * adresa nedala uhádnuť z názvu firmy.
 */

/**
 * Doména, na ktorej prijímame doklady. Dá sa prepísať premennou
 * `MAIL_PRIJEM_DOMENA` — kým vlastná poddoména nefunguje, ide to na doménu, ktorú
 * dáva Resend (`<id>.resend.app`) a ktorá nepotrebuje žiadny DNS záznam.
 */
export const PODOMENA_DOKLADOV = "doklady.faktero.sk";

export function podomenaDokladov(zNastavenia?: string | null): string {
  const t = (zNastavenia ?? "").trim().toLowerCase().replace(/^@/, "");
  return t || PODOMENA_DOKLADOV;
}

/** Prípony a typy, ktoré má zmysel skúšať prečítať ako doklad. */
const TYPY_DOKLADOV = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

/** Znaky bez tých, ktoré si ľudia pri odpisovaní mýlia (0/o, 1/l, …). */
const ZNAKY = "abcdefghjkmnpqrstuvwxyz23456789";

const DIAKRITIKA: Record<string, string> = {
  á: "a", ä: "a", č: "c", ď: "d", é: "e", í: "i", ĺ: "l", ľ: "l", ň: "n",
  ó: "o", ô: "o", ŕ: "r", š: "s", ť: "t", ú: "u", ý: "y", ž: "z",
};

/** Z názvu firmy spraví časť adresy: bez diakritiky, malé písmená, bez s.r.o. */
export function slugFirmy(nazov: string): string {
  const bez = (nazov ?? "")
    .toLowerCase()
    .replace(/[áäčďéíĺľňóôŕšťúýž]/g, (z) => DIAKRITIKA[z] ?? z)
    .replace(/\b(s\.?\s?r\.?\s?o\.?|a\.?\s?s\.?|spol\.?|k\.?\s?s\.?|v\.?\s?o\.?\s?s\.?|se)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20)
    .replace(/-+$/g, "");
  return bez || "firma";
}

/** Náhodný chvost adresy. `nahodne` sa dá podstrčiť v teste. */
export function chvost(dlzka = 6, nahodne: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < dlzka; i++) out += ZNAKY[Math.floor(nahodne() * ZNAKY.length)];
  return out;
}

export function zostavLocalPart(nazovFirmy: string, nahodne?: () => number): string {
  return `${slugFirmy(nazovFirmy)}-${chvost(6, nahodne)}`;
}

export function celaAdresa(localPart: string, podomena = PODOMENA_DOKLADOV): string {
  return `${localPart}@${podomena}`;
}

/**
 * Z príjemcov mailu vytiahne našu časť adresy. Mail môže byť preposlaný, takže
 * adresátov býva viac a ten náš nemusí byť prvý.
 */
export function vyberLocalPart(
  prijemcovia: (string | null | undefined)[],
  podomena = PODOMENA_DOKLADOV,
): string | null {
  for (const raw of prijemcovia ?? []) {
    if (!raw) continue;
    // „Meno <adresa@…>" aj holá adresa.
    const adresa = (raw.match(/<([^>]+)>/)?.[1] ?? raw).trim().toLowerCase();
    const [local, domena] = adresa.split("@");
    if (!local || !domena) continue;
    if (domena !== podomena.toLowerCase()) continue;
    // Plusová časť (adresa+cokolvek@…) sa zahadzuje.
    return local.split("+")[0]!;
  }
  return null;
}

export function jePrilohaDoklad(contentType?: string | null, filename?: string | null): boolean {
  const typ = (contentType ?? "").toLowerCase().split(";")[0]!.trim();
  if (TYPY_DOKLADOV.includes(typ)) return true;
  // Niektorí odosielatelia pošlú PDF ako application/octet-stream.
  return /\.(pdf|jpe?g|png|webp|heic)$/i.test(filename ?? "");
}

/** Číslo z textu, ktorý môže mať čiarku, medzery aj menu. */
export function cislo(hodnota: unknown): number | null {
  if (typeof hodnota === "number") return Number.isFinite(hodnota) ? hodnota : null;
  if (typeof hodnota !== "string") return null;
  const t = hodnota.replace(/\s| /g, "").replace(/[^\d,.-]/g, "");
  if (!t) return null;
  // 1.234,56 aj 1,234.56 aj 1234.56
  const norm =
    t.lastIndexOf(",") > t.lastIndexOf(".")
      ? t.replace(/\./g, "").replace(",", ".")
      : t.replace(/,/g, "");
  const n = parseFloat(norm);
  return Number.isFinite(n) ? n : null;
}

/**
 * Dátum na `YYYY-MM-DD`. Prázdny reťazec musí skončiť ako `null` — zapísať `""`
 * do date stĺpca je opakujúca sa chyba, ktorá padne až v databáze.
 */
export function datum(hodnota: unknown): string | null {
  if (typeof hodnota !== "string") return null;
  const t = hodnota.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}

function text(hodnota: unknown, max = 200): string | null {
  if (typeof hodnota !== "string") return null;
  const t = hodnota.trim();
  return t ? t.slice(0, max) : null;
}

export type PrijataFakturaZMailu = {
  supplier_name: string;
  supplier_ico: string | null;
  supplier_dic: string | null;
  supplier_ic_dph: string | null;
  supplier_iban: string | null;
  invoice_number: string;
  variable_symbol: string | null;
  issue_date: string;
  due_date: string;
  received_date: string;
  amount_without_vat: number;
  vat_amount: number;
  amount_total: number;
  currency: string;
  status: string;
  note: string;
};

/**
 * Z toho, čo prečítala AI, spraví riadok prijatej faktúry. `supplier_name`,
 * `invoice_number`, `issue_date` a `due_date` sú v databáze povinné, takže keď ich
 * AI nenájde, doplní sa náhrada a človek to dorobí — doklad radšej vznikne
 * neúplný, než aby zapadol.
 */
export function zostavPrijatuFakturu(args: {
  ai: Record<string, unknown> | null;
  odosielatel: string | null;
  predmet: string | null;
  nazovSuboru: string | null;
  dnes: string;
}): PrijataFakturaZMailu {
  const ai = args.ai ?? {};
  const bezDph = cislo(ai.amount_without_vat);
  const dph = cislo(ai.vat_amount);
  const spolu = cislo(ai.amount_total);

  // Chýbajúci člen trojice sa dá dopočítať, ale nič sa nedomýšľa nasilu.
  const celkom = spolu ?? (bezDph !== null && dph !== null ? bezDph + dph : null);
  const zaklad = bezDph ?? (celkom !== null && dph !== null ? celkom - dph : null);
  const danove = dph ?? (celkom !== null && zaklad !== null ? celkom - zaklad : null);

  const vystavenie = datum(ai.issue_date) ?? args.dnes;
  const splatnost = datum(ai.due_date) ?? vystavenie;

  const cisloDokladu =
    text(ai.invoice_number, 60) ??
    text(args.predmet, 60) ??
    text(args.nazovSuboru?.replace(/\.[a-z0-9]+$/i, ""), 60) ??
    "bez čísla";

  const odkial = args.odosielatel ? ` od ${args.odosielatel}` : "";
  return {
    supplier_name: text(ai.supplier_name, 200) ?? "Neurčený dodávateľ",
    supplier_ico: text(ai.supplier_ico, 20),
    supplier_dic: text(ai.supplier_dic, 20),
    supplier_ic_dph: text(ai.supplier_ic_dph, 20),
    supplier_iban: text(ai.supplier_iban, 40)?.replace(/\s+/g, "").toUpperCase() ?? null,
    invoice_number: cisloDokladu,
    variable_symbol: text(ai.variable_symbol, 20),
    issue_date: vystavenie,
    due_date: splatnost,
    received_date: args.dnes,
    amount_without_vat: zaklad ?? 0,
    vat_amount: danove ?? 0,
    amount_total: celkom ?? 0,
    currency: (text(ai.currency, 3) ?? "EUR").toUpperCase(),
    // Doklad z mailu nikto neschválil, takže ostáva rozpracovaný.
    status: "draft",
    note: `Prijaté e-mailom${odkial}.${args.predmet ? ` Predmet: ${args.predmet.slice(0, 120)}` : ""}`,
  };
}
