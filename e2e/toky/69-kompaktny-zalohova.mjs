/*
  Detail zálohovej faktúry v KOMPAKTNOM rozložení (QA firma Test) — to isté
  ako tok 68 (vystavená): náhľad PDF a panel 400 px ako nespracovaný doklad,
  sekcie v rovnakom poradí, zaúčtovanie za typom dokladu a tlačidlá v pätičke.
  Navyše: číslo zálohovej faktúry a karta „Daňový doklad k prijatej platbe“
  ostali v paneli. QA účtu sa voľby dizajnu vrátia, faktúra sa zmaže.
*/
import { overKompaktnyDetail, pripravKompaktny } from "./68-kompaktny-vystavena.mjs";
import { zalozFakturu } from "./66-detail-vystavenej.mjs";

export default {
  popis: "kompaktný detail zálohovej faktúry ako nespracovaný doklad — náhľad, sekcie, záloha",
  limit: 180000,
  async spusti(t) {
    await pripravKompaktny(t);
    const f = await t.krok("príprava: zálohová faktúra", () =>
      zalozFakturu(t, "proforma", `${t.znacka}-KD2`),
    );
    await overKompaktnyDetail(t, {
      id: f.id,
      hladaj: "Zálohová faktúra",
      navyse: async (page) => {
        const panel = page.locator("[data-panel-kompaktny]");
        await panel.getByText("Číslo zálohovej faktúry").first().waitFor({ timeout: 10000 });
        await panel
          .getByText("Daňový doklad k prijatej platbe")
          .first()
          .waitFor({ timeout: 10000 });
      },
    });
  },
};
