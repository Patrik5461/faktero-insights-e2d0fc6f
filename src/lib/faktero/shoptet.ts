/*
  Objednávka zo Shoptetu → faktúra vo Fakteri (podľa oficiálnej OpenAPI
  špecifikácie Shoptetu, github.com/shoptet/developers). Sumy riadkov sa berú
  presne tak, ako ich spočítal obchod, aby faktúra sedela na cent s tým, čo
  zákazník zaplatil.
*/
import type { VstupFaktury } from "./vytvor-fakturu.server";

export type ObjednavkaShoptet = {
  code: string;
  creationTime?: string | null;
  email?: string | null;
  paid?: boolean | null;
  status?: { id: number; name?: string | null } | null;
  paymentMethod?: { name?: string | null } | null;
  shipping?: { name?: string | null } | null;
  shippingDetails?: {
    branchId?: string | null;
    carrierId?: number | null;
    name?: string | null;
  } | null;
  price: { currencyCode: string; withVat?: string | null; toPay?: string | null };
  billingAddress: {
    company?: string | null;
    fullName?: string | null;
    street?: string | null;
    houseNumber?: string | null;
    city?: string | null;
    zip?: string | null;
    countryCode?: string | null;
    companyId?: string | null;
    vatId?: string | null;
    taxId?: string | null;
  };
  items?: {
    name: string;
    variantName?: string | null;
    itemType?: string;
    amount?: string | null;
    amountUnit?: string | null;
    code?: string | null;
    itemPrice: { withoutVat?: string | null; vat?: string | null; vatRate: string };
  }[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
const cislo = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const holy = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Spôsob úhrady podľa názvu platobnej metódy v obchode. */
export function uhradaZoShoptetu(nazov: string | null | undefined): {
  kod: string;
  dobierka: boolean;
} {
  const t = holy(nazov);
  if (/dobierk|dobirk|cash on delivery|\bcod\b/.test(t)) return { kod: "cash", dobierka: true };
  if (/kart|card|online|gopay|comgate|stripe|paypal|apple pay|google pay|thepay|besteron/.test(t))
    return { kod: "card", dobierka: false };
  if (/hotov|osobn|pokladn|cash/.test(t)) return { kod: "cash", dobierka: false };
  return { kod: "bank_transfer", dobierka: false };
}

export function fakturaZObjednavky(
  o: ObjednavkaShoptet,
  dnes = new Date().toISOString().slice(0, 10),
): VstupFaktury {
  const b = o.billingAddress ?? {};
  const uhrada = uhradaZoShoptetu(o.paymentMethod?.name);
  const items = (o.items ?? [])
    .map((it) => {
      const mnozstvo = cislo(it.amount) || 1;
      const zaklad = r2(cislo(it.itemPrice.withoutVat));
      const dph = r2(cislo(it.itemPrice.vat));
      return {
        name: [it.name, it.variantName].filter(Boolean).join(" – ").slice(0, 255),
        description: it.code ? `Kód ${it.code}` : null,
        quantity: mnozstvo,
        unit: (it.amountUnit || "ks").slice(0, 20),
        // Jednotková cena z celkovej sumy riadku — obchod ju zaokrúhľuje inak.
        unit_price: r5(zaklad / mnozstvo),
        vat_rate: cislo(it.itemPrice.vatRate),
        subtotal: zaklad,
        vat_amount: dph,
      };
    })
    .filter((it) => it.quantity > 0 && (it.subtotal !== 0 || it.vat_amount !== 0));
  const ulica = [b.street, b.houseNumber].filter(Boolean).join(" ").trim();
  const zaplatena = o.paid === true;
  return {
    external_id: `shoptet:${o.code}`,
    order_number: String(o.code).slice(0, 60),
    customer: {
      name: (b.company || b.fullName || o.email || "Zákazník e-shopu").slice(0, 255),
      ico: b.companyId || null,
      dic: b.taxId && b.taxId !== b.vatId ? b.taxId : null,
      ic_dph: b.vatId || null,
      street: ulica || null,
      city: b.city || null,
      zip: b.zip || null,
      country: (b.countryCode || "SK").toUpperCase().slice(0, 2),
      email: o.email && /@/.test(o.email) ? o.email : null,
    },
    issue_date: dnes,
    // Zaplatená objednávka či dobierka sa už nesplácajú prevodom.
    due_date: zaplatena || uhrada.dobierka ? dnes : undefined,
    currency: (o.price?.currencyCode || "EUR").toUpperCase(),
    payment_method: uhrada.kod,
    notes: [
      `Objednávka ${o.code} zo Shoptetu.`,
      uhrada.dobierka ? "Platba na dobierku." : null,
      o.shipping?.name
        ? `Doprava: ${o.shipping.name}${o.shippingDetails?.name ? ` (${o.shippingDetails.name})` : ""}.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
    items,
  };
}
