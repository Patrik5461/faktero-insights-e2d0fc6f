// Dorobky po teste 30. 10.: odovzdanie pri exporte, hláška zámku podľa programu, kontrola Pohody, platiteľ DPH, členenie pri hromadnom zaúčtovaní a drobnosti.
export default {
  "Exportovaných faktúr: {n} (neoznačené ako odovzdané)":
    "Exportovaných faktur: {n} (neoznačené jako předané)",
  "Tento formát nie je účtovný program — predvolene sa faktúry neoznačia ani nezamknú.":
    "Tento formát není účetní program — ve výchozím stavu se faktury neoznačí ani nezamknou.",
  "Odíde, ale skontrolujte v Pohode: {n}": "Odejde, ale zkontrolujte v Pohodě: {n}",
  "Faktúra už bola odovzdaná do účtovníctva (KROS Omega) — najprv ju vráťte (Exporty → Vrátiť), potom ju upravte.":
    "Faktura už byla předána do účetnictví (KROS Omega) — nejprve ji vraťte (Exporty → Vrátit), potom ji upravte.",
  "Faktúra už bola odovzdaná do účtovníctva (Money S3) — najprv ju vráťte (Exporty → Vrátiť), potom ju upravte.":
    "Faktura už byla předána do účetnictví (Money S3) — nejprve ji vraťte (Exporty → Vrátit), potom ji upravte.",
  "Faktúra už bola odovzdaná do účtovníctva (ABRA Flexi) — najprv ju vráťte (Exporty → Vrátiť), potom ju upravte.":
    "Faktura už byla předána do účetnictví (ABRA Flexi) — nejprve ji vraťte (Exporty → Vrátit), potom ji upravte.",
  "Faktúra už bola odovzdaná do účtovníctva (MRP-K/S) — najprv ju vráťte (Exporty → Vrátiť), potom ju upravte.":
    "Faktura už byla předána do účetnictví (MRP-K/S) — nejprve ji vraťte (Exporty → Vrátit), potom ji upravte.",
  "Faktúra už bola odovzdaná do účtovníctva (DATEV) — najprv ju vráťte (Exporty → Vrátiť), potom ju upravte.":
    "Faktura už byla předána do účetnictví (DATEV) — nejprve ji vraťte (Exporty → Vrátit), potom ji upravte.",
  "Faktúra už bola odovzdaná do účtovníctva (ISDOC) — najprv ju vráťte (Exporty → Vrátiť), potom ju upravte.":
    "Faktura už byla předána do účetnictví (ISDOC) — nejprve ji vraťte (Exporty → Vrátit), potom ji upravte.",
  "Faktúra už bola odovzdaná do účtovníctva (Peppol BIS) — najprv ju vráťte (Exporty → Vrátiť), potom ju upravte.":
    "Faktura už byla předána do účetnictví (Peppol BIS) — nejprve ji vraťte (Exporty → Vrátit), potom ji upravte.",
  "Faktúra už bola odovzdaná do účtovníctva (súpiska CSV) — najprv ju vráťte (Exporty → Vrátiť), potom ju upravte.":
    "Faktura už byla předána do účetnictví (soupiska CSV) — nejprve ji vraťte (Exporty → Vrátit), potom ji upravte.",
  "je len koncept — najprv ju dokončite": "je jen koncept — nejprve ji dokončete",
  "Automaticky spárovaných: {n}.": "Automaticky spárováno: {n}.",
  "IČ DPH {ic} sa z firmy vymaže, lebo ho register nevedie. Predošlá hodnota ostane v histórii registrácie DPH.":
    "DIČ {ic} se z firmy vymaže, protože ho registr nevede. Předchozí hodnota zůstane v historii registrace k DPH.",
  "vymazané IČ DPH {ic}": "vymazané DIČ {ic}",
  "Chýba členenie DPH. Platiteľ DPH faktúru bez neho nezaúčtuje — vyberte ho, alebo ho nastavte v predvolených predkontáciách.":
    "Chybí členění DPH. Plátce DPH fakturu bez něj nezaúčtuje — vyberte ho, nebo ho nastavte ve výchozích předkontacích.",
  "Členenie DPH sa doplní z pravidla alebo zo zvyku dodávateľa: {n}":
    "Členění DPH se doplní z pravidla nebo ze zvyku dodavatele: {n}",
  "Bez členenia DPH: {zoznam}. Platiteľ DPH ich nezaúčtuje — vyberte členenie DPH, alebo ich nastavte v pravidle či v predvolených predkontáciách.":
    "Bez členění DPH: {zoznam}. Plátce DPH je nezaúčtuje — vyberte členění DPH, nebo je nastavte v pravidle či ve výchozích předkontacích.",
  "{n} bločky čakajú na kontrolu v Nespracovaných dokladoch — sem sa presunú, keď ich spracujete.":
    "{n} účtenky čekají na kontrolu v Nezpracovaných dokladech — sem se přesunou, až je zpracujete.",
  "ručne zapísaný": "zapsaný ručně",
  "{nazov} — hľadať kód, názov alebo účet": "{nazov} — hledat kód, název nebo účet",
  "{nazov} — voľby": "{nazov} — volby",
  "Pod tlačidlom Exportovať je pole <0>Označiť ako odovzdané</0>. Zaškrtnuté faktúry zamkne, aby sa po odovzdaní nemenili ani neodišli druhýkrát. Predvolene je zapnuté len pri formáte programu, v ktorom účtujete. Pri ISDOC-u, súpiske CSV a Peppol BIS je vypnuté, lebo tie sa často sťahujú len na pozretie. Hláška pri zamknutej faktúre povie, do ktorého programu odišla; upraviť ju môžete po vrátení (Exporty → Vrátiť).":
    "Pod tlačítkem Exportovat je pole <0>Označit jako předané</0>. Zaškrtnuté faktury zamkne, aby se po předání neměnily ani neodešly podruhé. Ve výchozím stavu je zapnuté jen u formátu programu, ve kterém účtujete. U ISDOC, soupisky CSV a Peppol BIS je vypnuté, protože ty se často stahují jen pro náhled. Hláška u zamčené faktury řekne, do kterého programu odešla; upravit ji můžete po vrácení (Exporty → Vrátit).",
  "Pod výberom je <0>Overenie v registri DPH</0>: kedy a čo register naposledy povedal a história registrácie. Zapnuté <1>Automaticky overovať platiteľstvo DPH</1> overuje firmu raz denne a po zmene IČO alebo IČ DPH. Prázdny režim DPH sa doplní sám, vyplnený sa nikdy neprepíše — keď s registrom nesedí, ukáže sa upozornenie s tlačidlom <2>Prevziať z registra</2> a ozve sa zvonček. Zvonček hlási aj novú registráciu, jej zrušenie a dôvody na zrušenie, ktoré zverejnila Finančná správa. Keď register firmu nevedie, prevzatie IČ DPH z firmy vymaže — okno to povie vopred a predošlé číslo ostane v histórii registrácie.":
    "Pod výběrem je <0>Ověření v registru DPH</0>: kdy a co registr naposledy uvedl a historie registrace. Zapnuté <1>Automaticky ověřovat plátcovství DPH</1> ověřuje firmu jednou denně a po změně IČO nebo DIČ. Prázdný režim DPH se doplní sám, vyplněný se nikdy nepřepíše — když s registrem nesouhlasí, zobrazí se upozornění s tlačítkem <2>Převzít z registru</2> a ozve se zvoneček. Zvoneček hlásí i novou registraci, její zrušení a důvody pro zrušení, které zveřejnila Finanční správa SR. Když registr firmu nevede, převzetí DIČ z firmy vymaže — okno to řekne předem a předchozí číslo zůstane v historii registrace.",
  "Predkontácia môže mať <0>účtovanie pomerom</0> — napríklad 80/20 alebo auto s odpočtom DPH 50 % od roku 2026. Doklad s takou predkontáciou sa do Pohody rozúčtuje sám a výkazy k DPH odpočítajú len príslušnú časť dane. Pomer ide na <1>celý doklad</1> (predkontácia v hlavičke) aj na <2>položku</2>: pri bločku z čerpačky dáte predkontáciu s pomerom len k nafte a bageta ostane s predkontáciou dokladu — v tabuľke položiek je pri každej sadzba DPH a výber predkontácie. Predkontácia s agendou <3>Ostatné záväzky</3> pošle faktúru do tejto agendy. O agende rozhoduje predkontácia hlavičky. Keď je takýto kód len v riadku rozúčtovania, faktúra ide ako prijatá faktúra a Pohoda kód v nej nenájde. Kontrola pred odovzdaním v Exportoch na to upozorní.":
    "Předkontace může mít <0>účtování poměrem</0> — například 80/20 nebo auto s odpočtem DPH 50 % od roku 2026. Doklad s takovou předkontací se do Pohody rozúčtuje sám a výkazy k DPH odečtou jen příslušnou část daně. Poměr jde na <1>celý doklad</1> (předkontace v hlavičce) i na <2>položku</2>: u účtenky z čerpací stanice dáte předkontaci s poměrem jen k naftě a bageta zůstane s předkontací dokladu — v tabulce položek je u každé sazba DPH a výběr předkontace. Předkontace s agendou <3>Ostatní závazky</3> pošle fakturu do této agendy. O agendě rozhoduje předkontace hlavičky. Když je takový kód jen v řádku rozúčtování, faktura jde jako přijatá faktura a Pohoda kód v ní nenajde. Kontrola před předáním v Exportech na to upozorní.",
  "Viac faktúr naraz zaúčtujete v zozname: označte ich a kliknite na <0>Zaúčtovať</0>. Vyplnené pole sa nastaví všetkým, prázdne nechá, čo na faktúre je. Opakujúcich sa dodávateľov zaúčtuje samo <1>pravidlo účtovania</1> (napríklad „Orange → predkontácia 5Fp, členenie PD“). Keď členenie DPH v okne nevyberiete a faktúra ho nemá, doplní sa z pravidla alebo zo zvyku dodávateľa. Faktúru, pre ktorú sa členenie nedá určiť ani z kategórie, predvolených či rozúčtovania, platiteľ DPH nezaúčtuje — okno ju vymenuje a tlačidlo Zaúčtovať ostane vypnuté.":
    "Více faktur najednou zaúčtujete v seznamu: označte je a klikněte na <0>Zaúčtovat</0>. Vyplněné pole se nastaví všem, prázdné ponechá, co na faktuře je. Opakující se dodavatele zaúčtuje samo <1>pravidlo účtování</1> (například „Orange → předkontace 5Fp, členění PD“). Když členění DPH v okně nevyberete a faktura ho nemá, doplní se z pravidla nebo ze zvyku dodavatele. Fakturu, pro kterou se členění nedá určit ani z kategorie, výchozích hodnot či rozúčtování, plátce DPH nezaúčtuje — okno ji vyjmenuje a tlačítko Zaúčtovat zůstane vypnuté.",
};
