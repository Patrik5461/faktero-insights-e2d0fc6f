/*
  Kontakty na podporu na verejnom webe a v aplikácii (nič nezapisuje):
  - Telegram v pätičke úvodnej stránky (má vlastnú pätičku, nie MarketingShell) a na Kontakte;
  - plávajúca Pomoc ukáže Telegram hneď po otvorení, je to `role="dialog"` a Esc ju zavrie;
  - WhatsApp, kým nie je zapnutý (žiadny odkaz wa.me na webe), nespomína ani manuál podpory;
  - kanonická adresa úvodnej stránky je na www;
  - v aplikácii: tlačidlo Telegram v hlavičke Pomoc a podpora a položka v ponuke pod avatarom.
*/
export default {
  popis: "podpora: Telegram na webe a v appke, WhatsApp len keď je zapnutý",
  limit: 90000,
  async spusti(t) {
    // Verejný web bez prihlásenia — vlastný kontext bez relácie.
    const ctx = await t.page
      .context()
      .browser()
      .newContext({
        viewport: { width: 1400, height: 1000 },
        locale: "sk-SK",
      });
    const web = await ctx.newPage();
    web.setDefaultTimeout(20000);
    try {
      let whatsappZapnuty = false;

      await t.krok("Telegram v pätičke úvodnej stránky a Kontaktu", async () => {
        for (const cesta of ["/", "/kontakt"]) {
          await t.go(cesta, web);
          const tg = await web.locator('footer a[href^="https://t.me/"]').count();
          t.over(tg > 0, `${cesta}: v pätičke chýba odkaz na Telegram`);
          whatsappZapnuty ||= (await web.locator('footer a[href*="wa.me"]').count()) > 0;
        }
        const kanonicka = await web.evaluate(
          () => document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
        );
        t.over(
          kanonicka === "https://www.faktero.sk/",
          `kanonická adresa úvodnej stránky je ${kanonicka}, čaká sa https://www.faktero.sk/`,
        );
      });

      await t.krok("plávajúca Pomoc: Telegram hneď, dialóg, Esc", async () => {
        await t.go("/kontakt", web);
        await web
          .getByRole("button", { name: /Prijať všetko/ })
          .first()
          .click({ timeout: 3000 })
          .catch(() => {});
        await web.getByRole("button", { name: "Opýtajte sa Faktero AI" }).click();
        const okno = web.getByRole("dialog", { name: "Faktero AI podpora" });
        await okno.waitFor();
        t.over(
          (await okno.locator('a[href^="https://t.me/"]').count()) > 0,
          "plávajúca Pomoc neukazuje Telegram, kým AI nepovie „neviem“",
        );
        await web.keyboard.press("Escape");
        await okno.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
        t.over((await okno.count()) === 0, "Esc nezavrel plávajúcu Pomoc");
      });

      await t.krok("WhatsApp v manuáli podpory len keď je zapnutý", async () => {
        await t.go("/pomoc/podpora", web);
        const text = await web.locator("main").innerText();
        if (!whatsappZapnuty)
          t.over(!/WhatsApp/.test(text), "manuál podpory spomína WhatsApp, hoci nie je zapnutý");
      });
    } finally {
      await ctx.close().catch(() => {});
    }

    await t.krok("aplikácia: Telegram na Pomoc a podpora a pod avatarom", async () => {
      const page = t.page;
      await t.go("/podpora");
      await page.locator("a[data-telegram-tlacidlo]").first().waitFor({ timeout: 20000 });
      await page.locator("header button[aria-haspopup=menu]").last().click();
      const polozka = page.getByRole("menuitem", { name: /Napísať na Telegram/ });
      await polozka.waitFor({ timeout: 5000 });
      await page.keyboard.press("Escape");
    });
  },
};
