/*
  Koniec súhlasu Tatra banky sa ukáže vopred (firma Test).

  Do QA firmy sa vloží pripojenie TB bez tokenu so súhlasom, ktorý vyprší o 10
  dní. Na /bankove-ucty musí karta banky hlásiť „Súhlas banky vyprší …“ a mať
  tlačidlo Obnoviť súhlas (neklikáme naň — založilo by súhlas v banke); vo
  zvončeku musí byť „Súhlas Tatra banky vyprší …“. Pripojenie sa zmaže.

  Do banky nejde nič: pripojenie nemá token, takže ho ani nočný beh nestiahne.
  E-mail o konci súhlasu posiela denný beh bánk (9:20) — ten tu nespúšťame;
  pokrýva ho unit test `bank-suhlas-pripomienky.server.test.ts`.
*/
import { randomUUID } from "node:crypto";

const datumSk = (d) => {
  const [r, m, dd] = d.split("-");
  return `${Number(dd)}. ${Number(m)}. ${r}`;
};

export default {
  popis: "banka: súhlas Tatra banky pred koncom — karta banky aj zvonček (Test)",
  limit: 90000,
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test;
    const koniec = new Date(Date.now() + 10 * 86400_000 + 3600_000);
    const den = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(koniec);

    await t.krok("príprava: QA pripojenie TB so súhlasom do 10 dní", async () => {
      const c = await t.rest.vloz("bank_connections", {
        company_id: firma,
        provider: "tatrabanka",
        status: "connected",
        consent_id: randomUUID(),
        token_expires_at: koniec.toISOString(),
        metadata: { e2e: t.znacka },
      });
      t.uprac("pripojenie", () => t.rest.delete(`bank_connections?id=eq.${c.id}`));
    });

    await t.krok("karta banky hlási koniec súhlasu a ponúka Obnoviť súhlas", async () => {
      await t.go("/bankove-ucty");
      const hlaska = page.getByText(`Súhlas banky vyprší ${datumSk(den)}`, { exact: false });
      await hlaska.first().waitFor({ timeout: 20000 });
      const karta = page.locator("div.rounded-xl").filter({ has: hlaska.first() }).first();
      t.over(
        (await karta.getByRole("button", { name: /Obnoviť súhlas/ }).count()) === 1,
        "na karte chýba tlačidlo Obnoviť súhlas",
      );
    });

    await t.krok("zvonček upozorní vopred", async () => {
      await page
        .getByRole("button", { name: /^Notifikácie/ })
        .first()
        .click();
      await page
        .getByText(`Súhlas Tatra banky vyprší ${datumSk(den)}`)
        .first()
        .waitFor({ timeout: 15000 });
      await page.keyboard.press("Escape");
    });
  },
};
