import { describe, expect, it } from "vitest";
import { ponukaKodovPravidla } from "./pravidla-uctovania";
import { ponuka } from "./predkontacie";

/*
  Test 30. 10. (2. kolo): pravidlo „Prijaté faktúry“ ponúkalo predkontácie
  bločkov a interných dokladov. Kód „7“ je v Pohode v prijatých „Nákup
  materiálu“ a v interných „Hrubá mzda“ — ponuka ukázala mzdu, „Nákup
  materiálu“ sa nedal nájsť a do pravidla sa uložil názov namiesto kódu.
*/
describe("ponukaKodovPravidla", () => {
  it("pravidlo pre prijaté faktúry dostane kódy prijatých faktúr", () => {
    expect(ponukaKodovPravidla("prijata")).toBe("prijata");
  });
  it("vystavené ostávajú vystavené, ostatné ako doklady", () => {
    expect(ponukaKodovPravidla("vystavena")).toBe("vystavena");
    expect(ponukaKodovPravidla("blocek")).toBe("doklad");
    expect(ponukaKodovPravidla(null)).toBe("doklad");
    expect(ponukaKodovPravidla(undefined)).toBe("doklad");
  });

  const ciselnik = [
    {
      druh: "predkontacia",
      kod: "7",
      popis: "Hrubá mzda zamestnanca",
      agenda: "internalDocument",
      ucet_md: "521000",
      ucet_d: "331000",
    },
    {
      druh: "predkontacia",
      kod: "7",
      popis: "Nákup materiálu",
      agenda: "receivedInvoice",
      ucet_md: "501000",
      ucet_d: "321000",
    },
    {
      druh: "predkontacia",
      kod: "4V",
      popis: "Nákup spotrebného materiálu",
      agenda: "cashPaid",
      ucet_md: "501000",
      ucet_d: "211000",
    },
  ];

  it("s agendou prijatých je „7“ Nákup materiálu, nie mzda", () => {
    // Agendy, ktoré navrhyKodovFn použije pre `pre: "prijata"`.
    const p = ponuka(ciselnik, "predkontacia", ["receivedInvoice"], "prijata");
    expect(p.find((x) => x.kod === "7")?.popis).toBe("Nákup materiálu");
  });
});
