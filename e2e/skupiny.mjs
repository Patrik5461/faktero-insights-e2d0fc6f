/*
  Rozdelenie tokov do skupín, ktoré bežia súbežne. Skupina s prehliadačom má
  vlastný Chromium (najviac tri naraz — server má málo pamäte); skupina len
  z tokov `bezPrehliadaca` beží navyše, bez prehliadača. Vnútri skupiny idú
  toky za sebou.

  Čo sa nesmie biť (preto skupiny):
  - firma Test: 19 a 21 dočasne menia jej účtovný program a nastavenia exportu,
    05/19/21 exportujú a odovzdávajú, 04 kontroluje odovzdanie do Pohody,
    28 a 42 uvoľňujú všetky rezervované čísla faktúr, 50 skúša uvoľnenie čísla
    → všetko v skupine „test“. Toky v iných skupinách vo firme Test len zakladajú
    vlastné doklady (vlastné čísla) alebo čítajú;
  - firma test2: 13 odovzdá všetky bločky mesiaca, 81 porovnáva výkazy DPH pred
    zápisom a po ňom, 60 a 77 importujú z Pohody, 22 a 25 filtrujú prijaté podľa
    značky behu (spoločnej pre všetky toky behu) → „test2-cz“ (aj s QA Českou:
    44 porovnáva výkazy, 61 importuje späť do tej istej firmy);
  - 01 (odznak Nespracované) a 02 (dlaždice Prehľadu) počítajú celú firmu Test —
    porovnanie opakujú, kým sa súbežná zmena neustáli;
  - nastavenia QA účtu (user_metadata: dizajn, strana náhľadu, vzhľad
    nespracovaných): každý tok ich vidí len pre seba (spusti.mjs podvrhne
    /auth/v1/user, tok ich mení cez t.nastavUcet / nastavUcetToku). Skutočný účet
    menia len toky v SKUTOCNY_UCET — tie overujú, že sa voľba uloží, a sú spolu
    v jednej skupine za sebou;
  - vozidlá a Kniha jázd (29, 41, 45, 48, 52 — rovnaké DEMO vozidlo GPS) za sebou.

  NAKONIEC beží až po skončení všetkých skupín, sám: 12 API (zapisuje do test2
  aj QA Českej — rozbilo by porovnanie výkazov), 35 skener (bločky do všetkých
  troch firiem) a 79 výkon stránok (meria časy — súbežná záťaž by ich skreslila).

  Nový tok, ktorý tu nie je, pôjde bezpečne do NAKONIEC (beh to v logu napíše) —
  pridaj ho do skupiny podľa firmy, do ktorej zapisuje. Skupiny sú vyvážené na
  podobný čas (časy tokov sú v suhrn.json každého behu).
*/
export const SKUPINY = [
  {
    meno: "test",
    toky: [
      "prihlasenie",
      "prehlad",
      "faktura",
      "prijata",
      "pohoda",
      "blocek",
      "banka",
      "prikaz",
      "vykazy",
      "doklady",
      "sklad-zakazka",
      "zauctovanie-kv",
      "odovzdanie-exportu",
      "odovzdanie-uctovania",
      "faktura-eu",
      "apka-faktura",
      "apka-offline",
      "apka-sken",
      "chyby-vypadky",
      "okraje-vstupy",
      "okraje-subeh",
      "apka-offline-sync",
      "zamok-blocky-cisla",
      "presun-blocku-raz",
      "kompaktny-prechod",
      "banka-tb-suhlas",
    ],
  },
  {
    meno: "test2-cz",
    toky: [
      "blocky-pohoda",
      "vyuctovanie-pokladna",
      "prikaz-vynechane",
      "banka-cela",
      "zoznamy-excel-zip",
      "prijate-zalohy",
      "brany-maily",
      "brany-pravidla",
      "brany-vypis",
      "webhooky-opakovanie",
      "prilohy-odkaz",
      "pohoda-spatny-chod",
      "pohoda-storno-25a",
      "pohoda-pokladna-prijem",
      "dobropis-dph",
      "vstupy-xss",
      "cz-fakturacia",
      "cz-vykazy",
      "cz-vykazy-jazyk",
      "pohoda-cz-spatny-chod",
      "mobil-zoznamy",
      "banka-tb-notifikacie",
    ],
  },
  {
    meno: "ucet",
    toky: [
      "nahlad-strana",
      "nahlad-strana-nastavenia",
      "detail-vystavenej",
      "detail-zalohovej",
      "kompaktny-vystavena",
      "kompaktny-zalohova",
      "mobil-ai-hlavicka",
      "mobil-nespracovany",
      "apka-panel",
      "apka-jazdy",
      "gps-dozor",
      "gps-tachometer",
      "karty-up",
      "transeu-pripojenie",
      "integracie-vstupy",
      "de-firma",
      "a11y",
      "jazyk-mobil",
      "podpora-web",
      "ucty",
      "systemove-chyby",
      "web-vykon",
      "csp-hlavicky",
      "admin-dvojfaktor",
      "stare-vydanie-chyby",
      "zmiznuta-firma",
      "audit-verejne-endpointy",
    ],
  },
  {
    // Bez prehliadača a bez zápisu do dokladov firiem (len REST a fetch).
    // 38 brany-pravidla je tiež bez prehliadača, ale zakladá prijaté faktúry
    // v test2 so značkou behu — 22 a 25 by ich videli vo filtri, preto je v „test2-cz“.
    meno: "rest",
    toky: ["bezpecnost", "ai-podpora", "transeu-navrat", "audit-anon-pristup"],
  },
];

/** Po skupinách, sériovo a bez súbežných tokov. */
export const NAKONIEC = ["api", "apka-skener", "vykon-stranok"];

/**
  Toky, ktoré menia SKUTOČNÉ nastavenia QA účtu (overujú, že sa voľba uloží
  do účtu a vydrží obnovenie) — tie podvrh nedostanú. Musia byť v jednej skupine.
*/
export const SKUTOCNY_UCET = [
  "nahlad-strana",
  "nahlad-strana-nastavenia",
  "detail-vystavenej",
  "detail-zalohovej",
];

/**
  Toky, ktorým sa nastavenia účtu nepodvrhujú: zachytávanie požiadaviek
  (context.route) vypne v Chromiu service worker a appka bez signálu sa potom
  po obnovení nenačíta (biela stránka). Appka (/app) dizajn ani stranu náhľadu
  nepoužíva.
*/
export const BEZ_PODVRHU = ["apka-offline", "apka-offline-sync", "apka-jazdy"];

/** Kľúče user_metadata, ktoré toky prepínajú (podvrhujú sa pôvodné hodnoty). */
export const KLUCE_NASTAVENI_UCTU = ["dizajn", "strana_nahladu", "vzhlad_nespracovanych"];
