/**
 * Nemecká e-faktúra — XRechnung 3.0 (UBL 2.1) a spoločné nemecké úpravy
 * údajov EN 16931, z ktorých vychádza aj ZUGFeRD / Factur-X (`zugferd.server.ts`).
 *
 * Nadstavba nad slovenským Peppol generátorom: `mapToEN16931` dá faktúru v
 * tvare EN 16931, tu sa doplní a prepíše to, čo Nemecko chce inak:
 *
 *  - **BT-10 Buyer reference** je povinná (BR-DE-15). Úrady v nej chcú
 *    Leitweg-ID. Pri B2B Leitweg-ID neexistuje a prax (KoSIT FAQ, ZUGFeRD
 *    community, veľké ERP) je dať tam číslo objednávky odberateľa a keď nie
 *    je ani to, „n/a“ — schematron kontroluje len to, že pole nie je prázdne.
 *    Variabilný symbol sem nepatrí (to je BT-83 „Verwendungszweck“).
 *  - **BT-34 / BT-49 elektronické adresy** predávajúceho aj kupujúceho sú v
 *    XRechnung 3.0 povinné (PEPPOL-EN16931-R020/R010). Bez Peppol id sa
 *    použije e-mail so schémou `EM`.
 *  - **Kontakt predávajúceho** — meno, telefón, e-mail (BR-DE-2, 5, 6, 7).
 *  - **Steuernummer** ide do BT-32 (`PartyTaxScheme` so schémou „FC“), nie do
 *    IČ DPH; Handelsregister do BT-30, Registergericht a Geschäftsführer do
 *    BT-33.
 *  - **Kategórie DPH** podľa scenára: bežná S / nulová Z; Kleinunternehmer
 *    § 19 UStG = **E** s dôvodom (nie O — firma je v rozsahu dane, len je od
 *    nej oslobodená); § 13b UStG a služba do EÚ = **AE**; dodanie tovaru do
 *    EÚ = **K**; vývoz = **G**; trojstranný obchod § 25b = **AE** (daň platí
 *    posledný odberateľ). K tomu kódy VATEX a nemecké vety z `faktura-jazyk`.
 *  - **Platobné údaje** sú povinné (BR-DE-1): prevod 58 (SEPA) s IBAN-om,
 *    hotovosť 10. Karta (48) by chcela číslo karty (BR-DE-24-a), ktoré nemáme,
 *    tak ide ako „1 — nešpecifikované“.
 *  - **Druh dokladu** len z povoleného zoznamu (BR-DE-17): ťarchopis 383 sa
 *    píše ako opravná faktúra 384 s odkazom na pôvodnú (BR-DE-26).
 *  - **Zaokrúhlenie** sumy na úhradu ide do BT-114, aby sedelo BR-CO-16.
 *  - **Differenzbesteuerung** (§ 25a UStG) a cestovné kancelárie (§ 25 UStG):
 *    daň sa na faktúre neuvádza (§ 14a Abs. 6 S. 2), položky sú so sadzbou 0 %.
 *    V EN 16931 sú to kategória **E** s kódmi VATEX-EU-F/I/J (použitý tovar,
 *    umenie, zberateľské predmety) a VATEX-EU-D (cestovné kancelárie); dôvod je
 *    veta § 14a Abs. 6 („Gebrauchtgegenstände/Sonderregelung“…). Slovenské UBL
 *    (ePošták) osobitnú úpravu do XML nepíše — tam ostáva len na PDF.
 *  - **Upozornenie na uchovanie** (§ 14 Abs. 4 Nr. 9 / § 14b Abs. 1 S. 5) ide
 *    do poznámky BT-22 rovnakým znením ako na PDF.
 */
import type {
  EN16931Invoice,
  EN16931Line,
  EN16931TaxSubtotal,
  XmlGenerationResult,
} from "./efaktura/types";
import { mapToEN16931 } from "./efaktura/en16931.server";
import { generatePeppolBisXml, validate } from "./efaktura/xml.server";
import { rezimFirmy, type FirmaDph } from "./dph-rezim";
import { krajinaDane } from "./vat-rates";
import { pataFirmyDe } from "./firma-de";
import { datumNaDoklade, vetyDe } from "./faktura-jazyk";
import { platnyIban } from "./vyber-z-dokladu";
import { VETA_AUFBEWAHRUNG_DE, vetaUpravyDe, type OsobitnaUprava } from "./faktura-nalezitosti";
import type { OdpocetZalohy } from "./zalohy-odpocty";

export const XRECHNUNG_CUSTOMIZATION_ID =
  "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";
/** BT-23 — proces; XRechnung ho preberá z Peppol BIS (PEPPOL-EN16931-R001). */
export const XRECHNUNG_PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";
/** Factur-X / ZUGFeRD profil EN 16931 („COMFORT“). */
export const EN16931_GUIDELINE_ID = "urn:cen.eu:en16931:2017";

/** § 25b UStG — veta na faktúre prostrednej osoby v trojstrannom obchode. */
export const VETA_TROJSTRANNY_DE = vetyDe("de").trojstranny;

export type PodkladyFaktury = {
  company: any;
  profile?: any;
  invoice: any;
  items: any[];
  /** Karta odberateľa (kvôli Leitweg-ID), ak ešte existuje. */
  customer?: any;
  povodnaFaktura?: { cislo: string; vystavena?: string | null } | null;
  zalohy?: OdpocetZalohy[] | null;
};

export type ChybaEfaktury = { code: string; message: string; path?: string };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const txt = (v: unknown) => String(v ?? "").trim();

/** Elektronická adresa: zadané Peppol id (`schéma:hodnota`), inak e-mail (EM). */
function adresa(peppol: unknown, email: unknown): { endpointScheme?: string; endpointId?: string } {
  const p = txt(peppol).replace(/\s/g, "");
  const i = p.indexOf(":");
  if (i > 0 && i < p.length - 1)
    return { endpointScheme: p.slice(0, i), endpointId: p.slice(i + 1) };
  const e = txt(email);
  return e ? { endpointScheme: "EM", endpointId: e } : {};
}

/**
 * BT-10. Leitweg-ID z karty odberateľa (stĺpec `leitweg_id`, alebo Peppol id
 * v schéme 0204, čo je Leitweg-ID v sieti Peppol), potom číslo objednávky,
 * nakoniec „n/a“.
 */
export function referenciaOdberatela(p: { invoice: any; customer?: any }): {
  hodnota: string;
  leitweg: boolean;
} {
  const leitweg =
    txt(p.invoice?.leitweg_id) ||
    txt(p.customer?.leitweg_id) ||
    (/^0204:/.test(txt(p.customer?.peppol_id)) ? txt(p.customer?.peppol_id).slice(5) : "");
  if (leitweg) return { hodnota: leitweg, leitweg: true };
  const obj = txt(p.invoice?.order_number) || txt(p.invoice?.customer_order_number);
  return { hodnota: obj || "n/a", leitweg: false };
}

function kodPlatby(metoda: unknown, iban: string | undefined): string {
  const m = txt(metoda).toLowerCase();
  if (["cash", "hotovost"].includes(m)) return "10";
  if (["card", "karta", "credit_card"].includes(m)) return "1";
  // SEPA prevod len na IBAN zo SEPA priestoru; inak všeobecný prevod 30.
  if (iban && /^[A-Z]{2}/.test(iban)) return "58";
  return "30";
}

/**
 * VATEX kódy osobitných úprav (CEF VATEX code list): D = cestovné kancelárie
 * (§ 25 UStG, čl. 306 smernice), F = použitý tovar, I = umelecké diela,
 * J = zberateľské predmety a starožitnosti (§ 25a UStG, čl. 311 a n.).
 */
export const VATEX_OSOBITNEJ_UPRAVY: Record<OsobitnaUprava, string> = {
  "65": "VATEX-EU-D",
  "66_tovar": "VATEX-EU-F",
  "66_umenie": "VATEX-EU-I",
  "66_starozitnosti": "VATEX-EU-J",
};

/** Kategória, kód VATEX a dôvod oslobodenia pre nemeckú firmu. */
function dphScenar(
  invoice: any,
  kategoria: EN16931Line["vatCategory"],
): { kategoria: EN16931Line["vatCategory"]; kod?: string; dovod?: string } {
  const v = vetyDe("de");
  if (kategoria === "AE") {
    if (invoice.reverse_charge_type === "eu_b2b" && invoice.eu_plnenie === "trojstranny")
      return { kategoria: "AE", kod: "VATEX-EU-AE", dovod: VETA_TROJSTRANNY_DE };
    if (invoice.reverse_charge_type === "eu_b2b")
      return { kategoria: "AE", kod: "VATEX-EU-AE", dovod: v.euSluzba };
    return { kategoria: "AE", kod: "VATEX-EU-AE", dovod: v.tuzemsko };
  }
  if (kategoria === "K") return { kategoria: "K", kod: "VATEX-EU-IC", dovod: v.euTovar };
  if (kategoria === "G") return { kategoria: "G", kod: "VATEX-EU-G", dovod: v.vyvoz };
  return { kategoria };
}

/**
 * Faktúra nemeckej firmy v tvare EN 16931 — spoločný základ pre XRechnung
 * (UBL) aj ZUGFeRD (CII). `customizationId` rozhoduje, čo z toho vznikne.
 */
export function mapToEN16931De(
  p: PodkladyFaktury,
  opts: { customizationId: string; profileId?: string },
): EN16931Invoice {
  const { company, invoice } = p;
  const dto = mapToEN16931({
    company,
    profile: p.profile,
    invoice,
    items: p.items,
    povodnaFaktura: p.povodnaFaktura ?? null,
    zalohy: p.zalohy ?? null,
    customizationId: opts.customizationId,
    profileId: opts.profileId ?? XRECHNUNG_PROFILE_ID,
  });
  const ku = rezimFirmy(company as FirmaDph).schema === "de_kleinunternehmer";

  // ── druh dokladu (BR-DE-17) ──
  if (invoice.type === "debit_note") dto.documentType = "384";
  /*
    Doklad k prijatej platbe (Anzahlungsrechnung) je 386. BR-DE-17 ho medzi
    „odporúčanými“ nemá — je to len varovanie, EN 16931 kód povoľuje a
    účtovník odberateľa podľa neho spozná, že nejde o konečné vyúčtovanie.
  */
  if (invoice.type === "advance_payment") dto.documentType = "386";

  // ── predávajúci ──
  const seller = dto.seller;
  seller.vatId = txt(company.ic_dph) || undefined;
  seller.taxId = undefined;
  seller.taxRegistrationId = txt(company.dic) || undefined;
  seller.registrationId = txt(company.handelsregister_nr) || txt(company.ico) || undefined;
  seller.legalInfo = pataFirmyDe(company) ?? undefined;
  Object.assign(seller, adresa(p.profile?.peppol_participant_id, company.email));
  seller.contact = {
    name: txt(company.geschaeftsfuehrer) || txt(company.name) || undefined,
    phone: txt(company.phone) || undefined,
    email: txt(company.email) || undefined,
  };
  seller.address.countryCode = "DE";

  // ── kupujúci ──
  const buyer = dto.buyer;
  buyer.vatId = txt(invoice.customer_ic_dph) || undefined;
  buyer.taxId = undefined;
  // Nemecké IČO neexistuje; registrácia odberateľa sa píše, len keď ju faktúra má.
  buyer.registrationId = txt(invoice.customer_ico) || undefined;
  for (const k of ["endpointScheme", "endpointId"] as const) delete buyer[k];
  Object.assign(buyer, adresa(p.customer?.peppol_id, invoice.customer_email || p.customer?.email));

  // ── referencie a dátumy ──
  dto.buyerReference = referenciaOdberatela(p).hodnota;
  dto.orderReference = txt(invoice.order_number) || undefined;
  dto.deliveryDate = txt(invoice.delivery_date) || txt(invoice.issue_date) || undefined;
  dto.paymentTerms =
    dto.documentType === "381"
      ? "Rechnungskorrektur – der Betrag wird erstattet."
      : invoice.due_date
        ? `Zahlbar ohne Abzug bis ${datumNaDoklade(invoice.due_date, "de")}.`
        : undefined;

  // ── platba (BR-DE-1) ──
  const iban = dto.paymentMeans?.iban?.replace(/\s/g, "").toUpperCase();
  const kod = kodPlatby(invoice.payment_method, iban);
  dto.paymentMeans = {
    code: kod,
    iban: kod === "58" || kod === "30" ? iban : undefined,
    bic: kod === "58" || kod === "30" ? dto.paymentMeans?.bic : undefined,
    accountName: kod === "58" || kod === "30" ? txt(company.name) : undefined,
    reference: txt(invoice.variable_symbol) || txt(invoice.invoice_number),
  };

  // ── DPH ──
  if (ku) {
    /*
      Kleinunternehmer: všetko kategória E so sadzbou 0 a dôvodom. Keby sa
      nechalo „O“ (mimo rozsahu), schematron by zakázal aj USt-IdNr. a BR-DE-14
      by chcel sadzbu, ktorú „O“ mať nesmie.
    */
    const dovod = `Kleinunternehmerregelung: ${vetyDe("de").kleinunternehmer}`;
    dto.lines = dto.lines.map((l) => ({ ...l, vatCategory: "E", vatPercent: 0 }));
    dto.taxSubtotals = [
      {
        taxableAmount: r2(dto.lines.reduce((a, l) => a + l.lineExtensionAmount, 0)),
        taxAmount: 0,
        vatCategory: "E",
        vatPercent: 0,
        exemptionReason: dovod,
      },
    ];
    dto.totals.taxAmount = 0;
    dto.totals.taxInclusiveAmount = dto.totals.taxExclusiveAmount;
    dto.totals.payableAmount = r2(dto.totals.taxInclusiveAmount - (dto.totals.prepaidAmount ?? 0));
  } else {
    dto.taxSubtotals = dto.taxSubtotals.map((t): EN16931TaxSubtotal => {
      const s = dphScenar(invoice, t.vatCategory);
      return {
        ...t,
        vatCategory: s.kategoria,
        exemptionReason: s.dovod,
        exemptionReasonCode: s.kod,
      };
    });
    /*
      Osobitná úprava (§ 25 / § 25a UStG): položky bez dane (0 %) idú ako E s
      kódom VATEX a vetou § 14a Abs. 6. Položky so sadzbou ostávajú S — na jednej
      faktúre môže byť ojazdené auto (rozdiel) aj nový diel (bežne zdanený).
      Pri prenesení daňovej povinnosti sa úprava neuplatňuje (formulár ju nedovolí).
    */
    const vetaUpravy = vetaUpravyDe(invoice.osobitna_uprava);
    if (vetaUpravy && !invoice.reverse_charge) {
      const kodUpravy = VATEX_OSOBITNEJ_UPRAVY[invoice.osobitna_uprava as OsobitnaUprava];
      dto.lines = dto.lines.map((l) =>
        l.vatCategory === "Z" ? { ...l, vatCategory: "E", vatPercent: 0 } : l,
      );
      dto.taxSubtotals = dto.taxSubtotals.map((t) =>
        t.vatCategory === "Z"
          ? { ...t, vatCategory: "E", exemptionReasonCode: kodUpravy, exemptionReason: vetaUpravy }
          : t,
      );
    }
    // Služba do EÚ a trojstranný obchod sú prenesenie (AE), nie dodanie tovaru (K).
    if (
      invoice.reverse_charge_type === "eu_b2b" &&
      (invoice.eu_plnenie === "sluzba" || invoice.eu_plnenie === "trojstranny")
    ) {
      const naAe = <T extends { vatCategory: EN16931Line["vatCategory"] }>(x: T): T =>
        x.vatCategory === "K" ? { ...x, vatCategory: "AE" } : x;
      dto.lines = dto.lines.map(naAe);
      dto.taxSubtotals = dto.taxSubtotals.map((t) =>
        t.vatCategory === "K"
          ? {
              ...t,
              vatCategory: "AE",
              exemptionReasonCode: "VATEX-EU-AE",
              exemptionReason:
                invoice.eu_plnenie === "trojstranny" ? VETA_TROJSTRANNY_DE : vetyDe("de").euSluzba,
            }
          : t,
      );
    }
  }
  /*
    Dodanie tovaru do EÚ (K) musí povedať, kam sa tovar dodal (BR-IC-12) —
    ide adresa odberateľa. Nemecko k nej chce aj mesto a PSČ (BR-DE-10/11).
  */
  if (dto.taxSubtotals.some((t) => t.vatCategory === "K")) {
    dto.deliveryAddress = { ...buyer.address };
  }

  // ── poznámka (BT-22): vety v nemčine, poznámka firmy ──
  const vety: string[] = [];
  for (const t of dto.taxSubtotals)
    if (t.exemptionReason && !vety.includes(t.exemptionReason)) vety.push(t.exemptionReason);
  /*
    Tie isté vety ako na PDF (`vetyNaDoklad` pre DE): osobitná úprava § 14a
    Abs. 6 (aj keď je na faktúre len zdanená položka a dôvod oslobodenia preto
    nevznikol) a upozornenie na dvojročné uchovanie § 14b Abs. 1 S. 5.
  */
  const vetaUpravyPozn =
    ku || invoice.reverse_charge ? null : vetaUpravyDe(invoice.osobitna_uprava);
  if (vetaUpravyPozn && !vety.includes(vetaUpravyPozn)) vety.push(vetaUpravyPozn);
  if (invoice.de_hinweis_aufbewahrung && !vety.includes(VETA_AUFBEWAHRUNG_DE))
    vety.push(VETA_AUFBEWAHRUNG_DE);
  if (txt(invoice.notes)) vety.push(txt(invoice.notes));
  dto.note = vety.join(" | ") || undefined;

  // ── zaokrúhlenie sumy na úhradu (BT-114) ──
  const bezZaloh = !(p.zalohy ?? []).length && !(Number(invoice.advance_amount) > 0);
  if (bezZaloh && invoice.total != null) {
    const rozdiel = r2(Math.abs(Number(invoice.total)) - dto.totals.taxInclusiveAmount);
    if (Math.abs(rozdiel) >= 0.01 && Math.abs(rozdiel) <= 0.5) {
      dto.totals.roundingAmount = rozdiel;
      dto.totals.payableAmount = r2(dto.totals.taxInclusiveAmount + rozdiel);
    }
  }
  return dto;
}

/** Pravidlá EN 16931 / XRechnung, ktoré vie Faktero skontrolovať samo (slovenské hlášky pre `t`). */
export function chybyNemeckejFaktury(dto: EN16931Invoice, xrechnung: boolean): ChybaEfaktury[] {
  const chyby: ChybaEfaktury[] = [...validate(dto)].filter((c) => c.code !== "SK-BT-25");
  const need = (ok: boolean, code: string, message: string) => {
    if (!ok) chyby.push({ code, message });
  };
  const s = dto.seller;
  const b = dto.buyer;
  need(
    (dto.documentType !== "381" && dto.documentType !== "384") || !!dto.precedingInvoice?.id,
    "BR-DE-26",
    "Dobropis aj opravná faktúra musia obsahovať číslo pôvodnej faktúry.",
  );
  need(!!txt(s.address.city), "BR-DE-3", "Doplňte mesto firmy.");
  need(!!txt(s.address.postalCode), "BR-DE-4", "Doplňte PSČ firmy.");
  need(!!txt(b.address.city), "BR-DE-8", "Doplňte mesto odberateľa.");
  need(!!txt(b.address.postalCode), "BR-DE-9", "Doplňte PSČ odberateľa.");
  const kategorie = new Set(dto.taxSubtotals.map((t) => t.vatCategory));
  need(
    !!(s.vatId || s.taxRegistrationId),
    "BR-DE-16",
    "Na faktúre musí byť Steuernummer alebo USt-IdNr. (§ 14 Abs. 4 UStG) — vyplňte aspoň jedno.",
  );
  if (kategorie.has("AE") || kategorie.has("K") || kategorie.has("G"))
    need(
      !!s.vatId,
      "BR-AE-02",
      "Pri prenesení daňovej povinnosti, dodaní do EÚ a vývoze musí mať firma USt-IdNr.",
    );
  if (kategorie.has("K")) need(!!b.vatId, "BR-IC-02", "Dodanie do EÚ potrebuje IČ DPH odberateľa.");
  if (kategorie.has("AE"))
    need(
      !!(b.vatId || b.registrationId),
      "BR-AE-02",
      "Pri prenesení daňovej povinnosti musí mať odberateľ IČ DPH alebo registračné číslo.",
    );
  const pm = dto.paymentMeans;
  if (pm && (pm.code === "58" || pm.code === "30"))
    need(!!pm.iban, "BR-DE-23-a", "Na úhradu prevodom chýba IBAN firmy.");
  if (pm?.code === "58" && pm.iban)
    need(platnyIban(pm.iban), "BR-DE-19", "IBAN firmy nie je platný.");
  if (xrechnung) {
    need(
      !!txt(s.contact?.phone),
      "BR-DE-6",
      "XRechnung vyžaduje telefón firmy — doplňte ho v údajoch firmy.",
    );
    need(
      !!txt(s.contact?.email),
      "BR-DE-7",
      "XRechnung vyžaduje e-mail firmy — doplňte ho v údajoch firmy.",
    );
    need(
      !!s.endpointId,
      "PEPPOL-EN16931-R020",
      "XRechnung vyžaduje elektronickú adresu firmy (e-mail).",
    );
    need(
      !!b.endpointId,
      "PEPPOL-EN16931-R010",
      "XRechnung vyžaduje elektronickú adresu odberateľa — doplňte jeho e-mail.",
    );
  }
  return chyby;
}

/** XRechnung 3.0 v syntaxi UBL 2.1. */
export function generateXRechnung(p: PodkladyFaktury): XmlGenerationResult {
  if (p.invoice?.type === "proforma") {
    throw new Error("Zálohová faktúra nie je daňový doklad — XRechnung sa k nej nevystavuje.");
  }
  if (krajinaDane(p.company?.country) !== "DE") {
    throw new Error("XRechnung sa vystavuje len pre firmu so sídlom v Nemecku.");
  }
  const dto = mapToEN16931De(p, { customizationId: XRECHNUNG_CUSTOMIZATION_ID });
  const vysledok = generatePeppolBisXml(dto);
  const chyby = chybyNemeckejFaktury(dto, true);
  return {
    ...vysledok,
    format: "ubl_2_1",
    schemaVersion: "XRechnung 3.0",
    validationErrors: chyby,
    valid: chyby.length === 0,
  };
}
