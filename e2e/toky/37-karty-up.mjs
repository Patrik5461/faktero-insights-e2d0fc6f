/*
  Palivová karta Up Déjeuner (bez API) vo firme Test — nahratie výpisu celou cestou:
  - pripojenie Up len s názvom (žiadne heslá), hneď sa ponúkne nahratie výpisu,
  - CSV výpis s hlavičkou pod nadpisom, slovenskými číslami a riadkom „Spolu“:
    náhľad ukáže nákupy, vozidlo, rozdiel voči faktúre, bloček aj tankovanie z GPS,
  - uloženie: transakcie s vozidlom, jedna prijatá faktúra od Up (IČO, rozpis,
    dorovnávací riadok, zahraničná DPH so sadzbou 0 %), bloček označený,
    tankovanie z GPS sa nezdvojí,
  - druhé nahratie toho istého výpisu nič nezdvojí,
  - prihlásený klient do evidencie kariet zapisovať nesmie (len server).
  Po sebe odpojí kartu (zmaže evidenciu) a zmaže faktúru, bloček, tankovania aj vozidlo.
*/

export default {
  popis: "Up Déjeuner: nahratie výpisu, náhľad, faktúra s rozpisom, bez duplicít",
  limit: 240000,
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test;
    const z = t.znacka;
    const cislo = String(Date.now()).slice(-7);
    const faktura = `E2EUP${cislo}`;
    const spz = `UP${cislo.slice(-4)}E`;
    const nazovAuta = `${z} Up auto`;
    const nazovKarty = `${z} Up karta`;
    const den = t.dnes;
    const [r, m, d] = den.split("-");
    const denSk = `${d}.${m}.${r}`;

    const csv = [
      "Up Slovensko – výpis transakcií",
      "",
      "Dátum;Čas;Číslo karty;EČV;Čerpacia stanica;Krajina;Produkt;Množstvo (l);Základ DPH;DPH;Sadzba DPH;Suma s DPH;Stav km;Číslo faktúry",
      `${denSk};07:41;7083 6100 ${cislo.slice(0, 4)} 5678;${spz};Shell Bratislava;SK;Premiová nafta;66,84;93,15;21,42;23 %;114,57;123 456;${faktura}`,
      `${denSk};07:41;7083 6100 ${cislo.slice(0, 4)} 5678;${spz};Shell Bratislava;SK;Zľava DIFP - 0.018 Eur / l;66,84;-0,98;-0,22;23 %;-1,20;;${faktura}`,
      `${denSk};18:02;7083 6100 ${cislo.slice(0, 4)} 5678;${spz};Shell Wien Süd;Rakúsko;Diesel;50,00;75,00;15,00;20 %;90,00;124 010;${faktura}`,
      "Spolu;;;;;;;;;;;205,37;;",
    ].join("\r\n");
    const subor = {
      name: `up-vypis-${cislo}.csv`,
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8"),
    };

    let auto = null;
    let blocek = null;

    // ------------------------------------------------------------ upratanie (opačné poradie)
    t.uprac("vozidlo a tankovania", async () => {
      const v = await t.rest.get(
        `vehicles?company_id=eq.${firma}&name=eq.${encodeURIComponent(nazovAuta)}&select=id`,
      );
      for (const x of v.data ?? []) {
        await t.rest.delete(`fuel_records?vehicle_id=eq.${x.id}`);
        const a = await t.rest.delete(`vehicles?id=eq.${x.id}`);
        if (a.status >= 300) throw new Error(`vozidlo: ${a.status} ${a.text.slice(0, 160)}`);
      }
    });
    t.uprac("bloček", async () => {
      if (blocek) await t.rest.delete(`expense_documents?id=eq.${blocek.id}`);
    });
    t.uprac("prijatá faktúra od Up", async () => {
      const f = await t.rest.get(
        `purchase_invoices?company_id=eq.${firma}&invoice_number=eq.${faktura}&select=id`,
      );
      for (const x of f.data ?? []) {
        const a = await t.rest.delete(`purchase_invoices?id=eq.${x.id}`);
        if (a.status >= 300) throw new Error(`faktúra: ${a.status} ${a.text.slice(0, 160)}`);
      }
    });
    t.uprac("pripojenie Up", async () => {
      const ids =
        (
          await t.rest.get(
            `palivove_karty_pripojenia?company_id=eq.${firma}&nazov=eq.${encodeURIComponent(nazovKarty)}&select=id`,
          )
        ).data ?? [];
      if (!ids.length) return;
      const p = await t.novaStranka();
      await t.go("/vozovy-park/palivove-karty", p);
      for (let i = 0; i < ids.length; i++) {
        await p
          .locator("li", { hasText: nazovKarty })
          .getByRole("button", { name: "Odpojiť" })
          .click();
        await t.potvrd(p);
        await p.waitForTimeout(2000);
      }
    });

    // ------------------------------------------------------------ príprava
    await t.krok("príprava: vozidlo, bloček z pumpy a tankovanie z GPS", async () => {
      auto = await t.rest.vloz("vehicles", {
        company_id: firma,
        name: nazovAuta,
        license_plate: spz,
      });
      blocek = await t.rest.vloz("expense_documents", {
        company_id: firma,
        supplier_name: `${z} Shell Wien`,
        issue_date: den,
        total_amount: 90,
        currency: "EUR",
      });
      // To isté tankovanie už zapísané z GPS jednotky (rovnaký deň a litre).
      await t.rest.vloz("fuel_records", {
        company_id: firma,
        vehicle_id: auto.id,
        fuel_date: den,
        liters: 66.84,
        price_per_liter: 1.714,
        total_amount: 114.57,
        external_source: "e2e-gps",
      });
    });

    // ------------------------------------------------------------ pripojenie
    await t.krok("pripojenie Up bez hesiel ponúkne nahratie výpisu", async () => {
      await t.go("/vozovy-park/palivove-karty");
      const dlazdica = page.locator("div.rounded-lg", { hasText: "Up Déjeuner" }).first();
      await dlazdica.getByRole("button", { name: /Pripojiť/ }).click();
      const formular = page.locator("form").filter({ hasText: "Číslo zmluvy alebo zákazníka" });
      await formular.waitFor({ timeout: 20000 });
      t.over(!(await formular.locator('input[type="password"]').count()), "formulár Up pýta heslo");
      await formular.locator("input").first().fill(nazovKarty);
      await formular.getByRole("button", { name: "Uložiť" }).click();
      await page.getByRole("region", { name: "Nahrať výpis karty" }).waitFor({ timeout: 30000 });
      const p = await t.cakajNa("pripojenie v databáze", async () => {
        const x = await t.rest.get(
          `palivove_karty_pripojenia?company_id=eq.${firma}&nazov=eq.${encodeURIComponent(nazovKarty)}&select=id,poskytovatel,auto_sync,rezim`,
        );
        return x.data?.[0];
      });
      t.over(p.poskytovatel === "up", `poskytovateľ ${p.poskytovatel}`);
      t.over(p.auto_sync === false, "pripojenie bez API má nočnú synchronizáciu");
      t.over(p.rezim === "faktura", `režim ${p.rezim}`);
    });

    const nahraj = async () => {
      const panel = page.getByRole("region", { name: "Nahrať výpis karty" });
      await panel.getByTestId("vypis-karty-subor").setInputFiles(subor);
      const tl = panel.getByRole("button", { name: /^Uložiť \d+ nákupov/ });
      await tl.waitFor({ timeout: 40000 });
      return { panel, tl };
    };

    // ------------------------------------------------------------ prvé nahratie
    await t.krok("náhľad: súčty, rozdiel voči faktúre, bloček a GPS", async () => {
      const { panel, tl } = await nahraj();
      t.over(/Uložiť 3 nákupov/.test(await tl.innerText()), `tlačidlo: ${await tl.innerText()}`);
      const text = await panel.innerText();
      t.over(
        text.includes(faktura) || (await panel.locator(`input[value="${faktura}"]`).count()) > 0,
        "číslo faktúry z výpisu",
      );
      t.over(/líši o 2,00/.test(text), "rozdiel 2,00 € oproti riadku Spolu");
      t.over(/aj bloček/.test(text), "bloček z pumpy v náhľade");
      t.over(/tankovanie už je/.test(text), "tankovanie z GPS v náhľade");
      t.over(text.includes(nazovAuta), "vozidlo podľa ŠPZ");
      t.over(/DPH AT do nákladu/.test(text), "zahraničná DPH");
      await panel.locator('input[type="date"]').first().fill(den);
      await tl.click();
      await page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /Nahratý výpis/ })
        .first()
        .waitFor({ timeout: 40000 });
    });

    await t.krok(
      "uložené: transakcie, faktúra od Up, bloček, tankovanie bez duplicity",
      async () => {
        const tx = await t.cakajNa("transakcie karty", async () => {
          const x = await t.rest.get(
            `palivove_karty_transakcie?company_id=eq.${firma}&faktura_cislo=eq.${faktura}&select=id,vehicle_id,spolu,purchase_invoice_id,blocek_id,fuel_record_id,karta,krajina_dph`,
          );
          return x.data?.length === 3 ? x.data : null;
        });
        t.over(
          tx.every((x) => x.vehicle_id === auto.id),
          "nákupy bez vozidla",
        );
        t.over(
          tx.every((x) => x.karta && !/\d{10}/.test(x.karta)),
          `číslo karty nie je maskované: ${tx.map((x) => x.karta)}`,
        );
        t.over(
          tx.some((x) => x.blocek_id === blocek.id),
          "bloček sa neoznačil",
        );
        const f = (
          await t.rest.get(
            `purchase_invoices?company_id=eq.${firma}&invoice_number=eq.${faktura}&deleted_at=is.null&select=id,supplier_name,supplier_ico,amount_total,items,vehicle_id,external_id`,
          )
        ).data;
        t.over(f?.length === 1, `prijatých faktúr ${f?.length}`);
        t.over(f[0].supplier_ico === "53528654", `IČO ${f[0].supplier_ico}`);
        t.over(Number(f[0].amount_total) === 205.37, `suma ${f[0].amount_total}`);
        t.over(f[0].vehicle_id === auto.id, "faktúra bez vozidla");
        t.over(f[0].items.length === 4, `riadkov ${f[0].items.length} (3 nákupy + dorovnanie)`);
        t.over(
          f[0].items.some((i) => Number(i.vat_rate) === 0 && Number(i.total) === 90),
          "zahraničná DPH nie je v náklade so sadzbou 0",
        );
        t.over(
          tx.every((x) => x.purchase_invoice_id === f[0].id),
          "nákupy nie sú prepojené s faktúrou",
        );
        const tank = (
          await t.rest.get(
            `fuel_records?vehicle_id=eq.${auto.id}&select=id,liters,external_source,odometer_km&order=fuel_date`,
          )
        ).data;
        t.over(tank.length === 2, `tankovaní ${tank.length} (GPS + Viedeň)`);
        t.over(
          tank.some((x) => x.external_source === "karta-up" && Number(x.odometer_km) === 124010),
          "tankovanie z karty s tachometrom",
        );
      },
    );

    // ------------------------------------------------------------ druhé nahratie
    await t.krok("druhé nahratie toho istého výpisu nič nezdvojí", async () => {
      await t.go("/vozovy-park/palivove-karty");
      await page
        .locator("li", { hasText: nazovKarty })
        .getByRole("button", { name: "Nahrať výpis" })
        .click();
      const { panel, tl } = await nahraj();
      const text = await panel.innerText();
      t.over(/3 nákupov je už nahratých/.test(text), "náhľad nehlási už nahraté nákupy");
      t.over(/už vo Fakteri je/.test(text), "náhľad nehlási existujúcu faktúru");
      await tl.click();
      await page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /Nahratý výpis/ })
        .first()
        .waitFor({ timeout: 40000 });
      const tx = await t.rest.get(
        `palivove_karty_transakcie?company_id=eq.${firma}&faktura_cislo=eq.${faktura}&select=id`,
      );
      t.over(tx.data?.length === 3, `transakcií ${tx.data?.length}`);
      const f = await t.rest.get(
        `purchase_invoices?company_id=eq.${firma}&invoice_number=eq.${faktura}&deleted_at=is.null&select=id`,
      );
      t.over(f.data?.length === 1, `faktúr ${f.data?.length}`);
      const tank = await t.rest.get(`fuel_records?vehicle_id=eq.${auto.id}&select=id`);
      t.over(tank.data?.length === 2, `tankovaní ${tank.data?.length}`);
    });

    await t.krok("klient nesmie do evidencie kariet zapisovať", async () => {
      const p = await t.rest.get(
        `palivove_karty_pripojenia?company_id=eq.${firma}&nazov=eq.${encodeURIComponent(nazovKarty)}&select=id`,
      );
      const r = await t.rest.post("palivove_karty_transakcie", {
        company_id: firma,
        pripojenie_id: p.data[0].id,
        poskytovatel: "up",
        externe_id: `e2e-${cislo}`,
        cas: `${den}T10:00:00Z`,
        datum: den,
      });
      t.over(r.status >= 400, `zápis prešiel: ${r.status}`);
    });
  },
};
