/**
 * Registr plátců DPH — porovnanie účtov a rozparsovanie skutočnej odpovede
 * služby rozhraniCRPDPH (ukážka z 11. 10. 2026: ABRA Software, neznáme DIČ).
 */
import { describe, it, expect } from "vitest";
import {
  ceskyUcetNaIban,
  dicPreRegister,
  ibanNaCeskyUcet,
  jePlatnyIban,
  jeUcetZverejneny,
  ucetNaIban,
} from "./cz-registr-dph";
import { rozparsujOdpoved, rozparsujSubjekt } from "./cz-registr-dph.server";

const ODPOVED = `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Header/><soapenv:Body><StatusNespolehlivyPlatceRozsirenyResponse xmlns="http://adis.mfcr.cz/rozhraniCRPDPH/"><status odpovedGenerovana="2026-10-11" statusCode="0" statusText="OK"/><statusPlatceDPH dic="25097563" nespolehlivyPlatce="NE" cisloFu="451"><zverejneneUcty><ucet datumZverejneni="2013-04-01"><standardniUcet cislo="101716470" kodBanky="0300"/></ucet><ucet datumZverejneni="2013-04-01"><standardniUcet cislo="216143537" kodBanky="0300"/></ucet><ucet datumZverejneni="2021-08-03"><standardniUcet cislo="2700048370" kodBanky="2010"/></ucet><ucet datumZverejneni="2021-10-12"><standardniUcet cislo="2100048369" kodBanky="2010"/></ucet></zverejneneUcty><nazevSubjektu>ABRA SOFTWARE S.R.O.   </nazevSubjektu><adresa><uliceCislo>Jeremiášova 1422/7b</uliceCislo><castObce>STODŮLKY (PRAHA-ŘEPORYJE)                       </castObce><mesto>PRAHA-ŘEPORYJE</mesto><psc>15500</psc><stat>Česká republika</stat></adresa></statusPlatceDPH><statusPlatceDPH dic="99999999" nespolehlivyPlatce="NENALEZEN"/></StatusNespolehlivyPlatceRozsirenyResponse></soapenv:Body></soapenv:Envelope>`;

describe("účty", () => {
  it("české číslo účtu ↔ IBAN", () => {
    const iban = ceskyUcetNaIban(null, "2700048370", "2010");
    expect(iban).toBe("CZ2020100000002700048370");
    expect(jePlatnyIban(iban!)).toBe(true);
    expect(ibanNaCeskyUcet(iban!)).toBe("2700048370/2010");
    expect(ceskyUcetNaIban("35", "3355550267", "0100")).toMatch(/^CZ\d{2}0100000035\d{10}$/);
    expect(ibanNaCeskyUcet(ceskyUcetNaIban("35", "3355550267", "0100")!)).toBe(
      "35-3355550267/0100",
    );
  });

  it("účet zadaný človekom", () => {
    expect(ucetNaIban("CZ20 2010 0000 0027 0004 8370")).toBe("CZ2020100000002700048370");
    expect(ucetNaIban("2700048370/2010")).toBe("CZ2020100000002700048370");
    expect(ucetNaIban("CZ2120100000002700048370")).toBeNull(); // zlá kontrolná číslica
    expect(ucetNaIban("")).toBeNull();
  });

  it("DIČ pre register", () => {
    expect(dicPreRegister("CZ25097563")).toBe("25097563");
    expect(dicPreRegister("SK2122358579")).toBeNull();
  });
});

describe("odpoveď registra", () => {
  const o = rozparsujOdpoved(ODPOVED);

  it("stav a zverejnené účty", () => {
    expect(o.kod).toBe(0);
    const abra = o.platci.find((p) => p.dic === "25097563")!;
    expect(abra.nespolehlivy).toBe("NE");
    expect(abra.cisloFu).toBe("451");
    expect(abra.nazov).toBe("ABRA SOFTWARE S.R.O.");
    expect(abra.ucty.map((u) => u.zobrazenie)).toContain("101716470/0300");
    expect(abra.ucty.every((u) => u.iban && jePlatnyIban(u.iban))).toBe(true);
    expect(o.platci.find((p) => p.dic === "99999999")?.nespolehlivy).toBe("NENALEZEN");
  });

  it("účet z faktúry je / nie je zverejnený", () => {
    const abra = o.platci.find((p) => p.dic === "25097563")!;
    expect(jeUcetZverejneny("CZ2020100000002700048370", abra.ucty)).toBe(true);
    expect(jeUcetZverejneny("1234567890/0800", abra.ucty)).toBe(false);
    expect(jeUcetZverejneny(null, abra.ucty)).toBeNull();
  });
});

// Skutočná odpoveď getStatusNespolehlivySubjektRozsirenyV2 z 30. 10. 2026 (skrátená o účty).
const ODPOVED_SUBJEKT = `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Header/><soapenv:Body><StatusNespolehlivySubjektRozsirenyResponse xmlns="http://adis.mfcr.cz/rozhraniCRPDPH/"><status odpovedGenerovana="2026-10-30" statusCode="0" statusText="OK"/><statusSubjektu typSubjektu="PLATCE_DPH" dic="25097563" nespolehlivyPlatce="NE" cisloFu="451"><zverejneneUcty><ucet datumZverejneni="2013-04-01"><standardniUcet cislo="101716470" kodBanky="0300"/></ucet></zverejneneUcty><nazevSubjektu>ABRA SOFTWARE S.R.O.   </nazevSubjektu></statusSubjektu><statusSubjektu typSubjektu="IDENTIFIKOVANA_OSOBA" dic="12345678" nespolehlivyPlatce="NE"/></StatusNespolehlivySubjektRozsirenyResponse></soapenv:Body></soapenv:Envelope>`;

describe("typ subjektu DPH (V2)", () => {
  it("rozparsuje plátcu aj identifikovanú osobu", () => {
    const o = rozparsujSubjekt(ODPOVED_SUBJEKT);
    expect(o.kod).toBe(0);
    expect(o.subjekty).toEqual([
      {
        dic: "25097563",
        typ: "PLATCE_DPH",
        nespolehlivy: false,
        nazov: "ABRA SOFTWARE S.R.O.",
        cisloFu: "451",
        odpovedGenerovana: "2026-10-30",
      },
      {
        dic: "12345678",
        typ: "IDENTIFIKOVANA_OSOBA",
        nespolehlivy: false,
        nazov: null,
        cisloFu: null,
        odpovedGenerovana: "2026-10-30",
      },
    ]);
  });
});
