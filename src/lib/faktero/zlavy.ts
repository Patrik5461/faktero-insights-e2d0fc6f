/**
 * Zľavy na doklade — na riadku a na celom doklade.
 *
 * Riadková zľava znižuje základ toho riadku; jednotková cena sa nemení, aby
 * bolo na doklade vidieť, z čoho sa zľavovalo. Zľava na celý doklad sa
 * nepremieta do riadkov: rozpočíta sa pomerne, takže pomer základov medzi
 * sadzbami DPH ostane rovnaký a daň vyjde tak, ako keby bola dohodnutá nižšia
 * cena od začiatku.
 */

export type TypZlavy = "percent" | "amount";

export type ZlavaDokladu = {
  /** `null` = doklad bez zľavy. */
  typ: TypZlavy | null;
  /** Percento (0–100) alebo suma bez DPH — podľa `typ`. */
  hodnota: number;
};

export const BEZ_ZLAVY: ZlavaDokladu = { typ: null, hodnota: 0 };

const cislo = (h: unknown): number => {
  const n = Number(h);
  return Number.isFinite(n) ? n : 0;
};

const naCenty = (n: number) => Math.round(n * 100) / 100;

/** Zľava riadku v percentách, orezaná na rozsah 0–100. */
export function percentoZlavy(hodnota: unknown): number {
  const n = cislo(hodnota);
  if (n <= 0) return 0;
  return n > 100 ? 100 : n;
}

/** Základ riadku po jeho vlastnej zľave (nezaokrúhlený). */
export function zakladRiadku(
  mnozstvo: unknown,
  jednotkovaCena: unknown,
  zlavaPercent: unknown = 0,
): number {
  const zaklad = cislo(mnozstvo) * cislo(jednotkovaCena);
  return zaklad * (1 - percentoZlavy(zlavaPercent) / 100);
}

/**
 * Suma zľavy na celý doklad v eurách bez DPH.
 *
 * Nikdy nie je väčšia než základ — zľava, ktorá by spravila zápornú faktúru,
 * je preklep, nie obchodná dohoda. Na dobropis slúži vlastný typ dokladu.
 */
export function sumaZlavyDokladu(zakladSpolu: unknown, zlava: ZlavaDokladu): number {
  const zaklad = cislo(zakladSpolu);
  if (!zlava?.typ || zaklad <= 0) return 0;
  const hodnota = cislo(zlava.hodnota);
  if (hodnota <= 0) return 0;
  const suma = zlava.typ === "percent" ? (zaklad * Math.min(hodnota, 100)) / 100 : hodnota;
  return naCenty(Math.min(suma, zaklad));
}

/**
 * Koeficient, ktorým sa prenásobia základy aj dane riadkov, aby doklad
 * obsahoval zľavu. Bez zľavy je to 1.
 */
export function koeficientZlavy(zakladSpolu: unknown, zlavaSuma: unknown): number {
  const zaklad = cislo(zakladSpolu);
  const zlava = cislo(zlavaSuma);
  if (zaklad <= 0 || zlava <= 0) return 1;
  const k = (zaklad - zlava) / zaklad;
  return k > 0 ? k : 0;
}

/** Zľava na doklade dáva zmysel len s typom a kladnou hodnotou. */
export function maZlavu(zlava: ZlavaDokladu | null | undefined): boolean {
  return !!zlava?.typ && cislo(zlava.hodnota) > 0;
}

/** Popis zľavy do súhrnu dokladu — „10 %" alebo „25,00 EUR". */
export function popisZlavy(zlava: ZlavaDokladu, mena = "EUR", locale = "sk-SK"): string {
  if (!maZlavu(zlava)) return "";
  const hodnota = cislo(zlava.hodnota);
  if (zlava.typ === "percent") {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(hodnota)} %`;
  }
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(hodnota)} ${mena}`;
}

/**
 * Riadky s rozpočítanou zľavou na doklad.
 *
 * Export do účtovníctva (Pohoda, ISDOC, eFaktúra) skladá rekapituláciu DPH
 * z riadkov. Zľava na doklad ale žije len v hlavičke, takže bez rozpočítania
 * by riadky dali vyššiu sumu než samotná faktúra a doklad by účtovný program
 * odmietol. Zľava sa preto rozdelí pomerne — každý riadok si z nej odkrojí
 * podľa svojej váhy, takže pomer medzi sadzbami DPH ostane.
 *
 * Halierové rozdiely zo zaokrúhľovania dorovná posledný riadok; inak by sa
 * súčet rozišiel s hlavičkou práve o ten jeden cent.
 */
export function riadkySoZlavou<
  T extends {
    subtotal?: unknown;
    vat_amount?: unknown;
    total?: unknown;
    unit_price?: unknown;
  },
>(riadky: T[], zlavaDokladu: unknown): T[] {
  const zlava = cislo(zlavaDokladu);
  if (!riadky.length || zlava <= 0) return riadky;
  const zakladSpolu = riadky.reduce((s, r) => s + cislo(r.subtotal), 0);
  const k = koeficientZlavy(zakladSpolu, zlava);
  if (k === 1) return riadky;

  const ciel = naCenty(zakladSpolu - zlava);
  const cielDph = naCenty(riadky.reduce((s, r) => s + cislo(r.vat_amount), 0) * k);
  let zaklad = 0;
  let dph = 0;
  return riadky.map((r, i) => {
    const posledny = i === riadky.length - 1;
    let novyZaklad = naCenty(cislo(r.subtotal) * k);
    let novaDph = naCenty(cislo(r.vat_amount) * k);
    if (posledny) {
      novyZaklad = naCenty(ciel - zaklad);
      novaDph = naCenty(cielDph - dph);
    }
    zaklad = naCenty(zaklad + novyZaklad);
    dph = naCenty(dph + novaDph);
    return {
      ...r,
      subtotal: novyZaklad,
      vat_amount: novaDph,
      total: naCenty(novyZaklad + novaDph),
      unit_price: Math.round(cislo(r.unit_price) * k * 1e5) / 1e5,
    };
  });
}
