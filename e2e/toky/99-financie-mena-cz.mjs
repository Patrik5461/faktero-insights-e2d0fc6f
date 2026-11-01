/*
  Financie českej firmy v korunách (balík B6, QA Česká). Nič nezapisuje.

  - Nová zmluva (leasing/úver): mena zmluvy je predvolene CZK — predtým sa
    leasing uložil vždy v EUR a náhľad splátok ukazoval eurá.
  - Pokladňa: sumy v Kč, nie napevno v eurách.
  - DPH prehľad: text pod nadpisom hovorí o EPO (nie o eDane), súčty v Kč.
  - Výkazy: plátce vidí tlačivá (kontrola vat_payer neskryje výkazy platiteľovi).
  - Pripojiť banku: Tatra banka už netvrdí „iba na čítanie / 90 dní“
    (platby prijatých faktúr idú cez TB, história je 13 mesiacov).
*/
export default {
  popis: "CZ firma: leasing v CZK, pokladňa v Kč, DPH prehľad pre EPO, TB texty (QA Česká)",
  limit: 180000,
  firma: "cz",
  async spusti(t) {
    const page = t.page;
    const main = () => page.locator("main");

    await t.krok("nová zmluva: mena zmluvy CZK", async () => {
      await t.go("/financovanie/nova");
      const vyber = main().getByLabel("Mena zmluvy");
      await vyber.waitFor({ timeout: 30000 });
      // Krajina firmy sa dočíta až po chvíli — počká sa, kým sa predvolená mena ustáli.
      await t.cakajNa("mena CZK", async () => (await vyber.inputValue()) === "CZK", {
        limit: 15000,
      });
    });

    await t.krok("pokladňa: sumy v Kč", async () => {
      await t.go("/pokladna");
      await main().getByText(/Kč/).first().waitFor({ timeout: 30000 });
      const text = await main().innerText();
      t.over(!/\d\s?€/.test(text), "pokladňa českej firmy ukazuje sumy v eurách");
    });

    await t.krok("DPH prehľad: EPO a súčty v Kč", async () => {
      await t.go("/uctovnictvo/dph");
      await main().getByText(/EPO/).first().waitFor({ timeout: 30000 });
      const text = await main().innerText();
      t.over(!text.includes("eDane"), "česká firma vidí text o eDane");
      t.over(/Kč/.test(text), "súčty DPH prehľadu nie sú v Kč");
    });

    await t.krok("výkazy: plátce vidí tlačivá, nie box neplatiteľa", async () => {
      await t.go("/uctovnictvo/vykazy");
      await main()
        .getByText("Priznanie k DPH", { exact: true })
        .first()
        .waitFor({ timeout: 30000 });
      t.over(
        (await page.getByTestId("vykazy-neplatitel").count()) === 0,
        "plátce dostal box neplatiteľa",
      );
    });

    await t.krok("Pripojiť banku: TB texty", async () => {
      await t.go("/bankove-ucty/pripojit");
      await main()
        .getByText(/Tatra banka/)
        .first()
        .waitFor({ timeout: 30000 });
      const text = await main().innerText();
      t.over(text.includes("13 mesiacov"), "chýba „13 mesiacov“ histórie TB");
      t.over(!text.includes("Bez platobných príkazov"), "TB stále tvrdí „bez platobných príkazov“");
      t.over(!text.includes("90 dní"), "TB stále tvrdí „90 dní“");
    });
  },
};
