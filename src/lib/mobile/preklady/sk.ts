/**
 * Slovenské znenie — **zdroj pravdy**.
 *
 * Kľúč je cesta k miestu, kde text stojí (`tab.faktury`), nie samotná veta.
 * Vetou ako kľúčom sa preklady rozsypú pri prvej oprave preklepu v origináli.
 *
 * Ostatné jazyky sú `Partial<typeof sk>` — čo v nich chýba, spadne na
 * slovenčinu. Chýbajúci preklad tak vyzerá ako chýbajúci preklad, nie ako
 * pokazená appka.
 */
export const sk = {
  /* spodná lišta */
  "tab.skener": "Skener",
  "tab.faktury": "Faktúry",
  "tab.vytvorit": "Vytvoriť",
  "tab.banka": "Banka",
  "tab.jazda": "Kniha jázd",
  "tab.navigacia": "Hlavná navigácia",

  /* bočný panel */
  "panel.nastavenia": "Nastavenia",
  "panel.firma": "Firma",
  "panel.zmenitFirmu": "Zmeniť firmu",
  "panel.bezFirmy": "Bez firmy",
  "panel.prehladAgend": "Prehľad agend",
  "panel.vystaveneFaktury": "Vystavené faktúry",
  "panel.cenovePonuky": "Cenové ponuky",
  "panel.prijateDoklady": "Prijaté doklady",
  "panel.pomoc": "Pomoc",
  "panel.nastavenieAplikacie": "Nastavenie aplikácie",
  "panel.navody": "Návody k Fakteru",
  "panel.otvoriVPrehliadaci": "Otvorí sa v prehliadači",
  "panel.blocky": "Bločky a pokladňa",
  "panel.nahlasitChybu": "Nahlásiť chybu alebo návrh",
  "panel.otvoritNaWebe": "Otvoriť Faktero na webe",
  "panel.pravne": "Právne dokumenty",
  "panel.odhlasit": "Odhlásiť sa",
  "panel.zavriet": "Zavrieť",
  "panel.jazyk": "Jazyk",

  /* domovská obrazovka */
  "domov.novaFaktura": "Nová faktúra",
  "domov.novaFakturaPopis": "Odberateľ, položky, splatnosť — a rovno odoslať",
  "domov.vystaveneFaktury": "Vystavené faktúry",
  "domov.vystaveneFakturyPopis": "Kto ešte nezaplatil, PDF a odoslanie",
  "domov.blocek": "Bloček s QR kódom",
  "domov.blocekPopis": "Načíta sa z Finančnej správy aj s položkami",
  "domov.fakturaPdf": "Faktúra v PDF",
  "domov.fakturaPdfPopis": "Vyberte súbor z telefónu alebo z cloudu",
  "domov.viacstranovy": "Viacstranový doklad",
  "domov.viacstranovyPopis": "Strana po strane, uloží sa ako jedno PDF",
  "domov.prijateDoklady": "Prijaté doklady",
  "domov.prijateDokladyPopis": "Bločky a faktúry, ktoré ste už naskenovali",
  "domov.pohybyNaUcte": "Pohyby na účte",
  "domov.pohybyNaUctePopis": "Či prišli peniaze — zostatok a posledné platby",
  "domov.novaJazda": "Nová jazda",
  "domov.novaJazdaPopis": "Kilometre odmeria telefón, stačí štart a stop",

  /* kniha jázd — história */
  "jazdy.historia": "História jázd",
  "jazdy.charakter": "Charakter jazdy",
  "jazdy.sluzobna": "Služobná",
  "jazdy.sukromna": "Súkromná",
  "jazdy.oznacenaSukromna": "Označená ako súkromná.",
  "jazdy.oznacenaSluzobna": "Označená ako služobná.",
  "jazdy.jazda": "Jazda",
  "jazdy.spolu": "Spolu",
  "jazdy.starsie": "Staršie jazdy",
  "jazdy.ziadne": "Zatiaľ žiadne jazdy",

  /* cenové ponuky */
  "ponuky.nazov": "Cenové ponuky",
  "ponuky.nova": "Nová ponuka",
  "ponuky.novaDlha": "Nová cenová ponuka",
  "ponuky.ziadne": "Zatiaľ žiadna cenová ponuka",
  "ponuky.ziadnePopis":
    "Ponuku spravíte rovnako ako faktúru — a keď ju zákazník prijme, jedným ťuknutím z nej faktúra vznikne.",
  "ponuky.vytvorit": "Vytvoriť ponuku",
  "ponuky.pdf": "PDF",
  "ponuky.zdielat": "Zdieľať",
  "ponuky.odoslat": "Odoslať",
  "ponuky.naFakturu": "Na faktúru",
  "ponuky.platiDo": "platí do",
  "ponuky.stav.vyfakturovana": "Vyfakturovaná",
  "ponuky.stav.zamietnuta": "Zamietnutá",
  "ponuky.stav.prijata": "Prijatá",
  "ponuky.stav.poPlatnosti": "Po platnosti",
  "ponuky.stav.odoslana": "Odoslaná",
  "ponuky.stav.navrh": "Návrh",
  "ponuky.odberatel": "Odberateľ",
  "ponuky.polozky": "Položky",
  "ponuky.pridajPolozku": "Pridať položku",
  "ponuky.vystavena": "Vystavená",
  "ponuky.poznamka": "Poznámka",
  "ponuky.zaklad": "Základ",
  "ponuky.dph": "DPH",
  "ponuky.hladatOdberatela": "Hľadať odberateľa…",
  "ponuky.novyOdberatel": "Nový odberateľ",
  "ponuky.nikNenajdeny": "Nikto sa nenašiel.",
  "ponuky.zmenit": "zmeniť",

  /* spoločné */
  "spolocne.spat": "Späť",
  "spolocne.ulozit": "Uložiť",
  "spolocne.zrusit": "Zrušiť",
  "spolocne.nacitavam": "Načítavam…",
  "spolocne.km": "km",
} as const;

export type Kluc = keyof typeof sk;
