// Detail bankovního pohybu, „vyřízeno bez dokladu“, transakční daň a pravidla pro banku.
export default {
  "Pohyb sa nepodarilo načítať.": "Pohyb se nepodařilo načíst.",
  "Pohyb je označený ako transakčná daň.": "Pohyb je označen jako transakční daň.",
  "Pohyb je označený ako spárovaný bez dokladu.": "Pohyb je označen jako spárovaný bez dokladu.",
  "Označenie zrušené, pohyb je znovu medzi nespárovanými.":
    "Označení zrušeno, pohyb je znovu mezi nespárovanými.",
  "Zrušiť párovanie pohybu s dokladom {cislo}?": "Zrušit spárování pohybu s dokladem {cislo}?",
  "Odpárovať od pohybu všetky doklady ({n})?": "Odpárovat od pohybu všechny doklady ({n})?",
  Odpárovať: "Odpárovat",
  "Nepodarilo sa odpárovať: {doklady}": "Nepodařilo se odpárovat: {doklady}",
  "Detail pohybu": "Detail pohybu",
  "IBAN protistrany": "IBAN protistrany",
  "Typ platby": "Typ platby",
  "Spárovaný pohyb": "Spárovaný pohyb",
  "Nespárovaný pohyb": "Nespárovaný pohyb",
  "Spolu {spolu} z {z}": "Celkem {spolu} z {z}",
  "Odpárovať všetky doklady": "Odpárovat všechny doklady",
  "Označené pravidlom „{nazov}“.": "Označeno pravidlem „{nazov}“.",
  "Označené ručne.": "Označeno ručně.",
  "Označené automaticky podľa popisu banky.": "Označeno automaticky podle popisu banky.",
  "Vo výpise do Pohody dostane predkontáciu pre transakčnú daň.":
    "Ve výpisu do Pohody dostane předkontaci pro transakční daň.",
  "Zrušiť označenie": "Zrušit označení",
  "napr. mzda 10/2026": "např. mzda 10/2026",
  "Pohyb nemá doklad": "Pohyb nemá doklad",
  "Označiť ako transakčná daň": "Označit jako transakční daň",
  "Vytvoriť pravidlo z tohto pohybu": "Vytvořit pravidlo z tohoto pohybu",
  "Bez dokladu": "Bez dokladu",
  "Spárované bez dokladu": "Spárováno bez dokladu",
  "Transakčná daň": "Transakční daň",
  Párovanie: "Párování",
  spárované: "spárováno",
  detail: "detail",
  "Za vybavené bez dokladu sa označilo {n} starších pohybov.":
    "Jako vyřízené bez dokladu se označilo {n} starších pohybů.",
  Ktorýkoľvek: "Jakýkoli",
  Nedefinované: "Nedefinováno",
  "Pohyb sa pri príchode z banky označí za vybavený a nebude čakať na doklad — poplatky banky, mzdy, odvody poisťovniam. Predkontácia je potom nepovinná a použije sa vo výpise do Pohody.":
    "Pohyb se při příchodu z banky označí jako vyřízený a nebude čekat na doklad — poplatky bance, mzdy, odvody pojišťovnám. Předkontace je pak nepovinná a použije se ve výpisu do Pohody.",
  "Poznámka k pohybu": "Poznámka k pohybu",
  "napr. Odvody #MM-1/YYYY#": "např. Odvody #MM-1/YYYY#",
  "Transakčná daň (zákon 235/2024 Z. z.) nemá doklad. Založte si v Pohode predkontáciu s účtami podľa vašej osnovy (nákladový účet dane a bankový účet) a napíšte sem jej skratku.":
    "Transakční daň (slovenský zákon 235/2024 Z. z.) nemá doklad. Založte si v Pohodě předkontaci s účty podle vaší osnovy (nákladový účet daně a bankovní účet) a napište sem její zkratku.",
  "Vyplňte aspoň jednu podmienku — účet, smer, typ pohybu, IBAN protistrany, VS alebo protistranu.":
    "Vyplňte alespoň jednu podmínku — účet, směr, typ pohybu, IBAN protistrany, VS nebo protistranu.",
  "Pravidlo „Spárované bez dokladu“ nemôže mať podmienku na typ pohybu — nechajte ho „Akýkoľvek“.":
    "Pravidlo „Spárováno bez dokladu“ nemůže mít podmínku na typ pohybu — nechte ho „Jakýkoli“.",
  "Pravidlo „Spárované bez dokladu“ potrebuje IBAN protistrany, VS alebo protistranu.":
    "Pravidlo „Spárováno bez dokladu“ potřebuje IBAN protistrany, VS nebo protistranu.",
  // Manuál /pomoc/banka — sekcia „transakcie“
  "<0>Pohyb bez dokladu.</0> Kliknutím na stav v stĺpci Párovanie sa otvorí detail pohybu. Poplatok banky, mzdu či odvod poisťovni označíte tlačidlom <1>Pohyb nemá doklad</1> (aj s poznámkou) — medzi nespárovanými sa potom neukazuje. Pri spárovanom pohybe detail ukáže všetky doklady so súčtom „Spolu X z Y“ a dajú sa odpárovať aj naraz.":
    "<0>Pohyb bez dokladu.</0> Kliknutím na stav ve sloupci Párování se otevře detail pohybu. Poplatek bance, mzdu či odvod pojišťovně označíte tlačítkem <1>Pohyb nemá doklad</1> (i s poznámkou) — mezi nespárovanými se pak nezobrazuje. U spárovaného pohybu detail ukáže všechny doklady se součtem „Celkem X z Y“ a dají se odpárovat i najednou.",
  "<0>Transakčná daň.</0> Pohyby, ktoré banka sama nazve transakčnou daňou (zákon 235/2024 Z. z.), Faktero označí samo, ostatné tlačidlom <1>Označiť ako transakčná daň</1>. Vo výpise do Pohody dostanú predkontáciu, ktorú nastavíte v <2>predkontáciách</2> pri označení „Transakčná daň“.":
    "<0>Transakční daň.</0> Pohyby, které banka sama nazve transakční daní (slovenský zákon 235/2024 Z. z.), Faktero označí samo, ostatní tlačítkem <1>Označit jako transakční daň</1>. Ve výpisu do Pohody dostanou předkontaci, kterou nastavíte v <2>předkontacích</2> u označení „Transakční daň“.",
  "<0>Pravidlá pre opakované pohyby.</0> V detaile pohybu kliknite na <1>Vytvoriť pravidlo z tohto pohybu</1> — predvyplní IBAN protistrany, smer a variabilný symbol s výsledkom „Spárované bez dokladu“. Pravidlo zaberie pri každom novom pohybe z banky aj z nahratého výpisu a po uložení vybaví aj staršie nespárované pohyby.":
    "<0>Pravidla pro opakované pohyby.</0> V detailu pohybu klikněte na <1>Vytvořit pravidlo z tohoto pohybu</1> — předvyplní IBAN protistrany, směr a variabilní symbol s výsledkem „Spárováno bez dokladu“. Pravidlo zabere u každého nového pohybu z banky i z nahraného výpisu a po uložení vyřídí i starší nespárované pohyby.",
};
