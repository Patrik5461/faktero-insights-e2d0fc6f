/*
  Vystavená faktúra celým životom:
  formulár → vystavenie → PDF (rozpis DPH, suma, pätička faktero.sk, platobné
  údaje na 1. strane) → kópia ako koncept → vystavenie konceptu → dobropis →
  zmazanie (mäkké, do koša). Na konci sa všetko zmaže natvrdo.
*/
import { textPdf } from "../lib/pdf.mjs";
import { akciaVMenu, nacitajFakturu, vystavFakturu, zalozOdberatela } from "../lib/doklady.mjs";

export default {
  popis: "vystavená faktúra: koncept, vystavenie, PDF, dobropis, zmazanie",
  limit: 180000,
  async spusti(t) {
    const page = t.page;
    const odb = await zalozOdberatela(t);

    const fa = await t.krok("vystavenie cez formulár", async () => {
      const f = await vystavFakturu(t, {
        odberatel: odb.name,
        text: `${t.znacka} — fakturujeme testovacie služby`,
        polozky: [
          [`${t.znacka} služba`, 2, 50, 23],
          [`${t.znacka} tovar`, 1, 10, 5],
        ],
      });
      t.over(f.status === "issued", `stav ${f.status}, čakal som issued`);
      // 2 × 50 + 23 % = 123,00; 10 + 5 % = 10,50
      t.over(Math.abs(Number(f.total) - 133.5) < 0.001, `suma ${f.total}, čakal som 133.50`);
      t.over(f.invoice_number, "faktúra nemá číslo");
      return f;
    });

    await t.krok("PDF faktúry", async () => {
      await page
        .getByRole("button", { name: /^(Stiahnuť PDF|Vygenerovať PDF)$/ })
        .first()
        .waitFor();
      const subor = await t.stiahni(
        () =>
          page
            .getByRole("button", { name: /^(Stiahnuť PDF|Vygenerovať PDF)$/ })
            .first()
            .click(),
        "faktura",
      );
      const strany = await textPdf(subor);
      const vsetko = strany.join("\n");
      const prva = strany[0].replace(/\s+/g, " ");
      t.over(vsetko.includes(fa.invoice_number), `v PDF chýba číslo ${fa.invoice_number}`);
      t.over(/133[,.]50/.test(vsetko), "v PDF chýba suma 133,50");
      // Rozpis DPH: obe sadzby so základom a daňou.
      for (const [sadzba, zaklad, dan] of [
        ["23", "100[,.]00", "23[,.]00"],
        ["5", "10[,.]00", "0[,.]50"],
      ]) {
        t.over(new RegExp(`\\b${sadzba}\\s?%`).test(vsetko), `v rozpise DPH chýba ${sadzba} %`);
        t.over(
          new RegExp(zaklad).test(vsetko) && new RegExp(dan).test(vsetko),
          `rozpis DPH ${sadzba} %: chýba základ/daň`,
        );
      }
      t.over(
        /faktero\.sk/i.test(strany[strany.length - 1]),
        "pätička faktero.sk chýba na poslednej strane",
      );
      // Platobné údaje na prvej strane: IBAN firmy a variabilný symbol.
      const iban = /SK\d{2}(?:\s?\d{4}){5}/.exec(prva)?.[0];
      t.over(iban, "na 1. strane PDF nie je IBAN");
      t.over(
        prva.includes(String(fa.variable_symbol ?? fa.invoice_number).replace(/\D/g, "")),
        "na 1. strane PDF nie je variabilný symbol",
      );
      t.log(`PDF ${strany.length} str., ${fa.invoice_number}`);
    });

    const koncept = await t.krok("kópia ako koncept", async () => {
      await akciaVMenu(page, "Klonovať");
      await page.waitForURL(/\/faktury\/[0-9a-f-]{36}\/upravit/, { timeout: 30000 });
      const id = page.url().match(/\/faktury\/([0-9a-f-]{36})/)[1];
      t.uprac(`koncept ${id.slice(0, 8)}`, async () => {
        const { zmazFakturuNatvrdo } = await import("../lib/doklady.mjs");
        await zmazFakturuNatvrdo(t, id);
      });
      const k = await nacitajFakturu(t, id);
      t.over(k.status === "draft", `kópia má stav ${k.status}, čakal som draft`);
      return k;
    });

    await t.krok("vystavenie konceptu", async () => {
      await t.go(`/faktury/${koncept.id}`);
      await page.getByText("Toto je koncept.").waitFor();
      await page.getByRole("button", { name: "Vystaviť faktúru", exact: true }).first().click();
      // Pri starom dátume sa appka pýta, či dať dnešný — potvrdí sa.
      const okno = page.getByRole("alertdialog");
      if (await okno.isVisible({ timeout: 2000 }).catch(() => false))
        await okno.getByRole("button").last().click();
      const k = await t.cakajNa("koncept vystavený", async () => {
        const x = await nacitajFakturu(t, koncept.id);
        return x.status === "issued" ? x : null;
      });
      t.over(
        k.invoice_number && k.invoice_number !== fa.invoice_number,
        `koncept dostal číslo ${k.invoice_number}`,
      );
    });

    const dobropis = await t.krok("dobropis k faktúre", async () => {
      await t.go(`/faktury/${fa.id}`);
      await akciaVMenu(page, "Vystaviť dobropis");
      await page.waitForURL(/\/faktury\/nova/);
      const d = await vystavFakturu(t, {
        cesta: page.url().replace(t.base, ""),
        tlacidlo: "Vystaviť dobropis",
      });
      t.over(d.type === "credit_note", `typ ${d.type}, čakal som credit_note`);
      t.over(
        Math.abs(Math.abs(Number(d.total)) - 133.5) < 0.001,
        `dobropis na ${d.total}, čakal som ±133.50`,
      );
      return d;
    });

    await t.krok("zmazanie do koša", async () => {
      for (const id of [dobropis.id, koncept.id, fa.id]) {
        await t.go(`/faktury/${id}`);
        await akciaVMenu(page, "Vymazať");
        const okno = page.getByRole("dialog").or(page.getByRole("alertdialog")).last();
        await okno.waitFor();
        await okno
          .getByRole("button", { name: /Vymazať|Zmazať|Potvrdiť/ })
          .last()
          .click();
        await page.waitForURL((u) => u.pathname === "/faktury", { timeout: 20000 });
        const x = await nacitajFakturu(t, id);
        t.over(x.deleted_at, `faktúra ${x.invoice_number} nemá deleted_at`);
      }
    });
  },
};
