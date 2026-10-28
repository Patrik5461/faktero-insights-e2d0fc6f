/**
 * Serverové operácie, ktoré potrebuje mobilná appka.
 *
 * Na webe sa volajú ako serverové funkcie. V zabalenej appke to nejde: volajú
 * sa relatívnou adresou a appka beží na vlastnom pôvode (`capacitor://localhost`),
 * takže by mierili do prázdna — a serverové jadro TanStacku sa do balíčka ani
 * zabaliť nedá.
 *
 * Preto tento zoznam: obrazovky si operáciu pýtajú kľúčom a most
 * (`server-most.ts` na webe, `server-most.mobile.ts` v appke) ju vybaví tak,
 * ako sa v danom prostredí dá. Kľúč je zároveň cesta endpointu
 * `/api/mobil/<kľúč>`, cez ktorý appka volá server.
 */

export const OPERACIE = [
  "blocek-precitaj",
  "vydavok-uloz",
  "vydavok-duplikat",
  "sken-predvolby",
  /* Naskenovaná zálohová faktúra od dodávateľa — nepatrí medzi bločky. */
  "prijata-zaloha-uloz",
  "ostatny-uloz",
  /*
    Jeden skener na všetko: nahratie do Nespracovaných, doptávanie sa na
    rozpoznanie AI a vytvorenie dokladu podľa druhu — tie isté serverové
    funkcie ako Nespracované doklady na webe.
  */
  "sken-nahraj",
  "sken-stav",
  "sken-vytvor",
  "banka-prehlad",
  "banka-stiahni",
  // „Pohyb nemá doklad“ / „Transakčná daň“ — tá istá funkcia ako detail pohybu na webe.
  "pohyb-oznac",
  "faktury-zoznam",
  "faktura-pdf",
  "faktura-email",
  // Dátum vystavenia pred prvým odoslaním — tie isté funkcie ako okno na webe.
  "faktura-datum-kontrola",
  "faktura-datum-na-dnes",
  "faktury-uhradene",
  "faktura-upomienka",
  "vydavky-zoznam",
  "vydavok-uprav",
  "vydavok-zmaz",
  "vydavok-subor",
  "faktura-podklady",
  "faktura-posledna",
  "faktura-vystav",
  // Cenové ponuky. Vystavenie ide cez server rovnako ako pri faktúre —
  // číslo ponuky aj súčty musia vznikať na jednom mieste s webom.
  "ponuka-vystav",
  "ponuky-zoznam",
  "ponuka-pdf",
  "ponuka-email",
  "ponuka-na-fakturu",
  "cisla-rezervuj",
  "cisla-uvolni",
  "cennik-kontext",
  "firma-podla-ica",
  "doklad-presun",
  "ucet-stav-zrusenia",
  "ucet-poziadaj-o-zrusenie",
  "ucet-odvolaj-zrusenie",
  "spatna-vazba",
  // Snímka obrazovky alebo fotka k nahlásenej chybe — príloha požiadavky v help desku.
  "podpora-priloha-nahraj",
  "pravne-suhlasy",
  "doklady-navrhy-parovania",
  "doklad-sparuj",
  "doklad-zrus-parovanie",
  "doklady-uhrady",
  // Prílohy k faktúre — tie isté ako na webe, nahrávajú sa cez server.
  "prilohy-zoznam",
  "priloha-nahraj",
  "priloha-odkaz",
  "priloha-zmaz",
  /*
    Registrácia účtu — server overí captchu (keď sa vo WebView načíta) a limit
    pokusov a založí účet. Bez prihlásenia: človek ešte účet nemá.
  */
  "registracia",
  "registracia-nastavenie",
  /*
    Prihlásenie QR kódom z webu („Prihlásiť appku v telefóne"). Bez
    prihlásenia — preukazom je jednorazový kód, ktorý server vymení za reláciu.
  */
  "parovanie-vymen",
  // Oznam o e-fakturácii 2027 na Prehľade — tie isté funkcie ako okno na webe.
  "efaktura-oznam-stav",
  "efaktura-oznam-akcia",
  "efaktura-pozvi-uctovnika",
] as const;

export type Operacia = (typeof OPERACIE)[number];

/** Operácie, ktoré sa volajú bez prihlásenia (most nepýta token). */
export const OPERACIE_BEZ_PRIHLASENIA: readonly Operacia[] = [
  "registracia",
  "registracia-nastavenie",
  "parovanie-vymen",
];

export function jeOperacia(hodnota: string): hodnota is Operacia {
  return (OPERACIE as readonly string[]).includes(hodnota);
}

/** Adresa servera pre zabalenú appku. Web volá relatívne, tam sa nepoužije. */
export const SERVER = "https://www.faktero.sk";
