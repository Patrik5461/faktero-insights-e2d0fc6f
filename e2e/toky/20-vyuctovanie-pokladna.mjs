/*
  Pokladňa a vyúčtovanie výdavkov: vklad do pokladne cez formulár, hotovostný
  bloček uberá z pokladne; po zaradení do vyúčtovania zálohy (zamestnanec
  platil zo zálohy) sa z firemnej pokladne stratí, prijatá faktúra vo
  vyúčtovaní nejde do hromadného príkazu, PDF vyúčtovania sa stiahne.
*/
import { prijataCezRest } from "../lib/zauctovanie.mjs";

const cislo = (s) =>
  Number(
    String(s)
      .replace(/[^\d,-]/g, "")
      .replace(",", "."),
  );

export default {
  popis: "pokladňa (vklad, hotovostný bloček) a vyúčtovanie výdavkov",
  limit: 200000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;
    const vklad = `${t.znacka} vklad`;
    const obchod = `${t.znacka} Hotovosť s.r.o.`;

    t.uprac("pokladničné doklady", async () => {
      const z = await t.rest.delete(
        `cash_entries?company_id=eq.${firma}&description=eq.${encodeURIComponent(vklad)}`,
      );
      if (z.status >= 300) throw new Error(`${z.status} ${z.text.slice(0, 200)}`);
    });

    const stavPokladne = async () => {
      await t.go("/pokladna");
      await page.getByText("Stav pokladne", { exact: true }).waitFor();
      await page.waitForTimeout(1500);
      const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      const m = /Stav pokladne\s*(-?[\d\s\u00a0.,−-]+)\s*€/i.exec(text);
      if (!m) throw new Error(`stav pokladne sa nenašiel: ${text.slice(0, 200)}`);
      return cislo(m[1].replace("−", "-"));
    };

    const pred = await t.krok("stav pokladne na začiatku", stavPokladne);

    await t.krok("vklad 200 € cez formulár", async () => {
      await page.getByRole("button", { name: /Nový pokladničný doklad/ }).click();
      const form = page.locator("form");
      await form.locator("select").first().selectOption("prijem");
      await form.getByPlaceholder(/Vklad do pokladne/).fill(vklad);
      await form.locator('input[type="number"]').first().fill("200");
      await form.getByRole("button", { name: "Uložiť doklad" }).click();
      const r = await t.cakajNa("pokladničný doklad", async () => {
        const x = await t.rest.get(
          `cash_entries?company_id=eq.${firma}&description=eq.${encodeURIComponent(vklad)}&select=*`,
        );
        return x.data?.[0] ?? null;
      });
      t.over(Number(r.amount) === 200 && r.type === "prijem", `doklad ${r.type} ${r.amount}`);
      t.over(/^\S+$/.test(r.entry_number ?? ""), `číslo ${r.entry_number}`);
    });

    const blocek = await t.krok("hotovostný bloček 50 €", async () => {
      const b = await t.rest.vloz("expense_documents", {
        company_id: firma,
        status: "processed",
        source: "web",
        auto_uctovanie_at: new Date().toISOString(),
        supplier_name: obchod,
        document_number: `${t.znacka}-HOT`,
        issue_date: t.dnes,
        net_amount: 40.65,
        vat_amount: 9.35,
        total_amount: 50,
        vat_rate: 23,
        currency: "EUR",
        payment_method: "hotovost",
      });
      t.uprac("bloček", async () => {
        await t.rest.patch(`expense_documents?id=eq.${b.id}`, { vyuctovanie_id: null });
        await t.rest.delete(`expense_documents?id=eq.${b.id}`);
      });
      return b;
    });

    await t.krok("pokladňa: +200 −50", async () => {
      const s = await stavPokladne();
      t.over(Math.abs(s - (pred + 150)) < 0.005, `stav ${s}, čakal som ${pred + 150}`);
      await page.locator("main").getByText(obchod).filter({ visible: true }).first().waitFor();
    });

    const prijata = await prijataCezRest(
      t,
      {
        invoice_number: `${t.znacka}-VYUCT`,
        amount_without_vat: 24.39,
        vat_amount: 5.61,
        amount_total: 30,
      },
      "test2",
    );

    const vyuctId = await t.krok("vyúčtovanie zálohy 100 € z bločku a faktúry", async () => {
      await t.go(`/doklady/vyuctovania/novy?blocky=${blocek.id}&prijate=${prijata.id}`);
      await page.getByText(obchod).first().waitFor({ timeout: 20000 });
      await page.getByRole("radio", { name: /Vyúčtovanie poskytnutej zálohy/ }).check();
      await page
        .locator("label", { has: page.getByText(/Poskytnutá záloha/) })
        .locator("input")
        .fill("100");
      await page.getByText("Zamestnanec vráti firme 20,00 €").waitFor();
      await page.getByRole("button", { name: "Uložiť", exact: true }).click();
      await page.waitForURL(/\/doklady\/vyuctovania\/[0-9a-f-]{36}/, { timeout: 30000 });
      const id = page.url().match(/vyuctovania\/([0-9a-f-]{36})/)[1];
      t.uprac("vyúčtovanie", async () => {
        await t.rest.patch(`expense_documents?vyuctovanie_id=eq.${id}`, { vyuctovanie_id: null });
        await t.rest.patch(`purchase_invoices?vyuctovanie_id=eq.${id}`, { vyuctovanie_id: null });
        const z = await t.rest.delete(`vyuctovania_vydavkov?id=eq.${id}`);
        if (z.status >= 300) throw new Error(`${z.status} ${z.text.slice(0, 200)}`);
      });
      const b = (await t.rest.get(`expense_documents?id=eq.${blocek.id}&select=vyuctovanie_id`))
        .data[0];
      const p = (await t.rest.get(`purchase_invoices?id=eq.${prijata.id}&select=vyuctovanie_id`))
        .data[0];
      t.over(b.vyuctovanie_id === id && p.vyuctovanie_id === id, "doklady nie sú vo vyúčtovaní");
      return id;
    });

    await t.krok("PDF vyúčtovania", async () => {
      const f = await t.stiahni(
        () =>
          page
            .getByRole("button", { name: /PDF vyúčtovania/ })
            .first()
            .click(),
        "vyuctovanie",
      );
      t.over(/\.pdf$/i.test(f), `súbor ${f}`);
    });

    await t.krok("faktúra z vyúčtovania nejde do príkazu", async () => {
      await t.go("/prijate-faktury");
      const riadok = page.locator("tr", { hasText: prijata.invoice_number }).first();
      await riadok.waitFor({ timeout: 20000 });
      await riadok.locator('input[type="checkbox"]').first().check();
      await page
        .getByRole("button", { name: /Hromadný príkaz na úhradu/ })
        .first()
        .click();
      const okno = page.getByRole("dialog", { name: "Hromadný príkaz na úhradu" });
      await okno.getByText(/vyúčtovaní výdavkov/).waitFor({ timeout: 15000 });
      await okno.getByRole("button", { name: "Zavrieť" }).click();
    });

    await t.krok("bloček z vyúčtovania pokladňu neuberá", async () => {
      const s = await stavPokladne();
      t.over(
        Math.abs(s - (pred + 200)) < 0.005,
        `stav ${s}, čakal som ${pred + 200} (bloček zaplatil zamestnanec zo zálohy ${vyuctId.slice(0, 8)})`,
      );
    });
  },
};
