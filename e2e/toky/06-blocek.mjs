/* Bloček zadaný ručne (bez skenu a AI) → objaví sa v zozname Doklady. */
import { vyplnRozpisDph } from "../lib/doklady.mjs";
import { pravidloPreDodavatela } from "../lib/zauctovanie.mjs";

export default {
  popis: "bloček ručne → zoznam Doklady",
  limit: 90000,
  async spusti(t) {
    const page = t.page;
    const dodavatel = `${t.znacka} Obchod s.r.o.`;
    const cislo = `${t.znacka}-B`;
    // Pravidlo doplní predkontáciu — automatické zaúčtovanie potom nepýta AI.
    await pravidloPreDodavatela(t, t.znacka);
    t.uprac("bloček", async () => {
      const r = await t.rest.get(
        `expense_documents?company_id=eq.${t.firmy.test}&document_number=eq.${encodeURIComponent(cislo)}&select=id`,
      );
      if (r.status !== 200) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      for (const d of r.data) {
        const z = await t.rest.delete(`expense_documents?id=eq.${d.id}`);
        if (z.status >= 300) throw new Error(`${z.status} ${z.text.slice(0, 200)}`);
      }
    });

    await t.krok("formulár bločku", async () => {
      await t.go("/doklady/novy");
      const pole = (label) =>
        page
          .locator("label")
          .filter({ has: page.getByText(label, { exact: true }) })
          .locator("input, select")
          .first();
      await pole("Dodávateľ").waitFor();
      await pole("Dodávateľ").fill(dodavatel);
      await pole("Číslo dokladu").fill(cislo);
      await pole("Dátum vystavenia").fill(t.dnes);
      // Od 13. 11. rozpis DPH: sadzba zo zákonných, DPH sa dopočíta, Celkom zo súčtu.
      await vyplnRozpisDph(page, [{ sadzba: 23, zaklad: 10 }]);
      await t.cakajNa(
        "Celkom 12,3 zo súčtu rozpisu",
        async () => Number((await pole("Celkom").inputValue()).replace(",", ".")) === 12.3,
        { limit: 5000 },
      );
      await page
        .locator("select")
        .filter({ has: page.locator('option[value="hotovost"]') })
        .first()
        .selectOption("karta");
      await page.getByRole("button", { name: "Uložiť doklad" }).click();
      await page.waitForURL(/\/doklady(\?|$)/, { timeout: 30000 });
    });

    await t.krok("bloček je v databáze", async () => {
      const d = await t.cakajNa("zápis bločku", async () => {
        const r = await t.rest.get(
          `expense_documents?company_id=eq.${t.firmy.test}&document_number=eq.${encodeURIComponent(cislo)}&select=*`,
        );
        return r.data?.[0] ?? null;
      });
      t.over(Number(d.total_amount) === 12.3, `suma ${d.total_amount}`);
      t.over(d.payment_method === "karta", `úhrada ${d.payment_method}`);
    });

    await t.krok("bloček je v zozname Doklady", async () => {
      // Po uložení appka otvorí zoznam na správnom mesiaci a záložke.
      await page
        .locator("main")
        .getByText(dodavatel)
        .filter({ visible: true })
        .first()
        .waitFor({ timeout: 20000 });
    });
  },
};
