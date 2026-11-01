/*
  Iné doklady (QA firma Test): výber a hromadné akcie len nad zobrazenými
  riadkami (B7a – H-02, H-03).

  Pôvodná chyba: „Označiť všetky“ vybralo celú záložku vrátane riadkov
  skrytých hľadaním či priečinkom a „ZIP všetko“ / „Odovzdať účtovníkovi“ bez
  výberu zabalili celú záložku. Po oprave sa ráta len to, čo je vidieť, a zmena
  filtra výber zruší.

  Založí tri nespracované iné doklady so značkou behu (dva „A“, jeden „B“),
  na konci ich zmaže. ZIP sa sťahuje bez označenia za odovzdané — dáta firmy
  sa nemenia.
*/

export default {
  popis: "Iné doklady: Označiť všetky a ZIP len zo zobrazených (filter hľadania)",
  limit: 150000,
  async spusti(t) {
    const firma = t.firmy.test;
    const page = t.page;
    const a = `${t.znacka} IDA`;
    const b = `${t.znacka} IDB`;

    const doklady = await t.krok("príprava: tri iné doklady", async () => {
      const out = [];
      for (const subject of [`${a}1`, `${a}2`, `${b}1`]) {
        out.push(
          await t.rest.vloz("other_documents", {
            company_id: firma,
            status: "new",
            sender: `${t.znacka} Odosielateľ`,
            subject,
            received_date: t.dnes,
          }),
        );
      }
      return out;
    });
    t.uprac("iné doklady", () =>
      t.rest.delete(`other_documents?id=in.(${doklady.map((d) => d.id).join(",")})`),
    );

    const tabulka = page.locator("table");
    const oznacVsetky = page.getByRole("checkbox", { name: "Označiť všetky" });

    await t.krok("filter hľadania ukáže dva doklady A", async () => {
      await t.go(`/ostatne-doklady?q=${encodeURIComponent(a)}`, page);
      await tabulka.getByText(`${a}1`).waitFor({ timeout: 30000 });
      await tabulka.getByText(`${a}2`).waitFor();
      t.over((await tabulka.getByText(`${b}1`).count()) === 0, "doklad B nemá byť zobrazený");
    });

    await t.krok("Označiť všetky vyberie len zobrazené", async () => {
      await oznacVsetky.check();
      await page.getByRole("button", { name: /Do priečinka \(2\)/ }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: /^ZIP \(2\)/ }).waitFor();
      t.over(await oznacVsetky.isChecked(), "„Označiť všetky“ má byť zaškrtnuté");
      await oznacVsetky.uncheck();
      await page
        .getByRole("button", { name: /Do priečinka/ })
        .waitFor({ state: "detached", timeout: 10000 });
    });

    await t.krok("zmena hľadania výber zruší", async () => {
      await oznacVsetky.check();
      await page.getByRole("button", { name: /Do priečinka \(2\)/ }).waitFor({ timeout: 10000 });
      const hladat = page.locator('input[type="search"]').first();
      await hladat.fill(b);
      await tabulka.getByText(`${b}1`).waitFor({ timeout: 15000 });
      await page
        .getByRole("button", { name: /Do priečinka/ })
        .waitFor({ state: "detached", timeout: 10000 });
      await page.getByRole("button", { name: /ZIP všetky zobrazené \(1\)/ }).waitFor();
      t.over(!(await oznacVsetky.isChecked()), "po zmene filtra nemá byť nič vybrané");
    });

    await t.krok("ZIP bez výberu zabalí len zobrazený doklad", async () => {
      await t.stiahni(
        () => page.getByRole("button", { name: /ZIP všetky zobrazené \(1\)/ }).click(),
        "ine-doklady",
        page,
      );
      await t.cakajNa("hláška o počte dokladov", () =>
        t.hlasky.some((h) => h.includes("Počet dokladov v balíku: 1.")),
      );
    });
  },
};
