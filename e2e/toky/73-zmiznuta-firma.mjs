/*
  Zmiznutá firma (Admin → Chyby, 31. 10. 2026): účtu zmazali firmu, ktorú mal
  v otvorenej karte vybranú. Počty v menu (`pocetMojichUlohFn`) sa pýtali na
  ňu každú minútu a server zakaždým odmietol „K tejto firme nemáte prístup.“ —
  za deň vyše 600 odmietnutí z jednej karty.

  Tok to napodobní bez mazania: v otvorenej karte prepíše zapamätanú firmu na
  neexistujúcu a vyžiada obnovenie počtov. Karta sa musí sama prepnúť na
  firmu, do ktorej účet patrí, a ďalšie obnovenie už nesmie byť odmietnuté.
*/
const NEEXISTUJUCA = "00000000-0000-4000-8000-0000000000e2";

export default {
  popis: "zmiznutá firma v otvorenej karte: prepne sa na inú, počty v menu sa neodmietajú dokola",
  limit: 90000,
  async spusti(t) {
    const page = t.page;
    const odmietnute = [];
    page.on("response", async (r) => {
      if (!r.url().includes("/_serverFn/") || r.status() < 400) return;
      const telo = await r.text().catch(() => "");
      if (/nemáte prístup/.test(telo)) odmietnute.push(Date.now());
    });

    await t.krok("prehľad sa otvorí s firmou Test", async () => {
      await t.go("/dashboard");
      await page.getByRole("navigation").first().waitFor({ timeout: 20000 });
      const firma = await page.evaluate(() => localStorage.getItem("faktero.active_company"));
      t.over(firma === t.firmy.test, `vybraná firma ${firma}`);
    });

    await t.krok("firma zmizne → karta sa prepne na platnú", async () => {
      await page.evaluate((id) => {
        localStorage.setItem("faktero.active_company", id);
        window.dispatchEvent(new Event("faktero:pocty-menu"));
      }, NEEXISTUJUCA);
      const platne = Object.values(t.firmy);
      await t.cakajNa(
        "prepnutie na firmu účtu",
        async () => {
          const id = await page.evaluate(() => localStorage.getItem("faktero.active_company"));
          return id && id !== NEEXISTUJUCA && platne.includes(id) ? id : null;
        },
        { limit: 20000, krok: 500 },
      );
    });

    await t.krok("ďalšie obnovenie počtov už nie je odmietnuté", async () => {
      const pred = odmietnute.length;
      t.over(pred <= 1, `pred prepnutím ${pred} odmietnutí (čakal som najviac 1)`);
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.dispatchEvent(new Event("faktero:pocty-menu")));
        await page.waitForTimeout(1500);
      }
      t.over(
        odmietnute.length === pred,
        `po prepnutí ešte ${odmietnute.length - pred} odmietnutí — karta sa pýta na zmiznutú firmu`,
      );
    });
  },
};
