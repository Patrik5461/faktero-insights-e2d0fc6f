import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { IMPORT_ZDROJE, PREDVOLENY_ZDROJ, zdrojPodlaId } from "./import-zdroje";
import { parseVendorFile } from "@/lib/faktero/import-vendors.server";

const vlastnaStranka = IMPORT_ZDROJE.filter((z) => z.cesta);
const naStranke = IMPORT_ZDROJE.filter((z) => !z.cesta);

describe("zdroje účtovných importov", () => {
  it("identifikátory a popisy sa neopakujú", () => {
    expect(new Set(IMPORT_ZDROJE.map((z) => z.id)).size).toBe(IMPORT_ZDROJE.length);
    expect(new Set(IMPORT_ZDROJE.map((z) => z.label)).size).toBe(IMPORT_ZDROJE.length);
  });

  /* Buď sa súbor nahrá na spoločnej stránke, alebo má zdroj vlastnú. Nič medzi tým. */
  it("zdroj má buď prípony, alebo vlastnú stránku", () => {
    for (const z of IMPORT_ZDROJE) {
      expect(Boolean(z.accept) !== Boolean(z.cesta), z.id).toBe(true);
    }
  });

  it("každý má návod aj vetu, čo prenesie", () => {
    for (const z of IMPORT_ZDROJE) {
      expect(z.guide, z.id).toBeTruthy();
      expect(z.title.length, z.id).toBeGreaterThan(3);
      expect(z.description.length, z.id).toBeGreaterThan(10);
    }
  });

  /*
   * Predvolený zdroj sa musí dať vybaviť priamo na stránke. Keď ním bola
   * SuperFaktúra s vlastnou stránkou, po otvorení Účtovných importov človek
   * nevidel nahrávanie, ale ďalšie tlačidlo.
   */
  it("predvolený zdroj má formulár priamo na stránke", () => {
    expect(zdrojPodlaId(PREDVOLENY_ZDROJ).cesta).toBeUndefined();
    expect(IMPORT_ZDROJE[0].cesta).toBeUndefined();
  });

  it("neznámy zdroj z adresy spadne na predvolený, nie na prázdnu stránku", () => {
    expect(zdrojPodlaId("nieco-vymyslene").id).toBe(PREDVOLENY_ZDROJ);
    expect(zdrojPodlaId("").id).toBe(PREDVOLENY_ZDROJ);
  });

  it("vlastná stránka naozaj existuje", () => {
    for (const z of vlastnaStranka) {
      const subor = `src/routes/_authenticated${z.cesta!.replace(/\//g, ".").replace(/^\./, "/")}.tsx`;
      expect(existsSync(subor), `${z.id} → ${subor}`).toBe(true);
    }
  });

  /* Stránka jedného systému musí brať návod z tohto zoznamu, nie si ho písať znova. */
  it("stránky jednotlivých systémov čerpajú z tohto zoznamu", () => {
    for (const z of naStranke) {
      const subor = `src/routes/_authenticated/importy.${z.id}.tsx`;
      expect(existsSync(subor), subor).toBe(true);
      expect(readFileSync(subor, "utf-8")).toContain(`zdrojPodlaId("${z.id}")`);
    }
  });
});

describe("prípony sedia s tým, čo parser prečíta", () => {
  const bajty = (s: string) => new TextEncoder().encode(s);

  const CSV = [
    "Číslo dokladu;Odberateľ;Dátum vystavenia;Celkom s DPH",
    "F1;ACME;04.03.2026;123,00",
  ].join("\n");

  const MONEY = `<?xml version="1.0"?><MoneyData><SeznamFaktVyd><FaktVyd>
    <Doklad>F1</Doklad><Vystaveno>2026-03-04</Vystaveno><Celkem>123.00</Celkem>
    <DodOdb><ObchNazev>ACME</ObchNazev></DodOdb></FaktVyd></SeznamFaktVyd></MoneyData>`;

  const POHODA = `<?xml version="1.0"?><dat:dataPack xmlns:dat="d" xmlns:inv="i" xmlns:typ="t">
    <dat:dataPackItem><inv:invoice><inv:invoiceHeader>
      <inv:number><typ:numberRequested>F1</typ:numberRequested></inv:number>
      <inv:date>2026-03-04</inv:date>
      <inv:partnerIdentity><typ:address><typ:company>ACME</typ:company></typ:address></inv:partnerIdentity>
    </inv:invoiceHeader><inv:invoiceSummary><inv:homeCurrency>
      <typ:priceHigh>100.00</typ:priceHigh><typ:priceHighVAT>23.00</typ:priceHighVAT>
    </inv:homeCurrency></inv:invoiceSummary></inv:invoice></dat:dataPackItem></dat:dataPack>`;

  /* KROS aj Omega vydávajú vlastné XML — parser v ňom hľadá uzly `Faktura`. */
  const KROS = `<?xml version="1.0"?><Faktury><Faktura>
    <Cislo>F1</Cislo><DatumVystavenia>04.03.2026</DatumVystavenia><Spolu>123,00</Spolu>
    <Odberatel><Nazov>ACME</Nazov></Odberatel></Faktura></Faktury>`;

  /** Ukážka v každej prípone, ktorú zdroj sľubuje, vždy s dokladom `F1`. */
  const UKAZKY: Record<string, Record<string, string>> = {
    pohoda: { ".xml": POHODA, ".isdoc": POHODA, ".json": "[]" },
    "money-s3": { ".xml": MONEY },
    omega: { ".csv": CSV, ".xml": KROS },
    kros: { ".xml": KROS, ".csv": CSV },
    idoklad: { ".csv": CSV },
  };

  it("zoznam ukážok pokrýva každý zdroj a každú jeho príponu", () => {
    for (const z of naStranke) {
      expect(Object.keys(UKAZKY[z.id] ?? {}).sort(), z.id).toEqual(z.accept!.split(",").sort());
    }
  });

  it("z každej sľúbenej prípony vypadne doklad", () => {
    for (const z of naStranke) {
      for (const [pripona, obsah] of Object.entries(UKAZKY[z.id])) {
        const riadky = parseVendorFile(z.id as never, `export${pripona}`, bajty(obsah));
        /* Prázdny zoznam z mPohody je platná odpoveď — hlavne nech nespadne. */
        if (obsah === "[]") {
          expect(riadky, `${z.id} ${pripona}`).toEqual([]);
          continue;
        }
        expect(riadky[0]?.invoice_number, `${z.id} ${pripona}`).toBe("F1");
      }
    }
  });
});
