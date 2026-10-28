// Preklad manuálu v Pomoci (src/routes/pomoc.automaticke-zauctovanie.tsx). Kľúče vyrába pomoc-preklad.test.tsx.
export default {
  "Autopilot, ktorý doklady zaúčtuje sám — a vie, kedy sa má zastaviť.":
    "Autopilot, který doklady zaúčtuje sám — a ví, kdy se má zastavit.",
  "Každý nový doklad — prijatá faktúra, bloček aj vystavená faktúra — dostane do minúty návrh zaúčtovania: <0>predkontáciu, členenie DPH, riadok kontrolného výkazu</0>, prípadne stredisko a činnosť. Nezáleží na tom, či prišiel e-mailom, zo skenera, z importu alebo ste ho napísali ručne.":
    "Každý nový doklad — přijatá faktura, účtenka i vystavená faktura — dostane do minuty návrh zaúčtování: <0>předkontaci, členění DPH, řádek kontrolního výkazu</0>, případně středisko a činnost. Nezáleží na tom, zda přišel e-mailem, ze skeneru, z importu, nebo jste ho napsali ručně.",
  "Predkontácia sa hľadá v tomto poradí — prvý zdroj, ktorý zaberie, vyhráva:":
    "Předkontace se hledá v tomto pořadí — první zdroj, který zabere, vyhrává:",
  "<0>Zvyk partnera</0> — keď ste aspoň tri z posledných desiatich dokladov od toho istého partnera zaúčtovali väčšinou rovnako. Istota je podiel zhody (najviac 98 %).":
    "<0>Zvyk partnera</0> — když jste alespoň tři z posledních deseti dokladů od stejného partnera zaúčtovali většinou stejně. Jistota je podíl shody (nejvýše 98 %).",
  "<0>AI</0> (prijaté faktúry a bločky) — vyberá výhradne z vašich predkontácií a povie, prečo. Kód, ktorý vo vašom číselníku nie je, sa zahodí.":
    "<0>AI</0> (přijaté faktury a účtenky) — vybírá výhradně z vašich předkontací a řekne proč. Kód, který ve vašem číselníku není, se zahodí.",
  "<0>Členenie DPH a kontrolný výkaz sa AI nepýta nikdy.</0> Odvodia sa z režimu dane na doklade: tuzemsko s odpočtom (PD, B.2), bloček (B.3), bez nároku na odpočet (PN), prenesenie daňovej povinnosti, nadobudnutie tovaru a služby z EÚ (B.1), opravný doklad (C.2), osobitná úprava či firma, ktorá nie je platiteľ DPH.":
    "<0>Členění DPH a kontrolní výkaz se AI neptá nikdy.</0> Odvodí se z režimu daně na dokladu: tuzemsko s odpočtem (PD, B.2), účtenka (B.3), bez nároku na odpočet (PN), přenesení daňové povinnosti, pořízení zboží a služby z EU (B.1), opravný doklad (C.2), zvláštní režim či firma, která není plátce DPH.",
  "Režimy autopilota": "Režimy autopilota",
  "<0>Vypnutý</0> — Faktero samo nič nenavrhuje; návrh si vyžiadate na doklade.":
    "<0>Vypnutý</0> — Faktero samo nic nenavrhuje; návrh si vyžádáte na dokladu.",
  "<0>Bezpečný</0> (predvolený) — samo zaúčtuje doklady, ktoré sedia na pravidlo alebo na ustálený zvyk s istotou aspoň 95 %. Návrhy od AI čakajú na vás.":
    "<0>Bezpečný</0> (výchozí) — samo zaúčtuje doklady, které sedí na pravidlo nebo na ustálený zvyk s jistotou alespoň 95 %. Návrhy od AI čekají na vás.",
  "<0>Plný</0> — navyše zaúčtuje aj návrhy od AI s istotou aspoň 90 %.":
    "<0>Plný</0> — navíc zaúčtuje i návrhy od AI s jistotou alespoň 90 %.",
  "Režim a limit sumy nastaví majiteľ alebo admin firmy na stránke <0>Zaúčtovanie na kontrolu</0> alebo pri pravidlách účtovania. Po zapnutí sa týka len nových dokladov — staré sa samé nezaúčtujú.":
    "Režim a limit částky nastaví vlastník nebo admin firmy na stránce <0>Zaúčtování ke kontrole</0> nebo u pravidel účtování. Po zapnutí se týká jen nových dokladů — staré se samy nezaúčtují.",
  "Kedy doklad čaká na vás": "Kdy doklad čeká na vás",
  "Doklad sa nezaúčtuje sám nikdy, keď:": "Doklad se nikdy nezaúčtuje sám, když:",
  "súčet položiek alebo základ s DPH nesedí so sumou dokladu,":
    "součet položek nebo základ s DPH nesedí s částkou dokladu,",
  "ide o prenesenie či plnenie z EÚ a IČ DPH partnera nemá platné overenie vo VIES,":
    "jde o přenesení či plnění z EU a DIČ partnera nemá platné ověření ve VIES,",
  "suma je nad limitom firmy (predvolene 5 000 €),":
    "částka je nad limitem firmy (výchozí 5 000 €),",
  "je to prvý doklad od tohto partnera,": "je to první doklad od tohoto partnera,",
  "chýba predkontácia alebo sa nedá určiť členenie DPH,":
    "chybí předkontace nebo nelze určit členění DPH,",
  "je odovzdaný do účtovníctva alebo zamknutý — taký sa vôbec nemení.":
    "je předaný do účetnictví nebo zamčený — takový se vůbec nemění.",
  "Ručne zaúčtovaný doklad automat nikdy neprepíše. Hodnoty, ktoré na doklade už sú, majú vždy prednosť pred návrhom.":
    "Ručně zaúčtovaný doklad automat nikdy nepřepíše. Hodnoty, které na dokladu už jsou, mají vždy přednost před návrhem.",
  "Stránka Na kontrolu": "Stránka Ke kontrole",
  "V <0>Účtovníctvo → Zaúčtovanie na kontrolu</0> sú všetky nezaúčtované doklady s návrhom, zdrojom a dôvodom, prečo čakajú. Filtrujete podľa druhu, blokátora a zdroja, vyberiete a potvrdíte návrhy naraz.":
    "V <0>Účetnictví → Zaúčtování ke kontrole</0> jsou všechny nezaúčtované doklady s návrhem, zdrojem a důvodem, proč čekají. Filtrujete podle druhu, blokace a zdroje, vyberete a potvrdíte návrhy najednou.",
  "Tlačidlo <0>Navrhnúť zaúčtovanie pre nezaúčtované</0> pripraví návrhy aj pre doklady spred zapnutia — nič pritom nezaúčtuje.":
    "Tlačítko <0>Navrhnout zaúčtování pro nezaúčtované</0> připraví návrhy i pro doklady z doby před zapnutím — nic přitom nezaúčtuje.",
  "Na detaile dokladu": "Na detailu dokladu",
  "Automaticky zaúčtovaný doklad má štítok <0>Zaúčtované automaticky · pravidlo X / zvyk 98 % / AI 91 %</0> so zdôvodnením. Tlačidlom <1>Zmeniť</1> zaúčtovanie zrušíte, kódy upravíte a zaúčtujete znova. Nezaúčtovaný doklad ukáže návrh s blokátormi a tlačidlo Potvrdiť návrh.":
    "Automaticky zaúčtovaný doklad má štítek <0>Zaúčtováno automaticky · pravidlo X / zvyk 98 % / AI 91 %</0> se zdůvodněním. Tlačítkem <1>Změnit</1> zaúčtování zrušíte, kódy upravíte a zaúčtujete znovu. Nezaúčtovaný doklad ukáže návrh s blokacemi a tlačítko Potvrdit návrh.",
  "Keď rovnakú opravu u toho istého partnera urobíte druhýkrát, Faktero ponúkne <0>vytvoriť pravidlo</0> s predvyplnenými podmienkami. Každá oprava sa zapíše do histórie dokladu.":
    "Když stejnou opravu u stejného partnera uděláte podruhé, Faktero nabídne <0>vytvořit pravidlo</0> s předvyplněnými podmínkami. Každá oprava se zapíše do historie dokladu.",
  "Bankové pohyby": "Bankovní pohyby",
  "<0>Pravidlo účtovania</0> (istota 100 %) — podľa partnera, textu, spôsobu úhrady, predmetu či odosielateľa e-mailu, krajiny, variabilného symbolu alebo typu dokladu. Pravidlá spravujete v <1>Účtovníctvo → Pravidlá účtovania</1>.":
    "<0>Pravidlo účtování</0> (jistota 100 %) — podle partnera, textu, způsobu úhrady, předmětu či odesílatele e-mailu, země, variabilního symbolu nebo typu dokladu. Pravidla spravujete v <1>Účetnictví → Pravidla účtování</1>.",
  "Pohyby sa zaúčtujú pri vývoze výpisu do Pohody: pravidlo pre banku (účet, smer, protistrana) má prednosť, spárovaný pohyb dostane predvolenú predkontáciu pre banku. Pri nespárovaných pohyboch sa AI nepýta. Pravidlo pre banku s výsledkom <0>Spárované bez dokladu</0> (poplatky, mzdy, odvody) vybaví pohyb hneď, ako príde z banky alebo z nahratého výpisu — pozri <1>Banka</1>.":
    "Pohyby se zaúčtují při exportu výpisu do Pohody: pravidlo pro banku (účet, směr, protistrana) má přednost, spárovaný pohyb dostane výchozí předkontaci pro banku. U nespárovaných pohybů se AI neptá. Pravidlo pro banku s výsledkem <0>Spárováno bez dokladu</0> (poplatky, mzdy, odvody) vyřídí pohyb hned, jak přijde z banky nebo z nahraného výpisu — viz <1>Banka</1>.",
};
