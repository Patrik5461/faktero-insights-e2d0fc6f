/**
 * Veta o tuzemskom prenesení daňovej povinnosti s celým ustanovením podľa
 * druhu plnenia (`invoices.pdp_druh`).
 *
 * Doklad s prenesením musí niesť slová „prenesenie daňovej povinnosti“
 * (SK § 74 ods. 1 písm. m) a § 69 ods. 16, CZ § 29 odst. 2 písm. a)) — a
 * účtovník chce vidieť aj presné písmeno, podľa ktorého odberateľ daň
 * priznáva. Znenie je overené proti zákonu č. 222/2004 Z. z. v znení účinnom
 * od 1. 1. 2026 (a rovnako od 1. 1. 2027) — § 69 ods. 12 písm. a) až j), a proti
 * zákonu č. 235/2004 Sb. — § 92b až § 92f.
 *
 * Bez zvoleného druhu sa písmeno odhadne z colných kódov položiek (obilniny,
 * kovy, mobilné telefóny, integrované obvody); inak ostáva všeobecná veta
 * s § 69 ods. 12 (resp. § 92a).
 */
import {
  jazykDokladu,
  popisky,
  vetaPreneseniaCz,
  vetaPreneseniaDe,
  vetyDe,
  type JazykDokladu,
} from "./faktura-jazyk";
import { rezimFirmy, type FirmaDph } from "./dph-rezim";
import { krajinaDane } from "./vat-rates";

/** Písmená § 69 ods. 12 ZDPH. */
export const PISMENA_PDP_SK = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;
/** Osobitné ustanovenia českého režimu prenesenia (§ 92b až § 92f). */
export const DRUHY_PDP_CZ = ["92b", "92c", "92d", "92e", "92f"] as const;

export type DruhPdpSk = (typeof PISMENA_PDP_SK)[number];
export type DruhPdpCz = (typeof DRUHY_PDP_CZ)[number];

/** Krátky popis plnenia za pomlčkou — v jazyku dokladu. */
const POPIS_SK: Record<DruhPdpSk, Record<JazykDokladu, string>> = {
  a: {
    sk: "dodanie kovového odpadu a kovového šrotu",
    cs: "dodání kovového odpadu a kovového šrotu",
    en: "supply of metal waste and scrap",
    de: "Lieferung von Metallabfällen und Metallschrott",
    hu: "fémhulladék és fémtörmelék értékesítése",
  },
  b: {
    sk: "prevod emisných kvót skleníkových plynov",
    cs: "převod povolenek na emise skleníkových plynů",
    en: "transfer of greenhouse gas emission allowances",
    de: "Übertragung von Treibhausgas-Emissionszertifikaten",
    hu: "üvegházhatású gázok kibocsátási egységeinek átruházása",
  },
  c: {
    sk: "dodanie nehnuteľnosti, ktorú sa dodávateľ rozhodol zdaniť podľa § 38 ods. 8",
    cs: "dodání nemovitosti, u níž se dodavatel rozhodl pro zdanění podle § 38 odst. 8",
    en: "supply of immovable property opted for taxation under Section 38(8)",
    de: "Lieferung eines Grundstücks mit Option zur Besteuerung nach § 38 Abs. 8",
    hu: "ingatlan értékesítése, amelynél az eladó a 38. § (8) bek. szerinti adózást választotta",
  },
  d: {
    sk: "dodanie nehnuteľnosti predanej v konaní o nútenom predaji",
    cs: "dodání nemovitosti prodané v řízení o nuceném prodeji",
    en: "supply of immovable property sold in compulsory sale proceedings",
    de: "Lieferung eines Grundstücks im Zwangsversteigerungsverfahren",
    hu: "kényszerértékesítési eljárásban eladott ingatlan értékesítése",
  },
  e: {
    sk: "dodanie tovaru, ktorý je predmetom záruky, pri výkone práva zo záruky",
    cs: "dodání zboží, které je předmětem zajištění, při výkonu práva ze zajištění",
    en: "supply of goods provided as security in the enforcement of that security",
    de: "Lieferung sicherungsübereigneter Gegenstände bei Verwertung der Sicherheit",
    hu: "biztosítékul szolgáló termék értékesítése a biztosíték érvényesítésekor",
  },
  f: {
    sk: "dodanie tovarov z kapitol 10 a 12 Spoločného colného sadzobníka (obilniny, olejniny)",
    cs: "dodání zboží z kapitol 10 a 12 společného celního sazebníku (obiloviny, olejniny)",
    en: "supply of goods of chapters 10 and 12 of the Common Customs Tariff (cereals, oilseeds)",
    de: "Lieferung von Waren der Kapitel 10 und 12 des Gemeinsamen Zolltarifs (Getreide, Ölsaaten)",
    hu: "a Közös Vámtarifa 10. és 12. árucsoportjába tartozó termékek (gabona, olajos magvak) értékesítése",
  },
  g: {
    sk: "dodanie tovarov z kapitoly 72 a položiek 7301, 7308 a 7314 Spoločného colného sadzobníka (železo a oceľ)",
    cs: "dodání zboží z kapitoly 72 a položek 7301, 7308 a 7314 společného celního sazebníku (železo a ocel)",
    en: "supply of goods of chapter 72 and headings 7301, 7308 and 7314 of the Common Customs Tariff (iron and steel)",
    de: "Lieferung von Waren des Kapitels 72 und der Positionen 7301, 7308 und 7314 des Gemeinsamen Zolltarifs (Eisen und Stahl)",
    hu: "a Közös Vámtarifa 72. árucsoportjába és 7301, 7308, 7314 vámtarifaszámaiba tartozó termékek (vas és acél) értékesítése",
  },
  h: {
    sk: "dodanie mobilných telefónov",
    cs: "dodání mobilních telefonů",
    en: "supply of mobile telephones",
    de: "Lieferung von Mobilfunkgeräten",
    hu: "mobiltelefonok értékesítése",
  },
  i: {
    sk: "dodanie integrovaných obvodov",
    cs: "dodání integrovaných obvodů",
    en: "supply of integrated circuit devices",
    de: "Lieferung integrierter Schaltkreise",
    hu: "integrált áramkörök értékesítése",
  },
  j: {
    sk: "stavebné práce",
    cs: "stavební práce",
    en: "construction work",
    de: "Bauleistungen",
    hu: "építési munkák",
  },
};

const POPIS_CZ: Record<DruhPdpCz, Record<JazykDokladu, string>> = {
  "92b": {
    cs: "dodání zlata",
    sk: "dodanie zlata",
    en: "supply of gold",
    de: "Lieferung von Gold",
    hu: "arany értékesítése",
  },
  "92c": {
    cs: "dodání zboží uvedeného v příloze č. 5 (odpady a šrot)",
    sk: "dodanie tovaru uvedeného v prílohe č. 5 (odpad a šrot)",
    en: "supply of goods listed in Annex 5 (waste and scrap)",
    de: "Lieferung von Waren nach Anlage 5 (Abfälle und Schrott)",
    hu: "az 5. mellékletben felsorolt termékek (hulladék és törmelék) értékesítése",
  },
  "92d": {
    cs: "dodání nemovité věci",
    sk: "dodanie nehnuteľnej veci",
    en: "supply of immovable property",
    de: "Lieferung eines Grundstücks",
    hu: "ingatlan értékesítése",
  },
  "92e": {
    cs: "poskytnutí stavebních nebo montážních prací",
    sk: "stavebné alebo montážne práce",
    en: "construction or assembly work",
    de: "Bau- oder Montageleistungen",
    hu: "építési vagy szerelési munkák",
  },
  "92f": {
    cs: "dodání zboží nebo poskytnutí služby uvedených v příloze č. 6",
    sk: "dodanie tovaru alebo služby uvedených v prílohe č. 6",
    en: "supply of goods or services listed in Annex 6",
    de: "Lieferung von Waren oder Leistungen nach Anlage 6",
    hu: "a 6. mellékletben felsorolt termékek vagy szolgáltatások értékesítése",
  },
};

/** Skratka na konci („Coll.“, „Slg.“, „MwSt.“) a bodka za vetou nesmú dať „..“. */
const bezDvojbodky = (v: string) => v.replace(/\.\.(?=\s|$)/g, ".");

/** Slovenská veta podľa písmena § 69 ods. 12 v jazyku dokladu. */
function vetaSk(p: DruhPdpSk | null, j: JazykDokladu): string {
  return bezDvojbodky(vetaSkSurova(p, j));
}
function vetaSkSurova(p: DruhPdpSk | null, j: JazykDokladu): string {
  const pism = p ? ` písm. ${p})` : "";
  const popis = p ? ` – ${POPIS_SK[p][j]}` : "";
  switch (j) {
    case "cs":
      return `Přenesení daňové povinnosti – § 69 odst. 12${pism} slovenského zákona č. 222/2004 Z. z. o DPH${popis}. Daň je povinen přiznat a odvést odběratel.`;
    case "en":
      return `Reverse charge – Section 69(12)${p ? `(${p})` : ""} of Slovak VAT Act No. 222/2004 Coll.${popis}. VAT is to be reported and paid by the customer.`;
    case "de":
      return `Übergang der Steuerschuld – § 69 Abs. 12${p ? ` Buchst. ${p})` : ""} des slowakischen Gesetzes Nr. 222/2004 Slg. über die MwSt.${popis}. Die Steuer schuldet der Leistungsempfänger.`;
    case "hu":
      return `Fordított adózás – a 222/2004. sz. szlovák áfatörvény 69. § (12) bekezdés${p ? ` ${p}) pontja` : "e"}${popis}. Az adót a vevő vallja be és fizeti meg.`;
    default:
      return `Prenesenie daňovej povinnosti – § 69 ods. 12${pism} zákona č. 222/2004 Z. z. o DPH${popis}. Daň je povinný priznať a odviesť odberateľ.`;
  }
}

/** Česká veta podľa § 92b–§ 92f (bez druhu § 92a) v jazyku dokladu. */
function vetaCz(d: DruhPdpCz | null, j: JazykDokladu): string {
  return bezDvojbodky(vetaCzSurova(d, j));
}
function vetaCzSurova(d: DruhPdpCz | null, j: JazykDokladu): string {
  const par = d ?? "92a";
  const popis = d ? ` – ${POPIS_CZ[d][j]}` : "";
  switch (j) {
    case "sk":
      return `Prenesenie daňovej povinnosti – § ${par} českého zákona č. 235/2004 Sb. o DPH${popis}. Daň odvedie zákazník.`;
    case "en":
      return `Reverse charge – Section ${par} of Czech VAT Act No. 235/2004 Coll.${popis}. VAT to be paid by the customer.`;
    case "de":
      return `Übergang der Steuerschuld – § ${par} des tschechischen Gesetzes Nr. 235/2004 Slg.${popis}. Die Steuer schuldet der Leistungsempfänger.`;
    case "hu":
      return `Fordított adózás – a 235/2004. sz. cseh áfatörvény ${par}. §-a${popis}. Az adót a vevő fizeti.`;
    default:
      return `Přenesení daňové povinnosti – § ${par} zákona č. 235/2004 Sb., o DPH${popis}. Daň odvede zákazník.`;
  }
}

/** Uložený druh, ak patrí krajine firmy; inak null. */
export function platnyDruhPdp(krajina: "SK" | "CZ" | string, druh: unknown): string | null {
  const d = String(druh ?? "")
    .trim()
    .toLowerCase();
  if (!d) return null;
  if (krajina === "CZ") return (DRUHY_PDP_CZ as readonly string[]).includes(d) ? d : null;
  return (PISMENA_PDP_SK as readonly string[]).includes(d) ? d : null;
}

/**
 * Písmeno § 69 ods. 12 odhadnuté z colných kódov položiek — len keď všetky
 * položky s kódom ukazujú na to isté písmeno. Stavebné práce colný kód nemajú,
 * tie sa musia zvoliť na faktúre.
 */
export function pismenoZColnychKodov(
  polozky: { colny_kod?: string | null }[] | null | undefined,
): DruhPdpSk | null {
  const pismena = new Set<DruhPdpSk>();
  for (const p of polozky ?? []) {
    const k = String(p.colny_kod ?? "").replace(/\D/g, "");
    if (k.length < 4) continue;
    const kap = k.slice(0, 2);
    const pol = k.slice(0, 4);
    if (kap === "10" || kap === "12") pismena.add("f");
    else if (kap === "72" || pol === "7301" || pol === "7308" || pol === "7314") pismena.add("g");
    else if (k.startsWith("851713") || k.startsWith("851714")) pismena.add("h");
    else if (pol === "8542") pismena.add("i");
    else return null;
  }
  return pismena.size === 1 ? [...pismena][0] : null;
}

/**
 * Veta o tuzemskom prenesení pre doklad. `krajina` je krajina dane firmy
 * (SK/CZ). Druh z faktúry má prednosť, potom odhad z colných kódov.
 */
export function vetaTuzemskehoPrenesenia(o: {
  krajina: string | null | undefined;
  druh?: string | null;
  jazyk: unknown;
  polozky?: { colny_kod?: string | null }[] | null;
}): string {
  const j = jazykDokladu(o.jazyk);
  if (o.krajina === "CZ") return vetaCz(platnyDruhPdp("CZ", o.druh) as DruhPdpCz | null, j);
  const p = (platnyDruhPdp("SK", o.druh) as DruhPdpSk | null) ?? pismenoZColnychKodov(o.polozky);
  return vetaSk(p, j);
}

/** Možnosti výberu druhu prenesenia vo formulári faktúry (popisy po slovensky). */
export function moznostiDruhuPdp(
  krajina: string | null | undefined,
): { kod: string; popis: string }[] {
  if (krajina === "CZ")
    return DRUHY_PDP_CZ.map((d) => ({ kod: d, popis: `§ ${d} – ${POPIS_CZ[d].sk}` }));
  return PISMENA_PDP_SK.map((p) => ({ kod: p, popis: `písm. ${p}) – ${POPIS_SK[p].sk}` }));
}

/**
 * Veta o prenesení / oslobodení na doklade — tá istá v PDF aj na verejnom
 * odkaze. Bez prenesenia (ani na položkách) `null`.
 */
export function textPreneseniaDokladu(o: {
  invoice: any;
  company: any;
  items: any[];
  jazyk: JazykDokladu;
}): string | null {
  const { invoice, company, items, jazyk } = o;
  const krajina = krajinaDane(company?.country);
  const t = popisky(jazyk, krajina);
  // Vystavovateľ mimo Slovenska (samofaktúra za dodávateľa z EÚ): odkaz na smernicu.
  const cudziVystavovatel =
    Boolean(invoice.samofakturacia) && String(company?.country ?? "SK").toUpperCase() !== "SK";
  // Česká firma cituje český zákon o DPH (235/2004 Sb.), nie slovenský 222/2004.
  const jeCz = !cudziVystavovatel && krajina === "CZ";
  // Nemecká firma cituje UStG (§ 13b, § 4 Nr. 1a/1b, § 3a Abs. 2).
  const jeDe = !cudziVystavovatel && krajina === "DE";
  const kuDe = jeDe && rezimFirmy(company as FirmaDph).schema === "de_kleinunternehmer";
  // Zmiešaná faktúra: prenesenie len pri niektorých položkách — veta o tuzemskom prenesení.
  const pdpPolozky = !invoice.reverse_charge && (items ?? []).some((x: any) => x.prenesenie);
  // Tuzemské prenesenie s celým ustanovením podľa druhu plnenia.
  const vetaTuzemsko = cudziVystavovatel
    ? t.prenosTuzemsko
    : vetaTuzemskehoPrenesenia({
        krajina,
        druh: invoice.pdp_druh,
        jazyk,
        polozky: pdpPolozky ? items.filter((x: any) => x.prenesenie) : items,
      });
  const typ = invoice.reverse_charge_type;
  if (!invoice.reverse_charge)
    return pdpPolozky ? `${t.polozkyPdp} ${jeDe ? vetyDe(jazyk).tuzemsko : vetaTuzemsko}` : null;
  /*
    Kleinunternehmer oslobodené dodanie do EÚ ani prenesenie podľa § 13b
    neuplatňuje (§ 19 Abs. 1 UStG) — na doklade je len veta § 19. Výnimkou
    je služba podnikateľovi v EÚ: daň tam platí odberateľ.
  */
  if (kuDe)
    return typ === "eu_b2b" && invoice.eu_plnenie === "sluzba" ? vetyDe(jazyk).euSluzba : null;
  if (jeDe) return vetaPreneseniaDe(typ, invoice.eu_plnenie, jazyk) ?? vetyDe(jazyk).tuzemsko;
  if (jeCz)
    return typ === "eu_b2b" || typ === "export"
      ? vetaPreneseniaCz(typ, invoice.eu_plnenie, jazyk)
      : vetaTuzemsko;
  if (typ === "eu_b2b") {
    if (cudziVystavovatel)
      return invoice.eu_plnenie === "sluzba" ? t.prenosEuSluzbaSmernica : t.prenosEuTovarSmernica;
    return invoice.eu_plnenie === "sluzba" ? t.prenosEuSluzba : t.prenosEu;
  }
  if (typ === "export")
    return invoice.eu_plnenie === "sluzba" ? t.prenosMimoEuSluzba : t.prenosVyvoz;
  return vetaTuzemsko;
}
