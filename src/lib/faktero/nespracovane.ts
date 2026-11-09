/*
  Nespracované doklady (ako v Doklado).

  Všetko, čo príde e-mailom alebo sa nahrá, čaká najprv tu. Človek doklad
  otvorí, určí druh (prijatá faktúra, zálohová, dobropis, bloček, iný
  doklad), skontroluje vyťažené údaje, zaúčtuje a „Vytvorí" — až vtedy
  vznikne skutočný doklad v príslušnej sekcii. Kým je doklad tu, nevstupuje
  do DPH, pokladne ani do účtovníctva.

  Čisté funkcie: návrh druhu z vyťaženia, údaje formulára, povinné polia
  a riadky cieľových tabuliek.
*/

import { druhPrijatehoDokladu } from "./zalohova-rozpoznanie";
import { zoradPodlaSadzby } from "./vat-rates";
import { rozpisZVytazenia, type KontextRozpisu } from "./rozpis-dph-vytazeny";
import {
  jeKategoriaDph,
  kategoriaRiadku,
  popisChybRozpisu,
  skontrolujRozpisDph,
  sNesuladomDokladu,
  type KategoriaDph,
  type VysledokKontroly,
} from "./rozpis-dph-kontrola";
import { datum as datumZAi } from "./mail-prijem";
import { aiSOdpoctomZalohy, naUhraduSOdpoctom } from "./odpocet-zalohy-vytazenie";
import { upravIban, upravVs } from "./ostatne-doklady";
import {
  bezZaokruhlenia,
  jePolozkaZaokruhlenia,
  kontrolaSumyBlocku,
  nastavZaokruhlenie,
  zaokruhlenieZPoloziek,
  type KontrolaSumy,
} from "./zaokruhlenie-blocku";

export type DruhNespracovaneho = "faktura" | "zalohova" | "dobropis" | "blocek" | "ostatny";

export const DRUHY_NESPRACOVANYCH: { kluc: DruhNespracovaneho; nazov: string }[] = [
  { kluc: "faktura", nazov: "Prijatá faktúra" },
  { kluc: "zalohova", nazov: "Prijatá zálohová faktúra" },
  { kluc: "dobropis", nazov: "Prijatý dobropis" },
  { kluc: "blocek", nazov: "Bloček / pokladničný doklad" },
  { kluc: "ostatny", nazov: "Iný doklad (zmluva, list, predpis…)" },
];

/**
 * Riadok rozpisu DPH. `vat_category` (od 5. 11. 2026): zdaniteľné, nie je
 * predmetom DPH, oslobodené, prenesenie, na kontrolu — pozri
 * `rozpis-dph-kontrola.ts`. Chýbajúca sa odvodí zo sadzby (`kategoriaRiadku`).
 */
export type RiadokRozpisu = { sadzba: number; zaklad: number; dph: number; vat_category?: KategoriaDph };

export type UdajeNespracovaneho = {
  dodavatel: {
    nazov: string;
    ico: string;
    dic: string;
    icDph: string;
    iban: string;
    ulica: string;
    mesto: string;
    psc: string;
    /** Krajina dodávateľa (kód štátu, napr. SK) — v detaile pod „Zobraziť viac“. */
    krajina?: string;
    /** E-mail dodávateľa. */
    email?: string;
  };
  cislo: string;
  /** Interné číslo dokladu (číslo v účtovníctve) — ide do `pohoda_cislo`. */
  interneCislo?: string;
  /** Dátum prijatia (doručenia) faktúry — prázdne = deň vytvorenia. */
  datumPrijatia?: string;
  vs: string;
  ks?: string;
  ss?: string;
  objednavka?: string;
  dodaciList?: string;
  /** Čo sa fakturuje — do Pohody ide ako text faktúry. */
  popis: string;
  datumVystavenia: string;
  datumDodania: string;
  splatnost: string;
  mena: string;
  rozpis: RiadokRozpisu[];
  celkom: number | null;
  /**
   * Zaokrúhlenie (hotovosť na 5 centov, bez DPH) — samostatný riadok:
   * základ + DPH + zaokrúhlenie = suma. Do bločku ide ako položka
   * „Zaokrúhlenie“ (`zaokruhlenie-blocku.ts`).
   */
  zaokruhlenie?: number | null;
  platba: string;
  kategoria: string;
  opravuje: string;
  jobId: string;
  /** Vozidlo z vozového parku — náklad na auto (PHM, servis, poistka). */
  vehicleId?: string;
  poznamka: string;
  /** Komentár pre ľudí vo firme — ide do `komentar`, do účtovníctva nikdy. */
  komentar?: string;
  /** Iný doklad. */
  ostatny: { druh: string; predmet: string; lehota: string };
  /** Zaúčtovanie — rovnaké kódy ako pri prijatej faktúre. */
  kody: {
    predkontacia: string;
    clenenie: string;
    kv: string;
    stredisko: string;
    cinnost: string;
    rad: string;
    intPoznamka: string;
  };
  polozky: {
    name: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    vat_rate: number | null;
    total: number | null;
    /** Položka v prenesení daňovej povinnosti (§ 69 ods. 12). */
    pdp?: boolean;
    /**
     * Zaúčtovanie položky (ako `PolozkaSKodom` v rozuctovanie.ts) — prázdne =
     * kód hlavičky dokladu. Do prijatej faktúry či bločku sa prenesú v `items`.
     */
    predkontacia?: string | null;
    clenenie?: string | null;
    /** Členenie kontrolného výkazu položky; prázdne = z dokladu. */
    kv?: string | null;
  }[];
  /** Celá faktúra je v prenesení daňovej povinnosti. */
  prenesenie?: boolean;
  /**
   * Položky sú zle vyčítané a nemajú sa použiť — doklad ide do účtovníctva
   * len podľa súčtov a rozpisu DPH (ako vypnuté vyťažovanie položiek v Doklado).
   */
  polozkyVypnute?: boolean;
  /**
   * Polia doplnené učením z opráv (pole → doplnená hodnota), pozri
   * `ucenie-z-oprav.ts`. Kým sa hodnota v poli rovná tejto, web pri ňom
   * ukazuje „naučené"; po zmene ju človek prevzal za svoju.
   */
  naucene?: Record<string, string>;
  /**
   * Nepotvrdený návrh zaúčtovania od AI (pole → hodnota), pozri
   * `ai-predkontacia.ts`. Kým ho človek nepotvrdí, do dokladu nejde.
   */
  navrhAi?: Record<string, string>;
  /** Krátke zdôvodnenie návrhu AI („telekomunikačné služby → 518"). */
  navrhAiDovod?: string;
  /**
   * Pravidlo automatického účtovania, ktoré doklad zaúčtovalo (doplnené samo podľa
   * dodávateľa, alebo vybrané človekom). Vytvorený doklad ho dostane ako
   * `pravidlo_id` — spúšťač potom iné pravidlo nepoužije.
   */
  pravidloId?: string;
  /** Polia vyplnené pravidlom (pole → hodnota) — kým sa nezmenia, svieti pri nich hviezdička. */
  zPravidla?: Record<string, string>;
  /**
   * Rozpis DPH z vyťaženia neprešiel kontrolou (`rozpis-dph-kontrola.ts`):
   * sumy dokladu, voči ktorým sa kontroluje, a dôvod. Kým tu je, formulár
   * ukazuje upozornenie a vytvorený doklad ide „na kontrolu“. Zmaže sa, keď
   * človek rozpis opraví alebo potvrdí, že je správny.
   */
  kontrolaDph?: { bezDph: number; dph: number; dovod: string };
  /** Človek potvrdil „Rozpis je správny“ — kontrola rozpisu ho už nezastaví. Zmena rozpisu ho zruší. */
  rozpisPotvrdeny?: boolean;
  /**
   * Suma spolu vytlačená na doklade (z vyťaženia alebo ručne zadaná). Na rozdiel
   * od `celkom` sa zmenou rozpisu nezmaže — formulár podľa nej hlási, keď
   * základ + DPH podľa sadzieb nesedí s dokladom (`nesuladSDokladom`).
   */
  celkomDokladu?: number | null;
  /** Faktúra je už zaplatená — vytvorí sa ako uhradená. */
  uhradene?: boolean;
  /**
   * Zaplatená nezdanená záloha, ktorú dodávateľ na faktúre odpočítal (BT-113
   * z eFaktúry). Celková suma ostáva s DPH, na úhradu je len zvyšok.
   */
  zaloha?: number;
  /**
   * Číslo zálohovej faktúry, ktorú odpočet zúčtováva („Záloh. fak. č.
   * 20260037“) — podľa neho sa pri vytvorení dohľadá `advance_invoice_id`.
   */
  zalohaCislo?: string;
  /**
   * Odpočet zdanenej zálohy (daňový doklad k prijatej platbe), ako ho
   * prečítalo vyťaženie. Už je v rozpise DPH, v sume aj v položkách (záporný
   * riadok) — tu je len na zobrazenie, do úhrady sa druhýkrát nepočíta.
   */
  zalohaZdanena?: { suma: number; zaklad: number; dph: number; sadzba: number | null; cislo?: string };
  /**
   * Nastavenie zo skenera v appke (úhrada, kategória, zákazka, predkontácia,
   * komentár). Uloží sa pri nahratí, aby platilo aj pre doklad, ktorý človek
   * nechá v Nespracovaných a dokončí na webe.
   */
  predvolby?: PredvolbySkenu;
};

/** Nastavenie dokladu zo skenera — rovnaké polia ako `NastavenieSkenu` v appke. */
export type PredvolbySkenu = {
  uhrada?: string;
  kategoria?: string;
  zakazka?: string;
  predkontacia?: string;
  poznamka?: string;
};

const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const t = (v: unknown, max = 255) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
/** Dátum z vyťaženia — prijme aj „15.10.2026" či „15/10/2026", nielen RRRR-MM-DD. */
const datum = (v: unknown): string => datumZAi(typeof v === "string" ? v : "") ?? "";

/** Prázdne údaje formulára. */
export function prazdneUdaje(): UdajeNespracovaneho {
  return {
    dodavatel: { nazov: "", ico: "", dic: "", icDph: "", iban: "", ulica: "", mesto: "", psc: "" },
    cislo: "",
    vs: "",
    popis: "",
    datumVystavenia: "",
    datumDodania: "",
    splatnost: "",
    mena: "EUR",
    rozpis: [],
    celkom: null,
    platba: "",
    kategoria: "",
    opravuje: "",
    jobId: "",
    vehicleId: "",
    poznamka: "",
    komentar: "",
    ostatny: { druh: "ine", predmet: "", lehota: "" },
    kody: { predkontacia: "", clenenie: "", kv: "", stredisko: "", cinnost: "", rad: "", intPoznamka: "" },
    polozky: [],
  };
}

/** Zlúči uložené údaje s prázdnou kostrou — staršie riadky nemusia mať všetky polia. */
export function nacitajUdaje(v: unknown): UdajeNespracovaneho {
  const z = prazdneUdaje();
  const u = (v && typeof v === "object" ? v : {}) as Partial<UdajeNespracovaneho>;
  return {
    ...z,
    ...u,
    dodavatel: { ...z.dodavatel, ...(u.dodavatel ?? {}) },
    ostatny: { ...z.ostatny, ...(u.ostatny ?? {}) },
    kody: { ...z.kody, ...(u.kody ?? {}) },
    rozpis: Array.isArray(u.rozpis) ? zoradPodlaSadzby(u.rozpis, "sadzba") : [],
    ...zaokruhlenieOddelene(Array.isArray(u.polozky) ? u.polozky : [], u.zaokruhlenie),
  };
}

/**
 * Položka „Zaokrúhlenie“ (z bločku, z čítania) sa vyberie zo zoznamu položiek
 * do vlastného riadku — inak by bola položkou v sadzbe 0 %.
 */
function zaokruhlenieOddelene(
  polozky: UdajeNespracovaneho["polozky"],
  zaokruhlenie: number | null | undefined,
): { polozky: UdajeNespracovaneho["polozky"]; zaokruhlenie?: number | null } {
  if (!polozky.some((p) => jePolozkaZaokruhlenia(p))) return zaokruhlenie == null ? { polozky } : { polozky, zaokruhlenie };
  const zPoloziek = zaokruhlenieZPoloziek(polozky);
  return { polozky: bezZaokruhlenia(polozky), zaokruhlenie: zaokruhlenie ?? zPoloziek };
}

/** Druh dokladu podľa toho, čo prečítala AI; človek ho môže zmeniť. */
export function navrhDruhu(ai: Record<string, unknown> | null | undefined, nazovSuboru?: string | null): DruhNespracovaneho {
  if (!ai) return "faktura";
  if (ai.document_type === "ostatny") return "ostatny";
  const pod = String(ai.document_subtype ?? "").toLowerCase();
  if (pod === "blocek") return "blocek";
  if (pod === "dobropis" || (num(ai.amount_total) ?? 0) < 0) return "dobropis";
  const typ = druhPrijatehoDokladu({
    druhOdAi: ai.document_subtype,
    nazovDokladu: ai.document_title,
    cisloDokladu: ai.invoice_number,
    nazovSuboru,
  });
  return typ === "proforma" ? "zalohova" : "faktura";
}

/**
 * Rozpis DPH z vyťaženia — tabuľka rozpisu z dokladu, inak položky po
 * sadzbách, inak jedna sadzba, pri ktorej daň naozaj vychádza. Celá logika
 * a kontrola je v `rozpis-dph-vytazeny.ts`.
 */
export function rozpisZAi(
  ai: Record<string, unknown> | null | undefined,
  kontext: KontextRozpisu = {},
): RiadokRozpisu[] {
  return rozpisZVytazenia(ai, kontext).rozpis;
}

/**
 * Variabilný symbol: čo je na doklade (bez medzier, najviac 10 číslic), inak
 * číslo faktúry, keď je celé z číslic — tak to robí väčšina slovenských
 * dodávateľov a bez VS sa platba s faktúrou nespáruje.
 */
export function vsDokladu(vs: unknown, cislo: string): string {
  const z = t(vs, 40).replace(/\s/g, "").replace(/^VS:?/i, "");
  if (/^\d{1,10}$/.test(z)) return z;
  if (z) return z.slice(0, 20);
  const c = cislo.replace(/\s/g, "");
  return /^\d{1,10}$/.test(c) ? c : "";
}

/**
 * Doplní do už vyplnených údajov to, čo v nich chýba (VS, IBAN, splatnosť,
 * adresa, popis…), z nového vyťaženia. Vyplnené sa neprepisuje — napríklad
 * údaje z bločkového čítania, ktoré si človek mohol už opraviť.
 */
export function doplnUdaje(povodne: UdajeNespracovaneho, nove: UdajeNespracovaneho): UdajeNespracovaneho {
  const u = { ...povodne, dodavatel: { ...povodne.dodavatel } };
  for (const k of [...new Set([...Object.keys(u.dodavatel), ...Object.keys(nove.dodavatel)])] as (keyof UdajeNespracovaneho["dodavatel"])[])
    if (!u.dodavatel[k] && nove.dodavatel[k]) u.dodavatel[k] = nove.dodavatel[k];
  for (const k of ["cislo", "popis", "splatnost", "datumVystavenia", "datumDodania", "ks", "ss", "objednavka", "dodaciList"] as const)
    if (!u[k] && nove[k]) u[k] = nove[k];
  if (!u.vs) u.vs = nove.vs || vsDokladu(null, u.cislo);
  if (!u.rozpis.length && nove.rozpis.length) {
    u.rozpis = nove.rozpis;
    if (nove.kontrolaDph) u.kontrolaDph = nove.kontrolaDph;
  }
  if (u.celkom == null && nove.celkom != null) u.celkom = nove.celkom;
  if (u.celkomDokladu == null && nove.celkomDokladu != null) u.celkomDokladu = nove.celkomDokladu;
  if (!u.polozky.length && nove.polozky.length) u.polozky = nove.polozky;
  // Odpočet zálohy z nového čítania — len keď ho údaje ešte nemajú a suma ostala z rovnakého čítania.
  if (u.zaloha == null && !u.zalohaZdanena && nove.zaloha && u.celkom != null && nove.celkom != null && Math.abs(u.celkom - nove.celkom) < 0.005) {
    u.zaloha = nove.zaloha;
    if (nove.zalohaCislo) u.zalohaCislo = nove.zalohaCislo;
  }
  return u;
}

/** Text o prenesení daňovej povinnosti, ako ho píšu slovenské aj české faktúry. */
const TEXT_PRENESENIA =
  /(prenesenie da[ňn]ovej povinnosti|§\s*69\s*ods\.?\s*12|reverse\s*charge|da[ňn] odvedie odberate[ľl]|p[řr]enesen[íi] da[ňn]ov[ée] povinnosti|§\s*92a)/i;

/**
 * Prenesenie na celej faktúre: AI to povie príznakom, vetou z dokladu, alebo
 * sú v prenesení všetky položky. Na samotný príznak sa nedalo spoľahnúť —
 * pri prvom čítaní ho AI často vynechala a chytilo sa až „Čítať znova“.
 */
export function jePrenesenieZAi(
  ai: Record<string, unknown>,
  polozky: { pdp?: boolean }[] = [],
): boolean {
  if (ai.reverse_charge === true) return true;
  if (typeof ai.reverse_charge_text === "string" && TEXT_PRENESENIA.test(ai.reverse_charge_text)) return true;
  return polozky.length > 0 && polozky.every((p) => p.pdp === true);
}

/** Údaje formulára predvyplnené z vyťaženia. */
export function udajeZAi(
  ai: Record<string, unknown> | null | undefined,
  dnes: string,
  /** Krajina firmy — podľa nej sa overujú sadzby rozpisu DPH. */
  kontext: { krajina?: string | null } = {},
): UdajeNespracovaneho {
  const u = prazdneUdaje();
  if (!ai) return u;
  /*
    Odpočet zálohy („Predplatba: Záloh. fak. č. … −900,00“): nezdanená ide
    do `zaloha`, zdanená zníži rozpis aj sumu a pribudne ako záporná položka
    (`odpocet-zalohy-vytazenie.ts`). Ďalej sa pracuje s upraveným výstupom.
  */
  const zOdpoctu = aiSOdpoctomZalohy(ai);
  ai = zOdpoctu.ai;
  const odpocet = zOdpoctu.odpocet;
  if (odpocet && !odpocet.zdanena) {
    u.zaloha = odpocet.suma;
    if (odpocet.cislo) u.zalohaCislo = odpocet.cislo;
  } else if (odpocet?.zdanena) {
    u.zalohaZdanena = {
      suma: odpocet.suma,
      zaklad: odpocet.zaklad,
      dph: odpocet.dph,
      sadzba: odpocet.sadzba,
      ...(odpocet.cislo ? { cislo: odpocet.cislo } : {}),
    };
  }
  const vystavenie = datum(ai.issue_date);
  u.dodavatel = {
    nazov: t(ai.supplier_name, 200),
    ico: t(ai.supplier_ico, 20).replace(/\s/g, ""),
    dic: t(ai.supplier_dic, 20),
    icDph: t(ai.supplier_ic_dph, 20).replace(/\s/g, "").toUpperCase(),
    iban: t(ai.supplier_iban, 40).replace(/\s/g, "").toUpperCase(),
    ulica: t(ai.supplier_street, 120),
    mesto: t(ai.supplier_city, 80),
    psc: t(ai.supplier_zip, 15),
    krajina: t(ai.supplier_country, 2).toUpperCase(),
    email: t(ai.supplier_email, 120),
  };
  u.cislo = t(ai.invoice_number, 60);
  u.popis = t(ai.description, 240);
  u.vs = vsDokladu(ai.variable_symbol, u.cislo);
  u.ks = t(ai.constant_symbol, 4).replace(/\D/g, "");
  u.ss = t(ai.specific_symbol, 10).replace(/\D/g, "");
  u.objednavka = t(ai.order_number, 40);
  u.dodaciList = t(ai.delivery_note_number, 40);
  u.datumVystavenia = vystavenie || dnes;
  // Dátum dodania (vzniku daňovej povinnosti) — predtým sa brával vždy dátum vystavenia.
  u.datumDodania = datum(ai.delivery_date) || vystavenie || dnes;
  u.splatnost = datum(ai.due_date) || datum(ai.other_due_date);
  u.mena = (t(ai.currency, 3) || "EUR").toUpperCase();
  const vytazeny = rozpisZVytazenia(ai, { krajina: kontext.krajina, datumDodania: u.datumDodania || null });
  u.rozpis = vytazeny.rozpis;
  // Rozpis nesedí so sumami či sadzbami dokladu — doklad čaká na kontrolu človekom.
  if (!vytazeny.kontrola.ok && vytazeny.sumy)
    u.kontrolaDph = {
      bezDph: vytazeny.sumy.bezDph,
      dph: vytazeny.sumy.dph,
      dovod: popisChybRozpisu(vytazeny.kontrola),
    };
  const spolu = num(ai.amount_total);
  u.celkom = spolu === null ? null : Math.abs(spolu);
  u.celkomDokladu = u.celkom;
  u.polozky = (Array.isArray(ai.items) ? (ai.items as any[]) : [])
    .filter((p) => t(p?.name))
    .map((p) => ({
      name: t(p.name, 200),
      quantity: num(p.quantity),
      unit: t(p.unit, 10) || null,
      unit_price: num(p.unit_price),
      vat_rate: num(p.vat_rate),
      total: num(p.total),
      ...(p.reverse_charge === true ? { pdp: true } : {}),
    }));
  // Zaokrúhlenie z bločku ide do vlastného riadku, nie medzi položky.
  if (u.polozky.some((p) => jePolozkaZaokruhlenia(p))) {
    u.zaokruhlenie = zaokruhlenieZPoloziek(u.polozky);
    u.polozky = bezZaokruhlenia(u.polozky);
  } else {
    const z = num(ai.rounding);
    if (z && Math.abs(z) <= 0.05) u.zaokruhlenie = r2(z);
  }
  u.prenesenie = jePrenesenieZAi(ai, u.polozky) || vytazeny.prenesenie;
  /*
    Sumy vyťažené v domácej mene, ceny položiek v inej (uprednostnená domáca
    mena, pozri `vytazenie-mena.ts`): položky by so sumami nesedeli — doklad
    ide podľa súčtov a položky sa dajú pri doklade zapnúť.
  */
  const menaPoloziek = t(ai.items_currency, 3).toUpperCase();
  if (u.polozky.length && /^[A-Z]{3}$/.test(menaPoloziek) && menaPoloziek !== u.mena) u.polozkyVypnute = true;
  // Spôsob platby z bločku („KARTA“, „HOTOVOSŤ“) — bez neho sa bloček neuloží.
  const platba = t(ai.payment_method, 10).toLowerCase();
  if (platba === "hotovost" || platba === "karta" || platba === "prevod") u.platba = platba;
  /*
    Bloček v hotovosti, na ktorom čítanie zaokrúhlenie neuviedlo: rozdiel
    sumy oproti základu s DPH do 2 centov je zaokrúhlenie na 5 centov.
  */
  if (u.zaokruhlenie == null && u.platba === "hotovost" && u.celkom != null && u.rozpis.length) {
    const s = sucty({ ...u, celkom: null });
    const rozdiel = r2(u.celkom - s.zaklad - s.dph);
    if (rozdiel && Math.abs(rozdiel) <= 0.02) u.zaokruhlenie = rozdiel;
  }
  u.ostatny = {
    druh: t(ai.other_kind, 30) || "ine",
    predmet: t(ai.other_subject, 500),
    lehota: datum(ai.other_due_date),
  };
  u.poznamka = t(ai.summary, 1000);
  return u;
}

/**
 * Kontrola rozpisu DPH vo formulári: každý riadok (daň = základ × sadzba,
 * sadzba platná v deň dodania) a — kým čaká kontrola z vyťaženia — súčty
 * voči sumám vytlačeným na doklade. Bez nej sa porovnáva len so súčtami
 * samotného rozpisu, ktoré sedia vždy.
 */
export function kontrolaRozpisuUdajov(
  u: Pick<UdajeNespracovaneho, "rozpis" | "kontrolaDph" | "rozpisPotvrdeny" | "datumDodania" | "datumVystavenia">,
  krajina?: string | null,
): VysledokKontroly {
  if (!u.rozpis?.length || u.rozpisPotvrdeny) return { ok: true, chyby: [] };
  const vlastne = {
    bezDph: r2(u.rozpis.reduce((a, r) => a + (Number(r.zaklad) || 0), 0)),
    dph: r2(u.rozpis.reduce((a, r) => a + (Number(r.dph) || 0), 0)),
  };
  return skontrolujRozpisDph(
    u.rozpis.map((r) => ({
      rate: Number(r.sadzba) || 0,
      base: Number(r.zaklad) || 0,
      vat: Number(r.dph) || 0,
      vat_category: r.vat_category ?? null,
    })),
    u.kontrolaDph ? { bezDph: u.kontrolaDph.bezDph, dph: u.kontrolaDph.dph } : vlastne,
    { krajina: krajina ?? "SK", datumDodania: u.datumDodania || u.datumVystavenia || null },
  );
}

/**
 * Suma dokladu pri zmene údajov vo formulári: zmena rozpisu nastaví `celkom`
 * na null (prepočíta sa), no suma z dokladu ostáva v `celkomDokladu` — podľa
 * nej sa hlási nesúlad sadzieb. Ručne prepísaná suma spolu je nová suma
 * dokladu a ruší potvrdenie rozpisu.
 */
export function upravCelkomDokladu(
  pred: UdajeNespracovaneho | null,
  po: UdajeNespracovaneho,
): UdajeNespracovaneho {
  if (!pred) return po.celkomDokladu == null && po.celkom != null ? { ...po, celkomDokladu: po.celkom } : po;
  if (po === pred) return po;
  if (po.celkom != null && po.celkom !== pred.celkom)
    return {
      ...po,
      celkomDokladu: Number(po.celkom),
      rozpisPotvrdeny: po.rozpisPotvrdeny && pred.rozpisPotvrdeny ? false : po.rozpisPotvrdeny,
    };
  const doklad = po.celkomDokladu ?? pred.celkomDokladu ?? pred.celkom ?? null;
  return doklad === (po.celkomDokladu ?? null) ? po : { ...po, celkomDokladu: doklad };
}

/**
 * Kontrola rozpisu (`kontrolaRozpisuUdajov`) doplnená o súčet podľa sadzieb
 * voči sume dokladu (`nesuladSDokladom`, 0,01 € na sadzbu). Suma dokladu je
 * `celkomDokladu` (zmenou rozpisu sa nemaže), inak `celkom`; zaokrúhlenie
 * bločku sa z nej odpočíta. Potvrdený rozpis sa nehlási.
 */
export function kontrolaSadziebUdajov(
  u: Pick<
    UdajeNespracovaneho,
    | "rozpis"
    | "kontrolaDph"
    | "rozpisPotvrdeny"
    | "datumDodania"
    | "datumVystavenia"
    | "celkom"
    | "celkomDokladu"
    | "zaokruhlenie"
    | "mena"
    | "platba"
  >,
  krajina?: string | null,
): VysledokKontroly {
  const k = kontrolaRozpisuUdajov(u, krajina);
  if (!u.rozpis?.length || u.rozpisPotvrdeny) return k;
  const doklad = u.celkomDokladu ?? u.celkom;
  if (doklad == null || (doklad as unknown) === "") return k;
  return sNesuladomDokladu(
    k,
    u.rozpis.map((r) => ({
      rate: Number(r.sadzba) || 0,
      base: Number(r.zaklad) || 0,
      vat: Number(r.dph) || 0,
      vat_category: r.vat_category ?? null,
    })),
    r2(Math.abs(Number(doklad)) - (Number(u.zaokruhlenie) || 0)),
    u.mena,
    u.platba === "hotovost",
  );
}

/**
 * Opravil človek v Nespracovaných rozpis DPH oproti vyťaženiu? Porovná sa
 * rozpis a súčty so stavom, aký by dalo samotné `udajeZAi(ai)` — vytvorený
 * doklad potom nesie `rucne_upravene_at` a opravný skript ho neprepíše.
 */
export function rozpisUpravenyClovekom(
  u: Pick<UdajeNespracovaneho, "rozpis">,
  ai: Record<string, unknown> | null | undefined,
  dnes: string,
  krajina?: string | null,
): boolean {
  if (!ai) return u.rozpis.length > 0;
  const povodny = udajeZAi(ai, dnes, { krajina }).rozpis;
  const kluc = (r: RiadokRozpisu[]) =>
    JSON.stringify(
      zoradPodlaSadzby(r, "sadzba").map((x) => [
        Number(x.sadzba) || 0,
        r2(Math.abs(Number(x.zaklad) || 0)),
        r2(Math.abs(Number(x.dph) || 0)),
        kategoriaRiadku({ rate: x.sadzba, vat_category: x.vat_category }),
      ]),
    );
  return kluc(u.rozpis) !== kluc(povodny);
}

/** Súčty rozpisu (kladné). */
export function sucty(u: UdajeNespracovaneho): { zaklad: number; dph: number; celkom: number } {
  const zaklad = r2(u.rozpis.reduce((a, r) => a + (Number(r.zaklad) || 0), 0));
  const dph = r2(u.rozpis.reduce((a, r) => a + (Number(r.dph) || 0), 0));
  const celkom =
    u.celkom != null && u.celkom !== ("" as unknown) ? r2(Number(u.celkom)) : r2(zaklad + dph + (Number(u.zaokruhlenie) || 0));
  return { zaklad, dph, celkom };
}

/**
 * Sedí základ + DPH + zaokrúhlenie so sumou dokladu? Pri ručne prepísanej
 * sume ukáže rozdiel; doklad sa bez potvrdenia nevytvorí.
 */
export function kontrolaSumy(u: UdajeNespracovaneho): KontrolaSumy {
  const s = sucty(u);
  return kontrolaSumyBlocku({
    celkom: u.celkom == null ? null : s.celkom,
    zaklad: s.zaklad,
    dph: s.dph,
    zaokruhlenie: u.zaokruhlenie,
    platba: u.platba,
  });
}

/** Názov vyrovnávacej položky — podľa neho ju export spozná. */
export const VYROVNAVACIA_POLOZKA = "Vyrovnanie centového rozdielu";

/**
 * Nesúlad položiek so súčtom dokladu. Položky z čítania bývajú raz s DPH,
 * raz bez — sedí, keď sa súčet položiek rovná sume s DPH alebo základu.
 * Vráti `null`, keď sedí (alebo položky nie sú), inak rozdiel oproti sume
 * s DPH, ktorý treba doplniť vyrovnávacou položkou.
 */
export function rozdielPoloziek(
  u: UdajeNespracovaneho,
): { sucet: number; rozdiel: number; netto: boolean } | null {
  // Vypnuté položky sa nekontrolujú — účtuje sa podľa súčtov.
  if (u.polozkyVypnute) return null;
  const p = u.polozky.filter((x) => x.name?.trim());
  if (!p.length) return null;
  const sucet = r2(
    p.reduce((a, x) => a + (x.total != null ? Number(x.total) : (Number(x.quantity) || 1) * Number(x.unit_price ?? 0)), 0),
  );
  const s = sucty(u);
  if (!s.celkom) return null;
  // Zaokrúhlenie je vlastný riadok — položky sa porovnávajú so sumou pred ním.
  const celkom = r2(s.celkom - (Number(u.zaokruhlenie) || 0));
  if (Math.abs(sucet - celkom) < 0.005) return null;
  if (s.zaklad && Math.abs(sucet - s.zaklad) < 0.005) return null;
  // Bližšie k základu = položky sú bez DPH, rozdiel sa ráta voči základu.
  const netto = s.zaklad > 0 && Math.abs(sucet - s.zaklad) < Math.abs(sucet - celkom);
  return { sucet, rozdiel: r2((netto ? s.zaklad : celkom) - sucet), netto };
}

/** Doplní vyrovnávaciu položku tak, aby súčet položiek sedel s dokladom. */
export function vyrovnajPolozky(u: UdajeNespracovaneho): UdajeNespracovaneho {
  const r = rozdielPoloziek(u);
  if (!r) return u;
  const ina = u.polozky.filter((x) => x.name !== VYROVNAVACIA_POLOZKA);
  const stara = u.polozky.find((x) => x.name === VYROVNAVACIA_POLOZKA);
  const suma = r2((stara?.total != null ? Number(stara.total) : 0) + r.rozdiel);
  return {
    ...u,
    polozky: suma
      ? [...ina, { name: VYROVNAVACIA_POLOZKA, quantity: 1, unit: null, unit_price: suma, vat_rate: 0, total: suma }]
      : ina,
  };
}

/** Kontroly, ktoré si firma nastavuje (Nespracované doklady v nastaveniach predkontácií). */
export type VolbyKontroly = {
  /** Odchýlka položiek od sumy v centoch, ktorá doklad nezastaví. */
  toleranciaCenty?: number;
  /** `false` = splatnosť pred vystavením doklad nezastaví. */
  kontrolaSplatnosti?: boolean;
};

/**
 * Rozdiel položiek, ktorý doklad nezastaví: pri hotovosti zaokrúhlenie na
 * 5 centov (do 2 centov), inak tolerancia firmy. Doklad sa dá vytvoriť a
 * rozdiel doplní vyrovnávacia položka.
 */
export function rozdielVTolerancii(u: UdajeNespracovaneho, volby: VolbyKontroly = {}): boolean {
  const r = rozdielPoloziek(u);
  if (!r) return false;
  const tol = Math.max(u.platba === "hotovost" ? 0.02 : 0, (Number(volby.toleranciaCenty) || 0) / 100);
  return Math.abs(r.rozdiel) <= tol + 0.0001;
}

/** Povinné polia, ktoré chýbajú — zvýraznia sa červenou, bez nich sa doklad nevytvorí. */
export function chybajuce(
  druh: DruhNespracovaneho | null,
  u: UdajeNespracovaneho,
  /** Polia, ktoré firma vyžaduje: zakazka, stredisko, cinnost. */
  povinne: string[] = [],
  volby: VolbyKontroly = {},
): string[] {
  const out: string[] = [];
  if (!druh) return ["druh"];
  if (druh === "ostatny") return out;
  if (!u.dodavatel.nazov.trim()) out.push("dodavatel");
  if (!u.datumVystavenia) out.push("datumVystavenia");
  const s = sucty(u);
  if (!s.celkom) out.push("celkom");
  if (druh === "blocek") {
    if (!u.platba) out.push("platba");
  } else {
    if (!u.cislo.trim()) out.push("cislo");
    if (!u.splatnost) out.push("splatnost");
    if (druh === "dobropis" && !u.opravuje.trim()) out.push("opravuje");
    // Splatnosť pred vystavením je takmer vždy preklep v dátume (rok, mesiac).
    if (volby.kontrolaSplatnosti !== false && u.splatnost && u.datumVystavenia && u.splatnost < u.datumVystavenia)
      out.push("splatnostPred");
  }
  if (povinne.includes("zakazka") && !u.jobId.trim()) out.push("zakazka");
  if (povinne.includes("stredisko") && !u.kody.stredisko.trim()) out.push("stredisko");
  if (povinne.includes("cinnost") && !u.kody.cinnost.trim()) out.push("cinnost");
  // Položky musia sedieť so sumou; malý rozdiel (zaokrúhlenie, tolerancia firmy) doplní vyrovnávacia položka.
  if (rozdielPoloziek(u) && !rozdielVTolerancii(u, volby)) out.push("polozky");
  return out;
}

/** Popisy povinných polí pre hlášku. */
export const NAZVY_POLI: Record<string, string> = {
  druh: "druh dokladu",
  dodavatel: "dodávateľ",
  datumVystavenia: "dátum vystavenia",
  celkom: "suma",
  platba: "spôsob úhrady",
  cislo: "číslo dokladu",
  splatnost: "splatnosť",
  opravuje: "číslo opravovanej faktúry",
  polozky: "súlad položiek so sumou (pridajte vyrovnávaciu položku)",
  splatnostPred: "splatnosť (je skôr ako dátum vystavenia)",
  zakazka: "zákazka",
  stredisko: "stredisko",
  cinnost: "činnosť",
};

const prazdne = (v: string) => (v.trim() ? v.trim() : null);

/**
 * Položky na zápis do dokladu: kódy zaúčtovania orezané, prázdne vynechané —
 * položka bez kódu tak dedí kód hlavičky (`rozuctovaniePolozkami`), aj keď ho
 * neskôr doplní pravidlo, autopilot alebo človek v detaile dokladu.
 */
export function polozkyNaZapis(polozky: UdajeNespracovaneho["polozky"]): UdajeNespracovaneho["polozky"] {
  return polozky.map((p) => {
    const { predkontacia, clenenie, kv, ...zvysok } = p;
    const out: UdajeNespracovaneho["polozky"][number] = { ...zvysok };
    const pk = String(predkontacia ?? "").trim().slice(0, 30);
    const cl = String(clenenie ?? "").trim().slice(0, 30);
    const k = String(kv ?? "").trim().slice(0, 10);
    if (pk) out.predkontacia = pk;
    if (cl) out.clenenie = cl;
    if (k) out.kv = k;
    return out;
  });
}

/** Má každá použitá položka vlastnú predkontáciu? Vtedy je doklad zaúčtovaný aj bez kódu v hlavičke. */
export function polozkyZauctovane(u: UdajeNespracovaneho): boolean {
  if (u.polozkyVypnute) return false;
  const p = u.polozky.filter((x) => x.name?.trim());
  return p.length > 0 && p.every((x) => String(x.predkontacia ?? "").trim());
}

/** Údaje formulára z prijatej faktúry — pri vrátení do Nespracovaných. */
export function udajeZPrijatej(p: Record<string, any>): { druh: DruhNespracovaneho; udaje: UdajeNespracovaneho } {
  const u = prazdneUdaje();
  const s = (v: unknown) => (v == null ? "" : String(v));
  u.dodavatel = {
    nazov: s(p.supplier_name),
    ico: s(p.supplier_ico),
    dic: s(p.supplier_dic),
    icDph: s(p.supplier_ic_dph),
    iban: s(p.supplier_iban),
    ulica: s(p.supplier_street),
    mesto: s(p.supplier_city),
    psc: s(p.supplier_zip),
    krajina: s(p.supplier_country),
    email: s(p.supplier_email),
  };
  u.cislo = s(p.invoice_number);
  u.interneCislo = s(p.pohoda_cislo);
  u.datumPrijatia = s(p.received_date);
  u.vs = s(p.variable_symbol);
  u.ks = s(p.constant_symbol);
  u.ss = s(p.specific_symbol);
  u.objednavka = s(p.order_number);
  u.dodaciList = s(p.delivery_note_number);
  u.popis = s(p.intro_note);
  u.datumVystavenia = s(p.issue_date);
  u.datumDodania = s(p.delivery_date || p.issue_date);
  u.splatnost = s(p.due_date);
  u.mena = s(p.currency) || "EUR";
  const zaklad = Math.abs(Number(p.amount_without_vat ?? 0));
  const dph = Math.abs(Number(p.vat_amount ?? 0));
  const rozpis = Array.isArray(p.vat_breakdown) ? p.vat_breakdown : null;
  // Dobropis je v DB záporný celý — otočí sa; záporný riadok kladnej faktúry (odpočet) ostane záporný.
  const znDokladu = Number(p.amount_total ?? 0) < 0 ? -1 : 1;
  u.rozpis = rozpis?.length
    ? zoradPodlaSadzby(
        rozpis.map((r: any) => ({
          sadzba: Number(r.sadzba) || 0,
          zaklad: znDokladu * (Number(r.zaklad) || 0),
          dph: znDokladu * (Number(r.dph) || 0),
          ...(jeKategoriaDph(r.vat_category) ? { vat_category: r.vat_category } : {}),
        })),
        "sadzba",
      )
    : zaklad || dph
      ? // Sadzba sa nedopočítava z pomeru — len povolená, pri ktorej daň sedí, inak na kontrolu.
        rozpisZVytazenia({
          amount_without_vat: zaklad,
          vat_amount: dph,
          items: p.items,
          supplier_ic_dph: p.supplier_ic_dph,
          reverse_charge: p.reverse_charge === true,
          delivery_date: p.delivery_date || p.issue_date,
        }).rozpis
      : [];
  u.celkom = p.amount_total != null ? Math.abs(Number(p.amount_total)) : null;
  u.platba = s(p.payment_method);
  u.kategoria = s(p.category);
  u.poznamka = s(p.note);
  u.komentar = s(p.komentar);
  u.polozky = Array.isArray(p.items) && p.items.length ? p.items : Array.isArray(p.polozky_vypnute) ? p.polozky_vypnute : [];
  u.polozkyVypnute = !(Array.isArray(p.items) && p.items.length) && Array.isArray(p.polozky_vypnute) && p.polozky_vypnute.length > 0;
  u.opravuje = s(p.opravuje_cislo);
  if (Number(p.advance_amount ?? 0) > 0) u.zaloha = Math.abs(Number(p.advance_amount));
  u.jobId = s(p.job_id);
  u.vehicleId = s(p.vehicle_id);
  u.prenesenie = p.reverse_charge === true && p.dph_rezim === "samozdanenie" ? true : undefined;
  u.kody = {
    predkontacia: s(p.pohoda_predkontacia),
    clenenie: s(p.pohoda_clenenie_dph),
    kv: s(p.kv_clenenie),
    stredisko: s(p.stredisko),
    cinnost: s(p.cinnost),
    rad: s(p.pohoda_rad),
    intPoznamka: s(p.int_poznamka),
  };
  const druh: DruhNespracovaneho =
    p.type === "proforma" ? "zalohova" : p.opravuje_cislo || Number(p.amount_total ?? 0) < 0 ? "dobropis" : "faktura";
  return { druh, udaje: u };
}

/** Riadok `purchase_invoices` z údajov (faktúra, zálohová, dobropis). */
export function prijataZUdajov(
  druh: "faktura" | "zalohova" | "dobropis",
  u: UdajeNespracovaneho,
  dnes: string,
) {
  const s = sucty(u);
  const zn = druh === "dobropis" ? -1 : 1;
  /*
    Riadky rozpisu sú kladné; záporný riadok medzi kladnými (odpočet zdanenej
    zálohy, zľava v sadzbe) odpočítava a znamienko si nechá. Celý záporný
    rozpis (staršie zápisy dobropisu) sa berie ako kladný.
  */
  const znRozpisu = u.rozpis.length && u.rozpis.every((x) => Number(x.zaklad) <= 0 && Number(x.dph) <= 0) ? -1 : 1;
  return {
    supplier_name: u.dodavatel.nazov.trim() || "Neurčený dodávateľ",
    supplier_ico: prazdne(u.dodavatel.ico),
    supplier_dic: prazdne(u.dodavatel.dic),
    supplier_ic_dph: prazdne(u.dodavatel.icDph),
    supplier_iban: prazdne(u.dodavatel.iban.replace(/\s/g, "").toUpperCase()),
    supplier_street: prazdne(u.dodavatel.ulica),
    supplier_city: prazdne(u.dodavatel.mesto),
    supplier_zip: prazdne(u.dodavatel.psc),
    supplier_country: prazdne(u.dodavatel.krajina ?? "")?.toUpperCase().slice(0, 2) ?? null,
    supplier_email: prazdne(u.dodavatel.email ?? ""),
    invoice_number: u.cislo.trim() || "bez čísla",
    pohoda_cislo: prazdne(u.interneCislo ?? ""),
    variable_symbol: prazdne(u.vs),
    constant_symbol: prazdne(u.ks ?? ""),
    specific_symbol: prazdne(u.ss ?? ""),
    order_number: prazdne(u.objednavka ?? ""),
    delivery_note_number: prazdne(u.dodaciList ?? ""),
    issue_date: u.datumVystavenia || dnes,
    delivery_date: u.datumDodania || u.datumVystavenia || dnes,
    due_date: u.splatnost || u.datumVystavenia || dnes,
    received_date: u.datumPrijatia || dnes,
    amount_without_vat: r2(zn * s.zaklad),
    vat_amount: r2(zn * s.dph),
    amount_total: r2(zn * s.celkom),
    /*
      Rozpis DPH po sadzbách tak, ako ho človek skontroloval — bez neho by
      faktúra bez položiek padla na jednu sadzbu dopočítanú z pomeru DPH
      a základu (0 % + 23 % → „19 %“). Dobropis so znamienkom dokladu.
    */
    vat_breakdown: u.rozpis.length
      ? zoradPodlaSadzby(u.rozpis, "sadzba").map((x) => ({
          sadzba: Number(x.sadzba) || 0,
          zaklad: r2(zn * znRozpisu * (Number(x.zaklad) || 0)) || 0,
          dph: r2(zn * znRozpisu * (Number(x.dph) || 0)) || 0,
          vat_category: kategoriaRiadku({ rate: x.sadzba, vat_category: x.vat_category }),
        }))
      : null,
    currency: (u.mena || "EUR").toUpperCase(),
    payment_method: u.platba || "prevod",
    type: druh === "zalohova" ? "proforma" : "regular",
    // Zo zálohovej sa daň neodpočítava.
    odpocet: druh !== "zalohova",
    opravuje_cislo: druh === "dobropis" ? prazdne(u.opravuje) : null,
    // Odpočet zaplatenej zálohy len na faktúre — na úhradu je potom zvyšok.
    advance_amount: druh === "faktura" && Number(u.zaloha ?? 0) > 0 ? r2(Math.min(Number(u.zaloha), s.celkom)) : null,
    intro_note: prazdne(u.popis ?? ""),
    category: prazdne(u.kategoria),
    note: prazdne(u.poznamka),
    // Vypnuté položky sa odložia bokom — účtovanie ani export ich nepoužije, ale dajú sa vrátiť.
    // Kódy položiek idú s položkami (`predkontacia`, `clenenie`, `kv`) — prázdne dedia hlavičku.
    items: u.polozky.length && !u.polozkyVypnute ? polozkyNaZapis(u.polozky) : null,
    polozky_vypnute: u.polozkyVypnute && u.polozky.length ? polozkyNaZapis(u.polozky) : null,
    // Celá faktúra v prenesení: odberateľ daň samozdaní (KV B.1).
    ...(u.prenesenie ? { reverse_charge: true, dph_rezim: "samozdanenie" } : {}),
    job_id: prazdne(u.jobId),
    vehicle_id: prazdne(u.vehicleId ?? ""),
    pohoda_predkontacia: prazdne(u.kody.predkontacia),
    pohoda_clenenie_dph: prazdne(u.kody.clenenie),
    kv_clenenie: prazdne(u.kody.kv),
    stredisko: prazdne(u.kody.stredisko),
    cinnost: prazdne(u.kody.cinnost),
    pohoda_rad: prazdne(u.kody.rad),
    int_poznamka: prazdne(u.kody.intPoznamka),
    komentar: prazdne(u.komentar ?? ""),
  };
}

/** Riadok `expense_documents` z údajov (bloček). */
export function blocekZUdajov(u: UdajeNespracovaneho) {
  const s = sucty(u);
  const sadzby = [...new Set(u.rozpis.map((r) => Number(r.sadzba) || 0))];
  return {
    supplier_name: prazdne(u.dodavatel.nazov),
    supplier_ico: prazdne(u.dodavatel.ico),
    supplier_ic_dph: prazdne(u.dodavatel.icDph),
    document_number: prazdne(u.cislo),
    pohoda_cislo: prazdne(u.interneCislo ?? ""),
    issue_date: u.datumVystavenia || null,
    net_amount: s.zaklad,
    vat_amount: s.dph,
    total_amount: s.celkom,
    vat_rate: sadzby.length === 1 ? sadzby[0] : null,
    vat_breakdown: u.rozpis.length
      ? u.rozpis.map((r) => ({ ...r, vat_category: kategoriaRiadku({ rate: r.sadzba, vat_category: r.vat_category }) }))
      : null,
    currency: (u.mena || "EUR").toUpperCase(),
    payment_method: u.platba || "karta",
    category: prazdne(u.kategoria),
    note: prazdne(u.poznamka),
    items: polozkyBlocku(u),
    job_id: prazdne(u.jobId),
    vehicle_id: prazdne(u.vehicleId ?? ""),
    pohoda_predkontacia: prazdne(u.kody.predkontacia),
    pohoda_clenenie_dph: prazdne(u.kody.clenenie),
    kv_clenenie: prazdne(u.kody.kv),
    stredisko: prazdne(u.kody.stredisko),
    cinnost: prazdne(u.kody.cinnost),
    pohoda_rad: prazdne(u.kody.rad),
    int_poznamka: prazdne(u.kody.intPoznamka),
    komentar: prazdne(u.komentar ?? ""),
  };
}

/** Položky bločku na zápis — zaokrúhlenie ako samostatná položka bez DPH (aj pri vypnutých položkách). */
function polozkyBlocku(u: UdajeNespracovaneho) {
  const ine = u.polozky.length && !u.polozkyVypnute ? polozkyNaZapis(bezZaokruhlenia(u.polozky)) : [];
  const p = nastavZaokruhlenie(ine, u.zaokruhlenie);
  return p.length ? p : null;
}

/** Riadok `other_documents` z údajov (iný doklad). */
export function ostatnyZUdajov(u: UdajeNespracovaneho, dnes: string) {
  const s = sucty(u);
  return {
    kind: u.ostatny.druh || "ine",
    sender: prazdne(u.dodavatel.nazov),
    subject: prazdne(u.ostatny.predmet) ?? prazdne(u.cislo),
    received_date: dnes,
    amount: s.celkom || null,
    currency: (u.mena || "EUR").toUpperCase(),
    due_date: u.ostatny.lehota || u.splatnost || null,
    // Platobné údaje predpisu či výmeru — podľa nich sa hľadá platba v banke.
    variable_symbol: upravVs(u.vs),
    iban: upravIban(u.dodavatel?.iban),
    note: prazdne(u.poznamka),
  };
}

/**
 * Riadok zoznamu Nespracovaných z `nespracovane_doklady` — to isté pre
 * stránku Nespracované doklady aj Moje úlohy, aby sa suma či dodávateľ
 * neukazovali na dvoch miestach inak.
 */
export function zhrnutieNespracovaneho(r: Record<string, any>) {
  const u = r.udaje ?? {};
  return {
    id: r.id as string,
    typ: "nespracovany" as const,
    zdroj: r.zdroj as string,
    stav: r.stav as string,
    druh: (r.druh ?? null) as string | null,
    dodavatel: (u.dodavatel?.nazov as string) || null,
    cislo: (u.cislo as string) || null,
    datum: (u.datumVystavenia as string) || null,
    suma:
      u.celkom != null
        ? Number(u.celkom)
        : Array.isArray(u.rozpis)
          ? u.rozpis.reduce((a: number, x: any) => a + Number(x.zaklad || 0) + Number(x.dph || 0), 0)
          : null,
    mena: (u.mena as string) || "EUR",
    /** Základ dane — pre súčet „bez DPH“ v lište výberu; bez rozpisu nie je známy. */
    zaklad:
      Array.isArray(u.rozpis) && u.rozpis.length
        ? u.rozpis.reduce((a: number, x: any) => a + Number(x.zaklad || 0), 0)
        : null,
    platba: (u.platba as string) || null,
    predkontacia: (u.kody?.predkontacia as string) || null,
    subor: (r.file_name ?? null) as string | null,
    chyba: (r.chyba ?? null) as string | null,
    inboxMessageId: (r.inbox_message_id ?? null) as string | null,
    /** Kto doklad nahral (pri maile majiteľ adresy — meno sa preto pri maile neukazuje). */
    nahral: (r.created_by ?? null) as string | null,
    vytvorene: r.created_at as string,
  };
}

/**
 * Nespracovaný doklad v tvare pre hromadný príkaz na úhradu (`pripravPlatby`).
 * Údaje sú tie isté, aké ukáže detail: uložené, a kým ich nikto neotvoril,
 * vyťažené z AI. Dobropis, bloček a iný doklad sa neplatia — vrátia dôvod,
 * ktorý okno príkazu ukáže; nič sa nevynechá potichu.
 */
export function naUhraduZNespracovaneho(
  r: { id: string; druh?: string | null; udaje?: unknown; ai?: Record<string, unknown> | null },
  dnes: string,
) {
  const ulozene = nacitajUdaje(r.udaje);
  const u = ulozene.dodavatel.nazov || ulozene.cislo || !r.ai ? ulozene : udajeZAi(r.ai, dnes);
  const druh = r.druh ?? "";
  const dovod =
    druh === "dobropis"
      ? "je dobropis — peniaze vracia dodávateľ"
      : druh === "blocek"
        ? "je bloček — zaplatený na mieste"
        : druh === "ostatny"
          ? "nie je faktúra (iný doklad)"
          : null;
  return {
    id: r.id,
    invoice_number: u.cislo || null,
    supplier_name: u.dodavatel.nazov || null,
    supplier_iban: u.dodavatel.iban || null,
    // Na úhradu je suma po odpočte zaplatenej zálohy (929,70 − 900 = 29,70).
    amount_total: naUhraduSOdpoctom(sucty(u).celkom, druh === "faktura" || !druh ? u.zaloha : 0),
    currency: u.mena || "EUR",
    due_date: u.splatnost || null,
    status: "received",
    payment_method: u.platba || null,
    variable_symbol: u.vs || null,
    specific_symbol: u.ss || null,
    constant_symbol: u.ks || null,
    dovod,
  };
}

/** Bloček z appky či formulára (`expense_documents` so stavom `new`) v tvare riadka Nespracovaných. */
export function zhrnutieBlocku(b: Record<string, any>) {
  return {
    id: b.id as string,
    typ: "blocek" as const,
    zdroj: b.source as string,
    dodavatel: (b.supplier_name ?? null) as string | null,
    cislo: (b.document_number ?? null) as string | null,
    datum: (b.issue_date ?? null) as string | null,
    suma: b.total_amount == null ? null : Number(b.total_amount),
    mena: (b.currency as string) || "EUR",
    nahral: (b.created_by ?? null) as string | null,
    vytvorene: b.created_at as string,
  };
}

/** Hromadná úprava — vyplnené polia prepíšu údaje dokladu, prázdne nechajú tak. */
export function hromadnaZmenaUdajov(
  udaje: unknown,
  zmena: { jobId?: string; stredisko?: string; cinnost?: string; predkontacia?: string; clenenie?: string },
): UdajeNespracovaneho {
  const u = nacitajUdaje(udaje);
  const h = (v: string | undefined) => (v ?? "").trim();
  const kody = { ...u.kody };
  if (h(zmena.stredisko)) kody.stredisko = h(zmena.stredisko);
  if (h(zmena.cinnost)) kody.cinnost = h(zmena.cinnost);
  if (h(zmena.predkontacia)) kody.predkontacia = h(zmena.predkontacia);
  if (h(zmena.clenenie)) kody.clenenie = h(zmena.clenenie);
  return { ...u, kody, ...(h(zmena.jobId) ? { jobId: h(zmena.jobId) } : {}) };
}

/**
 * Text hlavného tlačidla v editore nespracovaného dokladu. Faktúry, zálohové,
 * dobropisy a bločky idú do účtovníctva — „Zaúčtovať". Iný doklad (list,
 * zmluva, predpis) sa neúčtuje, len odloží medzi iné doklady.
 */
export function textVytvorenia(druh: DruhNespracovaneho | "" | null | undefined): string {
  return druh === "ostatny" ? "Presunúť do iných dokladov" : "Zaúčtovať";
}
