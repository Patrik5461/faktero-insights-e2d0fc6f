/**
 * Zoznamy FS SR — rozbalenie ZIP, index a hľadanie s podvrhnutým `fetch`.
 * Na skutočnú Finančnú správu sa nevolá.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { hladajVZoznamochFs, indexZoZipu, zabudniIndexyFs } from "./platitel-dph-fs.server";

const xmlDphs = (polozky: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<ZoznamSubjektovRegistrovanychkDPH>\n  <DatumAktualizacieZoznamu>30102026</DatumAktualizacieZoznamu>\n  <DS_DPHS>${polozky}</DS_DPHS>\n</ZoznamSubjektovRegistrovanychkDPH>`;
const itemDphs = (ico: string, ic: string, druh: string, nazov = "Firma s. r. o.") =>
  `<ITEM><IC_DPH>${ic}</IC_DPH><ICO>${ico}</ICO><NAZOV_DS>${nazov}</NAZOV_DS><STAT>Slovensko</STAT><DRUH_REG_DPH>${druh}</DRUH_REG_DPH><DATUM_REG>01.08.1998</DATUM_REG><PLAT_DPH_OD>01.08.1998</PLAT_DPH_OD></ITEM>`;
const xmlZrus = (koren: string, polozky: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><${koren}><DatumAktualizacieZoznamu>30102026</DatumAktualizacieZoznamu><DS>${polozky}</DS></${koren}>`;

const zip = (meno: string, xml: string) =>
  zipSync({ [`${meno}.xml`]: strToU8(xml), [`${meno}.xsd`]: strToU8("<xs:schema/>") });

describe("indexZoZipu", () => {
  it("vyberie riadky a dátum zoznamu, diakritika a entity ostanú", () => {
    const z = zip(
      "ds_dphs",
      xmlDphs(
        itemDphs("31333532", "SK2020317068", "§4", "ESET, spol. s r.o.") +
          itemDphs("56607016", "SK2122358579", "§7", "Tobify &amp; spol. – Žilina"),
      ),
    );
    const idx = indexZoZipu(z, "ds_dphs");
    expect(idx.datum).toBe("2026-10-30");
    expect(idx.text.split("\n").filter(Boolean)).toEqual([
      "31333532\tSK2020317068\t§4\t01.08.1998\t01.08.1998\t\tESET, spol. s r.o.",
      "56607016\tSK2122358579\t§7\t01.08.1998\t01.08.1998\t\tTobify & spol. – Žilina",
    ]);
  });

  it("prázdny zoznam je chyba, nie prázdny register", () => {
    expect(() => indexZoZipu(zip("ds_dphs", xmlDphs("")), "ds_dphs")).toThrow(/prázdny/);
  });
});

describe("hladajVZoznamochFs", () => {
  let dir: string;
  const volania: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fs-dph-test-"));
    process.env.FAKTERO_CACHE_DIR = dir;
    zabudniIndexyFs();
    volania.length = 0;
    const subory: Record<string, Uint8Array> = {
      ds_dphs: zip("ds_dphs", xmlDphs(itemDphs("31333532", "SK2020317068", "§4"))),
      ds_dphz: zip(
        "ds_dphz",
        xmlZrus(
          "Z",
          "<ITEM><IC_DPH>SK2020317068</IC_DPH><NAZOV>ESET</NAZOV><ROK_PORUSENIA>2025</ROK_PORUSENIA><DAT_ZVEREJNENIA>20.03.2026</DAT_ZVEREJNENIA><ICO>31333532</ICO></ITEM>",
        ),
      ),
      ds_dphv: zip(
        "ds_dphv",
        xmlZrus(
          "V",
          "<ITEM><IC_DPH>SK1020000938</IC_DPH><NAZOV>Sopko</NAZOV><DAT_VYMAZU>11.02.2022</DAT_VYMAZU><ICO>35343630</ICO></ITEM>",
        ),
      ),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const meno = String(url).match(/(ds_\w+)\.zip/)![1];
        volania.push(meno);
        if ((init?.headers as any)?.["if-none-match"] === `"${meno}-1"`)
          return new Response(null, { status: 304 });
        return new Response(subory[meno] as unknown as BodyInit, {
          status: 200,
          headers: { etag: `"${meno}-1"` },
        });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.FAKTERO_CACHE_DIR;
  });

  it("nájde firmu vo všetkých troch zoznamoch a stiahne každý raz", async () => {
    const n = await hladajVZoznamochFs("31333532", null);
    expect(n.dphs.map((z) => z.druh)).toEqual(["§4"]);
    expect(n.dphz.map((z) => z.rokPorusenia)).toEqual(["2025"]);
    expect(n.dphv).toEqual([]);
    expect(n.zoznamK).toBe("2026-10-30");
    const v = await hladajVZoznamochFs("35343630", null);
    expect(v.dphs).toEqual([]);
    expect(v.dphv.map((z) => z.vymazane)).toEqual(["11.02.2022"]);
    expect(volania.sort()).toEqual(["ds_dphs", "ds_dphv", "ds_dphz"]);
  });

  it("po reštarte vezme index z disku a stiahne len pri zmene (ETag)", async () => {
    await hladajVZoznamochFs("31333532", null);
    zabudniIndexyFs();
    const n = await hladajVZoznamochFs(null, "SK2020317068");
    expect(n.dphs).toHaveLength(1);
    // Index z disku je čerstvý — FS sa znova nepýta.
    expect(volania).toHaveLength(3);
  });

  it("výpadok FS bez indexu je chyba", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("chyba", { status: 503 })),
    );
    await expect(hladajVZoznamochFs("31333532", null)).rejects.toThrow(/503/);
  });
});
