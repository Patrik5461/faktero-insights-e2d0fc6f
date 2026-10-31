/*
  Staré vydanie a hlásenie chýb (Admin → Chyby, 31. 10. 2026).

  1. Karta otvorená pred nasadením si pri prechode na inú stránku nevie
     stiahnuť kúsok novej trasy. `stara-verzia.ts` stránku obnoví — no predtým
     volal `e.preventDefault()` na `vite:preloadError`, Vite potom vrátil
     namiesto modulu `undefined` a router padol na „Cannot read properties of
     undefined (reading 'component')“ zapísané ako chyba. Tok kúsky stránky
     zablokuje, prejde inam a overí, že každé hlásenie je staré vydanie (správa
     o chýbajúcom module alebo značka `stare_vydanie`) a že sa stránka obnoví.
  2. React 19 hlási zotavené chyby obalom „Minified React error #520“ —
     skutočná chyba je v `cause`. Hlásenie ju musí niesť.

  Hlásenia sa zachytia v prehliadači a na server neodídu (nič sa nezapíše).
*/
const STARE =
  /ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export default {
  popis: "staré vydanie: chýbajúci kúsok trasy sa hlási ako staré vydanie, React #520 s príčinou",
  limit: 90000,
  async spusti(t) {
    const page = t.page;
    const hlasenia = [];
    await page.route("**/api/public/chyby", async (r) => {
      try {
        hlasenia.push(JSON.parse(r.request().postData() ?? "{}"));
      } catch {
        /* nie JSON */
      }
      await r.fulfill({ status: 204 });
    });

    await t.krok("prehľad sa načíta", async () => {
      await t.go("/dashboard");
      await page.getByRole("navigation").first().waitFor({ timeout: 20000 });
    });

    await t.krok("chýbajúci kúsok trasy → staré vydanie a obnovenie stránky", async () => {
      const blokuj = (r) => r.fulfill({ status: 404, contentType: "text/plain", body: "nie je" });
      await page.route("**/assets/**", blokuj);
      const obnovene = page.waitForEvent("load", { timeout: 20000 }).catch(() => null);
      const ciel = await page.evaluate(() => {
        const odkazy = [...document.querySelectorAll('a[href^="/"]')].filter((a) => {
          const h = a.getAttribute("href") ?? "";
          return h !== location.pathname && !h.startsWith("/dashboard") && !h.startsWith("/api");
        });
        const a =
          odkazy.find((x) => x.getAttribute("href") === "/podpora") ??
          odkazy.find((x) => x.getAttribute("href") === "/faktury") ??
          odkazy[0];
        a?.click();
        return a?.getAttribute("href") ?? null;
      });
      t.over(ciel, "na prehľade nie je odkaz na inú stránku");
      await page.waitForTimeout(4000);
      await page.unroute("**/assets/**", blokuj);
      t.over(await obnovene, `stránka sa po chýbajúcom kúsku (${ciel}) neobnovila`);
      await page.waitForLoadState("domcontentloaded").catch(() => {});

      const zle = hlasenia.filter((h) => !h.stare_vydanie && !STARE.test(String(h.sprava ?? "")));
      t.over(
        !zle.length,
        `hlásenie mimo starého vydania: ${zle.map((h) => String(h.sprava).slice(0, 120)).join(" | ")}`,
      );
      t.log(`hlásení počas obnovy: ${hlasenia.length} (${ciel})`);
    });

    await t.krok("React #520 odíde aj s príčinou", async () => {
      await t.go("/dashboard");
      hlasenia.length = 0;
      await page.evaluate(() => {
        const pricina = new TypeError("e2e príčina zotavenej chyby");
        const e = new Error(
          "Minified React error #520; visit https://react.dev/errors/520 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.",
          { cause: pricina },
        );
        window.dispatchEvent(new ErrorEvent("error", { error: e, message: e.message }));
      });
      await t.cakajNa("hlásenie #520", async () => hlasenia.length > 0, {
        limit: 10000,
        krok: 300,
      });
      const h = hlasenia[0];
      t.over(/príčina: TypeError: e2e príčina/.test(String(h.sprava)), `správa: ${h.sprava}`);
      t.over(/Caused by:/.test(String(h.stack)), "stack bez príčiny");
    });
  },
};
