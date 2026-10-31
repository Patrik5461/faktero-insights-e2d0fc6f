/*
  Kniha jázd v mobilnej appke (Faktero) — všetko, čo ide bez natívneho
  pluginu detekcie (ten v prehliadači nebeží; GPS dodá Playwright).

  1. Nové vozidlo zo appky (názov, EČ, spotreba) + tankovanie z webu (cena).
  2. Ručne spustená súkromná jazda: GPS body, koniec bez signálu → jazda ostane
     v telefóne aj so spotrebou a cenou paliva.
  3. Zatvorenie a otvorenie appky bez signálu — jazda čaká ďalej.
  4. Signál sa vráti, prvý zápis jazdy prejde, ale odpoveď sa stratí →
     v knihe jázd smie byť jazda len raz.
  5. História: oprava charakteru (bez signálu sa nesmie zaseknúť, so signálom
     sa zapíše), zmazanie.
  6. Obrazovka Jazda v nemčine bez slovenských zvyškov.
  Vozidlo, tankovanie aj jazdy sa na konci zmažú.
*/
import { balicekVPamati } from "../lib/apka-offline.mjs";
import { otvorApku, tlacidlo, zalozka } from "../lib/apka.mjs";

const START = { latitude: 48.1486, longitude: 17.1077 };

async function otvorJazdu(page) {
  await zalozka(page, 0);
  await page
    .locator("main")
    .getByRole("button", { name: /^(Jazda|Fahrt)$/ })
    .first()
    .click();
}

export default {
  popis:
    "appka: kniha jázd — vozidlo, súkromná jazda bez signálu, výpadok pri odoslaní, oprava, preklad",
  limit: 300000,
  async spusti(t) {
    const firma = t.firmy.test;
    const nazov = `${t.znacka} Octavia`;
    let auto = null;
    const jazdy = async () =>
      auto
        ? ((
            await t.rest.get(
              `trips?vehicle_id=eq.${auto.id}&select=id,classification,distance_km,fuel_consumption,fuel_price,purpose,trip_date`,
            )
          ).data ?? [])
        : [];
    t.uprac("vozidlo, tankovanie a jazdy", async () => {
      const v = await t.rest.get(
        `vehicles?company_id=eq.${firma}&name=eq.${encodeURIComponent(nazov)}&select=id`,
      );
      for (const x of v.data ?? []) {
        await t.rest.delete(`trips?vehicle_id=eq.${x.id}`);
        await t.rest.delete(`fuel_records?vehicle_id=eq.${x.id}`);
        const r = await t.rest.delete(`vehicles?id=eq.${x.id}`);
        if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
      }
    });

    let page = await otvorApku(t);
    const ctx = page.context();
    await ctx.grantPermissions(["geolocation"], { origin: t.base });
    await ctx.setGeolocation(START);
    const siet = await balicekVPamati(ctx, t.base);

    await t.krok("nové vozidlo v appke a tankovanie", async () => {
      await otvorJazdu(page);
      await tlacidlo(page, /^Pridať vozidlo$/).click();
      await page.getByPlaceholder("napr. Škoda Octavia").fill(nazov);
      await page.getByPlaceholder("TT123AB").fill("BA111EE");
      await page.getByPlaceholder("napr. 6,5").fill("6,5");
      await page
        .getByRole("button", { name: /^Pridať vozidlo$/ })
        .last()
        .click();
      auto = await t.cakajNa("vozidlo v databáze", async () => {
        const r = await t.rest.get(
          `vehicles?company_id=eq.${firma}&name=eq.${encodeURIComponent(nazov)}&select=id,license_plate,consumption_l_100km`,
        );
        return r.data?.[0];
      });
      t.over(auto.license_plate === "BA111EE", `EČ ${auto.license_plate}`);
      t.over(Number(auto.consumption_l_100km) === 6.5, `spotreba ${auto.consumption_l_100km}`);
      await t.rest.vloz("fuel_records", {
        company_id: firma,
        vehicle_id: auto.id,
        fuel_date: t.dnes,
        liters: 40,
        price_per_liter: 1.6,
        total_amount: 64,
      });
      // Znovu otvoriť — cena z tankovania sa načíta pri výbere auta.
      await t.go("/app", page);
      await otvorJazdu(page);
      await tlacidlo(page, new RegExp(`^${nazov}`)).click();
      await page.waitForTimeout(1500);
    });

    await t.krok("súkromná jazda, koniec bez signálu", async () => {
      await page.getByPlaceholder("napr. servis u odberateľa").fill(`${t.znacka} cesta`);
      await tlacidlo(page, /^Súkromná$/).click();
      await tlacidlo(page, /^Začať jazdu$/).click();
      // ~1,2 km na sever, bod každých 700 ms (≈ 90 km/h).
      for (let i = 1; i <= 45; i++) {
        await ctx.setGeolocation({
          latitude: START.latitude + i * 0.00025,
          longitude: START.longitude,
          accuracy: 5,
        });
        await page.waitForTimeout(700);
      }
      await siet.odpoj(true);
      await tlacidlo(page, /^Ukončiť a uložiť jazdu$/).click();
      await page
        .getByText(/Jazda uložená v telefóne/)
        .first()
        .waitFor({ timeout: 20000 });
      t.over((await jazdy()).length === 0, "jazda je v databáze, hoci nebol signál");
    });

    await t.krok("zatvorenie a otvorenie appky bez signálu", async () => {
      await page.close();
      page = await ctx.newPage();
      page.setDefaultTimeout(20000);
      await page.goto(`${t.base}/app`, { waitUntil: "domcontentloaded" });
      const cakajuce = await page.evaluate(
        (firmaId) =>
          new Promise((ok) => {
            const r = indexedDB.open("faktero-jazdy");
            r.onsuccess = () => {
              try {
                const q = r.result.transaction("jazdy").objectStore("jazdy").getAll();
                q.onsuccess = () =>
                  ok(q.result.filter((j) => j.caka && j.company_id === firmaId).length);
                q.onerror = () => ok(-1);
              } catch {
                ok(-2);
              }
            };
            r.onerror = () => ok(-3);
          }),
        firma,
      );
      t.over(cakajuce === 1, `v telefóne čaká ${cakajuce} jázd, čakal som 1`);
    });

    await t.krok("výpadok pri odoslaní jazdy nič nezdvojí", async () => {
      let stratene = 0;
      await page.route("**/rest/v1/trips**", async (route) => {
        if (route.request().method() !== "POST" || stratene >= 1) return route.fallback();
        stratene++;
        await route.fetch().catch(() => {});
        return route.abort("connectionreset");
      });
      await siet.odpoj(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.waitForTimeout(5000);
      // Druhý pokus: obrazovka Jazda pri otvorení posiela, čo čaká.
      await otvorJazdu(page);
      await page.waitForTimeout(5000);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      const [j] = await t.cakajNa(
        "jazda v databáze",
        async () => {
          const z = await jazdy();
          return z.length ? z : null;
        },
        { limit: 40000 },
      );
      await page.waitForTimeout(5000);
      const vsetky = await jazdy();
      t.over(stratene === 1, `výpadok sa nenasimuloval (${stratene})`);
      t.over(vsetky.length === 1, `jazda je v knihe ${vsetky.length}× (výpadok ju zdvojil)`);
      t.over(j.classification === "private", `charakter ${j.classification}, čakal som private`);
      t.over(Number(j.distance_km) > 0.8, `kilometre ${j.distance_km}`);
      t.over(
        Number(j.fuel_price) === 1.6,
        `cena paliva ${j.fuel_price}, čakal som 1,6 z tankovania`,
      );
      const ocak = (Number(j.distance_km) * 6.5) / 100;
      t.over(
        Math.abs(Number(j.fuel_consumption) - ocak) < 0.01,
        `spotreba ${j.fuel_consumption}, čakal som ${ocak.toFixed(3)} (jazda bez signálu)`,
      );
      await page.unroute("**/rest/v1/trips**");
    });

    await t.krok("história: oprava charakteru a zmazanie", async () => {
      await t.go("/app", page);
      await otvorJazdu(page);
      await page.getByRole("button", { name: `História jázd — ${nazov}` }).click();
      const riadok = page.getByRole("button", { name: /cesta/ }).first();
      await riadok.click();
      // Bez signálu sa oprava nesmie zaseknúť ani ticho tváriť, že prešla.
      await siet.odpoj(true);
      await tlacidlo(page, /^Služobná$/).click();
      await page.waitForTimeout(3000);
      await siet.odpoj(false);
      t.over(
        (await jazdy())[0].classification === "private",
        "bez signálu sa charakter zmenil v databáze?",
      );
      const sluzobna = tlacidlo(page, /^Služobná$/);
      t.over(await sluzobna.isEnabled(), "po neúspešnej oprave ostalo tlačidlo zaseknuté");
      await sluzobna.click();
      await t.cakajNa("charakter v databáze", async () =>
        (await jazdy())[0]?.classification === "business" ? true : null,
      );
      await tlacidlo(page, /^Zmazať jazdu$/).click();
      await tlacidlo(page, /^Naozaj zmazať/).click();
      await t.cakajNa("jazda zmazaná", async () => ((await jazdy()).length === 0 ? true : null));
    });

    await t.krok("Jazda po nemecky", async () => {
      const de = await otvorApku(t, { jazyk: "de" });
      await otvorJazdu(de);
      await de.waitForTimeout(2500);
      const text = await de.locator("main").last().innerText();
      const slovenske = text
        .split("\n")
        .map((x) => x.trim())
        .filter(
          (x) =>
            x &&
            !x.includes(t.znacka) &&
            /\b(Jazda|Začať|Vozidlo|Účel|Súkromná|Služobná|história|Pridať|Typ jazdy)\b/.test(x),
        );
      t.over(
        !slovenske.length,
        `slovenčina v nemeckej Jazde: ${slovenske.slice(0, 4).join(" | ")}`,
      );
    });
  },
};
