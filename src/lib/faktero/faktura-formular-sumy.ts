/**
 * Súčty a riadky formulára novej faktúry (`faktury.nova`) tak, ako idú do
 * databázy. Vytiahnuté z formulára, aby sa dalo testom overiť, že dobropis
 * zadaný kladne sa uloží presne tak ako predtým so záporným množstvom
 * (`dobropis-zobrazenie.ts`).
 *
 * Riadky sem idú už so znamienkom na zápis (`riadkyNaZapis`) — zaokrúhľuje sa
 * zo zápornej sumy, nie z kladnej, inak by pri polovici centa vyšiel iný cent.
 */
import {
  koeficientZlavy,
  percentoZlavy,
  sumaZlavyDokladu,
  zakladRiadku,
  type TypZlavy,
} from "./zlavy";

export type RiadokFormulara = {
  quantity: number;
  unit_price: number;
  vat_rate: number;
  discount_percent?: number;
  prenesenie?: boolean;
};

export type NastaveniaSum = {
  rounding_mode: "per_item" | "per_document" | "retail";
  reverse_charge: boolean;
  discount_type: "" | TypZlavy | null;
  discount_value: number;
  /** Odpočítané zálohy (sumy). */
  zalohy?: number[];
};

export function sumyFormulara(riadky: RiadokFormulara[], n: NastaveniaSum) {
  const mode = n.rounding_mode;
  const rc = n.reverse_charge;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  let sub = 0,
    vat = 0;
  for (const it of riadky) {
    // Riadková zľava je už v základe; jednotková cena ostáva pôvodná, nech
    // je na doklade vidieť, z čoho sa zľavovalo.
    let s = zakladRiadku(it.quantity, it.unit_price, it.discount_percent);
    let v = rc || it.prenesenie ? 0 : s * (Number(it.vat_rate) / 100);
    if (mode === "per_item") {
      s = r2(s);
      v = r2(v);
    }
    sub += s;
    vat += v;
  }
  /*
    Zľava na celý doklad sa nerozdeľuje po riadkoch — prenásobí základ aj
    daň tým istým koeficientom. Pomer medzi sadzbami tak ostane a DPH vyjde
    rovnako, ako keby bola dohodnutá nižšia cena od začiatku.
  */
  const medzisucet = r2(sub);
  const zlava = sumaZlavyDokladu(sub, {
    typ: n.discount_type || null,
    hodnota: Number(n.discount_value),
  });
  if (zlava > 0) {
    const k = koeficientZlavy(sub, zlava);
    sub = sub * k;
    vat = vat * k;
  }
  let total = sub + vat;
  if (mode === "per_document") {
    sub = r2(sub);
    vat = r2(vat);
    total = r2(sub + vat);
  }
  if (mode === "retail") {
    sub = r2(sub);
    vat = r2(vat);
    total = Math.round((sub + vat) * 20) / 20;
  }
  const advance = Math.round((n.zalohy ?? []).reduce((a, z) => a + z, 0) * 100) / 100;
  const payable = r2(total - advance);
  return { subtotal: sub, vat_total: vat, total, advance, payable, medzisucet, zlava };
}

/** Hlavičkové sumy tak, ako sa zapíšu do `invoices`. */
export function sumyNaZapis(s: ReturnType<typeof sumyFormulara>) {
  return {
    subtotal: Number(s.subtotal.toFixed(2)),
    vat_total: Number(s.vat_total.toFixed(2)),
    total: Number(s.total.toFixed(2)),
  };
}

/** Číselné polia riadku tak, ako sa zapíšu do `invoice_items`. */
export function riadokNaZapis(it: RiadokFormulara, reverseCharge: boolean) {
  // Sumy riadku sú po jeho vlastnej zľave; zľava na doklad sa do
  // riadkov nepremieta, tá sedí v hlavičke.
  const s = zakladRiadku(it.quantity, it.unit_price, it.discount_percent);
  const effRate = reverseCharge || it.prenesenie ? 0 : Number(it.vat_rate);
  const v = s * (effRate / 100);
  return {
    quantity: it.quantity,
    unit_price: it.unit_price,
    discount_percent: percentoZlavy(it.discount_percent),
    vat_rate: effRate,
    subtotal: Number(s.toFixed(2)),
    vat_amount: Number(v.toFixed(2)),
    total: Number((s + v).toFixed(2)),
  };
}
