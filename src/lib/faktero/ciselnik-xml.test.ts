import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dekodujXml,
  nahladXml,
  planXml,
  poctyPodlaDruhu,
  prepocitajNahladXml,
  rozoberXmlCiselnikov,
  type ExistujuciXml,
} from "./ciselnik-xml";
import { mimoCiselnikaNaKoniec, moznostMimoCiselnika, zoradPodlaDokladu, ziadostCiselnikov } from "./predkontacie";

/*
  Vzorka: skrátená ozajstná odpoveď POHODY SK (14404.8 SQL) na žiadosť
  o číselníky, uložená vo Windows-1250 ako ju Pohoda zapisuje. IČO, kľúč a
  číslo účtu sú vymyslené.
*/
const BAJTY = new Uint8Array(readFileSync(join(__dirname, "__fixtures__/pohoda-odpovede/ciselniky-odpoved-cp1250.xml")));
const DNES = new Date("2026-11-19T10:00:00Z");

describe("kódovanie XML z Pohody", () => {
  it("Windows-1250 podľa hlavičky — diakritika sedí", () => {
    const xml = dekodujXml(BAJTY);
    expect(xml).toContain("Úhrada mzdy spoločníka");
    expect(xml).toContain("Nezahrňovať do priznania DPH");
  });

  it("hlavička hovorí 1250, no súbor je UTF-8 (prešiel editorom) → UTF-8", () => {
    const utf8 = new TextEncoder().encode(dekodujXml(BAJTY));
    expect(dekodujXml(utf8)).toContain("Úhrada mzdy spoločníka");
  });

  it("UTF-8 s BOM aj bez hlavičky", () => {
    const s = '<?xml version="1.0"?><a>čšž</a>';
    const b = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(s)]);
    expect(dekodujXml(b)).toBe(s);
    expect(dekodujXml(new TextEncoder().encode(s))).toBe(s);
  });
});

describe("rozbor odpovede", () => {
  const r = rozoberXmlCiselnikov(dekodujXml(BAJTY), DNES);

  it("prečíta predkontácie, členenia, rady, bankový účet a zákazku", () => {
    expect(r.chyba).toBeNull();
    const p = poctyPodlaDruhu(r.zaznamy);
    expect(p.get("predkontacia")).toBe(6);
    expect(p.get("clenenie_dph")).toBe(4);
    expect(p.get("ciselny_rad")).toBe(2);
    expect(p.get("bankovy_ucet")).toBe(1);
    expect(p.get("zakazka")).toBe(1);
    const md = r.zaznamy.find((z) => z.kod === "211000 311000");
    expect(md).toMatchObject({ druh: "predkontacia", agenda: "cashReceived", ucet_md: "211000", ucet_d: "311000" });
    // Rovnaký kód v dvoch agendách sú dva záznamy.
    expect(r.zaznamy.filter((z) => z.kod === "1V").map((z) => z.agenda).sort()).toEqual(["bankIssued", "cashPaid"]);
  });

  it("UDpdp neaktívne v Pohode (offer=false) ostane neaktívne", () => {
    expect(r.zaznamy.find((z) => z.kod === "UDpdp")?.aktivne).toBe(false);
    expect(r.zaznamy.find((z) => z.kod === "UD")?.aktivne).toBe(true);
  });

  it("chyba jednoduchého účtovníctva pri podvojnom sa nehlási", () => {
    expect(r.upozornenia).toEqual([]);
    const s = dekodujXml(BAJTY).replace(
      'id="CIS-STREDISKA" state="ok"',
      'id="CIS-STREDISKA" state="error" note="Chýba právo."',
    );
    expect(rozoberXmlCiselnikov(s, DNES).upozornenia).toEqual(["Chýba právo."]);
  });

  it("žiadosť namiesto odpovede, iné XML a prázdne zoznamy sa povedia", () => {
    expect(rozoberXmlCiselnikov(ziadostCiselnikov("12345678")).chyba).toMatch(/žiadosť pre Pohodu/);
    expect(rozoberXmlCiselnikov("<faktura/>").chyba).toMatch(/nie sú číselníky/);
    expect(rozoberXmlCiselnikov("Kód;Popis").chyba).toMatch(/nie je XML/);
    expect(
      rozoberXmlCiselnikov(
        '<rsp:responsePack xmlns:rsp="x"><lst:listCentre state="ok"></lst:listCentre></rsp:responsePack>',
      ).chyba,
    ).toMatch(/prázdne/);
  });
});

describe("náhľad a plán zápisu", () => {
  const { zaznamy } = rozoberXmlCiselnikov(dekodujXml(BAJTY), DNES);
  const e = (o: Partial<ExistujuciXml> & Pick<ExistujuciXml, "id" | "druh" | "kod">): ExistujuciXml => ({
    agenda: "",
    popis: null,
    ucet_md: null,
    ucet_d: null,
    aktivne: true,
    zdroj: "pohoda",
    ...o,
  });
  const existujuce: ExistujuciXml[] = [
    e({ id: "a", druh: "predkontacia", kod: "1V", agenda: "cashPaid", popis: "Úhrada faktúry", ucet_md: "321000", ucet_d: "211000" }),
    e({ id: "b", druh: "predkontacia", kod: "1V", agenda: "bankIssued", popis: "Starý text", ucet_md: "321000", ucet_d: "221000", zdroj: "rucne" }),
    e({ id: "c", druh: "clenenie_dph", kod: "UDpdp", agenda: "1235 U36", popis: "Prenesenie", aktivne: false }),
  ];
  const BEZ = { neaktivneAkoAktivne: false };
  const AJ = { neaktivneAkoAktivne: true };

  it("stav: nový / zmena / bez zmeny, zhoda na (druh, kód, agenda)", () => {
    const n = nahladXml(zaznamy, existujuce, BEZ);
    const s = (kod: string, agenda: string) => n.find((r) => r.kod === kod && r.agenda === agenda);
    expect(s("1V", "cashPaid")).toMatchObject({ stav: "bez_zmeny", vybrany: false });
    expect(s("1V", "bankIssued")).toMatchObject({ stav: "zmena", zmeny: ["popis"], vybrany: true });
    expect(s("UDpdp", "1235 U36")).toMatchObject({ stav: "zmena", zmeny: ["popis"] });
    expect(s("211000 311000", "cashReceived")).toMatchObject({ stav: "novy", vybrany: true });
  });

  it("„aj neaktívne ako aktívne“ zapne UDpdp — nový aj existujúci vypnutý", () => {
    const n = nahladXml(zaznamy, existujuce, AJ);
    expect(n.find((r) => r.kod === "UDpdp")?.zmeny).toEqual(["popis", "aktivne"]);
    const plan = planXml("f", zaznamy, existujuce, AJ);
    expect(plan.upravit.find((u) => u.id === "c")?.zmeny).toMatchObject({ aktivne: true });
    const bezExist = planXml("f", zaznamy, [], AJ);
    expect(bezExist.vlozit.find((z) => z.kod === "UDpdp")?.aktivne).toBe(true);
    // Bez voľby sa uloží tak, ako je v Pohode.
    expect(planXml("f", zaznamy, [], BEZ).vlozit.find((z) => z.kod === "UDpdp")?.aktivne).toBe(false);
  });

  it("plán: nové so zdrojom pohoda, existujúce len doplní, nič nevypne ani nezmaže", () => {
    const plan = planXml("firma", zaznamy, existujuce, BEZ);
    expect(plan.vlozit.length).toBe(zaznamy.length - 3);
    expect(plan.vlozit.every((z) => z.zdroj === "pohoda" && z.company_id === "firma")).toBe(true);
    expect(plan.upravit.map((u) => u.id).sort()).toEqual(["b", "c"]);
    expect(plan.upravit.find((u) => u.id === "b")?.zmeny).toEqual({ popis: "Úhrada faktúry", pohoda_id: "9" });
    expect(plan.bezZmeny).toBe(1);
    // Aktívny kód, ktorý v Pohode vypli, import nevypne.
    const zapnuty = [e({ id: "d", druh: "clenenie_dph", kod: "UDpdp", agenda: "1235 U36", popis: zaznamy.find((z) => z.kod === "UDpdp")!.popis })];
    expect(planXml("f", zaznamy, zapnuty, BEZ).upravit.find((u) => u.id === "d")).toBeUndefined();
  });

  it("opakovaný import tých istých dát nič nezmení", () => {
    const ulozene: ExistujuciXml[] = planXml("f", zaznamy, [], BEZ).vlozit.map((z, i) => ({ ...z, id: String(i) }));
    const druhy = planXml("f", zaznamy, ulozene, BEZ);
    expect(druhy.vlozit).toEqual([]);
    expect(druhy.upravit).toEqual([]);
    expect(druhy.bezZmeny).toBe(zaznamy.length);
  });

  it("prepočet po zmene voľby nechá ručné zaškrtnutie, ak sa stav nezmenil", () => {
    const n = nahladXml(zaznamy, existujuce, BEZ).map((r) => (r.kod === "211000 311000" ? { ...r, vybrany: false } : r));
    const p = prepocitajNahladXml(n, existujuce, AJ);
    expect(p.find((r) => r.kod === "211000 311000")?.vybrany).toBe(false);
  });
});

describe("kódy z dokladov mimo číselníka", () => {
  it("účty z kódu „MD D“, inak bez účtov; príznak mimo číselníka", () => {
    expect(moznostMimoCiselnika("211000 331000")).toEqual({
      kod: "211000 331000",
      popis: null,
      agenda: "",
      ucty: "211000/331000",
      mimoCiselnika: true,
    });
    expect(moznostMimoCiselnika("1Fp").ucty).toBeNull();
  });

  it("idú na koniec ponuky, aj pri zoradení podľa dokladu", () => {
    const m = [
      moznostMimoCiselnika("9X"),
      { kod: "1Fp", popis: "Nákup", agenda: "", ucty: null, typDokladu: "blocek" as const },
      { kod: "2Fp", popis: "Služby", agenda: "", ucty: null },
    ];
    expect(mimoCiselnikaNaKoniec(m).map((x) => x.kod)).toEqual(["1Fp", "2Fp", "9X"]);
    expect(zoradPodlaDokladu(m, { typ: "faktura" }).map((x) => x.kod)).toEqual(["2Fp", "1Fp", "9X"]);
  });
});
