import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { xmlRegisterFsInputProviders } from "libxml2-wasm/lib/nodejs.mjs";
import {
  casPrePohodu,
  jeIdUhrad,
  maOdpovedUhrad,
  pridajZiadostUhrad,
  rozoberUhradyZPohody,
} from "./pohoda-uhrady";
import { zapisUhradyZPohody } from "./pohoda-uhrady.server";
import { chceUhradyZPohody, zaciatokUhrad } from "./pohoda-konektor.server";

const LIST = new URL("../../../e2e/schemy/pohoda/list.xsd", import.meta.url);

describe.skipIf(!existsSync(LIST))("žiadosť o úhrady proti list.xsd", () => {
  it("každá položka UHR-… je platná listInvoiceRequest", () => {
    xmlRegisterFsInputProviders();
    const xsd = XsdValidator.fromDoc(XmlDocument.fromBuffer(readFileSync(LIST), { url: LIST.href }));
    const xml = pridajZiadostUhrad("", "53297474", new Date("2026-11-20T10:00:00Z"));
    const ns = [...new Set([...xml.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map((m) => `xmlns:${m[1]}="${m[2]}"`))];
    let n = 0;
    for (const m of xml.matchAll(/<dat:dataPackItem\b[^>]*>([\s\S]*?)<\/dat:dataPackItem>/g)) {
      const doc = XmlDocument.fromString(m[1].trim().replace(/^<(\w+:\w+)\b/, `<$1 ${ns.join(" ")}`));
      try {
        xsd.validate(doc);
        n++;
      } finally {
        doc.dispose();
      }
    }
    expect(n).toBe(4);
  });
});

describe("žiadosť o úhrady", () => {
  it("čas bez pásma v miestnom čase, pridanie do hotovej dávky s menným priestorom", () => {
    expect(casPrePohodu(new Date("2026-11-20T10:00:00Z"))).toBe("2026-11-20T11:00:00");
    const davka = `<?xml version="1.0"?>\n<dat:dataPack id="FAKTERO" xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd">\n</dat:dataPack>\n`;
    const x = pridajZiadostUhrad(davka, "1", new Date("2026-11-20T10:00:00Z"));
    expect(x).toContain('xmlns:ftr="http://www.stormware.cz/schema/version_2/filter.xsd"');
    expect(x).toContain('id="UHR-PRIJATE"');
    expect(x).toContain("<ftr:lastChanges>2026-11-20T11:00:00</ftr:lastChanges>");
    expect(jeIdUhrad("UHR-VYDANE")).toBe(true);
    expect(jeIdUhrad("FA-1")).toBe(false);
  });
  it("raz za 6 hodín, prvýkrát 90 dní dozadu, potom deň pred synchronizáciou", () => {
    const d = new Date("2026-11-25T12:00:00Z");
    expect(chceUhradyZPohody({}, d)).toBe(true);
    expect(chceUhradyZPohody({ pohoda_uhrady_zapnute: false }, d)).toBe(false);
    expect(chceUhradyZPohody({ pohoda_uhrady_ziadost_at: "2026-11-25T09:00:00Z" }, d)).toBe(false);
    expect(chceUhradyZPohody({ pohoda_uhrady_ziadost_at: "2026-11-25T05:00:00Z" }, d)).toBe(true);
    expect(zaciatokUhrad({}, d).toISOString().slice(0, 10)).toBe("2026-08-27");
    expect(zaciatokUhrad({ pohoda_uhrady_sync_at: "2026-11-24T12:00:00Z" }, d).toISOString()).toBe(
      "2026-11-23T12:00:00.000Z",
    );
  });
});

const ODPOVED = `<?xml version="1.0" encoding="Windows-1250"?>
<rsp:responsePack version="2.0" id="FAKTERO" state="ok" xmlns:rsp="http://www.stormware.cz/schema/version_2/response.xsd" xmlns:lst="http://www.stormware.cz/schema/version_2/list.xsd" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">
  <rsp:responsePackItem version="2.0" id="FA-1" state="ok"/>
  <rsp:responsePackItem version="2.0" id="UHR-VYDANE" state="ok">
    <lst:listInvoice version="2.0" state="ok">
      <lst:invoice version="2.0">
        <inv:invoiceHeader>
          <inv:invoiceType>issuedInvoice</inv:invoiceType>
          <inv:number><typ:numberRequested>20260001</typ:numberRequested></inv:number>
          <inv:symVar>20260001</inv:symVar>
          <inv:partnerIdentity><typ:address><typ:ico>36631124</typ:ico></typ:address></inv:partnerIdentity>
        </inv:invoiceHeader>
        <inv:liquidations>
          <typ:liquidation><typ:id>501</typ:id><typ:date>2026-11-10</typ:date><typ:amount>100.00</typ:amount></typ:liquidation>
          <typ:liquidation><typ:id>502</typ:id><typ:date>2026-11-12</typ:date><typ:amount>23</typ:amount></typ:liquidation>
        </inv:liquidations>
        <inv:invoiceSummary><inv:homeCurrency><typ:priceHigh>100</typ:priceHigh><typ:priceHighVAT>23</typ:priceHighVAT></inv:homeCurrency></inv:invoiceSummary>
      </lst:invoice>
    </lst:listInvoice>
  </rsp:responsePackItem>
  <rsp:responsePackItem version="2.0" id="UHR-PRIJATE" state="ok">
    <lst:listInvoice version="2.0" state="ok">
      <lst:invoice version="2.0">
        <inv:invoiceHeader>
          <inv:invoiceType>receivedInvoice</inv:invoiceType>
          <inv:number><typ:numberRequested>FP0007</typ:numberRequested></inv:number>
          <inv:originalDocument>2611111</inv:originalDocument>
          <inv:partnerIdentity><typ:address><typ:ico>12345678</typ:ico></typ:address></inv:partnerIdentity>
        </inv:invoiceHeader>
        <inv:liquidations>
          <typ:liquidation><typ:id>77</typ:id><typ:date>2026-11-15</typ:date><typ:amount>50</typ:amount></typ:liquidation>
        </inv:liquidations>
        <inv:invoiceSummary><inv:homeCurrency><typ:priceNone>50</typ:priceNone></inv:homeCurrency></inv:invoiceSummary>
      </lst:invoice>
    </lst:listInvoice>
  </rsp:responsePackItem>
</rsp:responsePack>`;

describe("odpoveď Pohody so zoznamom faktúr", () => {
  it("vytiahne faktúry, likvidácie a súčet", () => {
    expect(maOdpovedUhrad(ODPOVED)).toBe(true);
    const f = rozoberUhradyZPohody(ODPOVED);
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ druh: "vydana", zaloha: false, cislo: "20260001", ico: "36631124", suma: 123 });
    expect(f[0].likvidacie).toEqual([
      { id: "501", datum: "2026-11-10", suma: 100 },
      { id: "502", datum: "2026-11-12", suma: 23 },
    ]);
    expect(f[1]).toMatchObject({ druh: "prijata", cislo: "FP0007", povodneCislo: "2611111", suma: 50 });
  });
});

/** Minimálna náhrada klienta Supabase pre dotazy, ktoré robí zápis úhrad. */
function falosnaDb(tabulky: Record<string, any[]>) {
  const zapisy: { tabulka: string; akcia: string; riadok: any }[] = [];
  const from = (t: string) => {
    let rows = [...(tabulky[t] ?? [])];
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => ((rows = rows.filter((r) => r[k] === v)), q),
      in: (k: string, v: any[]) => ((rows = rows.filter((r) => v.includes(r[k]))), q),
      is: (k: string, v: any) => ((rows = rows.filter((r) => (r[k] ?? null) === v)), q),
      not: (k: string) => ((rows = rows.filter((r) => r[k] != null)), q),
      limit: (n: number) => ((rows = rows.slice(0, n)), q),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (res: any) => res({ data: rows, error: null }),
      insert: async (r: any) => {
        (tabulky[t] ??= []).push(r);
        zapisy.push({ tabulka: t, akcia: "insert", riadok: r });
        return { error: null };
      },
      update: (zmena: any) => ({
        eq: async (k: string, v: any) => {
          for (const r of tabulky[t] ?? []) if (r[k] === v) Object.assign(r, zmena);
          zapisy.push({ tabulka: t, akcia: "update", riadok: { ...zmena, [k]: v } });
          return { error: null };
        },
      }),
    };
    return q;
  };
  return { db: { from }, zapisy, tabulky };
}

describe("zápis úhrad z Pohody", () => {
  it("doplní úhrady, označí uhradenú, druhýkrát nič nezdvojí", async () => {
    const { db, zapisy, tabulky } = falosnaDb({
      export_logs: [{ company_id: "F", pohoda_cislo: "20260001", invoice_id: "I1" }],
      invoices: [{ id: "I1", company_id: "F", invoice_number: "20260001", total: 123, status: "issued", type: "regular", deleted_at: null }],
      payments: [],
      purchase_invoices: [
        { id: "P1", company_id: "F", invoice_number: "2611111", amount_total: 50, status: "booked", supplier_ico: "12345678", type: "regular", currency: "EUR", deleted_at: null },
      ],
      purchase_invoice_payments: [],
    });
    const faktury = rozoberUhradyZPohody(ODPOVED);
    const v = await zapisUhradyZPohody(db, "F", faktury);
    expect(v).toMatchObject({ faktur: 2, sparovanych: 2, novychUhrad: 3, uhradenych: 2 });
    expect(tabulky.payments.map((p) => [p.amount, p.paid_at, p.external_id])).toEqual([
      [100, "2026-11-10", "pohoda:501"],
      [23, "2026-11-12", "pohoda:502"],
    ]);
    expect(tabulky.invoices[0].status).toBe("paid");
    expect(tabulky.purchase_invoice_payments[0]).toMatchObject({ zdroj: "pohoda", amount: 50, external_id: "pohoda:77" });
    const pocet = zapisy.length;
    const v2 = await zapisUhradyZPohody(db, "F", faktury);
    expect(v2.novychUhrad).toBe(0);
    expect(zapisy.length).toBe(pocet);
  });

  it("faktúru zaplatenú inak (banka) druhýkrát nezaplatí — len upozorní", async () => {
    const { db, tabulky } = falosnaDb({
      export_logs: [],
      invoices: [{ id: "I1", company_id: "F", invoice_number: "20260001", total: 123, status: "paid", type: "regular", deleted_at: null }],
      payments: [{ invoice_id: "I1", amount: 123, external_id: null }],
      purchase_invoices: [],
      purchase_invoice_payments: [],
    });
    const v = await zapisUhradyZPohody(db, "F", rozoberUhradyZPohody(ODPOVED).slice(0, 1));
    expect(v.novychUhrad).toBe(0);
    expect(v.rozdiely.join(" ")).toContain("už má zaplatenú inak");
    expect(tabulky.payments).toHaveLength(1);
  });
});
