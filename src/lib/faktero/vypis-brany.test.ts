/**
 * Exporty brán podľa ich dokumentácie (názvy stĺpcov, znamienka, formáty
 * dátumov). Skutočné súbory sa líšia jazykom účtu a výberom stĺpcov, preto sú
 * tu aj preložené varianty.
 */
import { describe, expect, it } from "vitest";
import {
  citacDatumu,
  citajVypisBrany,
  dekodujCsv,
  jeVypisBrany,
  vsZReferencie,
} from "./vypis-brany";

const sucet = (v: ReturnType<typeof citajVypisBrany>) =>
  Math.round(v.pohyby.reduce((s, p) => s + (p.smer === "prijem" ? p.suma : -p.suma), 0) * 100) /
  100;

describe("Stripe", () => {
  // Reports → Balance → Itemized balance change from activity (predvolené stĺpce).
  const itemized = [
    "balance_transaction_id,created_utc,available_on_utc,currency,gross,fee,net,reporting_category,description",
    "txn_1,2026-10-01 09:12:00,2026-10-03 00:00:00,eur,45.91,0.94,44.97,charge,Obchod - Order 1234",
    "txn_2,2026-10-01 11:00:00,2026-10-03 00:00:00,eur,19.00,0.52,18.48,charge,Obchod - Order 1235",
    "txn_3,2026-10-02 08:00:00,2026-10-02 08:00:00,eur,-19.00,0.00,-19.00,refund,REFUND FOR CHARGE (Obchod - Order 1235)",
    "txn_4,2026-10-03 06:00:00,2026-10-05 00:00:00,eur,-44.45,0.00,-44.45,payout,STRIPE PAYOUT",
    "txn_5,2026-10-04 06:00:00,2026-10-04 06:00:00,usd,10.00,0.59,9.41,charge,Order 99",
  ].join("\n");

  it("platba, poplatok zvlášť, vrátenie a výber na účet", () => {
    const v = citajVypisBrany(itemized);
    expect(v.brana).toBe("stripe");
    expect(v.mena).toBe("EUR");
    expect(v.pocty).toEqual({ platby: 2, poplatky: 2, vybery: 1, vratenia: 1 });
    const prva = v.pohyby.filter((p) => p.id.startsWith("txn_1"));
    expect(prva.map((p) => [p.smer, p.suma, p.oznacenie, p.vs])).toEqual([
      ["prijem", 45.91, "faktura", "1234"],
      ["vydaj", 0.94, "poplatok", null],
    ]);
    const vyber = v.pohyby.find((p) => p.id === "txn_4:vyber")!;
    expect(vyber).toMatchObject({ smer: "vydaj", suma: 44.45, oznacenie: "prevod" });
    // Súčet pohybov = zmena zostatku na Stripe (bez USD riadku).
    expect(sucet(v)).toBeCloseTo(0, 2);
  });

  it("riadky v inej mene vynechá a povie to", () => {
    const v = citajVypisBrany(itemized);
    expect(v.pohyby.some((p) => p.id.startsWith("txn_5"))).toBe(false);
    expect(v.varovanie).toMatch(/inej mene než EUR/);
  });

  it("export z prehľadu zostatku (Created (UTC), Type, Status)", () => {
    const v = citajVypisBrany(
      [
        '"id","Type","Source","Amount","Fee","Net","Currency","Created (UTC)","Available On (UTC)","Status","Description"',
        '"txn_9","charge","ch_9","120.00","1.93","118.07","eur","2026-10-05 10:00","2026-10-07 00:00","pending","Faktúra 2026001"',
        '"txn_8","stripe_fee","","-5.00","0.00","-5.00","eur","2026-10-05 11:00","2026-10-05 11:00","available","Radar"',
      ].join("\n"),
    );
    // „pending" je pri Stripe platba, ktorá prebehla — patrí do výpisu.
    expect(v.pocty.platby).toBe(1);
    expect(v.pohyby.find((p) => p.id === "txn_9:platba")).toMatchObject({
      suma: 120,
      vs: "2026001",
    });
    expect(v.pohyby.find((p) => p.id === "txn_8:poplatok")).toMatchObject({
      smer: "vydaj",
      suma: 5,
    });
  });
});

describe("PayPal", () => {
  it("anglický export s americkým dátumom; poplatok záporný, výber, zablokovanie vynechá", () => {
    const v = citajVypisBrany(
      [
        '"Date","Time","TimeZone","Name","Type","Status","Currency","Gross","Fee","Net","From Email Address","To Email Address","Transaction ID","Reference Txn ID","Invoice Number","Balance"',
        '"10/01/2026","10:00:00","CEST","Jana Mala","Express Checkout Payment","Completed","EUR","1,250.00","-43.40","1,206.60","jana@example.com","shop@example.com","1AB","","WC-777","1,206.60"',
        '"10/13/2026","09:00:00","CEST","","Account Hold for Open Authorization","Completed","EUR","-10.00","0.00","-10.00","","","2CD","","",""',
        '"10/14/2026","09:00:00","CEST","","General Withdrawal","Completed","EUR","-1,000.00","0.00","-1,000.00","","","3EF","","","206.60"',
        '"10/15/2026","09:00:00","CEST","Peter","Express Checkout Payment","Pending","EUR","5.00","-0.40","4.60","","","4GH","","",""',
      ].join("\n"),
    );
    expect(v.brana).toBe("paypal");
    expect(v.pocty).toEqual({ platby: 1, poplatky: 1, vybery: 1, vratenia: 0 });
    const [platba, poplatok, vyber] = v.pohyby;
    expect(platba).toMatchObject({
      datum: "2026-10-01",
      suma: 1250,
      vs: "777",
      protistrana: "Jana Mala",
    });
    expect(poplatok).toMatchObject({
      smer: "vydaj",
      suma: 43.4,
      oznacenie: "poplatok",
      zostatok: 1206.6,
    });
    expect(vyber).toMatchObject({ datum: "2026-10-14", suma: 1000, zostatok: 206.6 });
  });

  it("slovenský export s desatinnou čiarkou", () => {
    const v = citajVypisBrany(
      [
        '"Dátum","Čas","Časové pásmo","Meno","Typ","Stav","Mena","Brutto","Poplatok","Netto","ID transakcie","Číslo faktúry","Zostatok"',
        '"03.10.2026","10:00:00","CEST","Firma s.r.o.","Platba na webovej lokalite","Dokončené","EUR","100,00","-3,74","96,26","5XY","2026015","96,26"',
      ].join("\n"),
    );
    expect(v.pohyby.map((p) => [p.datum, p.smer, p.suma])).toEqual([
      ["2026-10-03", "prijem", 100],
      ["2026-10-03", "vydaj", 3.74],
    ]);
    expect(v.pohyby[0]!.vs).toBe("2026015");
  });
});

describe("GoPay (CSV B, Windows-1250, bodkočiarka)", () => {
  const text = [
    "ID pohybu;Datum;Typ;Protistrana;Subjekt/E-mail;Bank.účet - prefix;Bank.účet - číslo;Bank.účet - kód banky;ID objednávky/VS;Částka;Počáteční stav;Koncový stav;Měna;ID referenčního pohybu",
    "3001;01.10.2026 10:00;Platba;Jan Novák;jan@example.com;;;;2026101;500,00;0,00;500,00;CZK;",
    "3002;01.10.2026 10:00;Poplatek za platbu;GoPay;;;;;2026101;-11,50;500,00;488,50;CZK;3001",
    "3003;05.10.2026 06:00;Výplata na účet;;;;123456789;0800;;-488,50;488,50;0,00;CZK;",
  ].join("\r\n");

  it("rozpozná sa aj z bajtov vo Windows-1250", () => {
    const enc = new Uint8Array(
      [...text].map((c) => {
        const mapa: Record<string, number> = {
          č: 0xe8,
          Č: 0xc8,
          ú: 0xfa,
          á: 0xe1,
          ě: 0xec,
          í: 0xed,
          é: 0xe9,
          ý: 0xfd,
          ř: 0xf8,
        };
        return mapa[c] ?? c.charCodeAt(0);
      }),
    );
    const dekodovany = dekodujCsv(enc);
    expect(jeVypisBrany(dekodovany)).toBe(true);
    const v = citajVypisBrany(dekodovany);
    expect(v.brana).toBe("gopay");
    expect(v.mena).toBe("CZK");
    expect(v.pohyby.map((p) => [p.oznacenie, p.smer, p.suma, p.zostatok])).toEqual([
      ["faktura", "prijem", 500, 500],
      ["poplatok", "vydaj", 11.5, 488.5],
      ["prevod", "vydaj", 488.5, 0],
    ]);
    expect(v.pohyby[0]!.vs).toBe("2026101");
  });
});

describe("Comgate", () => {
  it("výplata z dátumu a sumy prevodu, poplatok kladný", () => {
    const v = citajVypisBrany(
      [
        "Merchant;Datum založení;Datum zaplacení;Datum převodu;ID ComGate;Metoda;Popis;E-mail plátce;Variabilní symbol platby;Variabilní symbol převodu;ID od klienta;Měna;Potvrzená částka;Převedená částka;Poplatek celkem",
        "123;01.10.2026;01.10.2026;03.10.2026;AB12-CD34-EF56;CARD;Objednávka 501;a@example.com;;9988;501;CZK;1000,00;985,00;15,00",
        "123;02.10.2026;02.10.2026;03.10.2026;GH78-IJ90-KL12;CARD;Objednávka 502;b@example.com;;9988;502;CZK;200,00;196,00;4,00",
      ].join("\n"),
    );
    expect(v.brana).toBe("comgate");
    expect(v.pocty).toEqual({ platby: 2, poplatky: 2, vybery: 1, vratenia: 0 });
    const vyplata = v.pohyby.find((p) => p.oznacenie === "prevod")!;
    expect(vyplata).toMatchObject({ datum: "2026-10-03", suma: 1181, smer: "vydaj", vs: "9988" });
    expect(v.pohyby.find((p) => p.id === "AB12-CD34-EF56:platba")!.vs).toBe("501");
    expect(sucet(v)).toBeCloseTo(0, 2);
  });
});

describe("Barion", () => {
  it("anglický výpis so zostatkom po transakcii", () => {
    const v = citajVypisBrany(
      [
        "Transaction time,Transaction type,Customer/beneficiary,Transaction amount,Balance after transaction,Currency,Payment ID generated by shop,Transaction ID generated by shop,Unique payment ID generated by Barion",
        "2026-10-02 12:00,Card payment,eva@example.com,25.00,25.00,EUR,ORD-3001,T1,aaaa-1",
        "2026-10-02 12:00,Fee,Barion,-0.45,24.55,EUR,ORD-3001,T1,aaaa-2",
      ].join("\n"),
    );
    expect(v.brana).toBe("barion");
    expect(v.pohyby.map((p) => [p.oznacenie, p.suma, p.zostatok, p.vs])).toEqual([
      ["faktura", 25, 25, "3001"],
      ["poplatok", 0.45, 24.55, null],
    ]);
  });
});

describe("pomocné", () => {
  it("cudzí CSV odmietne", () => {
    expect(jeVypisBrany("a;b;c\n1;2;3")).toBe(false);
    expect(() => citajVypisBrany("a;b;c\n1;2;3")).toThrow(/platobnej brány/);
  });
  it("variabilný symbol z referencií e-shopu", () => {
    expect(vsZReferencie("WC-1234")).toBe("1234");
    expect(vsZReferencie("", "Obchod - Order #88")).toBe("88");
    expect(vsZReferencie("Objednávka č. 2026001")).toBe("2026001");
    expect(vsZReferencie("bez čísla")).toBeNull();
    // „ord" vnútri slova nie je objednávka.
    expect(vsZReferencie("Accord 2026 servis")).toBeNull();
  });
  it("dátum s lomkami: rozhodne celý súbor", () => {
    expect(citacDatumu(["10/13/2026"])("10/01/2026")).toBe("2026-10-01");
    expect(citacDatumu(["13/10/2026"])("01/10/2026")).toBe("2026-10-01");
    expect(citacDatumu([])("2026-10-04T08:00:00Z")).toBe("2026-10-04");
  });
});
