import { krajinaDane } from "./vat-rates";

/**
 * ISDOC — český národný formát elektronickej faktúry.
 *
 * Prečo vôbec: v Česku je e-fakturácia voči štátu (B2G) **povinná od roku
 * 2016** a doklad musí byť v ISDOC-u alebo Peppol BIS 3.0. Plošná B2B
 * povinnosť sa tam čaká až po roku 2030, takže pre českú firmu je toto
 * naliehavejšie než eFaktúra cez Peppol.
 *
 * Faktero ISDOC dovtedy vedelo len **čítať** (`isdoc.ts`, import zo
 * SuperFaktúry). Tento modul je opačný smer a zámerne stojí vedľa neho, nie
 * v ňom: čítanie prijíma všeličo, zápis musí sedieť na schému.
 *
 * Overuje sa proti oficiálnej schéme `isdoc-invoice-6.0.2.xsd` (MV ČR) v
 * `isdoc-export.test.ts` — rovnako, ako sa camt.053 overuje proti svojej.
 */

type Riadok = Record<string, any>;

function esc(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const c2 = (n: unknown) => Number(n ?? 0).toFixed(2);

/**
 * Číslo účtu a kód banky z IBAN-u.
 *
 * Schéma ich pri platbe na účet vyžaduje oboje a Faktero ich samostatne
 * neeviduje — má len IBAN. Český aj slovenský IBAN má rovnakú stavbu:
 * `CCkk BBBB PPPPPP AAAAAAAAAA` (4 kód banky, 6 predčíslie, 10 účet), takže
 * sa dajú spoľahlivo odvodiť. Pri inom IBAN-e to neplatí a hádať sa nebude.
 */
export function ucetZIbanu(iban?: string | null): { cislo: string; kodBanky: string } | null {
  const s = String(iban ?? "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
  if (!/^(CZ|SK)\d{22}$/.test(s)) return null;
  const kodBanky = s.slice(4, 8);
  const predcislie = s.slice(8, 14).replace(/^0+/, "");
  const ucet = s.slice(14).replace(/^0+/, "") || "0";
  return { cislo: predcislie ? `${predcislie}-${ucet}` : ucet, kodBanky };
}
const c4 = (n: unknown) => Number(n ?? 0).toFixed(4);

/** Prvok sa vynechá, keď je prázdny — schéma väčšinu z nich nepovoľuje prázdne. */
function tag(meno: string, hodnota: unknown): string {
  const v = hodnota === null || hodnota === undefined ? "" : String(hodnota).trim();
  return v ? `<${meno}>${esc(v)}</${meno}>` : "";
}

/**
 * `1` faktúra, `2` dobropis, `4` zálohová.
 * Vrubopis (`3`) Faktero nepozná — zvýšenie ceny sa vystavuje ako nová faktúra.
 */
function typDokladu(typ: unknown): string {
  const t = String(typ ?? "regular");
  if (t === "credit_note") return "2";
  if (t === "proforma") return "4";
  return "1";
}

/**
 * UUID dokladu.
 *
 * Schéma ho vyžaduje a má identifikovať doklad naprieč systémami, takže sa
 * nesmie pri každom vývoze meniť — inak by to isté číslo faktúry prišlo
 * príjemcovi zakaždým ako iný doklad. Odvádza sa preto z `id` faktúry, ktoré
 * je v databáze už samo UUID.
 */
export function uuidDokladu(invoice: Riadok): string {
  const id = String(invoice?.id ?? "");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id.toUpperCase();
  }
  // Doklad bez id (náhľad, test) — z čísla faktúry sa poskladá stabilná náhrada.
  const zdroj = `${invoice?.invoice_number ?? ""}|${invoice?.issue_date ?? ""}`;
  let h = 0x811c9dc5;
  const znaky: number[] = [];
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < zdroj.length; j++) {
      h ^= zdroj.charCodeAt(j) + i;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    znaky.push(h % 16);
  }
  const hex = znaky.map((x) => x.toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`.toUpperCase();
}

function strana(o: Riadok, meno: string): string {
  const ulica = String(o.street ?? "").trim();
  /*
    `PartyIdentification` je povinná a `ID` (IČO) v nej takisto — prázdny prvok
    ju zneplatní, ale prázdny **obsah** schéma pripúšťa. Odberateľ bez IČO je
    bežný (fyzická osoba), tak `ID` ostane prázdne a pridá sa naše číslo
    záznamu ako „uživatelské číslo firmy", nech je doklad k niečomu priradený.

    Vyšlo to najavo až na skutočnej faktúre — v teste mali obe strany IČO.
  */
  const ico = String(o.ico ?? "").trim();
  const identifikacia = ico
    ? `<ID>${esc(ico)}</ID>`
    : `<UserID>${esc(String(o.id ?? o.name ?? "").slice(0, 32))}</UserID><ID></ID>`;
  return `
  <${meno}>
   <Party>
    <PartyIdentification>${identifikacia}</PartyIdentification>
    <PartyName>${tag("Name", o.name)}</PartyName>
    <PostalAddress>
     <StreetName>${esc(ulica)}</StreetName>
     <BuildingNumber>${esc(o.building_number ?? "")}</BuildingNumber>
     <CityName>${esc(o.city ?? "")}</CityName>
     <PostalZone>${esc(o.zip ?? "")}</PostalZone>
     <Country>
      <IdentificationCode>${esc((o.country || "CZ").toUpperCase().slice(0, 2))}</IdentificationCode>
      <Name>${esc(o.country_name ?? "")}</Name>
     </Country>
    </PostalAddress>
    ${
      o.ic_dph || o.dic
        ? `<PartyTaxScheme>${tag("CompanyID", o.ic_dph || o.dic)}<TaxScheme>VAT</TaxScheme></PartyTaxScheme>`
        : ""
    }
    ${
      o.email || o.phone
        ? `<Contact>${tag("Name", o.contact_person)}${tag("Telephone", o.phone)}${tag("ElectronicMail", o.email)}</Contact>`
        : ""
    }
   </Party>
  </${meno}>`;
}

/** Súčty po sadzbách. Rekapitulácia v ISDOC-u je povinná a musí sedieť na riadky. */
function podlaSadzieb(items: Riadok[], dobropis: boolean) {
  const mapa = new Map<number, { zaklad: number; dan: number }>();
  for (const it of items) {
    const sadzba = Number(it.vat_rate ?? 0);
    const znamienko = dobropis ? -1 : 1;
    const zaklad =
      znamienko *
      (Number(it.subtotal ?? Number(it.quantity ?? 0) * Number(it.unit_price ?? 0)) || 0);
    const dan = znamienko * (Number(it.vat_amount ?? (zaklad * sadzba) / 100) || 0);
    const r = mapa.get(sadzba) ?? { zaklad: 0, dan: 0 };
    r.zaklad += zaklad;
    r.dan += Math.abs(dan) * (zaklad < 0 ? -1 : 1);
    mapa.set(sadzba, r);
  }
  return [...mapa.entries()].sort((a, b) => b[0] - a[0]).map(([sadzba, v]) => ({ sadzba, ...v }));
}

/**
 * Jedna faktúra ako ISDOC dokument.
 *
 * `company` je vystaviteľ, `customer` odberateľ (keď nie je, berú sa údaje
 * odpísané na faktúre — tie sú záväzné a prežijú aj zmazanie karty).
 */
export function buildIsdoc(opts: {
  invoice: Riadok;
  items: Riadok[];
  company: Riadok;
  customer?: Riadok | null;
}): string {
  const { invoice, items, company } = opts;
  /*
    Doklad bez IČO dodávateľa je v Česku neplatný sám o sebe — podateľňa ho
    odmietne. Lepšie to povedať tu než vydať súbor, ktorý nikde neprejde.
  */
  if (!String(company?.ico ?? "").trim()) {
    throw new Error("Firma nemá vyplnené IČO. Doplňte ho v nastaveniach firmy — bez neho ISDOC neprejde.");
  }
  const dobropis = String(invoice.type ?? "") === "credit_note";
  const mena = String(invoice.currency ?? company.default_currency ?? "CZK").toUpperCase();
  const domaca = krajinaDane(company.country) === "CZ" ? "CZK" : "EUR";
  const cudzia = mena !== domaca;

  const odberatel = opts.customer ?? {
    name: invoice.customer_name,
    ico: invoice.customer_ico,
    dic: invoice.customer_dic,
    ic_dph: invoice.customer_ic_dph,
    street: invoice.customer_street,
    city: invoice.customer_city,
    zip: invoice.customer_zip,
    country: invoice.customer_country,
    email: invoice.customer_email,
  };

  const znamienko = dobropis ? -1 : 1;
  const riadky = items
    .map((it, i) => {
      const mnozstvo = znamienko * Number(it.quantity ?? 0);
      const jc = Number(it.unit_price ?? 0);
      const sadzba = Number(it.vat_rate ?? 0);
      const zaklad = Number(it.subtotal ?? Number(it.quantity ?? 0) * jc) * znamienko;
      const dan = Number(it.vat_amount ?? (zaklad * sadzba) / 100);
      const sDanou = zaklad + (dobropis ? -Math.abs(dan) : Math.abs(dan));
      return `
   <InvoiceLine>
    <ID>${i + 1}</ID>
    <InvoicedQuantity unitCode="${esc(String(it.unit ?? "ks").slice(0, 20))}">${c2(mnozstvo)}</InvoicedQuantity>
    <LineExtensionAmount>${c2(zaklad)}</LineExtensionAmount>
    <LineExtensionAmountTaxInclusive>${c2(sDanou)}</LineExtensionAmountTaxInclusive>
    <LineExtensionTaxAmount>${c2(sDanou - zaklad)}</LineExtensionTaxAmount>
    <UnitPrice>${c4(jc)}</UnitPrice>
    <UnitPriceTaxInclusive>${c4(jc * (1 + sadzba / 100))}</UnitPriceTaxInclusive>
    <ClassifiedTaxCategory>
     <Percent>${c2(sadzba)}</Percent>
     <VATCalculationMethod>0</VATCalculationMethod>
    </ClassifiedTaxCategory>
    ${tag("Note", it.description)}
    <Item>${tag("Description", it.name || "Položka")}</Item>
   </InvoiceLine>`;
    })
    .join("");

  const sumare = podlaSadzieb(items, dobropis);
  const danSpolu = sumare.reduce((s, r) => s + r.dan, 0);
  const zakladSpolu = sumare.reduce((s, r) => s + r.zaklad, 0);
  const sDanouSpolu = zakladSpolu + danSpolu;

  const taxSubTotals = sumare
    .map(
      (r) => `
   <TaxSubTotal>
    <TaxableAmount>${c2(r.zaklad)}</TaxableAmount>
    <TaxAmount>${c2(r.dan)}</TaxAmount>
    <TaxInclusiveAmount>${c2(r.zaklad + r.dan)}</TaxInclusiveAmount>
    <AlreadyClaimedTaxableAmount>0.00</AlreadyClaimedTaxableAmount>
    <AlreadyClaimedTaxAmount>0.00</AlreadyClaimedTaxAmount>
    <AlreadyClaimedTaxInclusiveAmount>0.00</AlreadyClaimedTaxInclusiveAmount>
    <DifferenceTaxableAmount>${c2(r.zaklad)}</DifferenceTaxableAmount>
    <DifferenceTaxAmount>${c2(r.dan)}</DifferenceTaxAmount>
    <DifferenceTaxInclusiveAmount>${c2(r.zaklad + r.dan)}</DifferenceTaxInclusiveAmount>
    <TaxCategory>
     <Percent>${c2(r.sadzba)}</Percent>
    </TaxCategory>
   </TaxSubTotal>`,
    )
    .join("");

  const ucet = ucetZIbanu(company.iban);
  /*
    Platobné údaje sú v schéme voliteľné, ale keď už tam sú, musia byť úplné.
    Bez rozpoznaného IBAN-u sa preto celá sekcia vynechá — neúplná by doklad
    zneplatnila a vymyslené číslo účtu je horšie než žiadne.
  */
  const platba = ucet
    ? `
  <PaymentMeans>
   <Payment>
    <PaidAmount>${c2(sDanouSpolu)}</PaidAmount>
    <PaymentMeansCode>42</PaymentMeansCode>
    <Details>
     <PaymentDueDate>${esc(invoice.due_date ?? invoice.issue_date ?? "")}</PaymentDueDate>
     <ID>${esc(ucet.cislo)}</ID>
     <BankCode>${esc(ucet.kodBanky)}</BankCode>
     <Name>${esc(company.bank_name ?? "")}</Name>
     <IBAN>${esc(String(company.iban).replace(/\s+/g, "").toUpperCase())}</IBAN>
     <BIC>${esc(company.swift ?? "")}</BIC>
     ${tag("VariableSymbol", invoice.variable_symbol || String(invoice.invoice_number ?? "").replace(/\D/g, ""))}
     ${tag("ConstantSymbol", invoice.constant_symbol)}
     ${tag("SpecificSymbol", invoice.specific_symbol)}
    </Details>
   </Payment>
  </PaymentMeans>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.2">
  <DocumentType>${typDokladu(invoice.type)}</DocumentType>
  ${tag("ID", invoice.invoice_number)}
  <UUID>${uuidDokladu(invoice)}</UUID>
  ${tag("IssueDate", invoice.issue_date)}
  ${tag("TaxPointDate", invoice.delivery_date || invoice.issue_date)}
  <VATApplicable>${danSpolu !== 0 ? "true" : "false"}</VATApplicable>
  <!--
    Odkaz na dokument, ktorým odberateľ súhlasil s elektronickou faktúrou.
    Schéma prvok vyžaduje, Faktero taký súhlas nikde neeviduje — vyplniť ho
    vymysleným odkazom by bolo horšie než nechať ho prázdny.
  -->
  <ElectronicPossibilityAgreementReference>${esc(invoice.electronic_agreement_ref ?? "")}</ElectronicPossibilityAgreementReference>
  ${tag("Note", invoice.note)}
  <LocalCurrencyCode>${esc(domaca)}</LocalCurrencyCode>
  ${cudzia ? `<ForeignCurrencyCode>${esc(mena)}</ForeignCurrencyCode>` : ""}
  <CurrRate>1</CurrRate>
  <RefCurrRate>1</RefCurrRate>${strana(company, "AccountingSupplierParty")}${strana(odberatel, "AccountingCustomerParty")}
  <InvoiceLines>${riadky}
  </InvoiceLines>
  <TaxTotal>${taxSubTotals}
   <TaxAmount>${c2(danSpolu)}</TaxAmount>
  </TaxTotal>
  <LegalMonetaryTotal>
   <TaxExclusiveAmount>${c2(zakladSpolu)}</TaxExclusiveAmount>
   <TaxInclusiveAmount>${c2(sDanouSpolu)}</TaxInclusiveAmount>
   <AlreadyClaimedTaxExclusiveAmount>0.00</AlreadyClaimedTaxExclusiveAmount>
   <AlreadyClaimedTaxInclusiveAmount>0.00</AlreadyClaimedTaxInclusiveAmount>
   <DifferenceTaxExclusiveAmount>${c2(zakladSpolu)}</DifferenceTaxExclusiveAmount>
   <DifferenceTaxInclusiveAmount>${c2(sDanouSpolu)}</DifferenceTaxInclusiveAmount>
   <PayableRoundingAmount>0.00</PayableRoundingAmount>
   <PaidDepositsAmount>0.00</PaidDepositsAmount>
   <PayableAmount>${c2(sDanouSpolu)}</PayableAmount>
  </LegalMonetaryTotal>${platba}
</Invoice>`;
}
