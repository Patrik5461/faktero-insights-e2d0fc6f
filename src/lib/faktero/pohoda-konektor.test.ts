import { describe, it, expect } from "vitest";
import { XMLValidator } from "fast-xml-parser";
import { buildPohodaDavkaXml, buildPohodaInvoiceXml, zoskupPohyby } from "./export.server";
import {
  dekodujOdpoved,
  holeId,
  predvolenyZaciatok,
  rozoberOdpoved,
} from "./pohoda-konektor.server";

const firma = { ico: "12345678", default_currency: "EUR" };

const faktura = {
  id: "11111111-1111-1111-1111-111111111111",
  invoice_number: "20260001",
  type: "regular",
  issue_date: "2026-03-04",
  due_date: "2026-03-18",
  currency: "EUR",
  subtotal: 100,
  vat_total: 23,
  total: 123,
};
const polozka = {
  name: "Práca",
  quantity: 1,
  unit: "ks",
  unit_price: 100,
  vat_rate: 23,
  subtotal: 100,
  vat_amount: 23,
  total: 123,
};

describe("konektor — odkedy sa posiela", () => {
  it("berie sa minulý mesiac, nie celá história", () => {
    // Konektor je na priebežnú prácu; staršie doklady účtovníčka spravidla už
    // má a hromadné dosypanie patrí do mesačného balíka.
    expect(predvolenyZaciatok(new Date("2026-08-15T06:00:00Z"))).toBe("2026-07-01");
  });

  it("v januári sa vracia do decembra minulého roka", () => {
    expect(predvolenyZaciatok(new Date("2026-01-03T06:00:00Z"))).toBe("2025-12-01");
  });
});

describe("dávka do Pohody", () => {
  const davka = buildPohodaDavkaXml({
    company: firma,
    invoices: [{ invoice: faktura, items: [polozka] }],
    doklady: [
      {
        id: "22222222-2222-2222-2222-222222222222",
        issue_date: "2026-03-05",
        supplier_name: "Dodávateľ",
        total_amount: 60,
        net_amount: 50,
        vat_amount: 10,
        vat_rate: 20,
        currency: "EUR",
      },
    ],
    pohyby: [
      {
        id: "33333333-3333-3333-3333-333333333333",
        entry_number: "P1",
        entry_date: "2026-03-06",
        type: "prijem",
        amount: 40,
        description: "Vklad",
      },
    ],
  });

  it("je platné XML a nesie všetky tri agendy naraz", () => {
    expect(XMLValidator.validate(davka)).toBe(true);
    expect(davka).toContain("<inv:invoiceType>issuedInvoice</inv:invoiceType>");
    expect(davka).toContain("<inv:invoiceType>receivedInvoice</inv:invoiceType>");
    expect(davka).toContain("<vch:voucherType>receipt</vch:voucherType>");
    // Menné priestory oboch agend musia byť v obálke, inak import spadne.
    expect(davka).toContain('xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd"');
    expect(davka).toContain('xmlns:vch="http://www.stormware.cz/schema/version_2/voucher.xsd"');
  });

  it("doklad má stály identifikátor, aby ho Pohoda neprijala dvakrát", () => {
    // Pohoda kontroluje duplicitu podľa dvojice id balíka a id položky. Keby
    // sa niektoré z nich menilo, denný konektor by ten istý doklad zaviedol
    // znovu pri každom behu.
    expect(davka).toContain(`<dat:dataPackItem id="${faktura.id}"`);
    expect(davka).toContain('<dat:dataPackItem id="22222222-2222-2222-2222-222222222222"');
    expect(davka).toContain('<dat:dataPackItem id="33333333-3333-3333-3333-333333333333"');
    expect(davka).toContain('<dat:dataPack id="FAKTERO"');
  });

  it("to isté id má doklad aj v mesačnom balíku", () => {
    // Inak by sa doklad, ktorý už prešiel konektorom, naimportoval druhýkrát z
    // mailu — a naopak.
    const mesacny = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: faktura, items: [polozka] }],
    });
    expect(mesacny).toContain(`<dat:dataPackItem id="${faktura.id}"`);
    expect(mesacny).toContain('<dat:dataPack id="FAKTERO"');
  });
});

describe("odkaz na PDF pri doklade", () => {
  it("sa zapíše do záložky Dokumenty", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: faktura, items: [polozka] }],
      odkazy: { [faktura.id]: "https://www.faktero.sk/api/public/faktura/abc123" },
    });
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain("<inv:attachments>");
    expect(xml).toContain("<typ:url>https://www.faktero.sk/api/public/faktura/abc123</typ:url>");
    // Podľa schémy patrí až za súhrn dokladu.
    expect(xml.indexOf("</inv:invoiceSummary>")).toBeLessThan(xml.indexOf("<inv:attachments>"));
  });

  it("bez odkazu sa element vôbec nezapíše", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: faktura, items: [polozka] }],
    });
    expect(xml).not.toContain("attachments");
  });

  it("príliš dlhá adresa sa vynechá", () => {
    // Schéma dáva URL adrese 255 znakov; dlhšiu by Pohoda odmietla a spadol by
    // celý import, nielen jedna príloha.
    const xml = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: faktura, items: [polozka] }],
      odkazy: { [faktura.id]: `https://www.faktero.sk/${"x".repeat(260)}` },
    });
    expect(xml).not.toContain("attachments");
  });
});

describe("adresár a sklad", () => {
  const zakaznik = {
    id: "77777777-7777-7777-7777-777777777777",
    updated_at: "2026-03-10T08:30:00.000Z",
    name: "ACME s.r.o.",
    contact_person: "Ján Novák",
    street: "Hlavná 1",
    city: "Trnava",
    zip: "91701",
    country: "SK",
    ico: "00151653",
    dic: "2020304050",
    ic_dph: "SK2020304050",
    email: "f@acme.sk",
    phone: "+421900123456",
  };
  const zasoba = {
    id: "88888888-8888-8888-8888-888888888888",
    updated_at: "2026-03-11T09:00:00.000Z",
    nazov: "Skrutka M8",
    sku: "SKR-M8",
    barcode: "8591234567890",
    unit: "ks",
    vat_rate: 23,
    purchase_price: 0.12,
    sale_price: 0.29,
    min_stock: 100,
    description: "pozinkovaná",
  };

  const davka = buildPohodaDavkaXml({
    company: firma,
    invoices: [{ invoice: faktura, items: [polozka] }],
    doklady: [],
    pohyby: [],
    zakaznici: [zakaznik],
    zasoby: [zasoba],
    nastavenia: { sklad: "TOVAR" },
  });

  it("kontakt aj karta sú v dávke a XML je platné", () => {
    expect(XMLValidator.validate(davka)).toBe(true);
    expect(davka).toContain("<typ:company>ACME s.r.o.</typ:company>");
    expect(davka).toContain("<stk:name>Skrutka M8</stk:name>");
    expect(davka).toContain("<stk:storage><typ:ids>TOVAR</typ:ids></stk:storage>");
  });

  it("číselníky idú pred faktúrami", () => {
    // Aby odberateľ bol v adresári skôr, než sa naňho odvolá faktúra.
    expect(davka.indexOf("adb:addressbook")).toBeLessThan(davka.indexOf("inv:invoice"));
  });

  it("zmenená karta prejde, nezaloží sa druhá", () => {
    // Identifikátor nesie verziu, inak by ju kontrola duplicity v Pohode
    // odmietla ako už prijatú; a `add update="true"` s filtrom na náš
    // identifikátor povie Pohode, že má prepísať, nie pridať.
    expect(davka).toContain(`<dat:dataPackItem id="${zakaznik.id}-20260310083000"`);
    expect(davka).toContain('<adb:add add="true" update="true">');
    expect(davka).toContain("<typ:exSystemName>Faktero</typ:exSystemName>");
    expect(holeId(`${zakaznik.id}-20260310083000`)).toBe(zakaznik.id);
    expect(holeId(faktura.id)).toBe(faktura.id);
  });

  it("stav skladu sa neposiela", () => {
    // Schéma ho pripúšťa len pri exporte z Pohody — stav tam vzniká príjemkami
    // a výdajkami, takže dosadené číslo by sa rozišlo s pohybmi.
    expect(davka).not.toContain("stk:count");
  });

  it("bez členenia skladu sa karty neposielajú vôbec", () => {
    // Schéma hovorí, že `storage` je pri vytvorení povinné — bez neho by celá
    // dávka spadla na jednej karte.
    const bezSkladu = buildPohodaDavkaXml({
      company: firma,
      invoices: [{ invoice: faktura, items: [polozka] }],
      doklady: [],
      pohyby: [],
      zasoby: [zasoba],
      nastavenia: {},
    });
    expect(bezSkladu).not.toContain("stk:stock");
    expect(bezSkladu).toContain("inv:invoice");
  });
});

describe("zákazky", () => {
  const zakazka = {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    updated_at: "2026-03-01T07:00:00.000Z",
    job_number: "ZAK-2026-1",
    name: "Rekonštrukcia haly",
    customer_name: "ACME s.r.o.",
    start_date: "2026-02-01",
    end_date: "2026-06-30",
    note: "prvá etapa",
  };
  const fakturaSoZakazkou = { ...faktura, job_id: zakazka.id };

  const davka = buildPohodaDavkaXml({
    company: firma,
    invoices: [{ invoice: fakturaSoZakazkou, items: [polozka] }],
    doklady: [],
    pohyby: [],
    zakazkyNove: [zakazka],
    zakazky: { [zakazka.id]: "ZAK-2026-1" },
  });

  it("zákazka je v dávke a XML je platné", () => {
    expect(XMLValidator.validate(davka)).toBe(true);
    expect(davka).toContain("<con:text>Rekonštrukcia haly</con:text>");
    expect(davka).toContain("<con:dateStart>2026-02-01</con:dateStart>");
  });

  it("faktúra nesie zákazku", () => {
    // Toto je celý úžitok: v Pohode je potom vidieť výnos po zákazkách.
    expect(davka).toContain("<inv:contract><typ:ids>ZAK-2026-1</typ:ids></inv:contract>");
    expect(davka.indexOf("con:contract")).toBeLessThan(davka.indexOf("inv:invoice"));
  });

  it("identifikátor je bez verzie", () => {
    // Agenda `contract` nemá v schéme actionType — zákazku sa dá založiť, nie
    // prepísať. Stály identifikátor a checkDuplicity sú jediné, čo bráni tomu,
    // aby druhý beh vyrobil druhú zákazku.
    expect(davka).toContain(`<dat:dataPackItem id="${zakazka.id}" version="2.0">`);
    expect(davka).toContain('<typ:numberRequested checkDuplicity="true">ZAK-2026-1');
  });

  it("bez názvu sa zákazka neposiela", () => {
    // `text` je podľa schémy pri vytvorení povinný.
    const bezNazvu = buildPohodaDavkaXml({
      company: firma,
      invoices: [{ invoice: faktura, items: [polozka] }],
      doklady: [],
      pohyby: [],
      zakazkyNove: [{ ...zakazka, name: null }],
    });
    expect(bezNazvu).not.toContain("con:contract");
  });

  it("faktúra bez zákazky odkaz nemá", () => {
    const bez = buildPohodaDavkaXml({
      company: firma,
      invoices: [{ invoice: faktura, items: [polozka] }],
      doklady: [],
      pohyby: [],
    });
    expect(bez).not.toContain("inv:contract");
  });
});

describe("skladové pohyby", () => {
  const karta = "88888888-8888-8888-8888-888888888888";
  const pohyb = (o: Record<string, unknown>) => ({
    stock_item_id: karta,
    nazov: "Skrutka M8",
    sku: "SKR-M8",
    unit: "ks",
    vat_rate: 23,
    unit_price: 0.12,
    ...o,
  });

  it("pohyby z jedného dňa sa zlejú do jedného dokladu", () => {
    // Jeden pohyb = jeden doklad by z jedného importu urobil tristo príjemiek.
    const skupiny = zoskupPohyby([
      pohyb({ id: "aaa", type: "prijem", quantity: 10, created_at: "2026-03-01T08:00:00Z" }),
      pohyb({ id: "bbb", type: "prijem", quantity: 5, created_at: "2026-03-01T14:00:00Z" }),
      pohyb({ id: "ccc", type: "prijem", quantity: 3, created_at: "2026-03-02T09:00:00Z" }),
    ]);
    expect(skupiny).toHaveLength(2);
    expect(skupiny[0].pohyby).toHaveLength(2);
    expect(skupiny[0].id).toBe("aaa");
  });

  it("príjem a výdaj v ten istý deň sú dva doklady", () => {
    const skupiny = zoskupPohyby([
      pohyb({ id: "aaa", type: "prijem", quantity: 10, created_at: "2026-03-01T08:00:00Z" }),
      pohyb({ id: "bbb", type: "vydaj", quantity: 4, created_at: "2026-03-01T09:00:00Z" }),
    ]);
    expect(skupiny.map((s) => s.smer)).toEqual(["prijem", "vydaj"]);
  });

  it("čo prišlo na jednu dodávku, ostane spolu", () => {
    const skupiny = zoskupPohyby([
      pohyb({
        id: "aaa",
        type: "prijem",
        quantity: 1,
        created_at: "2026-03-01T08:00:00Z",
        source_document_id: "d1",
      }),
      pohyb({
        id: "bbb",
        type: "prijem",
        quantity: 1,
        created_at: "2026-03-01T08:00:00Z",
        source_document_id: "d2",
      }),
    ]);
    expect(skupiny).toHaveLength(2);
  });

  it("pri inventúre rozhoduje znamienko", () => {
    // Typ pohybu smer nepovie — prebytok ide na sklad, manko z neho.
    const skupiny = zoskupPohyby([
      pohyb({ id: "aaa", type: "inventura", quantity: 7, created_at: "2026-03-01T08:00:00Z" }),
      pohyb({ id: "bbb", type: "inventura", quantity: -2, created_at: "2026-03-01T08:00:00Z" }),
    ]);
    expect(skupiny.find((s) => s.smer === "prijem")?.pohyby).toHaveLength(1);
    expect(skupiny.find((s) => s.smer === "vydaj")?.pohyby).toHaveLength(1);
  });

  const davka = buildPohodaDavkaXml({
    company: firma,
    invoices: [{ invoice: faktura, items: [polozka] }],
    doklady: [],
    pohyby: [],
    skupinyPohybov: zoskupPohyby([
      pohyb({ id: "aaa", type: "prijem", quantity: 10, created_at: "2026-03-01T08:00:00Z" }),
      pohyb({ id: "bbb", type: "vydaj", quantity: -4, created_at: "2026-03-01T09:00:00Z" }),
    ]),
    nastavenia: { sklad: "TOVAR" },
  });

  it("príjemka aj výdajka sú platné XML", () => {
    expect(XMLValidator.validate(davka)).toBe(true);
    expect(davka).toContain('<pri:prijemka version="2.0">');
    expect(davka).toContain('<vyd:vydejka version="2.0">');
  });

  it("množstvo je vždy kladné, smer hovorí doklad", () => {
    // Záporné množstvo na výdajke by sklad pohlo opačne.
    expect(davka).toContain("<vyd:quantity>4</vyd:quantity>");
    expect(davka).not.toMatch(/<(pri|vyd):quantity>-/);
  });

  it("príjemka sa nezaúčtuje, výdajka taký príznak nemá", () => {
    // Náklad je už na prijatom doklade a v režime skladov A by ho príjemka
    // zaúčtovala druhýkrát. Výdajka v schéme `notPost` nemá — a nepotrebuje ho,
    // úbytok zásob proti výnosu na faktúre nič nezdvojí.
    expect(davka).toContain("<pri:notPost>true</pri:notPost>");
    expect(davka).not.toContain("vyd:notPost");
  });

  it("položka sa na kartu odvoláva naším identifikátorom", () => {
    // Kód zásoby sa dá v Pohode prepísať, identifikátor nie.
    expect(davka).toContain(`<typ:ids>${karta}</typ:ids>`);
    expect(davka).toContain("<typ:store><typ:ids>TOVAR</typ:ids></typ:store>");
  });

  it("pohyby idú až po skladových kartách", () => {
    const sKartami = buildPohodaDavkaXml({
      company: firma,
      invoices: [],
      doklady: [],
      pohyby: [],
      zasoby: [
        {
          id: karta,
          updated_at: "2026-03-01T07:00:00.000Z",
          nazov: "Skrutka M8",
          sku: "SKR-M8",
          unit: "ks",
          vat_rate: 23,
        },
      ],
      skupinyPohybov: zoskupPohyby([
        pohyb({ id: "aaa", type: "prijem", quantity: 10, created_at: "2026-03-01T08:00:00Z" }),
      ]),
      nastavenia: { sklad: "TOVAR" },
    });
    expect(sKartami.indexOf("stk:stock")).toBeLessThan(sKartami.indexOf("pri:prijemka"));
  });

  it("bez členenia skladu sa pohyby neposielajú", () => {
    const bezSkladu = buildPohodaDavkaXml({
      company: firma,
      invoices: [{ invoice: faktura, items: [polozka] }],
      doklady: [],
      pohyby: [],
      skupinyPohybov: zoskupPohyby([
        pohyb({ id: "aaa", type: "prijem", quantity: 10, created_at: "2026-03-01T08:00:00Z" }),
      ]),
      nastavenia: {},
    });
    expect(bezSkladu).not.toContain("pri:prijemka");
  });
});

describe("storno odovzdanej faktúry", () => {
  const davka = buildPohodaDavkaXml({
    company: firma,
    invoices: [],
    doklady: [],
    pohyby: [],
    storna: [{ id: "99999999-9999-9999-9999-999999999999", cislo: "260148" }],
  });

  it("vyrobí stornujúci doklad k pôvodnému číslu", () => {
    // Doklad, ktorý v Pohode je, sa nedá odobrať — účtovníctvo si ho musí
    // pamätať, takže sa k nemu vyrába stornujúci.
    expect(XMLValidator.validate(davka)).toBe(true);
    expect(davka).toContain("<inv:cancelDocument>");
    expect(davka).toContain("<typ:number>260148</typ:number>");
  });

  it("má vlastný identifikátor, aby nekolidoval s pôvodnou faktúrou", () => {
    expect(davka).toContain('<dat:dataPackItem id="99999999-9999-9999-9999-999999999999-storno"');
  });
});

describe("dobropis naviazaný na pôvodnú faktúru", () => {
  const dobropis = {
    ...faktura,
    id: "aaaaaaaa-1111-1111-1111-111111111111",
    invoice_number: "20260009",
    type: "credit_note",
  };

  it("ide ako opravný doklad k nej", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: dobropis, items: [polozka] }],
      opravovane: { [dobropis.id]: "260148" },
    });
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain('<inv:correctiveDocument itemTransfer="false">');
    expect(xml).toContain("<typ:number>260148</typ:number>");
    // Väzba patrí podľa schémy pred hlavičku dokladu.
    expect(xml.indexOf("correctiveDocument")).toBeLessThan(xml.indexOf("invoiceHeader"));
  });

  it("bez väzby ostáva samostatným dokladom", () => {
    // Kým sa pôvodná faktúra v Pohode nepotvrdí, jej číslo nepoznáme — vtedy je
    // lepší dobropis bez väzby než doklad, ktorý sa neimportuje.
    const xml = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: dobropis, items: [polozka] }],
    });
    expect(xml).not.toContain("correctiveDocument");
    expect(xml).toContain("<inv:invoiceType>issuedCreditNotice</inv:invoiceType>");
  });

  it("väzba sa nedáva na bežnú faktúru", () => {
    const xml = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: faktura, items: [polozka] }],
      opravovane: { [faktura.id]: "260148" },
    });
    expect(xml).not.toContain("correctiveDocument");
  });
});

describe("odpočet zálohy na konečnej faktúre", () => {
  // Faktúra na 123 € s daňou, z toho 60 € už prišlo zálohou (50 základ + 10 DPH
  // pri 20 %; zámerne iná sadzba než na faktúre, nech je vidieť, že sa berie zo
  // zálohovej faktúry).
  const xml = buildPohodaInvoiceXml({
    company: firma,
    invoices: [{ invoice: faktura, items: [polozka] }],
    zalohy: { [faktura.id]: { cislo: "260100", zaklad: 50, dph: 11.5, sadzba: 23 } },
  });

  it("je to vlastný druh položky, nie záporná bežná položka", () => {
    // Ako bežná položka by sa zaúčtovala ako ďalšie plnenie a Pohoda by ju
    // nespárovala so zálohovou faktúrou.
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain("<inv:invoiceAdvancePaymentItem>");
    expect(xml).toContain("<typ:number>260100</typ:number>");
    expect(xml).toContain("<typ:unitPrice>-50.00</typ:unitPrice>");
    expect(xml).toContain("<typ:priceVAT>-11.50</typ:priceVAT>");
  });

  it("súhrn dokladu je o zálohu nižší", () => {
    // Inak by Pohoda hlásila nesúlad medzi hlavičkou a položkami.
    expect(xml).toContain("<typ:priceHigh>50.00</typ:priceHigh>");
    expect(xml).toContain("<typ:priceHighVAT>11.50</typ:priceHighVAT>");
  });

  it("bez zálohy ostáva súhrn celý", () => {
    const bez = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: faktura, items: [polozka] }],
    });
    expect(bez).not.toContain("invoiceAdvancePaymentItem");
    expect(bez).toContain("<typ:priceHigh>100.00</typ:priceHigh>");
  });

  it("bez čísla zálohovej faktúry ide ručný odpočet", () => {
    const rucny = buildPohodaInvoiceXml({
      company: firma,
      invoices: [{ invoice: faktura, items: [polozka] }],
      zalohy: { [faktura.id]: { cislo: null, zaklad: 50, dph: 11.5, sadzba: 23 } },
    });
    expect(XMLValidator.validate(rucny)).toBe(true);
    expect(rucny).toContain("<inv:invoiceAdvancePaymentItem>");
    expect(rucny).not.toContain("inv:sourceDocument");
  });
});

describe("odpoveď z Pohody", () => {
  const odpoved = `<?xml version="1.0" encoding="Windows-1250"?>
<rsp:responsePack version="2.0" id="FAKTERO" state="ok"
  xmlns:rsp="http://www.stormware.cz/schema/version_2/response.xsd"
  xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd"
  xmlns:rdc="http://www.stormware.cz/schema/version_2/documentresponse.xsd">
  <rsp:responsePackItem version="2.0" id="11111111-1111-1111-1111-111111111111" state="ok">
    <inv:invoiceResponse version="2.0" state="ok">
      <rdc:producedDetails>
        <rdc:id>412</rdc:id>
        <rdc:number>250148</rdc:number>
      </rdc:producedDetails>
    </inv:invoiceResponse>
  </rsp:responsePackItem>
  <rsp:responsePackItem version="2.0" id="22222222-2222-2222-2222-222222222222" state="error">
    <inv:invoiceResponse version="2.0" state="error">
      <rdc:importDetails>
        <rdc:detail>
          <rdc:state>error</rdc:state>
          <rdc:note>Nenájdená predkontácia 3Fv.</rdc:note>
        </rdc:detail>
      </rdc:importDetails>
    </inv:invoiceResponse>
  </rsp:responsePackItem>
</rsp:responsePack>`;

  it("vytiahne číslo, ktoré doklad dostal v Pohode", () => {
    const r = rozoberOdpoved(odpoved);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      stav: "ok",
      cislo: "250148",
      poznamka: null,
    });
  });

  it("pri odmietnutom doklade nesie dôvod", () => {
    // Bez dôvodu by sa doklad len ticho stratil: u nás odovzdaný, v Pohode nie.
    const r = rozoberOdpoved(odpoved);
    expect(r[1].stav).toBe("error");
    expect(r[1].cislo).toBeNull();
    expect(r[1].poznamka).toContain("Nenájdená predkontácia");
  });

  it("nevadí jej iná predpona menného priestoru", () => {
    const ine = odpoved.replaceAll("rsp:", "odp:").replaceAll("xmlns:odp", "xmlns:odp");
    expect(rozoberOdpoved(ine)).toHaveLength(2);
  });

  it("z cudzieho súboru nevytiahne nič", () => {
    expect(rozoberOdpoved("<html><body>chyba servera</body></html>")).toHaveLength(0);
  });
});

describe("kódovanie odpovede", () => {
  it("Windows-1250 sa prečíta s diakritikou", () => {
    // Pohoda píše odpoveď vo Windows-1250; bez prekladu by z hlásení o chybách
    // bola kaša práve v mieste, kde na texte záleží.
    const hlavicka = `<?xml version="1.0" encoding="Windows-1250"?><rsp:responsePack>`;
    const telo = new Uint8Array([
      ...new TextEncoder().encode(hlavicka),
      0xf8, // ř
      0xe8, // č
      0x9e, // ž
      ...new TextEncoder().encode("</rsp:responsePack>"),
    ]);
    expect(dekodujOdpoved(telo.buffer)).toContain("řčž");
  });

  it("UTF-8 ostáva UTF-8", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?><rsp:responsePack>áäč</rsp:responsePack>`;
    expect(dekodujOdpoved(new TextEncoder().encode(xml).buffer as ArrayBuffer)).toContain("áäč");
  });
});
