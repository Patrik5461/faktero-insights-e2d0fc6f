/* Spoločné kroky tokov: odberateľ, vystavenie faktúry cez formulár, upratanie dokladov. */

/** Dočasný odberateľ v QA firme; po toku sa zmaže. */
export async function zalozOdberatela(t, firma = "test") {
  const o = await t.rest.vloz("customers", {
    company_id: t.firmy[firma],
    name: `${t.znacka} Odberateľ s.r.o.`,
    street: "Testovacia 1",
    city: "Bratislava",
    zip: "81101",
    country: "SK",
  });
  t.uprac("odberateľ", async () => {
    const r = await t.rest.delete(`customers?id=eq.${o.id}`);
    if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
  });
  return o;
}

/**
 * Vystaví faktúru cez formulár /faktury/nova a vráti jej riadok z databázy.
 * `polozky`: [[názov, množstvo, cena, sadzba DPH]].
 */
export async function vystavFakturu(
  t,
  { odberatel, polozky, text, cesta = "/faktury/nova", tlacidlo },
) {
  const page = t.page;
  await t.go(cesta);
  await page.locator("#odberatel-dokladu").waitFor();
  if (odberatel) {
    await page.click("#odberatel-dokladu");
    await page.getByPlaceholder(/Hľadať podľa mena/).fill(odberatel);
    await page.locator("button", { hasText: odberatel }).first().click({ timeout: 15000 });
  }
  if (text) await page.getByPlaceholder(/Napríklad: Fakturujeme vám práce/).fill(text);
  for (let i = 0; i < (polozky ?? []).length; i++) {
    let riadky = page.locator('tr:has(input[placeholder="Názov položky"])');
    if ((await riadky.count()) <= i) {
      await page
        .getByRole("button", { name: /Pridať položku/ })
        .first()
        .click();
      riadky = page.locator('tr:has(input[placeholder="Názov položky"])');
    }
    const r = riadky.nth(i);
    const [nazov, mn, cena, dph] = polozky[i];
    await r.locator('input[placeholder="Názov položky"]').fill(nazov);
    const cisla = r.locator('input[type="number"]');
    await cisla.nth(0).fill(String(mn));
    await cisla.nth(1).fill(String(cena));
    if (dph !== undefined) await r.locator("select").first().selectOption(String(dph));
  }
  const predtym = page.url();
  await (
    tlacidlo
      ? page.getByRole("button", { name: tlacidlo, exact: true })
      : page.locator("#invoice-submit")
  ).click();
  await page
    .waitForURL((u) => /\/faktury\/[0-9a-f-]{36}$/.test(u.pathname) && u.href !== predtym, {
      timeout: 30000,
    })
    .catch(async () => {
      const hlasky = t.hlasky.slice(-3).join(" | ");
      throw new Error(`po uložení som neprešiel na detail faktúry (${page.url()}) ${hlasky}`);
    });
  const id = page.url().match(/\/faktury\/([0-9a-f-]{36})/)[1];
  t.uprac(`faktúra ${id.slice(0, 8)}`, () => zmazFakturuNatvrdo(t, id));
  return await nacitajFakturu(t, id);
}

export async function nacitajFakturu(t, id) {
  const r = await t.rest.get(`invoices?id=eq.${id}&select=*`);
  if (r.status !== 200 || !r.data?.[0]) throw new Error(`faktúra ${id} sa nenačítala: ${r.status}`);
  return r.data[0];
}

/**
 * Zmaže faktúru aj s položkami. Mazanie v rozhraní je mäkké (deleted_at) —
 * test ho skúša, ale v QA firme po sebe nemá nechávať kôš plný kópií.
 */
export async function zmazFakturuNatvrdo(t, id) {
  await t.rest.delete(`payments?invoice_id=eq.${id}`);
  await t.rest.delete(`invoice_items?invoice_id=eq.${id}`);
  const r = await t.rest.delete(`invoices?id=eq.${id}`);
  if (r.status >= 300) {
    // Keď to nejde natvrdo (cudzí kľúč), aspoň do koša.
    await t.rest.patch(`invoices?id=eq.${id}`, { deleted_at: new Date().toISOString() });
    throw new Error(
      `natvrdo sa nedala zmazať (${r.status} ${r.text.slice(0, 160)}), ostala v koši`,
    );
  }
}

/** Otvorí ponuku „Ďalšie akcie“ v hlavičke detailu a klikne na položku. */
export async function akciaVMenu(page, nazov) {
  await page.getByRole("button", { name: "Ďalšie akcie" }).first().click();
  await page.getByRole("menuitem", { name: nazov, exact: true }).first().click();
}
