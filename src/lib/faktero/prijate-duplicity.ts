/*
  Tá istá prijatá faktúra dvakrát — typicky prišla mailom znova (upomienka,
  preposlaná kópia) alebo ju niekto zadal ručne aj nahral. V účtovníctve by
  bola dvakrát náklad aj odpočet DPH a hromadný príkaz by ju zaplatil dvakrát.

  Rovnaká je, keď má to isté číslo od toho istého dodávateľa. Dodávateľa
  spoznáme podľa IČO, IBAN-u alebo názvu; keď o ňom nevieme nič, rozhodne suma.
  Je to upozornenie, nie zákaz — človek môže doklad uložiť aj tak.
*/

export type OdtlacokPrijatej = {
  invoice_number?: string | null;
  supplier_ico?: string | null;
  supplier_name?: string | null;
  supplier_iban?: string | null;
  amount_total?: number | string | null;
};

/** Číslo dokladu bez medzier, pomlčiek a vedúcich núl, veľkými písmenami. */
export function normCislo(v: unknown): string {
  return String(v ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/^0+(?=\d)/, "");
}

const PRAVNE_FORMY = /\b(s\s*r\s*o|spol|a\s*s|k\s*s|v\s*o\s*s|s\s*e|se|sro|as|gmbh|ltd|inc)\b/g;

/** Názov dodávateľa bez diakritiky, právnej formy a interpunkcie. */
export function normNazov(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,&()'"„“-]/g, " ")
    .replace(PRAVNE_FORMY, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const alnum = (v: unknown) => String(v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();

export function jeTaIstaPrijata(a: OdtlacokPrijatej, b: OdtlacokPrijatej): boolean {
  const ca = normCislo(a.invoice_number);
  if (!ca || ca !== normCislo(b.invoice_number)) return false;
  const icoA = alnum(a.supplier_ico);
  const icoB = alnum(b.supplier_ico);
  if (icoA && icoB) return icoA === icoB;
  const ibanA = alnum(a.supplier_iban);
  const ibanB = alnum(b.supplier_iban);
  if (ibanA && ibanB && ibanA === ibanB) return true;
  const nA = normNazov(a.supplier_name);
  const nB = normNazov(b.supplier_name);
  if (nA && nB) return nA === nB;
  // O dodávateľovi nevieme nič — rovnaké číslo a suma stačia.
  const sA = Number(a.amount_total);
  const sB = Number(b.amount_total);
  return Number.isFinite(sA) && Number.isFinite(sB) && Math.abs(Math.abs(sA) - Math.abs(sB)) < 0.01;
}

/**
 * Skupiny duplicít v zozname (napr. pre označenie v tabuľke) — id → id
 * ostatných riadkov s tou istou faktúrou.
 */
export function duplicityVZozname<T extends OdtlacokPrijatej & { id: string }>(
  riadky: T[],
): Map<string, string[]> {
  const poCisle = new Map<string, T[]>();
  for (const r of riadky) {
    const k = normCislo(r.invoice_number);
    if (!k) continue;
    const zoz = poCisle.get(k) ?? [];
    zoz.push(r);
    poCisle.set(k, zoz);
  }
  const out = new Map<string, string[]>();
  for (const zoz of poCisle.values()) {
    if (zoz.length < 2) continue;
    for (const a of zoz) {
      const ine = zoz.filter((b) => b.id !== a.id && jeTaIstaPrijata(a, b)).map((b) => b.id);
      if (ine.length) out.set(a.id, ine);
    }
  }
  return out;
}

/** Text upozornenia — rovnaký na serveri aj v rozhraní. */
export function textDuplicity(d: { invoice_number?: string | null; supplier_name?: string | null; kde: "prijate" | "nespracovane" }): string {
  const kto = d.supplier_name ? ` od ${d.supplier_name}` : "";
  return d.kde === "prijate"
    ? `Faktúra ${d.invoice_number ?? ""}${kto} už medzi prijatými faktúrami je.`
    : `Faktúra ${d.invoice_number ?? ""}${kto} ešte čaká v Nespracovaných dokladoch.`;
}

/** Predpona chyby zo servera — rozhranie podľa nej ponúkne „uložiť aj tak". */
export const PREDPONA_DUPLICITY = "DUPLICITA: ";
