/*
  Detail vystavenej faktúry — akcie podľa stavu (balík B3, AB-17–AB-26, K-17)
  a vymazaná faktúra (rozhodnutie 3). QA firma Test:
  - koncept a storno: v „…“ nie je „Označiť ako uhradenú“ ani „Odoslané iným
    spôsobom“, „Odoslať eFaktúru“ je vypnuté;
  - po splatnosti: odznak „Po splatnosti“; uhradená: „Označiť ako neuhradenú“;
  - po 3. upomienke okno povie, že všetky boli odoslané (nič sa neodošle);
  - vymazaná faktúra z odkazu: pás „Faktúra je v koši“, bez akcií, Obnoviť
    z koša ju vráti (deleted_at = null).
  Faktúry sa po toku zmažú natvrdo.
*/
import { vlozOdoslanuUpomienku, zmazFakturuNatvrdo } from "../lib/doklady.mjs";

function posunDni(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function zaloz(t, kod, o) {
  const f = await t.rest.vloz("invoices", {
    company_id: t.firmy.test,
    invoice_number: `${t.znacka}-DS${kod}`,
    type: "regular",
    status: "issued",
    issue_date: posunDni(t.dnes, -30),
    delivery_date: posunDni(t.dnes, -30),
    due_date: posunDni(t.dnes, -5),
    currency: "EUR",
    subtotal: 100,
    vat_total: 23,
    total: 123,
    customer_name: `${t.znacka} Detail`,
    ...o,
  });
  t.uprac(`faktúra ${f.invoice_number}`, () => zmazFakturuNatvrdo(t, f.id));
  await t.rest.vloz("invoice_items", {
    invoice_id: f.id,
    name: "Konzultácia",
    quantity: 1,
    unit_price: 100,
    vat_rate: 23,
    subtotal: 100,
    vat_amount: 23,
    total: 123,
    position: 0,
  });
  return f;
}

async function otvorMenu(t, id) {
  const page = t.page;
  await t.go(`/faktury/${id}`);
  const b = page.getByRole("button", { name: "Ďalšie akcie" }).first();
  await b.waitFor({ timeout: 30000 });
  await b.click();
  await page.getByRole("menu").first().waitFor({ timeout: 10000 });
  return page.getByRole("menu").first();
}

export default {
  popis: "detail faktúry: akcie podľa stavu, po splatnosti, 3. upomienka, faktúra v koši",
  limit: 240000,
  async spusti(t) {
    const page = t.page;
    await page.setViewportSize({ width: 1440, height: 900 });
    const f = await t.krok(
      "príprava: koncept, storno, po splatnosti, uhradená, 3 upomienky, v koši",
      async () => ({
        koncept: await zaloz(t, "K", { status: "draft", due_date: posunDni(t.dnes, -20) }),
        storno: await zaloz(t, "S", { status: "cancelled", cancelled_at: `${t.dnes}T08:00:00Z` }),
        po: await zaloz(t, "P", { status: "sent", sent_at: `${t.dnes}T08:00:00Z` }),
        uhradena: await zaloz(t, "U", { status: "paid", paid_at: `${t.dnes}T08:00:00Z` }),
        upomienky: await zaloz(t, "R", {}),
        kos: await zaloz(t, "D", { deleted_at: new Date().toISOString() }),
      }),
    );
    for (const n of [1, 2, 3])
      await vlozOdoslanuUpomienku(t, {
        invoiceId: f.upomienky.id,
        companyId: t.firmy.test,
        cislo: n,
      });

    for (const [kod, nazov] of [
      ["koncept", "koncept"],
      ["storno", "storno"],
    ]) {
      await t.krok(
        `${nazov}: bez „Uhradená“ a „Odoslané iným spôsobom“, eFaktúra vypnutá`,
        async () => {
          const menu = await otvorMenu(t, f[kod].id);
          t.over(
            (await menu.getByRole("menuitem", { name: "Označiť ako uhradenú" }).count()) === 0,
            `${nazov} ponúka „Označiť ako uhradenú“`,
          );
          t.over(
            (await menu.getByRole("menuitem", { name: "Odoslané iným spôsobom" }).count()) === 0,
            `${nazov} ponúka „Odoslané iným spôsobom“`,
          );
          await page.keyboard.press("Escape");
          const ef = page.getByRole("button", { name: /Odoslať eFaktúru/ }).first();
          t.over(await ef.isDisabled(), `${nazov}: „Odoslať eFaktúru“ je aktívne`);
          // Koncept nie je po splatnosti, ani so starou splatnosťou.
          t.over(
            (await page.getByText("Po splatnosti", { exact: true }).count()) === 0,
            `${nazov} má odznak Po splatnosti`,
          );
        },
      );
    }

    await t.krok(
      "po splatnosti: odznak „Po splatnosti“, „Odoslané iným spôsobom“ už nie",
      async () => {
        const menu = await otvorMenu(t, f.po.id);
        t.over(
          (await menu.getByRole("menuitem", { name: "Odoslané iným spôsobom" }).count()) === 0,
          "odoslaná faktúra ponúka „Odoslané iným spôsobom“",
        );
        t.over(
          (await menu.getByRole("menuitem", { name: "Označiť ako uhradenú" }).count()) === 1,
          "odoslaná faktúra neponúka „Označiť ako uhradenú“",
        );
        await page.keyboard.press("Escape");
        await page.getByText("Po splatnosti", { exact: true }).first().waitFor({ timeout: 10000 });
      },
    );

    await t.krok("uhradená: „Označiť ako neuhradenú“ v ponuke", async () => {
      const menu = await otvorMenu(t, f.uhradena.id);
      t.over(
        (await menu.getByRole("menuitem", { name: "Označiť ako neuhradenú" }).count()) === 1,
        "chýba „Označiť ako neuhradenú“",
      );
      await page.keyboard.press("Escape");
    });

    await t.krok("po 3. upomienke: okno „všetky odoslané“, nič sa neodošle", async () => {
      const menu = await otvorMenu(t, f.upomienky.id);
      await menu.getByRole("menuitem", { name: "Poslať upomienku" }).click();
      const okno = page.getByRole("alertdialog").last();
      await okno.waitFor({ timeout: 15000 });
      const text = await okno.innerText();
      t.over(/Všetky upomienky/.test(text), `okno: ${text.slice(0, 200)}`);
      await okno.getByRole("button", { name: "Zrušiť" }).click();
      const r = await t.rest.get(`invoice_reminders?invoice_id=eq.${f.upomienky.id}&select=id`);
      t.over(r.data?.length === 3, `upomienok je ${r.data?.length}`);
    });

    await t.krok("faktúra v koši: pás, bez akcií, Obnoviť z koša", async () => {
      await t.go(`/faktury/${f.kos.id}`);
      const pas = page.locator("[data-faktura-v-kosi]");
      await pas.waitFor({ timeout: 30000 });
      await page.getByText("Faktúra je v koši").first().waitFor();
      t.over(
        (await page.getByRole("button", { name: /Odoslať eFaktúru|E-mailom/ }).count()) === 0,
        "vymazaná faktúra ponúka odoslanie",
      );
      t.over(
        (await page.locator("section#zauctovanie").count()) === 0,
        "vymazaná faktúra má zaúčtovanie",
      );
      await page.getByRole("button", { name: "Obnoviť z koša" }).first().click();
      await t.cakajNa("faktúra obnovená", async () => {
        const r = await t.rest.get(`invoices?id=eq.${f.kos.id}&select=deleted_at`);
        return r.data?.[0] && r.data[0].deleted_at === null;
      });
      await pas.waitFor({ state: "detached", timeout: 15000 });
    });
  },
};
