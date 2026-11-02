/*
  Menu a nastavenia podľa roly (opravy B4 z 1. 11. 2026). Rolu QA účtu
  nemeníme — prehliadaču sa len podvrhne odpoveď `company_users` (rola
  a oprávnenia), z ktorej si ju berie menu aj stránka /firma. Databáza
  zápis stráži sama, tu sa overuje, čo UI ukáže:
  - S-14: zamestnanec nemá pod avatarom API kľúče ani Webhooky, účtovník áno
    (od 2. 11. 2026 má plné práva ako admin);
  - S-19: vlastný prístup len s dokladmi nemá v „Vytvoriť“ faktúru ani produkt;
  - S-13: /firma je pre zamestnanca len na čítanie (polia vypnuté, bez Uložiť),
    účtovník ju upravuje;
  - AB-08: Doklady → Vystavené faktúry svieti v Dokladoch;
  - S-17: /firmy „Upraviť“ pri neaktívnej firme otvorí tú firmu.
  Nič nezapisuje do databázy.
*/
async function podvrhniRolu(page, rola, opravnenia = {}) {
  await page.route("**/rest/v1/company_users?*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const r = await route.fetch();
    let telo = await r.text();
    try {
      const data = JSON.parse(telo);
      const zmen = (x) =>
        x && typeof x === "object" && "role" in x
          ? { ...x, role: rola, permissions: opravnenia }
          : x;
      telo = JSON.stringify(Array.isArray(data) ? data.map(zmen) : zmen(data));
    } catch {
      /* nechaj, ako je */
    }
    await route.fulfill({ response: r, body: telo });
  });
}

async function otvorPonuku(page, nazov) {
  await page.getByRole("button", { name: nazov, exact: true }).first().click();
  const m = page.getByRole("menu").last();
  await m.waitFor({ timeout: 10000 });
  const texty = await m.getByRole("menuitem").allInnerTexts();
  await page.keyboard.press("Escape");
  return texty.map((x) => x.trim());
}

export default {
  popis: "menu podľa roly: avatar, Vytvoriť, /firma na čítanie, aktívna položka, /firmy Upraviť",
  limit: 150000,
  async spusti(t) {
    const page = t.page;

    await t.krok("majiteľ: pod avatarom API kľúče aj Webhooky", async () => {
      await t.go("/dashboard");
      const polozky = await otvorPonuku(page, "Účet");
      t.over(polozky.includes("API kľúče"), `chýbajú API kľúče: ${polozky.join(" | ")}`);
      t.over(polozky.includes("Webhooky"), "chýbajú Webhooky");
    });

    await t.krok("Doklady → Vystavené faktúry svieti v Dokladoch (AB-08)", async () => {
      await t.go("/faktury");
      const aktivna = page.locator('nav a[aria-current="page"]').first();
      await aktivna.waitFor({ timeout: 15000 });
      const text = (await aktivna.innerText()).trim();
      t.over(text === "Vystavené faktúry", `svieti „${text}“`);
    });

    await t.krok("/firmy: Upraviť pri inej firme ju prepne a otvorí (S-17)", async () => {
      await page.evaluate((id) => localStorage.setItem("faktero.active_company", id), t.firmy.test);
      await t.go("/firmy");
      const riadok = page.locator("tr, li, article, div.rounded-xl", { hasText: "test2" }).filter({
        has: page.getByRole("button", { name: "Upraviť", exact: true }),
      });
      await riadok.last().getByRole("button", { name: "Upraviť", exact: true }).click();
      await page.waitForURL(/\/firma$/, { timeout: 20000 });
      const firma = await page.evaluate(() => localStorage.getItem("faktero.active_company"));
      t.over(firma === t.firmy.test2, `aktívna firma ${firma}, čakal som test2`);
      await page.evaluate((id) => localStorage.setItem("faktero.active_company", id), t.firmy.test);
    });

    await t.krok("účtovník: avatar s API kľúčmi a Webhookmi ako admin (od 2. 11. 2026)", async () => {
      await podvrhniRolu(page, "accountant");
      await t.go("/dashboard");
      const polozky = await otvorPonuku(page, "Účet");
      t.over(polozky.includes("API kľúče"), `účtovník nevidí API kľúče: ${polozky.join(" | ")}`);
      t.over(polozky.includes("Webhooky"), "účtovník nevidí Webhooky");
      t.over(polozky.includes("Firma"), "účtovník nevidí Firmu");
    });

    await t.krok("účtovník: /firma upravuje ako admin", async () => {
      await t.go("/firma");
      await page.getByRole("button", { name: "Uložiť zmeny" }).first().waitFor({ timeout: 15000 });
      t.over(
        (await page.getByText("Vidíte ich len na čítanie.", { exact: false }).count()) === 0,
        "účtovník má /firmu len na čítanie",
      );
      const pole = page.locator("main input").first();
      t.over(!(await pole.isDisabled()), "polia firmy sú pre účtovníka vypnuté");
    });

    await t.krok("zamestnanec: avatar bez API kľúčov a Webhookov (S-14)", async () => {
      await page.unroute("**/rest/v1/company_users?*");
      await podvrhniRolu(page, "employee");
      await t.go("/dashboard");
      const polozky = await otvorPonuku(page, "Účet");
      t.over(!polozky.includes("API kľúče"), "zamestnanec vidí API kľúče");
      t.over(!polozky.includes("Webhooky"), "zamestnanec vidí Webhooky");
      t.over(polozky.includes("Firma"), "zamestnanec nevidí Firmu (má ju vidieť na čítanie)");
    });

    await t.krok("zamestnanec: /firma len na čítanie (S-13)", async () => {
      await t.go("/firma");
      await page
        .getByText("Vidíte ich len na čítanie.", { exact: false })
        .waitFor({ timeout: 15000 });
      t.over(
        (await page.getByRole("button", { name: "Uložiť zmeny" }).count()) === 0,
        "vidno Uložiť zmeny",
      );
      const pole = page.locator("main input").first();
      t.over(await pole.isDisabled(), "polia firmy nie sú vypnuté");
      t.over(
        (await page.getByRole("button", { name: "Pozvať používateľa" }).count()) === 0,
        "zamestnanec môže pozývať",
      );
    });

    await t.krok(
      "vlastný prístup len s dokladmi: Vytvoriť bez faktúry a produktu (S-19)",
      async () => {
        await page.unroute("**/rest/v1/company_users?*");
        await podvrhniRolu(page, "custom", { doklady: "edit" });
        await t.go("/dashboard");
        const polozky = await otvorPonuku(page, "Vytvoriť");
        t.over(!polozky.includes("Nová faktúra"), `vidí Novú faktúru: ${polozky.join(" | ")}`);
        t.over(!polozky.includes("Nový produkt"), "vidí Nový produkt");
        t.over(polozky.includes("Nová samofaktúra"), "nevidí samofaktúru (doklady)");
      },
    );
  },
};
