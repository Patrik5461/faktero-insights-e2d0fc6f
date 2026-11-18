/*
  Hlasové ovládanie Faktera (TEST) — spoločná čistá časť pre prehliadač aj server.

  Tok: človek povie príkaz → prehliadač ho nahrá a server ho prepíše
  (OpenAI gpt-4o-transcribe, `hlas-prepis.server.ts`; Web Speech API len ako
  záloha) → server
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
  if (ids.length)
    vyber = ids.map((id) => vsetky.get(id)).filter((d): d is DokladNaObrazovke => !!d);
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

/* ---------- Navigácia ---------- */

/*
  Kam smie model ísť, určuje katalóg stránok (`hlas-stranky.ts`, generovaný
  z routeTree). Tu je len tvar navigácie a detail položky zo zoznamu.
*/

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Navigacia = { to: string; params?: { id: string }; search?: Record<string, string> };

/** Čo všetko vie hlas nájsť a ukázať v zozname v paneli. */
export type TypPolozkyHlasu =
  TypDokladuHlasu | "ponuka" | "zakazka" | "odberatel" | "dodavatel" | "transakcia" | "produkt";

export type PolozkaZoznamuHlasu = {
  typ: TypPolozkyHlasu;
  id: string;
  cislo?: string | null;
  partner?: string | null;
  suma?: number | null;
  mena?: string | null;
  datum?: string | null;
  /** Krátky stav do zoznamu („neuhradená“, „po splatnosti“…). */
  stav?: string | null;
};

const DETAIL_POLOZKY: Partial<Record<TypPolozkyHlasu, string>> = {
  nespracovany: "/nespracovane/$id",
  prijata: "/prijate-faktury/$id",
  vystavena: "/faktury/$id",
  ponuka: "/ponuky/$id",
  zakazka: "/zakazky/$id",
  produkt: "/sklad/produkty/$id",
};

/**
 * Kam vedie klik na položku zoznamu. Bloček, kontakt, transakcia a produkt
 * bez skladu detail nemajú — otvorí sa ich zoznam vyhľadaný podľa čísla/mena.
 */
export function navigaciaPolozky(
  p: Pick<PolozkaZoznamuHlasu, "typ" | "id" | "cislo" | "partner">,
): Navigacia | null {
  // Produkt z cenníka bez skladovej karty (id „cennik:<uuid>“) — cenník vyhľadaný podľa mena.
  if (p.typ === "produkt" && p.id.startsWith("cennik:"))
    return p.partner
      ? { to: "/produkty", search: { q: p.partner.slice(0, 80) } }
      : { to: "/produkty" };
  const detail = DETAIL_POLOZKY[p.typ];
  if (detail) return UUID.test(p.id) ? { to: detail, params: { id: p.id } } : null;
  const q = (p.cislo || p.partner || "").trim().slice(0, 80);
  const zoznam: Partial<Record<TypPolozkyHlasu, string>> = {
    blocek: "/doklady",
    odberatel: "/odberatelia",
    dodavatel: "/dodavatelia",
    transakcia: "/bankove-ucty/transakcie",
  };
  const to = zoznam[p.typ];
  if (!to) return null;
  return q ? { to, search: { q } } : { to };
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

/*
  Zápisy hlasom — jednotný mechanizmus: server (model) zápis NIKDY nevykoná,
  len vráti `NavrhAkcie`. Panel ho ukáže s Potvrdiť/Zrušiť a po potvrdení ho
  vykoná prehliadač existujúcou serverovou funkciou (register
  `VYKONAVACE_ZAPISOV` v HlasoveOvladanie.tsx). Nový zápis = nový druh tu,
  nástroj „propose_…“ v hlas.server.ts, náhľad a vykonávač v paneli.
  Zatiaľ jediný druh: zaúčtovanie dokladov.
*/
export type NavrhAkcie = { druh: "zauctovanie"; navrh: NavrhHlasu };

export const NAZVY_ZAPISOV: Record<NavrhAkcie["druh"], string> = {
  zauctovanie: "Návrh zaúčtovania",
};

/** Koľko vecí potvrdenie zapíše (0 = nie je čo potvrdiť). */
export function pocetNaPotvrdenie(a: NavrhAkcie | null | undefined): number {
  if (!a) return 0;
  switch (a.druh) {
    case "zauctovanie":
      return naPotvrdenie(a.navrh).length;
  }
}

export type FirmaHlasu = { id: string; nazov: string; ico: string | null; testovacia: boolean };

export type AkciaHlasu =
  | { typ: "navigovat"; navigacia: Navigacia; nazov?: string }
  | { typ: "navrh_akcie"; akcia: NavrhAkcie }
  | { typ: "potvrdit" }
  | { typ: "zrusit" }
  | { typ: "zoznam"; nadpis: string; polozky: PolozkaZoznamuHlasu[]; celkom: number }
  | { typ: "prepnut_firmu"; firma: FirmaHlasu }
  | { typ: "vyber_firmy"; firmy: FirmaHlasu[] };

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
export function hlasyNaVyber<T extends HlasInfo>(
  hlasy: T[],
  jazyk: string | null | undefined,
): T[] {
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

/* ---------- Nahrávanie príkazu (prehliadač) ---------- */

/** Formát nahrávky v poradí preferencie — Chrome/Firefox webm/ogg opus, Safari mp4. */
export const FORMATY_NAHRAVKY = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

export function vyberFormatNahravky(podporuje: (mime: string) => boolean): string | null {
  for (const f of FORMATY_NAHRAVKY) {
    try {
      if (podporuje(f)) return f;
    } catch {
      /* starý prehliadač — skúsi sa ďalší */
    }
  }
  return null;
}

/**
 * Detekcia ticha (VAD) nad hlasitosťou mikrofónu. Prah sa nastaví z prvých
 * 300 ms (šum miestnosti), koniec príkazu = 1,2 s ticha po reči; bez reči
 * sa po 7 s skončí naprázdno, celé nahrávanie najviac 30 s.
 */
export const VAD = {
  kalibraciaMs: 300,
  tichoMs: 1200,
  bezReciMs: 7000,
  maxMs: 30_000,
  minPrah: 0.012,
  maxPrah: 0.05,
} as const;

export type StavTicha = {
  zaciatok: number;
  sumHluku: number;
  vzoriekHluku: number;
  prah: number;
  reci: boolean;
  posledneHlasne: number;
  /** Koľko ms bolo nad prahom (súčet) — krátke bliknutie (kašeľ, klik) nie je reč. */
  reciMs: number;
  poslednaVzorka: number;
};

export type KoniecNahravania = "ticho" | "max" | "bez_reci";

export function novyStavTicha(t: number): StavTicha {
  return {
    zaciatok: t,
    sumHluku: 0,
    vzoriekHluku: 0,
    prah: VAD.minPrah,
    reci: false,
    posledneHlasne: t,
    reciMs: 0,
    poslednaVzorka: t,
  };
}

/** Jedna vzorka hlasitosti (RMS 0–1) v čase `t` (ms). `drzi` = tlačidlo držané (push-to-talk): ticho nekončí. */
export function krokTicha(
  s: StavTicha,
  rms: number,
  t: number,
  drzi = false,
): { stav: StavTicha; koniec: KoniecNahravania | null } {
  const n = { ...s };
  const ubehlo = t - s.zaciatok;
  if (ubehlo >= VAD.maxMs) return { stav: n, koniec: "max" };
  if (ubehlo < VAD.kalibraciaMs) {
    n.sumHluku += rms;
    n.vzoriekHluku += 1;
    n.prah = Math.min(VAD.maxPrah, Math.max(VAD.minPrah, (n.sumHluku / n.vzoriekHluku) * 2.5));
  }
  if (rms >= n.prah) {
    n.reci = true;
    n.posledneHlasne = t;
    n.reciMs += Math.min(200, Math.max(0, t - s.poslednaVzorka));
  }
  n.poslednaVzorka = t;
  if (drzi) return { stav: n, koniec: null };
  if (n.reci && t - n.posledneHlasne >= VAD.tichoMs) return { stav: n, koniec: "ticho" };
  if (!n.reci && ubehlo >= VAD.bezReciMs) return { stav: n, koniec: "bez_reci" };
  return { stav: n, koniec: null };
}

/**
 * Čo spraviť po prepise na serveri. Serverový prepis má prednosť; keď
 * zlyhá, použije sa text, ktorý popri nahrávaní zachytil prehliadač
 * (Chrome), inak sa počúva znova prehliadačom (ak ho prehliadač má).
 */
/** Od koľkých ms reči (VAD) sa verí aj prepisu, ktorý sa skladá len zo slov slovníka. */
export const REC_PRE_OZVENU_MS = 600;

export function poPrepise(a: {
  server: { text: string; prazdny: boolean; ozvena?: boolean } | { chyba: string };
  prehliadac: string;
  recDostupna: boolean;
  /** Reč nameraná detekciou ticha (ms). */
  reciMs?: number;
}):
  | { akcia: "odoslat"; text: string; zdroj: "server" | "prehliadac" }
  | { akcia: "nic" }
  | { akcia: "pocuvat_prehliadacom" }
  | { akcia: "chyba"; text: string } {
  const zaloha = a.prehliadac.trim();
  if ("chyba" in a.server) {
    if (zaloha) return { akcia: "odoslat", text: zaloha, zdroj: "prehliadac" };
    if (a.recDostupna) return { akcia: "pocuvat_prehliadacom" };
    return { akcia: "chyba", text: a.server.chyba };
  }
  const t = a.server.text.trim();
  if (!t || a.server.prazdny) return { akcia: "nic" };
  /*
    Pri tichu či šume gpt-4o-transcribe „prepíše“ slová zo slovníka
    (overené naostro 18. 11.). Prepis len zo slov slovníka sa preto berie,
    keď reč potvrdil aj prehliadač alebo detekcia ticha nameral dosť reči.
  */
  if (a.server.ozvena && !zaloha && (a.reciMs ?? 0) < REC_PRE_OZVENU_MS) return { akcia: "nic" };
  return { akcia: "odoslat", text: t, zdroj: "server" };
}
