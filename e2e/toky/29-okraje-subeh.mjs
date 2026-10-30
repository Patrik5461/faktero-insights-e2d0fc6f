/*
  Súbeh pri práci s faktúrou (firma Test):
  - dvojklik na „Vystaviť“ založí jednu faktúru;
  - prerušené uloženie úpravy: faktúra nesmie prísť o položky (hlavička
    a položky sa ukladajú naraz cez RPC uloz_upravu_faktury);
  - dve karty upravujú tú istú faktúru: druhá nesmie potichu prepísať prvú.
*/
import { nacitajFakturu, zalozOdberatela, zmazFakturuNatvrdo } from "../lib/doklady.mjs";

async function vyplnFormular(t, page, { odberatel, text, polozky }) {
  await t.go("/faktury/nova", page);
  await page.locator("#odberatel-dokladu").waitFor();
  await page.click("#odberatel-dokladu");
  await page.getByPlaceholder(/Hľadať podľa mena/).fill(odberatel);
  await page.locator("button", { hasText: odberatel }).first().click({ timeout: 15000 });
  await page.getByPlaceholder(/Napríklad: Fakturujeme vám práce/).fill(text);
  for (let i = 0; i < polozky.length; i++) {
    let riadky = page.locator('tr:has(input[placeholder="Názov položky"])');
    if ((await riadky.count()) <= i) {
      await page
        .getByRole("button", { name: /Pridať položku/ })
        .first()
        .click();
      riadky = page.locator('tr:has(input[placeholder="Názov položky"])');
    }
    const r = riadky.nth(i);
    await r.locator('input[placeholder="Názov položky"]').fill(polozky[i][0]);
    const cisla = r.locator('input[type="number"]');
    await cisla.nth(0).fill(String(polozky[i][1]));
    await cisla.nth(1).fill(String(polozky[i][2]));
  }
}

export default {
  popis: "súbeh: dvojklik na Vystaviť, prerušené uloženie úpravy, dve karty nad jednou faktúrou",
  limit: 240000,
  async spusti(t) {
    const page = t.page;
    const odb = await zalozOdberatela(t);
    const faktury = async (text) =>
      (
        await t.rest.get(
          `invoices?company_id=eq.${t.firmy.test}&intro_note=eq.${encodeURIComponent(text)}&select=id,invoice_number,status,total`,
        )
      ).data ?? [];
    const uprac = (text) =>
      t.uprac(`faktúry „${text}“`, async () => {
        for (const f of await faktury(text)) await zmazFakturuNatvrdo(t, f.id);
      });

    await t.krok("dvojklik na Vystaviť založí jednu faktúru", async () => {
      const text = `${t.znacka} dvojklik`;
      uprac(text);
      await vyplnFormular(t, page, { odberatel: odb.name, text, polozky: [["Služba", 1, 100]] });
      await page.locator("#invoice-submit").dblclick();
      await page.waitForURL((u) => /\/faktury\/[0-9a-f-]{36}$/.test(u.pathname), {
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
      const f = await faktury(text);
      t.over(
        f.length === 1,
        `dvojklik založil ${f.length} faktúr: ${f.map((x) => x.invoice_number).join(", ")}`,
      );
    });

    const fa = await t.krok("faktúra na úpravy", async () => {
      const text = `${t.znacka} uprava`;
      uprac(text);
      await vyplnFormular(t, page, { odberatel: odb.name, text, polozky: [["Práca", 2, 50]] });
      await page.locator("#invoice-submit").click();
      await page.waitForURL((u) => /\/faktury\/[0-9a-f-]{36}$/.test(u.pathname), {
        timeout: 30000,
      });
      return (await faktury(text))[0];
    });

    await t.krok("prerušené uloženie úpravy: položky ostanú", async () => {
      await t.go(`/faktury/${fa.id}/upravit`);
      const nazov = page.locator('input[placeholder="Názov položky"]').first();
      await nazov.waitFor();
      await nazov.fill("Práca upravená");
      // Uloženie sa preruší: staré ukladanie po krokoch zmazalo položky a nové nevložilo,
      // RPC sa preruší celé.
      const vzor = (u) =>
        u.pathname.endsWith("/rest/v1/invoice_items") ||
        u.pathname.endsWith("/rpc/uloz_upravu_faktury");
      await page.route(vzor, (r) =>
        r.request().method() === "POST" ? r.abort("internetdisconnected") : r.continue(),
      );
      await page.getByRole("button", { name: "Uložiť zmeny" }).click();
      await page.waitForTimeout(4000);
      await page.unroute(vzor);
      const pol =
        (await t.rest.get(`invoice_items?invoice_id=eq.${fa.id}&select=name,total`)).data ?? [];
      const hl = await nacitajFakturu(t, fa.id);
      t.over(
        pol.length > 0,
        `po výpadku má faktúra ${pol.length} položiek (hlavička ${hl.total} €)`,
      );
      const sucet = pol.reduce((s, p) => s + Number(p.total), 0);
      t.over(
        Math.abs(sucet - Number(hl.total)) < 0.01,
        `položky ${sucet} € ≠ hlavička ${hl.total} €`,
      );
    });

    await t.krok("dve karty: druhá nesmie potichu prepísať prvú", async () => {
      const druha = await t.novaStranka();
      await t.go(`/faktury/${fa.id}/upravit`);
      await t.go(`/faktury/${fa.id}/upravit`, druha);
      await page.locator('input[placeholder="Názov položky"]').first().waitFor();
      await druha.locator('input[placeholder="Názov položky"]').first().waitFor();
      // Prvá karta pridá položku a uloží.
      await page.locator('input[placeholder="Názov položky"]').first().fill("Karta A");
      await page.getByRole("button", { name: "Uložiť zmeny" }).click();
      await t.cakajNa("uložená karta A", async () => {
        const p = (await t.rest.get(`invoice_items?invoice_id=eq.${fa.id}&select=name`)).data ?? [];
        return p.some((x) => x.name === "Karta A");
      });
      // Druhá karta má staré údaje a mení len text nad položkami.
      await druha
        .getByPlaceholder(/Text, ktorý sa vytlačí nad tabuľkou položiek/)
        .fill(`${t.znacka} uprava`);
      await druha.getByRole("button", { name: "Uložiť zmeny" }).click();
      await druha.waitForTimeout(4000);
      const p = (await t.rest.get(`invoice_items?invoice_id=eq.${fa.id}&select=name`)).data ?? [];
      t.over(
        p.some((x) => x.name === "Karta A"),
        `druhá karta potichu prepísala zmenu prvej (položky: ${p.map((x) => x.name).join(", ")})`,
      );
    });
  },
};
