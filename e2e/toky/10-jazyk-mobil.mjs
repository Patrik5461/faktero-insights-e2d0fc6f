/*
  Prepínač jazyka na nemčinu (v novom kontexte — cookie jazyka ostane len tu)
  a mobilná šírka 390 px bez vodorovného posúvania na hlavných stránkach.
*/
const STRANKY = [
  "/dashboard",
  "/faktury",
  "/faktury/nova",
  "/prijate-faktury",
  "/doklady",
  "/nespracovane",
  "/bankove-ucty",
  "/exporty",
  "/uctovnictvo/vykazy",
  "/odberatelia",
  "/nastavenia",
];

export default {
  popis: "prepínač jazyka (DE) a mobil 390 px bez vodorovného posúvania",
  limit: 150000,
  async spusti(t) {
    const page = t.page;

    await t.krok("prepnutie do nemčiny", async () => {
      await t.go("/dashboard");
      await page
        .getByRole("button", { name: /^Jazyk: / })
        .first()
        .click();
      await Promise.all([
        page.waitForEvent("load", { timeout: 30000 }),
        page.getByRole("menuitemradio", { name: /Deutsch/ }).click(),
      ]);
      await page
        .getByText("Umsatz diesen Monat", { exact: true })
        .first()
        .waitFor({ timeout: 20000 });
      const text = await page.locator("body").innerText();
      t.over(text.includes("Fakturierung"), "menu nie je po nemecky (chýba „Fakturierung“)");
      t.over(
        !text.includes("Obrat tento mesiac"),
        "na Prehľade ostal slovenský text „Obrat tento mesiac“",
      );
      t.over((await page.locator("html").getAttribute("lang")) === "de", "html lang nie je de");
    });

    await t.krok("mobil 390 px bez vodorovného posúvania", async () => {
      const mobil = await t.novaStranka({ mobil: true });
      const zle = [];
      for (const cesta of STRANKY) {
        await t.go(cesta, mobil);
        await mobil
          .locator("main")
          .first()
          .waitFor({ timeout: 20000 })
          .catch(() => {});
        await mobil.waitForTimeout(800);
        // Skutočné posúvanie: stránka sa dá odsunúť doprava (overflow-x: hidden ho neprepustí).
        const m = await mobil.evaluate(() => {
          window.scrollTo(10000, window.scrollY);
          const posun = window.scrollX;
          window.scrollTo(0, window.scrollY);
          return {
            posun,
            sirka: document.documentElement.clientWidth,
            obsah: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
            url: location.pathname,
          };
        });
        if (m.url.startsWith("/prihlasenie")) {
          zle.push(`${cesta}: presmerované na prihlásenie`);
          continue;
        }
        if (m.posun > 1) zle.push(`${cesta}: stránka sa posúva vodorovne o ${m.posun} px`);
        /*
          html a body majú overflow-x: clip — stránka sa teda neposunie, ale čo
          presahuje, je odrezané a nedá sa naň kliknúť. Hľadajú sa viditeľné
          prvky za pravým okrajom, ktoré nie sú v posúvateľnom kontajneri (tabuľka
          v overflow-auto je v poriadku).
        */
        const orezane = await mobil.evaluate((sirka) => {
          const vPosuvnom = (e) => {
            for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
              const o = getComputedStyle(a).overflowX;
              if (o === "auto" || o === "scroll" || o === "hidden") return true;
            }
            return false;
          };
          const popis = (e) => {
            while (e.closest("svg") && e.closest("svg").parentElement)
              e = e.closest("svg").parentElement;
            const trieda =
              typeof e.className === "string" ? e.className.split(" ").slice(0, 3).join(".") : "";
            return `${e.tagName.toLowerCase()}${trieda ? "." + trieda : ""} „${(e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30)}“ (${Math.round(e.getBoundingClientRect().right)} px)`;
          };
          const prvky = [...document.querySelectorAll("main *, header *")].filter((e) => {
            const r = e.getBoundingClientRect();
            if (r.width === 0 || r.height === 0 || r.right <= sirka + 1) return false;
            const cs = getComputedStyle(e);
            if (cs.visibility === "hidden" || cs.position === "fixed") return false;
            return !vPosuvnom(e);
          });
          // Najvonkajší presahujúci prvok stačí — jeho deti by sa len opakovali.
          const vonkajsie = prvky.filter((e) => !prvky.includes(e.parentElement));
          return vonkajsie.slice(0, 3).map(popis);
        }, m.sirka);
        if (orezane.length)
          zle.push(`${cesta}: presahuje za okraj ${m.sirka} px: ${orezane.join(", ")}`);
      }
      t.over(!zle.length, `vodorovné posúvanie: ${zle.join("; ")}`);
    });
  },
};
