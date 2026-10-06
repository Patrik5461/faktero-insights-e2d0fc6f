/*
  Telo požiadavky `POST /api/v1/documents/send` pre ePoštáka (JSON → UBL).

  Predtým sa každý doklad posielal ako obyčajná faktúra — dobropis odišiel
  ako faktúra so zápornými množstvami, bez typu 381 a bez čísla pôvodnej
  faktúry (BT-25), ktoré FS pri dobropise vyžaduje. Chýbal aj dátum dodania,
  variabilný symbol, režim prenesenia dane, zľavy a zúčtovaná záloha.

  Pravidlá ePoštáka (OpenAPI 1.14):
  - `documentType`: invoice | credit_note | advance_payment | self_billing |
    self_billing_credit_note; dobropisy chcú `precedingInvoiceRef`.
  - Množstvo musí byť > 0 a cena ≥ 0 — dobropis je kladný, „mínus“ vyjadruje
    sám typ dokladu.
  - Samofaktúra adresuje dodávateľa (`supplierPeppolId`, `supplierName`).
*/

export type DruhEdokladu =
  | "invoice"
  | "credit_note"
  | "debit_note"
  | "advance_payment"
  | "self_billing"
  | "self_billing_credit_note";

export type PolozkaNaOdoslanie = {
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  discount_percent?: number | null;
};

export type DokladNaOdoslanie = {
  druh: DruhEdokladu;
  cislo: string;
  vystavena: string;
  splatnost: string | null;
  dodanie: string | null;
  mena: string;
  vs: string | null;
  iban: string | null;
  poznamka: string | null;
  buyerReference: string;
  /** Peppol ID a názov protistrany (odberateľ, pri samofaktúre dodávateľ). */
  protistranaPeppolId: string;
  protistranaNazov: string;
  /** Číslo pôvodnej faktúry — povinné pri dobropisoch. */
  povodneCislo?: string | null;
  prenesenie?: "domestic_69" | "eu_b2b" | "export" | null;
  zlavaDokladuPercent?: number | null;
  zaplatenaZaloha?: number | null;
  polozky: PolozkaNaOdoslanie[];
};

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function jeDobropis(druh: DruhEdokladu): boolean {
  return druh === "credit_note" || druh === "self_billing_credit_note";
}

/**
 * Druh e-dokladu z typu faktúry vo Fakteri. Zálohová faktúra sa neposiela.
 * Opravný doklad s kladnou sumou (napr. vrátenie opravy podľa § 25a ods. 10)
 * je ťarchopis (383), nie dobropis.
 */
export function druhZFaktury(typ: string | null | undefined, spolu?: number | null): DruhEdokladu {
  if (typ === "credit_note") return Number(spolu ?? 0) > 0 ? "debit_note" : "credit_note";
  if (typ === "advance_payment") return "advance_payment";
  if (typ === "proforma") {
    throw new Error(
      "Zálohová faktúra nie je daňový doklad — cez eFaktúru sa neposiela. Pošlite ju e-mailom; daňový doklad k prijatej platbe už áno.",
    );
  }
  return "invoice";
}

export function teloOdoslania(d: DokladNaOdoslanie): Record<string, unknown> {
  const dobropis = jeDobropis(d.druh);
  if ((dobropis || d.druh === "debit_note") && !String(d.povodneCislo ?? "").trim()) {
    throw new Error(
      "Dobropis musí mať číslo pôvodnej faktúry (BT-25) — vyberte, ktorú faktúru opravuje.",
    );
  }
  const samo = d.druh === "self_billing" || d.druh === "self_billing_credit_note";
  const taxTreatment =
    d.prenesenie === "domestic_69"
      ? "reverse_charge_domestic"
      : d.prenesenie === "eu_b2b"
        ? "intra_community_supply"
        : d.prenesenie === "export"
          ? "export"
          : undefined;

  const items = d.polozky.map((p, i) => {
    const q = Number(p.quantity) || 0;
    const c = Number(p.unit_price) || 0;
    if (q === 0) throw new Error(`Položka ${i + 1} má nulové množstvo — eFaktúra ju neprijme.`);
    /*
      Dobropis vo Fakteri má zápornú sumu (zvyčajne záporné množstvo). V UBL
      dobropise sú sumy kladné, takže sa obráti znamienko riadku. Riadok, ktorý
      by na dobropise sumu zvyšoval, sa vyjadriť nedá.
    */
    const suma = q * c;
    if (dobropis && suma > 0) {
      throw new Error(
        `Položka ${i + 1} („${p.name}“) dobropis zvyšuje — v eFaktúre musí mať dobropis všetky položky so znížením.`,
      );
    }
    if (!dobropis && c < 0) {
      throw new Error(`Položka ${i + 1} („${p.name}“) má zápornú cenu — eFaktúra ju neprijme.`);
    }
    if (!dobropis && q < 0) {
      throw new Error(
        `Položka ${i + 1} („${p.name}“) má záporné množstvo — na vrátenie vystavte dobropis.`,
      );
    }
    const zlava = Number(p.discount_percent) || 0;
    return {
      description: p.description ? `${p.name} — ${p.description}` : p.name,
      quantity: Math.abs(q),
      unitPrice: Math.abs(c),
      vatRate: taxTreatment ? 0 : Number(p.vat_rate) || 0,
      ...(zlava > 0 ? { discount: Math.min(zlava, 100) } : {}),
      ...(taxTreatment ? { taxTreatment } : {}),
    };
  });

  const body: Record<string, unknown> = {
    documentType: d.druh,
    invoiceNumber: d.cislo,
    issueDate: d.vystavena,
    currency: d.mena || "EUR",
    buyerReference: d.buyerReference,
    items,
  };
  if (samo) {
    body.supplierPeppolId = d.protistranaPeppolId;
    body.supplierName = d.protistranaNazov;
  } else {
    body.receiverPeppolId = d.protistranaPeppolId;
    body.receiverName = d.protistranaNazov;
  }
  if (d.splatnost) body.dueDate = d.splatnost;
  if (d.dodanie) body.deliveryDate = d.dodanie;
  if (d.druh === "advance_payment") {
    // Doklad k prijatej platbe: dátum prijatia platby (BT-7), nie neskôr ako vystavenie.
    body.taxPointDate = d.dodanie && d.dodanie <= d.vystavena ? d.dodanie : d.vystavena;
  }
  if (d.vs) body.variableSymbol = d.vs;
  if (d.iban) body.iban = d.iban;
  if (d.poznamka) body.note = d.poznamka.slice(0, 1000);
  if (dobropis || d.druh === "debit_note") body.precedingInvoiceRef = String(d.povodneCislo).trim();
  if (d.zlavaDokladuPercent && d.zlavaDokladuPercent > 0) {
    body.documentDiscountPercent = r6(Math.min(d.zlavaDokladuPercent, 100));
  }
  if (!dobropis && d.zaplatenaZaloha && d.zaplatenaZaloha > 0 && d.druh !== "advance_payment") {
    body.prepaidAmount = Math.round(d.zaplatenaZaloha * 100) / 100;
  }
  return body;
}

/** Zľava na doklad ako percento — ePošták pozná len percento (BG-20). */
export function zlavaNaPercento(
  typ: string | null | undefined,
  hodnota: unknown,
  zakladPredZlavou: number,
): number | null {
  const h = Number(hodnota) || 0;
  if (!typ || h <= 0) return null;
  if (typ === "percent") return Math.min(h, 100);
  if (zakladPredZlavou <= 0) return null;
  return Math.min((h / zakladPredZlavou) * 100, 100);
}
