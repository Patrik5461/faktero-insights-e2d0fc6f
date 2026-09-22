/*
  Roly a vlastný prístup. Pri roli „Vlastný prístup“ (custom) si majiteľ
  alebo admin vyklikne, ku ktorým oblastiam má človek prístup. Databáza to
  stráži sama (`firmy_s_pravom` v reštriktívnych politikách) — menu len
  skrýva, čo by aj tak ostalo prázdne.
*/

export type Uroven = "none" | "read" | "edit";
export type Oblast =
  | "faktury"
  | "doklady"
  | "ostatne"
  | "kontakty"
  | "banka"
  | "pokladna"
  | "sklad"
  | "zakazky"
  | "jazdy"
  | "zamestnanci"
  | "uctovnictvo";

export const OBLASTI: { kluc: Oblast; nazov: string; popis: string }[] = [
  { kluc: "faktury", nazov: "Faktúry a ponuky", popis: "vydané faktúry, dobropisy, zálohy, ponuky, objednávky, opakované faktúry, eFaktúry" },
  { kluc: "doklady", nazov: "Prijaté faktúry a doklady", popis: "prijaté faktúry, bločky, doklady e-mailom" },
  { kluc: "ostatne", nazov: "Ostatné doklady", popis: "listy, predpisy, exekúcie, zmluvy" },
  { kluc: "kontakty", nazov: "Kontakty", popis: "odberatelia a dodávatelia (kto smie faktúry, vidí ich tiež)" },
  { kluc: "banka", nazov: "Banka", popis: "bankové účty, pohyby, výpisy, platby, leasingy a úvery" },
  { kluc: "pokladna", nazov: "Pokladňa", popis: "pokladničné doklady a stav hotovosti" },
  { kluc: "sklad", nazov: "Sklad a cenník", popis: "produkty, zásoby, pohyby, inventúry, cenník, objednávky dodávateľom" },
  { kluc: "zakazky", nazov: "Zákazky", popis: "zákazky a ich prehľad" },
  { kluc: "jazdy", nazov: "Kniha jázd", popis: "jazdy, vozidlá, tankovanie" },
  { kluc: "zamestnanci", nazov: "Zamestnanci", popis: "personalistika vrátane rodných čísiel a zmlúv" },
  { kluc: "uctovnictvo", nazov: "Účtovníctvo a exporty", popis: "exporty do Pohody, odovzdanie účtovníkovi, importy" },
];

export const UROVNE: { kluc: Uroven; nazov: string }[] = [
  { kluc: "none", nazov: "Bez prístupu" },
  { kluc: "read", nazov: "Len čítať" },
  { kluc: "edit", nazov: "Upravovať" },
];

export type Opravnenia = Partial<Record<Oblast, Uroven>>;

/** Čo ktorá rola smie — do vysvetlenia pri pozývaní. */
export const POPIS_ROLI: { rola: string; nazov: string; text: string }[] = [
  { rola: "owner", nazov: "Majiteľ", text: "Všetko vrátane predplatného, používateľov, banky, bankových účtov, API kľúčov a zrušenia firmy." },
  { rola: "admin", nazov: "Administrátor", text: "Všetko ako majiteľ okrem zrušenia firmy — spravuje používateľov, predplatné, banku aj nastavenia." },
  { rola: "accountant", nazov: "Účtovník", text: "Vidí a vedie všetky doklady, faktúry, sklad aj knihu jázd. Nesmie pripájať banku, posielať platby, meniť bankové účty firmy ani spravovať používateľov." },
  { rola: "employee", nazov: "Používateľ", text: "Pracuje so všetkými agendami (faktúry, doklady, sklad, jazdy…), ale nespravuje banku, bankové účty, API ani používateľov." },
  { rola: "custom", nazov: "Vlastný prístup", text: "Vidí a upravuje len oblasti, ktoré mu vyberiete. Nespravuje banku, bankové účty, API ani používateľov." },
];

export function uroven(opr: unknown, oblast: Oblast): Uroven {
  const u = (opr as Record<string, unknown> | null)?.[oblast];
  return u === "read" || u === "edit" ? u : "none";
}

/** Vidí človek oblasť? Iné roly než „custom“ vidia všetko ako doteraz. */
export function vidiOblast(rola: string | null | undefined, opr: unknown, oblast: Oblast): boolean {
  if (rola !== "custom") return true;
  if (oblast === "kontakty" && uroven(opr, "faktury") !== "none") return true;
  return uroven(opr, oblast) !== "none";
}

/** Uloží len známe oblasti s platnou úrovňou — nič iné sa do databázy nedostane. */
export function vycistiOpravnenia(vstup: unknown): Opravnenia {
  const out: Opravnenia = {};
  for (const o of OBLASTI) {
    const u = uroven(vstup, o.kluc);
    if (u !== "none") out[o.kluc] = u;
  }
  return out;
}

/** Krátky súhrn do zoznamu členov: „Faktúry (upravovať), Banka (čítať)“. */
export function suhrnOpravneni(opr: unknown): string {
  const casti = OBLASTI.filter((o) => uroven(opr, o.kluc) !== "none").map(
    (o) => `${o.nazov} (${uroven(opr, o.kluc) === "edit" ? "upravovať" : "čítať"})`,
  );
  return casti.length ? casti.join(", ") : "žiadna oblasť";
}

/** Oblasť stránky podľa jej cesty (najdlhšia zhoda). Stránky mimo oblastí vidí každý. */
const CESTY: [string, Oblast][] = [
  ["/efaktura/prijate", "doklady"],
  ["/prijate-faktury", "doklady"],
  ["/doklady", "doklady"],
  ["/ostatne-doklady", "ostatne"],
  ["/faktury", "faktury"],
  ["/zalohove", "faktury"],
  ["/ponuky", "faktury"],
  ["/objednavky", "faktury"],
  ["/opakovane", "faktury"],
  ["/efaktura", "faktury"],
  ["/odberatelia", "kontakty"],
  ["/zakazky", "zakazky"],
  ["/zamestnanci", "zamestnanci"],
  ["/sklad", "sklad"],
  ["/produkty", "sklad"],
  ["/ceny", "sklad"],
  ["/bankove-ucty", "banka"],
  ["/financovanie", "banka"],
  ["/pokladna", "pokladna"],
  ["/uctovnictvo", "uctovnictvo"],
  ["/exporty", "uctovnictvo"],
  ["/importy", "uctovnictvo"],
  ["/jazdy", "jazdy"],
];

export function oblastPodlaCesty(cesta: string): Oblast | null {
  let najlepsia: [string, Oblast] | null = null;
  for (const c of CESTY) {
    if ((cesta === c[0] || cesta.startsWith(c[0] + "/")) && (!najlepsia || c[0].length > najlepsia[0].length)) {
      najlepsia = c;
    }
  }
  return najlepsia?.[1] ?? null;
}
