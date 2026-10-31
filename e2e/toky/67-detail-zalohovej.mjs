/*
  Jednotný detail zálohovej faktúry (QA firma Test) — to isté rozloženie ako
  nespracovaný doklad a vystavená faktúra (tok 66): náhľad PDF, údaje, pod
  nimi karta „Zaúčtovanie“ s predkontáciou zálohových faktúr, prepnutie strany
  a úzka obrazovka. Navyše: karta zálohy s „Daňovým dokladom k prijatej
  platbe“ ostala. Faktúra sa po toku zmaže, voľba strany v účte sa vráti.
*/
import { pripravStranu } from "./64-nahlad-strana.mjs";
import { overJednotnyDetail, zalozFakturu } from "./66-detail-vystavenej.mjs";

export default {
  popis: "detail zálohovej faktúry ako nespracovaný doklad — náhľad, zaúčtovanie, záloha",
  limit: 180000,
  async spusti(t) {
    await pripravStranu(t);
    const f = await t.krok("príprava: zálohová faktúra", () =>
      zalozFakturu(t, "proforma", `${t.znacka}-JD2`),
    );
    await overJednotnyDetail(t, {
      id: f.id,
      hladaj: "Zálohová faktúra",
      navyse: async (page) => {
        await page.getByText("Daňový doklad k prijatej platbe").first().waitFor({ timeout: 10000 });
      },
    });
  },
};
