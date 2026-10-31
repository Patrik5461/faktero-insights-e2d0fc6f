/*
  Spätný chod Pohody pre českú firmu (QA Česká, CZK): faktúra 21 % + 12 %,
  tuzemské prenesenie podľa § 92a a opravný daňový doklad → Účtovné exporty
  → Pohoda XML → schéma Stormware (členenie UDpdp, bez KV DPH — to má len
  SK Pohoda, opravný doklad ako issuedCorrectiveTax so záporným základom) →
  Import z Pohody späť do tej istej firmy → sumy, sadzby, druh dokladu
  a prenesenie na cent.

  Import ide do tej istej firmy (je jediná česká): pôvodné doklady sa pred
  importom premenujú (`…-P`), inak by import ich čísla správne preskočil ako
  duplicitné. Všetko sa na konci zmaže.
*/
import { readFileSync } from "node:fs";
import { overXsd, SCHEMY, textXml } from "../lib/xml.mjs";
import { zmazFakturuNatvrdo } from "../lib/doklady.mjs";
import { exportujDoPohody, importovana, importujZPohody } from "./60-pohoda-spatny-chod.mjs";

const c = (n) => Math.round(Number(n ?? 0) * 100) / 100;

export default {
  popis: "Pohoda CZ: 21/12 %, § 92a, opravný doklad → XSD → import späť (sumy, druh, prenesenie)",
  limit: 300000,
  firma: "cz",
  async spusti(t) {
    const firma = t.firmy.cz;
    const z = String(Date.now()).slice(-6);

    const doklady = await t.krok("príprava: tri doklady v QA Česká", async () => {
      const zaloz = async (cislo, hlavicka, polozky) => {
        const f = await t.rest.vloz("invoices", {
          company_id: firma,
          invoice_number: cislo,
          status: "issued",
          issue_date: t.dnes,
          delivery_date: t.dnes,
          due_date: t.dnes,
          currency: "CZK",
          customer_name: `${t.znacka} Odběratel CZ s.r.o.`,
          customer_country: "CZ",
          customer_ico: "27082440",
          customer_dic: "CZ27082440",
          customer_ic_dph: "CZ27082440",
          variable_symbol: `61${z}`,
          ...hlavicka,
        });
        t.uprac(`faktúra ${cislo}`, () => zmazFakturuNatvrdo(t, f.id));
        for (const [i, p] of polozky.entries())
          await t.rest.vloz("invoice_items", {
            invoice_id: f.id,
            position: i + 1,
            unit: "ks",
            discount_percent: 0,
            ...p,
          });
        return f;
      };
      const a = await zaloz(
        `E2E${z}A`,
        { type: "regular", subtotal: 1500, vat_total: 270, total: 1770 },
        [
          {
            name: "Služba 21 %",
            quantity: 2,
            unit_price: 500,
            vat_rate: 21,
            subtotal: 1000,
            vat_amount: 210,
            total: 1210,
          },
          {
            name: "Kniha 12 %",
            quantity: 1,
            unit_price: 500,
            vat_rate: 12,
            subtotal: 500,
            vat_amount: 60,
            total: 560,
          },
        ],
      );
      const b = await zaloz(
        `E2E${z}B`,
        {
          type: "regular",
          reverse_charge: true,
          reverse_charge_type: "domestic_69",
          subtotal: 2000,
          vat_total: 0,
          total: 2000,
        },
        [
          {
            name: "Stavební práce § 92a",
            quantity: 1,
            unit_price: 2000,
            vat_rate: 21,
            subtotal: 2000,
            vat_amount: 0,
            total: 2000,
          },
        ],
      );
      const d = await zaloz(
        `E2E${z}D`,
        { type: "credit_note", subtotal: -100, vat_total: -21, total: -121 },
        [
          {
            name: "Sleva",
            quantity: -1,
            unit_price: 100,
            vat_rate: 21,
            subtotal: -100,
            vat_amount: -21,
            total: -121,
          },
        ],
      );
      return [a, b, d];
    });

    const subor = await t.krok("export do Pohody a schéma Stormware", async () => {
      const s = await exportujDoPohody(
        t,
        doklady.map((d) => d.invoice_number),
        "pohoda-cz",
      );
      const buf = readFileSync(s);
      const chyba = await overXsd(buf, SCHEMY.pohoda);
      t.over(!chyba, `XML neprešlo schémou Stormware: ${chyba}`);
      const text = textXml(buf);
      t.over(!text.includes("classificationKVDPH"), "česká Pohoda nemá členenie KV DPH");
      t.over(/<typ:ids>UDpdp<\/typ:ids>/.test(text), "§ 92a bez členenia UDpdp");
      t.over(/issuedCorrectiveTax/.test(text), "opravný doklad nie je issuedCorrectiveTax");
      return s;
    });

    await t.krok("import späť do QA Česká — sumy, druh a prenesenie", async () => {
      // Pôvodné doklady uhnú s číslom, aby import nevyhodnotil duplicitu.
      for (const d of doklady)
        await t.rest.patch(`invoices?id=eq.${d.id}`, { invoice_number: `${d.invoice_number}-P` });
      const od = await importujZPohody(t, t.page, subor, firma);
      for (const d of doklady) {
        const imp = await importovana(t, firma, d.invoice_number, od);
        t.over(
          [c(imp.subtotal), c(imp.vat_total), c(imp.total)].join() ===
            [c(d.subtotal), c(d.vat_total), c(d.total)].join(),
          `${d.invoice_number}: sumy ${imp.subtotal}/${imp.vat_total}/${imp.total} ≠ ${d.subtotal}/${d.vat_total}/${d.total}`,
        );
        t.over(imp.type === d.type, `${d.invoice_number}: druh ${imp.type} ≠ ${d.type}`);
        t.over(imp.currency === "CZK", `${d.invoice_number}: mena ${imp.currency}`);
        const sadzby = (imp.invoice_items ?? []).map((i) => Number(i.vat_rate)).sort();
        const povodne = d.invoice_number.endsWith("A") ? "12,21" : "21";
        t.over(sadzby.join() === povodne, `${d.invoice_number}: sadzby ${sadzby.join()}`);
        if (d.reverse_charge) {
          t.over(imp.reverse_charge === true, "§ 92a: prenesenie sa stratilo");
          t.over(imp.pohoda_clenenie_dph === "UDpdp", `§ 92a: členenie ${imp.pohoda_clenenie_dph}`);
        }
      }
    });
  },
};
