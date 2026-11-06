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
  { kluc: "ostatne", nazov: "Iné doklady", popis: "listy, predpisy, exekúcie, zmluvy" },
  { kluc: "kontakty", nazov: "Kontakty", popis: "odberatelia a dodávatelia (kto smie faktúry, vidí ich tiež)" },
  { kluc: "banka", nazov: "Banka", popis: "bankové účty, pohyby, výpisy, platby, leasingy a úvery" },
  { kluc: "pokladna", nazov: "Pokladňa", popis: "pokladničné doklady a stav hotovosti" },
  { kluc: "sklad", nazov: "Sklad a cenník", popis: "produkty, zásoby, pohyby, inventúry, cenník, objednávky dodávateľom" },
  { kluc: "zakazky", nazov: "Zákazky", popis: "zákazky a ich prehľad" },
  { kluc: "jazdy", nazov: "Kniha jázd a vozový park", popis: "jazdy, vozidlá, tankovanie, technické preukazy a poistky vozidiel" },
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
  { rola: "accountant", nazov: "Účtovník", text: "Plné práva k firme ako administrátor — doklady, exporty, banka, API, používatelia, nastavenia aj predplatné. Majiteľa nemôže odobrať a firmu nezruší." },
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
  ["/prijate-zalohove", "doklady"],
  ["/ciselne-rady", "faktury"],
  ["/doklady", "doklady"],
  ["/nespracovane", "doklady"],
  // Schvaľujú sa prijaté doklady (B4).
  ["/schvalovanie", "doklady"],
  ["/ostatne-doklady", "ostatne"],
  ["/faktury", "faktury"],
  // Párovanie platieb číta pohyby banky — server chce banku aj faktúry (B-10).
  ["/faktury/parovanie", "banka"],
  ["/zalohove", "faktury"],
  ["/ponuky", "faktury"],
  ["/objednavky", "faktury"],
  ["/opakovane", "faktury"],
  ["/efaktura", "faktury"],
  ["/odberatelia", "kontakty"],
  ["/dodavatelia", "kontakty"],
  ["/zakazky", "zakazky"],
  ["/zamestnanci", "zamestnanci"],
  ["/sklad", "sklad"],
  ["/produkty", "sklad"],
  ["/ceny", "sklad"],
  ["/bankove-ucty", "banka"],
  ["/financovanie", "banka"],
  ["/pokladna", "pokladna"],
  ["/uctovnictvo", "uctovnictvo"],
  // Návrhy zaúčtovania sú nad prijatými dokladmi — server overuje „doklady“ (E-26).
  // Stará adresa; dnes záložka `/uctovnictvo/zauctovanie?tab=kontrola` (pozri `oblastOdkazu`).
  ["/uctovnictvo/na-kontrolu", "doklady"],
  // Pravidlá a predlohy patria účtovníctvu; záložku Na kontrolu stráži `oblastOdkazu`.
  ["/uctovnictvo/zauctovanie", "uctovnictvo"],
  // Správa pokladní: tabuľku pokladní stráži v databáze oblasť pokladne.
  ["/uctovnictvo/pokladne", "pokladna"],
  ["/exporty", "uctovnictvo"],
  ["/importy", "uctovnictvo"],
  ["/jazdy", "jazdy"],
  ["/vozovy-park", "jazdy"],
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

/**
 * Oblasti odkazu aj s parametrami — stačí jedna z nich. Automatické účtovanie
 * spája frontu na kontrolu (oblasť „doklady“, server overuje doklady) s
 * pravidlami („uctovnictvo“): záložka `tab=kontrola` patrí dokladom, samotná
 * stránka bez záložky ukáže kontrolu, takže ju vidí ten, kto má aspoň jedno.
 */
export function oblastiOdkazu(odkaz: string): Oblast[] {
  const [cesta = "", dotaz = ""] = String(odkaz).split("?");
  if (cesta === "/uctovnictvo/zauctovanie") {
    const tab = new URLSearchParams(dotaz).get("tab");
    if (tab === "kontrola") return ["doklady"];
    if (tab === "pravidla" || tab === "predlohy") return ["uctovnictvo"];
    return ["doklady", "uctovnictvo"];
  }
  const o = oblastPodlaCesty(cesta);
  return o ? [o] : [];
}

/** Vidí človek cieľ odkazu (menu, zvonček)? Stránky mimo oblastí vidí každý. */
export function vidiOdkaz(rola: string | null | undefined, opr: unknown, odkaz: string): boolean {
  const o = oblastiOdkazu(odkaz);
  return o.length === 0 || o.some((x) => vidiOblast(rola, opr, x));
}

/**
 * Roly so správou firmy — používatelia, banka, bankové účty, API, nastavenia,
 * predplatné. Zrkadlí `is_company_admin` v databáze. Od 2026-11-02 sem patrí
 * aj účtovník (Patrikovo rozhodnutie: „účtovník musí mať plné práva k firme“).
 */
export const ROLY_SPRAVCU = ["owner", "admin", "accountant"] as const;

/** Správca firmy: majiteľ, administrátor alebo účtovník (`is_company_admin`). */
export function jeAdminRola(rola: string | null | undefined): boolean {
  return (ROLY_SPRAVCU as readonly string[]).includes(String(rola ?? ""));
}

/**
 * Smie človek v oblasti zapisovať (zakladať, upravovať, mazať)? Zrkadlí
 * `firmy_s_pravom(oblast, true)` v databáze:
 * - owner, admin, accountant, employee — áno vo všetkých oblastiach
 *   (účtovník vedie doklady v plnom rozsahu, pamäť „role a pozvánky“);
 *   správcovské veci (bankové účty firmy, pripojenie banky, platby, API,
 *   používatelia) navyše stráži `jeAdminRola` — tie nie sú oblasť;
 * - custom — len pri úrovni „edit“; kontakty aj cez „edit“ na faktúrach;
 * - bez roly (ešte nenačítané, nie člen) — nie.
 */
export function mozeUpravovat(rola: string | null | undefined, opr: unknown, oblast: Oblast): boolean {
  if (!rola) return false;
  if (rola !== "custom") return true;
  if (uroven(opr, oblast) === "edit") return true;
  return oblast === "kontakty" && uroven(opr, "faktury") === "edit";
}
