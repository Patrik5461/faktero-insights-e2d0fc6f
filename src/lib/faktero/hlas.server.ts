/*
  Hlasové ovládanie (TEST) — mozog na serveri.

  `spracujPrikaz` pošle prepis vety, kontext stránky a posledné kolá
  rozhovoru Claudovi (Haiku 5.5) s malou sadou nástrojov a vykoná, čo si
  model vypýta. Všetko číta klient prihláseného (RLS + `overPristup` vo
  volajúcom), takže hlas nevidí nič, čo človek nevidí v aplikácii.

  Model nič nezapisuje. Návrh zaúčtovania sa vráti prehliadaču, ten ho ukáže
  a zapíše až po potvrdení (`potvrdNavrhHlasu`, rovnaké cesty ako Na
  kontrolu a formulár Nespracovaných — zámky, duplicity, schvaľovanie platia).

  Čas: nginx strihá po ~30 s, preto celé volanie beží v termíne ~24 s a návrh
  sa robí najviac pre `MAX_NAVRHOV` dokladov (zvyšok sa ohlási ako vynechaný).
*/

import type Anthropic from "@anthropic-ai/sdk";
import {
  CIELE,
  cestaPreCiel,
  dokladyNaNavrh,
  type AkciaHlasu,
  type DokladNaObrazovke,
  type KoloHlasu,
  type KontextHlasu,
  type NavrhHlasu,
  type OdpovedHlasu,
  type PolozkaNavrhuHlasu,
  type TypDokladuHlasu,
} from "./hlas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Klient = any;

export const MODEL_HLASU = "claude-haiku-5-5";
const TERMIN_MS = 24_000;
const MAX_KOL = 4;

/* ---------- Nástroje (strict) ---------- */

const NULL_ALEBO = (t: Record<string, unknown>) => ({ anyOf: [t, { type: "null" }] });

export const NASTROJE: Anthropic.Tool[] = [
  {
    name: "navigate",
    description:
      "Otvorí stránku aplikácie Faktero. Použi, keď človek chce niečo otvoriť, ukázať alebo prejsť niekam. Detail dokladu (detail_*) potrebuje id z kontextu alebo zo zoznamu; ostatné ciele id nemajú (null).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        ciel: { type: "string", enum: [...CIELE] },
        id: NULL_ALEBO({ type: "string" }),
      },
      required: ["ciel", "id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_documents",
    description:
      "Vyhľadá doklady firmy (len čítanie). druh: nespracovane = nahraté doklady čakajúce na spracovanie, prijate = prijaté faktúry, vystavene = vystavené faktúry, blocky = bločky. hladat = časť mena partnera alebo čísla dokladu (alebo null). Vráti najviac `limit` (1–20) najnovších.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        druh: { type: "string", enum: ["nespracovane", "prijate", "vystavene", "blocky"] },
        hladat: NULL_ALEBO({ type: "string" }),
        len_nezauctovane: { type: "boolean" },
        limit: { type: "integer" },
      },
      required: ["druh", "hladat", "len_nezauctovane", "limit"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_accounting",
    description:
      "Navrhne zaúčtovanie (predkontácia, členenie DPH, KV) pre doklady — NIČ neuloží, len ukáže návrh na potvrdenie. ids: id dokladov z kontextu alebo z list_documents; prázdne pole = označené doklady, inak otvorený doklad, inak doklady na obrazovke. Naraz najviac 10.",
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
      "Rozhodnutie o čakajúcom návrhu zaúčtovania. potvrdit=true len keď človek práve výslovne povedal súhlas (potvrď, áno, ulož); potvrdit=false keď ho zrušil. Zápis vykoná aplikácia až po vlastnej kontrole.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { potvrdit: { type: "boolean" } },
      required: ["potvrdit"],
      additionalProperties: false,
    },
  },
  {
    name: "overdue_receivables",
    description:
      "Pohľadávky po splatnosti — neuhradené vystavené faktúry po dátume splatnosti: počet, súčet podľa meny a najväčší dlžníci.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
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

const JAZYK_ODPOVEDE: Record<string, string> = {
  sk: "po slovensky",
  cs: "česky",
  de: "auf Deutsch",
};

export function systemovyPokyn(jazyk: string, dnes: string): string {
  return [
    "Si hlasová asistentka účtovnej aplikácie Faktero (fakturácia, prijaté doklady, zaúčtovanie do Pohody). Hovoríš ženským hlasom, preto o sebe hovor v ženskom rode (otvorila som, navrhla som).",
    "Človek hovorí do mikrofónu — prepis môže mať chyby, domysli zmysel.",
    "Na všetko použi nástroje; nevymýšľaj čísla, doklady ani kódy.",
    "Navigácia: „otvor/ukáž/choď na …“ → navigate. Nespracované = nespracovane, prijaté faktúry = prijate_faktury, vystavené/vydané faktúry = vystavene_faktury, bločky = blocky, banka = banka, exporty = uctovne_exporty, DPH = dph_prehlad, výkazy/priznanie = dph_vykazy, na kontrolu = na_kontrolu.",
    "„Navrhni zaúčtovanie“ → propose_accounting s ids=[] (aplikácia vezme označené, otvorený alebo doklady na obrazovke), alebo s ids konkrétnych dokladov.",
    "Kým nie je zobrazený návrh, nič sa neukladá. Keď návrh čaká a človek povie súhlas, zavolaj confirm_pending(potvrdit=true); pri „zruš/nie“ potvrdit=false. Nikdy nepotvrdzuj bez výslovného súhlasu.",
    "Iné zápisy (odoslanie, mazanie, vystavenie, úhrady) nerobíš — povedz, že to v tejto skúšobnej verzii nejde.",
    `Odpovedaj ${JAZYK_ODPOVEDE[jazyk] ?? JAZYK_ODPOVEDE.sk}, jednou až dvoma krátkymi vetami, bez markdownu, bez zoznamov a bez id — odpoveď sa číta nahlas. Sumy zaokrúhli na eurá.`,
    `Dnes je ${dnes}.`,
  ].join("\n");
}

/* ---------- Vykonávače nástrojov ---------- */

export type VykonavaceNastrojov = {
  zoznam: (a: {
    druh: "nespracovane" | "prijate" | "vystavene" | "blocky";
    hladat: string | null;
    lenNezauctovane: boolean;
    limit: number;
  }) => Promise<DokladNaObrazovke[]>;
  navrhni: (doklady: DokladNaObrazovke[], terminMs: number) => Promise<NavrhHlasu>;
  poSplatnosti: () => Promise<unknown>;
  dph: (rok: number, mesiac: number) => Promise<unknown>;
};

export type ProstredieHlasu = {
  jazyk: string;
  dnes: string;
  companyId: string;
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

/**
 * Jeden príkaz: manuálna slučka nástrojov (najviac 4 kolá), v termíne.
 */
export async function spracujPrikaz(env: ProstredieHlasu, v: VstupHlasu): Promise<OdpovedHlasu> {
  const zaciatok = Date.now();
  const termin = env.terminMs ?? TERMIN_MS;
  const zostava = () => termin - (Date.now() - zaciatok);
  const akcie: AkciaHlasu[] = [];
  const zname = new Map<string, DokladNaObrazovke>(v.zname.map((d) => [d.id, d]));

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
          system: systemovyPokyn(env.jazyk, env.dnes),
          output_config: { effort: "low" },
          tools: NASTROJE,
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
    const navrh = akcie.find((a) => a.typ === "navrh");
    posledny = navrh
      ? "Návrh zaúčtovania je v paneli. Potvrdíte?"
      : akcie.some((a) => a.typ === "navigovat")
        ? "Otváram."
        : "Prepáčte, nestihla som to spracovať. Skúste to znova.";
  }
  return { text: posledny, akcie, zname: [...zname.values()].slice(-60) };
}

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
      const ciel = String(a.ciel ?? "");
      const id = typeof a.id === "string" ? a.id : null;
      const nav = cestaPreCiel(ciel, id);
      if (!nav) return { ok: false, chyba: "Tento cieľ nie je povolený alebo chýba platné id." };
      akcie.push({ typ: "navigovat", ciel: ciel as (typeof CIELE)[number], navigacia: nav });
      return { ok: true, otvorene: ciel };
    }
    case "list_documents": {
      const druh = String(a.druh);
      if (!["nespracovane", "prijate", "vystavene", "blocky"].includes(druh))
        return { chyba: "Neznámy druh dokladov." };
      const doklady = await env.nastroje.zoznam({
        druh: druh as "nespracovane",
        hladat: typeof a.hladat === "string" && a.hladat.trim() ? a.hladat.trim().slice(0, 60) : null,
        lenNezauctovane: a.len_nezauctovane === true,
        limit: orez(Number(a.limit), 1, 20),
      });
      for (const d of doklady) zname.set(d.id, d);
      return { pocet: doklady.length, doklady };
    }
    case "propose_accounting": {
      const ids = Array.isArray(a.ids) ? a.ids.filter((x): x is string => typeof x === "string") : [];
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
      akcie.push({ typ: "navrh", navrh });
      return {
        zobrazene_na_potvrdenie: navrh.polozky.filter((p) => !p.nedaSa && p.predkontacia).length,
        neda_sa: navrh.polozky.filter((p) => p.nedaSa).map((p) => `${p.cislo ?? p.partner ?? "doklad"}: ${p.nedaSa}`),
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

/* ---------- Skutočné vykonávače (klient prihláseného) ---------- */

/** Text do filtra PostgREST `.or()` — bez znakov, ktoré by rozbili syntax. */
export function bezpecnyHladanyText(s: string): string {
  return s.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function vykonavace(sb: Klient, companyId: string, userId: string): VykonavaceNastrojov {
  return {
    zoznam: (a) => zoznamDokladov(sb, companyId, a),
    navrhni: (d, t) => navrhniPreDoklady(sb, companyId, userId, d, t),
    poSplatnosti: () => pohladavkyPoSplatnosti(sb, companyId),
    dph: (r, m) => dphZaMesiac(sb, companyId, r, m),
  };
}

async function zoznamDokladov(
  sb: Klient,
  companyId: string,
  a: Parameters<VykonavaceNastrojov["zoznam"]>[0],
): Promise<DokladNaObrazovke[]> {
  const h = a.hladat ? bezpecnyHladanyText(a.hladat) : "";
  if (a.druh === "nespracovane") {
    const { data, error } = await sb
      .from("nespracovane_doklady")
      .select("id, zdroj, stav, druh, file_name, udaje, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const { zhrnutieNespracovaneho } = await import("./nespracovane");
    return (data ?? [])
      .map((r: Record<string, unknown>) => zhrnutieNespracovaneho(r))
      .filter(
        (z: { dodavatel: string | null; cislo: string | null; predkontacia: string | null }) =>
          (!h ||
            [z.dodavatel, z.cislo].some((x) => x && x.toLowerCase().includes(h.toLowerCase()))) &&
          (!a.lenNezauctovane || !z.predkontacia),
      )
      .slice(0, a.limit)
      .map((z: { id: string; cislo: string | null; dodavatel: string | null; suma: number | null; mena: string }) => ({
        typ: "nespracovany" as const,
        id: z.id,
        cislo: z.cislo,
        partner: z.dodavatel,
        suma: z.suma,
        mena: z.mena,
      }));
  }
  const m = {
    prijate: { tab: "purchase_invoices", cislo: "invoice_number", meno: "supplier_name", suma: "amount_total", typ: "prijata" },
    vystavene: { tab: "invoices", cislo: "invoice_number", meno: "customer_name", suma: "total", typ: "vystavena" },
    blocky: { tab: "expense_documents", cislo: "document_number", meno: "supplier_name", suma: "total_amount", typ: "blocek" },
  }[a.druh];
  let q = sb
    .from(m.tab)
    .select(`id, ${m.cislo}, ${m.meno}, ${m.suma}, currency, issue_date`)
    .eq("company_id", companyId)
    .order("issue_date", { ascending: false })
    .limit(a.limit);
  if (a.druh !== "blocky") q = q.is("deleted_at", null);
  if (a.lenNezauctovane) q = q.is("zauctovane_at", null).is("exported_at", null);
  if (h) q = q.or(`${m.meno}.ilike.*${h}*,${m.cislo}.ilike.*${h}*`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    typ: m.typ as TypDokladuHlasu,
    id: String(r.id),
    cislo: (r[m.cislo] as string) ?? null,
    partner: (r[m.meno] as string) ?? null,
    suma: r[m.suma] != null ? Number(r[m.suma]) : null,
    mena: (r.currency as string) ?? null,
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
        hotove.set(d.id, prazdnaPolozka(d, `návrh zlyhal: ${String((e as Error)?.message ?? e).slice(0, 80)}`));
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
    if (!druh) return prazdnaPolozka(zaklad, "druh dokladu sa neúčtuje (vydaná, úhrada, iný doklad)");
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
  const n = await m.srv.navrhPreRiadok(sb, typ, row, { firma: m.firma, kontext: m.kontext, ai: true });
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
  const druh = (row.druh as string | null) ?? ns.navrhDruhu(row.ai as Record<string, unknown> | null, row.file_name as string | null);
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
      preskocene.push(`${row[t.cislo] ?? p.id.slice(0, 8)}: návrh sa medzitým zmenil — navrhnite znova`);
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
      .select("id, invoice_number, customer_name, total, currency, due_date, status, type, paid_at, deleted_at")
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
  const { data: c } = await sb.from("companies").select("country").eq("id", companyId).maybeSingle();
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
export async function overSmieHlas(ctx: { supabase: Klient; userId: string }): Promise<void> {
  const { HLAS_PRE, ucetSmieHlas } = await import("./hlas");
  if (HLAS_PRE === "vsetci") return;
  if (!ucetSmieHlas(ctx.userId)) throw new Error(CHYBA_LEN_ADMINI);
  const { data, error } = await ctx.supabase
    .from("platform_admins")
    .select("role")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error || !data) throw new Error(CHYBA_LEN_ADMINI);
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
