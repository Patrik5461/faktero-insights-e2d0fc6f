/*
  Príjmový pokladničný doklad z Pohody (31. 10. 2026) — Import prijatých
  dokladov (/importy/doklady) vo firme test2 ho zapíše do pokladne
  (`cash_entries`, príjem) s číslom z pokladničného radu a číslom z Pohody.
  Predtým sa príjem potichu preskočil. Druhé nahratie toho istého súboru ho
  ukáže ako duplicitu. Pokladničný doklad aj história importu sa na konci zmažú.
*/
import { writeFileSync } from "node:fs";
import path from "node:path";

export default {
  popis: "Import prijatých dokladov: príjmový pokladničný doklad z Pohody ide do pokladne",
  limit: 240000,
  async spusti(t) {
    const kod = t.znacka.replace(/\D/g, "").slice(-8);
    const cislo = `PPD${kod}`;
    const popis = `${t.znacka} vklad z Pohody`;
    const firma = t.firmy.test2;
    const subor = path.join(t.vystup, "subory", `${t.tok}-pokladna.xml`);
    writeFileSync(
      subor,
      `<?xml version="1.0" encoding="UTF-8"?>
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:vch="http://www.stormware.cz/schema/version_2/voucher.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd" version="2.0" id="E2E78" ico="86179504" application="E2E" note="E2E">
 <dat:dataPackItem id="v1" version="2.0"><vch:voucher version="2.0"><vch:voucherHeader>
  <vch:voucherType>receipt</vch:voucherType><vch:number><typ:numberRequested>${cislo}</typ:numberRequested></vch:number>
  <vch:date>${t.dnes}</vch:date><vch:text>${popis}</vch:text>
 </vch:voucherHeader><vch:voucherSummary><vch:homeCurrency><typ:priceNone>123.45</typ:priceNone></vch:homeCurrency></vch:voucherSummary></vch:voucher></dat:dataPackItem>
</dat:dataPack>`,
      "utf8",
    );
    const od = new Date().toISOString();
    t.uprac("pokladničný doklad a história importu", async () => {
      await t.rest.delete(`cash_entries?company_id=eq.${firma}&pohoda_cislo=eq.${cislo}`);
      const jobs = await t.rest.get(
        `import_jobs?company_id=eq.${firma}&created_at=gte.${od}&source=like.Prijat*&select=id`,
      );
      for (const j of jobs.data ?? []) await t.rest.delete(`import_jobs?id=eq.${j.id}`);
    });

    const nahraj = async (page) => {
      await t.go("/importy/doklady", page);
      await page.locator('input[type="file"]').first().setInputFiles(subor);
      await page.getByRole("button", { name: /Nahrať a pozrieť/ }).click();
      await page.getByText(/2\. Čo sa naimportuje/).waitFor({ timeout: 40000 });
    };

    await t.krok("import príjmu do pokladne", async () => {
      const p = await t.novaStranka({ firma: "test2" });
      await nahraj(p);
      await p.getByText(/Príjmové pokladničné doklady do pokladne: 1/).waitFor();
      await p
        .locator("select")
        .filter({ has: p.locator('option[value="Pohoda"]') })
        .selectOption("Pohoda");
      await p.getByRole("button", { name: /Spustiť import/ }).click();
      await p.getByText(/Príjmy do pokladne: 1/).waitFor({ timeout: 60000 });
      const r = await t.cakajNa("pokladničný doklad", async () => {
        const x = await t.rest.get(
          `cash_entries?company_id=eq.${firma}&pohoda_cislo=eq.${cislo}&select=*`,
        );
        return x.data?.[0] ?? null;
      });
      t.over(r.type === "prijem", `typ ${r.type}`);
      t.over(Number(r.amount) === 123.45, `suma ${r.amount}`);
      t.over(r.entry_date === t.dnes, `dátum ${r.entry_date}`);
      t.over(r.description === popis, `popis ${r.description}`);
      t.over(!!r.entry_number, "chýba číslo pokladničného dokladu");
      await p.close();
    });

    await t.krok("druhé nahratie: príjem je duplicita", async () => {
      const p = await t.novaStranka({ firma: "test2" });
      await nahraj(p);
      t.over(
        !(await p.getByText(/Príjmové pokladničné doklady do pokladne/).count()),
        "príjem by sa naimportoval druhý raz",
      );
      await p.close();
    });
  },
};
