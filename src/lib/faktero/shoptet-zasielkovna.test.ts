import { describe, expect, it } from "vitest";
import { fakturaZObjednavky, uhradaZoShoptetu, type ObjednavkaShoptet } from "./shoptet";
import { odpoved, rozdelMeno, vysledokPola, xmlVytvorZasielku } from "./zasielkovna";
import { sumyRiadkov } from "./api-sumy-riadkov";

// Objednávka v tvare podľa OpenAPI Shoptetu (github.com/shoptet/developers).
const objednavka: ObjednavkaShoptet = {
  code: "2026000123",
  creationTime: "2026-10-08T10:00:00+0200",
  email: "jan.novak@example.sk",
  paid: false,
  paymentMethod: { name: "Dobierka" },
  shipping: { name: "Zásielkovňa - výdajné miesto" },
  shippingDetails: { branchId: "1234", name: "Bratislava, Obchodná 1" },
  price: { currencyCode: "EUR", withVat: "53.97" },
  billingAddress: {
    company: "Novák s.r.o.",
    fullName: "Ján Novák",
    street: "Hlavná",
    houseNumber: "12",
    city: "Trnava",
    zip: "917 01",
    countryCode: "SK",
    companyId: "12345678",
    vatId: "SK2020123456",
    taxId: "2020123456",
  },
  items: [
    {
      name: "Hrnček",
      variantName: "modrý",
      itemType: "product",
      amount: "3.000",
      amountUnit: "ks",
      code: "HR-1",
      itemPrice: { withoutVat: "29.27", vat: "6.73", vatRate: "23.00" },
    },
    {
      name: "Zľavový kupón",
      itemType: "discount-coupon",
      amount: "1",
      itemPrice: { withoutVat: "-4.07", vat: "-0.94", vatRate: "23.00" },
    },
    {
      name: "Zásielkovňa",
      itemType: "shipping",
      amount: "1",
      itemPrice: { withoutVat: "2.43", vat: "0.56", vatRate: "23.00" },
    },
    {
      name: "Dobierka",
      itemType: "billing",
      amount: "1",
      itemPrice: { withoutVat: "0.00", vat: "0.00", vatRate: "23.00" },
    },
  ],
};

describe("Shoptet → faktúra", () => {
  it("odberateľ, platba, položky so sumami presne z obchodu", () => {
    const f = fakturaZObjednavky(objednavka, "2026-10-09");
    expect(f.external_id).toBe("shoptet:2026000123");
    expect(f.customer).toMatchObject({
      name: "Novák s.r.o.",
      ico: "12345678",
      ic_dph: "SK2020123456",
      dic: "2020123456",
      street: "Hlavná 12",
      country: "SK",
    });
    expect(f.payment_method).toBe("cash");
    expect(f.due_date).toBe("2026-10-09");
    expect(f.notes).toMatch(/dobierku/);
    expect(f.items.map((i) => i.name)).toEqual(["Hrnček – modrý", "Zľavový kupón", "Zásielkovňa"]);
    const s = sumyRiadkov(f.items as any);
    expect("sumy" in s && s.sumy?.total).toBe(33.98);
  });

  it("spôsob úhrady z názvu", () => {
    expect(uhradaZoShoptetu("Platba kartou online (GoPay)").kod).toBe("card");
    expect(uhradaZoShoptetu("Bankový prevod").kod).toBe("bank_transfer");
    expect(uhradaZoShoptetu("Hotovosť pri osobnom odbere").kod).toBe("cash");
    expect(uhradaZoShoptetu("Dobírka").dobierka).toBe(true);
  });

  it("zaplatená objednávka bez firmy", () => {
    const f = fakturaZObjednavky({
      ...objednavka,
      paid: true,
      paymentMethod: { name: "Prevodom" },
      billingAddress: { fullName: "Eva Malá", countryCode: "cz" },
    });
    expect(f.customer?.name).toBe("Eva Malá");
    expect(f.customer?.country).toBe("CZ");
    expect(f.due_date).toBeDefined();
  });
});

describe("Zásielkovňa", () => {
  it("XML zásielky podľa WSDL, dobierka len keď je", () => {
    const x = xmlVytvorZasielku("a".repeat(32), {
      cislo: "2026114",
      meno: "Ján",
      priezvisko: "Novák & syn",
      miestoId: 1234,
      dobierka: 33.98,
      mena: "EUR",
      hodnota: 33.98,
      hmotnost: 1.2,
      odosielatel: "obchod.sk",
      email: "a@b.sk",
    });
    expect(x).toContain(
      "<packetAttributes><number>2026114</number><name>Ján</name><surname>Novák &amp; syn</surname>",
    );
    expect(x).toContain(
      "<addressId>1234</addressId><cod>33.98</cod><currency>EUR</currency><value>33.98</value><weight>1.200</weight><eshop>obchod.sk</eshop>",
    );
    expect(
      xmlVytvorZasielku("x", {
        cislo: "1",
        meno: "A",
        priezvisko: "B",
        miestoId: 1,
        mena: "EUR",
        hodnota: 1,
        hmotnost: 1,
        odosielatel: "o",
      }),
    ).not.toContain("<cod>");
  });

  it("odpovede — skutočná chyba hesla, chybné polia, úspech", () => {
    // Doslova to, čo vrátil www.zasilkovna.cz/api/rest 2026-10-09.
    const zle = odpoved(
      '<?xml version="1.0" encoding="utf-8"?>\n<response><status>fault</status><fault>IncorrectApiPasswordFault</fault><string>Incorrect API password.</string><detail/></response>',
    );
    expect(zle).toEqual({
      ok: false,
      kod: "IncorrectApiPasswordFault",
      chyba: "Nesprávne API heslo Zásielkovne.",
    });
    const polia = odpoved(
      "<response><status>fault</status><fault>PacketAttributesFault</fault><string>Invalid packet attributes</string><detail><attributes><fault><name>addressId</name><fault>Unknown addressId</fault></fault></attributes></detail></response>",
    );
    expect(!polia.ok && polia.chyba).toBe(
      "Zásielkovňa odmietla údaje zásielky: addressId: Unknown addressId",
    );
    const ok = odpoved(
      "<response><status>ok</status><result><id>1234567890</id><barcode>Z1234567890</barcode><barcodeText>Z 123 4567 890</barcodeText></result></response>",
    );
    expect(ok.ok && vysledokPola(ok.vysledok, "barcodeText")).toBe("Z 123 4567 890");
  });

  it("meno a priezvisko", () => {
    expect(rozdelMeno("Ján Peter Novák")).toEqual({ meno: "Ján Peter", priezvisko: "Novák" });
    expect(rozdelMeno("Firma")).toEqual({ meno: "Firma", priezvisko: "Firma" });
  });
});
