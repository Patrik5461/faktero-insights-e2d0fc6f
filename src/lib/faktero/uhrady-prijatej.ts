/**
 * Úhrady prijatej faktúry — čisté výpočty pre kartu úhrady, okno Úhrady a
 * sumár po sadzbách DPH. Stav `paid` v databáze počíta spúšťač zo
 * `purchase_invoice_payments`; tu sa z tých istých údajov skladá to, čo sa
 * ukazuje (zostáva k úhrade, čiastočne uhradená, dni po splatnosti).
 */

export type UhradaPrijatej = {
  id: string;
  amount: number | string;
  paid_at: string;
  currency?: string | null;
  zdroj?: string | null;
  bank_transaction_id?: string | null;
  note?: string | null;
};

export type StavUhrady = "uhradena" | "ciastocne" | "neuhradena";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Koľko treba uhradiť, koľko je uhradené a koľko zostáva.
 *
 * - Suma dobropisu je v databáze záporná — platí sa (vracia) jej absolútna hodnota.
 * - Zaplatená zálohová faktúra, ktorú faktúra zúčtováva, sa odpočíta (ako v spúšťači).
 * - Staršia faktúra so stavom `paid` bez riadkov úhrad sa berie ako uhradená celá.
 */
export function stavUhradyPrijatej(vstup: {
  amount_total: number | string | null | undefined;
  status?: string | null;
  uhrady: UhradaPrijatej[];
  /** Zaplatená zálohová faktúra, ktorú faktúra zúčtováva. */
  zaloha?: number | null;
}): {
  celkom: number;
  zaloha: number;
  naUhradu: number;
  uhradene: number;
  zostava: number;
  preplatene: number;
  stav: StavUhrady;
} {
  const celkom = r2(Math.abs(Number(vstup.amount_total ?? 0)) || 0);
  const zaloha = r2(Math.min(Math.abs(Number(vstup.zaloha ?? 0)) || 0, celkom));
  const naUhradu = r2(Math.max(celkom - zaloha, 0));
  let uhradene = r2(vstup.uhrady.reduce((s, u) => s + (Number(u.amount) || 0), 0));
  if (!vstup.uhrady.length && vstup.status === "paid") uhradene = naUhradu;
  const zostava = r2(Math.max(naUhradu - uhradene, 0));
  const preplatene = r2(Math.max(uhradene - naUhradu, 0));
  const stav: StavUhrady =
    naUhradu <= 0 || zostava < 0.005 ? "uhradena" : uhradene > 0.004 ? "ciastocne" : "neuhradena";
  return { celkom, zaloha, naUhradu, uhradene, zostava, preplatene, stav };
}

/** Súčet úhrad po faktúrach z riadkov `purchase_invoice_payments` (zoznam faktúr). */
export function sumyUhradPodlaFaktury(
  riadky: { purchase_invoice_id: string; amount: number | string | null }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of riadky) {
    const a = Number(r.amount) || 0;
    if (a <= 0) continue;
    out[r.purchase_invoice_id] = r2((out[r.purchase_invoice_id] ?? 0) + a);
  }
  return out;
}

/**
 * Čiastočne uhradená faktúra v zozname: niečo je uhradené, ale spúšťač ju
 * ešte neprepol na `paid`. Koncept a storno sa nepočítajú — tie sa neplatia.
 * (Zaplatenú zálohu tu netreba: keď s ňou úhrady pokryjú celú sumu, faktúra
 * už je `paid`.)
 */
export function jeCiastocneUhradena(
  row: { status?: string | null; amount_total?: number | string | null },
  uhradene: number | null | undefined,
): boolean {
  if (row.status === "paid" || row.status === "cancelled" || row.status === "draft") return false;
  const u = Number(uhradene) || 0;
  return u > 0.004 && u < Math.abs(Number(row.amount_total ?? 0)) - 0.004;
}

/** Dni po splatnosti (kladné), 0 v deň splatnosti, záporné = koľko dní ešte zostáva. */
export function dniPoSplatnosti(
  splatnost: string | null | undefined,
  dnes: Date = new Date(),
): number | null {
  if (!splatnost || !/^\d{4}-\d{2}-\d{2}/.test(splatnost)) return null;
  const [r, m, d] = splatnost.slice(0, 10).split("-").map(Number);
  const s = Date.UTC(r, m - 1, d);
  const t = Date.UTC(dnes.getFullYear(), dnes.getMonth(), dnes.getDate());
  return Math.round((t - s) / 86_400_000);
}

/** Zostatok novej úhrady v okne: aktuálna úhrada sa navrhne na celý zvyšok. */
export function zostaneKUhrade(
  zostava: number,
  aktualna: number | string | null | undefined,
): number {
  const a = Number(String(aktualna ?? "").replace(",", ".")) || 0;
  return r2(Math.max(zostava - Math.max(a, 0), 0));
}

export type RiadokSumaru = {
  sadzba: number;
  zaklad: number;
  dph: number;
  spolu: number;
  pdp?: boolean;
};

/**
 * Sumár po sadzbách DPH: všetky sadzby krajiny firmy (aj nulové riadky, aby
 * bolo vidieť, že na ostatných sadzbách nič nie je) a navyše každá sadzba,
 * ktorá je na doklade a krajina ju nepozná (napr. stará 20 %).
 */
export function sumarPoSadzbach(
  rozpis: { sadzba: number; zaklad: number; dph: number; pdp?: boolean }[],
  sadzbyKrajiny: number[],
): { riadky: RiadokSumaru[]; zaklad: number; dph: number; spolu: number } {
  const po = new Map<string, RiadokSumaru>();
  for (const s of new Set([...sadzbyKrajiny, 0]))
    po.set(`${s}|`, { sadzba: s, zaklad: 0, dph: 0, spolu: 0 });
  for (const x of rozpis) {
    const sadzba = Number(x.sadzba) || 0;
    const k = `${sadzba}|${x.pdp ? "pdp" : ""}`;
    const r = po.get(k) ?? { sadzba, zaklad: 0, dph: 0, spolu: 0, ...(x.pdp ? { pdp: true } : {}) };
    r.zaklad = r2(r.zaklad + (Number(x.zaklad) || 0));
    r.dph = r2(r.dph + (Number(x.dph) || 0));
    r.spolu = r2(r.zaklad + r.dph);
    po.set(k, r);
  }
  const riadky = [...po.values()].sort(
    (a, b) => b.sadzba - a.sadzba || Number(!!a.pdp) - Number(!!b.pdp),
  );
  const zaklad = r2(riadky.reduce((s, r) => s + r.zaklad, 0));
  const dph = r2(riadky.reduce((s, r) => s + r.dph, 0));
  return { riadky, zaklad, dph, spolu: r2(zaklad + dph) };
}

/** Typy dokladu do hlavičky — pevné texty, aby sa dali preložiť. */
export const TYPY_PRIJATYCH = {
  regular: ["Prijatá faktúra – tuzemská", "Prijatá faktúra – zahraničná"],
  proforma: ["Prijatá zálohová faktúra – tuzemská", "Prijatá zálohová faktúra – zahraničná"],
  dobropis: ["Prijatý dobropis – tuzemský", "Prijatý dobropis – zahraničný"],
  samo: ["Samofaktúra – tuzemská", "Samofaktúra – zahraničná"],
} as const;

const DOMACE: Record<string, string[]> = {
  SK: ["SK", "SVK", "SLOVENSKO", "SLOVAKIA", "SLOVENSKÁ REPUBLIKA"],
  CZ: ["CZ", "CZE", "ČESKO", "CZECHIA", "ČESKÁ REPUBLIKA"],
  DE: ["DE", "DEU", "DEUTSCHLAND", "NEMECKO", "GERMANY"],
};

/** Typ dokladu do hlavičky, napr. „Prijatá faktúra – tuzemská“. */
export function typPrijatejFaktury(
  row: {
    type?: string | null;
    amount_total?: number | string | null;
    opravuje_cislo?: string | null;
    samofakturacia?: boolean | null;
    supplier_country?: string | null;
    dph_rezim?: string | null;
  },
  krajinaFirmy: string = "SK",
): string {
  const druh =
    row.type === "proforma"
      ? TYPY_PRIJATYCH.proforma
      : Number(row.amount_total ?? 0) < 0 || row.opravuje_cislo
        ? TYPY_PRIJATYCH.dobropis
        : row.samofakturacia
          ? TYPY_PRIJATYCH.samo
          : TYPY_PRIJATYCH.regular;
  const krajina = String(row.supplier_country ?? "")
    .trim()
    .toUpperCase();
  const zahranicna =
    row.dph_rezim === "nadobudnutie" ||
    row.dph_rezim === "dovoz" ||
    Boolean(krajina && !(DOMACE[krajinaFirmy] ?? [krajinaFirmy]).includes(krajina));
  return druh[zahranicna ? 1 : 0];
}
