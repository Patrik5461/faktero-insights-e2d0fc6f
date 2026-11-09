import { describe, expect, it } from "vitest";
import {
  chybaUlozenehoBlocku,
  duplicityDokladu,
  mapaDuplicit,
  rozlozChybuBlocku,
  suDuplicitne,
  textDuplicity,
  zBlocku,
  zPrijatej,
} from "./duplicita-zauctovania";

const faktura = {
  id: "a",
  invoice_number: "FA-2026/0012",
  supplier_ico: "36 562 939",
  supplier_name: "Alza.sk s. r. o.",
  type: "regular",
  status: "received",
  amount_total: 120,
  issue_date: "2026-10-01",
};

describe("duplicita prijatej faktúry", () => {
  it("rovnaké číslo (inak zapísané) od toho istého dodávateľa je duplicita", () => {
    expect(suDuplicitne(zPrijatej(faktura), zPrijatej({ ...faktura, id: "b", invoice_number: "fa 2026 0012", supplier_ico: "36562939" }))).toBe(true);
  });
  it("iný dodávateľ podľa IČO nie je duplicita", () => {
    expect(suDuplicitne(zPrijatej(faktura), zPrijatej({ ...faktura, id: "b", supplier_ico: "11111111" }))).toBe(false);
  });
  it("bez IČO rozhoduje názov bez diakritiky a právnej formy", () => {
    const a = { ...faktura, supplier_ico: null, supplier_name: "Žabka, s.r.o." };
    expect(suDuplicitne(zPrijatej(a), zPrijatej({ ...a, id: "b", supplier_name: "zabka sro" }))).toBe(true);
    expect(suDuplicitne(zPrijatej(a), zPrijatej({ ...a, id: "b", supplier_name: "Billa" }))).toBe(false);
  });
  it("dobropis a jeho faktúra nie sú duplicita", () => {
    expect(suDuplicitne(zPrijatej(faktura), zPrijatej({ ...faktura, id: "b", amount_total: -120 }))).toBe(false);
    expect(suDuplicitne(zPrijatej(faktura), zPrijatej({ ...faktura, id: "b", opravuje_cislo: "FA-2026/0012" }))).toBe(false);
  });
  it("iný druh (zálohová) nie je duplicita bežnej", () => {
    expect(suDuplicitne(zPrijatej(faktura), zPrijatej({ ...faktura, id: "b", type: "proforma" }))).toBe(false);
  });
  it("zmazaný, stornovaný ani koncept sa nerátajú", () => {
    for (const z of [{ deleted_at: "2026-10-02" }, { status: "cancelled" }, { status: "draft" }])
      expect(suDuplicitne(zPrijatej(faktura), zPrijatej({ ...faktura, id: "b", ...z }))).toBe(false);
  });
  it("doklad nie je duplicitou sám seba", () => {
    expect(suDuplicitne(zPrijatej(faktura), zPrijatej(faktura))).toBe(false);
  });
});

describe("duplicita bločku", () => {
  const blocek = {
    id: "x",
    qr_raw: "O-E2E93C42190A4828A93C42190AF82875",
    supplier_ico: "47793155",
    supplier_name: "Shell",
    document_number: "13721",
    issue_date: "2026-10-22",
    total_amount: 65.97,
  };
  it("rovnaký QR z eKasy je vždy duplicita", () => {
    expect(suDuplicitne(zBlocku(blocek), zBlocku({ id: "y", qr_raw: blocek.qr_raw.toLowerCase() }))).toBe(true);
  });
  it("dva rôzne QR sú dva nákupy, aj keď sedí dodávateľ, deň aj suma", () => {
    expect(suDuplicitne(zBlocku(blocek), zBlocku({ ...blocek, id: "y", qr_raw: "O-0000" }))).toBe(false);
  });
  it("bez QR na jednom: dodávateľ + deň + suma (aj s iným číslom)", () => {
    const foto = { ...blocek, id: "y", qr_raw: null, document_number: "inak-precitane", total_amount: "65.970" };
    expect(suDuplicitne(zBlocku(blocek), zBlocku(foto))).toBe(true);
    expect(suDuplicitne(zBlocku(blocek), zBlocku({ ...foto, total_amount: 66 }))).toBe(false);
    expect(suDuplicitne(zBlocku(blocek), zBlocku({ ...foto, issue_date: "2026-10-23" }))).toBe(false);
    expect(suDuplicitne(zBlocku(blocek), zBlocku({ ...foto, supplier_ico: "1" }))).toBe(false);
  });
  it("bez dodávateľa sa duplicita nehlási", () => {
    const a = { id: "a", issue_date: "2026-10-22", total_amount: 5 };
    expect(suDuplicitne(zBlocku(a), zBlocku({ ...a, id: "b" }))).toBe(false);
  });
});

describe("blokovanie zaúčtovania", () => {
  it("duplicita zaúčtovaného: hláška povie, že tento je navyše", () => {
    const d = duplicityDokladu(zPrijatej(faktura), [zPrijatej({ ...faktura, id: "b", zauctovane_at: "2026-10-02" })]);
    expect(d).toEqual([{ id: "b", cislo: "FA-2026/0012", zauctovany: true }]);
    expect(textDuplicity(d)).toMatch(/^Duplicitný doklad — .*už zaúčtovaný/);
  });
  it("ani jeden zaúčtovaný: oba blokované, kým sa jeden nezmaže", () => {
    const m = mapaDuplicit("prijata", [faktura, { ...faktura, id: "b" }, { ...faktura, id: "c", invoice_number: "X" }]);
    expect([...m.keys()].sort()).toEqual(["a", "b"]);
    expect(textDuplicity(m.get("a")!)).toMatch(/viackrát/);
  });
  it("odovzdaný druhý sa ráta ako zaúčtovaný", () => {
    const d = duplicityDokladu(zPrijatej(faktura), [zPrijatej({ ...faktura, id: "b", exported_at: "x" })]);
    expect(d[0].zauctovany).toBe(true);
  });
  it("bez duplicity žiadna hláška", () => {
    expect(textDuplicity([])).toBeNull();
  });
});

describe("chyba uloženého bločku", () => {
  it("nesie popis a odkaz na uložený bloček", () => {
    const id = "6f1f9a2e-1111-4222-8333-944455556666";
    const sprava = chybaUlozenehoBlocku({ id, supplier_name: "Shell", issue_date: "2026-09-20", total_amount: 70, currency: "EUR" });
    expect(sprava).toBe(`Tento bloček už je uložený: Shell, 20. 9. 2026, 70,00 EUR [${id}]`);
    expect(rozlozChybuBlocku(`Error: ${sprava}`)).toEqual({ popis: "Shell, 20. 9. 2026, 70,00 EUR", id });
    expect(rozlozChybuBlocku("iná chyba")).toBeNull();
  });
});

describe("autopilot", () => {
  it("duplicita je blokátor — doklad ostane Na kontrolu", async () => {
    const { blokatory, smieAutopilot } = await import("./auto-uctovanie");
    const bl = blokatory({ duplicita: true, predkontacia: "501", clenenieDph: "PD" });
    expect(bl).toEqual(["duplicita"]);
    expect(
      smieAutopilot("plny", {
        predkontacia: "501",
        clenenieDph: "PD",
        kvClenenie: null,
        stredisko: null,
        cinnost: null,
        zdroj: "pravidlo",
        istota: 100,
        zdovodnenie: "",
        blokatory: bl,
      } as any),
    ).toBe(false);
  });
});

describe("bloček bez QR: iný nákup (audit 8. 11.)", () => {
  const listok = { id: "p1", supplier_name: "Parkovanie Mesto", issue_date: "2026-11-05", total_amount: 2 };
  it("rovnaký predajca, deň a suma bez čísel ostáva duplicita", () => {
    expect(suDuplicitne(zBlocku(listok), zBlocku({ ...listok, id: "p2" }))).toBe(true);
  });
  it("rôzne čísla dokladu sú dva nákupy", () => {
    const a = zBlocku({ ...listok, document_number: "0012" });
    expect(suDuplicitne(a, zBlocku({ ...listok, id: "p2", document_number: "13" }))).toBe(false);
    expect(suDuplicitne(a, zBlocku({ ...listok, id: "p2", document_number: "12" }))).toBe(true);
  });
  it("bloček uložený vedome „aj tak“ s ničím nekoliduje", () => {
    expect(suDuplicitne(zBlocku(listok), zBlocku({ ...listok, id: "p2", duplicita_potvrdena: true }))).toBe(false);
  });
});
