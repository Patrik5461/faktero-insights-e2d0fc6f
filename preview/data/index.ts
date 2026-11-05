/**
 * Naplnenie demo databázy. Poradie je dôležité — neskoršie moduly odkazujú
 * na riadky zo skorších (firmy → kontakty → faktúry → doklady → banka …).
 *
 * Nový modul: vytvor `preview/data/<agenda>.ts` s funkciou `napln…(db)` a
 * zaraď ju sem. Návod je v /home/patrik/redizajn-web/PREVIEW.md.
 */
import type { DemoDb } from "../server/db";
import { naplnZaklad } from "./zaklad";
import { naplnKontakty } from "./kontakty";
import { naplnFaktury } from "./faktury";
import { naplnSklad } from "./sklad";
import { naplnCennikImport } from "./cennik-import";
import { naplnZakazky } from "./zakazky";
import { naplnDoklady } from "./doklady";
import { naplnBanka } from "./banka";
import { naplnPlatbaDoklady } from "./platba-doklady";
import { naplnPlatbaOstatne } from "./platba-ostatne";
import { naplnJazdy } from "./jazdy";
import { naplnZamestnanci } from "./zamestnanci";
import { naplnUctovnictvo } from "./uctovnictvo";
import { naplnEfaktura } from "./efaktura";
import { naplnNastavenia } from "./nastavenia";
import { naplnOdoslaneMaily } from "./odoslane-maily";
import { naplnOznamy } from "./oznamy";

const MODULY: [string, (db: DemoDb) => void][] = [
  ["základ", naplnZaklad],
  ["kontakty a produkty", naplnKontakty],
  ["faktúry, ponuky, objednávky", naplnFaktury],
  ["sklad a cenník", naplnSklad],
  ["cenové hladiny pre import cenníka", naplnCennikImport],
  ["zákazky", naplnZakazky],
  ["doklady", naplnDoklady],
  ["banka a pokladňa", naplnBanka],
  ["platba bločkov prevodom", naplnPlatbaDoklady],
  ["platba iných dokladov", naplnPlatbaOstatne],
  ["kniha jázd a vozový park", naplnJazdy],
  ["zamestnanci", naplnZamestnanci],
  ["účtovníctvo", naplnUctovnictvo],
  ["eFaktúra", naplnEfaktura],
  ["nastavenia, integrácie, podpora", naplnNastavenia],
  ["odoslané e-maily", naplnOdoslaneMaily],
  ["oznam o aktualizácii", naplnOznamy],
];

export function naplnDemoData(db: DemoDb) {
  for (const [meno, f] of MODULY) {
    try {
      f(db);
    } catch (e) {
      console.error(`[demo] modul dát „${meno}" zlyhal:`, e);
    }
  }
}
