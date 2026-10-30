/*
  História odovzdania a oprava zaúčtovania (P-1008, P-1009): stav po vrátení,
  zámok polí pri oprave zaúčtovania a to, že Pohoda doklad z XML neprepíše
  (overené proti oficiálnej schéme Stormware, ak je na disku).
*/
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
  POLIA_OPRAVY,
  stavOdovzdania,
  textOdznaku,
  textVarovaniaVratenia,
  zapisOpravy,
  zmenyOpravy,
} from "./stav-odovzdania";
import {
  POLIA_OPRAVY_ZAUCTOVANIA,
  porusenieZamkuDokladu,
  porusenieZamkuFaktury,
  ZAMOK_DOKLADU,
  ZAMOK_FAKTURY,
  ZAMOK_PRIJATEJ,
} from "./pohoda-zamok";
import { buildPohodaInvoiceXml } from "./export.server";

describe("stav odovzdania", () => {
  it("nikdy neodovzdaný", () => {
    expect(stavOdovzdania({}).druh).toBe("nie");
    expect(textOdznaku(stavOdovzdania({}))).toBeNull();
  });

  it("odovzdaný prvýkrát", () => {
    const s = stavOdovzdania({
      exported_at: "2026-10-12T16:36:00Z",
      prvy_export_at: "2026-10-12T16:36:00Z",
      pocet_exportov: 1,
      export_cesta: "subor",
    });
    expect(s.druh).toBe("odovzdane");
    expect(s.cesta).toBe("subor");
    expect(s.vPohode).toBe(true);
  });

  it("po vrátení odznak nezmizne — doklad je stále v Pohode a treba ho znova odovzdať", () => {
    const s = stavOdovzdania({
      exported_at: null,
      prvy_export_at: "2026-10-12T16:36:00Z",
      pocet_exportov: 1,
      export_cesta: "subor",
      vratene_z_pohody_at: "2026-10-20T08:00:00Z",
    });
    expect(s.druh).toBe("vratene");
    expect(s.vPohode).toBe(true);
    expect(s.prvy).toBe("2026-10-12T16:36:00Z");
    expect(textOdznaku(s)).toBe("Odovzdané, vrátené na opravu");
  });

  it("vrátený bez histórie počtu (staršie riadky) sa stále ráta ako odovzdaný", () => {
    expect(stavOdovzdania({ vratene_z_pohody_at: "2026-10-20T08:00:00Z" }).druh).toBe("vratene");
  });

  it("odovzdaný znova po vrátení", () => {
    const s = stavOdovzdania({ exported_at: "2026-10-21T08:00:00Z", pocet_exportov: 2 });
    expect(s.druh).toBe("odovzdane_znova");
    expect(s.pocet).toBe(2);
  });

  it("odovzdaný bez stĺpcov histórie sa ráta raz", () => {
    expect(stavOdovzdania({ exported_at: "2026-10-21T08:00:00Z" }).pocet).toBe(1);
  });

  it("oprava zaúčtovania prebíja bežný stav", () => {
    const s = stavOdovzdania({
      exported_at: "2026-10-21T08:00:00Z",
      pocet_exportov: 1,
      oprava_zauctovania_at: "2026-10-22T08:00:00Z",
    });
    expect(s.druh).toBe("oprava_zauctovania");
  });
});

describe("varovanie pred vrátením", () => {
  it("konektor: doklad v Pohode nezmaže a pošle ho znova sám", () => {
    const t = textVarovaniaVratenia("faktura", "konektor");
    expect(t).toContain("Konektor doklad v Pohode nezmaže");
    expect(t).toContain("Opraviť zaúčtovanie");
  });
  it("súbor: Faktero ho v Pohode zmazať nevie", () => {
    const t = textVarovaniaVratenia("prijata", "subor");
    expect(t).toContain("Faktero doklad v Pohode nezmaže");
    expect(t).not.toContain("Konektor");
  });
  it("bloček ide medzi nespracované", () => {
    expect(textVarovaniaVratenia("doklad", null)).toContain("medzi nespracované");
  });
});

describe("oprava zaúčtovania — len zaúčtovacie polia", () => {
  it("zápis zahodí sumy, dátumy aj strany", () => {
    const z = zapisOpravy({
      pohoda_predkontacia: " 1Fp ",
      pohoda_clenenie_dph: "",
      amount_total: 999,
      issue_date: "2026-01-01",
      supplier_name: "Iný",
    });
    expect(z).toEqual({ pohoda_predkontacia: "1Fp", pohoda_clenenie_dph: null });
  });

  it("rozdiel oproti Pohode", () => {
    const zmeny = zmenyOpravy(
      { pohoda_predkontacia: "1", pohoda_clenenie_dph: "PD" },
      { pohoda_predkontacia: "518000", pohoda_clenenie_dph: "PD", stredisko: "" },
    );
    expect(zmeny).toEqual([{ pole: "pohoda_predkontacia", v_pohode: "1", teraz: "518000" }]);
    expect(zmenyOpravy(null, {})).toEqual([]);
  });

  it("zoznam polí je v zámku každej agendy a v TS rovnaký ako v SQL", () => {
    expect([...POLIA_OPRAVY_ZAUCTOVANIA]).toEqual([...POLIA_OPRAVY]);
    const adresar = new URL("../../../supabase/migrations/", import.meta.url);
    const subor = readdirSync(adresar).find((f) => /odovzdanie_historia_spustace\.sql$/.test(f));
    expect(subor).toBeTruthy();
    const sql = readFileSync(new URL(subor!, adresar), "utf8");
    const polia = [...sql.matchAll(/_polia_opravy text\[\] := array\[([^\]]+)\]/g)].map((m) =>
      [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]),
    );
    expect(polia.length).toBe(2);
    for (const p of polia) expect(p).toEqual([...POLIA_OPRAVY]);
  });

  const stara = {
    exported_at: "2026-10-12T16:36:00Z",
    pohoda_predkontacia: "1",
    pohoda_clenenie_dph: "PD",
    amount_total: 100,
    total: 100,
    issue_date: "2026-10-01",
  };

  it("bez príznaku opravy je zaúčtovanie po odovzdaní zamknuté", () => {
    expect(
      porusenieZamkuDokladu(ZAMOK_PRIJATEJ, stara, { ...stara, pohoda_predkontacia: "518000" }),
    ).toBe("pohoda_predkontacia");
    expect(porusenieZamkuFaktury(stara, { ...stara, pohoda_predkontacia: "3Fv" })).toBe(
      "pohoda_predkontacia",
    );
  });

  it("s príznakom opravy prejdú len zaúčtovacie polia", () => {
    const oprava = { oprava_zauctovania_at: "2026-10-22T08:00:00Z" };
    const kody = { pohoda_predkontacia: "518000", pohoda_clenenie_dph: "PN", stredisko: "S1" };
    expect(
      porusenieZamkuDokladu(ZAMOK_PRIJATEJ, stara, { ...stara, ...oprava, ...kody }),
    ).toBeNull();
    expect(
      porusenieZamkuDokladu(ZAMOK_DOKLADU, stara, { ...stara, ...oprava, ...kody }),
    ).toBeNull();
    expect(porusenieZamkuFaktury(stara, { ...stara, ...oprava, ...kody })).toBeNull();
    // Suma ani dátum nie.
    expect(
      porusenieZamkuDokladu(ZAMOK_PRIJATEJ, stara, { ...stara, ...oprava, amount_total: 101 }),
    ).toBe("amount_total");
    expect(porusenieZamkuFaktury(stara, { ...stara, ...oprava, total: 101 })).toBe("total");
    expect(porusenieZamkuFaktury(stara, { ...stara, ...oprava, issue_date: "2026-10-02" })).toBe(
      "issue_date",
    );
  });

  it("zamknutý doklad (locked_at) nepustí ani oprava", () => {
    const z = { ...stara, locked_at: "2026-10-13T00:00:00Z" };
    expect(
      porusenieZamkuDokladu(ZAMOK_DOKLADU, z, {
        ...z,
        oprava_zauctovania_at: "2026-10-22T08:00:00Z",
        pohoda_predkontacia: "X",
      }),
    ).toBe("pohoda_predkontacia");
  });

  it("každé pole opravy je v zámku vystavených (inak by výnimka nemala zmysel)", () => {
    for (const p of POLIA_OPRAVY.filter((p) => p !== "int_poznamka"))
      expect(ZAMOK_FAKTURY as readonly string[]).toContain(p);
  });
});

/*
  Opätovné odovzdanie: dá sa doklad v Pohode z XML aktualizovať? Overené proti
  schéme Stormware (data.xsd + 72 importovaných): agenda faktúr `actionType`
  nemá, `<inv:actionType><inv:update>` validácia odmietne — a pre istotu aj to,
  že overovačka náš bežný export prijme. Bez schémy na disku sa test preskočí.
*/
const XSD = process.env.XSD_POHODA || "/home/patrik/.claude/jobs/d7c5304b/tmp/xsd-pohoda";
describe.skipIf(!existsSync(`${XSD}/data.xsd`))(
  "Pohoda XML — aktualizácia faktúry (schéma)",
  () => {
    const company: any = { name: "QA s.r.o.", ico: "12345678", dic: "2120000000", country: "SK" };
    const invoice: any = {
      id: "5bbd3c84-6e0c-486d-8954-b728c0d4ea2a",
      type: "regular",
      invoice_number: "2026095",
      issue_date: "2026-10-07",
      delivery_date: "2026-10-07",
      due_date: "2026-10-21",
      currency: "EUR",
      subtotal: 10,
      vat_total: 2.3,
      total: 12.3,
      customer_name: "Odberateľ s.r.o.",
      customer_ico: "44444444",
      pohoda_predkontacia: "3Fv",
      oprava_zauctovania_at: "2026-10-22T08:00:00Z",
    };
    const items: any[] = [
      {
        name: "Služba",
        quantity: 1,
        unit: "ks",
        unit_price: 10,
        subtotal: 10,
        vat_amount: 2.3,
        vat_rate: 23,
        total: 12.3,
      },
    ];

    async function validator() {
      const { createRequire } = await import("node:module");
      const req = createRequire(import.meta.url);
      const cesta = req.resolve("libxml2-wasm");
      const lib: any = await import(cesta);
      const node: any = await import(cesta.replace(/index\.mjs$/, "nodejs.mjs"));
      node.xmlRegisterFsInputProviders();
      const xsd = lib.XmlDocument.fromBuffer(readFileSync(`${XSD}/data.xsd`), {
        url: `file://${XSD}/data.xsd`,
      });
      const v = lib.XsdValidator.fromDoc(xsd);
      return (xml: string) => {
        const doc = lib.XmlDocument.fromString(xml);
        try {
          v.validate(doc);
          return null;
        } catch (e: any) {
          return String(e?.message ?? e);
        } finally {
          doc.dispose();
        }
      };
    }

    it("náš export je platný a nenesie actionType; s actionType update ho schéma odmietne", async () => {
      const over = await validator();
      const xml = buildPohodaInvoiceXml({ company, invoices: [{ invoice, items }] });
      expect(xml).not.toContain("actionType");
      expect(over(xml)).toBeNull();
      const update = xml.replace(
        /<inv:invoice version="2.0">/,
        '<inv:invoice version="2.0"><inv:actionType><inv:update><ftr:filter xmlns:ftr="http://www.stormware.cz/schema/version_2/filter.xsd"><ftr:extId><typ:ids>x</typ:ids><typ:exSystemName>FAKTERO</typ:exSystemName></ftr:extId></ftr:filter></inv:update></inv:actionType>',
      );
      expect(update).not.toBe(xml);
      expect(over(update)).toMatch(/actionType/);
    }, 30000);
  },
);

describe("textVarovaniaVratenia pri inom programe (test 30. 10.)", () => {
  it("doklad poslaný do Money nespomína Pohodu", () => {
    const f = textVarovaniaVratenia("prijata", "subor", "Money S3");
    expect(f).toContain("{program}");
    expect(f).not.toMatch(/Pohod/);
    expect(textVarovaniaVratenia("doklad", null, "KROS Omega")).toMatch(
      /^Vrátiť doklad z účtovníctva/,
    );
  });
  it("bez programu ostáva text pre Pohodu", () => {
    expect(textVarovaniaVratenia("faktura", "konektor", null)).toMatch(/^Vrátiť faktúru z Pohody/);
  });
});
