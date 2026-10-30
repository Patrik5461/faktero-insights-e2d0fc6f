/* Prehľad: dlaždice hore sa rovnajú RPC `prehlad_suhrn` tej istej firmy. */

/** „7 305,29 €“ → 7305.29 */
const cislo = (s) =>
  Number(
    String(s)
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}\b)/g, "")
      .replace(",", "."),
  );

export default {
  popis: "Prehľad: čísla dlaždíc = RPC prehlad_suhrn",
  limit: 60000,
  async spusti(t) {
    const page = t.page;
    await t.go("/dashboard");
    await page.getByText("Obrat tento mesiac", { exact: true }).first().waitFor();

    const dlazdica = async (label) => {
      const karta = page
        .locator("div.rounded-xl")
        .filter({ has: page.getByText(label, { exact: true }) })
        .first(); // pás dlaždíc je na stránke prvý; ten istý nadpis majú aj panely nižšie
      const text = await karta.innerText();
      const riadky = text
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean);
      const i = riadky.indexOf(label);
      return { hodnota: cislo(riadky[i + 1]), meta: riadky.slice(i + 2).join(" ") };
    };

    // Kostra sa ukazuje, kým sa súhrn nenačíta — počkáme na skutočné čísla.
    await t.cakajNa("načítané dlaždice", async () =>
      Number.isFinite((await dlazdica("Neuhradené")).hodnota),
    );

    const polnoc = new Date();
    polnoc.setHours(0, 0, 0, 0);
    const r = await t.rest.rpc("prehlad_suhrn", {
      p_company_id: t.firmy.test,
      p_dnes: t.dnes,
      p_mena: "EUR",
      p_dnes_od: polnoc.toISOString(),
    });
    t.over(r.status === 200, `prehlad_suhrn vrátil ${r.status} ${r.text.slice(0, 200)}`);
    const s = Array.isArray(r.data) ? r.data[0] : r.data;

    const porovnaj = (nazov, web, db) =>
      t.over(Math.abs(web - Number(db)) < 0.006, `${nazov}: dlaždica ${web}, prehlad_suhrn ${db}`);

    await t.krok("Obrat tento mesiac", async () =>
      porovnaj("obrat", (await dlazdica("Obrat tento mesiac")).hodnota, s.mesiac_obrat),
    );
    await t.krok("Neuhradené", async () => {
      const d = await dlazdica("Neuhradené");
      porovnaj("neuhradené suma", d.hodnota, s.neuhradene_suma);
      porovnaj("neuhradené počet", cislo(d.meta), s.neuhradene_pocet);
    });
    await t.krok("Po splatnosti", async () => {
      const d = await dlazdica("Po splatnosti");
      porovnaj("po splatnosti suma", d.hodnota, s.po_splatnosti_suma);
      const [pocet, dlznikov] = d.meta.split("·").map(cislo);
      porovnaj("po splatnosti počet", pocet, s.po_splatnosti_pocet);
      porovnaj("dlžníkov", dlznikov, s.dlznikov);
    });
    await t.krok("Dlžia mi zákazníci", async () =>
      porovnaj("pohľadávky", (await dlazdica("Dlžia mi zákazníci")).hodnota, s.neuhradene_suma),
    );
  },
};
