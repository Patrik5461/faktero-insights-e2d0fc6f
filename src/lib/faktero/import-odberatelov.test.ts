import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { dekoduj, naplanuj, navrhniMapovanie, rozparsujXml, zTabulky } from "./import-odberatelov";

// Export adresára z Pohody (Súbor → Dátová komunikácia → XML export).
const POHODA_ADRESAR = `<?xml version="1.0" encoding="Windows-1250"?>
<rsp:responsePack version="2.0" xmlns:rsp="http://www.stormware.cz/schema/version_2/response.xsd" xmlns:lAdb="http://www.stormware.cz/schema/version_2/list_addBook.xsd" xmlns:adb="http://www.stormware.cz/schema/version_2/addressbook.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">
 <rsp:responsePackItem version="2.0" id="1" state="ok">
  <lAdb:listAddressBook version="2.0" state="ok">
   <lAdb:addressbook version="2.0">
    <adb:addressbookHeader>
     <adb:identity>
      <typ:id>15</typ:id>
      <typ:address>
       <typ:company>Stavby Novák s.r.o.</typ:company>
       <typ:name>Ján Novák</typ:name>
       <typ:city>Žilina</typ:city>
       <typ:street>Hlavná 12</typ:street>
       <typ:zip>010 01</typ:zip>
       <typ:ico>36123456</typ:ico>
       <typ:dic>2020123456</typ:dic>
       <typ:icDph>SK2020123456</typ:icDph>
       <typ:country><typ:ids>SK</typ:ids></typ:country>
      </typ:address>
     </adb:identity>
     <adb:phone>+421 41 123 456</adb:phone>
     <adb:email>info@novak.sk</adb:email>
    </adb:addressbookHeader>
   </lAdb:addressbook>
   <lAdb:addressbook version="2.0">
    <adb:addressbookHeader>
     <adb:identity><typ:address><typ:name>Peter Malý</typ:name><typ:city>Brno</typ:city><typ:country><typ:ids>CZ</typ:ids></typ:country></typ:address></adb:identity>
    </adb:addressbookHeader>
   </lAdb:addressbook>
  </lAdb:listAddressBook>
 </rsp:responsePackItem>
</rsp:responsePack>`;

// Export faktúr z Pohody — odberatelia v partnerIdentity, ten istý dvakrát.
const POHODA_FAKTURY = `<?xml version="1.0" encoding="UTF-8"?>
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd" id="x" ico="1" application="x" version="2.0">
 <dat:dataPackItem id="1" version="2.0"><inv:invoice version="2.0"><inv:invoiceHeader>
  <inv:partnerIdentity><typ:address><typ:company>Alfa a.s.</typ:company><typ:city>Košice</typ:city><typ:ico>12345678</typ:ico></typ:address></inv:partnerIdentity>
 </inv:invoiceHeader></inv:invoice></dat:dataPackItem>
 <dat:dataPackItem id="2" version="2.0"><inv:invoice version="2.0"><inv:invoiceHeader>
  <inv:partnerIdentity><typ:address><typ:company>Alfa a.s.</typ:company><typ:street>Dlhá 1</typ:street><typ:ico>12345678</typ:ico></typ:address></inv:partnerIdentity>
 </inv:invoiceHeader></inv:invoice></dat:dataPackItem>
</dat:dataPack>`;

const MONEY_S3 = `<?xml version="1.0" encoding="UTF-8"?>
<MoneyData><SeznamFirem><Firma>
  <Nazev>Beta spol. s r.o.</Nazev><ICO>25097563</ICO><DIC>CZ25097563</DIC>
  <Adresa><Ulice>Vinohradská 5</Ulice><Misto>Praha</Misto><PSC>120 00</PSC><KodStatu>CZ</KodStatu></Adresa>
  <Email>beta@beta.cz</Email><Zkrat>BETA</Zkrat>
</Firma></SeznamFirem></MoneyData>`;

describe("import odberateľov", () => {
  it("Pohoda adresár: firma aj fyzická osoba", () => {
    const r = rozparsujXml(POHODA_ADRESAR);
    expect(r.zdroj).toBe("Pohoda");
    expect(r.odberatelia).toHaveLength(2);
    expect(r.odberatelia[0]).toMatchObject({
      name: "Stavby Novák s.r.o.",
      contact_person: "Ján Novák",
      ico: "36123456",
      dic: "2020123456",
      ic_dph: "SK2020123456",
      street: "Hlavná 12",
      city: "Žilina",
      zip: "010 01",
      country: "SK",
      email: "info@novak.sk",
      phone: "+421 41 123 456",
      external_id: "15",
      typ: "firma",
    });
    expect(r.odberatelia[1]).toMatchObject({ name: "Peter Malý", country: "CZ", typ: "fyzicka" });
  });

  it("Pohoda v kódovaní Windows-1250 sa prečíta s diakritikou", () => {
    const bajty = new Uint8Array(
      [...POHODA_ADRESAR].map((c) => ({ Ž: 0x8e, á: 0xe1, ý: 0xfd })[c] ?? c.charCodeAt(0)),
    );
    expect(rozparsujXml(dekoduj(bajty)).odberatelia[0].city).toBe("Žilina");
  });

  it("partneri z exportu faktúr Pohody sa zlúčia", () => {
    const r = rozparsujXml(POHODA_FAKTURY);
    expect(r.odberatelia).toHaveLength(2);
    const p = naplanuj(r.odberatelia, [], false);
    expect(p.novi).toHaveLength(1);
    expect(p.duplicityVSubore).toBe(1);
    expect(p.novi[0]).toMatchObject({ name: "Alfa a.s.", city: "Košice", street: "Dlhá 1" });
  });

  it("Money S3", () => {
    const r = rozparsujXml(MONEY_S3);
    expect(r.zdroj).toBe("Money S3");
    expect(r.odberatelia[0]).toMatchObject({
      name: "Beta spol. s r.o.",
      ico: "25097563",
      dic: "CZ25097563",
      city: "Praha",
      country: "CZ",
      external_id: "BETA",
    });
  });

  it("CSV zo SuperFaktúry, iDokladu a Fakturoidu — stĺpce podľa hlavičky", () => {
    const sf = navrhniMapovanie([
      "Názov",
      "IČO",
      "DIČ",
      "IČ DPH",
      "Adresa",
      "Mesto",
      "PSČ",
      "Krajina",
      "Email",
      "Telefón",
    ]);
    expect(Object.values(sf)).toEqual([
      "name",
      "ico",
      "dic",
      "ic_dph",
      "street",
      "city",
      "zip",
      "country",
      "email",
      "phone",
    ]);
    const id = navrhniMapovanie(["Název", "IČ", "DIČ", "Ulice", "Město", "PSČ", "Stát", "E-mail"]);
    expect(Object.values(id)).toEqual([
      "name",
      "ico",
      "dic",
      "street",
      "city",
      "zip",
      "country",
      "email",
    ]);
    const fk = navrhniMapovanie([
      "name",
      "registration_no",
      "vat_no",
      "street",
      "city",
      "zip",
      "country",
      "email",
      "phone",
    ]);
    expect(fk[1]).toBe("ico");
    expect(fk[2]).toBe("ic_dph");
    const pohodaExcel = navrhniMapovanie(["Firma", "Jméno", "Obec", "IČ", "IČ DPH"]);
    expect(pohodaExcel).toMatchObject({ 0: "name", 2: "city", 3: "ico", 4: "ic_dph" });
  });

  it("z tabuľky: prázdny názov sa preskočí, krajina z názvu štátu", () => {
    const o = zTabulky(
      [
        ["Gama s.r.o.", "44 555 666", "Slovenská republika"],
        ["", "1", "SK"],
      ],
      { 0: "name", 1: "ico", 2: "country" },
    );
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ ico: "44555666", country: "SK" });
  });

  it("Excel (xlsx) s nadpisom nad hlavičkou", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Adresár"],
      ["Firma", "IČO", "Mesto"],
      ["Delta", "11111111", "Nitra"],
    ]);
    const riadky = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
    const idx = riadky.findIndex((r) => Object.keys(navrhniMapovanie(r.map(String))).length >= 2);
    expect(idx).toBe(1);
    expect(
      zTabulky(riadky.slice(2) as string[][], navrhniMapovanie(riadky[1] as string[]))[0].city,
    ).toBe("Nitra");
  });

  it("existujúci sa neprepisuje — doplnia sa len prázdne údaje", () => {
    const zoSuboru = rozparsujXml(POHODA_ADRESAR).odberatelia;
    const existujuci = [
      { id: "e1", name: "Stavby Novák", ico: "36123456", email: "stary@novak.sk", city: null },
      { id: "e2", name: "Peter Malý", ico: null },
    ];
    const bez = naplanuj(zoSuboru, existujuci, false);
    expect(bez.novi).toHaveLength(0);
    expect(bez.existujuci).toBe(2);
    expect(bez.doplnit).toHaveLength(0);
    const s = naplanuj(zoSuboru, existujuci, true);
    const e1 = s.doplnit.find((d) => d.id === "e1")!;
    expect(e1.zmena.city).toBe("Žilina");
    expect(e1.zmena.email).toBeUndefined();
  });

  it("rovnaký názov s iným IČO je iná firma", () => {
    const p = naplanuj(
      [{ name: "Omega s.r.o.", ico: "22222222" } as any],
      [{ id: "x", name: "Omega s.r.o.", ico: "11111111" }],
      false,
    );
    expect(p.novi).toHaveLength(1);
  });
});
