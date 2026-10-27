/*
  Prevod dokladov z Doklada na riadky Faktera — bez siete a bez databázy,
  nech sa dá overiť testami a vypísať v --dry-run. Popis polí je v MAPPING.md.
*/
import type { DokladAleboFaktura, FakturaV2 } from "./doklado-klient";
import { sablonaZCisla } from "../../src/lib/faktero/ciselne-rady";

export type Druh = "vystavena" | "prijata" | "blocek" | "nezname";

const VYSTAVENE = new Set([
  "domestic_exposed",
  "foreign_exposed",
  "domestic_credit_issued",
  "foreign_credit_issued",
  "domestic_debit_issued",
  "foreign_debit_issued",
  "domestic_advance_issued",
  "foreign_advance_issued",
  "corrective_tax_issued",
  "tax_document_issued",
]);
const PRIJATE = new Set([
  "domestic_received",
  "foreign_received",
  "domestic_credit",
  "foreign_credit",
  "domestic_advance",
  "foreign_advance",
  "domestic_debit",
  "foreign_debit",
  "corrective_tax_received",
  "tax_document_received",
]);

export function druhDokladu(d: DokladAleboFaktura): Druh {
  const typ = String(d.type ?? "").toLowerCase();
  const pod = String(d.subType ?? "");
  if (typ === "receipt") return "blocek";
  if (VYSTAVENE.has(pod)) return "vystavena";
  if (PRIJATE.has(pod)) return "prijata";
  return "nezname";
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const cislo = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
export const lenCislice = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Dátum v slovenskom čase — `2026-03-31T22:30:00Z` je 1. apríla. */
export function datum(v: unknown): string | null {
  const t = text(v);
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(d);
}

export type Sumy = {
  zaklad: number;
  dph: number;
  spolu: number;
  sadzby: { sadzba: number; zaklad: number; dph: number }[];
};

/** Súčty hlavičky — rozpis DPH má prednosť, inak polia základnej/zníženej sadzby. */
export function sumy(d: DokladAleboFaktura): Sumy {
  const x = d as any;
  let sadzby = (Array.isArray(x.vatSummary) ? x.vatSummary : [])
    .map((v: any) => ({
      sadzba: cislo(v.vatRate),
      zaklad: r2(cislo(v.taxBase)),
      dph: r2(cislo(v.vatAmount)),
    }))
    .filter((v: any) => v.zaklad || v.dph);
  if (!sadzby.length) {
    sadzby = [
      {
        sadzba: cislo(x.vatRateBasic),
        zaklad: cislo(x.taxBaseBasic),
        dph: cislo(x.vatAmountBasic),
      },
      {
        sadzba: cislo(x.vatRateReduced),
        zaklad: cislo(x.taxBaseReduced),
        dph: cislo(x.vatAmountReduced),
      },
      { sadzba: 0, zaklad: cislo(x.freeTaxAmount), dph: 0 },
    ].filter((v) => v.zaklad || v.dph);
  }
  const zaklad = r2(sadzby.reduce((s: number, v: any) => s + v.zaklad, 0));
  const dph = r2(sadzby.reduce((s: number, v: any) => s + v.dph, 0));
  const spolu = x.totalPrice != null ? r2(cislo(x.totalPrice)) : r2(zaklad + dph);
  // Bez rozpisu (napr. neplatiteľ) je všetko základ s nulovou sadzbou.
  if (!sadzby.length && spolu) sadzby = [{ sadzba: 0, zaklad: spolu, dph: 0 }];
  return { zaklad: sadzby.length ? zaklad : spolu, dph, spolu, sadzby };
}

/**
 * Čo znamená `price` položky? API to nehovorí a v praxi to býva suma za celý
 * riadok (bager expres: 175 + 300 + 350 + 456 = 1 281 € pri množstvách 5, 10,
 * 10 a 240). Vyhrá výklad — jednotková cena alebo riadok, bez DPH alebo s DPH —
 * ktorého súčet má najbližšie k súčtom dokladu.
 */
export function tvarCien(d: DokladAleboFaktura, s: Sumy): { zaRiadok: boolean; sDph: boolean } {
  const pol = ((d as any).items ?? []).filter((p: any) => p?.itemType !== "advance_payment");
  if (!pol.length) return { zaRiadok: false, sDph: false };
  const riadky = Math.abs(pol.reduce((a: number, p: any) => a + cislo(p.price), 0));
  const jednotky = Math.abs(
    pol.reduce(
      (a: number, p: any) =>
        a +
        cislo(p.price) * cislo(p.quantity ?? 1) * (1 - cislo(p.discount?.discountPercent) / 100),
      0,
    ),
  );
  const zaklad = Math.abs(s.zaklad);
  const spolu = Math.abs(s.spolu);
  const moznosti = [
    { zaRiadok: false, sDph: false, rozdiel: Math.abs(jednotky - zaklad) },
    { zaRiadok: true, sDph: false, rozdiel: Math.abs(riadky - zaklad) },
    // Pri rovnakom základe a celku (bez DPH) rozhoduje výklad bez DPH.
    {
      zaRiadok: false,
      sDph: true,
      rozdiel: Math.abs(jednotky - spolu) + (zaklad === spolu ? 0.001 : 0),
    },
    {
      zaRiadok: true,
      sDph: true,
      rozdiel: Math.abs(riadky - spolu) + (zaklad === spolu ? 0.001 : 0),
    },
  ];
  const najlepsia = moznosti.reduce((a, b) => (b.rozdiel < a.rozdiel ? b : a));
  return { zaRiadok: najlepsia.zaRiadok, sDph: najlepsia.sDph };
}

/** Je cena položky s DPH? (pozri `tvarCien`) */
export function cenySDph(d: DokladAleboFaktura, s: Sumy): boolean {
  return tvarCien(d, s).sDph;
}

export type Polozka = {
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  discount_percent: number;
  subtotal: number;
  vat_amount: number;
  total: number;
  prenesenie: boolean;
};

/** Položky v cenách bez DPH; riadok odpočtu zálohy sa vráti zvlášť. */
export function polozky(d: DokladAleboFaktura, s: Sumy): { polozky: Polozka[]; zaloha: number } {
  const { zaRiadok, sDph } = tvarCien(d, s);
  let zaloha = 0;
  const von: Polozka[] = [];
  for (const p of ((d as any).items ?? []) as any[]) {
    const qty = cislo(p.quantity ?? 1) || 1;
    const sadzba = cislo(p.vatRate);
    const zlava = cislo(p.discount?.discountPercent);
    const prenesenie = p.vatCategory === "reverse_charge";
    const bezDph = sDph ? cislo(p.price) / (1 + sadzba / 100) : cislo(p.price);
    // Suma za riadok sa rozpočíta na jednotkovú cenu (zľava je v nej už započítaná).
    const cena = zaRiadok ? bezDph / qty / (1 - zlava / 100 || 1) : bezDph;
    const subtotal = r2(zaRiadok ? bezDph : cena * qty * (1 - zlava / 100));
    const dph = prenesenie
      ? 0
      : p.vatAmount != null
        ? r2(cislo(p.vatAmount))
        : r2((subtotal * sadzba) / 100);
    if (p.itemType === "advance_payment") {
      zaloha += Math.abs(r2(subtotal + dph));
      continue;
    }
    von.push({
      name: text(p.name) ?? "Položka",
      description: text(p.note),
      quantity: qty,
      unit: text(p.unit) ?? "ks",
      unit_price: Math.round(cena * 10000) / 10000,
      vat_rate: prenesenie ? 0 : sadzba,
      discount_percent: zlava,
      subtotal,
      vat_amount: dph,
      total: r2(subtotal + dph),
      prenesenie,
    });
  }
  // Faktúra bez položiek: jedna položka za každú sadzbu.
  if (!von.length) {
    for (const v of s.sadzby) {
      von.push({
        name: `Plnenie podľa dokladu ${(d as any).invoiceNumber ?? ""}`.trim(),
        description: null,
        quantity: 1,
        unit: "ks",
        unit_price: v.zaklad,
        vat_rate: v.sadzba,
        discount_percent: 0,
        subtotal: v.zaklad,
        vat_amount: v.dph,
        total: r2(v.zaklad + v.dph),
        prenesenie: d.vatCategory === "reverse_charge",
      });
    }
  }
  return { polozky: von, zaloha: r2(zaloha) };
}

export type Partner = {
  name: string;
  ico: string | null;
  dic: string | null;
  ic_dph: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string;
  email: string | null;
  iban: string | null;
};

export function partner(d: DokladAleboFaktura): Partner | null {
  const x = d as any;
  const meno = text(x.organizationName);
  const ico = lenCislice(x.organizationId) || null;
  if (!meno && !ico) return null;
  const a = x.address ?? {};
  const cisloDomu = [text(a.propertyRegistrationNumber), text(a.buildingNumber)]
    .filter(Boolean)
    .join("/");
  return {
    name: meno ?? `IČO ${ico}`,
    ico,
    dic: text(x.organizationTaxId),
    ic_dph: text(x.organizationVatId),
    street: [text(a.streetName), cisloDomu || null].filter(Boolean).join(" ") || null,
    city: text(a.municipality),
    zip: text(a.postalCode),
    country: krajina(a.country),
    email: null,
    iban: text(x.paymentInfo?.iban),
  };
}

const KRAJINY: Record<string, string> = {
  slovensko: "SK",
  "slovenska republika": "SK",
  slovakia: "SK",
  cesko: "CZ",
  "ceska republika": "CZ",
  czechia: "CZ",
  "czech republic": "CZ",
  rakusko: "AT",
  austria: "AT",
  nemecko: "DE",
  germany: "DE",
  madarsko: "HU",
  hungary: "HU",
  polsko: "PL",
  poland: "PL",
};

/** Doklado píše krajinu menom („Slovenská republika“) — Faktero chce kód. */
export function krajina(v: unknown): string {
  const t = text(v);
  if (!t) return "SK";
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  const k = t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  return KRAJINY[k] ?? "SK";
}

/** Kľúč partnera v rámci firmy: IČO, inak meno bez diakritiky. */
export function klucPartnera(p: { ico: string | null; name: string }): string {
  const ico = lenCislice(p.ico);
  if (ico) return `ico:${ico}`;
  return `meno:${p.name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;
}

const typVystavenej = (pod: string) =>
  pod.includes("credit") || pod === "corrective_tax_issued"
    ? "credit_note"
    : pod.includes("debit")
      ? "debit_note"
      : pod.includes("advance")
        ? "advance_payment"
        : "regular";

const uhradaVystavenej = (t: unknown) =>
  ({ cash: "cash", card: "card", transfer: "bank_transfer" })[String(t ?? "").toLowerCase()] ??
  "bank_transfer";
const uhradaPrijatej = (t: unknown) =>
  (({ cash: "hotovost", card: "karta", transfer: "prevod" }) as Record<string, string>)[
    String(t ?? "").toLowerCase()
  ] ?? null;

function zauctovanie(d: DokladAleboFaktura) {
  const a = (d as any).accountingSettings ?? {};
  return {
    pohoda_predkontacia: text(a.accountingItem?.value) ?? text(a.accountingItem?.code),
    pohoda_clenenie_dph: text(a.classificationVat?.code),
    stredisko: text(a.expenditureCenter?.code) ?? text(a.expenditureCenter?.value),
    cinnost: text(a.activity?.code) ?? text(a.activity?.value),
  };
}

/** Kladný doklad sa pri dobropise otočí; záporný ostane, ako ho Doklado poslal. */
const zaporne = (n: number) => -Math.abs(n);

export function vystavena(d: FakturaV2, o: { teraz: string; dnes: string }) {
  const pod = String(d.subType ?? "");
  const typ = typVystavenej(pod);
  const s = sumy(d);
  const { polozky: pol, zaloha } = polozky(d, s);
  const dobropis = typ === "credit_note";
  const otoc = (n: number) => (dobropis ? zaporne(n) : n);
  const vystavenie = datum(d.issuedAt) ?? o.dnes;
  const splatnost = datum(d.dueDate) ?? vystavenie;
  const zaplatena = d.paymentStatus === "paid";
  const p = partner(d);
  const prenesenie = d.vatCategory === "reverse_charge";
  const z = zauctovanie(d);
  const pay = (d as any).paymentInfo ?? {};
  return {
    hlavicka: {
      doklado_id: d.documentId,
      type: typ,
      status: zaplatena ? "paid" : "issued",
      paid_at: zaplatena ? `${splatnost <= o.dnes ? splatnost : vystavenie}T12:00:00Z` : null,
      invoice_number: text(d.invoiceNumber) ?? `DOKLADO-${d.documentId}`,
      sequence_number: text(d.invoiceNumber)
        ? (sablonaZCisla(String(d.invoiceNumber), vystavenie)?.poradie ?? null)
        : null,
      variable_symbol: text(pay.vs) ?? (lenCislice(d.invoiceNumber) || null),
      constant_symbol: text(pay.ks),
      specific_symbol: text(pay.ss),
      payment_iban: text(pay.iban),
      payment_swift: text(pay.bic),
      issue_date: vystavenie,
      delivery_date: datum(d.deliveryDate) ?? datum(d.taxPointDate),
      due_date: splatnost,
      currency: text(d.currency) ?? "EUR",
      exchange_rate: text(d.currency) && d.currency !== "EUR" ? (d.exchangeRate ?? null) : null,
      payment_method: uhradaVystavenej(d.paymentType),
      order_number: text(d.orderReference),
      customer_name: p?.name ?? null,
      customer_ico: p?.ico ?? null,
      customer_dic: p?.dic ?? null,
      customer_ic_dph: p?.ic_dph ?? null,
      customer_street: p?.street ?? null,
      customer_city: p?.city ?? null,
      customer_zip: p?.zip ?? null,
      customer_country: p?.country ?? "SK",
      subtotal: otoc(s.zaklad),
      vat_total: prenesenie ? 0 : otoc(s.dph),
      total: otoc(s.spolu),
      advance_amount: zaloha || null,
      reverse_charge: prenesenie,
      reverse_charge_type: prenesenie
        ? pod.startsWith("foreign")
          ? "eu_b2b"
          : "domestic_69"
        : null,
      oprava_25a: pod === "corrective_tax_issued",
      notes:
        [
          text(d.note),
          pod === "tax_document_issued" ? "Daňový doklad k prijatej platbe (z Doklada)." : null,
        ]
          .filter(Boolean)
          .join("\n") || null,
      int_poznamka: text(d.internalNote),
      ...(z.pohoda_predkontacia || z.pohoda_clenenie_dph
        ? { ...z, zauctovane_at: o.teraz, zauctovanie_zdroj: "manual" }
        : { stredisko: z.stredisko, cinnost: z.cinnost }),
      import_source: "doklado",
      imported_at: o.teraz,
      original_external_id: d.documentId,
      auto_uctovanie_at: o.teraz,
    },
    polozky: pol.map((x, i) => ({
      position: i + 1,
      name: x.name,
      description: x.description,
      quantity: dobropis ? zaporne(x.quantity) : x.quantity,
      unit: x.unit,
      unit_price: x.unit_price,
      vat_rate: x.vat_rate,
      discount_percent: x.discount_percent,
      subtotal: otoc(x.subtotal),
      vat_amount: prenesenie || x.prenesenie ? 0 : otoc(x.vat_amount),
      total: otoc(prenesenie || x.prenesenie ? x.subtotal : x.total),
      prenesenie: x.prenesenie || prenesenie,
    })),
    partner: p,
  };
}

export function prijata(d: FakturaV2, o: { teraz: string; dnes: string }) {
  const pod = String(d.subType ?? "");
  const s = sumy(d);
  const { polozky: pol } = polozky(d, s);
  const dobropis = pod.includes("credit");
  const otoc = (n: number) => (dobropis ? zaporne(n) : n);
  const vystavenie = datum(d.issuedAt) ?? o.dnes;
  const splatnost = datum(d.dueDate) ?? vystavenie;
  const p = partner(d);
  const prenesenie = d.vatCategory === "reverse_charge";
  const zahranicna = pod.startsWith("foreign");
  const z = zauctovanie(d);
  const zauctovana = Boolean(z.pohoda_predkontacia || z.pohoda_clenenie_dph);
  const zaplatena = d.paymentStatus === "paid";
  const pay = (d as any).paymentInfo ?? {};
  return {
    hlavicka: {
      doklado_id: d.documentId,
      type: pod.includes("advance") ? "proforma" : "regular",
      status: zaplatena ? "paid" : zauctovana ? "booked" : "received",
      payment_date: zaplatena ? (splatnost <= o.dnes ? splatnost : vystavenie) : null,
      supplier_name: p?.name ?? "Neurčený dodávateľ",
      supplier_ico: p?.ico ?? null,
      supplier_dic: p?.dic ?? null,
      supplier_ic_dph: p?.ic_dph ?? null,
      supplier_street: p?.street ?? null,
      supplier_city: p?.city ?? null,
      supplier_zip: p?.zip ?? null,
      supplier_country: p?.country ?? null,
      supplier_iban: p?.iban ?? null,
      invoice_number: text(d.invoiceNumber) ?? text(pay.vs) ?? "bez čísla",
      opravuje_cislo: dobropis ? text(d.originalNumber) : null,
      variable_symbol: text(pay.vs),
      constant_symbol: text(pay.ks),
      specific_symbol: text(pay.ss),
      issue_date: vystavenie,
      received_date: vystavenie,
      delivery_date: datum(d.deliveryDate) ?? datum(d.taxPointDate),
      due_date: splatnost,
      amount_without_vat: otoc(s.zaklad),
      vat_amount: otoc(s.dph),
      amount_total: otoc(s.spolu),
      currency: text(d.currency) ?? "EUR",
      exchange_rate: text(d.currency) && d.currency !== "EUR" ? (d.exchangeRate ?? null) : null,
      payment_method: uhradaPrijatej(d.paymentType),
      reverse_charge: prenesenie,
      reverse_charge_type: prenesenie ? (zahranicna ? "eu_b2b" : "domestic_69") : null,
      dph_rezim: prenesenie
        ? zahranicna
          ? "nadobudnutie"
          : "samozdanenie"
        : d.vatCategory === "tax_exempt"
          ? "bez_dane"
          : "tuzemsko",
      order_number: text(d.orderReference),
      delivery_note_number: text((d as any).deliveryNoteNumber),
      note: [text(d.note), "Prenesené z Doklada."].filter(Boolean).join("\n"),
      int_poznamka: text(d.internalNote),
      items: pol.length
        ? pol.map((x) => ({
            name: x.name,
            quantity: dobropis ? zaporne(x.quantity) : x.quantity,
            unit_price: x.unit_price,
            vat_rate: x.vat_rate,
            total: otoc(x.total),
            unit: x.unit,
          }))
        : null,
      ...z,
      ...(zauctovana ? { zauctovane_at: o.teraz, zauctovanie_zdroj: "manual" } : {}),
      source: "import",
      auto_uctovanie_at: o.teraz,
    },
    partner: p,
  };
}

export function blocek(d: DokladAleboFaktura, o: { teraz: string; dnes: string }) {
  const x = d as any;
  const s = sumy(d);
  const { polozky: pol } = polozky(d, s);
  const uhrada = uhradaPrijatej(x.paymentType) ?? "karta";
  const z = zauctovanie(d);
  const zauctovany = Boolean(z.pohoda_predkontacia || z.pohoda_clenenie_dph);
  return {
    doklado_id: x.documentId,
    status: "processed",
    source: "import",
    supplier_name: text(x.organizationName),
    supplier_ico: lenCislice(x.organizationId) || null,
    supplier_ic_dph: text(x.organizationVatId),
    document_number: text(x.invoiceNumberV2) ?? text(x.invoiceNumber) ?? text(x.receiptUID),
    qr_raw: text(x.receiptUID),
    issue_date: datum(x.issuedAt) ?? o.dnes,
    total_amount: s.spolu,
    vat_amount: s.dph,
    net_amount: s.zaklad,
    vat_rate: s.sadzby.length === 1 ? s.sadzby[0]!.sadzba : null,
    vat_breakdown: s.sadzby.length
      ? s.sadzby.map((v) => ({ sadzba: v.sadzba, zaklad: v.zaklad, dph: v.dph }))
      : null,
    // `totalPrice` je v eurách aj pri bločku v cudzej mene (pôvodná je v `otherCurrency`).
    currency: "EUR",
    payment_method: uhrada,
    // Staré bločky v hotovosti nesmú pohnúť stavom pokladne.
    mimo_pokladne: uhrada === "hotovost",
    items: pol.length
      ? pol.map((p) => ({
          name: p.name,
          quantity: p.quantity,
          unit_price: p.unit_price,
          vat_rate: p.vat_rate,
          total: p.total,
        }))
      : null,
    note: [text(x.note), "Prenesené z Doklada."].filter(Boolean).join("\n"),
    int_poznamka: text(x.internalNote),
    ...z,
    ...(zauctovany ? { zauctovane_at: o.teraz, zauctovanie_zdroj: "manual" } : {}),
    processed_at: o.teraz,
    auto_uctovanie_at: o.teraz,
  };
}

/** Bezpečné meno súboru do cesty v úložisku (diakritika a medzery tam robia problémy). */
export function menoSuboru(meno: string | undefined, nahradne: string) {
  const m = String(meno ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return m || nahradne;
}
