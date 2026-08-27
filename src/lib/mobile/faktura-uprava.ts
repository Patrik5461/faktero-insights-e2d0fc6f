/**
 * Oprava a zmazanie vystavenej faktúry v telefóne.
 *
 * Pravidlá sú tie isté ako na webe — appka nesmie dovoliť viac než počítač:
 *
 * - **stornovaná faktúra sa už neopravuje**, tá sa len archivuje;
 * - **zmazanie je mäkké** (`deleted_at`), doklad nezmizne z histórie a číslo
 *   ostáva obsadené;
 * - položky, ktoré hýbu **skladom**, sa v telefóne neopravujú. Web pri nich
 *   dopočítava rozdiel v zásobách; robiť to isté na malej obrazovke by bola
 *   najistejšia cesta k rozhádzanému skladu, tak takú faktúru appka pošle na
 *   počítač.
 */

export type RiadokFaktury = {
  name: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  vat_rate: number;
  product_id?: string | null;
  stock_item_id?: string | null;
};

export type SuctyFaktury = { subtotal: number; vat_total: number; total: number };

/** Na dve desatinné miesta — v databáze aj na papieri je suma peniaz, nie zlomok. */
function nadva(n: number): number {
  return Number(n.toFixed(2));
}

/** Súčty počítané rovnako ako na webe: základ, DPH, spolu. */
export function suctyFaktury(riadky: RiadokFaktury[]): SuctyFaktury {
  let zaklad = 0;
  let dph = 0;
  for (const r of riadky) {
    const s = Number(r.quantity) * Number(r.unit_price);
    if (!Number.isFinite(s)) continue;
    zaklad += s;
    dph += s * (Number(r.vat_rate) / 100);
  }
  return { subtotal: nadva(zaklad), vat_total: nadva(dph), total: nadva(zaklad + dph) };
}

/** Riadky pripravené na zápis — poradie aj sumy si počíta appka, nie databáza. */
export function riadkyNaZapis(invoiceId: string, riadky: RiadokFaktury[]) {
  return riadky.map((r, i) => {
    const s = Number(r.quantity) * Number(r.unit_price);
    const d = s * (Number(r.vat_rate) / 100);
    return {
      invoice_id: invoiceId,
      position: i + 1,
      name: r.name.trim(),
      quantity: Number(r.quantity),
      unit: r.unit || "ks",
      unit_price: Number(r.unit_price),
      vat_rate: Number(r.vat_rate),
      product_id: r.product_id ?? null,
      stock_item_id: r.stock_item_id ?? null,
      subtotal: nadva(s),
      vat_amount: nadva(d),
      total: nadva(s + d),
    };
  });
}

export type MoznostUpravy = { ok: true } | { ok: false; dovod: string };

/**
 * Smie sa táto faktúra v telefóne opraviť?
 *
 * Dôvod je text pre človeka — vypíše sa mu na obrazovke, tak nech je z neho
 * jasné, čo má robiť ďalej.
 */
export function moznoUpravit(f: {
  status: string | null;
  maSkladovePolozky?: boolean;
}): MoznostUpravy {
  if (f.status === "cancelled") return { ok: false, dovod: "Stornovaná faktúra sa už neopravuje." };
  if (f.maSkladovePolozky)
    return {
      ok: false,
      dovod: "Faktúra hýbe skladom — opravte ju na počítači, nech sedia zásoby.",
    };
  return { ok: true };
}

/** Zmazať sa dá čokoľvek okrem už zmazaného; je to mäkké mazanie ako na webe. */
export function moznoZmazat(f: { deleted_at?: string | null }): boolean {
  return !f.deleted_at;
}
