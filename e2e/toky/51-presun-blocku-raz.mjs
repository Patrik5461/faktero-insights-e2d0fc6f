/*
  Bloček presunutý do Nespracovaných dokladov sa nesmie zdvojiť (QA firma Test).

  Nespracovaný bloček (bez QR, zo skenu) sa pri otvorení v Nespracovaných
  presunie do `nespracovane_doklady`. Dvojklik na riadok volal presun dvakrát
  a každý pokus založil vlastnú kópiu. Odvtedy dostane nespracovaný doklad
  id bločku, takže druhý pokus narazí na primárny kľúč a vráti prvý.
  Upratanie zmaže bloček aj nespracovaný doklad.
*/
export default {
  popis: "presun bločku do Nespracovaných je idempotentný (dvojklik nezaloží dve kópie)",
  limit: 120000,
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test;
    const cislo = `${t.znacka}-B`.slice(-30);
    const dodavatel = `${t.znacka} Potraviny`;

    t.uprac("nespracovaný doklad", async () => {
      await t.rest.delete(
        `nespracovane_doklady?company_id=eq.${firma}&udaje->>cislo=eq.${encodeURIComponent(cislo)}`,
      );
    });
    t.uprac("bloček", async () => {
      await t.rest.delete(
        `expense_documents?company_id=eq.${firma}&document_number=eq.${encodeURIComponent(cislo)}`,
      );
    });

    const blocek = await t.krok("nespracovaný bloček v Dokladoch", () =>
      t.rest.vloz("expense_documents", {
        company_id: firma,
        status: "new",
        source: "upload",
        supplier_name: dodavatel,
        document_number: cislo,
        issue_date: t.dnes,
        total_amount: 7.5,
        payment_method: "karta",
      }),
    );

    await t.krok("dvojklik na riadok v Nespracovaných", async () => {
      await t.go("/nespracovane");
      const riadok = page.getByText(dodavatel).first();
      await riadok.waitFor({ timeout: 20000 });
      await riadok.dblclick();
      await page.waitForURL((u) => /\/nespracovane\/[0-9a-f-]{36}$/.test(u.pathname), {
        timeout: 30000,
      });
    });

    await t.krok("v Nespracovaných je bloček raz, s id bločku", async () => {
      // Druhý pokus môže dobehnúť až po presmerovaní — chvíľu počkáme.
      await page.waitForTimeout(3000);
      const r = await t.rest.get(
        `nespracovane_doklady?company_id=eq.${firma}&udaje->>cislo=eq.${encodeURIComponent(cislo)}&select=id`,
      );
      const id = (r.data ?? []).map((x) => x.id);
      t.over(id.length === 1, `nespracovaných kópií: ${id.length} (${id.join(", ")})`);
      t.over(
        id[0] === blocek.id,
        `nespracovaný doklad má iné id (${id[0]}) než bloček (${blocek.id})`,
      );
      const zost = await t.rest.get(`expense_documents?id=eq.${blocek.id}&select=id`);
      t.over((zost.data ?? []).length === 0, "bloček po presune ostal aj v Dokladoch");
      t.over(page.url().includes(blocek.id), `detail neotvoril presunutý doklad: ${page.url()}`);
    });
  },
};
