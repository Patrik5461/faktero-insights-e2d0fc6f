/*
  Konektor do POHODY — potvrdenie dávky (audit exportov 14. 11. 2026):
   - K3: doklad je odovzdaný až po odpovedi POHODY; odmietnutý celý balík,
     chýbajúca odpoveď a vypršaná dávka ho vrátia do fronty;
   - V12: odpoveď na storno (`<id>-storno`) sa spáruje;
   - V13: oprava odovzdaného dokladu ide až po storne pôvodného (alebo po
     potvrdení zmazania) — storno sa overuje proti XSD Stormware.
*/
import { describe, expect, it } from "vitest";
import { buildPohodaDavkaXml, buildPohodaExpensesXml, buildPohodaCashXml } from "./export.server";
import {
  blokPolozky,
  idPoloziekDavky,
  idStornaOpravy,
  jeVyprsana,
  polozkyZDavky,
  pridajPolozky,
  rozhodnutieOpravy,
  stornoOpravyXml,
  type RiadokKonektora,
} from "./pohoda-konektor-davka";
import {
  odmietniPoslednuDavku,
  opravyVDavke,
  spracujPolozkyOdpovede,
  vyprsNepotvrdene,
  zapisDavku,
} from "./pohoda-konektor-potvrdenie.server";
import { rozoberBalikOdpovede } from "./pohoda-odpoved";
import { davkovySubor, holeId } from "./pohoda-konektor.server";

const XML_LIB = "../../../e2e/lib/xml.mjs";
async function chybaXsd(xml: string): Promise<string | null> {
  const { overXsd, SCHEMY } = await import(/* @vite-ignore */ XML_LIB);
  return overXsd(xml, SCHEMY.pohoda);
}

/* ------------------------------------------------------------------ falošná databáza */

type Riadok = Record<string, any>;

/** Pamäťová náhrada klienta Supabase — len to, čo konektor používa. */
function databaza(tabulky: Record<string, Riadok[]>) {
  let n = 0;
  const db: Record<string, Riadok[]> = tabulky;
  const from = (t: string) => {
    db[t] ??= [];
    const filtre: ((r: Riadok) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let hodnoty: any = null;
    let onConflict: string[] = [];
    let limit = Infinity;
    let poradie: { k: string; asc: boolean } | null = null;
    let vratit = false;
    const orFilter = (s: string) => {
      const casti = s.split(",").map((c) => c.split("."));
      return (r: Riadok) =>
        casti.some(([k, o, v]) => (o === "is" && v === "null" ? r[k!] == null : o === "eq" ? String(r[k!]) === v : false));
    };
    const q: any = {
      select: () => ((vratit = op !== "select"), q),
      insert: (v: any) => ((op = "insert"), (hodnoty = v), q),
      update: (v: any) => ((op = "update"), (hodnoty = v), q),
      upsert: (v: any, o?: { onConflict?: string }) => (
        (op = "upsert"), (hodnoty = v), (onConflict = (o?.onConflict ?? "id").split(",")), q
      ),
      delete: () => ((op = "delete"), q),
      eq: (k: string, v: any) => (filtre.push((r) => String(r[k]) === String(v)), q),
      neq: (k: string, v: any) => (filtre.push((r) => String(r[k]) !== String(v)), q),
      in: (k: string, v: any[]) => (filtre.push((r) => v.map(String).includes(String(r[k]))), q),
      is: (k: string, v: null) => (filtre.push((r) => r[k] == v), q),
      gte: (k: string, v: any) => (filtre.push((r) => String(r[k]) >= String(v)), q),
      lt: (k: string, v: any) => (filtre.push((r) => String(r[k]) < String(v)), q),
      gt: (k: string, v: any) => (filtre.push((r) => Number(r[k]) > Number(v)), q),
      not: () => q,
      or: (s: string) => (filtre.push(orFilter(s)), q),
      order: (k: string, o?: { ascending?: boolean }) => ((poradie ??= { k, asc: o?.ascending !== false }), q),
      limit: (l: number) => ((limit = l), q),
      range: () => q,
      single: () => vykonaj().then((r: any) => ({ data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error })),
      maybeSingle: () =>
        vykonaj().then((r: any) => ({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error })),
      then: (ok: any, zle: any) => vykonaj().then(ok, zle),
    };
    const sedi = (r: Riadok) => filtre.every((f) => f(r));
    async function vykonaj() {
      const tab = db[t]!;
      if (op === "insert" || op === "upsert") {
        const nove: Riadok[] = (Array.isArray(hodnoty) ? hodnoty : [hodnoty]).map((v: Riadok) => ({
          id: v.id ?? `id-${++n}`,
          created_at: v.created_at ?? new Date(Date.now() + n).toISOString(),
          ...v,
        }));
        for (const r of nove) {
          if (op === "upsert") {
            const i = tab.findIndex((x) => onConflict.every((k) => String(x[k]) === String(r[k])));
            if (i >= 0) {
              tab[i] = { ...tab[i], ...r, id: tab[i]!.id };
              continue;
            }
          }
          tab.push(r);
        }
        return { data: nove, error: null };
      }
      if (op === "update") {
        const zasiahnute = tab.filter(sedi);
        for (const r of zasiahnute) Object.assign(r, hodnoty);
        return { data: vratit ? zasiahnute.map((r) => ({ ...r })) : null, error: null };
      }
      if (op === "delete") {
        db[t] = tab.filter((r) => !sedi(r));
        return { data: null, error: null };
      }
      let out = tab.filter(sedi).map((r) => ({ ...r }));
      if (poradie) {
        const { k, asc } = poradie;
        out.sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0) * (asc ? 1 : -1));
      }
      out = out.slice(0, limit);
      return { data: out, error: null, count: out.length };
    }
    return q;
  };
  return { from, db };
}

/* ------------------------------------------------------------------ vzorové doklady */

const FIRMA = "c0000000-0000-0000-0000-000000000001";
const firma: any = { id: FIRMA, ico: "36123456", dic: "2020123456", ic_dph: "SK2020123456", vat_payer: true, country: "SK" };
const FA = "11111111-1111-1111-1111-111111111111";
const PF = "22222222-2222-2222-2222-222222222222";
const ZR = "33333333-3333-3333-3333-333333333333";
const POK = "44444444-4444-4444-4444-444444444444";

const faktura: any = {
  id: FA,
  invoice_number: "20260001",
  type: "regular",
  issue_date: "2026-11-04",
  delivery_date: "2026-11-04",
  due_date: "2026-11-18",
  currency: "EUR",
  subtotal: 100,
  vat_total: 23,
  total: 123,
  customer_name: "Odberateľ s.r.o.",
};
const polozka = { name: "Práca", quantity: 1, unit: "ks", unit_price: 100, vat_rate: 23, subtotal: 100, vat_amount: 23, total: 123 };
const prijata: any = {
  id: PF,
  supplier_name: "Dodávateľ s.r.o.",
  supplier_ico: "12345678",
  document_number: "FV-77",
  issue_date: "2026-11-03",
  delivery_date: "2026-11-03",
  net_amount: 100,
  vat_amount: 23,
  total_amount: 123,
  currency: "EUR",
  vat_rate: 23,
  _agenda: "prijata",
};

function davka(extra: { storna?: any[] } = {}) {
  return buildPohodaDavkaXml({
    company: firma,
    invoices: [{ invoice: faktura, items: [polozka] as any }],
    doklady: [],
    pohyby: [],
    storna: extra.storna,
  });
}

/* ------------------------------------------------------------------ K3: zápis dávky */

describe("K3 — stiahnutie dávky doklad neoznačí", () => {
  it("položky sa berú z hotového XML, storno má vlastnú položku", () => {
    const xml = davka({ storna: [{ id: ZR, cislo: "260148" }] });
    const p = polozkyZDavky(xml, { faktury: [{ id: FA, verzia: 0 }], storna: [{ id: ZR }] }, "2026-11-14T00:00:00Z");
    expect(p).toEqual([
      { polozka_id: FA, druh: "faktura", zaznam_id: FA, verzia: "0" },
      { polozka_id: `${ZR}-storno`, druh: "storno", zaznam_id: ZR, verzia: "2026-11-14T00:00:00Z" },
    ]);
  });

  it("doklad, ktorý generátor vynechal, sa nezapíše ako odoslaný", () => {
    const xml = davka();
    const p = polozkyZDavky(xml, { faktury: [{ id: FA, verzia: 0 }], prijate: [{ id: PF, verzia: 0 }] }, "t");
    expect(p.map((x) => x.zaznam_id)).toEqual([FA]);
  });

  it("príjemka s viacerými pohybmi zapíše každý pohyb pod jednou položkou", () => {
    const xml = `<dat:dataPack><dat:dataPackItem id="${POK}" version="2.0"></dat:dataPackItem>\n</dat:dataPack>`;
    const p = polozkyZDavky(
      xml,
      { pohyby: [{ id: POK, pohyby: [{ id: POK, verzia: "a" }, { id: ZR, verzia: "b" }] }] },
      "t",
    );
    expect(p.map((x) => [x.polozka_id, x.zaznam_id])).toEqual([
      [POK, POK],
      [POK, ZR],
    ]);
  });

  it("dávka je `cakajuce`, faktúra v histórii `cakajuce` (nie ok) a doklady sa neoznačia", async () => {
    const sb = databaza({ purchase_invoices: [{ id: PF, company_id: FIRMA, exported_at: null }] });
    const xml = davka();
    const job = await zapisDavku(sb as any, {
      companyId: FIRMA,
      od: "2026-10-01",
      xml,
      polozky: polozkyZDavky(xml, { faktury: [{ id: FA, verzia: 0 }] }, "t"),
      faktury: [faktura],
      cislaPreskocenych: new Set(),
      preskocene: [],
      pocetFaktur: 1,
      bezPotvrdenia: [],
    });
    expect(sb.db.export_jobs![0]).toMatchObject({ id: job, status: "cakajuce", file_name: "pohoda-davka.xml" });
    expect(sb.db.export_logs).toEqual([expect.objectContaining({ invoice_id: FA, status: "cakajuce" })]);
    expect(sb.db.pohoda_konektor_polozky).toEqual([
      expect.objectContaining({ polozka_id: FA, druh: "faktura", stav: "odoslane", export_job_id: job }),
    ]);
    expect(sb.db.purchase_invoices![0]!.exported_at).toBeNull();
  });
});

/* ------------------------------------------------------------------ K3/V12: odpoveď */

const odpoved = (polozky: string, stav = "ok", poznamka = "") => `<?xml version="1.0" encoding="Windows-1250"?>
<rsp:responsePack version="2.0" id="FAKTERO" state="${stav}" note="${poznamka}" programVersion="14400" ico="36123456"
  xmlns:rsp="http://www.stormware.cz/schema/version_2/response.xsd"
  xmlns:rdc="http://www.stormware.cz/schema/version_2/documentresponse.xsd"
  xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd">${polozky}
</rsp:responsePack>`;
const ok = (id: string, cislo: string) => `
  <rsp:responsePackItem version="2.0" id="${id}" state="ok">
    <inv:invoiceResponse version="2.0" state="ok">
      <rdc:producedDetails><rdc:id>1</rdc:id><rdc:number>${cislo}</rdc:number></rdc:producedDetails>
    </inv:invoiceResponse>
  </rsp:responsePackItem>`;
const zle = (id: string, text: string) => `
  <rsp:responsePackItem version="2.0" id="${id}" state="error">
    <inv:invoiceResponse version="2.0" state="error">
      <rdc:importDetails><rdc:detail><rdc:state>error</rdc:state><rdc:errno>108</rdc:errno><rdc:note>${text}</rdc:note></rdc:detail></rdc:importDetails>
    </inv:invoiceResponse>
  </rsp:responsePackItem>`;

async function pripravenaDavka() {
  const sb = databaza({
    purchase_invoices: [{ id: PF, company_id: FIRMA, exported_at: null, pohoda_verzia: null }],
    pohoda_odoslane: [],
  });
  const xml = pridajPolozky(
    davka({ storna: [{ id: ZR, cislo: "260148" }] }),
    `\n  <dat:dataPackItem id="${PF}" version="2.0"></dat:dataPackItem>`,
  );
  const job = await zapisDavku(sb as any, {
    companyId: FIRMA,
    od: "2026-10-01",
    xml,
    polozky: polozkyZDavky(
      xml,
      { faktury: [{ id: FA, verzia: 0 }], prijate: [{ id: PF, verzia: null }], storna: [{ id: ZR }] },
      "2026-11-14T00:00:00Z",
    ),
    faktury: [faktura],
    cislaPreskocenych: new Set(),
    preskocene: [],
    pocetFaktur: 1,
    bezPotvrdenia: [],
  });
  return { sb, job };
}

describe("K3 — odovzdané až po odpovedi POHODY", () => {
  it("potvrdené položky sa označia, odmietnutá faktúra ostane vo fronte s dôvodom", async () => {
    const { sb, job } = await pripravenaDavka();
    const r = await spracujPolozkyOdpovede(sb as any, {
      companyId: FIRMA,
      balik: rozoberBalikOdpovede(odpoved(zle(FA, "Neznáma predkontácia") + ok(PF, "PF0012") + ok(`${ZR}-storno`, "ST01"))),
    });
    expect(r.zalozenych).toBe(2);
    expect(sb.db.export_logs![0]).toMatchObject({ status: "error", pohoda_stav: "error" });
    expect(String(sb.db.export_logs![0]!.error)).toContain("Neznáma predkontácia");
    expect(sb.db.purchase_invoices![0]).toMatchObject({ export_job_id: job, pohoda_cislo: "PF0012" });
    expect(sb.db.purchase_invoices![0]!.exported_at).toBeTruthy();
    // V12: storno sa spárovalo a zapísalo ako vybavené.
    expect(sb.db.pohoda_odoslane).toEqual([expect.objectContaining({ agenda: "storno", zaznam_id: ZR })]);
    expect(sb.db.export_jobs![0]!.status).toBe("completed");
  });

  it("V12 — odmietnuté storno sa nestratí: ostane vo fronte a medzi chybami", async () => {
    const { sb } = await pripravenaDavka();
    const r = await spracujPolozkyOdpovede(sb as any, {
      companyId: FIRMA,
      balik: rozoberBalikOdpovede(odpoved(ok(FA, "20260001") + ok(PF, "PF1") + zle(`${ZR}-storno`, "Doklad nenájdený"))),
    });
    expect(r.chyby.join(" ")).toContain("Doklad nenájdený");
    expect(sb.db.pohoda_odoslane).toEqual([]);
    expect(sb.db.pohoda_konektor_polozky!.find((x) => x.druh === "storno")).toMatchObject({ stav: "chyba" });
    expect(sb.db.export_logs![0]).toMatchObject({ status: "ok", pohoda_cislo: "20260001" });
  });

  it("POHODA odmietla celý balík (zlé heslo) — nič sa neoznačí, všetko ide znova", async () => {
    const { sb } = await pripravenaDavka();
    const r = await spracujPolozkyOdpovede(sb as any, {
      companyId: FIRMA,
      balik: rozoberBalikOdpovede(odpoved("", "error", "Chyba prihlásenia")),
    });
    expect(r.chybaBaliku).toContain("Chyba prihlásenia");
    expect(sb.db.export_logs![0]!.status).toBe("error");
    expect(sb.db.purchase_invoices![0]!.exported_at).toBeNull();
    expect(sb.db.pohoda_konektor_polozky!.every((x) => x.stav === "chyba")).toBe(true);
    expect(sb.db.export_jobs![0]!.status).toBe("error");
  });

  it("položka, o ktorej odpoveď mlčí (odrezaný súbor), sa vráti do fronty", async () => {
    const { sb } = await pripravenaDavka();
    await spracujPolozkyOdpovede(sb as any, { companyId: FIRMA, balik: rozoberBalikOdpovede(odpoved(ok(FA, "1"))) });
    expect(sb.db.purchase_invoices![0]!.exported_at).toBeNull();
    expect(sb.db.pohoda_konektor_polozky!.find((x) => x.druh === "prijata")).toMatchObject({ stav: "chyba" });
  });

  it("odpoveď neprišla vôbec — konektor to nahlási a dávka sa vráti hneď", async () => {
    const { sb } = await pripravenaDavka();
    const r = await odmietniPoslednuDavku(sb as any, FIRMA, "POHODA nevrátila žiadnu odpoveď");
    expect(r.vratenych).toBe(3);
    expect(sb.db.export_logs![0]!.status).toBe("error");
  });

  it("bez odpovede do limitu dávka vyprší; neskorá odpoveď ju aj tak potvrdí", async () => {
    const { sb } = await pripravenaDavka();
    sb.db.export_jobs![0]!.created_at = "2026-11-14T00:00:00Z";
    expect(jeVyprsana("2026-11-14T00:00:00Z", new Date("2026-11-14T05:00:00Z"))).toBe(false);
    expect(await vyprsNepotvrdene(sb as any, FIRMA, new Date("2026-11-14T07:00:00Z"))).toBe(3);
    expect(sb.db.pohoda_konektor_polozky!.every((x) => x.stav === "vyprsane")).toBe(true);
    expect(sb.db.export_logs![0]!.status).toBe("error");
    // Neskorá odpoveď (alebo recordDuplicity pri ďalšej dávke) doklad označí.
    await spracujPolozkyOdpovede(sb as any, { companyId: FIRMA, balik: rozoberBalikOdpovede(odpoved(ok(FA, "20260001"))) });
    expect(sb.db.export_logs![0]!.status).toBe("ok");
  });

  it("položka mimo dávok konektora sa nespáruje so žiadnym dokladom", async () => {
    const { sb } = await pripravenaDavka();
    const r = await spracujPolozkyOdpovede(sb as any, {
      companyId: FIRMA,
      balik: rozoberBalikOdpovede(odpoved(ok("99999999-9999-9999-9999-999999999999", "X"))),
    });
    expect(r.nezname).toBe(1);
    expect(r.nesparovane.map((v) => v.id)).toEqual(["99999999-9999-9999-9999-999999999999"]);
  });

  it("holé id rozpozná aj storno", () => {
    expect(holeId(`${ZR}-storno`)).toBe(ZR);
    expect(holeId(`${ZR}-2`)).toBe(ZR);
  });
});

describe("K3 — konektor u účtovníčky hlási chýbajúcu odpoveď", () => {
  const cmd = davkovySubor({ adresa: "https://www.faktero.sk" });
  it("bez odpovede POHODY zavolá Faktero, nech doklady vráti do fronty", () => {
    expect(cmd).toContain("bez_odpovede=1");
    expect(cmd).toMatch(/dir \/b "%ODPOVED%\\\*\.xml" >nul 2>&1 \|\| \(/);
  });
  it("odrezanú dávku do POHODY nepustí", () => {
    expect(cmd).toContain('findstr /c:"</dat:dataPack>" "%SUBOR%"');
  });
});

/* ------------------------------------------------------------------ V13: oprava */

const r = (x: Partial<RiadokKonektora>): RiadokKonektora => ({
  export_job_id: "job1",
  polozka_id: PF,
  druh: "prijata",
  zaznam_id: PF,
  verzia: "0",
  stav: "ok",
  pohoda_cislo: "PF0012",
  created_at: "2026-11-01T00:00:00Z",
  ...x,
});

describe("V13 — oprava odovzdaného dokladu", () => {
  it("nový doklad (verzia 0) ide rovno", () => {
    expect(rozhodnutieOpravy({ druh: "prijata", verzia: 0, riadky: [], cislo: "FV-77" }).akcia).toBe("poslat");
  });

  it("prijatá s potvrdeným číslom: najprv storno pôvodnej verzie, oprava až po ňom", () => {
    const d = rozhodnutieOpravy({ druh: "prijata", verzia: 1, riadky: [r({})], cislo: "FV-77" });
    expect(d).toMatchObject({ akcia: "storno", cislo: "PF0012", predoslaVerzia: "0" });
    const caka = rozhodnutieOpravy({
      druh: "prijata",
      verzia: 1,
      riadky: [r({}), r({ druh: "storno_opravy", polozka_id: idStornaOpravy(PF, 0), stav: "odoslane", created_at: "2026-11-02T00:00:00Z" })],
      cislo: "FV-77",
    });
    expect(caka.akcia).toBe("cakat");
    const ide = rozhodnutieOpravy({
      druh: "prijata",
      verzia: 1,
      riadky: [r({}), r({ druh: "storno_opravy", stav: "ok", created_at: "2026-11-02T00:00:00Z" })],
      cislo: "FV-77",
    });
    expect(ide.akcia).toBe("poslat");
  });

  it("odmietnuté storno doklad zadrží a ponúkne potvrdenie zmazania", () => {
    const d = rozhodnutieOpravy({
      druh: "prijata",
      verzia: 1,
      riadky: [r({}), r({ druh: "storno_opravy", stav: "chyba", chyba: "Doklad nenájdený", created_at: "2026-11-02T00:00:00Z" })],
      cislo: "FV-77",
    });
    expect(d).toMatchObject({ akcia: "drzat", potvrditZmazanie: true });
    expect((d as any).dovod).toContain("Doklad nenájdený");
  });

  it("číslo v POHODE nepoznáme (išiel súborom) — drží sa do potvrdenia zmazania", () => {
    const d = rozhodnutieOpravy({ druh: "doklad", verzia: 1, riadky: [], cislo: "FV-77" });
    expect(d).toMatchObject({ akcia: "drzat", povodneCislo: null, potvrditZmazanie: true });
    const potvrdene = rozhodnutieOpravy({
      druh: "doklad",
      verzia: 1,
      riadky: [r({ druh: "zmazane_v_pohode", verzia: "1", export_job_id: null })],
      cislo: "FV-77",
    });
    expect(potvrdene.akcia).toBe("poslat");
    // Potvrdenie staršej verzie neplatí pre ďalšie vrátenie.
    const stare = rozhodnutieOpravy({
      druh: "doklad",
      verzia: 2,
      riadky: [r({ druh: "zmazane_v_pohode", verzia: "1", export_job_id: null })],
      cislo: "FV-77",
    });
    expect(stare.akcia).toBe("drzat");
  });

  it("vydaná faktúra sa nestornuje (číslo by sa neuvoľnilo) — čaká na zmazanie v POHODE", () => {
    const d = rozhodnutieOpravy({
      druh: "faktura",
      verzia: 1,
      riadky: [r({ druh: "faktura", polozka_id: FA, zaznam_id: FA, pohoda_cislo: "20260001" })],
      cislo: "20260001",
      cisloVPohode: "20260001",
    });
    expect(d).toMatchObject({ akcia: "drzat", povodneCislo: "20260001" });
  });

  it("storno prijatej faktúry je v agende pôvodného dokladu a prejde schémou", async () => {
    const povodne = buildPohodaExpensesXml({ company: firma, doklady: [prijata], nastavenia: {} as any });
    const id = idPoloziekDavky(povodne)[0]!;
    const blok = blokPolozky(povodne, id)!;
    expect(blok).toContain("<inv:invoiceType>");
    const st = stornoOpravyXml({ id: idStornaOpravy(PF, 0), cislo: "PF0012", povodnyBlok: blok })!;
    expect(st).toContain("<inv:cancelDocument>");
    expect(st).toContain("<typ:number>PF0012</typ:number>");
    const typ = /<inv:invoiceType>(\w+)</.exec(blok)![1];
    expect(st).toContain(`<inv:invoiceType>${typ}</inv:invoiceType>`);
    const xml = pridajPolozky(buildPohodaDavkaXml({ company: firma, invoices: [], doklady: [], pohyby: [] }), st);
    expect(await chybaXsd(xml)).toBeNull();
    // Overovačka chybu naozaj nájde (nezmyselný element v hlavičke).
    expect(await chybaXsd(xml.replace("<inv:text>", "<inv:nezmysel>1</inv:nezmysel><inv:text>"))).not.toBeNull();
  });

  it("storno pokladničného dokladu ide ako storno vo voucher a prejde schémou", async () => {
    const povodne = buildPohodaCashXml({
      company: firma,
      pohyby: [
        { id: POK, entry_number: "P001", entry_date: "2026-11-03", type: "vydaj", amount: 12.5, description: "Poštovné" },
      ] as any,
      nastavenia: { pokladna: "HP" } as any,
    });
    const blok = blokPolozky(povodne, idPoloziekDavky(povodne)[0]!)!;
    const st = stornoOpravyXml({ id: idStornaOpravy(POK, 0), cislo: "HP0005", povodnyBlok: blok })!;
    expect(st).toContain("<vch:cancelDocument>");
    expect(st).toContain("<vch:cashAccount><typ:ids>HP</typ:ids></vch:cashAccount>");
    const xml = pridajPolozky(buildPohodaDavkaXml({ company: firma, invoices: [], doklady: [], pohyby: [] }), st);
    expect(await chybaXsd(xml)).toBeNull();
  });

  it("interný doklad sa cez XML stornovať nedá", () => {
    expect(stornoOpravyXml({ id: "x", cislo: "1", povodnyBlok: "<int:intDoc version=\"2.0\"></int:intDoc>" })).toBeNull();
  });

  it("dávka s opravou: pôvodná verzia sa stornuje z jej vlastnej dávky, oprava sa zatiaľ vyradí", async () => {
    const povodne = buildPohodaExpensesXml({ company: firma, doklady: [prijata], nastavenia: {} as any });
    const sb = databaza({
      export_jobs: [{ id: "job1", company_id: FIRMA, file_content: povodne }],
      pohoda_konektor_polozky: [
        { ...r({ polozka_id: idPoloziekDavky(povodne)[0]! }), company_id: FIRMA },
      ],
    });
    const o = await opravyVDavke(
      sb as any,
      FIRMA,
      [{ druh: "prijata", riadok: { id: PF, pohoda_verzia: 1 }, cislo: "FV-77" }],
      new Map(),
    );
    expect([...o.vyradit]).toEqual([PF]);
    expect(o.stornaOprav).toEqual([{ id: PF, predoslaVerzia: "0" }]);
    expect(o.stornaXml).toContain(`id="${PF}-0-storno"`);
    // Položka storna sa v dávke zapíše ako `storno_opravy` a odpoveď ju spáruje.
    const xml = pridajPolozky(buildPohodaDavkaXml({ company: firma, invoices: [], doklady: [], pohyby: [] }), o.stornaXml);
    expect(polozkyZDavky(xml, { stornaOprav: o.stornaOprav }, "t")).toEqual([
      { polozka_id: `${PF}-0-storno`, druh: "storno_opravy", zaznam_id: PF, verzia: "0" },
    ]);
  });
});

/* ------------------------------------------------------------------ V11: neskoro zadané */

describe("V11 — neskoro zadané doklady", () => {
  it("konektor berie od mesiaca pred svojím prvým spustením, nie od minulého mesiaca", async () => {
    const { zaciatokKonektora } = await import("./pohoda-konektor.server");
    const sb = databaza({
      export_jobs: [
        { id: "j2", company_id: FIRMA, file_name: "pohoda-davka.xml", created_at: "2026-09-20T02:00:00Z" },
        { id: "j1", company_id: FIRMA, file_name: "pohoda-davka.xml", created_at: "2026-08-15T02:00:00Z" },
      ],
    });
    // V novembri by staré okno („od 1. 10.“) bloček z augusta zadaný dnes nikdy neposlalo.
    expect(await zaciatokKonektora(sb as any, FIRMA, new Date("2026-11-14T00:00:00Z"))).toBe("2026-07-01");
    const nova = databaza({ export_jobs: [] });
    expect(await zaciatokKonektora(nova as any, FIRMA, new Date("2026-11-14T00:00:00Z"))).toBe("2026-10-01");
  });

  it("mesačný cron pribalí neodovzdané z predošlých mesiacov — od prvého odovzdania, najviac rok", async () => {
    const { hranicaNeskoroZadanych } = await import("./odovzdanie.server");
    const sb = databaza({
      export_jobs: [{ id: "j", company_id: FIRMA, target_system: "pohoda", date_from: "2026-06-01" }],
    });
    expect(await hranicaNeskoroZadanych(sb as any, FIRMA, "2026-10-01")).toBe("2026-06-01");
    const dlho = databaza({
      export_jobs: [{ id: "j", company_id: FIRMA, target_system: "pohoda", date_from: "2024-01-01" }],
    });
    expect(await hranicaNeskoroZadanych(dlho as any, FIRMA, "2026-10-01")).toBe("2025-10-01");
    // Firma, ktorá ešte nič neodovzdala, nedostane do balíka históriu spred Faktera.
    expect(await hranicaNeskoroZadanych(databaza({ export_jobs: [] }) as any, FIRMA, "2026-10-01")).toBe("2026-10-01");
  });
});

/* ------------------------------------------------- balík: upozornenia ako pri ručnom exporte */

describe("balík ukáže upozornenia k prijatým", () => {
  it("v pohoda-skontrolovat.txt sú závažné aj upozornenia", async () => {
    const { suborSkontrolovat } = await import("./odovzdanie.server");
    expect(suborSkontrolovat([], [])).toBeNull();
    const t = suborSkontrolovat([], ["FV-77 — DPH 30,5 % — taká sadzba DPH neexistuje"])!;
    expect(t).toContain("Upozornenia — po importe skontrolujte v Pohode:");
    expect(t).toContain("- FV-77 — DPH 30,5 %");
    expect(suborSkontrolovat(["A — zlé"], ["B — pozor"])).toMatch(/závažnej chybe[\s\S]*- A — zlé[\s\S]*Upozornenia[\s\S]*- B — pozor/);
  });

  it("konektor zadrží prijatú s upozornením (nemá kto potvrdiť)", async () => {
    const { varovaniaPrijatejPredExportom } = await import("./export-varovania");
    // Tempus-Car: DPH 30,5 % zo základu — ručný export by sa spýtal, konektor doklad nepošle.
    const p = {
      id: PF,
      invoice_number: "40260037",
      type: "regular",
      amount_without_vat: 45914.31,
      vat_amount: 14005.69,
      zauctovane_at: "2026-11-01",
      pohoda_predkontacia: "1Pn",
    };
    expect(varovaniaPrijatejPredExportom(p, firma, {})[0]).toMatch(/^40260037 — /);
  });
});

describe("V12 — odpoveď na mesačný balík (doklady mimo dávky konektora)", () => {
  it("odmietnuté storno z balíka sa vráti do fronty, faktúra dostane číslo z POHODY", async () => {
    const { spracujOdpoved } = await import("./pohoda-konektor.server");
    const sb = databaza({
      pohoda_konektor_polozky: [],
      export_logs: [{ id: "l1", company_id: FIRMA, invoice_id: FA, status: "ok", created_at: "2026-11-01" }],
      pohoda_odoslane: [{ company_id: FIRMA, agenda: "storno", zaznam_id: ZR, verzia: "x" }],
      expense_documents: [],
      purchase_invoices: [],
      cash_entries: [],
      companies: [{ id: FIRMA, pohoda_nacitat_ciselniky: false }],
    });
    const r = await spracujOdpoved(sb as any, {
      companyId: FIRMA,
      xml: odpoved(ok(FA, "FA2026001") + zle(`${ZR}-storno`, "Doklad nebol nájdený")),
    });
    expect(r.chybnych).toBe(1);
    expect(sb.db.export_logs![0]).toMatchObject({ status: "ok", pohoda_cislo: "FA2026001" });
    // Storno sa nepriradilo k faktúre ZR ako číslo — vrátilo sa do fronty.
    expect(sb.db.pohoda_odoslane).toEqual([]);
  });
});

/* ------------------------------------------------- bankové pohyby (pohoda_posielat_banku) */

describe("bankové pohyby v dávke konektora", () => {
  const BT = "55555555-5555-5555-5555-555555555555";
  const BT2 = "66666666-6666-6666-6666-666666666666";
  const bnk = (id: string) => `\n  <dat:dataPackItem id="BNK-${id}" version="2.0"></dat:dataPackItem>`;

  async function davkaSBankou() {
    const sb = databaza({
      bank_transactions: [
        { id: BT, company_id: FIRMA, exported_at: null },
        { id: BT2, company_id: FIRMA, exported_at: null },
      ],
      pohoda_odoslane: [],
    });
    const xml = pridajPolozky(davka(), bnk(BT) + bnk(BT2));
    const polozky = polozkyZDavky(
      xml,
      { faktury: [{ id: FA, verzia: 0 }], banka: [{ id: BT, verzia: "2026-11-02T08:00:00Z" }, { id: BT2, verzia: null }] },
      "t",
    );
    const job = await zapisDavku(sb as any, {
      companyId: FIRMA,
      od: "2026-10-01",
      xml,
      polozky,
      faktury: [faktura],
      cislaPreskocenych: new Set(),
      preskocene: [],
      pocetFaktur: 1,
      bezPotvrdenia: [],
    });
    return { sb, job, polozky };
  }

  it("pohyb sa zapíše ako položka druhu banka pod `BNK-<id>`", async () => {
    const { polozky, sb } = await davkaSBankou();
    expect(polozky.filter((p) => p.druh === "banka")).toEqual([
      { polozka_id: `BNK-${BT}`, druh: "banka", zaznam_id: BT, verzia: "2026-11-02T08:00:00Z" },
      { polozka_id: `BNK-${BT2}`, druh: "banka", zaznam_id: BT2, verzia: null },
    ]);
    // Pri stiahnutí sa pohyb neoznačí — je len na ceste.
    expect(sb.db.bank_transactions!.every((t) => !t.exported_at)).toBe(true);
    const { cakajuceZaznamy } = await import("./pohoda-konektor-potvrdenie.server");
    expect([...((await cakajuceZaznamy(sb as any, FIRMA)).get("banka") ?? [])].sort()).toEqual([BT, BT2]);
  });

  it("potvrdený pohyb (ok aj duplicita) je odovzdaný s číslom z POHODY, odmietnutý ostane vo fronte", async () => {
    const { sb, job } = await davkaSBankou();
    const duplicita = (id: string) => `
  <rsp:responsePackItem version="2.0" id="${id}" state="error"><rsp:errorDetail><rsp:recordDuplicity>
    <rsp:agendaType>banka</rsp:agendaType><rsp:id>42</rsp:id><rsp:number>BV0043</rsp:number>
  </rsp:recordDuplicity></rsp:errorDetail></rsp:responsePackItem>`;
    const r = await spracujPolozkyOdpovede(sb as any, {
      companyId: FIRMA,
      balik: rozoberBalikOdpovede(
        odpoved(ok(FA, "20260001") + ok(`BNK-${BT}`, "BV0042") + zle(`BNK-${BT2}`, "Neznámy bankový účet")),
      ),
    });
    expect(r.chyby.join(" ")).toContain("Neznámy bankový účet");
    const [a, b] = sb.db.bank_transactions!;
    expect(a).toMatchObject({ export_job_id: job, pohoda_cislo: "BV0042" });
    expect(a!.exported_at).toBeTruthy();
    expect(b!.exported_at).toBeFalsy();
    const riadok = sb.db.pohoda_konektor_polozky!.find((x) => x.zaznam_id === BT2)!;
    expect(riadok).toMatchObject({ stav: "chyba" });
    expect(String(riadok.chyba)).toContain("Neznámy bankový účet");

    // Ďalšia dávka: POHODA pohyb už má (recordDuplicity) — berie sa ako potvrdenie.
    const xml2 = pridajPolozky(davka(), bnk(BT2));
    const job2 = await zapisDavku(sb as any, {
      companyId: FIRMA,
      od: "2026-10-01",
      xml: xml2,
      polozky: polozkyZDavky(xml2, { banka: [{ id: BT2, verzia: null }] }, "t"),
      faktury: [],
      cislaPreskocenych: new Set(),
      preskocene: [],
      pocetFaktur: 0,
      bezPotvrdenia: [],
    });
    await spracujPolozkyOdpovede(sb as any, {
      companyId: FIRMA,
      balik: rozoberBalikOdpovede(odpoved(duplicita(`BNK-${BT2}`))),
    });
    expect(sb.db.bank_transactions![1]).toMatchObject({ export_job_id: job2 });
    expect(sb.db.bank_transactions![1]!.exported_at).toBeTruthy();
  });

  it("už odovzdaný pohyb sa druhým potvrdením neprepíše", async () => {
    const { sb } = await davkaSBankou();
    sb.db.bank_transactions![0]!.exported_at = "2026-10-31T00:00:00Z";
    sb.db.bank_transactions![0]!.export_job_id = "balik";
    await spracujPolozkyOdpovede(sb as any, {
      companyId: FIRMA,
      balik: rozoberBalikOdpovede(odpoved(ok(`BNK-${BT}`, "BV1"))),
    });
    expect(sb.db.bank_transactions![0]).toMatchObject({ exported_at: "2026-10-31T00:00:00Z", export_job_id: "balik" });
  });

  it("odpoveď na balík: pohyb dostane číslo a je odovzdaný, odmietnutý sa vráti do fronty", async () => {
    const { spracujOdpoved } = await import("./pohoda-konektor.server");
    const sb = databaza({
      pohoda_konektor_polozky: [],
      bank_transactions: [
        { id: BT, company_id: FIRMA, exported_at: null },
        { id: BT2, company_id: FIRMA, exported_at: "2026-11-01T00:00:00Z", export_job_id: "j" },
      ],
      export_logs: [],
      expense_documents: [],
      purchase_invoices: [],
      cash_entries: [],
      pohoda_odoslane: [],
      companies: [{ id: FIRMA, pohoda_nacitat_ciselniky: false }],
    });
    const r = await spracujOdpoved(sb as any, {
      companyId: FIRMA,
      xml: odpoved(ok(`BNK-${BT}`, "BV7") + zle(`BNK-${BT2}`, "Chyba")),
    });
    expect(r.chybnych).toBe(1);
    expect(sb.db.bank_transactions![0]).toMatchObject({ pohoda_cislo: "BV7" });
    expect(sb.db.bank_transactions![0]!.exported_at).toBeTruthy();
    expect(sb.db.bank_transactions![1]).toMatchObject({ exported_at: null, export_job_id: null });
  });
});

/* ------------------------------------------------- automatická likvidácia bankových pohybov */

describe("automatická likvidácia v odpovedi POHODY", () => {
  const BT = "77777777-7777-7777-7777-777777777777";
  const LQD = "LQD-TABe-2026-11-16-1a2b3c4d";
  const LQD2 = "LQD-VUB-SK-2026-11-16-9f9f9f9f";
  const likvidacia = (id: string) => `
  <rsp:responsePackItem version="2.0" id="${id}" state="ok">
    <lqd:automaticLiquidationResponse version="2.0" state="ok">
      <lqd:automaticLiquidationDetails>
        <lqd:automaticLiquidationDetail>
          <lqd:movementDetail><lqd:id>5</lqd:id><lqd:number>TABe111</lqd:number><lqd:bankType>receipt</lqd:bankType><lqd:datePayment>2026-11-03</lqd:datePayment></lqd:movementDetail>
          <lqd:liquidationDetail><lqd:state>ok</lqd:state><lqd:documents><lqd:document><lqd:state>ok</lqd:state><lqd:id>9</lqd:id><lqd:number>K101c001</lqd:number></lqd:document></lqd:documents></lqd:liquidationDetail>
        </lqd:automaticLiquidationDetail>
        <lqd:automaticLiquidationDetail>
          <lqd:movementDetail><lqd:id>6</lqd:id><lqd:number>TABe112</lqd:number><lqd:bankType>receipt</lqd:bankType></lqd:movementDetail>
          <lqd:liquidationDetail><lqd:state>ok</lqd:state><lqd:documents><lqd:document><lqd:state>ok</lqd:state><lqd:id>10</lqd:id><lqd:number>K101c002</lqd:number></lqd:document></lqd:documents></lqd:liquidationDetail>
        </lqd:automaticLiquidationDetail>
        <lqd:automaticLiquidationDetail>
          <lqd:movementDetail><lqd:id>7</lqd:id><lqd:number>TABe113</lqd:number><lqd:bankType>expense</lqd:bankType></lqd:movementDetail>
          <lqd:liquidationDetail><lqd:state>warning</lqd:state><lqd:detail>K pohybu č. TABe113 nenájdený doklad (VS = 555)</lqd:detail></lqd:liquidationDetail>
        </lqd:automaticLiquidationDetail>
      </lqd:automaticLiquidationDetails>
    </lqd:automaticLiquidationResponse>
  </rsp:responsePackItem>`;
  const odmietnuta = (id: string) => `
  <rsp:responsePackItem version="2.0" id="${id}" state="error">
    <lqd:automaticLiquidationResponse version="2.0" state="error">
      <rdc:importDetails><rdc:detail><rdc:state>error</rdc:state><rdc:errno>101</rdc:errno><rdc:note>Pravidlo párovania nebolo nájdené</rdc:note></rdc:detail></rdc:importDetails>
    </lqd:automaticLiquidationResponse>
  </rsp:responsePackItem>`;

  it("výsledok párovania ide do upozornení, s doklady sa neplete a odmietnutie nič nevráti do fronty", async () => {
    const { spracujOdpoved } = await import("./pohoda-konektor.server");
    const sb = databaza({
      bank_transactions: [{ id: BT, company_id: FIRMA, exported_at: null }],
      pohoda_odoslane: [],
      export_logs: [],
      expense_documents: [],
      purchase_invoices: [],
      cash_entries: [],
      companies: [{ id: FIRMA, pohoda_nacitat_ciselniky: false }],
    });
    const xml = pridajPolozky(davka(), `\n  <dat:dataPackItem id="BNK-${BT}" version="2.0"></dat:dataPackItem>`);
    const job = await zapisDavku(sb as any, {
      companyId: FIRMA,
      od: "2026-10-01",
      xml: xml + `<dat:dataPackItem id="${LQD}" version="2.0"></dat:dataPackItem>`,
      polozky: polozkyZDavky(xml, { faktury: [{ id: FA, verzia: 0 }], banka: [{ id: BT, verzia: null }] }, "t"),
      faktury: [faktura],
      cislaPreskocenych: new Set(),
      preskocene: [],
      pocetFaktur: 1,
      bezPotvrdenia: [],
    });
    // Do položiek dávky sa likvidácia nezapíše.
    expect(sb.db.pohoda_konektor_polozky!.some((r) => String(r.polozka_id).startsWith("LQD-"))).toBe(false);

    // Pôvodné správanie pri „neznámej“ položke by hľadalo uuid v export_logs — zachytí to každý dopyt na id LQD-.
    const dopyty: string[] = [];
    const from = sb.from;
    (sb as any).from = (t: string) => {
      const q = from(t);
      const eq = q.eq;
      q.eq = (k: string, v: any) => (String(v).startsWith("LQD-") && dopyty.push(`${t}.${k}`), eq(k, v));
      return q;
    };
    const r = await spracujOdpoved(sb as any, {
      companyId: FIRMA,
      xml: odpoved(ok(FA, "20260001") + ok(`BNK-${BT}`, "TABe111") + likvidacia(LQD) + odmietnuta(LQD2)),
    });
    expect(dopyty).toEqual([]);
    expect(r.chybnych).toBe(0);
    expect(r.upozornenia).toEqual(
      expect.arrayContaining([
        "Párovanie TABe: spárované 2, bez dokladu 1",
        expect.stringMatching(/^Párovanie VUB-SK: POHODA automatickú likvidáciu odmietla \(Pravidlo párovania nebolo nájdené\)/),
      ]),
    );
    // Doklady a pohyb sú potvrdené, nič sa nevrátilo do fronty.
    expect(sb.db.bank_transactions![0]).toMatchObject({ export_job_id: job, pohoda_cislo: "TABe111" });
    expect(sb.db.pohoda_konektor_polozky!.every((p) => p.stav === "ok")).toBe(true);
    expect(sb.db.export_logs![0]).toMatchObject({ status: "ok" });
  });

  it("odpoveď len s likvidáciou nič nepáruje ani nevracia", async () => {
    const { spracujOdpoved } = await import("./pohoda-konektor.server");
    const sb = databaza({ pohoda_konektor_polozky: [], companies: [{ id: FIRMA, pohoda_nacitat_ciselniky: false }] });
    const r = await spracujOdpoved(sb as any, { companyId: FIRMA, xml: odpoved(odmietnuta(LQD)) });
    expect(r.chybnych).toBe(0);
    expect(r.upozornenia?.[0]).toMatch(/^Párovanie TABe: POHODA automatickú likvidáciu odmietla/);
  });
});
