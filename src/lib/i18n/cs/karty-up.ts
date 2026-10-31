// Nahrání výpisu palivové karty Up Déjeuner (NahratieVypisuKarty, palivové karty, manuál vozového parku).
export default {
  "Súbor sa nepodarilo prečítať": "Soubor se nepodařilo přečíst",
  "Súbor je väčší ako 10 MB.": "Soubor je větší než 10 MB.",
  "Nahrať výpis karty": "Nahrát výpis karty",
  "Nahrať výpis alebo faktúru — {nazov}": "Nahrát výpis nebo fakturu — {nazov}",
  "CSV alebo XLSX s nákupmi, prípadne faktúru v PDF (prečíta ju AI). Pred uložením uvidíte náhľad. Opakované nahratie toho istého výpisu nič nezdvojí.":
    "CSV nebo XLSX s nákupy, případně fakturu v PDF (přečte ji AI). Před uložením uvidíte náhled. Opakované nahrání téhož výpisu nic nezdvojí.",
  "Priraďte stĺpce": "Přiřaďte sloupce",
  "Stĺpce sa nepodarilo s istotou rozpoznať. Vyberte aspoň dátum, sumu a produkt alebo množstvo.":
    "Sloupce se nepodařilo s jistotou rozpoznat. Vyberte alespoň datum, částku a produkt nebo množství.",
  "— nepoužiť —": "— nepoužít —",
  "Použiť priradenie": "Použít přiřazení",
  Nákupov: "Nákupů",
  "Suma faktúry s DPH": "Částka faktury s DPH",
  "Nákupy pôjdu do jednej prijatej faktúry s rozpisom. Ak už faktúra s týmto číslom od vydavateľa karty vo Fakteri je, nová sa nezaloží — nákupy sa k nej len prepoja.":
    "Nákupy půjdou do jedné přijaté faktury s rozpisem. Pokud už faktura s tímto číslem od vydavatele karty ve Fakteru je, nová se nezaloží — nákupy se k ní jen propojí.",
  "Bez čísla faktúry sa uložia len nákupy a tankovania. Prijatá faktúra vznikne, keď nahráte faktúru alebo doplníte jej číslo.":
    "Bez čísla faktury se uloží jen nákupy a tankování. Přijatá faktura vznikne, když nahrajete fakturu nebo doplníte její číslo.",
  "Súčet nákupov sa od sumy faktúry líši o {suma}. Rozdiel (poplatky, zaokrúhlenie) sa na faktúre doplní dorovnávacím riadkom — skontrolujte ho.":
    "Součet nákupů se od částky faktury liší o {suma}. Rozdíl (poplatky, zaokrouhlení) se na faktuře doplní vyrovnávacím řádkem — zkontrolujte ho.",
  "Faktúra {cislo} už vo Fakteri je ({suma}) — nová sa nezaloží.":
    "Faktura {cislo} už ve Fakteru je ({suma}) — nová se nezaloží.",
  "{n} nákupov je už nahratých z tohto súboru — nezdvoja sa.":
    "{n} nákupů už je nahráno z tohoto souboru — nezdvojí se.",
  "{n} nákupov už je nahratých z iného súboru (rovnaký deň, suma a množstvo) — preskočia sa.":
    "{n} nákupů už je nahráno z jiného souboru (stejný den, částka a množství) — přeskočí se.",
  "Pri {n} nákupoch je vo Fakteri aj bloček z pumpy — označí sa, nezaúčtujte ho.":
    "U {n} nákupů je ve Fakteru i účtenka z pumpy — označí se, nezaúčtujte ji.",
  "{n} tankovaní už je zapísaných (GPS jednotka alebo ručne) — nové sa nezaložia, len sa prepoja.":
    "{n} tankování už je zapsáno (GPS jednotka nebo ručně) — nová se nezaloží, jen se propojí.",
  "Pri {n} riadkoch výpis nemá DPH — dopočítala sa základnou sadzbou. Skontrolujte s faktúrou.":
    "U {n} řádků výpis nemá DPH — dopočítala se základní sazbou. Zkontrolujte s fakturou.",
  "Preskočené riadky bez dátumu alebo sumy: {n}": "Přeskočené řádky bez data nebo částky: {n}",
  "Vozidlá: {zoznam}": "Vozidla: {zoznam}",
  "Žiadny nákup sa nepodarilo priradiť k vozidlu.": "Žádný nákup se nepodařilo přiřadit k vozidlu.",
  "bez vozidla: {n} — kartu priraďte v časti Karty a vozidlá":
    "bez vozidla: {n} — kartu přiřaďte v části Karty a vozidla",
  "Karta / ŠPZ": "Karta / SPZ",
  "už nahraté": "už nahráno",
  "preskočí sa": "přeskočí se",
  "tankovanie už je": "tankování už je",
  "bez vozidla": "bez vozidla",
  "DPH {krajina} do nákladu": "DPH {krajina} do nákladů",
  "Zobrazených je prvých 300 riadkov z {n}.": "Zobrazeno je prvních 300 řádků z {n}.",
  "Uložiť {n} nákupov": "Uložit {n} nákupů",
  "V súbore sa nenašiel ani jeden nákup s dátumom a sumou.":
    "V souboru se nenašel ani jeden nákup s datem a částkou.",
  "Posledné nahratie": "Poslední nahrání",
  "Web vydavateľa": "Web vydavatele",
  "Číslo karty": "Číslo karty",
  "Množstvo (litre)": "Množství (litry)",
  "Základ (bez DPH)": "Základ (bez DPH)",
  "Suma s DPH": "Částka s DPH",
  "Tachometer (km)": "Tachometr (km)",
  "Číslo transakcie / dokladu": "Číslo transakce / dokladu",
  "Číslo zmluvy alebo zákazníka": "Číslo smlouvy nebo zákazníka",
  "Len na rozlíšenie, ak máte u Up viac zmlúv. Nikam sa neposiela.":
    "Jen pro rozlišení, pokud máte u Up více smluv. Nikam se neposílá.",
  "Up Déjeuner verejné API nemá. Mesačný výpis transakcií (CSV alebo XLSX) alebo faktúru v PDF si stiahnete v klientskej zóne Up alebo vám ich Up pošle e-mailom (palivo@up-dejeuner.sk) — tu ich nahráte. Opakované nahratie toho istého výpisu nič nezdvojí.":
    "Up Déjeuner veřejné API nemá. Měsíční výpis transakcí (CSV nebo XLSX) nebo fakturu v PDF si stáhnete v klientské zóně Up nebo vám je Up pošle e-mailem (palivo@up-dejeuner.sk) — zde je nahrajete. Opakované nahrání téhož výpisu nic nezdvojí.",
  "Palivová karta Up Déjeuner": "Palivová karta Up Déjeuner",
  "Shell kartu od Up Déjeuner vydáva a fakturuje Up. Up nemá verejné API, preto sa nákupy nenačítajú samé — nahráte <0>mesačný výpis transakcií</0> (CSV alebo XLSX) alebo <1>faktúru v PDF</1>. Výpis alebo faktúru nájdete v klientskej zóne Up, prípadne vám ich Up pošle e-mailom.":
    "Shell kartu od Up Déjeuner vydává a fakturuje Up. Up nemá veřejné API, proto se nákupy nenačtou samy — nahrajete <0>měsíční výpis transakcí</0> (CSV nebo XLSX) nebo <1>fakturu v PDF</1>. Výpis nebo fakturu najdete v klientské zóně Up, případně vám je Up pošle e-mailem.",
  "V <0>Palivových kartách</0> pri Up Déjeuner kliknite na <1>Pripojiť</1> — stačí názov, prípadne číslo zmluvy, žiadne heslá. Potom tlačidlom <2>Nahrať výpis</2> vyberte súbor. Stĺpce výpisu (dátum, karta, ŠPZ, pumpa, produkt, litre, suma bez DPH a s DPH, tachometer, číslo faktúry) Faktero spozná samo; keď si nie je isté, ukáže stĺpce a priradíte ich sami. PDF faktúru prečíta AI.":
    "V <0>Palivových kartách</0> u Up Déjeuner klikněte na <1>Připojit</1> — stačí název, případně číslo smlouvy, žádná hesla. Potom tlačítkem <2>Nahrát výpis</2> vyberte soubor. Sloupce výpisu (datum, karta, SPZ, pumpa, produkt, litry, částka bez DPH a s DPH, tachometr, číslo faktury) Faktero rozpozná samo; když si není jisté, ukáže sloupce a přiřadíte je sami. PDF fakturu přečte AI.",
  "Pred uložením uvidíte <0>náhľad</0>: nákupy, litre, súčty, ku ktorým vozidlám patria a čo je duplicitné. Ak sa súčet nákupov líši od sumy faktúry, rozdiel sa na faktúre doplní dorovnávacím riadkom. Po uložení vznikne jedna prijatá faktúra od Up s rozpisom nákupov, tankovania k vozidlám a bločky z pumpy sa označia rovnako ako pri karte Shell.":
    "Před uložením uvidíte <0>náhled</0>: nákupy, litry, součty, ke kterým vozidlům patří a co je duplicitní. Pokud se součet nákupů liší od částky faktury, rozdíl se na faktuře doplní vyrovnávacím řádkem. Po uložení vznikne jedna přijatá faktura od Up s rozpisem nákupů, tankování k vozidlům a účtenky z pumpy se označí stejně jako u karty Shell.",
  "Ten istý výpis môžete nahrať aj viackrát — nič sa nezdvojí. Nákup, ktorý už je nahratý z iného súboru (napríklad najprv výpis v CSV a potom faktúra v PDF), sa preskočí, a faktúra, ktorú od Up už vo Fakteri máte, sa len prepojí. Kartu bez ŠPZ priradíte k vozidlu v časti <0>Karty a vozidlá</0>.":
    "Tentýž výpis můžete nahrát i vícekrát — nic se nezdvojí. Nákup, který už je nahrán z jiného souboru (například nejprve výpis v CSV a potom faktura v PDF), se přeskočí, a faktura od Up, kterou už ve Fakteru máte, se jen propojí. Kartu bez SPZ přiřadíte k vozidlu v části <0>Karty a vozidla</0>.",
};
