/**
 * Jedna cesta k modelu — s náhradou, keď prvý poskytovateľ zlyhá.
 *
 * Dovtedy si každé rozpoznávanie vyberalo poskytovateľa podľa toho, či je
 * nastavený `GEMINI_API_KEY`. Keď kľúč nastavený je, ale Gemini odpovie
 * chybou — a to sa stane pri vyčerpaných kredite (`429 RESOURCE_EXHAUSTED`),
 * pri výpadku aj pri preťažení — spadlo celé čítanie, hoci kľúč k OpenAI ležal
 * v tom istom prostredí nevyužitý. Rozpoznávanie bločkov, dokladov z pošty,
 * dodacích listov, zmlúv o financovaní aj bankových výpisov tak vypadlo naraz.
 *
 * Preto sa volá cez tieto dve funkcie a poskytovatelia sa skúšajú po poradí
 * (`poradie`). Do logu sa zapíše, prečo — inak by sa tichý prechod na drahší
 * model nikdy nezistil.
 *
 * - vyťažovanie dokladu: Gemini Pro → Claude Opus → Gemini Flash → OpenAI,
 * - ostatné (predkontácia, krátky text, rýchle čítanie): Gemini Flash →
 *   Claude Haiku → OpenAI.
 *
 * Bez `ANTHROPIC_API_KEY` sa Claude preskočí a správanie je ako predtým.
 */

import { zmeraj } from "./ai-merac.server";
import {
  modelClaude,
  modelClaudeVytazenie,
  modelGeminiVytazenie,
  modelGemini,
  modelOpenAi,
} from "./ai-modely";

export type AiNastavenie = {
  /** Strop odpovede. Dlhý splátkový kalendár sa do predvoleného nezmestí. */
  maxOutputTokens?: number;
  /** Vypýta si čistý JSON. */
  json?: boolean;
  /** Agenda, ktorá si model vypýtala — kvôli prehľadu využitia v admine. */
  ucel?: string;
  /** Firma, ktorej sa dokument týka; pri verejných volaniach chýba. */
  firma?: string | null;
  /** Rozhovor nepotrebuje, aby model najprv premýšľal — len by minul strop. */
  bezUvazovania?: boolean;
  /**
   * Gemini vidí stránky dokumentu vo vysokom rozlíšení (`mediaResolution`).
   * Fotka faktúry vložená do PDF sa v predvolenom rozlíšení číta zle — METRO
   * (RHJ, 16. 11.) dalo vymyslený dátum, IČO, základ aj DPH.
   */
  vysokeRozlisenie?: boolean;
  /**
   * Schéma JSON odpovede (podmnožina OpenAPI). Gemini ju dodrží priamo;
   * OpenAI dostane len `json_object` — volajúci odpoveď aj tak overuje.
   */
  schema?: Record<string, unknown>;
  /**
   * Ohlási, kto naozaj odpovedal (Gemini, alebo OpenAI ako náhrada). Polohy
   * údajov na doklade vie presne len Gemini — OpenAI si ich vymýšľa.
   */
  odpovedal?: (poskytovatel: "gemini" | "openai" | "anthropic") => void;
  /**
   * Vyťažovanie dokladu — číta sa vyšším modelom (`modelGeminiVytazenie`).
   * `limitMs`: koľko času vyšší model dostane, potom (aj pri chybe) sa číta
   * bežným modelom. Kde na odpoveď čaká prehliadač (nginx pretne po 30 s),
   * volajúci vyšší model nepýta vôbec (`false`).
   */
  vytazenie?: { limitMs?: number } | boolean;
};

/**
 * Ako dlho sa Gemini po vyčerpaní kreditu preskakuje.
 *
 * Kľúč ostáva nastavený aj vtedy, keď kredit dôjde, takže sa naň chodilo pri
 * každom volaní znova — a pri výpise rozdelenom na desať kusov to bolo desať
 * zaručene neúspešných kôl navyše, každé so svojím čakaním. Prvé odmietnutie
 * preto Gemini na chvíľu umlčí a ide sa rovno na OpenAI.
 */
const TICHO_MS = 10 * 60_000;
let geminiTichoDo = 0;

/**
 * Odmietnutie, ktoré neprejde samo — nie výpadok, opakovať netreba.
 *
 * Okrem vyčerpaného kreditu sem patrí aj zamknutý projekt (`403
 * PERMISSION_DENIED`). Overené 2026-09-23: Gemini takto odmietal každé volanie
 * a keďže to za dôvod na umlčanie neplatilo, každé rozpoznávanie sa najprv
 * márne spýtalo jeho a až potom šlo na OpenAI.
 */
function jeVycerpanyKredit(e: unknown): boolean {
  return /429|RESOURCE_EXHAUSTED|quota|credits|403|PERMISSION_DENIED|denied access/i.test(
    String((e as Error)?.message ?? e),
  );
}

function maGemini(): boolean {
  if (!process.env.GEMINI_API_KEY?.trim()) return false;
  if (Date.now() < geminiTichoDo) return false;
  return true;
}

function umlcGemini(e: unknown): void {
  if (!jeVycerpanyKredit(e)) return;
  geminiTichoDo = Date.now() + TICHO_MS;
  console.warn(
    `[ai] Gemini odmieta volania, ${TICHO_MS / 60_000} minút sa naň nechodí:`,
    String((e as Error)?.message ?? e).slice(0, 120),
  );
}

/**
 * Istič pre vyšší model (Gemini Pro, náhľad). Keď odpovie `503 high demand`
 * (alebo 429 / preťaženie), 10 minút sa naň nechodí a doklad ide rovno na
 * Claude — inak by každý doklad najprv čakal na zaručene neúspešné volanie.
 * Časový limit istič nezapína: dlhý doklad nestihne aj zdravý model.
 */
let proTichoDo = 0;

function proZapnuty(): boolean {
  return Date.now() >= proTichoDo;
}

export function jePretazenie(e: unknown): boolean {
  return /\b(429|503|529)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overload|high demand/i.test(
    String((e as Error)?.message ?? e),
  );
}

function vypniPro(e: unknown): void {
  if (!jePretazenie(e)) return;
  proTichoDo = Date.now() + TICHO_MS;
  console.warn(
    `[ai] ${modelGeminiVytazenie()} je preťažený, ${TICHO_MS / 60_000} minút sa naň nechodí:`,
    String((e as Error)?.message ?? e).slice(0, 120),
  );
}

/** Claude — umlčí sa len pri zlom kľúči alebo minutom kredite, nie pri výpadku. */
let claudeTichoDo = 0;

function claudeKluc(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function claudeUmlcany(): boolean {
  return claudeKluc() && Date.now() < claudeTichoDo;
}

function maClaude(): boolean {
  return claudeKluc() && !claudeUmlcany();
}

function umlcClaude(e: unknown): void {
  if (!/Claude (401|402|403)\b|credit balance|billing/i.test(String((e as Error)?.message ?? e)))
    return;
  claudeTichoDo = Date.now() + TICHO_MS;
  console.warn(
    `[ai] Claude odmieta volania, ${TICHO_MS / 60_000} minút sa naň nechodí:`,
    String((e as Error)?.message ?? e).slice(0, 120),
  );
}

/** Typy, ktoré Claude prečíta (obrázky a PDF); HEIC a pod. sa mu neposielajú. */
function claudeVidi(mimeType: string): boolean {
  return /^(application\/pdf|image\/(jpeg|png|gif|webp))$/i.test(mimeType);
}

/** Limit Claude pri vyťažovaní (Opus uvažuje) a pri krátkych úlohách (Haiku). */
const LIMIT_CLAUDE_VYTAZENIE_MS = 90_000;
const LIMIT_CLAUDE_MS = 60_000;

function maOpenAi(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Čo je práve nastavené a či sa na Gemini chodí.
 *
 * Umlčanie si modul drží v pamäti procesu, takže inak sa zvonku zistiť nedá —
 * a práve ono je najbližšie k odpovedi na otázku „minul sa kredit?“.
 */
export function stavAi(): {
  gemini: {
    kluc: boolean;
    model: string;
    umlcanyDo: string | null;
    modelVytazenie: string;
    vytazenieVypnuteDo: string | null;
  };
  anthropic: { kluc: boolean; model: string; modelVytazenie: string; umlcanyDo: string | null };
  openai: { kluc: boolean; model: string; modelVidiaci: string };
} {
  return {
    gemini: {
      kluc: Boolean(process.env.GEMINI_API_KEY?.trim()),
      model: modelGemini(),
      umlcanyDo: geminiTichoDo > Date.now() ? new Date(geminiTichoDo).toISOString() : null,
      modelVytazenie: modelGeminiVytazenie(),
      vytazenieVypnuteDo: proTichoDo > Date.now() ? new Date(proTichoDo).toISOString() : null,
    },
    anthropic: {
      kluc: claudeKluc(),
      model: modelClaude(),
      modelVytazenie: modelClaudeVytazenie(),
      umlcanyDo: claudeTichoDo > Date.now() ? new Date(claudeTichoDo).toISOString() : null,
    },
    openai: {
      kluc: maOpenAi(),
      model: modelOpenAi(false),
      modelVidiaci: modelOpenAi(true),
    },
  };
}

function bezPoskytovatela(): never {
  throw new Error(
    "Rozpoznávanie dokumentov nie je nastavené — chýba kľúč ku Gemini, Claude aj k OpenAI.",
  );
}

/**
 * Chyba, po ktorej má zmysel skúsiť druhého poskytovateľa.
 *
 * Odrezaná odpoveď medzi ne nepatrí: dokument je jednoducho dlhý a druhý model
 * ho neprečíta o nič lepšie, len sa zaplatí dvakrát.
 */
function opravitelna(e: unknown): boolean {
  const s = String((e as Error)?.message ?? e);
  return !/nezmestila/i.test(s);
}

const POKUSOV = 3;

/**
 * Odmietnutie, ktoré prejde samo.
 *
 * Dlhý výpis sa číta po kusoch a súbežne, takže na strop požiadaviek za minútu
 * sa naráža ľahko. Bez opakovania stačilo jedno `429` a zhodilo celé čítanie —
 * aj keď ostatných deväť kusov prešlo.
 */
function preskocDoChvile(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Volanie OpenAI aj s meraním. Meria sa celé — aj s opakovaniami —, lebo
 * zaplatí sa za každý pokus, ktorý prešiel.
 */
async function cezOpenAi(
  pokyn: string,
  obsah: unknown[],
  nastavenie?: AiNastavenie,
  vidiaci = true,
  /** true, keď sa sem ide až po tom, čo Gemini zlyhal. */
  nahrada = false,
): Promise<string> {
  return zmeraj(
    {
      poskytovatel: "openai",
      model: modelOpenAi(vidiaci),
      ucel: nastavenie?.ucel,
      firma: nastavenie?.firma,
      nahrada,
    },
    (ohlasTokeny) => openAiVolanie(pokyn, obsah, nastavenie, vidiaci, ohlasTokeny),
  );
}

async function openAiVolanie(
  pokyn: string,
  obsah: unknown[],
  nastavenie: AiNastavenie | undefined,
  /** Obrázok a PDF potrebujú model, ktorý vidí; na text stačí ten rýchlejší. */
  vidiaci: boolean,
  ohlasTokeny: (t: { vstup?: number | null; vystup?: number | null }) => void,
  pokus = 1,
): Promise<string> {
  const kluc = process.env.OPENAI_API_KEY?.trim();
  if (!kluc) bezPoskytovatela();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${kluc}` },
    body: JSON.stringify({
      model: modelOpenAi(vidiaci),
      messages: [
        { role: "system", content: pokyn },
        { role: "user", content: obsah },
      ],
      ...(nastavenie?.json ? { response_format: { type: "json_object" } } : {}),
      /*
        Strop odpovede sa musí orezať na to, čo model unesie: `gpt-4o` berie
        najviac 16 384 tokenov a väčšie číslo odmietne celé volanie
        (`400 max_tokens is too large`). Gemini pritom znesie oveľa viac, takže
        hodnota, ktorá je pre neho v poriadku, tu zhodí náhradnú cestu — a to
        práve vtedy, keď na ňu dôjde.
      */
      max_tokens: Math.min(nastavenie?.maxOutputTokens ?? 8000, 16000),
      temperature: 0,
    }),
  });
  if (!res.ok) {
    const telo = await res.text();
    if (preskocDoChvile(res.status) && pokus < POKUSOV) {
      // `retry-after` chodí v sekundách; keď nechodí, čaká sa dvakrát dlhšie
      // s každým pokusom.
      const povedane = Number(res.headers?.get?.("retry-after") ?? "");
      const cakaj = Number.isFinite(povedane) && povedane > 0 ? povedane * 1000 : 2000 * pokus;
      console.warn(`[ai] OpenAI ${res.status}, ${pokus}. pokus, čakám ${cakaj} ms`);
      await new Promise((r) => setTimeout(r, Math.min(cakaj, 20_000)));
      return openAiVolanie(pokyn, obsah, nastavenie, vidiaci, ohlasTokeny, pokus + 1);
    }
    throw new Error(`OpenAI ${res.status}: ${telo.slice(0, 300)}`);
  }
  const j: any = await res.json();
  ohlasTokeny({
    vstup: j?.usage?.prompt_tokens ?? null,
    vystup: j?.usage?.completion_tokens ?? null,
  });
  return j?.choices?.[0]?.message?.content ?? "";
}

/**
 * Jeden krok v poradí poskytovateľov. `volaj` dostane `nahrada` — true, keď
 * predošlý krok zlyhal alebo bol vypnutý ističom, nie len bez kľúča.
 */
type Krok = {
  nazov: string;
  /** Má kľúč a nie je umlčaný. */
  dostupny: () => boolean;
  /** Kľúč je, ale krok je dočasne vypnutý (umlčanie, istič) — ďalší je náhrada. */
  vypnuty?: () => boolean;
  volaj: (nahrada: boolean) => Promise<string>;
  /** Po zlyhaní (umlčanie, istič). */
  poZlyhani?: (e: unknown) => void;
  /** Chyba, po ktorej sa ďalší poskytovateľ neskúša (odrezaná odpoveď). */
  konecna?: (e: unknown) => boolean;
};

async function poradie(kroky: Krok[]): Promise<string> {
  let posledna: unknown = undefined;
  let nahrada = false;
  for (let i = 0; i < kroky.length; i++) {
    const krok = kroky[i];
    if (!krok.dostupny()) {
      if (krok.vypnuty?.()) nahrada = true;
      continue;
    }
    try {
      return await krok.volaj(nahrada);
    } catch (e) {
      krok.poZlyhani?.(e);
      posledna = e;
      nahrada = true;
      if (krok.konecna?.(e)) throw e;
      const dalsi = kroky.slice(i + 1).find((k) => k.dostupny());
      if (!dalsi) break;
      console.warn(
        `[ai] ${krok.nazov} zlyhal, čítam modelom ${dalsi.nazov}:`,
        String((e as Error)?.message ?? e).slice(0, 200),
      );
    }
  }
  if (posledna !== undefined) throw posledna;
  bezPoskytovatela();
}

/** Prečítanie dokumentu (obrázok alebo PDF) z jeho obsahu. */
export async function aiVision(
  base64: string,
  mimeType: string,
  pokyn: string,
  nastavenie?: AiNastavenie,
): Promise<string> {
  const vytazenie = Boolean(nastavenie?.vytazenie);
  const limitMs =
    typeof nastavenie?.vytazenie === "object" ? nastavenie.vytazenie.limitMs : undefined;
  const vyssi = vytazenie ? modelGeminiVytazenie() : null;
  const claudeModel = vytazenie ? modelClaudeVytazenie() : modelClaude();

  const geminiPro: Krok = {
    nazov: vyssi ?? "",
    dostupny: () => Boolean(vyssi && vyssi !== modelGemini() && maGemini() && proZapnuty()),
    vypnuty: () => Boolean(vyssi && vyssi !== modelGemini() && maGemini() && !proZapnuty()),
    volaj: async () => {
      const { geminiVision } = await import("./gemini.server");
      return zmeraj(
        { poskytovatel: "gemini", model: vyssi!, ucel: nastavenie?.ucel, firma: nastavenie?.firma },
        async (ohlasTokeny) => {
          const odpoved = await geminiVision(
            base64,
            mimeType,
            pokyn,
            // Vyšší model uvažuje vždy — vypnuté uvažovanie by odmietol.
            { ...nastavenie, bezUvazovania: false, model: vyssi!, ...(limitMs ? { limitMs } : {}) },
            ohlasTokeny,
          );
          nastavenie?.odpovedal?.("gemini");
          return odpoved;
        },
      );
    },
    // Odrezaná odpoveď vyššieho modelu sa skúša ďalej — tak to bolo vždy.
    poZlyhani: vypniPro,
  };

  const claude: Krok = {
    nazov: claudeModel,
    dostupny: () => maClaude() && claudeVidi(mimeType),
    vypnuty: () => claudeUmlcany() && claudeVidi(mimeType),
    volaj: (nahrada) =>
      zmeraj(
        {
          poskytovatel: "anthropic",
          model: claudeModel,
          ucel: nastavenie?.ucel,
          firma: nastavenie?.firma,
          nahrada,
        },
        async (ohlasTokeny) => {
          const { claudeVision } = await import("./anthropic.server");
          const odpoved = await claudeVision(
            base64,
            mimeType,
            pokyn,
            {
              model: claudeModel,
              maxOutputTokens: nastavenie?.maxOutputTokens,
              json: nastavenie?.json,
              schema: nastavenie?.schema,
              limitMs: limitMs ?? (vytazenie ? LIMIT_CLAUDE_VYTAZENIE_MS : LIMIT_CLAUDE_MS),
            },
            ohlasTokeny,
          );
          nastavenie?.odpovedal?.("anthropic");
          return odpoved;
        },
      ),
    poZlyhani: umlcClaude,
    konecna: (e) => !opravitelna(e),
  };

  const geminiBezny: Krok = {
    nazov: modelGemini(),
    dostupny: maGemini,
    vypnuty: () => Boolean(process.env.GEMINI_API_KEY?.trim()) && !maGemini(),
    volaj: async (nahrada) => {
      const { geminiVision } = await import("./gemini.server");
      return zmeraj(
        {
          poskytovatel: "gemini",
          model: modelGemini(),
          ucel: nastavenie?.ucel,
          firma: nastavenie?.firma,
          nahrada,
        },
        async (ohlasTokeny) => {
          const odpoved = await geminiVision(base64, mimeType, pokyn, nastavenie, ohlasTokeny);
          nastavenie?.odpovedal?.("gemini");
          return odpoved;
        },
      );
    },
    poZlyhani: umlcGemini,
    konecna: (e) => !opravitelna(e),
  };

  const openAi: Krok = {
    nazov: modelOpenAi(true),
    dostupny: maOpenAi,
    volaj: (nahrada) => {
      nastavenie?.odpovedal?.("openai");
      return cezOpenAi(
        pokyn,
        mimeType === "application/pdf"
          ? [
              { type: "text", text: "Prečítaj tento dokument." },
              {
                type: "file",
                file: { filename: "dokument.pdf", file_data: `data:${mimeType};base64,${base64}` },
              },
            ]
          : [
              { type: "text", text: "Prečítaj tento dokument." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
        nastavenie,
        true,
        nahrada,
      );
    },
  };

  /*
    Od 18. 11. 2026 je hlavný Claude (porovnanie na 31 dokladoch: Opus 5.5 presnejší,
    3–4× rýchlejší a bez výpadkov; Gemini Pro preview vracal 503 a čítal > 90 s).
    Vyťažovanie dokladu: Claude Opus → Gemini Flash → OpenAI.
    Ostatné (predkontácia, rýchle čítanie): Claude Haiku → Gemini Flash → OpenAI.
    Gemini Pro ostáva len ako posledná možnosť pred OpenAI, keď Flash nie je.
  */
  return poradie(
    vytazenie
      ? maClaude()
        ? [claude, geminiBezny, geminiPro, openAi]
        : [geminiPro, geminiBezny, openAi] // bez kľúča Anthropic ako predtým
      : [claude, geminiBezny, openAi],
  );
}

/** To isté nad obyčajným textom — keď dokument textovú vrstvu má. */
export async function aiText(pokyn: string, nastavenie?: AiNastavenie): Promise<string> {
  const claudeModel = modelClaude();
  return poradie([
    {
      nazov: claudeModel,
      dostupny: maClaude,
      vypnuty: claudeUmlcany,
      volaj: (nahrada) =>
        zmeraj(
          {
            poskytovatel: "anthropic",
            model: claudeModel,
            ucel: nastavenie?.ucel,
            firma: nastavenie?.firma,
            nahrada,
          },
          async (ohlasTokeny) => {
            const { claudeText } = await import("./anthropic.server");
            return claudeText(
              pokyn,
              {
                model: claudeModel,
                maxOutputTokens: nastavenie?.maxOutputTokens,
                json: nastavenie?.json,
                schema: nastavenie?.schema,
                limitMs: LIMIT_CLAUDE_MS,
              },
              ohlasTokeny,
            );
          },
        ),
      poZlyhani: umlcClaude,
      konecna: (e) => !opravitelna(e),
    },
    {
      nazov: modelGemini(),
      dostupny: maGemini,
      vypnuty: () => Boolean(process.env.GEMINI_API_KEY?.trim()) && !maGemini(),
      volaj: async (nahrada) => {
        const { geminiText } = await import("./gemini.server");
        return zmeraj(
          {
            poskytovatel: "gemini",
            model: modelGemini(),
            ucel: nastavenie?.ucel,
            firma: nastavenie?.firma,
            nahrada,
          },
          (ohlasTokeny) => geminiText(pokyn, nastavenie, ohlasTokeny),
        );
      },
      poZlyhani: umlcGemini,
      konecna: (e) => !opravitelna(e),
    },
    {
      nazov: modelOpenAi(false),
      dostupny: maOpenAi,
      volaj: (nahrada) =>
        cezOpenAi(pokyn, [{ type: "text", text: "Pokračuj." }], nastavenie, false, nahrada),
    },
  ]);
}
