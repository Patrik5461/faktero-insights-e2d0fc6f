/*
  Klik na riadok otvorí detail — balík 5 (Kniha jázd, Vozový park, Zamestnanci).

  Na hlavných zoznamoch balíka overí pravidlá `useKlikNaRiadok`:
  - klik na bunku (nie na odkaz) otvorí detail cez router,
  - klik na zaškrtávadlo detail neotvorí,
  - Ctrl+klik otvorí detail v novej karte,
  - Enter na zameranom riadku otvorí detail,
  - na 390 px otvorí detail klik na kartu / riadok.
  Vozidlá v Knihe jázd: klik na kartu otvorí okno úpravy.

  UI len číta. QA firmy nemajú vlastné jazdy, vozidlá ani zamestnancov, preto
  si tok cez REST založí vozidlo so ŠPZ podľa značky behu, jednu jazdu
  a zamestnanca a po sebe ich zmaže (aj po páde). Firma test2.
  Overuje nasadený kód — spúšťať po nasadení vetvy vlna/klik-b5.
*/
export default {
  popis: "Klik na riadok: Kniha jázd, Vozový park, Zamestnanci (balík 5)",
  limit: 180000,
  firma: "test2",
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test2;
    const nazovAuta = `${t.znacka} klik`;
    const spz = `QK${t.znacka.replace(/[^\dA-Za-z]/g, "").slice(-5)}`.toUpperCase();
    const priezvisko = `E2E klik ${t.znacka}`;
    const mod = process.platform === "darwin" ? "Meta" : "Control";

    t.uprac("vozidlo a jazdy", async () => {
      const auta = await t.rest.get(
        `vehicles?company_id=eq.${firma}&name=eq.${encodeURIComponent(nazovAuta)}&select=id`,
      );
      for (const a of auta.data ?? []) {
        await t.rest.delete(`trips?vehicle_id=eq.${a.id}&company_id=eq.${firma}`);
        const r = await t.rest.delete(`vehicles?id=eq.${a.id}&company_id=eq.${firma}`);
        if (r.status >= 300) throw new Error(`vozidlo ${a.id}: ${r.status} ${r.text.slice(0, 200)}`);
      }
    });
    t.uprac("zamestnanec", async () => {
      const r = await t.rest.get(
        `employees?company_id=eq.${firma}&last_name=eq.${encodeURIComponent(priezvisko)}&select=id`,
      );
      for (const z of r.data ?? []) {
        const d = await t.rest.delete(`employees?id=eq.${z.id}&company_id=eq.${firma}`, {
          hlavicky: { Prefer: "return=minimal" },
        });
        if (d.status >= 300) throw new Error(`zamestnanec ${z.id}: ${d.status} ${d.text.slice(0, 200)}`);
      }
    });

    const { vozidlo, jazda } = await t.krok("príprava: vozidlo a jazda", async () => {
      const vozidlo = await t.rest.vloz("vehicles", {
        company_id: firma,
        name: nazovAuta,
        license_plate: spz,
        initial_odometer: 1000,
      });
      t.over(vozidlo?.id, "vozidlo sa nezaložilo");
      const jazda = await t.rest.vloz("trips", {
        company_id: firma,
        vehicle_id: vozidlo.id,
        trip_date: t.dnes,
        start_odometer: 1000,
        end_odometer: 1012,
        distance_km: 12,
        start_location: `Štart ${t.znacka}`,
        end_location: `Cieľ ${t.znacka}`,
      });
      t.over(jazda?.id, "jazda sa nezaložila");
      return { vozidlo, jazda };
    });

    const zamestnanec = await t.krok("príprava: zamestnanec", async () => {
      // Na `employees` sú práva po stĺpcoch — celý riadok sa vrátiť nedá.
      const r = await t.rest.post(
        "employees",
        { company_id: firma, first_name: "Klik", last_name: priezvisko, position: "Skúška kliku", status: "active" },
        { hlavicky: { Prefer: "return=minimal" } },
      );
      t.over(r.status < 300, `zamestnanec sa nezaložil: ${r.status} ${r.text.slice(0, 200)}`);
      const z = await t.rest.get(
        `employees?company_id=eq.${firma}&last_name=eq.${encodeURIComponent(priezvisko)}&select=id`,
      );
      t.over(z.data?.[0]?.id, "zamestnanec sa nenašiel");
      return z.data[0];
    });

    /** Ctrl+klik — vráti adresu novej karty (alebo null). */
    const novaKarta = async (klik) => {
      const cakaj = page.context().waitForEvent("page", { timeout: 8000 }).catch(() => null);
      await klik();
      const p = await cakaj;
      if (!p) return null;
      await p.waitForLoadState("domcontentloaded").catch(() => {});
      const u = p.url();
      await p.close();
      return u;
    };

    // ---------- Kniha jázd
    const riadokJazdy = () =>
      page.locator("tbody tr[data-klik-riadok]").filter({ hasText: `Štart ${t.znacka}` }).first();
    const zoznamJazd = `/jazdy?vehicle_id=${vozidlo.id}`;
    const jeDetailJazdy = (u) => u.includes("/jazdy/nova") && u.includes(jazda.id);

    await t.krok("/jazdy: klik na bunku otvorí jazdu", async () => {
      await t.go(zoznamJazd);
      await riadokJazdy().waitFor({ timeout: 30000 });
      await riadokJazdy().locator("td").nth(4).click(); // Odkiaľ
      await page.waitForURL((u) => jeDetailJazdy(String(u)), { timeout: 15000 });
    });

    await t.krok("/jazdy: zaškrtávadlo detail neotvorí, Ctrl+klik dá novú kartu, Enter otvorí", async () => {
      await t.go(zoznamJazd);
      await riadokJazdy().waitFor({ timeout: 30000 });
      const box = riadokJazdy().locator("input[type=checkbox]");
      await box.click();
      await page.waitForTimeout(600);
      t.over(!page.url().includes("/jazdy/nova"), "klik na zaškrtávadlo otvoril jazdu");
      t.over(await box.isChecked(), "zaškrtávadlo sa nezaškrtlo");
      await box.click();
      const u = await novaKarta(() => riadokJazdy().locator("td").nth(5).click({ modifiers: [mod] }));
      t.over(u && jeDetailJazdy(u), `Ctrl+klik neotvoril jazdu v novej karte: ${u}`);
      t.over(!page.url().includes("/jazdy/nova"), "Ctrl+klik otvoril jazdu aj v tejto karte");
      await riadokJazdy().focus();
      await page.keyboard.press("Enter");
      await page.waitForURL((x) => jeDetailJazdy(String(x)), { timeout: 15000 });
    });

    await t.krok("/jazdy/vozidla: klik na kartu otvorí úpravu vozidla", async () => {
      await t.go("/jazdy/vozidla");
      const karta = page.locator("[data-klik-riadok]").filter({ hasText: nazovAuta }).first();
      await karta.waitFor({ timeout: 30000 });
      await karta.locator("dl").click();
      const okno = page.getByRole("dialog");
      await okno.waitFor({ timeout: 10000 });
      t.over(
        (await okno.locator("input").evaluateAll((v) => v.map((x) => x.value))).includes(nazovAuta),
        "okno neukazuje kliknuté vozidlo",
      );
      await page.keyboard.press("Escape");
    });

    // ---------- Vozový park
    const riadokVozidla = () =>
      page.locator("tbody tr[data-klik-riadok]").filter({ hasText: spz }).first();
    const detailVozidla = `/vozovy-park/${vozidlo.id}`;

    await t.krok("/vozovy-park: klik na ŠPZ, Ctrl+klik a Enter otvoria vozidlo", async () => {
      await t.go("/vozovy-park");
      await riadokVozidla().waitFor({ timeout: 30000 });
      await riadokVozidla().locator("td").nth(1).click();
      await page.waitForURL((u) => String(u).endsWith(detailVozidla), { timeout: 15000 });
      await t.go("/vozovy-park");
      await riadokVozidla().waitFor({ timeout: 30000 });
      const u = await novaKarta(() => riadokVozidla().locator("td").nth(1).click({ modifiers: [mod] }));
      t.over(u?.endsWith(detailVozidla), `Ctrl+klik neotvoril vozidlo v novej karte: ${u}`);
      await riadokVozidla().focus();
      await page.keyboard.press("Enter");
      await page.waitForURL((x) => String(x).endsWith(detailVozidla), { timeout: 15000 });
    });

    // ---------- Zamestnanci
    const riadokZam = () =>
      page.locator("tbody tr[data-klik-riadok]").filter({ hasText: priezvisko }).first();
    const detailZam = `/zamestnanci/${zamestnanec.id}`;

    await t.krok("/zamestnanci: klik na pozíciu, Ctrl+klik a Enter otvoria kartu", async () => {
      await t.go("/zamestnanci");
      await riadokZam().waitFor({ timeout: 30000 });
      await riadokZam().locator("td").nth(1).click(); // Pozícia
      await page.waitForURL((u) => String(u).endsWith(detailZam), { timeout: 15000 });
      await t.go("/zamestnanci");
      await riadokZam().waitFor({ timeout: 30000 });
      const u = await novaKarta(() => riadokZam().locator("td").nth(3).click({ modifiers: [mod] }));
      t.over(u?.endsWith(detailZam), `Ctrl+klik neotvoril zamestnanca v novej karte: ${u}`);
      await riadokZam().focus();
      await page.keyboard.press("Enter");
      await page.waitForURL((x) => String(x).endsWith(detailZam), { timeout: 15000 });
    });

    // ---------- 390 px
    await t.krok("390 px: klik na kartu jazdy, riadok vozidla a zamestnanca", async () => {
      const m = await t.novaStranka({ mobil: true });
      await t.go(zoznamJazd, m);
      const karta = m
        .locator("div.md\\:hidden [data-klik-riadok]")
        .filter({ hasText: `Štart ${t.znacka}` })
        .first();
      await karta.waitFor({ timeout: 30000 });
      await karta.locator("input[type=checkbox]").click();
      await m.waitForTimeout(500);
      t.over(!m.url().includes("/jazdy/nova"), "390 px: zaškrtávadlo na karte otvorilo jazdu");
      await karta.locator(".text-xs").first().click();
      await m.waitForURL((u) => jeDetailJazdy(String(u)), { timeout: 15000 });

      await t.go("/vozovy-park", m);
      const v = m.locator("tbody tr[data-klik-riadok]").filter({ hasText: spz }).first();
      await v.waitFor({ timeout: 30000 });
      await v.locator("td").nth(1).click();
      await m.waitForURL((u) => String(u).endsWith(detailVozidla), { timeout: 15000 });

      await t.go("/zamestnanci", m);
      const z = m.locator("tbody tr[data-klik-riadok]").filter({ hasText: priezvisko }).first();
      await z.waitFor({ timeout: 30000 });
      await z.locator("td").nth(1).click();
      await m.waitForURL((u) => String(u).endsWith(detailZam), { timeout: 15000 });
    });
  },
};
