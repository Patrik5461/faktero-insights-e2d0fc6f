/*
  GPS: preklad chýb poskytovateľa a tachometer pri „Založiť vozidlo“
  (verejný DEMO účet GPS Dozor, len čítanie, firma Test).

  - v nemčine príde hláška o zlom hesle po nemecky, nie po slovensky;
  - „Založiť vozidlo“ prevezme stav tachometra z GPS (DEMO MAN ~541 358 km),
    nie 0 — porovnáva sa s tým, čo GPS Dozor práve hlási;
  - po sebe odpojí pripojenie, zmaže jazdy aj vozidlo.

  DEMO prístup zverejňuje GPS Dozor v dokumentácii API
  (https://www.gpsdozor.cz/documentation/api) — nie je to tajomstvo.
*/
const DEMO = { login: "api_gpsdozor", heslo: "yakmwlARdn" };
const SPZ = "2A6 3358";
const API = "https://a1.gpsguard.eu/api/v1/";

/** Tachometer DEMO vozidla priamo od GPS Dozoru (len čítanie). */
async function tachometerZDozoru() {
  const auth = "Basic " + Buffer.from(`${DEMO.login}:${DEMO.heslo}`).toString("base64");
  const r = await fetch(`${API}vehicles/group/SAGU`, { headers: { Authorization: auth } });
  if (!r.ok) return null;
  const auta = await r.json();
  const a = (auta ?? []).find((x) => String(x.SPZ ?? "").trim() === SPZ);
  const km = Number(a?.Odometer);
  return Number.isFinite(km) && km > 0 ? km : null;
}

export default {
  popis: "GPS: chyba poskytovateľa po nemecky, tachometer z GPS pri založení vozidla",
  limit: 180000,
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test;
    const hlaska = (re) =>
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: re })
        .first()
        .waitFor({ timeout: 40000 });

    t.uprac("vozidlo", async () => {
      const auta = await t.rest.get(
        `vehicles?company_id=eq.${firma}&license_plate=eq.${encodeURIComponent(SPZ)}&select=id`,
      );
      for (const a of auta.data ?? []) {
        const r = await t.rest.delete(`vehicles?id=eq.${a.id}&company_id=eq.${firma}`);
        if (r.status >= 300)
          throw new Error(`vozidlo ${a.id}: ${r.status} ${r.text.slice(0, 200)}`);
      }
    });
    t.uprac("jazdy GPS Dozor", async () => {
      const r = await t.rest.delete(`trips?company_id=eq.${firma}&external_source=eq.gpsdozor`);
      if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
    });
    t.uprac("pripojenie", async () => {
      const ids = (await t.rest.get(`gps_pripojenia?company_id=eq.${firma}&select=id`)).data ?? [];
      if (!ids.length) return;
      const p = await t.novaStranka();
      await p.context().addCookies([{ name: "faktero_jazyk", value: "sk", url: t.base }]);
      await t.go("/jazdy/integracie/gpsdozor", p);
      for (let i = 0; i < ids.length; i++) {
        await p.getByRole("button", { name: "Odpojiť" }).first().click();
        await t.potvrd(p);
        await p.waitForTimeout(2000);
      }
      const zostava = (await t.rest.get(`gps_pripojenia?company_id=eq.${firma}&select=id`)).data;
      if (zostava?.length) throw new Error(`pripojenie ostalo: ${zostava.map((x) => x.id)}`);
    });

    await t.krok("príprava: Test nemá pripojenie GPS Dozor ani jeho vozidlo", async () => {
      const pr = await t.rest.get(`gps_pripojenia?company_id=eq.${firma}&select=id`);
      t.over(!pr.data?.length, "vo firme Test ostalo pripojenie z minulého behu — uprac ho ručne");
      const auta = await t.rest.get(
        `vehicles?company_id=eq.${firma}&license_plate=eq.${encodeURIComponent(SPZ)}&select=id`,
      );
      t.over(!auta.data?.length, `vo firme Test ostalo vozidlo ${SPZ} z minulého behu`);
    });

    await t.krok("v nemčine je chyba poskytovateľa po nemecky", async () => {
      await page.context().addCookies([{ name: "faktero_jazyk", value: "de", url: t.base }]);
      await t.go("/jazdy/integracie/gpsdozor");
      await page.locator("#gps-login").waitFor();
      await page.fill("#gps-login", DEMO.login);
      await page.fill("#gps-heslo", "zle-heslo-e2e");
      await page.getByRole("button", { name: "Verbindung testen" }).click();
      await page
        .getByText(/GPS Dozor hat Benutzername oder Passwort abgelehnt/)
        .waitFor({ timeout: 30000 });
      t.over(
        !(await page.getByText(/odmietol prihlasovacie meno/).count()),
        "na nemeckej stránke ostala slovenská hláška",
      );
    });

    await t.krok("pripojenie (po slovensky)", async () => {
      await page.context().addCookies([{ name: "faktero_jazyk", value: "sk", url: t.base }]);
      await t.go("/jazdy/integracie/gpsdozor");
      await page.locator("#gps-login").waitFor();
      await page.fill("#gps-login", DEMO.login);
      await page.fill("#gps-heslo", DEMO.heslo);
      await page.fill("#gps-nazov", `${t.znacka} GPS Dozor`);
      await page.getByRole("button", { name: "Pripojiť" }).click();
      await hlaska(/nájdených vozidiel: 1/);
      await page.getByText(SPZ).first().waitFor({ timeout: 30000 });
    });

    await t.krok("Založiť vozidlo prevezme tachometer z GPS", async () => {
      const ocakavany = await tachometerZDozoru();
      t.over(ocakavany, "GPS Dozor DEMO nehlási tachometer — nie je s čím porovnať");
      await page.getByRole("button", { name: "Založiť vozidlo" }).first().click();
      await hlaska(/Vozidlo založené a spárované, tachometer z GPS/);
      const auta = await t.cakajNa("vozidlo vo firme", async () => {
        const r = await t.rest.get(
          `vehicles?company_id=eq.${firma}&license_plate=eq.${encodeURIComponent(SPZ)}&select=id,initial_odometer`,
        );
        return r.data?.length ? r.data : null;
      });
      t.over(auta.length === 1, `vozidiel ${SPZ}: ${auta.length}`);
      const km = Number(auta[0].initial_odometer);
      t.log(`tachometer vo Fakture ${km}, v GPS ${ocakavany}`);
      // Medzi čítaniami mohlo DEMO auto kúsok prejsť.
      t.over(
        km > 0 && Math.abs(km - ocakavany) <= 50,
        `počiatočný tachometer ${km}, GPS hlási ${ocakavany}`,
      );
    });

    await t.krok("odpojenie", async () => {
      await page.getByRole("button", { name: "Odpojiť" }).first().click();
      await t.potvrd(page);
      await hlaska(/Odpojené/);
      const pr = await t.rest.get(`gps_pripojenia?company_id=eq.${firma}&select=id`);
      t.over(!pr.data?.length, "pripojenie po odpojení ostalo");
    });
  },
};
