/*
  GPS integrácia GPS Dozor naostro s verejným DEMO účtom (len čítanie) vo firme Test:

  - zlé heslo → hláška o prihlásení, správne → „Pripojenie funguje.“;
  - pripojenie, „Založiť vozidlo“, „Synchronizovať teraz“ → jazdy v knihe jázd
    s km, adresami a nadväzujúcim tachometrom; druhá synchronizácia bez duplicít;
  - súkromná jazda ostane súkromná aj po ďalšej synchronizácii;
  - šifrované prihlásenie nejde prečítať cez REST a heslo sa nevráti v odpovediach
    serverových funkcií; cudzia firma (PALIERA) sa k pripojeniam nedostane;
  - test pripojenia odmietne Traccar/Wialon na vnútornej adrese, http, s menom v URL
    a Geotab mimo *.geotab.com (bez volania von — overí sa pred spojením);
  - história behov a odpojenie. Po sebe zmaže jazdy, vozidlo aj pripojenie.

  DEMO prístup zverejňuje GPS Dozor v dokumentácii API
  (https://www.gpsdozor.cz/documentation/api) — nie je to tajomstvo.
  Hook /api/public/hooks/gps-sync sa tu skúša len bez tokenu (401).
*/
import { createRequire } from "node:module";
import { CUDZIA_FIRMA, cestaModulu } from "../lib/prostredie.mjs";

const DEMO = { login: "api_gpsdozor", heslo: "yakmwlARdn" };
const SPZ = "2A6 3358"; // jediné vozidlo DEMO účtu (MAN)

const require_ = createRequire(import.meta.url);
const seroval = require_(cestaModulu("seroval"));

/**
 * Zachytáva volania serverových funkcií stránky, aby sa dali zopakovať
 * s inými dátami (cudzia firma, interné adresy) — tou istou reláciou.
 */
function zachytavac(page) {
  const volania = [];
  page.on("request", (r) => {
    if (!r.url().includes("/_serverFn/") || r.method() !== "POST") return;
    let data = null;
    try {
      data = seroval.fromJSON(JSON.parse(r.postData() ?? "null"))?.data ?? null;
    } catch {
      /* iný formát */
    }
    volania.push({ url: r.url(), hlavicky: r.headers(), data });
  });
  return {
    volania,
    /** Posledné volanie, ktorého dáta spĺňajú podmienku. */
    najdi(fn) {
      for (let i = volania.length - 1; i >= 0; i--) {
        const v = volania[i];
        if (v.data && fn(v.data)) return v;
      }
      return null;
    },
    /** Zopakuje volanie s novými dátami; vráti { status, text }. */
    async zopakuj(v, data) {
      const telo = JSON.stringify(await seroval.toJSONAsync({ data }));
      const h = { ...v.hlavicky };
      delete h["content-length"];
      return page.evaluate(
        async ([url, hlavicky, body]) => {
          const r = await fetch(url, { method: "POST", headers: hlavicky, body });
          return { status: r.status, text: await r.text() };
        },
        [v.url, h, telo],
      );
    },
  };
}

/** Čaká na odpoveď serverovej funkcie, ktorej požiadavka obsahuje text. */
function odpovedFunkcie(page, obsahuje) {
  return page.waitForResponse(
    (r) =>
      r.url().includes("/_serverFn/") &&
      r.request().method() === "POST" &&
      (r.request().postData() ?? "").includes(obsahuje),
    { timeout: 60000 },
  );
}

function dekoduj(text) {
  try {
    // Odpoveď je uzol serovalu {result, error, context} bez obálky {t, f, m}.
    const j = JSON.parse(text);
    const v = seroval.fromJSON("f" in j ? j : { t: j, f: 127, m: [] });
    return v?.result ?? v;
  } catch {
    return null;
  }
}

export default {
  popis: "GPS Dozor DEMO: pripojenie, vozidlo, jazdy bez duplicít, súkromná, SSRF, odpojenie",
  limit: 240000,
  async spusti(t) {
    const page = t.page;
    const firma = t.firmy.test;
    const z = zachytavac(page);
    const hlaska = (re) =>
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: re })
        .first()
        .waitFor({ timeout: 40000 });

    // Upratovanie ide v opačnom poradí: najprv odpojenie, potom jazdy, nakoniec vozidlo.
    let vozidloId = null;
    t.uprac("vozidlo", async () => {
      const auta = await t.rest.get(
        `vehicles?company_id=eq.${firma}&license_plate=eq.${encodeURIComponent(SPZ)}&select=id`,
      );
      const ids = [...new Set([vozidloId, ...(auta.data ?? []).map((a) => a.id)].filter(Boolean))];
      for (const id of ids) {
        const r = await t.rest.delete(`vehicles?id=eq.${id}&company_id=eq.${firma}`);
        if (r.status >= 300) throw new Error(`vozidlo ${id}: ${r.status} ${r.text.slice(0, 200)}`);
      }
    });
    t.uprac("jazdy GPS Dozor", async () => {
      const r = await t.rest.delete(`trips?company_id=eq.${firma}&external_source=eq.gpsdozor`);
      if (r.status >= 300) throw new Error(`${r.status} ${r.text.slice(0, 200)}`);
    });
    t.uprac("pripojenie", async () => {
      const ids = (await t.rest.get(`gps_pripojenia?company_id=eq.${firma}&select=id`)).data ?? [];
      if (!ids.length) return;
      // Tok spadol pred odpojením — odpojí sa cez UI.
      const p = await t.novaStranka();
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
      t.over(pr.status === 200, `gps_pripojenia: ${pr.status} ${pr.text.slice(0, 200)}`);
      t.over(!pr.data.length, "vo firme Test ostalo pripojenie z minulého behu — uprac ho ručne");
      const auta = await t.rest.get(
        `vehicles?company_id=eq.${firma}&license_plate=eq.${encodeURIComponent(SPZ)}&select=id`,
      );
      t.over(!auta.data?.length, `vo firme Test ostalo vozidlo ${SPZ} z minulého behu`);
    });

    await t.krok("hook gps-sync bez tokenu → 401", async () => {
      for (const h of [{}, { "x-faktero-cron-token": "zly-token" }]) {
        const r = await fetch(`${t.base}/api/public/hooks/gps-sync`, {
          method: "POST",
          headers: h,
        });
        t.over(r.status === 401, `hook vrátil ${r.status}`);
      }
    });

    await t.krok("dlaždica v Integráciách", async () => {
      await t.go("/jazdy/integracie");
      for (const n of [
        "GPS Dozor",
        "Webdispečink",
        "Webfleet",
        "Traccar",
        "Geotab",
        "Samsara",
        "Wialon",
      ])
        await page.getByText(n, { exact: false }).first().waitFor({ timeout: 20000 });
      await page
        .getByRole("link", { name: /GPS Dozor/ })
        .first()
        .click();
      await page.waitForURL(/\/jazdy\/integracie\/gpsdozor/);
      await page.locator("#gps-login").waitFor();
    });

    await t.krok("test pripojenia: zlé heslo", async () => {
      await page.fill("#gps-login", DEMO.login);
      await page.fill("#gps-heslo", "zle-heslo-e2e");
      const odp = odpovedFunkcie(page, "zle-heslo-e2e");
      await page.getByRole("button", { name: "Otestovať pripojenie" }).click();
      const text = await (await odp).text();
      t.over(!text.includes("zle-heslo-e2e"), "odpoveď testu zopakovala heslo");
      await page.getByText(/odmietol prihlasovacie meno alebo heslo/).waitFor({ timeout: 30000 });
    });

    await t.krok("test pripojenia: DEMO účet", async () => {
      await page.fill("#gps-heslo", DEMO.heslo);
      const odp = odpovedFunkcie(page, DEMO.heslo);
      await page.getByRole("button", { name: "Otestovať pripojenie" }).click();
      const text = await (await odp).text();
      t.over(!text.includes(DEMO.heslo), "odpoveď testu obsahuje heslo");
      await page.getByText("Pripojenie funguje.").waitFor({ timeout: 30000 });
    });

    await t.krok("pripojenie", async () => {
      await page.fill("#gps-nazov", `${t.znacka} GPS Dozor`);
      const odp = odpovedFunkcie(page, `${t.znacka} GPS Dozor`);
      await page.getByRole("button", { name: "Pripojiť" }).click();
      const text = await (await odp).text();
      t.over(!text.includes(DEMO.heslo), "odpoveď uloženia obsahuje heslo");
      await hlaska(/nájdených vozidiel: 1/);
      await page.getByText(SPZ).first().waitFor({ timeout: 30000 });
    });

    await t.krok("prihlásenie nejde prečítať cez REST ani zo stavu", async () => {
      for (const sel of ["prihlasenie_sifrovane", "*"]) {
        const r = await t.rest.get(`gps_pripojenia?company_id=eq.${firma}&select=${sel}`);
        t.over(
          r.status === 401 || r.status === 403,
          `select=${sel} vrátil ${r.status} ${r.text.slice(0, 120)}`,
        );
      }
      const r = await t.rest.get(
        `gps_pripojenia?company_id=eq.${firma}&select=id,prihlasenie_verejne`,
      );
      t.over(
        r.status === 200 && r.data.length === 1,
        `pripojenie: ${r.status} ${r.text.slice(0, 120)}`,
      );
      t.over(
        r.data[0].prihlasenie_verejne?.login === DEMO.login &&
          !r.data[0].prihlasenie_verejne?.heslo,
        `prihlasenie_verejne: ${JSON.stringify(r.data[0].prihlasenie_verejne)}`,
      );
      const stav = z.najdi((d) => d.poskytovatel === "gpsdozor" && !d.hodnoty);
      t.over(stav, "nezachytilo sa načítanie stavu");
      const s = await z.zopakuj(stav, { companyId: firma, poskytovatel: "gpsdozor" });
      t.over(s.status === 200, `stav: ${s.status}`);
      t.over(!s.text.includes(DEMO.heslo), "stav pripojenia vrátil heslo");
      t.over(!/sifrovane|v1:|enc:/.test(s.text), "stav pripojenia vrátil šifrované prihlásenie");
      // heslo sa vo formulári neukáže
      await page.getByRole("button", { name: "Prihlasovacie údaje" }).click();
      t.over((await page.inputValue("#gps-heslo")) === "", "pole hesla po uložení nie je prázdne");
      await page.getByRole("button", { name: "Zrušiť" }).click();
    });

    await t.krok("cudzia firma: pripojenia ani stav", async () => {
      const r = await t.rest.get(`gps_pripojenia?company_id=eq.${CUDZIA_FIRMA}&select=id`);
      t.over(
        r.status === 200 && !r.data.length,
        `cudzie pripojenia: ${r.status} ${r.text.slice(0, 80)}`,
      );
      for (const tab of ["gps_vozidla_vazby", "gps_sync_logy"]) {
        const x = await t.rest.get(`${tab}?company_id=eq.${CUDZIA_FIRMA}&select=id&limit=1`);
        t.over(x.status >= 400 || !x.data.length, `${tab} cudzej firmy: ${x.text.slice(0, 80)}`);
      }
      const stav = z.najdi((d) => d.poskytovatel === "gpsdozor" && !d.hodnoty);
      const s = await z.zopakuj(stav, { companyId: CUDZIA_FIRMA, poskytovatel: "gpsdozor" });
      t.over(
        s.status >= 400 || /nemáte prístup/.test(s.text),
        `stav cudzej firmy: ${s.status} ${s.text.slice(0, 200)}`,
      );
      t.over(!/"pripojenia"/.test(s.text), "stav cudzej firmy vrátil pripojenia");
    });

    await t.krok("Založiť vozidlo", async () => {
      await page.getByRole("button", { name: "Založiť vozidlo" }).first().click();
      await hlaska(/Vozidlo založené a spárované/);
      const auta = await t.cakajNa("vozidlo vo firme", async () => {
        const r = await t.rest.get(
          `vehicles?company_id=eq.${firma}&license_plate=eq.${encodeURIComponent(SPZ)}&select=id,name`,
        );
        return r.data?.length ? r.data : null;
      });
      t.over(auta.length === 1, `vozidiel ${SPZ}: ${auta.length}`);
      vozidloId = auta[0].id;
      const v = await t.rest.get(`gps_vozidla_vazby?company_id=eq.${firma}&select=vehicle_id`);
      t.over(v.data?.[0]?.vehicle_id === vozidloId, "väzba nie je spárovaná so založeným vozidlom");
    });

    let pocet = 0;
    await t.krok("Synchronizovať teraz", async () => {
      const odp = odpovedFunkcie(page, "pripojenieId");
      await page.getByRole("button", { name: "Synchronizovať teraz" }).click();
      const r = dekoduj(await (await odp).text());
      t.over(r && !r.chyba, `synchronizácia: ${JSON.stringify(r)?.slice(0, 300)}`);
      // Paralelne mohol bežať cron (každých 15 min) — počíta sa až výsledok v DB.
      const jazdy = await t.rest.get(
        `trips?company_id=eq.${firma}&external_source=eq.gpsdozor&select=id,external_id,vehicle_id,distance_km,start_location,end_location,start_odometer,end_odometer,start_time,end_time,classification,driver_name&order=start_time`,
      );
      pocet = jazdy.data?.length ?? 0;
      t.log(
        `jazd ${pocet}, z volania ${r.importovane}, duplicít ${r.duplicity}, neúplné ${r.neuplne}`,
      );
      t.over(pocet > 0, "DEMO vozidlo za 30 dní nemá žiadnu jazdu");
      t.over(
        jazdy.data.every((j) => j.vehicle_id === vozidloId),
        "jazda na inom vozidle",
      );
      t.over(
        new Set(jazdy.data.map((j) => j.external_id)).size === pocet,
        "duplicitné external_id",
      );
      t.over(
        jazdy.data.every((j) => j.distance_km > 0),
        "jazda s nulovými km",
      );
      const sAdresou = jazdy.data.filter((j) => j.start_location && j.end_location).length;
      t.over(sAdresou >= pocet * 0.8, `adresy má len ${sAdresou}/${pocet} jázd`);
      const zlyTacho = jazdy.data.filter(
        (j) =>
          Number(j.end_odometer) < Number(j.start_odometer) ||
          Math.abs(Number(j.end_odometer) - Number(j.start_odometer) - Number(j.distance_km)) > 1.5,
      );
      t.over(!zlyTacho.length, `tachometer nesedí s km: ${JSON.stringify(zlyTacho[0])}`);
      // Nadväznosť: koniec jazdy = začiatok ďalšej (Dozor dáva celé km, tolerancia 2 km).
      let skoky = 0;
      for (let i = 1; i < jazdy.data.length; i++)
        if (Math.abs(jazdy.data[i].start_odometer - jazdy.data[i - 1].end_odometer) > 2) skoky++;
      t.over(skoky <= Math.max(2, pocet * 0.1), `tachometer nenadväzuje v ${skoky} jazdách`);
    });

    await t.krok("druhá synchronizácia bez duplicít", async () => {
      const odp = odpovedFunkcie(page, "pripojenieId");
      await page.getByRole("button", { name: "Synchronizovať teraz" }).click();
      const r = dekoduj(await (await odp).text());
      t.over(r && !r.chyba, `synchronizácia: ${JSON.stringify(r)?.slice(0, 300)}`);
      t.over(r.importovane === 0, `druhá synchronizácia importovala ${r.importovane} jázd`);
      const n = await t.rest.pocet(`trips?company_id=eq.${firma}&external_source=eq.gpsdozor`);
      t.over(n === pocet, `jazd po druhej synchronizácii ${n}, predtým ${pocet}`);
    });

    await t.krok("súkromná jazda v knihe jázd ostane súkromná", async () => {
      const p = await t.novaStranka();
      await t.go("/jazdy", p);
      await p
        .getByRole("checkbox", { name: /Označiť jazdu z/ })
        .first()
        .check();
      await p.getByRole("button", { name: "Označiť ako súkromné" }).click();
      await p
        .locator("[data-sonner-toast]")
        .filter({ hasText: /Označených ako súkromné: 1/ })
        .first()
        .waitFor({ timeout: 20000 });
      const sukr = await t.rest.get(
        `trips?company_id=eq.${firma}&external_source=eq.gpsdozor&classification=eq.private&select=id`,
      );
      t.over(sukr.data?.length === 1, `súkromných jázd ${sukr.data?.length}`);
      await p.close();
      const odp = odpovedFunkcie(page, "pripojenieId");
      await page.getByRole("button", { name: "Synchronizovať teraz" }).click();
      await odp;
      const po = await t.rest.get(`trips?id=eq.${sukr.data[0].id}&select=classification`);
      t.over(po.data?.[0]?.classification === "private", "synchronizácia prepísala súkromnú jazdu");
    });

    await t.krok("história synchronizácií", async () => {
      await t.go("/jazdy/integracie/gpsdozor");
      for (const n of ["Ručne", "Vozidlá"])
        await page.getByText(n, { exact: true }).first().waitFor({ timeout: 20000 });
      await page
        .getByText(/Hotovo: \d+ nových jázd/)
        .first()
        .waitFor();
      const logy = await t.rest.get(`gps_sync_logy?company_id=eq.${firma}&select=druh,stav,sprava`);
      t.over(
        logy.data?.some((l) => l.druh === "rucne" && l.stav === "ok"),
        `log ručnej synchronizácie chýba: ${logy.text.slice(0, 200)}`,
      );
      t.over(!logy.text.includes(DEMO.heslo), "log obsahuje heslo");
    });

    await t.krok("odpojenie", async () => {
      const odp = odpovedFunkcie(page, "pripojenieId");
      await page.getByRole("button", { name: "Odpojiť" }).first().click();
      await t.potvrd(page);
      await odp;
      await hlaska(/Odpojené/);
      const pr = await t.rest.get(`gps_pripojenia?company_id=eq.${firma}&select=id`);
      t.over(!pr.data?.length, "pripojenie po odpojení ostalo");
      const vz = await t.rest.get(`gps_vozidla_vazby?company_id=eq.${firma}&select=id`);
      t.over(!vz.data?.length, "väzby vozidiel po odpojení ostali");
      const n = await t.rest.pocet(`trips?company_id=eq.${firma}&external_source=eq.gpsdozor`);
      t.over(n === pocet, `po odpojení ostalo ${n} jázd z ${pocet}`);
      await page.getByRole("button", { name: "Pripojiť" }).waitFor();
    });

    await t.krok("SSRF: Traccar, Wialon a Geotab na nepovolenej adrese", async () => {
      const test = z.najdi((d) => d.poskytovatel === "gpsdozor" && d.hodnoty?.heslo === DEMO.heslo);
      t.over(test, "nezachytilo sa volanie testu pripojenia");
      const pripady = [
        ["traccar", { url: "https://127.0.0.1", email: "a@b.sk", heslo: "x" }, /verejne dostupná/],
        ["traccar", { url: "https://localhost:8082", token: "x" }, /verejne dostupná/],
        ["traccar", { url: "https://[::ffff:127.0.0.1]", token: "x" }, /verejne dostupná/],
        ["traccar", { url: "https://[::ffff:a9fe:a9fe]", token: "x" }, /verejne dostupná/],
        ["traccar", { url: "https://169.254.169.254", token: "x" }, /verejne dostupná/],
        ["traccar", { url: "https://192.168.1.1", token: "x" }, /verejne dostupná/],
        ["traccar", { url: "http://demo.traccar.org", token: "x" }, /https/],
        ["traccar", { url: "https://u:p@demo.traccar.org", token: "x" }, /meno a heslo/],
        ["wialon", { url: "https://10.0.0.1", token: "x".repeat(72) }, /verejne dostupná/],
        ["wialon", { url: "http://hst-api.wialon.com", token: "x".repeat(72) }, /https/],
        ["wialon", { url: "https://a:b@hst-api.wialon.com", token: "x".repeat(72) }, /bez mena/],
        ["geotab", { server: "127.0.0.1", database: "d", user: "u", password: "p" }, /geotab\.com/],
        [
          "geotab",
          { server: "geotab.com.evil.sk", database: "d", user: "u", password: "p" },
          /geotab\.com/,
        ],
      ];
      const zle = [];
      for (const [poskytovatel, hodnoty, ocakavane] of pripady) {
        const r = await z.zopakuj(test, { companyId: firma, poskytovatel, hodnoty });
        const v = dekoduj(r.text);
        const sprava = v?.chyba ?? r.text.slice(0, 200);
        if (v?.ok !== false || !ocakavane.test(sprava))
          zle.push(`${poskytovatel} ${JSON.stringify(hodnoty).slice(0, 60)} → ${sprava}`);
      }
      t.over(!zle.length, `nepovolená adresa prešla alebo zlá hláška:\n${zle.join("\n")}`);
    });
  },
};
