/*
  Výkon hlavných stránok vo firme Test (najviac dát z QA firiem).

  - Každá stránka sa otvorí naostro (goto) a meria sa čas do pokoja siete
    (koniec poslednej požiadavky) a najpomalšia požiadavka na Supabase (REST/RPC). Žiadna požiadavka nesmie
    trvať nad 1 s — databáza je malá, dotaz nad sekundu je chyba (chýbajúci
    index, select * v slučke, dotaz za studena po nasadení sa nepočíta, preto
    sa stránka meria dvakrát a platí druhé meranie).
  - RPC `prehlad_suhrn` (Prehľad) musí odpovedať do 1 s.

  Nič nezapisuje.
*/

const STRANKY = [
  "/dashboard",
  "/faktury",
  "/prijate-faktury",
  "/doklady",
  "/nespracovane",
  "/odberatelia",
  "/bankove-ucty/transakcie",
  "/uctovnictvo/na-kontrolu",
];
const STROP_POZIADAVKY_MS = 1000;
const STROP_STRANKY_MS = 3000;

async function zmeraj(page, base, cesta) {
  const poziadavky = new Map();
  const zaciatok = Date.now();
  const on = (r) => poziadavky.set(r, { url: r.url(), m: r.method(), s: Date.now() });
  const off = (r) => {
    const x = poziadavky.get(r);
    if (x) x.e = Date.now();
  };
  page.on("request", on);
  page.on("requestfinished", off);
  page.on("requestfailed", off);
  try {
    await page.goto(`${base}${cesta}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  } finally {
    page.off("request", on);
    page.off("requestfinished", off);
    page.off("requestfailed", off);
  }
  const api = [...poziadavky.values()].filter(
    (x) => /supabase\.co\/(rest|rpc)|\/_serverFn\//.test(x.url) && x.e,
  );
  const najpomalsia = api.reduce((a, x) => (!a || x.e - x.s > a.e - a.s ? x : a), null);
  // Koniec poslednej požiadavky — `networkidle` sám pridáva 500 ms ticha.
  const vsetky = [...poziadavky.values()].filter((x) => x.e);
  return {
    stranka: Math.max(0, ...vsetky.map((x) => x.e)) - zaciatok,
    pocet: api.length,
    najpomalsia: najpomalsia
      ? {
          ms: najpomalsia.e - najpomalsia.s,
          url: najpomalsia.url
            .replace(/https:\/\/[^/]+supabase\.co/, "SB")
            .replace(/select=[^&]{60,}/, "select=…")
            .slice(0, 140),
        }
      : null,
  };
}

export default {
  popis: "výkon: hlavné stránky vo firme Test, žiadna požiadavka nad 1 s, prehlad_suhrn do 1 s",
  limit: 240000,
  firma: "test",
  async spusti(t) {
    const page = t.page;

    await t.krok("RPC prehlad_suhrn do 1 s", async () => {
      const polnoc = new Date();
      polnoc.setHours(0, 0, 0, 0);
      let najlepsie = Infinity;
      for (let i = 0; i < 3; i++) {
        const z = Date.now();
        const r = await t.rest.rpc("prehlad_suhrn", {
          p_company_id: t.firmy.test,
          p_dnes: t.dnes,
          p_mena: "EUR",
          p_dnes_od: polnoc.toISOString(),
        });
        t.over(r.status === 200, `prehlad_suhrn vrátil ${r.status} ${r.text.slice(0, 200)}`);
        najlepsie = Math.min(najlepsie, Date.now() - z);
      }
      t.log(`prehlad_suhrn ${najlepsie} ms (najlepšie z 3)`);
      t.over(najlepsie < STROP_POZIADAVKY_MS, `prehlad_suhrn trvá ${najlepsie} ms`);
    });

    // Zahriatie: prvé načítanie sťahuje skripty a prihlásenie.
    await t.go("/dashboard");

    for (const cesta of STRANKY) {
      await t.krok(`stránka ${cesta}`, async () => {
        await zmeraj(page, t.base, cesta);
        const m = await zmeraj(page, t.base, cesta);
        t.log(
          `${cesta}: ${m.stranka} ms, ${m.pocet} dotazov, najpomalší ${m.najpomalsia?.ms ?? "-"} ms ${m.najpomalsia?.url ?? ""}`,
        );
        t.over(!page.url().includes("/prihlasenie"), `${cesta}: presmerovalo na prihlásenie`);
        t.over(m.stranka < STROP_STRANKY_MS, `${cesta}: načítanie trvá ${m.stranka} ms`);
        t.over(
          !m.najpomalsia || m.najpomalsia.ms < STROP_POZIADAVKY_MS,
          `${cesta}: dotaz ${m.najpomalsia?.url} trvá ${m.najpomalsia?.ms} ms`,
        );
      });
    }
  },
};
