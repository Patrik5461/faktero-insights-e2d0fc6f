/*
  Zamestnanci v českej firme (QA Česká): rovnaký modul, české pravidlá.
   - rodné číslo sa kontroluje (deliteľnosť 11), číslo účtu v tvare 19-…/0800,
     štátna príslušnosť predvolene CZ;
   - pripomienky: Registrácia na ČSSZ (termín = deň nástupu, § 19 zák. 323/2025 Sb.),
     zdravotná poisťovňa do 8 dní, pri samej DPP do 20. dňa nasledujúceho mesiaca;
   - zmluvy bez brigádnickej dohody, DPP s upozornením na 300 hodín;
   - po skončení odhlášky z ČSSZ a zo zdravotnej poisťovne, zmiznú po zapísaní dátumu;
   - šablóny po česky (Pracovní smlouva), texty pripomienok preložené do češtiny.
  Zamestnanec sa na konci zmaže (zmluvy idú kaskádou). Nič sa neposiela von.
*/

function pridajDni(iso, dni) {
  const [r, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(r, m - 1, d + dni)).toISOString().slice(0, 10);
}
const datumSk = (iso) => {
  const [r, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${r}`;
};

export default {
  popis: "Zamestnanci CZ: RČ a účet, pripomienky ČSSZ/ZP a odhlášky, DPP, české šablóny",
  limit: 240000,
  firma: "cz",
  async spusti(t) {
    const page = t.page;
    const nastup = pridajDni(t.dnes, -3);
    const priezvisko = `${t.znacka} Nováková`;
    let id = null;
    const pripomienky = () =>
      page
        .getByRole("region", { name: "Pripomienky" })
        .innerText()
        .catch(() => "");

    await t.krok("nový zamestnanec: kontrola RČ a českého účtu", async () => {
      await t.go("/zamestnanci/novy");
      await page.locator("#zam-first_name").fill("Jana");
      await page.locator("#zam-last_name").fill(priezvisko);
      await page.locator("#zam-start_date").fill(nastup);
      await page.locator("#zam-health_insurer").fill("111 VZP");
      // Štátna príslušnosť sa prispôsobí krajine firmy.
      await t.cakajNa("štátna príslušnosť CZ", async () =>
        (await page.locator("#zam-nationality").inputValue()) === "CZ" ? true : null,
      );
      await page.locator("#zam-iban").fill("19-2000145398/0800");
      t.over(
        await page.getByText("Číslo účtu nemá správny kontrolný súčet.").first().isVisible(),
        "zlé číslo účtu sa neohlásilo",
      );
      await page.locator("#zam-iban").fill("19-2000145399/0800");
      await page.locator("#zam-rc").fill("736028/5164");
      t.over(
        await page
          .getByText(/nie je deliteľné 11/)
          .first()
          .isVisible(),
        "zlé rodné číslo sa neohlásilo",
      );
      await page.getByRole("button", { name: "Uložiť zamestnanca" }).click();
      await page.waitForTimeout(800);
      t.over(/\/zamestnanci\/novy$/.test(new URL(page.url()).pathname), "zlé RČ sa uložilo");

      await page.locator("#zam-rc").fill("7360285163");
      await page.getByRole("button", { name: "Uložiť zamestnanca" }).click();
      await page.waitForURL((u) => /\/zamestnanci\/[0-9a-f-]{36}$/.test(u.pathname), {
        timeout: 30000,
      });
      id = page.url().match(/\/zamestnanci\/([0-9a-f-]{36})/)[1];
      t.uprac(`zamestnanec ${id.slice(0, 8)}`, async () => {
        const r = await t.rest.delete(`employees?id=eq.${id}`, {
          hlavicky: { Prefer: "return=minimal" },
        });
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      });

      const r = await t.rest.get(`employees?id=eq.${id}&select=iban,nationality,health_insurer`);
      const z = r.data?.[0];
      t.over(z?.iban === "19-2000145399/0800", `uložené číslo účtu: ${z?.iban}`);
      t.over(z?.nationality === "CZ", `štátna príslušnosť: ${z?.nationality}`);
      const pii = await t.rest.rpc("employee_get_pii", { _employee_id: id });
      t.over(
        pii.data?.[0]?.rodne_cislo === "736028/5163",
        `rodné číslo sa neuložilo v tvare s lomkou: ${pii.text.slice(0, 120)}`,
      );
    });

    await t.krok("pripomienky ČSSZ a zdravotnej poisťovne", async () => {
      const text = await t.cakajNa("pripomienky", async () => {
        const x = await pripomienky();
        return x.includes("Registrácia zamestnanca na ČSSZ") ? x : null;
      });
      t.over(
        text.includes(`najneskôr pred nástupom ${datumSk(nastup)}`) &&
          text.includes(`termín ${datumSk(nastup)} už uplynul`),
        `ČSSZ: termínom má byť deň nástupu: ${text}`,
      );
      t.over(
        text.includes("oznámiť nástup zdravotnej poisťovni do 8 dní") &&
          text.includes(`do ${datumSk(pridajDni(nastup, 8))}`),
        `zdravotná poisťovňa do 8 dní od nástupu: ${text}`,
      );
      t.over(
        !/Sociálnej poisťovne/.test(text),
        `česká firma dostala slovenskú Sociálnu poisťovňu: ${text}`,
      );
    });

    await t.krok("zmluva DPP: bez brigádnickej, upozornenie 300 hodín, ZP do 20. dňa", async () => {
      await page.getByRole("tab", { name: "Zmluvy" }).click();
      await page.getByRole("button", { name: "Pridať zmluvu" }).click();
      const druhy = await page.locator("#k-kind option").evaluateAll((o) => o.map((x) => x.value));
      t.over(!druhy.includes("brigadnicka"), `česká firma ponúka brigádnickú dohodu: ${druhy}`);
      t.over(druhy.includes("dovp") && druhy.includes("dopc"), `chýba DPP/DPČ: ${druhy}`);
      await page.locator("#k-kind").selectOption("dovp");
      await page.locator("#k-prob").fill(pridajDni(nastup, 30));
      const upozornenia = await page
        .getByRole("list", { name: "Upozornenia k zmluve" })
        .innerText();
      t.over(/300 hodín/.test(upozornenia), `chýba upozornenie na 300 hodín: ${upozornenia}`);
      t.over(
        /nie pri DPP ani DPČ/.test(upozornenia),
        `skúšobná doba pri DPP bez upozornenia: ${upozornenia}`,
      );
      await page.locator("#k-prob").fill("");
      await page.getByRole("button", { name: "Uložiť zmluvu" }).click();
      await page.getByText("Dohoda o provedení práce (DPP)").first().waitFor();
      await t.cakajNa("pripomienka ZP bez 8 dní", async () => {
        const x = await pripomienky();
        return !x.includes("oznámiť nástup zdravotnej poisťovni do 8 dní") ? true : null;
      });
      const x = await pripomienky();
      // 20. deň nasledujúceho mesiaca môže byť ďalej ako 15 dní — vtedy sa ešte neukazuje.
      t.over(
        !x.includes("Oznámenie zdravotnej poisťovni") ||
          x.includes("do 20. dňa nasledujúceho mesiaca"),
        `pri DPP má byť ZP do 20. dňa: ${x}`,
      );
    });

    await t.krok("skončenie: odhlášky a ich vybavenie", async () => {
      await page.getByRole("tab", { name: "Údaje" }).click();
      await page.locator("#zam-end_date").fill(pridajDni(t.dnes, -1));
      await page.getByRole("button", { name: "Uložiť zmeny" }).click();
      const text = await t.cakajNa("odhlášky", async () => {
        const x = await pripomienky();
        return x.includes("Odhlásenie zamestnanca z ČSSZ") ? x : null;
      });
      /*
        Zamestnanec má len DPP, takže skončenie sa zdravotnej poisťovni oznamuje do 20. dňa
        nasledujúceho mesiaca (§ 10 zák. 48/1997 Sb.) a pripomienka sa ukáže až 14 dní pred ním.
      */
      const koniec = pridajDni(t.dnes, -1);
      const [kr, km] = koniec.split("-").map(Number);
      const terminZp = new Date(Date.UTC(kr, km, 20)).toISOString().slice(0, 10);
      const dniDoZp = (Date.parse(terminZp) - Date.parse(t.dnes)) / 86_400_000;
      if (dniDoZp <= 14) {
        t.over(
          text.includes("oznámiť skončenie zdravotnej poisťovni do 20. dňa nasledujúceho mesiaca"),
          `chýba odhláška ZP (termín ${terminZp}): ${text}`,
        );
      } else {
        t.over(
          !text.includes("Skončenie oznámiť zdravotnej poisťovni"),
          `odhláška ZP pri DPP sa ukázala priskoro (termín ${terminZp}): ${text}`,
        );
      }
      t.over(
        !text.includes("oznámiť skončenie zdravotnej poisťovni do 8 dní"),
        `pri DPP lehota 8 dní: ${text}`,
      );
      await page.locator("#zam-sp_deregistered_at").fill(t.dnes);
      await page.getByRole("button", { name: "Uložiť zmeny" }).click();
      await t.cakajNa("odhláška ČSSZ zmizne", async () =>
        !(await pripomienky()).includes("Odhlásenie zamestnanca z ČSSZ") ? true : null,
      );
    });

    await t.krok("šablóny po česky", async () => {
      await page.getByRole("tab", { name: "Dokumenty" }).click();
      const sablony = await page.locator("#d-sab option").allInnerTexts();
      t.over(sablony.includes("Pracovní smlouva"), `chýba česká šablóna: ${sablony}`);
      t.over(
        !sablony.some((s) => /brigád/i.test(s)),
        `brigádnická šablóna v českej firme: ${sablony}`,
      );
    });

    await t.krok("texty v češtine", async () => {
      await t.go(`/zamestnanci/${id}?lang=cs`);
      const x = await t.cakajNa("české pripomienky", async () => {
        const s = await page
          .locator("section[aria-label]")
          .first()
          .innerText()
          .catch(() => "");
        return s.includes("Odhlášení") || s.includes("Registrace zaměstnance") ? s : null;
      });
      // Pri DPP sú termíny zdravotnej poisťovne často ďalej ako predstih — overuje sa ČSSZ.
      t.over(
        x.includes("přihlásit na ČSSZ nejpozději před nástupem") &&
          !/prihlásiť|Registrácia/.test(x),
        `pripomienky nie sú po česky: ${x}`,
      );
    });
  },
};
