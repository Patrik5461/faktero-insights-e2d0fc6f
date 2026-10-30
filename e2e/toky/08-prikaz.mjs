/* Hromadný príkaz na úhradu z prijatých faktúr → pain.001 platný proti ISO aj SEPA (EPC) schéme. */
import { readFileSync } from "node:fs";
import { prijataCezRest } from "../lib/zauctovanie.mjs";
import { overXsd, SCHEMY } from "../lib/xml.mjs";

export default {
  popis: "hromadný príkaz → pain.001 proti ISO a EPC schéme",
  limit: 90000,
  async spusti(t) {
    const page = t.page;
    const vs = `7${String(Date.now()).slice(-8)}`;
    const p = await prijataCezRest(t, {
      invoice_number: `${t.znacka}-HP`,
      variable_symbol: vs,
      amount_total: 123,
    });

    const subor = await t.krok("príkaz zo zoznamu prijatých faktúr", async () => {
      await t.go("/prijate-faktury");
      const riadok = page.locator("tr", { hasText: p.invoice_number }).first();
      await riadok.waitFor({ timeout: 20000 });
      await riadok.locator('input[type="checkbox"], [role="checkbox"]').first().click();
      await page
        .getByRole("button", { name: /Hromadný príkaz na úhradu/ })
        .first()
        .click();
      const okno = page.getByRole("dialog", { name: "Hromadný príkaz na úhradu" });
      await okno.waitFor();
      await okno.getByRole("button", { name: "Stiahnuť XML" }).waitFor();
      return await t.stiahni(
        () => okno.getByRole("button", { name: "Stiahnuť XML" }).click(),
        "pain001",
      );
    });

    await t.krok("pain.001 proti schémam", async () => {
      const xml = readFileSync(subor, "utf8");
      const iso = await overXsd(xml, SCHEMY.pain001);
      t.over(!iso, `pain.001 neprešiel ISO schémou: ${iso}`);
      const epc = await overXsd(xml, SCHEMY.pain001Sepa);
      t.over(!epc, `pain.001 neprešiel SEPA (EPC) schémou: ${epc}`);
      t.over(xml.includes(`/VS${vs}`), `v príkaze chýba VS ${vs}`);
      t.over(/<InstdAmt Ccy="EUR">123\.00<\/InstdAmt>/.test(xml), "v príkaze chýba suma 123.00");
      t.over(xml.includes("SK7709000000000000123456"), "v príkaze chýba IBAN dodávateľa");
      t.over(
        (xml.match(/<CdtTrfTxInf>/g) ?? []).length === 1,
        "v príkaze má byť práve jedna platba",
      );
    });
  },
};
