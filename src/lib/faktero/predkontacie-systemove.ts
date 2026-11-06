/*
  Systémový číselník členenia DPH a členenia KV DPH — rovnaký pre každú
  slovenskú firmu (zdroj 'system' v tabuľke `predkontacie`).

  Odkiaľ sú kódy:
   - členenie DPH: úplný štandardný zoznam slovenskej POHODY tak, ako ho
     vrátil `listClassificationVATRequest` z dvoch ostrých Pohôd (Test,
     BÝVAJLEPŠIE, 2026). `agenda` je riadok priznania, ktorý Pohoda posiela
     („1200 U01“): U = uskutočnené (vydané), P = prijaté s odpočtom,
     D = daň na výstupe pri samozdanení. Staré neplatné kódy „R…“ (Pohoda ich
     posiela s validTill v minulosti) sa nezakladajú.
   - členenie KV DPH: číselník „Členenie kontrolného výkazu DPH“ SK Pohody
     (A1 … KN) — Pohoda ho nevie exportovať, zoznam je z obrázka (tri firmy
     ho mali rovnaký).

  Česká firma systémový číselník nedostane: česká POHODA má iné skratky
  (a kontrolní hlášení iné riadky) a overený zoznam z ostrej CZ Pohody nemáme
  — CZ firma si kódy načíta z Pohody alebo pridá ručne.

  Databáza má ten istý zoznam v migrácii 20261106210000 (funkcia
  `predkontacie_systemove_zoznam`); test drží zhodu.
*/

export type SmerSystemoveho = "vydane" | "prijate";

/** [kód, popis, riadok priznania z Pohody] v poradí, ako ich má Pohoda. */
export const SYSTEMOVE_CLENENIA_DPH: readonly (readonly [string, string, string])[] = [
  ["UN", "Nezahrňovať do priznania DPH", "5 U"],
  ["PN", "Nezahrňovať do priznania DPH", "103 P"],
  ["UD", "Tuzemské plnenie", "1200 U01"],
  ["UK", "Tuzemské plnenia - nezapočítať do koeficientu", "1201 U02"],
  ["UDzasEUl", "Zaslanie tovaru do iného štátu EU - do limitu", "1202 U03"],
  ["UDdodEU", "Dodanie tovaru do iného štátu EU", "1203 U04"],
  ["UKdodEU", "Dodanie tovaru do iného štátu EU - nezapočítať do koeficientu", "1204 U05"],
  ["UDdod3", "Dodanie tovaru druhým podnikateľom pri trojstrannom obchode", "1206 U07"],
  ["UNodpS", "Oslobodené plnenia s možnosťou odpoč. dane", "1207 U08"],
  ["UKodpS", "Oslobodené plnenia s možnosťou odpoč. dane - nezapočítať do koeficientu", "1208 U09"],
  ["UNodpBez", "Oslobodené plnenia bez možnosti odpočítania dane", "1209 U10"],
  ["UKodpBez", "Oslobodené plnenia bez možnosti odpočítania dane - nezapočítať do koeficientu", "1210 U11"],
  ["UDzahr", "Miesto plnenia v zahraničí s možnosťou odpočítania dane", "1211 U12"],
  ["UKzahr", "Miesto plnenia v zahraničí s možnosťou odpočítania dane - nezapočítať do koeficientu", "1212 U13"],
  ["UDcest", "Osobitná úprava pre cestovné služby", "1213 U14"],
  ["UKcest", "Osobitná úprava pre cestovné služby - nezapočítať do koeficientu", "1214 U15"],
  ["UDobch", "Osobitná úprava pre obchody s použ. tovarom a umením", "1215 U16"],
  ["UKobch", "Osobitná úprava pre obchody s použ. tovarom a umením - nezapočítať do koeficientu", "1216 U17"],
  ["UVdaň", "Vrátená daň", "1217 U18"],
  ["URozdiel", "Rozdiel v základe dane a v dani po oprave (§25 ods. 1 až 3, §65 ods. 10 a 11)", "1218 U19"],
  ["UZinýEU", "Zaslanie tovaru z iného štátu EU s plnením v tuzemsku", "1219 U20"],
  ["UN§69", "Prenesenie daňovej povinnosti §69 ods. 12", "1220 U21"],
  ["UDzahrSl", "Miesto plnenia v zahraničí s možnosťou odpočítania dane", "1221 U22"],
  ["UKzahrSl", "Miesto plnenia v zahraničí s možnosťou odpočítania dane - nezapočítať do koeficientu", "1222 U23"],
  ["UDdopr11", "Dodanie nového dopravného prostriedku", "1223 U24"],
  [
    "UKrozdiel",
    "Rozdiel v zákl. dane a v dani po oprave (§25 ods. 1 až 3, §65 ods. 10 a 11) - nezapočítať do koef.",
    "1224 U25",
  ],
  ["URoz§25a", "Rozdiel v základe dane a v dani po oprave (§25a)", "1225 U26"],
  ["UKroz§25a", "Rozdiel v základe dane a v dani po oprave (§25a) - nezapočítať do koeficientu", "1226 U27"],
  ["UNoslob", "Oslobodené plnenia §65 ods. 7 a §67 ods.3", "1228 U29"],
  ["UD-OsU", "Tuzemské plnenia - osobitná úprava §68d", "1229 U30"],
  ["UK-OsU", "Tuzemské plnenia - osobitná úprava §68d - nezapočítať do koeficientu", "1230 U31"],
  [
    "Uroz-OsU",
    "Rozdiel v základe dane a v dani po oprave (§25 ods. 1 až 3, §65 ods. 10 a 11) - os. úprava §68d",
    "1231 U32",
  ],
  [
    "UKroz-OsU",
    "Rozdiel v zákl.dane a v dani po opr.(§25 ods.1 až 3, §65 ods.10 a 11)-os. úpr. §68d-nezap. do koef.",
    "1232 U33",
  ],
  ["UNodpBez-OsU", "Oslobodené plnenia bez možnosti odpočítania dane – osobitná úprava §68d", "1233 U34"],
  [
    "UKodpBez-OsU",
    "Oslobodené plnenia bez možnosti odpočítania dane - nezapočítať do koeficientu – osobitná úprava §68d",
    "1234 U35",
  ],
  ["UDpdp", "Prenesenie daňovej povinnosti §69 ods. 12 (s uvedením sadzby dane)", "1235 U36"],
  [
    "UKpdp",
    "Prenesenie daňovej povinnosti §69 ods. 12 (s uvedením sadzby dane) - nezapočítať do koeficientu",
    "1236 U37",
  ],
  ["UDzrušReg", "Zrušenie registrácie platiteľa", "1237 U38"],
  ["PD", "Tuzemské plnenie s nárokom na odpočet", "1300 P01"],
  ["PK", "Tuzemské plnenia - krátiť nárok", "1301 P02"],
  ["PB", "Tuzemské plnenia - bez nároku", "1302 P03"],
  ["PDnadEU", "Nadobudnutie tovaru z iného štátu EU", "1303 P04"],
  ["PKnadEU", "Nadobudnutie tovaru z iného štátu EU - krátiť nárok", "1304 P05"],
  ["PBnadEU", "Nadobudnutie tovaru z iného štátu EU - bez nároku", "1305 P06"],
  ["PDsluz", "Poskytnutie služieb a tovarov, pri ktorých daň platí príjemca", "1306 P07"],
  ["PKsluz", "Poskytnutie služieb a tovarov, pri ktorých daň platí príjemca - krátiť nárok", "1307 P08"],
  ["PBsluz", "Poskytnutie služieb a tovarov, pri ktorých daň platí príjemca - bez nároku", "1308 P09"],
  ["PDtovar", "Dovoz tovaru", "1309 P10"],
  ["PKtovar", "Dovoz tovaru - krátiť nárok", "1310 P11"],
  ["PBtovar", "Dovoz tovaru - bez nároku", "1311 P12"],
  ["PD1odb", "Nadobudnutie tovaru prvým odberateľom", "1312 P13"],
  ["PDdopr", "Nadobudnutie nového dopravného prostriedku", "1313 P14"],
  ["PDoprava", "Oprava odpočítanej dane", "1314 P15"],
  ["PVdaň", "Vrátená daň", "1315 P16"],
  ["PKoprava", "Oprava odpočítanej dane (§ 53) - krátiť nárok", "1317 P18"],
  ["PD-OsU", "Tuzemské plnenia - osobitná úprava §68d", "1318 P19"],
  ["PK-OsU", "Tuzemské plnenia - osobitná úprava §68d - krátiť nárok", "1319 P20"],
  ["PDopr-OsU", "Oprava odpočítanej dane - osobitná úprava §68d", "1320 P21"],
  ["PKopr-OsU", "Oprava odpočítanej dane - osobitná úprava §68d - krátiť nárok", "1321 P22"],
  ["PD-OsUdod", "Tuzemské plnenia - faktúra vystavená v osobitnej úprave §68d", "1322 P23"],
  ["PK-OsUdod", "Tuzemské plnenia - faktúra vystavená v osobitnej úprave §68d - krátiť nárok", "1323 P24"],
  ["PDopr-OsUdod", "Oprava odpočítanej dane - faktúra vystavená v osobitnej úprave §68d", "1324 P25"],
  [
    "PKopr-OsUdod",
    "Oprava odpočítanej dane - faktúra vystavená v osobitnej úprave §68d - krátiť nárok",
    "1325 P26",
  ],
  ["PDopr§53b", "Oprava odpočítanej dane (§53b)", "1326 P27"],
  ["PKopr§53b", "Oprava odpočítanej dane (§53b) – krátiť nárok", "1327 P28"],
  ["PNnevymer", "Nezahrňovať do priznania DPH - nevymeriavať DPH", "1328 P"],
  ["PDtov§84a", "Dovoz tovaru (daň uplatnená podľa § 84a ods. 3)", "1329 P29"],
  ["PKtov§84a", "Dovoz tovaru (daň uplatnená podľa § 84a ods. 3) - krátiť nárok", "1330 P30"],
  ["DDnadEU", "Nadobudnutie tovaru z iného štátu EU", "1350 D01"],
  ["DDsluz", "Tovary a služby, pri ktorých daň platí príjemca", "1351 D02"],
  ["DDdopr", "Nadobudnutie nového dopravného prostriedku", "1352 D03"],
  ["DD2odb", "Tovary, pri ktorých daň platí druhý odberateľ", "1353 D04"],
  ["DDsl§69", "Služby, pri ktorých príjemca platí daň podľa § 69 ods.3 zákona", "1354 D05"],
  ["DRozdiel", "Rozdiel v zákl. dane a v dani po oprave (§25 od.1 až 3) - tovary a služby (D01 - D05)", "1355 D06"],
  ["DDtov§84a", "Dovoz tovaru § 84a ods. 3", "1356 D07"],
];

/** [kód, popis, typ (kategória v Pohode), smer] — členenie kontrolného výkazu DPH. */
export const SYSTEMOVE_KV: readonly (readonly [string, string, string, SmerSystemoveho | null])[] = [
  [
    "A1",
    "Vyhotovené faktúry, pri ktorých je platiteľ osobou povinnou platiť daň, vyhotovenie faktúry §71-§75",
    "A1 Dodanie - Vydané faktúry",
    "vydane",
  ],
  [
    "A2CN",
    "Vyhotovené faktúry, pri ktorých je osobou povinnou platiť daň príjemca plnenia §69 ods. 12 písm. f) a g)",
    "A2 Colná nomenklatúra (§69 12 f, g)",
    "vydane",
  ],
  [
    "A2IO",
    "Vyhotovené faktúry, pri ktorých je osobou povinnou platiť daň príjemca plnenia §69 ods. 12 písm. i)",
    "A2 Integrované obvody (§69 12 i)",
    "vydane",
  ],
  [
    "A2MT",
    "Vyhotovené faktúry, pri ktorých je osobou povinnou platiť daň príjemca plnenia §69 ods. 12 písm. h)",
    "A2 Mobilné telefóny (§69 12 h)",
    "vydane",
  ],
  [
    "A2SP",
    "Vyhotovené faktúry, pri ktorých je osobou povinnou platiť daň príjemca plnenia §69 ods. 12 písm. j)",
    "A2 Stavebné práce (§69 12j)",
    "vydane",
  ],
  [
    "B1",
    "Prijaté faktúry, pri ktorých je osobou povinnou platiť daň príjemca plnenia §69 ods. 2,3,6,7, 9 až 12",
    "B1 Prenos daňovej povinnosti",
    "prijate",
  ],
  [
    "B1-0",
    "Plnenia vstupujúce do sekcie B1 - bez nároku na odpočet",
    "B1-0 Prenos daňovej povinnosti, bez nároku na odpočet",
    "prijate",
  ],
  [
    "B2",
    "Prijaté faktúry, z ktorých príjemca plnenia uplatňuje odpočet, vyhotovené platiteľom §69 ods. 1",
    "B2 Odpočet - Prijaté faktúry",
    "prijate",
  ],
  [
    "B3",
    "Prijaté zjednodušené faktúry podľa §74 ods. 3 písm. a) až c), z ktorých príjemca uplatňuje odpočet",
    "B3 Odpočet - Ostatné",
    "prijate",
  ],
  ["C1", "Vyhotovené opravné faktúry podľa §71 ods. 2 zákona", "C1 Vydané faktúry - Opravná", "vydane"],
  [
    "C1CN",
    "Vyhotovené opravné faktúry podľa §71 ods. 2 zákona - colná nomenklatúra §69 ods. 12 písm. f) a g)",
    "C1 Colná nomenklatúra - Opravná (§69 12 f, g)",
    "vydane",
  ],
  [
    "C1IO",
    "Vyhotovené opravné faktúry podľa §71 ods. 2 zákona - colná nomenklatúra §69 ods. 12 písm. i)",
    "C1 Integrované obvody - Opravná (§69 12 i)",
    "vydane",
  ],
  [
    "C1MT",
    "Vyhotovené opravné faktúry podľa §71 ods. 2 zákona - colná nomenklatúra §69 ods. 12 písm. h)",
    "C1 Mobilné telefóny - Opravná (§69 12 h)",
    "vydane",
  ],
  ["C2", "Prijaté opravné faktúry podľa §71 ods. 2 zákona", "C2 Prijaté faktúry - Opravná", "prijate"],
  [
    "C2B1",
    "Prijaté opravné faktúry podľa §71 ods. 2 zákona k faktúram uvedeným v B.1.",
    "C2 Prijaté faktúry - Opravná B1",
    "prijate",
  ],
  [
    "C2B1-0",
    "Plnenia vstupujúce do sekcie C2 k faktúram uvedeným v B1 - bez nároku na odpočet",
    "C2-0 Prijaté faktúry - Opravná B1, bez nároku na odpočet",
    "prijate",
  ],
  [
    "D1",
    "Dodanie tovarov a služieb - obraty evidované všetkými elektronickými registračnými pokladnicami",
    "D1 Obraty ERP",
    "vydane",
  ],
  [
    "D2",
    "Dodanie tovarov a služieb, ktoré sa neevidujú elektronickou registračnou pokladnicou",
    "D2 Dodanie - Ostatné",
    "vydane",
  ],
  ["KN", "Nezahrňovať do Kontrolného výkazu DPH", "KN Nezahrňovať do Kontrolného výkazu DPH", null],
];

/** Smer členenia DPH podľa riadku priznania (U = vydané, P a D = prijaté doklady). */
export function smerSystemovehoClenenia(agenda: string): SmerSystemoveho {
  return /\bU\d*$/.test(agenda.trim()) ? "vydane" : "prijate";
}

/** Riadok tabuľky `predkontacie` so systémovým kódom (bez company_id). */
export type SystemovyRiadok = {
  druh: "clenenie_dph" | "kv_clenenie";
  kod: string;
  popis: string;
  agenda: string;
  typ_dokladu: SmerSystemoveho | null;
  kategoria: string | null;
};

/** Celý systémový číselník ako riadky — to isté, čo založí databáza. */
export function systemoveRiadky(): SystemovyRiadok[] {
  return [
    ...SYSTEMOVE_CLENENIA_DPH.map(([kod, popis, agenda]) => ({
      druh: "clenenie_dph" as const,
      kod,
      popis,
      agenda,
      typ_dokladu: smerSystemovehoClenenia(agenda),
      kategoria: null,
    })),
    ...SYSTEMOVE_KV.map(([kod, popis, kategoria, smer]) => ({
      druh: "kv_clenenie" as const,
      kod,
      popis,
      agenda: "",
      typ_dokladu: smer,
      kategoria,
    })),
  ];
}

/** Firma dostane systémový číselník (len slovenská — prázdna krajina = SK). */
export function maSystemovyCiselnik(krajina: string | null | undefined): boolean {
  return (String(krajina ?? "").trim().toUpperCase() || "SK") === "SK";
}

export const jeSystemovy = (z: { zdroj?: string | null } | null | undefined) => z?.zdroj === "system";

/**
 * Riadky na zobrazenie v číselníku: systémový kód, ktorý firma má aj vo
 * vlastnom riadku rovnakého druhu (z Pohody, ručne), sa neukáže druhýkrát —
 * vlastný riadok má prednosť.
 */
export function bezZdvojenychSystemovych<T extends { druh: string; kod: string; zdroj?: string | null }>(
  zaznamy: readonly T[],
): T[] {
  const vlastne = new Set(zaznamy.filter((z) => !jeSystemovy(z)).map((z) => `${z.druh}|${z.kod}`));
  return zaznamy.filter((z) => !jeSystemovy(z) || !vlastne.has(`${z.druh}|${z.kod}`));
}
