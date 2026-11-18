/*
  Hlasové ovládanie Faktera (TEST) — spoločná čistá časť pre prehliadač aj server.

  Tok: človek povie príkaz → prehliadač ho prepíše (Web Speech API) → server
  (`hlas.functions.ts` → `hlas.server.ts`) ho s kontextom stránky pošle
  Claudovi s malou sadou nástrojov → vráti krátku odpoveď a akcie
  (prechod na stránku, návrh zaúčtovania na potvrdenie).

  Zápis je len jeden — zaúčtovanie navrhnutých dokladov — a ide výhradne cez
  potvrdenie človeka (tlačidlo Potvrdiť alebo hlasom „potvrď / áno / ulož“).
  Model zápis sám spustiť nevie: jeho nástroj `confirm_pending` len vráti
  akciu, ktorú prehliadač vykoná až po kontrole `smiePotvrdit`.
*/

/* ---------- Komu sa funkcia ukáže ---------- */

/**
 * Kto hlasové ovládanie vidí. Zatiaľ len administrátori platformy (riadok
 * v `platform_admins`); na rozšírenie stačí zmeniť na „vsetci“.
 */
export const HLAS_PRE: "admini" | "vsetci" = "admini";

/**
 * Test len pre konkrétne účty (Patrik 18. 11.: „len pod môj účet“) — popri
 * `platform_admins` musí byť používateľ aj tu. Prázdny zoznam = všetci admini.
 */
export const HLAS_UCTY: readonly string[] = ["b54840e1-e150-4202-baea-4c49790e3f65"];

export function ucetSmieHlas(userId: string | null | undefined): boolean {
  return HLAS_UCTY.length === 0 || (Boolean(userId) && HLAS_UCTY.includes(String(userId)));
}

/** Tlačidlo mikrofónu v hlavičke webu (v natívnej appke nie). */
export function smieHlas(args: {
  adminRole: string | null | undefined;
  nativna: boolean;
  userId?: string | null;
}): boolean {
  if (args.nativna) return false;
  if (HLAS_PRE === "vsetci") return true;
  return Boolean(args.adminRole) && ucetSmieHlas(args.userId);
}

/* ---------- Kontext stránky ---------- */

export type TypDokladuHlasu = "nespracovany" | "prijata" | "blocek" | "vystavena";

export type DokladNaObrazovke = {
  typ: TypDokladuHlasu;
  id: string;
  cislo?: string | null;
  partner?: string | null;
  suma?: number | null;
  mena?: string | null;
};

/** Čo stránka zverejní hlasovému ovládaniu (prehliadač → server). */
export type KontextHlasu = {
  /** Kľúč stránky, napr. „nespracovane“, „nespracovany-detail“. */
  stranka: string | null;
  cesta: string;
  /** Doklady na aktuálnej strane zoznamu (najviac 50). */
  doklady: DokladNaObrazovke[];
  /** Označené (zaškrtnuté) doklady. */
  oznacene: string[];
  /** Otvorený doklad (detail). */
  otvoreny: { typ: TypDokladuHlasu; id: string } | null;
};

export const MAX_DOKLADOV_KONTEXTU = 50;
/** Najviac dokladov v jednom návrhu — dlhšie by prekročilo ~25 s (nginx strihá po 30 s). */
export const MAX_NAVRHOV = 10;

/**
 * Doklady, pre ktoré sa má navrhnúť zaúčtovanie: výslovne menované (len tie,
 * ktoré stránka alebo predošlý zoznam ukázali), inak označené, inak otvorený,
 * inak všetky na obrazovke. Vráti aj, koľko sa pre limit vynechalo.
 */
export function dokladyNaNavrh(
  kontext: Pick<KontextHlasu, "doklady" | "oznacene" | "otvoreny">,
  ids: string[],
  znameDoklady: DokladNaObrazovke[] = [],
): { doklady: DokladNaObrazovke[]; vynechane: number } {
  const vsetky = new Map<string, DokladNaObrazovke>();
  for (const d of [...znameDoklady, ...kontext.doklady]) vsetky.set(d.id, d);
  if (kontext.otvoreny && !vsetky.has(kontext.otvoreny.id))
    vsetky.set(kontext.otvoreny.id, { typ: kontext.otvoreny.typ, id: kontext.otvoreny.id });
  let vyber: DokladNaObrazovke[];
  if (ids.length) vyber = ids.map((id) => vsetky.get(id)).filter((d): d is DokladNaObrazovke => !!d);
  else if (kontext.oznacene.length)
    vyber = kontext.oznacene.map((id) => vsetky.get(id)).filter((d): d is DokladNaObrazovke => !!d);
  else if (kontext.otvoreny) vyber = [vsetky.get(kontext.otvoreny.id)!];
  else vyber = [...kontext.doklady];
  const jedinecne = [...new Map(vyber.map((d) => [d.id, d])).values()];
  return {
    doklady: jedinecne.slice(0, MAX_NAVRHOV),
    vynechane: Math.max(0, jedinecne.length - MAX_NAVRHOV),
  };
}

/* ---------- Kam smie model navigovať ---------- */

export const CIELE = [
  "dashboard",
  "nespracovane",
  "prijate_faktury",
  "vystavene_faktury",
  "blocky",
  "banka",
  "uctovne_exporty",
  "dph_prehlad",
  "dph_vykazy",
  "na_kontrolu",
  "nastavenia",
  "detail_nespracovany",
  "detail_prijata",
  "detail_vystavena",
] as const;
export type Ciel = (typeof CIELE)[number];

const CESTY: Record<Exclude<Ciel, `detail_${string}`>, string> = {
  dashboard: "/dashboard",
  nespracovane: "/nespracovane",
  prijate_faktury: "/prijate-faktury",
  vystavene_faktury: "/faktury",
  blocky: "/doklady",
  banka: "/bankove-ucty",
  uctovne_exporty: "/exporty",
  dph_prehlad: "/uctovnictvo/dph",
  dph_vykazy: "/uctovnictvo/vykazy",
  na_kontrolu: "/uctovnictvo/na-kontrolu",
  nastavenia: "/nastavenia",
};

const DETAILY: Record<Extract<Ciel, `detail_${string}`>, string> = {
  detail_nespracovany: "/nespracovane/$id",
  detail_prijata: "/prijate-faktury/$id",
  detail_vystavena: "/faktury/$id",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Navigacia = { to: string; params?: { id: string } };

/** Cieľ z whitelistu → cesta routera; čokoľvek iné (aj zlé id) → null. */
export function cestaPreCiel(ciel: string, id?: string | null): Navigacia | null {
  if (ciel in CESTY) return { to: CESTY[ciel as keyof typeof CESTY] };
  if (ciel in DETAILY) {
    if (!id || !UUID.test(id)) return null;
    return { to: DETAILY[ciel as keyof typeof DETAILY], params: { id } };
  }
  return null;
}

/* ---------- Potvrdenie hlasom ---------- */

function slova(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const ANO = new Set([
  "potvrd",
  "potvrdit",
  "potvrdte",
  "potvrdzujem",
  "potvrzuji",
  "potvrzuju",
  "ano",
  "uloz",
  "ulozit",
  "ulozte",
  "suhlasim",
  "souhlasim",
  "zauctuj",
  "zauctovat",
  "zauctuj",
  "ok",
  "okej",
  "ja",
  "bestatigen",
  "bestatige",
  "speichern",
]);
const NIE = new Set([
  "nie",
  "ne",
  "nein",
  "nepotvrd",
  "nepotvrdzuj",
  "neukladaj",
  "neuloz",
  "zrus",
  "zrusit",
  "zruste",
  "storno",
  "stornuj",
  "zahod",
  "zahodit",
  "abbrechen",
  "nechaj",
  "nech",
]);

/** Krátka veta, ktorá znamená súhlas („potvrď“, „áno, ulož to“). */
export function jePotvrdenie(text: string): boolean {
  const s = slova(text);
  if (!s.length || s.length > 6) return false;
  if (s.some((x) => NIE.has(x))) return false;
  return s.some((x) => ANO.has(x));
}

/** Krátka veta, ktorá znamená odmietnutie („zruš“, „nie“). */
export function jeZrusenie(text: string): boolean {
  const s = slova(text);
  if (!s.length || s.length > 6) return false;
  return s.some((x) => NIE.has(x));
}

/**
 * Smie prehliadač zapísať čakajúci návrh? Len keď nejaký čaká a človek ho
 * výslovne potvrdil — kliknutím, alebo vetou, ktorá podľa `jePotvrdenie`
 * súhlas naozaj je. Samotná akcia od modelu nestačí.
 */
export function smiePotvrdit(args: {
  maNavrh: boolean;
  klik?: boolean;
  text?: string | null;
}): boolean {
  if (!args.maNavrh) return false;
  if (args.klik) return true;
  return Boolean(args.text && jePotvrdenie(args.text));
}

/* ---------- Návrh zaúčtovania (čo ukáže panel) ---------- */

export type PolozkaNavrhuHlasu = {
  typ: TypDokladuHlasu;
  id: string;
  cislo: string | null;
  partner: string | null;
  suma: number | null;
  mena: string | null;
  predkontacia: string | null;
  clenenieDph: string | null;
  kvClenenie: string | null;
  /** pravidlo | zvyk | navyk | ai | null */
  zdroj: string | null;
  istota: number | null;
  /** Čo bráni automatickému zaúčtovaniu (duplicita, prvý od partnera…). */
  upozornenia: string[];
  /** Prečo sa návrh nedá potvrdiť (už zaúčtovaný, chýba druh…); null = dá sa. */
  nedaSa: string | null;
};

export type NavrhHlasu = {
  polozky: PolozkaNavrhuHlasu[];
  /** Koľko dokladov sa pre limit alebo čas nespracovalo. */
  vynechane: number;
};

/** Položky, ktoré sa potvrdením zapíšu. */
export function naPotvrdenie(n: NavrhHlasu | null | undefined): PolozkaNavrhuHlasu[] {
  return (n?.polozky ?? []).filter((p) => !p.nedaSa && p.predkontacia);
}

/* ---------- Odpoveď servera ---------- */

export type AkciaHlasu =
  | { typ: "navigovat"; ciel: Ciel; navigacia: Navigacia }
  | { typ: "navrh"; navrh: NavrhHlasu }
  | { typ: "potvrdit" }
  | { typ: "zrusit" };

export type OdpovedHlasu = {
  text: string;
  akcie: AkciaHlasu[];
  /** Doklady, ktoré model videl v zoznamoch (smie ich použiť v ďalšom kole). */
  zname: DokladNaObrazovke[];
};

export type KoloHlasu = { kto: "user" | "asistent"; text: string };

/* ---------- Reč v prehliadači ---------- */

/** Jazyk rozpoznávania a reči podľa jazyka rozhrania. */
export function jazykReci(jazyk: string | null | undefined): "sk-SK" | "cs-CZ" | "de-DE" {
  if (jazyk === "cs") return "cs-CZ";
  if (jazyk === "de") return "de-DE";
  return "sk-SK";
}

/**
 * Ženské hlasy v poradí preferencie (Patrik 18. 11.: hlas má byť ženský).
 * macOS/iOS: Laura (sk), Zuzana (cs), Anna (de); Edge/Windows: Viktoria (sk),
 * Vlasta (cs), Katja (de); Chrome: „Google slovenčina“ / „Google čeština“.
 */
export const ZENSKE_HLASY = [
  "Laura",
  "Viktoria",
  "Google slovenčina",
  "Zuzana",
  "Vlasta",
  "Google čeština",
  "Iveta",
  "Anna",
  "Katja",
  "Petra",
  "Helena",
  "Google Deutsch",
];

export type HlasInfo = { name: string; lang: string; localService?: boolean };

const zacinaJazykom = (h: HlasInfo, j: string) =>
  h.lang.toLowerCase().replace("_", "-").startsWith(j);

const poradieZenskeho = (h: HlasInfo) => {
  const i = ZENSKE_HLASY.findIndex((m) => h.name.toLowerCase().includes(m.toLowerCase()));
  return i < 0 ? Infinity : i;
};

/**
 * Výber hlasu: uložená voľba → ženský v jazyku rozhrania → ženský v druhom
 * (sk ↔ cs) → hocijaký v jazyku rozhrania → hocijaký v druhom.
 */
export function vyberHlas<T extends HlasInfo>(
  hlasy: T[],
  jazyk: string | null | undefined,
  ulozeny?: string | null,
): { hlas: T | null; zensky: boolean } {
  if (ulozeny) {
    const h = hlasy.find((x) => x.name === ulozeny);
    if (h) return { hlas: h, zensky: poradieZenskeho(h) !== Infinity };
  }
  const jazyky = jazyk === "cs" ? ["cs", "sk"] : jazyk === "de" ? ["de"] : ["sk", "cs"];
  for (const j of jazyky) {
    const zenske = hlasy
      .filter((h) => zacinaJazykom(h, j) && poradieZenskeho(h) !== Infinity)
      .sort((a, b) => poradieZenskeho(a) - poradieZenskeho(b));
    if (zenske.length) return { hlas: zenske[0], zensky: true };
  }
  for (const j of jazyky) {
    const h = hlasy.find((x) => zacinaJazykom(x, j));
    if (h) return { hlas: h, zensky: false };
  }
  return { hlas: null, zensky: false };
}

/** Hlasy, ktoré dáva zmysel ponúknuť vo výbere (sk, cs, pri nemčine de). */
export function hlasyNaVyber<T extends HlasInfo>(hlasy: T[], jazyk: string | null | undefined): T[] {
  const jazyky = jazyk === "de" ? ["de", "sk", "cs"] : ["sk", "cs"];
  return hlasy.filter((h) => jazyky.some((j) => zacinaJazykom(h, j)));
}

/** Text na predčítanie — bez markdownu a nie dlhší než pár viet. */
export function textNaPrecitanie(text: string, max = 280): string {
  const t = text
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  const rez = t.slice(0, max);
  const bodka = Math.max(rez.lastIndexOf(". "), rez.lastIndexOf("! "), rez.lastIndexOf("? "));
  return bodka > 40 ? rez.slice(0, bodka + 1) : rez + "…";
}
