/*
  Výkazy k DPH českej firmy (QA Česká) v jazyku rozhrania.

  Obrazovka bola celá po česky aj v slovenskom rozhraní — texty boli kľúče
  `t()` po česky. Teraz sú kľúče slovenské a čeština aj nemčina idú zo
  slovníkov (`src/lib/i18n/{cs,de}/sto-web.ts`). Overí sa SK, CS a DE vrátane
  mesiacov v zozname. Jazyk sa prepína cookie `faktero_jazyk` len v kontexte
  tohto toku. Nič nezapisuje.
*/
import { BASE } from "../lib/prostredie.mjs";

const JAZYKY = [
  {
    kod: "sk",
    ma: ["Priznanie k DPH", "Zdaňovacie obdobie", "Január"],
    nema: ["Přiznání k DPH", "Zdaňovací období", "Leden"],
  },
  {
    kod: "cs",
    ma: ["Přiznání k DPH", "Zdaňovací období", "Leden"],
    nema: ["Priznanie k DPH", "Zdaňovacie obdobie"],
  },
  {
    kod: "de",
    ma: ["MwSt.-Erklärung", "Besteuerungszeitraum", "Januar"],
    nema: ["Priznanie k DPH", "Přiznání k DPH"],
  },
];

export default {
  popis: "CZ výkazy DPH v slovenčine, češtine a nemčine (nie natvrdo po česky)",
  limit: 180000,
  firma: "cz",
  async spusti(t) {
    const page = t.page;
    const host = new URL(BASE).hostname;
    for (const j of JAZYKY) {
      await t.krok(`jazyk ${j.kod}`, async () => {
        await page
          .context()
          .addCookies([{ name: "faktero_jazyk", value: j.kod, domain: host, path: "/" }]);
        await t.go("/uctovnictvo/vykazy");
        const main = page.locator("main");
        await main.getByText(j.ma[0], { exact: true }).first().waitFor({ timeout: 30000 });
        // Mesiace sú v <option> — tie getByText nevidí, číta sa celý text.
        const text = await main.evaluate((el) =>
          [el.innerText, ...[...el.querySelectorAll("option")].map((o) => o.textContent)].join(
            "\n",
          ),
        );
        for (const x of j.ma) t.over(text.includes(x), `${j.kod}: chýba „${x}“`);
        for (const x of j.nema) t.over(!text.includes(x), `${j.kod}: je tam „${x}“`);
      });
    }
    // Ďalšie toky v tom istom behu majú slovenčinu.
    await page
      .context()
      .addCookies([{ name: "faktero_jazyk", value: "sk", domain: host, path: "/" }]);
  },
};
