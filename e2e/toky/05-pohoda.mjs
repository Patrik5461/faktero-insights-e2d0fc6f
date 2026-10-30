/*
  Export do Pohody bez označenia ako odovzdané: vystavená faktúra cez Účtovné
  exporty (formát Pohoda XML, vypnuté „Označiť ako odovzdané“). XML musí prejsť
  schémou Stormware (data.xsd) a faktúra ostane neodovzdaná.

  Prijaté faktúry sa do Pohody bez označenia stiahnuť nedajú — „Stiahnuť XML
  pre Pohodu“ na detaile ich zámerne označí (konektor ich potom nepošle znova),
  preto tu nie sú.
*/
import { readFileSync } from "node:fs";
import { overXsd, SCHEMY, textXml } from "../lib/xml.mjs";
import { vystavFakturu, zalozOdberatela } from "../lib/doklady.mjs";

async function overPohodu(t, subor, cislo) {
  const buf = readFileSync(subor);
  const chyba = await overXsd(buf, SCHEMY.pohoda);
  t.over(!chyba, `XML neprešlo schémou Stormware: ${chyba}`);
  const text = textXml(buf);
  t.over(text.includes(cislo), `v XML chýba doklad ${cislo}`);
  t.over(
    (text.match(/<dat:dataPackItem\b/g) ?? []).length === 1,
    "v XML má byť práve jeden doklad",
  );
  return text;
}

export default {
  popis: "export do Pohody bez označenia → XML proti XSD → doklad ostal neodovzdaný",
  limit: 150000,
  async spusti(t) {
    const page = t.page;

    // Export bez označenia sa aj tak zapíše do Histórie exportov — tá sa po teste zmaže.
    const zaciatok = new Date().toISOString();
    t.uprac("história exportov", async () => {
      const r = await t.rest.delete(
        `export_jobs?company_id=eq.${t.firmy.test}&created_at=gte.${zaciatok}&format=eq.pohoda_xml&invoice_count=eq.1`,
      );
      if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      if (!Array.isArray(r.data) || r.data.length !== 1)
        throw new Error(
          `zmazaných záznamov ${Array.isArray(r.data) ? r.data.length : "?"}, čakal som 1`,
        );
    });

    const fa = await t.krok("príprava: vystavená faktúra", async () => {
      const odb = await zalozOdberatela(t);
      return await vystavFakturu(t, {
        odberatel: odb.name,
        text: `${t.znacka} — export do Pohody`,
        polozky: [[`${t.znacka} služba`, 1, 100, 23]],
      });
    });

    await t.krok("vystavená: Účtovné exporty → Pohoda XML bez označenia", async () => {
      await t.go("/exporty");
      const sekcia = page
        .locator("div.rounded-2xl")
        .filter({ has: page.getByRole("button", { name: "Vybrať všetko", exact: true }) })
        .last();
      const datumy = sekcia.locator('input[type="date"]');
      await datumy.nth(0).fill(t.dnes);
      await datumy.nth(1).fill(t.dnes);
      await sekcia
        .locator("select")
        .filter({ has: page.locator('option[value="pohoda_xml"]') })
        .selectOption("pohoda_xml");
      const riadok = sekcia.locator("tr", { hasText: fa.invoice_number });
      await riadok.waitFor({ timeout: 20000 });
      await riadok.locator('input[type="checkbox"]').check();
      const oznacit = sekcia.getByLabel(/Označiť ako odovzdané/);
      if (await oznacit.isChecked()) await oznacit.uncheck();
      t.over(!(await oznacit.isChecked()), "„Označiť ako odovzdané“ sa nedalo vypnúť");
      const subor = await t.stiahni(
        () => sekcia.getByRole("button", { name: "Exportovať", exact: true }).click(),
        "pohoda-vystavena",
      );
      const text = await overPohodu(t, subor, fa.invoice_number);
      t.over(
        /<inv:invoiceType>issuedInvoice<\/inv:invoiceType>/.test(text),
        "v XML nie je vydaná faktúra",
      );
      const r = await t.rest.get(`invoices?id=eq.${fa.id}&select=exported_at`);
      t.over(
        r.data?.[0] && !r.data[0].exported_at,
        `faktúra sa označila ako odovzdaná (${r.text})`,
      );
    });
  },
};
