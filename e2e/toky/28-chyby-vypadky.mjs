/*
  Výpadky siete a vypršané prihlásenie počas práce (page.route).

  Dve podoby výpadku:
  - „spadnutá požiadavka“ — server sa o nej nedozvie (abort pred odoslaním);
  - „stratená odpoveď“ — server zápis urobí, ale odpoveď do prehliadača
    nedôjde (route.fetch → abort). To je zradnejšie: opakovaný klik nesmie
    založiť druhý doklad.

  Overuje sa: hláška nie je technická („Failed to fetch“, „TypeError“, HTML
  stránka chyby…), dáta sa nestratia, opakovanie dokončí ten istý doklad.
  Chyby našiel prieskum 30. 10. 2026: faktúra bez položiek + druhá faktúra
  po opakovaní, tichý pád bez hlášky pri výpadku čísla, surové „Failed to
  fetch“ pri zaúčtovaní a HTML nginxu v hláške exportu, prázdny formulár po
  novom prihlásení.
*/
import { zalozOdberatela, zmazFakturuNatvrdo } from "../lib/doklady.mjs";
import { pravidloPreDodavatela, zmazPrijatu } from "../lib/zauctovanie.mjs";
import { klucRelacie, QA_EMAIL, qaHeslo } from "../lib/prostredie.mjs";

const TECHNICKE =
  /TypeError|Failed to fetch|NetworkError|Load failed|PGRST|upstream|<html|JWT|HTTPError/i;

/**
 * Hlášky od posledného `t.hlasky.length = 0` — nesmú byť technické a nejaká
 * musí byť. (Zber hlášok rovnaký text druhýkrát nezapíše, preto sa vyprázdňuje.)
 */
async function overHlasku(t, co) {
  const hlasky = await t.cakajNa(
    `hláška pri ${co}`,
    async () => (t.hlasky.length ? [...t.hlasky] : null),
    { limit: 10000, krok: 300 },
  );
  const zla = hlasky.find((h) => TECHNICKE.test(h));
  t.over(!zla, `${co}: technická hláška „${zla}“`);
  return hlasky;
}

/** Požiadavky `vzor` danou metódou zlyhajú; `strataOdpovede` = server ich vybaví. */
async function vypadok(page, vzor, { strataOdpovede = false, metoda = "POST" } = {}) {
  const h = async (route) => {
    if (route.request().method() !== metoda) return route.continue();
    if (strataOdpovede) await route.fetch().catch(() => null);
    return route.abort("failed");
  };
  await page.route(vzor, h);
  return () => page.unroute(vzor, h);
}

async function vyplnFakturu(t, page, odberatel, nazov) {
  await t.go("/faktury/nova", page);
  await page.locator("#odberatel-dokladu").waitFor();
  await page.click("#odberatel-dokladu");
  await page.getByPlaceholder(/Hľadať podľa mena/).fill(odberatel);
  await page.locator("button", { hasText: odberatel }).first().click({ timeout: 15000 });
  const r = page.locator('tr:has(input[placeholder="Názov položky"])').first();
  await r.locator('input[placeholder="Názov položky"]').fill(nazov);
  const c = r.locator('input[type="number"]');
  await c.nth(0).fill("2");
  await c.nth(1).fill("10");
}

export default {
  popis: "výpadky siete a vypršané prihlásenie: hlášky, žiadne dvojité doklady, rozpísaná faktúra",
  limit: 300000,
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test;
    const odb = await zalozOdberatela(t);
    t.uprac("faktúry odberateľa", async () => {
      const r = await t.rest.get(`invoices?customer_id=eq.${odb.id}&select=id`);
      for (const f of r.data ?? []) await zmazFakturuNatvrdo(t, f.id);
    });
    const fakturyOdberatela = async () =>
      (await t.rest.get(`invoices?customer_id=eq.${odb.id}&select=id,invoice_number,total`)).data ??
      [];

    await t.krok("faktúra: položky spadnú → opakovanie dokončí tú istú", async () => {
      await vyplnFakturu(t, page, odb.name, `${t.znacka} položky`);
      const pusti = await vypadok(page, "**/rest/v1/invoice_items*");
      t.hlasky.length = 0;
      await page.locator("#invoice-submit").click();
      await overHlasku(t, "výpadku položiek");
      await pusti();
      t.over(/\/faktury\/nova/.test(page.url()), "formulár sa zavrel");
      await page.locator("#invoice-submit").click();
      await page.waitForURL(/\/faktury\/[0-9a-f-]{36}$/, { timeout: 30000 });
      const f = await fakturyOdberatela();
      t.over(
        f.length === 1,
        `po opakovaní je faktúr ${f.length} (${f.map((x) => x.invoice_number)})`,
      );
      const pol = await t.rest.get(`invoice_items?invoice_id=eq.${f[0].id}&select=id`);
      t.over(pol.data?.length === 1, `faktúra má ${pol.data?.length} položiek`);
    });

    await t.krok("faktúra: stratená odpoveď hlavičky → bez druhej faktúry", async () => {
      const pred = (await fakturyOdberatela()).length;
      await vyplnFakturu(t, page, odb.name, `${t.znacka} hlavička`);
      const pusti = await vypadok(page, "**/rest/v1/invoices?*", { strataOdpovede: true });
      t.hlasky.length = 0;
      await page.locator("#invoice-submit").click();
      await overHlasku(t, "stratenej odpovedi");
      await pusti();
      await page.locator("#invoice-submit").click();
      await page.waitForURL(/\/faktury\/[0-9a-f-]{36}$/, { timeout: 30000 });
      const f = await fakturyOdberatela();
      t.over(f.length === pred + 1, `pribudlo faktúr ${f.length - pred}, čakal som 1`);
    });

    await t.krok("faktúra: výpadok pri čísle → hláška, nie ticho", async () => {
      await vyplnFakturu(t, page, odb.name, `${t.znacka} číslo`);
      const pusti = await vypadok(page, "**/rest/v1/rpc/faktero_next_invoice_number*");
      t.hlasky.length = 0;
      await page.locator("#invoice-submit").click();
      await overHlasku(t, "výpadku čísla");
      await pusti();
    });

    await t.krok("prijatá faktúra: stratená odpoveď → jedna", async () => {
      await pravidloPreDodavatela(t, t.znacka);
      const cislo = `${t.znacka}-PFV`;
      t.uprac("prijaté", async () => {
        const r = await t.rest.get(
          `purchase_invoices?company_id=eq.${firma}&invoice_number=eq.${cislo}&select=id`,
        );
        for (const p of r.data ?? []) await zmazPrijatu(t, p.id);
        await t.rest.delete(
          `customers?company_id=eq.${firma}&name=eq.${encodeURIComponent(`${t.znacka} Výpadok s.r.o.`)}`,
        );
      });
      await t.go("/prijate-faktury/nova");
      const pole = (label) =>
        page
          .locator("label")
          .filter({ has: page.getByText(label, { exact: true }) })
          .locator("input, select, textarea")
          .first();
      await pole("Názov *").fill(`${t.znacka} Výpadok s.r.o.`);
      await pole("Číslo faktúry dodávateľa *").fill(cislo);
      await pole("Dátum vystavenia").fill(t.dnes);
      await pole("Dátum dodania (daňového plnenia)").fill(t.dnes);
      await pole("Dátum splatnosti").fill(t.dnes);
      await pole("Bez DPH").fill("10");
      await pole("DPH").fill("2.3");
      const pusti = await vypadok(page, "**/rest/v1/purchase_invoices*", { strataOdpovede: true });
      t.hlasky.length = 0;
      await page.getByRole("button", { name: "Uložiť prijatú faktúru" }).click();
      await overHlasku(t, "stratenej odpovedi prijatej");
      await pusti();
      await page.getByRole("button", { name: "Uložiť prijatú faktúru" }).click();
      // Pri duplicite by sa formulár pýtal — nesmie, je to tá istá faktúra.
      await page.waitForURL(/\/prijate-faktury\/[0-9a-f-]{36}/, { timeout: 30000 });
      const r = await t.rest.get(
        `purchase_invoices?company_id=eq.${firma}&invoice_number=eq.${cislo}&select=id`,
      );
      t.over(r.data?.length === 1, `prijatých faktúr ${r.data?.length}, čakal som 1`);
    });

    await t.krok("bloček: stratená odpoveď → jeden", async () => {
      const cislo = `${t.znacka}-BV`;
      t.uprac("bločky", async () => {
        await t.rest.delete(
          `expense_documents?company_id=eq.${firma}&document_number=eq.${encodeURIComponent(cislo)}`,
        );
      });
      await t.go("/doklady/novy");
      const pole = (label) =>
        page
          .locator("label")
          .filter({ has: page.getByText(label, { exact: true }) })
          .locator("input, select")
          .first();
      await pole("Dodávateľ").waitFor();
      await pole("Dodávateľ").fill(`${t.znacka} Obchod`);
      await pole("Číslo dokladu").fill(cislo);
      await pole("Dátum vystavenia").fill(t.dnes);
      await pole("Celkom").fill("12.3");
      await page
        .locator("select")
        .filter({ has: page.locator('option[value="hotovost"]') })
        .first()
        .selectOption("karta");
      const pusti = await vypadok(page, "**/_serverFn/**", { strataOdpovede: true });
      t.hlasky.length = 0;
      await page.getByRole("button", { name: "Uložiť doklad" }).click();
      await overHlasku(t, "stratenej odpovedi bločku");
      await pusti();
      await page.getByRole("button", { name: "Uložiť doklad" }).click();
      await page.waitForURL(/\/doklady(\?|$)/, { timeout: 30000 });
      const r = await t.rest.get(
        `expense_documents?company_id=eq.${firma}&document_number=eq.${encodeURIComponent(cislo)}&select=id`,
      );
      t.over(r.data?.length === 1, `bločkov ${r.data?.length}, čakal som 1`);
    });

    await t.krok(
      "export: stránka chyby z nginx → zrozumiteľná hláška, nič neodovzdané",
      async () => {
        const zac = new Date().toISOString();
        await t.go("/exporty");
        const sekcia = page
          .locator("div.rounded-2xl")
          .filter({ has: page.getByRole("button", { name: "Vybrať všetko", exact: true }) })
          .last();
        await sekcia.getByRole("button", { name: "Exportovať", exact: true }).waitFor();
        const h = (route) =>
          route.request().method() === "POST"
            ? route.fulfill({
                status: 502,
                contentType: "text/html",
                body: "<html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>",
              })
            : route.continue();
        await page.route("**/_serverFn/**", h);
        const datumy = sekcia.locator('input[type="date"]');
        await datumy.nth(0).fill(t.dnes);
        await datumy.nth(1).fill(t.dnes);
        // Keby výpadok nezabral, nič sa nesmie označiť ako odovzdané.
        const oznacit = sekcia.getByLabel(/Označiť ako odovzdané/);
        if (await oznacit.isChecked()) await oznacit.uncheck();
        await sekcia.getByRole("button", { name: "Vybrať všetko", exact: true }).click();
        t.hlasky.length = 0;
        await sekcia.getByRole("button", { name: "Exportovať", exact: true }).click();
        await overHlasku(t, "chybe servera pri exporte");
        await page.unroute("**/_serverFn/**", h);
        const j = await t.rest.get(
          `export_jobs?company_id=eq.${firma}&created_at=gte.${zac}&select=id`,
        );
        t.over(!j.data?.length, `pri chybe vznikol záznam exportu (${j.data?.length})`);
      },
    );

    await t.krok("vypršané prihlásenie: návrat k rozpísanej faktúre", async () => {
      const heslo = qaHeslo();
      t.over(heslo, "chýba heslo QA účtu");
      const p2 = await t.novaStranka();
      const nazov = `${t.znacka} rozpísaná`;
      await vyplnFakturu(t, p2, odb.name, nazov);
      await p2.waitForTimeout(1200); // formulár sa odkladá s oneskorením
      // Relácia zmizne len v tejto karte — server ju nezruší (signOut nevoláme).
      await p2.evaluate((k) => localStorage.removeItem(k), klucRelacie());
      await p2.reload();
      await p2.waitForURL(/\/prihlasenie/, { timeout: 20000 });
      t.over(
        /dalej=%2Ffaktury%2Fnova|dalej=\/faktury\/nova/.test(p2.url()),
        `prihlásenie nevie, kam sa vrátiť (${p2.url()})`,
      );
      await p2.fill('input[type="email"]', QA_EMAIL);
      await p2.fill('input[type="password"]', heslo);
      await p2.click('button[type="submit"]');
      await p2.waitForURL(/\/faktury\/nova/, { timeout: 40000 });
      await p2.getByRole("button", { name: "Obnoviť", exact: true }).click({ timeout: 15000 });
      const pole = p2.locator('input[placeholder="Názov položky"]').first();
      await t.cakajNa("obnovená položka", async () => (await pole.inputValue()) === nazov, {
        limit: 5000,
      });
    });
  },
};
