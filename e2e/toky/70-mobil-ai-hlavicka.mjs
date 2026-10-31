/*
  Telefón 390 px (QA firma Test):
  - hlavička detailu faktúry: hlavné tlačidlo „Odoslať eFaktúru“ nie je orezané
    (celý text, v SK aj DE a CS), nevznikne vodorovný posuv;
  - plávajúce tlačidlo AI neprekrýva tlačidlá v pätičke kompaktného panelu
    (Uložiť bez zaúčtovania / Zaúčtovať) — pod koniec stránky sa dá odrolovať;
  - pri písaní do poľa (otvorená klávesnica) tlačidlo AI zmizne;
  - zoznamy faktúr, prijatých, bločkov a nespracovaných sa nedajú posunúť do strany.
  QA účet sa na tok prepne do kompaktného dizajnu a potom sa mu vráti pôvodná
  voľba; faktúra sa zmaže natvrdo.
*/
import { zalozFakturu } from "./66-detail-vystavenej.mjs";
import { pripravKompaktny } from "./68-kompaktny-vystavena.mjs";

export const ZOZNAMY = ["/faktury", "/prijate-faktury", "/doklady", "/nespracovane", "/dashboard"];

/**
 * O koľko px je stránka širšia ako telefón (skutočný posuv aj odrezaný obsah).
 * Porovnáva sa so šírkou zariadenia (`screen.width`), nie s `innerWidth`:
 * mobilný prehliadač pri širšom obsahu roztiahne layout viewport a innerWidth
 * je potom rovnaký ako scrollWidth (481 = 481), takže by chybu nikdy nenašiel.
 */
export async function posuvStranky(page) {
  return page.evaluate(() => {
    const sirka = Math.min(window.screen.width, window.innerWidth);
    window.scrollTo(10000, window.scrollY);
    const posun = window.scrollX;
    window.scrollTo(0, window.scrollY);
    return Math.max(
      posun,
      document.documentElement.scrollWidth - sirka,
      document.body.scrollWidth - sirka,
    );
  });
}

/** Nie je hlavné tlačidlo hlavičky orezané? Vráti popis chyby alebo null. */
export async function orezanaHlavnaAkcia(page) {
  const b = page.locator("[data-hlavna-akcia] button").first();
  await b.waitFor({ timeout: 30000 });
  return b.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const text = el.innerText.trim();
    if (el.scrollWidth > el.clientWidth + 1)
      return `„${text}“ je orezané (${el.scrollWidth} > ${el.clientWidth} px)`;
    if (r.right > window.innerWidth + 1 || r.left < -1)
      return `„${text}“ presahuje okraj (${Math.round(r.left)}–${Math.round(r.right)} px)`;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ra = a.getBoundingClientRect();
      const o = getComputedStyle(a).overflowX;
      if (o !== "visible" && r.right > ra.right + 1)
        return `„${text}“ odrezáva ${a.tagName.toLowerCase()} (${Math.round(r.right)} > ${Math.round(ra.right)} px)`;
    }
    return null;
  });
}

/** Ktoré z tlačidiel (podľa mena) kryje AI tlačidlo, keď je stránka dole. */
export async function prekryteAi(page, mena) {
  return page.evaluate(async (mena) => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
    const ai = document.querySelector("[data-ai-prepinac]");
    if (!ai) return { ai: false, zle: [] };
    const a = ai.getBoundingClientRect();
    const zle = [];
    for (const b of document.querySelectorAll("main button, main a[href]")) {
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const text = (b.getAttribute("aria-label") || b.innerText || "").trim();
      if (mena.length && !mena.some((m) => text.includes(m))) continue;
      const x = Math.min(r.right, a.right) - Math.max(r.left, a.left);
      const y = Math.min(r.bottom, a.bottom) - Math.max(r.top, a.top);
      if (x > 1 && y > 1) zle.push(text.slice(0, 40));
    }
    return { ai: true, zle };
  }, mena);
}

export default {
  popis: "mobil 390 px: tlačidlo AI nič neprekrýva, hlavička faktúry neorezaná, zoznamy bez posuvu",
  limit: 240000,
  async spusti(t) {
    const f = await t.krok("príprava: vystavená faktúra", () =>
      zalozFakturu(t, "regular", `${t.znacka}-MD1`),
    );

    for (const jazyk of ["sk", "de", "cs"]) {
      await t.krok(`hlavička faktúry (${jazyk}): hlavné tlačidlo celé, bez posuvu`, async () => {
        // Jazyk cez ?lang= (voľba je v cookie, adresa ju prebije a uloží len v tomto kontexte).
        const page = await t.novaStranka({ mobil: true });
        await t.go(`/faktury/${f.id}?lang=${jazyk}`, page);
        const chyba = await orezanaHlavnaAkcia(page);
        t.over(!chyba, chyba ?? "");
        const posuv = await posuvStranky(page);
        t.over(posuv <= 1, `detail faktúry sa posúva do strany o ${posuv} px`);
      });
    }

    await t.krok("zoznamy bez vodorovného posuvu", async () => {
      const page = await t.novaStranka({ mobil: true });
      const zle = [];
      for (const cesta of ZOZNAMY) {
        await t.go(cesta, page);
        await page.waitForTimeout(800);
        const posuv = await posuvStranky(page);
        if (posuv > 1) zle.push(`${cesta}: ${posuv} px`);
      }
      t.over(!zle.length, `posuv do strany: ${zle.join(", ")}`);
    });

    await pripravKompaktny(t);
    await t.krok("kompaktný detail: AI tlačidlo nekryje pätičku panelu", async () => {
      const page = await t.novaStranka({ mobil: true });
      await page.context().addInitScript(() => {
        try {
          localStorage.setItem("faktero.dizajn", "kompaktny");
        } catch {
          /* bez úložiska */
        }
      });
      await t.go(`/faktury/${f.id}`, page);
      await page.locator("[data-panel-kompaktny]").first().waitFor({ timeout: 30000 });
      await page.locator("[data-ai-prepinac]").first().waitFor({ timeout: 20000 });
      const r = await prekryteAi(page, []);
      t.over(r.ai, "tlačidlo AI na stránke nie je — test by nič neoveril");
      t.over(!r.zle.length, `AI tlačidlo kryje: ${r.zle.join(", ")}`);
      for (const meno of ["Zaúčtovať", "Uložiť bez zaúčtovania"]) {
        const b = page.getByRole("button", { name: meno }).last();
        if (!(await b.count())) continue;
        // Klik musí trafiť tlačidlo, nie AI (Playwright by inak hlásil „intercepts pointer events“).
        await b.click({ trial: true, timeout: 5000 });
      }
      const posuv = await posuvStranky(page);
      t.over(posuv <= 1, `kompaktný detail sa posúva do strany o ${posuv} px`);
    });

    await t.krok("pri písaní do poľa tlačidlo AI zmizne", async () => {
      const page = await t.novaStranka({ mobil: true });
      await t.go("/faktury", page);
      await page.locator("[data-ai-prepinac]").first().waitFor({ timeout: 20000 });
      const pole = page.locator('main input[type="search"], main input[type="text"]').first();
      await pole.focus();
      await page.waitForTimeout(300);
      t.over(
        (await page.locator("[data-ai-prepinac]").count()) === 0,
        "tlačidlo AI ostalo pri písaní na obrazovke",
      );
      await pole.blur();
      await page.locator("[data-ai-prepinac]").first().waitFor({ timeout: 5000 });
    });
  },
};
