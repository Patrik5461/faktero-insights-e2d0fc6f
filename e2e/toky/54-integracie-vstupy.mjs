/*
  Vstupy k integráciám z 31. 10. (len čítanie, nič sa nezapisuje):
  - Palivové karty sú v menu Vozového parku (dovtedy len tlačidlo na stránke),
    popis stránky nehovorí, že sa všetko načíta samo — pri Up sa výpis nahráva;
  - GPS systémy majú dlaždice v Jazdy → Integrácie, Trans.eu je v ponuke
    nastavení pod avatarom;
  - verejný web: funkcie na úvodnej stránke a podstránky /funkcie/… v sitemape.
*/
const KARTY = "/vozovy-park/palivove-karty";

export default {
  popis: "Integrácie: Palivové karty v menu, GPS a Trans.eu vstupy, funkcie na webe",
  firma: "test",
  limit: 120000,
  async spusti(t) {
    const page = t.page;

    await t.krok("Palivové karty v menu Vozového parku", async () => {
      await t.go(KARTY);
      await page.getByRole("heading", { name: "Palivové karty" }).first().waitFor();
      // Odkaz z bočného panela (alebo z lišty kompaktného rozloženia), nie tlačidlo na stránke.
      const vMenu = page.locator(`aside nav a[href="${KARTY}"], header nav a[href="${KARTY}"]`);
      await t.cakajNa("položka v menu", async () => (await vMenu.count()) > 0, { limit: 10000 });
    });

    await t.krok("popis stránky spomína nahratie výpisu pri karte bez API", async () => {
      const text = await page.locator("main").innerText();
      t.over(/nahráte mesačný výpis/.test(text), "popis nespomína nahratie výpisu (Up)");
      t.over(!/Nákupy palivovými kartami sa načítajú samy/.test(text), "ostal starý popis");
    });

    await t.krok("GPS systémy v Jazdy → Integrácie", async () => {
      await t.go("/jazdy/integracie");
      for (const n of ["GPS Dozor", "Webdispečink"]) {
        await page.getByText(n, { exact: false }).first().waitFor({ timeout: 15000 });
      }
    });

    await t.krok("Trans.eu v nastaveniach", async () => {
      await t.go("/nastavenia/transeu");
      await page.getByRole("heading", { name: "Účet Trans.eu" }).waitFor();
    });

    await t.krok("verejný web: funkcie a podstránky", async () => {
      const uvod = await fetch(`${t.base}/`).then((r) => r.text());
      for (const n of ["Palivové karty", "GPS systémy v knihe jázd", "Trans.eu pre dopravcov"])
        t.over(uvod.includes(n), `úvodná stránka nespomína „${n}“`);
      const mapa = await fetch(`${t.base}/sitemap.xml`).then((r) => r.text());
      for (const slug of ["palivove-karty", "gps-systemy", "transeu"]) {
        const r = await fetch(`${t.base}/funkcie/${slug}`);
        t.over(r.status === 200, `/funkcie/${slug} vrátil ${r.status}`);
        t.over(mapa.includes(`/funkcie/${slug}`), `/funkcie/${slug} chýba v sitemape`);
      }
    });
  },
};
