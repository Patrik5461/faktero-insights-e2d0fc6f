/*
  Hlasové ovládanie (TEST) — mozog na serveri.

  `spracujPrikaz` pošle prepis vety, kontext stránky a posledné kolá
  rozhovoru Claudovi (Haiku 5.5) s nástrojmi a vykoná, čo si model vypýta.
  Všetko číta klient prihláseného (RLS + `overPristup` vo volajúcom), takže
  hlas nevidí nič, čo človek nevidí v aplikácii.

  Model nič nezapisuje. Zápis (zatiaľ len zaúčtovanie) sa vráti prehliadaču
  ako `NavrhAkcie`, ten ho ukáže a vykoná až po potvrdení (`potvrdNavrhHlasu`,
  rovnaké cesty ako Na kontrolu a formulár Nespracovaných — zámky, duplicity,
  schvaľovanie platia). Prepnutie firmy a navigácia nie sú zápis do dát.

  Čas: nginx strihá po ~30 s, preto celé volanie beží v termíne ~24 s a návrh
  sa robí najviac pre `MAX_NAVRHOV` dokladov (zvyšok sa ohlási ako vynechaný).
*/

import type Anthropic from "@anthropic-ai/sdk";
import {
  dokladyNaNavrh,
  type AkciaHlasu,
  type DokladNaObrazovke,
  type FirmaHlasu,
  type KoloHlasu,
  type KontextHlasu,
  type NavrhHlasu,
  type OdpovedHlasu,
  type PolozkaNavrhuHlasu,
  type PolozkaZoznamuHlasu,
  type TypDokladuHlasu,
  navigaciaPolozky,
} from "./hlas";
import { katalogPreModel, navigaciaPreStranku, type StrankaHlasu } from "./hlas-stranky";
import {
  najdiFirmu,
  obdobiaPreModel,
  type FirmaNaVyber,
  type RiadokHladania,
  type StavHladania,
} from "./hlas-hladanie";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;

export const MODEL_HLASU = "claude-haiku-5-5";
const TERMIN_MS = 24_000;
const MAX_KOL = 5;
const MAX_V_ZOZNAME = 20;

/* ---------- Nástroje (strict) ---------- */

const NULL_ALEBO = (t: Record<string, unknown>) => ({ anyOf: [t, { type: "null" }] });
const BEZ_PARAMETROV = {
  type: "object" as const,
  properties: {},
  required: [],
  additionalProperties: false,
};

export const DRUHY_HLADANIA = [
  "nespracovane",
  "prijate",
  "vystavene",
  "blocky",
  "ponuky",
  "vsetky",
] as const;
export type DruhHladania = (typeof DRUHY_HLADANIA)[number];
const STAVY: StavHladania[] = ["vsetky", "neuhradene", "po_splatnosti", "nezauctovane"];

export function nastrojeHlasu(stranky: StrankaHlasu[]): Anthropic.Tool[] {
  return [
    {
      name: "navigate",
      description:
        "Otvorí stránku aplikácie podľa kľúča z katalógu stránok v systémovom pokyne. Detail ([potrebuje id]) len s id dokladu, ktoré prišlo z nástroja alebo z kontextu. hladat = text do vyhľadávania zoznamu (napr. číslo bločku), inak null.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          stranka: { type: "string", enum: stranky.map((s) => s.kluc) },
          id: NULL_ALEBO({ type: "string" }),
          hladat: NULL_ALEBO({ type: "string" }),
        },
        required: ["stranka", "id", "hladat"],
        additionalProperties: false,
      },
    },
    {
      name: "find_documents",
      description:
        "Vyhľadá doklady firmy a ukáže ich v paneli ako klikací zoznam (len čítanie). druh: nespracovane = nahraté čakajúce na spracovanie, prijate = prijaté faktúry (od dodávateľov), vystavene = vystavené faktúry (odberateľom), blocky = bločky, ponuky = cenové ponuky, vsetky = všetko okrem ponúk. partner = meno dodávateľa/odberateľa tak, ako ho človek povedal (nájde sa aj s chybou prepisu, bez diakritiky, časť mena), cislo = číslo dokladu alebo VS, suma = celková suma, datum_od/datum_do = YYYY-MM-DD (dátum vystavenia). stav: neuhradene, po_splatnosti, nezauctovane alebo vsetky. otvorit=true keď chce človek doklad OTVORIŤ — pri jedinej zhode sa rovno otvorí detail. Čo nevieš, daj null.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          druh: { type: "string", enum: [...DRUHY_HLADANIA] },
          partner: NULL_ALEBO({ type: "string" }),
          cislo: NULL_ALEBO({ type: "string" }),
          suma: NULL_ALEBO({ type: "number" }),
          datum_od: NULL_ALEBO({ type: "string" }),
          datum_do: NULL_ALEBO({ type: "string" }),
          stav: { type: "string", enum: STAVY },
          otvorit: { type: "boolean" },
          limit: { type: "integer" },
        },
        required: [
          "druh",
          "partner",
          "cislo",
          "suma",
          "datum_od",
          "datum_do",
          "stav",
          "otvorit",
          "limit",
        ],
        additionalProperties: false,
      },
    },
    {
      name: "counts_overview",
      description:
        "Počty na prehľad: koľko je nespracovaných dokladov, čo chýba zaúčtovať (prijaté, bločky, vystavené bez zaúčtovania), neuhradené prijaté a vystavené, vystavené po splatnosti. Na „koľko…“, „čo mi chýba zaúčtovať“, „čo mám urobiť“.",
      strict: true,
      input_schema: BEZ_PARAMETROV,
    },
    {
      name: "propose_accounting",
      description:
        "Navrhne zaúčtovanie (predkontácia, členenie DPH, KV) pre doklady — NIČ neuloží, len ukáže návrh na potvrdenie. ids: id dokladov z kontextu alebo z find_documents; prázdne pole = označené doklady, inak otvorený doklad, inak doklady na obrazovke. Naraz najviac 10.",
      strict: true,
      input_schema: {
        type: "object",
        properties: { ids: { type: "array", items: { type: "string" } } },
        required: ["ids"],
        additionalProperties: false,
      },
    },
    {
      name: "confirm_pending",
      description:
        "Rozhodnutie o čakajúcom návrhu (zaúčtovania). potvrdit=true len keď človek práve výslovne povedal súhlas (potvrď, áno, ulož); potvrdit=false keď ho zrušil. Zápis vykoná aplikácia až po vlastnej kontrole.",
      strict: true,
      input_schema: {
        type: "object",
        properties: { potvrdit: { type: "boolean" } },
        required: ["potvrdit"],
        additionalProperties: false,
      },
    },
    {
      name: "switch_company",
      description:
        "Prepne aktívnu firmu na inú z firiem, ku ktorým má človek prístup. nazov = názov alebo IČO tak, ako ho povedal (aj časť, bez diakritiky). Testovaciu firmu („Test – …“) len keď povie „testovaciu/test“. Pri viacerých zhodách sa v paneli ukáže výber.",
      strict: true,
      input_schema: {
        type: "object",
        properties: { nazov: { type: "string" } },
        required: ["nazov"],
        additionalProperties: false,
      },
    },
    {
      name: "bank_overview",
      description:
        "Banka (len čítanie): druh=zostatky (zostatky účtov, meny sa nesčítavajú), posledne_pohyby (najnovšie transakcie, hladat = protistrana/popis/VS alebo null), nesparovane (pohyby bez spárovaného dokladu).",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          druh: { type: "string", enum: ["zostatky", "posledne_pohyby", "nesparovane"] },
          hladat: NULL_ALEBO({ type: "string" }),
          limit: { type: "integer" },
        },
        required: ["druh", "hladat", "limit"],
        additionalProperties: false,
      },
    },
    {
      name: "find_contacts",
      description:
        "Vyhľadá v adresári odberateľov a dodávateľov (meno alebo IČO, aj s chybou prepisu).",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          hladat: { type: "string" },
          rola: { type: "string", enum: ["vsetci", "odberatel", "dodavatel"] },
        },
        required: ["hladat", "rola"],
        additionalProperties: false,
      },
    },
    {
      name: "find_products",
      description:
        "Vyhľadá produkty a služby z cenníka a skladové položky (názov, kód, SKU) s cenou a množstvom na sklade. hladat=null = položky pod minimom.",
      strict: true,
      input_schema: {
        type: "object",
        properties: { hladat: NULL_ALEBO({ type: "string" }) },
        required: ["hladat"],
        additionalProperties: false,
      },
    },
    {
      name: "find_jobs",
      description: "Vyhľadá zákazky (číslo, názov alebo odberateľ; null = všetky otvorené).",
      strict: true,
      input_schema: {
        type: "object",
        properties: { hladat: NULL_ALEBO({ type: "string" }), len_otvorene: { type: "boolean" } },
        required: ["hladat", "len_otvorene"],
        additionalProperties: false,
      },
    },
    {
      name: "overdue_receivables",
      description:
        "Pohľadávky po splatnosti — neuhradené vystavené faktúry po dátume splatnosti: počet, súčet podľa meny a najväčší dlžníci.",
      strict: true,
      input_schema: BEZ_PARAMETROV,
    },
    {
      name: "vat_summary",
      description:
        "Informatívny DPH prehľad za mesiac: DPH na výstupe, na vstupe a rozdiel (na úhradu / nadmerný odpočet). mesiac 1–12.",
      strict: true,
      input_schema: {
        type: "object",
        properties: { rok: { type: "integer" }, mesiac: { type: "integer" } },
        required: ["rok", "mesiac"],
        additionalProperties: false,
      },
    },
  ];
}

const JAZYK_ODPOVEDE: Record<string, string> = {
  sk: "po slovensky",
  cs: "česky",
  de: "auf Deutsch",
};

export function systemovyPokyn(
  jazyk: string,
  dnes: string,
  firma?: string | null,
  stranky: StrankaHlasu[] = [],
): string {
  return [
    "Si hlasová asistentka účtovnej aplikácie Faktero (fakturácia, prijaté doklady, banka, sklad, zákazky, zaúčtovanie do Pohody). Hovoríš ženským hlasom, o sebe hovor v ženskom rode (otvorila som, našla som).",
    firma ? `Aktívna firma: ${firma}.` : "",
    obdobiaPreModel(dnes),
    "",
    "Človek hovorí do mikrofónu — prepis môže mať chyby (zle napísané mená firiem, chýbajúca diakritika, „faktúru“ ako „fakturu“). Domysli zmysel; mená partnerov odovzdaj nástroju tak, ako zazneli — hľadanie je tolerantné.",
    "Na všetko použi nástroje; nevymýšľaj čísla, doklady, mená ani kódy. Keď nástroj nič nenájde, povedz to a navrhni, čo skúsiť.",
    "",
    "Ako rozumieť vetám:",
    "- „nájdi / vyhľadaj / ukáž / kde je / máme … faktúru od X“ → find_documents (otvorit=false). NEOTVÁRAJ stránku, výsledky sa ukážu v paneli a človek si klikne.",
    "- „otvor faktúru od X / otvor doklad číslo Y“ → find_documents s otvorit=true (pri jedinej zhode sa otvorí detail, inak zoznam).",
    "- „faktúra od X“ = prijate (dodávateľ X); „faktúra pre X / ktorú sme vystavili X“ = vystavene. Keď sa to nedá povedať, druh=vsetky.",
    "- „za október“, „minulý mesiac“, „tento rok“ → datum_od/datum_do z obdobia vyššie. „na 120 eur“ → suma=120.",
    "- „ukáž neuhradené / nezaplatené“ → find_documents stav=neuhradene (bez druhu = vystavene; „ktoré mám zaplatiť“ = prijate). „po splatnosti“ → stav=po_splatnosti.",
    "- „čo mi chýba zaúčtovať“, „koľko je nespracovaných“, „koľko dokladov…“ → counts_overview.",
    "- „otvor / choď na / prepni na stránku …“ (banka, pokladňa, sklad, zákazky, cenové ponuky, nastavenia firmy, predkontácie, účtovné exporty, kniha jázd…) → navigate s kľúčom z katalógu nižšie. Detail len s id z nástroja.",
    "- „prepni (sa) na firmu X“, „choď do firmy X“ → switch_company.",
    "- banka, zostatok, platby, pohyby → bank_overview; kontakt, IČO, adresa partnera → find_contacts; produkt, cena, sklad, koľko máme na sklade → find_products; zákazka → find_jobs.",
    "- „navrhni zaúčtovanie / zaúčtuj“ → propose_accounting s ids=[] (aplikácia vezme označené, otvorený alebo doklady na obrazovke), alebo s ids konkrétnych dokladov.",
    "",
    "Zápisy: jediný je zaúčtovanie a ide len cez návrh, ktorý človek potvrdí. Kým nie je zobrazený návrh, nič sa neukladá. Keď návrh čaká a človek povie súhlas, zavolaj confirm_pending(potvrdit=true); pri „zruš/nie“ potvrdit=false. Nikdy nepotvrdzuj bez výslovného súhlasu.",
    "Iné zápisy (vystavenie, odoslanie, úhrada, párovanie, mazanie) zatiaľ hlasom nejdú — povedz to a ponúkni otvoriť stránku, kde to človek urobí.",
    `Odpovedaj ${JAZYK_ODPOVEDE[jazyk] ?? JAZYK_ODPOVEDE.sk}, jednou až dvoma krátkymi vetami, bez markdownu, bez zoznamov a bez id — odpoveď sa číta nahlas a zoznam vidí človek v paneli. Sumy zaokrúhli na eurá.`,
    "",
    "Katalóg stránok (kľúč — názov):",
    katalogPreModel(stranky),
  ]
    .filter((r) => r !== null)
    .join("\n");
}

/* ---------- Vykonávače nástrojov ---------- */

export type FilterDokladov = {
  druh: DruhHladania;
  partner: string | null;
  cislo: string | null;
  suma: number | null;
  datumOd: string | null;
  datumDo: string | null;
  stav: StavHladania;
};

export type VykonavaceNastrojov = {
  hladaj: (f: FilterDokladov) => Promise<PolozkaZoznamuHlasu[]>;
  pocty: () => Promise<unknown>;
  navrhni: (doklady: DokladNaObrazovke[], terminMs: number) => Promise<NavrhHlasu>;
  poSplatnosti: () => Promise<unknown>;
  dph: (rok: number, mesiac: number) => Promise<unknown>;
  firmy: () => Promise<FirmaNaVyber[]>;
  banka: (a: {
    druh: "zostatky" | "posledne_pohyby" | "nesparovane";
    hladat: string | null;
    limit: number;
  }) => Promise<{
    suhrn: unknown;
    polozky: PolozkaZoznamuHlasu[];
  }>;
  kontakty: (a: {
    hladat: string;
    rola: "vsetci" | "odberatel" | "dodavatel";
  }) => Promise<PolozkaZoznamuHlasu[]>;
  produkty: (hladat: string | null) => Promise<PolozkaZoznamuHlasu[]>;
  zakazky: (a: { hladat: string | null; lenOtvorene: boolean }) => Promise<PolozkaZoznamuHlasu[]>;
};

export type ProstredieHlasu = {
  jazyk: string;
  dnes: string;
  companyId: string;
  /** Názov aktívnej firmy (do pokynu). */
  firma?: string | null;
  /** Stránky, ktoré smie otvoriť (admin len adminovi platformy). */
  stranky: StrankaHlasu[];
  nastroje: VykonavaceNastrojov;
  /** Volanie modelu — v testoch podstrčené. */
  volajModel: (
    p: Anthropic.MessageCreateParamsNonStreaming,
    signal: AbortSignal,
  ) => Promise<Anthropic.Message>;
  terminMs?: number;
};

export type VstupHlasu = {
  text: string;
  kontext: KontextHlasu;
  historia: KoloHlasu[];
  /** Na obrazovke čaká návrh na potvrdenie. */
  cakaNavrh: boolean;
  /** Doklady z predošlých zoznamov tohto rozhovoru. */
  zname: DokladNaObrazovke[];
};

function kontextPreModel(v: VstupHlasu) {
  const k = v.kontext;
  return {
    stranka: k.stranka,
    cesta: k.cesta,
    otvoreny: k.otvoreny,
    oznacene: k.oznacene,
    doklady_na_obrazovke: k.doklady.slice(0, 30),
    caka_navrh_na_potvrdenie: v.cakaNavrh,
  };
}

/** Kolá rozhovoru ako striedavé user/assistant správy (prvá musí byť user). */
export function spravyHistorie(h: KoloHlasu[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const k of h.slice(-6)) {
    const role = k.kto === "user" ? "user" : "assistant";
    const text = String(k.text ?? "").slice(0, 600);
    if (!text) continue;
    if (!out.length && role === "assistant") continue;
    const posledna = out[out.length - 1];
    if (posledna && posledna.role === role) posledna.content = `${posledna.content}\n${text}`;
    else out.push({ role, content: text });
  }
  // Posledná musí byť odpoveď asistenta, nová veta človeka ide za ňu.
  if (out.length && out[out.length - 1].role === "user") out.pop();
  return out;
}

function textOdpovede(m: Pick<Anthropic.Message, "content">): string {
  return m.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
}

const orez = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(Number.isFinite(n) ? n : min)));

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const textAleboNull = (x: unknown, max = 80) =>
  typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null;

/**
 * Jeden príkaz: manuálna slučka nástrojov (najviac 5 kôl), v termíne.
 */
export async function spracujPrikaz(env: ProstredieHlasu, v: VstupHlasu): Promise<OdpovedHlasu> {
  const zaciatok = Date.now();
  const termin = env.terminMs ?? TERMIN_MS;
  const zostava = () => termin - (Date.now() - zaciatok);
  const akcie: AkciaHlasu[] = [];
  const zname = new Map<string, DokladNaObrazovke>(v.zname.map((d) => [d.id, d]));
  const nastroje = nastrojeHlasu(env.stranky);
  // Pokyn s katalógom je dlhý a pri každom kole rovnaký — do cache.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: systemovyPokyn(env.jazyk, env.dnes, env.firma, env.stranky),
      cache_control: { type: "ephemeral" },
    },
  ];

  const spravy: Anthropic.MessageParam[] = [
    ...spravyHistorie(v.historia),
    {
      role: "user",
      content: `<kontext>${JSON.stringify(kontextPreModel(v))}</kontext>\n<prikaz>${v.text.slice(0, 1000)}</prikaz>`,
    },
  ];

  let posledny = "";
  for (let kolo = 0; kolo < MAX_KOL; kolo++) {
    if (zostava() < 2_000) break;
    const ctrl = new AbortController();
    const casovac = setTimeout(() => ctrl.abort(), Math.max(1_000, zostava()));
    let odpoved: Anthropic.Message;
    try {
      odpoved = await env.volajModel(
        {
          model: MODEL_HLASU,
          max_tokens: 4096,
          system,
          output_config: { effort: "low" },
          tools: nastroje,
          tool_choice: { type: "auto" },
          messages: spravy,
        },
        ctrl.signal,
      );
    } finally {
      clearTimeout(casovac);
    }

    if (odpoved.stop_reason === "refusal") {
      posledny = "Na toto vám neviem odpovedať.";
      break;
    }
    const text = textOdpovede(odpoved);
    if (text) posledny = text;
    const volania = odpoved.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (odpoved.stop_reason !== "tool_use" || !volania.length) break;

    spravy.push({ role: "assistant", content: odpoved.content });
    const vysledky: Anthropic.ToolResultBlockParam[] = [];
    for (const b of volania) {
      let obsah: unknown;
      let chyba = false;
      try {
        obsah = await vykonaj(b, env, v, akcie, zname, zostava);
      } catch (e) {
        chyba = true;
        obsah = { chyba: String((e as Error)?.message ?? e).slice(0, 300) };
      }
      vysledky.push({
        type: "tool_result",
        tool_use_id: b.id,
        content: JSON.stringify(obsah),
        ...(chyba ? { is_error: true } : {}),
      });
    }
    // Všetky výsledky v jednej správe (paralelné volania).
    spravy.push({ role: "user", content: vysledky });
  }

  if (!posledny) {
    posledny = akcie.some((a) => a.typ === "navrh_akcie")
      ? "Návrh je v paneli. Potvrdíte?"
      : akcie.some((a) => a.typ === "navigovat" || a.typ === "prepnut_firmu")
        ? "Otváram."
        : akcie.some((a) => a.typ === "zoznam" || a.typ === "vyber_firmy")
          ? "Výsledky sú v paneli."
          : "Prepáčte, nestihla som to spracovať. Skúste to znova.";
  }
  return { text: posledny, akcie: zjednodusAkcie(akcie), zname: [...zname.values()].slice(-60) };
}

/** Z viacerých zoznamov ostane posledný; navigácia ide až po zozname. */
function zjednodusAkcie(akcie: AkciaHlasu[]): AkciaHlasu[] {
  const posledny = [...akcie].reverse().find((a) => a.typ === "zoznam");
  return akcie.filter((a) => a.typ !== "zoznam" || a === posledny);
}

const TYPY_UCTOVANIA: TypDokladuHlasu[] = ["nespracovany", "prijata", "blocek", "vystavena"];

function doZnamych(zname: Map<string, DokladNaObrazovke>, polozky: PolozkaZoznamuHlasu[]) {
  for (const p of polozky)
    if ((TYPY_UCTOVANIA as string[]).includes(p.typ))
      zname.set(p.id, {
        typ: p.typ as TypDokladuHlasu,
        id: p.id,
        cislo: p.cislo ?? null,
        partner: p.partner ?? null,
        suma: p.suma ?? null,
        mena: p.mena ?? null,
      });
}

/** Výsledok pre model: krátko, s id (na navigate/propose), bez zbytočných polí. */
function preModel(polozky: PolozkaZoznamuHlasu[]) {
  return polozky.map((p) => ({
    typ: p.typ,
    id: p.id,
    cislo: p.cislo ?? undefined,
    partner: p.partner ?? undefined,
    suma: p.suma ?? undefined,
    mena: p.mena ?? undefined,
    datum: p.datum ?? undefined,
    stav: p.stav ?? undefined,
  }));
}

const firmaHlasu = (f: FirmaNaVyber): FirmaHlasu => ({
  id: f.id,
  nazov: f.name,
  ico: f.ico ?? null,
  testovacia: Boolean(f.testovacia_pre),
});

async function vykonaj(
  b: Anthropic.ToolUseBlock,
  env: ProstredieHlasu,
  v: VstupHlasu,
  akcie: AkciaHlasu[],
  zname: Map<string, DokladNaObrazovke>,
  zostava: () => number,
): Promise<unknown> {
  // Vstup je podľa strict schémy, aj tak sa každé pole overí.
  const a = (b.input ?? {}) as Record<string, unknown>;
  switch (b.name) {
    case "navigate": {
      const nav = navigaciaPreStranku(
        env.stranky,
        String(a.stranka ?? ""),
        textAleboNull(a.id, 40),
        textAleboNull(a.hladat),
      );
      if (!nav)
        return { ok: false, chyba: "Táto stránka nie je v katalógu alebo chýba platné id." };
      const { nazov, ...navigacia } = nav;
      akcie.push({ typ: "navigovat", navigacia, nazov });
      return { ok: true, otvorene: nazov };
    }
    case "find_documents": {
      const druh = String(a.druh) as DruhHladania;
      if (!(DRUHY_HLADANIA as readonly string[]).includes(druh))
        return { chyba: "Neznámy druh dokladov." };
      const stav = (STAVY as string[]).includes(String(a.stav))
        ? (a.stav as StavHladania)
        : "vsetky";
      const datumOd = typeof a.datum_od === "string" && DATUM.test(a.datum_od) ? a.datum_od : null;
      const datumDo = typeof a.datum_do === "string" && DATUM.test(a.datum_do) ? a.datum_do : null;
      const suma = typeof a.suma === "number" && Number.isFinite(a.suma) ? a.suma : null;
      const vsetky = await env.nastroje.hladaj({
        druh,
        partner: textAleboNull(a.partner),
        cislo: textAleboNull(a.cislo, 40),
        suma,
        datumOd,
        datumDo,
        stav,
      });
      const limit = orez(Number(a.limit), 1, MAX_V_ZOZNAME);
      const polozky = vsetky.slice(0, Math.max(limit, 10));
      doZnamych(zname, polozky);
      if (a.otvorit === true && vsetky.length === 1) {
        const nav = navigaciaPolozky(vsetky[0]);
        if (nav) {
          akcie.push({ typ: "navigovat", navigacia: nav });
          return { pocet: 1, otvorene: preModel(vsetky)[0] };
        }
      }
      if (vsetky.length)
        akcie.push({
          typ: "zoznam",
          nadpis: nadpisZoznamu(druh, stav),
          polozky,
          celkom: vsetky.length,
        });
      return {
        pocet: vsetky.length,
        doklady: preModel(polozky.slice(0, limit)),
        poznamka: vsetky.length
          ? a.otvorit === true && vsetky.length > 1
            ? "Viac zhôd — zoznam je v paneli, nech si človek vyberie (alebo upresní)."
            : "Zoznam je v paneli."
          : "Nič sa nenašlo.",
      };
    }
    case "counts_overview":
      return env.nastroje.pocty();
    case "propose_accounting": {
      const ids = Array.isArray(a.ids)
        ? a.ids.filter((x): x is string => typeof x === "string")
        : [];
      const { doklady, vynechane } = dokladyNaNavrh(v.kontext, ids, [...zname.values()]);
      if (!doklady.length)
        return {
          chyba: ids.length
            ? "Tieto doklady nie sú na obrazovke ani v predošlom zozname."
            : "Na obrazovke nie sú žiadne doklady na zaúčtovanie.",
        };
      // Na návrh ostane čas po odpočítaní ďalšieho kola modelu.
      const navrh = await env.nastroje.navrhni(doklady, Math.max(3_000, zostava() - 6_000));
      navrh.vynechane += vynechane;
      akcie.push({ typ: "navrh_akcie", akcia: { druh: "zauctovanie", navrh } });
      return {
        zobrazene_na_potvrdenie: navrh.polozky.filter((p) => !p.nedaSa && p.predkontacia).length,
        neda_sa: navrh.polozky
          .filter((p) => p.nedaSa)
          .map((p) => `${p.cislo ?? p.partner ?? "doklad"}: ${p.nedaSa}`),
        vynechane: navrh.vynechane,
        polozky: navrh.polozky.map((p) => ({
          doklad: p.cislo,
          partner: p.partner,
          suma: p.suma,
          predkontacia: p.predkontacia,
          zdroj: p.zdroj,
        })),
        poznamka: "Nič nie je uložené — človek musí potvrdiť.",
      };
    }
    case "confirm_pending": {
      if (!v.cakaNavrh) return { ok: false, chyba: "Žiadny návrh nečaká na potvrdenie." };
      akcie.push({ typ: a.potvrdit === true ? "potvrdit" : "zrusit" });
      return {
        ok: true,
        poznamka: "Aplikácia zápis vykoná sama po kontrole súhlasu; povedz len krátko, čo sa deje.",
      };
    }
    case "switch_company": {
      const nazov = textAleboNull(a.nazov, 120);
      if (!nazov) return { chyba: "Chýba názov firmy." };
      const firmy = await env.nastroje.firmy();
      const { presna, kandidati } = najdiFirmu(firmy, nazov);
      if (presna) {
        if (presna.id === env.companyId) return { ok: true, uz_aktivna: presna.name };
        akcie.push({ typ: "prepnut_firmu", firma: firmaHlasu(presna) });
        return { ok: true, prepinam_na: presna.name, testovacia: Boolean(presna.testovacia_pre) };
      }
      if (kandidati.length) {
        akcie.push({ typ: "vyber_firmy", firmy: kandidati.map(firmaHlasu) });
        return {
          ok: false,
          viac_zhod: kandidati.map((f) => `${f.name}${f.testovacia_pre ? " (testovacia)" : ""}`),
          poznamka: "Výber je v paneli — nech povie, ktorú, alebo klikne.",
        };
      }
      return {
        ok: false,
        chyba: `Firmu „${nazov}“ medzi vašimi firmami nevidím.`,
        pocet_firiem: firmy.length,
      };
    }
    case "bank_overview": {
      const druh = String(a.druh);
      if (!["zostatky", "posledne_pohyby", "nesparovane"].includes(druh))
        return { chyba: "Neznámy druh." };
      const r = await env.nastroje.banka({
        druh: druh as "zostatky",
        hladat: textAleboNull(a.hladat),
        limit: orez(Number(a.limit), 1, MAX_V_ZOZNAME),
      });
      if (r.polozky.length)
        akcie.push({
          typ: "zoznam",
          nadpis: druh === "nesparovane" ? "Nespárované bankové pohyby" : "Bankové pohyby",
          polozky: r.polozky,
          celkom: r.polozky.length,
        });
      return { ...((r.suhrn as object) ?? {}), pohyby: preModel(r.polozky.slice(0, 10)) };
    }
    case "find_contacts": {
      const rola = ["odberatel", "dodavatel"].includes(String(a.rola))
        ? (a.rola as "odberatel")
        : "vsetci";
      const polozky = await env.nastroje.kontakty({ hladat: textAleboNull(a.hladat) ?? "", rola });
      if (polozky.length)
        akcie.push({ typ: "zoznam", nadpis: "Kontakty", polozky, celkom: polozky.length });
      return { pocet: polozky.length, kontakty: preModel(polozky.slice(0, 10)) };
    }
    case "find_products": {
      const polozky = await env.nastroje.produkty(textAleboNull(a.hladat));
      if (polozky.length)
        akcie.push({ typ: "zoznam", nadpis: "Produkty a sklad", polozky, celkom: polozky.length });
      return { pocet: polozky.length, polozky: preModel(polozky.slice(0, 10)) };
    }
    case "find_jobs": {
      const polozky = await env.nastroje.zakazky({
        hladat: textAleboNull(a.hladat),
        lenOtvorene: a.len_otvorene === true,
      });
      if (polozky.length)
        akcie.push({ typ: "zoznam", nadpis: "Zákazky", polozky, celkom: polozky.length });
      return { pocet: polozky.length, zakazky: preModel(polozky.slice(0, 10)) };
    }
    case "overdue_receivables":
      return env.nastroje.poSplatnosti();
    case "vat_summary": {
      const rok = orez(Number(a.rok), 2000, 2100);
      const mesiac = orez(Number(a.mesiac), 1, 12);
      return env.nastroje.dph(rok, mesiac);
    }
    default:
      return { chyba: `Neznámy nástroj ${b.name}` };
  }
}

const NAZVY_DRUHU: Record<DruhHladania, string> = {
  nespracovane: "Nespracované doklady",
  prijate: "Prijaté faktúry",
  vystavene: "Vystavené faktúry",
  blocky: "Bločky",
  ponuky: "Cenové ponuky",
  vsetky: "Doklady",
};
const NAZVY_STAVU: Record<StavHladania, string> = {
  vsetky: "",
  neuhradene: " — neuhradené",
  po_splatnosti: " — po splatnosti",
  nezauctovane: " — nezaúčtované",
};

export function nadpisZoznamu(druh: DruhHladania, stav: StavHladania): string {
  return NAZVY_DRUHU[druh] + NAZVY_STAVU[stav];
}

/* ---------- Skutočné vykonávače (klient prihláseného) ---------- */

/** Text do filtra PostgREST `.or()` — bez znakov, ktoré by rozbili syntax. */
export function bezpecnyHladanyText(s: string): string {
  return s
    .replace(/[,()*%\\:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function vykonavace(
  sb: Klient,
  companyId: string,
  userId: string,
  dnes: string,
): VykonavaceNastrojov {
  return {
    hladaj: (f) => hladajDoklady(sb, companyId, f, dnes),
    pocty: () => poctyPrehladu(sb, companyId, dnes),
    navrhni: (d, t) => navrhniPreDoklady(sb, companyId, userId, d, t),
    poSplatnosti: () => pohladavkyPoSplatnosti(sb, companyId),
    dph: (r, m) => dphZaMesiac(sb, companyId, r, m),
    firmy: () => mojeFirmy(sb, userId),
    banka: (a) => bankaPrehlad(sb, companyId, a),
    kontakty: (a) => hladajKontakty(sb, companyId, a),
    produkty: (h) => hladajProdukty(sb, companyId, h),
    zakazky: (a) => hladajZakazky(sb, companyId, a),
  };
}

/** Koľko riadkov sa najviac načíta na jedno hľadanie (strop PostgREST je 1 000). */
const STROP_HLADANIA = 1000;

type RiadokDokladu = RiadokHladania & { typ: PolozkaZoznamuHlasu["typ"] };

function stavTextu(r: RiadokHladania, dnes: string): string | null {
  if (r.uhradena === false)
    return r.splatnost && r.splatnost < dnes ? "po splatnosti" : "neuhradená";
  if (r.zauctovana === false) return "nezaúčtovaná";
  return null;
}

/**
 * Doklady podľa filtra. Z databázy sa berie obdobie a stav (to vie SQL),
 * meno partnera, číslo a suma sa porovnávajú tu — bez diakritiky a
 * s toleranciou chýb prepisu (`filtrujDoklady`).
 */
async function hladajDoklady(
  sb: Klient,
  companyId: string,
  f: FilterDokladov,
  dnes: string,
): Promise<PolozkaZoznamuHlasu[]> {
  const druhy: Exclude<DruhHladania, "vsetky">[] =
    f.druh === "vsetky" ? ["prijate", "vystavene", "nespracovane", "blocky"] : [f.druh];
  const riadky = (
    await Promise.all(druhy.map((d) => nacitajDruh(sb, companyId, d, f, dnes)))
  ).flat();
  const { filtrujDoklady } = await import("./hlas-hladanie");
  return filtrujDoklady(riadky, f, dnes).map((r) => ({
    typ: r.typ,
    id: r.id,
    cislo: r.cislo,
    partner: r.partner,
    suma: r.suma,
    mena: r.mena,
    datum: r.datum,
    stav: stavTextu(r, dnes),
  }));
}

async function nacitajDruh(
  sb: Klient,
  companyId: string,
  druh: Exclude<DruhHladania, "vsetky">,
  f: FilterDokladov,
  dnes: string,
): Promise<RiadokDokladu[]> {
  if (druh === "nespracovane") {
    const { data, error } = await sb
      .from("nespracovane_doklady")
      .select("id, zdroj, stav, druh, file_name, udaje, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const { zhrnutieNespracovaneho } = await import("./nespracovane");
    return (data ?? []).map((row: Record<string, unknown>) => {
      const z = zhrnutieNespracovaneho(row);
      return {
        typ: "nespracovany" as const,
        id: z.id,
        cislo: z.cislo,
        partner: z.dodavatel ?? z.subor,
        suma: z.suma,
        mena: z.mena,
        datum: z.datum ?? String(z.vytvorene ?? "").slice(0, 10),
        uhradena: null,
        zauctovana: Boolean(z.predkontacia),
      };
    });
  }
  const m = {
    prijate: {
      tab: "purchase_invoices",
      stlpce:
        "id, invoice_number, supplier_name, amount_total, currency, issue_date, due_date, status, payment_date, variable_symbol, zauctovane_at, exported_at, type",
      typ: "prijata" as const,
    },
    vystavene: {
      tab: "invoices",
      stlpce:
        "id, invoice_number, customer_name, total, currency, issue_date, due_date, status, paid_at, variable_symbol, zauctovane_at, exported_at, type, deleted_at",
      typ: "vystavena" as const,
    },
    blocky: {
      tab: "expense_documents",
      stlpce:
        "id, document_number, supplier_name, total_amount, currency, issue_date, zauctovane_at, exported_at",
      typ: "blocek" as const,
    },
    ponuky: {
      tab: "quotes",
      stlpce: "id, quote_number, customer_name, total, currency, issue_date, valid_until, status",
      typ: "ponuka" as const,
    },
  }[druh];
  let q = sb.from(m.tab).select(m.stlpce).eq("company_id", companyId);
  if (druh !== "blocky") q = q.is("deleted_at", null);
  if (f.datumOd) q = q.gte("issue_date", f.datumOd);
  if (f.datumDo) q = q.lte("issue_date", f.datumDo);
  if (f.stav === "nezauctovane" && druh !== "ponuky")
    q = q.is("zauctovane_at", null).is("exported_at", null);
  if ((f.stav === "neuhradene" || f.stav === "po_splatnosti") && druh === "prijate")
    q = q.not("status", "in", "(paid,cancelled,draft)").is("payment_date", null);
  if ((f.stav === "neuhradene" || f.stav === "po_splatnosti") && druh === "vystavene")
    q = q.not("status", "in", "(paid,cancelled,draft)").is("paid_at", null);
  if (f.stav === "po_splatnosti" && (druh === "prijate" || druh === "vystavene"))
    q = q.lt("due_date", dnes);
  const { data, error } = await q.order("issue_date", { ascending: false }).limit(STROP_HLADANIA);
  if (error) throw new Error(error.message);
  const { jeOtvorena } = await import("./faktury-sumy");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any): RiadokDokladu => {
    const zakl = {
      typ: m.typ,
      id: String(r.id),
      datum: r.issue_date ?? null,
      mena: r.currency ?? null,
    };
    switch (druh) {
      case "prijate":
        return {
          ...zakl,
          cislo: r.invoice_number ?? null,
          partner: r.supplier_name ?? null,
          suma: r.amount_total != null ? Number(r.amount_total) : null,
          splatnost: r.due_date ?? null,
          vs: r.variable_symbol ?? null,
          uhradena:
            r.status === "cancelled" || r.status === "draft" || r.type === "credit_note"
              ? null
              : r.status === "paid" || Boolean(r.payment_date),
          zauctovana: Boolean(r.zauctovane_at || r.exported_at),
        };
      case "vystavene":
        return {
          ...zakl,
          cislo: r.invoice_number ?? null,
          partner: r.customer_name ?? null,
          suma: r.total != null ? Number(r.total) : null,
          splatnost: r.due_date ?? null,
          vs: r.variable_symbol ?? null,
          uhradena: r.status === "draft" || r.status === "cancelled" ? null : !jeOtvorena(r),
          zauctovana: Boolean(r.zauctovane_at || r.exported_at),
        };
      case "blocky":
        return {
          ...zakl,
          cislo: r.document_number ?? null,
          partner: r.supplier_name ?? null,
          suma: r.total_amount != null ? Number(r.total_amount) : null,
          uhradena: null,
          zauctovana: Boolean(r.zauctovane_at || r.exported_at),
        };
      default:
        return {
          ...zakl,
          cislo: r.quote_number ?? null,
          partner: r.customer_name ?? null,
          suma: r.total != null ? Number(r.total) : null,
          uhradena: null,
          zauctovana: null,
        };
    }
  });
}

/** Počty pre „koľko…“ a „čo mi chýba zaúčtovať“ — každý cez `count: exact, head`. */
async function poctyPrehladu(sb: Klient, companyId: string, dnes: string) {
  const pocet = async (stavba: (q: Klient) => Klient, tab: string) => {
    const { count, error } = await stavba(
      sb.from(tab).select("id", { count: "exact", head: true }).eq("company_id", companyId),
    );
    return error ? null : (count ?? 0);
  };
  const [
    nespracovane,
    prijateNez,
    blockyNez,
    vystaveneNez,
    prijateNeuhr,
    vystaveneNeuhr,
    poSplatnosti,
  ] = await Promise.all([
    pocet((q) => q, "nespracovane_doklady"),
    pocet(
      (q) =>
        q
          .is("deleted_at", null)
          .is("zauctovane_at", null)
          .is("exported_at", null)
          .not("status", "in", "(draft,cancelled)"),
      "purchase_invoices",
    ),
    pocet((q) => q.is("zauctovane_at", null).is("exported_at", null), "expense_documents"),
    pocet(
      (q) =>
        q
          .is("deleted_at", null)
          .is("zauctovane_at", null)
          .is("exported_at", null)
          .not("status", "in", "(draft,cancelled)"),
      "invoices",
    ),
    pocet(
      (q) =>
        q
          .is("deleted_at", null)
          .not("status", "in", "(paid,cancelled,draft)")
          .is("payment_date", null),
      "purchase_invoices",
    ),
    pocet(
      (q) =>
        q
          .is("deleted_at", null)
          .not("status", "in", "(paid,cancelled,draft)")
          .is("paid_at", null)
          .neq("type", "credit_note"),
      "invoices",
    ),
    pocet(
      (q) =>
        q
          .is("deleted_at", null)
          .not("status", "in", "(paid,cancelled,draft)")
          .is("paid_at", null)
          .neq("type", "credit_note")
          .lt("due_date", dnes),
      "invoices",
    ),
  ]);
  return {
    nespracovane_doklady: nespracovane,
    na_zauctovanie: {
      prijate_faktury: prijateNez,
      blocky: blockyNez,
      vystavene_faktury: vystaveneNez,
    },
    neuhradene_prijate: prijateNeuhr,
    neuhradene_vystavene: vystaveneNeuhr,
    vystavene_po_splatnosti: poSplatnosti,
    poznamka:
      "Nezaúčtované = bez zaúčtovania a neodovzdané do účtovníctva (koncepty a stornované sa nerátajú).",
  };
}

/** Firmy prihláseného — ten istý zdroj ako prepínač (`fetchMyCompanies`): company_users + RLS. */
async function mojeFirmy(sb: Klient, userId: string): Promise<FirmaNaVyber[]> {
  const { data, error } = await sb
    .from("company_users")
    .select("company:companies(id, name, ico, testovacia_pre)")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r: { company: FirmaNaVyber | null }) => r.company)
    .filter((c: FirmaNaVyber | null): c is FirmaNaVyber => Boolean(c?.id));
}

async function bankaPrehlad(
  sb: Klient,
  companyId: string,
  a: Parameters<VykonavaceNastrojov["banka"]>[0],
): Promise<{ suhrn: unknown; polozky: PolozkaZoznamuHlasu[] }> {
  if (a.druh === "zostatky") {
    const { data, error } = await sb
      .from("bank_accounts")
      .select(
        "id, account_name, iban, currency, balance, booked_balance, last_synced_at, unavailable_reason",
      )
      .eq("company_id", companyId)
      .order("account_name");
    if (error) throw new Error(error.message);
    return {
      suhrn: {
        ucty: (data ?? []).map((u: Record<string, unknown>) => ({
          ucet: u.account_name ?? u.iban,
          mena: u.currency,
          disponibilny: u.balance,
          uctovny: u.booked_balance,
          aktualizovane: u.last_synced_at,
          nedostupny: u.unavailable_reason ?? undefined,
        })),
        poznamka: "Meny sa nesčítavajú.",
      },
      polozky: [],
    };
  }
  let q = sb
    .from("bank_transactions")
    .select(
      "id, amount, currency, booking_date, counterparty, description, variable_symbol, matched_invoice_id, matched_purchase_invoice_id, matched_expense_id, matched_other_document_id, matched_installment_id, vybavenie",
    )
    .eq("company_id", companyId);
  if (a.druh === "nesparovane")
    q = q
      .is("matched_invoice_id", null)
      .is("matched_purchase_invoice_id", null)
      .is("matched_expense_id", null)
      .is("matched_other_document_id", null)
      .is("matched_installment_id", null)
      .is("vybavenie", null);
  const { data, error } = await q
    .order("booking_date", { ascending: false })
    .limit(a.hladat ? 500 : a.limit);
  if (error) throw new Error(error.message);
  const { skoreZhody, normalizuj, PRAH_ZHODY } = await import("./hlas-hladanie");
  let riadky = (data ?? []) as Record<string, unknown>[];
  if (a.hladat) {
    const h = a.hladat;
    const hn = normalizuj(h);
    riadky = riadky.filter(
      (r) =>
        skoreZhody(h, r.counterparty as string) >= PRAH_ZHODY ||
        normalizuj(r.description as string).includes(hn) ||
        String(r.variable_symbol ?? "").includes(h.replace(/\D/g, "") || "~"),
    );
  }
  const polozky = riadky.slice(0, a.limit).map((r) => ({
    typ: "transakcia" as const,
    id: String(r.id),
    cislo: (r.variable_symbol as string) || null,
    partner: (r.counterparty as string) || String(r.description ?? "").slice(0, 60) || null,
    suma: r.amount != null ? Number(r.amount) : null,
    mena: (r.currency as string) ?? null,
    datum: (r.booking_date as string) ?? null,
    stav:
      r.matched_invoice_id ||
      r.matched_purchase_invoice_id ||
      r.matched_expense_id ||
      r.matched_other_document_id ||
      r.matched_installment_id ||
      r.vybavenie
        ? "spárovaná"
        : "nespárovaná",
  }));
  return { suhrn: { pocet: polozky.length }, polozky };
}

async function hladajKontakty(
  sb: Klient,
  companyId: string,
  a: Parameters<VykonavaceNastrojov["kontakty"]>[0],
): Promise<PolozkaZoznamuHlasu[]> {
  let q = sb
    .from("customers")
    .select("id, name, ico, city, email, odberatel, dodavatel")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  if (a.rola === "odberatel") q = q.eq("odberatel", true);
  if (a.rola === "dodavatel") q = q.eq("dodavatel", true);
  const { data, error } = await q.order("name").limit(STROP_HLADANIA);
  if (error) throw new Error(error.message);
  const { skoreZhody, PRAH_ZHODY } = await import("./hlas-hladanie");
  const ico = a.hladat.replace(/\D/g, "");
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({
      r,
      s:
        ico.length >= 6 && String(r.ico ?? "") === ico ? 1 : skoreZhody(a.hladat, r.name as string),
    }))
    .filter((x) => x.s >= PRAH_ZHODY)
    .sort((x, y) => y.s - x.s)
    .slice(0, MAX_V_ZOZNAME)
    .map(({ r }) => ({
      typ: (r.dodavatel && !r.odberatel ? "dodavatel" : "odberatel") as "odberatel",
      id: String(r.id),
      cislo: r.ico ? `IČO ${r.ico}` : null,
      partner: (r.name as string) ?? null,
      stav: [r.city, r.email].filter(Boolean).join(", ") || null,
    }));
}

async function hladajProdukty(
  sb: Klient,
  companyId: string,
  hladat: string | null,
): Promise<PolozkaZoznamuHlasu[]> {
  const { skoreZhody, normalizuj, PRAH_ZHODY } = await import("./hlas-hladanie");
  const [produkty, sklad, stavy] = await Promise.all([
    sb
      .from("products")
      .select("id, name, code, unit, unit_price, vat_rate, active")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .limit(STROP_HLADANIA),
    sb
      .from("stock_items")
      .select(
        "id, name_en, sku, unit, sale_price, min_stock, product_id, archived_at, products(name)",
      )
      .eq("company_id", companyId)
      .is("archived_at", null)
      .limit(STROP_HLADANIA),
    sb
      .from("stock_levels")
      .select("stock_item_id, quantity")
      .eq("company_id", companyId)
      .limit(STROP_HLADANIA),
  ]);
  const mnozstvo = new Map<string, number>();
  for (const s of (stavy.data ?? []) as { stock_item_id: string; quantity: number }[])
    mnozstvo.set(s.stock_item_id, (mnozstvo.get(s.stock_item_id) ?? 0) + Number(s.quantity ?? 0));
  const sedi = (meno: string | null, kod: string | null) =>
    !hladat ||
    skoreZhody(hladat, meno) >= PRAH_ZHODY ||
    (kod != null && normalizuj(kod).replace(/ /g, "") === normalizuj(hladat).replace(/ /g, ""));
  const out: PolozkaZoznamuHlasu[] = [];
  const skladovePodlaProduktu = new Set<string>();
  for (const s of (sklad.data ?? []) as Record<string, any>[]) {
    const meno = s.products?.name ?? s.name_en ?? s.sku ?? null;
    const mn = mnozstvo.get(s.id) ?? 0;
    if (s.product_id) skladovePodlaProduktu.add(s.product_id);
    if (!hladat && !(s.min_stock != null && mn < Number(s.min_stock))) continue;
    if (!sedi(meno, s.sku)) continue;
    out.push({
      typ: "produkt",
      id: String(s.id),
      cislo: s.sku ?? null,
      partner: meno,
      suma: s.sale_price != null ? Number(s.sale_price) : null,
      mena: "EUR",
      stav:
        `na sklade ${mn} ${s.unit ?? ""}`.trim() +
        (s.min_stock != null && mn < Number(s.min_stock) ? " (pod minimom)" : ""),
    });
  }
  if (hladat)
    for (const p of (produkty.data ?? []) as Record<string, any>[]) {
      if (skladovePodlaProduktu.has(p.id) || !sedi(p.name, p.code)) continue;
      out.push({
        // Produkt bez skladu nemá detail — klik otvorí cenník vyhľadaný podľa mena.
        typ: "produkt",
        id: `cennik:${p.id}`,
        cislo: p.code ?? null,
        partner: p.name ?? null,
        suma: p.unit_price != null ? Number(p.unit_price) : null,
        mena: "EUR",
        stav: `cenník, DPH ${p.vat_rate ?? "?"} %${p.active === false ? ", neaktívny" : ""}`,
      });
    }
  return out.slice(0, MAX_V_ZOZNAME);
}

async function hladajZakazky(
  sb: Klient,
  companyId: string,
  a: Parameters<VykonavaceNastrojov["zakazky"]>[0],
): Promise<PolozkaZoznamuHlasu[]> {
  let q = sb
    .from("jobs")
    .select(
      "id, job_number, name, customer_name, status, start_date, end_date, planned_revenue, closed_at",
    )
    .eq("company_id", companyId);
  if (a.lenOtvorene) q = q.is("closed_at", null);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(STROP_HLADANIA);
  if (error) throw new Error(error.message);
  const { skoreZhody, normalizuj, PRAH_ZHODY } = await import("./hlas-hladanie");
  const h = a.hladat;
  return ((data ?? []) as Record<string, any>[])
    .filter(
      (r) =>
        !h ||
        skoreZhody(h, r.name) >= PRAH_ZHODY ||
        skoreZhody(h, r.customer_name) >= PRAH_ZHODY ||
        normalizuj(r.job_number).replace(/ /g, "").includes(normalizuj(h).replace(/ /g, "")),
    )
    .slice(0, MAX_V_ZOZNAME)
    .map((r) => ({
      typ: "zakazka" as const,
      id: String(r.id),
      cislo: r.job_number ?? null,
      partner: [r.name, r.customer_name].filter(Boolean).join(" — ") || null,
      suma: r.planned_revenue != null ? Number(r.planned_revenue) : null,
      mena: "EUR",
      datum: r.start_date ?? null,
      stav: r.closed_at ? "uzavretá" : (r.status ?? "otvorená"),
    }));
}

/** Súbežne po štyroch, kým nevyprší čas; nestihnuté sa vrátia ako vynechané. */
async function navrhniPreDoklady(
  sb: Klient,
  companyId: string,
  userId: string,
  doklady: DokladNaObrazovke[],
  terminMs: number,
): Promise<NavrhHlasu> {
  const zaciatok = Date.now();
  const srv = await import("./auto-uctovanie.server");
  const ai = await import("./ai-predkontacia.server");
  const [firma, kontext] = await Promise.all([
    srv.nacitajFirmu(sb, companyId),
    ai.nacitajKontext(sb, companyId),
  ]);
  const fronta = [...doklady];
  const hotove = new Map<string, PolozkaNavrhuHlasu>();
  const pracuj = async () => {
    while (fronta.length && Date.now() - zaciatok < terminMs) {
      const d = fronta.shift()!;
      try {
        hotove.set(d.id, await navrhJedneho(sb, companyId, userId, d, { srv, ai, firma, kontext }));
      } catch (e) {
        hotove.set(
          d.id,
          prazdnaPolozka(d, `návrh zlyhal: ${String((e as Error)?.message ?? e).slice(0, 80)}`),
        );
      }
    }
  };
  await Promise.all([pracuj(), pracuj(), pracuj(), pracuj()]);
  return {
    polozky: doklady.map((d) => hotove.get(d.id)).filter((p): p is PolozkaNavrhuHlasu => !!p),
    vynechane: doklady.length - hotove.size,
  };
}

function prazdnaPolozka(d: DokladNaObrazovke, nedaSa: string): PolozkaNavrhuHlasu {
  return {
    typ: d.typ,
    id: d.id,
    cislo: d.cislo ?? null,
    partner: d.partner ?? null,
    suma: d.suma ?? null,
    mena: d.mena ?? null,
    predkontacia: null,
    clenenieDph: null,
    kvClenenie: null,
    zdroj: null,
    istota: null,
    upozornenia: [],
    nedaSa,
  };
}

const TEXT_STAVU: Record<string, string> = {
  netreba: "kódy sú už vyplnené alebo druh dokladu sa neúčtuje",
  prazdny: "nič isté sa nenašlo",
  bez_ciselnika: "chýba číselník predkontácií",
  nedostupny: "AI teraz neodpovedá",
  nepodporovane: "pre túto krajinu firmy sa návrh nerobí",
  bez_prava: "bez oprávnenia meniť doklady",
};

type Moduly = {
  srv: typeof import("./auto-uctovanie.server");
  ai: typeof import("./ai-predkontacia.server");
  firma: Awaited<ReturnType<typeof import("./auto-uctovanie.server").nacitajFirmu>>;
  kontext: Awaited<ReturnType<typeof import("./ai-predkontacia.server").nacitajKontext>>;
};

async function navrhJedneho(
  sb: Klient,
  companyId: string,
  userId: string,
  d: DokladNaObrazovke,
  m: Moduly,
): Promise<PolozkaNavrhuHlasu> {
  if (d.typ === "nespracovany") {
    const { data: row } = await sb
      .from("nespracovane_doklady")
      .select("*")
      .eq("id", d.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!row) return prazdnaPolozka(d, "doklad sa nenašiel");
    const ns = await import("./nespracovane");
    const z = ns.zhrnutieNespracovaneho(row);
    const zaklad = { ...d, cislo: z.cislo, partner: z.dodavatel, suma: z.suma, mena: z.mena };
    if (row.stav === "cita") return prazdnaPolozka(zaklad, "doklad sa ešte číta");
    const druh = druhNaNavrh(row, ns);
    if (!druh)
      return prazdnaPolozka(zaklad, "druh dokladu sa neúčtuje (vydaná, úhrada, iný doklad)");
    const v = await m.ai.navrhNespracovaneho(sb, { ...row, druh }, m.kontext, userId);
    const p = v.polia ?? {};
    const out: PolozkaNavrhuHlasu = {
      ...prazdnaPolozka(zaklad, ""),
      predkontacia: p.predkontacia?.hodnota ?? null,
      clenenieDph: p.clenenie?.hodnota ?? null,
      kvClenenie: p.kv?.hodnota ?? null,
      zdroj: p.predkontacia?.zdroj ?? p.clenenie?.zdroj ?? null,
      istota: v.istota ?? null,
      nedaSa: null,
    };
    if (v.stav !== "navrh") out.nedaSa = TEXT_STAVU[v.stav] ?? v.stav;
    else if (!out.predkontacia) out.nedaSa = "bez návrhu predkontácie";
    return out;
  }
  const typ = d.typ;
  const t = m.srv.TABULKY[typ];
  const { data: row } = await sb
    .from(t.tabulka)
    .select("*")
    .eq("id", d.id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!row) return prazdnaPolozka(d, "doklad sa nenašiel");
  const zaklad: DokladNaObrazovke = {
    ...d,
    cislo: row[t.cislo] ?? null,
    partner: row[t.meno] ?? null,
    suma: row[t.suma] != null ? Number(row[t.suma]) : null,
    mena: row.currency ?? null,
  };
  if (row.zauctovane_at) return prazdnaPolozka(zaklad, "už je zaúčtovaný");
  if (row.exported_at) return prazdnaPolozka(zaklad, "už je odovzdaný do účtovníctva");
  if (!(await m.srv.smieSaZauctovat(typ, row, sb)))
    return prazdnaPolozka(zaklad, "stav dokladu zaúčtovanie nedovoľuje");
  const n = await m.srv.navrhPreRiadok(sb, typ, row, {
    firma: m.firma,
    kontext: m.kontext,
    ai: true,
  });
  const { TEXTY_BLOKATOROV } = await import("./auto-uctovanie");
  return {
    ...prazdnaPolozka(zaklad, ""),
    predkontacia: n.predkontacia ?? null,
    clenenieDph: n.clenenieDph ?? null,
    kvClenenie: n.kvClenenie ?? null,
    zdroj: n.zdroj ?? null,
    istota: n.istota ?? null,
    upozornenia: (n.blokatory ?? []).map((b) => TEXTY_BLOKATOROV[b] ?? b),
    nedaSa: n.neprepisovat
      ? "uzamknuté obdobie alebo odovzdaný doklad"
      : !n.predkontacia
        ? "bez návrhu predkontácie"
        : null,
  };
}

const DRUHY_NAVRHU = ["faktura", "zalohova", "dobropis", "blocek"] as const;

function druhNaNavrh(
  row: Record<string, unknown>,
  ns: typeof import("./nespracovane"),
): (typeof DRUHY_NAVRHU)[number] | null {
  const druh =
    (row.druh as string | null) ??
    ns.navrhDruhu(row.ai as Record<string, unknown> | null, row.file_name as string | null);
  return (DRUHY_NAVRHU as readonly string[]).includes(String(druh))
    ? (druh as (typeof DRUHY_NAVRHU)[number])
    : null;
}

/* ---------- Potvrdenie (zápis) ---------- */

export type PolozkaPotvrdenia = { typ: TypDokladuHlasu; id: string; predkontacia: string };

/**
 * Zapíše potvrdený návrh. Návrh sa prepočíta (AI odpoveď je zapamätaná, nová
 * sa neplatí) a zapíše sa len vtedy, keď sa predkontácia zhoduje s tým, čo
 * človek videl — inak by sa potvrdilo niečo iné.
 * Prijaté, bločky, vystavené: `potvrdNavrhyDokladov` (tá istá cesta ako Na kontrolu).
 * Nespracované: kódy do údajov formulára, potvrdené (ako „Potvrdiť návrh“ + Uložiť).
 * Volajúci overí prístup (`overPristup` doklady + zápis).
 */
export async function potvrdNavrhHlasu(
  sb: Klient,
  companyId: string,
  userId: string,
  polozky: PolozkaPotvrdenia[],
): Promise<{ zapisanych: number; preskocene: string[] }> {
  const srv = await import("./auto-uctovanie.server");
  const ai = await import("./ai-predkontacia.server");
  const kontext = await ai.nacitajKontext(sb, companyId);
  const firma = await srv.nacitajFirmu(sb, companyId);
  const preskocene: string[] = [];
  let zapisanych = 0;
  const naDoklady: Parameters<typeof srv.potvrdNavrhyDokladov>[3] = [];

  for (const p of polozky) {
    if (p.typ === "nespracovany") {
      const r = await potvrdNespracovany(sb, companyId, userId, p, kontext);
      if (r === true) zapisanych++;
      else preskocene.push(r);
      continue;
    }
    const t = srv.TABULKY[p.typ];
    const { data: row } = await sb
      .from(t.tabulka)
      .select("*")
      .eq("id", p.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!row) {
      preskocene.push(`${p.id.slice(0, 8)}: doklad sa nenašiel`);
      continue;
    }
    const n = await srv.navrhPreRiadok(sb, p.typ, row, { firma, kontext, ai: true });
    if ((n.predkontacia ?? "") !== p.predkontacia) {
      preskocene.push(
        `${row[t.cislo] ?? p.id.slice(0, 8)}: návrh sa medzitým zmenil — navrhnite znova`,
      );
      continue;
    }
    naDoklady.push({ typ: p.typ, id: p.id, navrh: n });
  }
  if (naDoklady.length) {
    const r = await srv.potvrdNavrhyDokladov(sb, companyId, userId, naDoklady);
    zapisanych += r.zauctovanych;
    preskocene.push(...r.preskocene);
  }
  return { zapisanych, preskocene };
}

async function potvrdNespracovany(
  sb: Klient,
  companyId: string,
  userId: string,
  p: PolozkaPotvrdenia,
  kontext: Moduly["kontext"],
): Promise<true | string> {
  const { data: row } = await sb
    .from("nespracovane_doklady")
    .select("*")
    .eq("id", p.id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!row) return `${p.id.slice(0, 8)}: doklad sa nenašiel`;
  const ns = await import("./nespracovane");
  const meno = ns.zhrnutieNespracovaneho(row).cislo ?? p.id.slice(0, 8);
  const druh = druhNaNavrh(row, ns);
  if (!druh) return `${meno}: druh dokladu sa neúčtuje`;
  const ai = await import("./ai-predkontacia.server");
  const v = await ai.navrhNespracovaneho(sb, { ...row, druh }, kontext, userId);
  if (v.stav !== "navrh" || (v.polia.predkontacia?.hodnota ?? "") !== p.predkontacia)
    return `${meno}: návrh sa medzitým zmenil — navrhnite znova`;
  const { doplnNavrhDoUdajov, potvrdNavrhAi } = await import("./ai-predkontacia");
  // Ako vo formulári: návrh do prázdnych polí, potom „Potvrdiť návrh“.
  // Kódy z pravidla formulár doplní sám pri vytvorení dokladu (pravidlo_id).
  const udaje = potvrdNavrhAi(doplnNavrhDoUdajov(ns.nacitajUdaje(row.udaje), v.polia, v.dovod));
  const { data, error } = await sb
    .from("nespracovane_doklady")
    .update({ druh: row.druh ?? druh, udaje, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("company_id", companyId)
    .select("id");
  if (error) return `${meno}: ${error.message}`;
  if (!data?.length) return `${meno}: doklad sa nenašiel`;
  return true;
}

/* ---------- Súhrny ---------- */

async function pohladavkyPoSplatnosti(sb: Klient, companyId: string) {
  const { dnesBratislava } = await import("./datum-vystavenia");
  const { jePoSplatnosti } = await import("./faktury-sumy");
  const { vsetkyRiadky } = await import("./strankovanie");
  const dnes = dnesBratislava();
  const riadky = await vsetkyRiadky<Record<string, unknown>>((od, po) =>
    sb
      .from("invoices")
      .select(
        "id, invoice_number, customer_name, total, currency, due_date, status, type, paid_at, deleted_at",
      )
      .eq("company_id", companyId)
      .in("status", ["issued", "sent"])
      .is("deleted_at", null)
      .lt("due_date", dnes)
      .order("id")
      .range(od, po),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const po = riadky.filter((f) => jePoSplatnosti(f as any, dnes));
  const spolu: Record<string, number> = {};
  const dlznici = new Map<string, number>();
  for (const f of po) {
    const mena = String(f.currency ?? "EUR");
    const suma = Number(f.total ?? 0);
    spolu[mena] = Math.round(((spolu[mena] ?? 0) + suma) * 100) / 100;
    const k = `${f.customer_name ?? "?"} (${mena})`;
    dlznici.set(k, Math.round(((dlznici.get(k) ?? 0) + suma) * 100) / 100);
  }
  return {
    pocet: po.length,
    spolu_podla_meny: spolu,
    najvacsi_dlznici: [...dlznici.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([kto, suma]) => ({ kto, suma })),
  };
}

async function dphZaMesiac(sb: Klient, companyId: string, rok: number, mesiac: number) {
  const { nacitajDokladyDph, suctyDph } = await import("./dph-prehlad-data");
  const { krajinaDane } = await import("./vat-rates");
  const { data: c } = await sb
    .from("companies")
    .select("country")
    .eq("id", companyId)
    .maybeSingle();
  const krajina = krajinaDane(c?.country);
  const mm = String(mesiac).padStart(2, "0");
  const posledny = new Date(Date.UTC(rok, mesiac, 0)).getUTCDate();
  const d = await nacitajDokladyDph(sb, companyId, `${rok}-${mm}-01`, `${rok}-${mm}-${posledny}`);
  return {
    obdobie: `${mm}/${rok}`,
    mena: krajina === "CZ" ? "CZK" : "EUR",
    ...suctyDph(d, krajina),
    poznamka: "Informatívny prehľad podľa dokladov vo Fakteru, nie podané priznanie.",
  };
}

/* ---------- Kto smie ---------- */

export const CHYBA_LEN_ADMINI = "Hlasové ovládanie je zatiaľ len pre administrátorov Faktera.";

/**
 * Brána pre obe serverové funkcie: kým `HLAS_PRE` je „admini“, smie len
 * riadok v `platform_admins` (číta sa klientom prihláseného — RLS ukáže len
 * jeho vlastný riadok). Dáta potom aj tak stráži RLS a `overPristup`.
 */
export async function overSmieHlas(ctx: {
  supabase: Klient;
  userId: string;
}): Promise<{ admin: boolean }> {
  const { HLAS_PRE, ucetSmieHlas } = await import("./hlas");
  const { data, error } = await ctx.supabase
    .from("platform_admins")
    .select("role")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const admin = !error && Boolean(data);
  if (HLAS_PRE === "vsetci") return { admin };
  if (!ucetSmieHlas(ctx.userId) || !admin) throw new Error(CHYBA_LEN_ADMINI);
  return { admin };
}

/** Skutočné volanie Clauda s meraním do `ai_pouzitie` (účel „hlas“). */
export function volajClauda(companyId: string): ProstredieHlasu["volajModel"] {
  return async (p, signal) => {
    const { dajKlienta } = await import("./anthropic.server");
    const { zmeraj } = await import("./ai-merac.server");
    return zmeraj(
      { poskytovatel: "anthropic", model: p.model, ucel: "hlas", firma: companyId },
      async (ohlas) => {
        const m = await dajKlienta().messages.create(p, { signal });
        const u = m.usage;
        ohlas({
          vstup:
            (u?.input_tokens ?? 0) +
            (u?.cache_creation_input_tokens ?? 0) +
            (u?.cache_read_input_tokens ?? 0),
          vystup: u?.output_tokens ?? null,
        });
        return m;
      },
    );
  };
}
