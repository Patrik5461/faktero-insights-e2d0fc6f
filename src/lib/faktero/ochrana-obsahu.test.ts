import { describe, expect, it } from "vitest";
import {
  kostra,
  najdiOdkazy,
  najdiZnacky,
  normalizuj,
  registrovanaDomena,
  skontrolujObsah,
  zmiesanePismo,
  type VstupObsahu,
} from "./ochrana-obsahu";

const nova = (v: Partial<VstupObsahu>): VstupObsahu => ({
  predmet: "",
  sprava: "",
  nazovFirmy: ["Moja firma s.r.o."],
  vekDni: 0,
  overena: false,
  webFirmy: null,
  ...v,
});
const stara = (v: Partial<VstupObsahu>): VstupObsahu => nova({ vekDni: 400, ...v });
const kody = (v: VstupObsahu) => skontrolujObsah(v).blokuj.map((n) => n.kod);
const vystrahy = (v: VstupObsahu) => skontrolujObsah(v).vystrahy.map((n) => n.kod);

describe("normalizácia", () => {
  it("azbuka a gréčtina sa čítajú ako latinka", () => {
    expect(normalizuj("ЕТSУ SНОР")).toBe("etsy shop");
    expect(normalizuj("mаrкеtрlасе nоtifу")).toBe("marketplace notify");
    expect(normalizuj("ΡΑΥΡΑL")).toBe("paypal");
  });
  it("odstráni diakritiku a neviditeľné znaky", () => {
    expect(normalizuj("Zásielkovňa")).toBe("zasielkovna");
    expect(normalizuj("Vin​ted")).toBe("vinted");
    expect(normalizuj("Ｖｉｎｔｅｄ")).toBe("vinted");
  });
  it("kostra zlúči l/I/1 a číslice", () => {
    expect(kostra("VlNTED")).toBe(kostra("Vinted"));
    expect(kostra("P4yPa1")).toBe(kostra("paypal"));
    expect(kostra("Arnazon")).toBe(kostra("amazon"));
  });
});

describe("značky", () => {
  it("nájde značku aj zamaskovanú", () => {
    expect(najdiZnacky("VlNTED Invoice No: #A21578")[0]).toMatchObject({
      znacka: { nazov: "Vinted" },
      maskovana: true,
    });
    expect(najdiZnacky("V i n t e d")[0]?.znacka.nazov).toBe("Vinted");
    expect(najdiZnacky("V.i.n.t.e.d")[0]?.znacka.nazov).toBe("Vinted");
    expect(najdiZnacky("Pay Pal")[0]?.znacka.nazov).toBe("PayPal");
    expect(najdiZnacky("ЕТЅУ")[0]).toMatchObject({ znacka: { nazov: "Etsy" }, maskovana: true });
  });
  it("nenájde značku v bežných slovách", () => {
    expect(najdiZnacky("Faktúra za GIS služby")).toEqual([]);
    expect(najdiZnacky("otherwise wisely")).toEqual([]);
    expect(najdiZnacky("na tému revolúcia v sklade")).toEqual([]);
    expect(najdiZnacky("Faktúra 2026001 za služby v októbri")).toEqual([]);
  });
  it("pádové tvary", () => {
    expect(najdiZnacky("zásielka cez DPDčku").length).toBe(0);
    expect(najdiZnacky("predané cez OLXu")[0]?.znacka.nazov).toBe("OLX");
    expect(najdiZnacky("pošleme Slovenskou poštou")[0]?.znacka.nazov).toBe("Slovenská pošta");
  });
});

describe("zmiešané písmo", () => {
  it("chytí slová z útoku", () => {
    expect(zmiesanePismo("ЕТSУ SНОР")).toEqual(["ЕТSУ", "SНОР"]);
    expect(zmiesanePismo("mаrкеtрlасе nоtifу").length).toBe(2);
  });
  it("čistá azbuka, latinka a jednotky sú v poriadku", () => {
    expect(zmiesanePismo("Счёт-фактура № 15 от компании Ромашка")).toEqual([]);
    expect(zmiesanePismo("Faktúra č. 2026/15, Ďakujeme")).toEqual([]);
    expect(zmiesanePismo("filter 5 μm, 10 μg")).toEqual([]);
  });
});

describe("odkazy", () => {
  it("nájde odkazy aj holé domény", () => {
    const o = najdiOdkazy(
      "Kliknite https://vinted.discoververifypage.com/abc alebo etsy.id7548355.shop a shorturl.at/xYz12",
    ).map((x) => x.host);
    expect(o).toEqual(["vinted.discoververifypage.com", "etsy.id7548355.shop", "shorturl.at"]);
  });
  it("e-mail, s.r.o., sumy a súbory nie sú odkaz", () => {
    expect(
      najdiOdkazy(
        "Moja firma s.r.o., info@firma.sk, suma 1.297,00 €, príloha faktura.pdf, a.s., v.o.s.",
      ),
    ).toEqual([]);
  });
  it("registrovaná doména", () => {
    expect(registrovanaDomena("x.894273106.sbs")).toBe("894273106.sbs");
    expect(registrovanaDomena("a.vinted.co.uk")).toBe("vinted.co.uk");
    expect(registrovanaDomena("faktero.sk")).toBe("faktero.sk");
  });
});

describe("skutočný útok 17. 10. 2026 — vždy zablokovať", () => {
  const utoky: Array<[string, Partial<VstupObsahu>]> = [
    ["predmet VlNTED", { predmet: "VlNTED Invoice No: #A21578" }],
    [
      "Etsy s overením a odkazom",
      {
        predmet: "Sale confirmed — please verify your Etsy shop (Order #MG-57291)",
        sprava: "To receive payment, verify here: https://etsy.id7548355.shop/verify",
      },
    ],
    ["názov ЕТSУ SНОР", { nazovFirmy: ["ЕТSУ SНОР"], predmet: "Invoice 2026001" }],
    ["názov mаrкеtрlасе nоtifу", { nazovFirmy: ["mаrкеtрlасе nоtifу"] }],
    ["vinted doména", { sprava: "Confirm here: vinted.discoververifypage.com/item/5521" }],
    ["číselná doména", { sprava: "Open https://pay.894273106.sbs/x" }],
    ["skracovač", { sprava: "Detail objednávky: shorturl.at/abcde" }],
    ["bit.ly", { sprava: "Faktúra: https://bit.ly/3xYz" }],
  ];
  for (const [nazov, v] of utoky) {
    it(`${nazov} — nová firma`, () => expect(kody(nova(v)).length).toBeGreaterThan(0));
    it(`${nazov} — stará firma`, () => expect(kody(stara(v)).length).toBeGreaterThan(0));
    it(`${nazov} — aj overená firma`, () =>
      expect(kody(stara({ ...v, overena: true })).length).toBeGreaterThan(0));
  }
  it("„VlNTED“ v názve firmy zablokuje aj starú", () => {
    expect(kody(stara({ nazovFirmy: ["VlNTED"] }))).toContain("maskovana_znacka");
  });
});

describe("značka a odkaz podľa veku firmy", () => {
  it("nová firma so značkou v predmete — blok", () => {
    expect(kody(nova({ predmet: "Your Vinted order" }))).toContain("znacka");
  });
  it("stará firma so značkou — len výstraha", () => {
    const v = stara({ predmet: "Faktúra za prepravu cez DPD" });
    expect(kody(v)).toEqual([]);
    expect(vystrahy(v)).toContain("znacka");
  });
  it("overená firma, ktorá značku nesie v názve, nemá ani výstrahu", () => {
    const v = nova({
      overena: true,
      nazovFirmy: ["DPD Slovakia s.r.o."],
      predmet: "DPD — faktúra 2026001",
    });
    expect(kody(v)).toEqual([]);
    expect(vystrahy(v)).toEqual([]);
  });
  it("cudzí odkaz: nová firma blok, stará nie", () => {
    const v = { sprava: "Katalóg nájdete na https://www.partner-firma.sk/katalog" };
    expect(kody(nova(v))).toContain("cudzi_odkaz");
    expect(kody(stara(v))).toEqual([]);
  });
  it("odkaz na vlastný web a na Faktero je v poriadku aj novej firme", () => {
    const v = nova({
      webFirmy: "https://www.mojafirma.sk/",
      sprava: "Viac na www.mojafirma.sk/cennik a zaplatiť môžete na https://www.faktero.sk/pay/abc",
    });
    expect(kody(v)).toEqual([]);
  });
  it("oficiálna doména značky nie je podvrh", () => {
    expect(
      kody(stara({ sprava: "Sledovanie zásielky: https://www.dpd.com/sk/sledovanie" })),
    ).toEqual([]);
  });
  it("výzva + cudzí odkaz — blok aj starej firme", () => {
    expect(
      kody(stara({ sprava: "Prosím overte svoj účet tu: https://moj-ucet-overenie.com/login" })),
    ).toContain("phishing_fraza");
  });
  it("výzva bez odkazu nevadí", () => {
    expect(
      kody(stara({ sprava: "Prosím potvrďte svoj súhlas odpoveďou na tento e-mail." })),
    ).toEqual([]);
  });
});

describe("bežné faktúry nesmú prepadnúť (ani novej firme)", () => {
  const bezne: Array<Partial<VstupObsahu>> = [
    {
      predmet: "Faktúra 2026001",
      sprava:
        "Dobrý deň,\n\nv prílohe Vám posielame faktúru 2026001 v sume 1 297,00 € so splatnosťou 31. 10. 2026.\nIBAN: SK31 1200 0000 1987 4263 7541, VS 2026001.\n\nĎakujeme,\nMoja firma s.r.o.",
    },
    {
      predmet: "Faktura 2026015",
      sprava:
        "Dobrý den,\n\nv příloze Vám zasíláme fakturu 2026015 na částku 12 100 Kč, splatnou 30. 10. 2026.\n\nS pozdravem,\nNovák a syn, v.o.s.",
    },
    {
      predmet: "Rechnung RE-2026-0042",
      sprava:
        "Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie unsere Rechnung RE-2026-0042 über 1.297,00 € mit Fälligkeit am 31.10.2026.\n\nMit freundlichen Grüßen\nMüller GmbH",
    },
    {
      predmet: "Upomienka: Faktúra 2026001 je po splatnosti",
      sprava:
        "Dobrý deň, dovoľujeme si Vás upozorniť, že faktúra 2026001 v sume 120,00 € bola splatná dňa 2026-09-30. Prosíme o úhradu. V prípade otázok píšte na fakturacia@mojafirma.sk.",
    },
    {
      predmet: "Cenová ponuka CP-2026-007",
      sprava: "V prílohe Vám posielame cenovú ponuku CP-2026-007. Ponuka platí do 15. 11. 2026.",
    },
    {
      predmet: "Faktúra 2026003 — služby za september",
      sprava: "Ďakujeme za spoluprácu. Tel.: +421 902 101 967",
    },
    {
      predmet: "Faktura č. 2026/0012 (záloha)",
      sprava: "Platbu prosím uhraďte na účet uvedený na faktúre.",
    },
    {
      predmet: "Podklady za 09/2026 — Moja firma",
      sprava: "V balíku sú súbory XML na import do POHODA.",
    },
  ];
  bezne.forEach((v, i) => {
    it(`bežný mail #${i + 1}`, () => {
      expect(skontrolujObsah(nova(v)).blokuj).toEqual([]);
      expect(skontrolujObsah(stara(v)).blokuj).toEqual([]);
      expect(skontrolujObsah(stara(v)).vystrahy).toEqual([]);
    });
  });
  it("ruská firma píšuca azbukou", () => {
    expect(
      kody(
        stara({
          nazovFirmy: ["ООО Ромашка"],
          predmet: "Счёт № 15",
          sprava: "Оплатите, пожалуйста.",
        }),
      ),
    ).toEqual([]);
  });
  it("názov firmy s diakritikou a skratkami", () => {
    expect(kody(nova({ nazovFirmy: ["Ján Novák – STAVBY, s. r. o.", "Ján Novák"] }))).toEqual([]);
  });
});

describe("vlastný web si firma zapisuje sama", () => {
  it("phishingová doména zapísaná ako web firmy neprejde", () => {
    expect(
      kody(
        nova({
          webFirmy: "vinted.discoververifypage.com",
          sprava: "https://vinted.discoververifypage.com/item",
        }),
      ),
    ).toContain("odkaz_na_znacku");
    expect(
      kody(nova({ webFirmy: "https://pay.894273106.sbs", sprava: "https://pay.894273106.sbs/x" })),
    ).toContain("ciselna_domena");
  });
  it("výzva s odkazom na vlastný web je tiež podozrivá", () => {
    expect(
      kody(
        stara({ webFirmy: "mojafirma.sk", sprava: "Verify your account: https://mojafirma.sk/x" }),
      ),
    ).toContain("phishing_fraza");
  });
});
