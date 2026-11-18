/**
 * Claude (Anthropic) ako náhrada za Gemini.
 *
 * Náhľadový Gemini Pro často odpovie `503 high demand`. Doklad sa potom
 * nemusí čítať slabším modelom ani OpenAI — Claude Opus prečíta obrázok aj PDF
 * a schému odpovede dodrží cez `output_config.format`.
 *
 * Volá sa len z `ai.server.ts` (s meraním a poradím poskytovateľov). Kľúč je
 * `ANTHROPIC_API_KEY`; bez neho sa sem nechodí vôbec.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MeracTokenov } from "./gemini.server";

export type ClaudeNastavenie = {
  model: string;
  /** Strop odpovede, ktorý si pýtal volajúci (Gemini ho berie bez uvažovania). */
  maxOutputTokens?: number;
  json?: boolean;
  /** Schéma vo formáte Gemini (podmnožina OpenAPI) — prevedie sa na JSON Schema. */
  schema?: Record<string, unknown>;
  /** Časový limit celého volania v ms. */
  limitMs?: number;
};

let klient: Anthropic | null = null;
let klientKluc = "";

function dajKlienta(): Anthropic {
  const kluc = process.env.ANTHROPIC_API_KEY?.trim();
  if (!kluc) throw new Error("ANTHROPIC_API_KEY nie je nastavený");
  if (!klient || klientKluc !== kluc) {
    // Jedno opakovanie (429/5xx/529) urobí SDK samo; ďalšie čakanie by
    // len posunulo náhradu (Gemini Flash, OpenAI) za hranicu limitu.
    klient = new Anthropic({ apiKey: kluc, maxRetries: 1 });
    klientKluc = kluc;
  }
  return klient;
}

/**
 * Schéma Gemini (OpenAPI: `nullable`, typy aj veľkými písmenami) → JSON Schema
 * pre štruktúrovaný výstup. Každý objekt dostane `additionalProperties: false`
 * (API ho vyžaduje) a obmedzenia, ktoré API nepozná, sa vypustia.
 */
export function schemaPreClaude(s: unknown): Record<string, unknown> {
  if (!s || typeof s !== "object" || Array.isArray(s)) return {};
  const vstup = s as Record<string, unknown>;
  const von: Record<string, unknown> = {};
  const typ = typeof vstup.type === "string" ? vstup.type.toLowerCase() : undefined;
  if (typ) von.type = typ;
  if (typeof vstup.description === "string") von.description = vstup.description;
  if (Array.isArray(vstup.enum)) von.enum = vstup.enum;
  if (typ === "object" || vstup.properties) {
    const vlastnosti: Record<string, unknown> = {};
    for (const [k, v] of Object.entries((vstup.properties as Record<string, unknown>) ?? {})) {
      vlastnosti[k] = schemaPreClaude(v);
    }
    von.type = "object";
    von.properties = vlastnosti;
    if (Array.isArray(vstup.required)) von.required = vstup.required;
    von.additionalProperties = false;
  }
  if (typ === "array" && vstup.items) von.items = schemaPreClaude(vstup.items);
  if (Array.isArray(vstup.anyOf)) von.anyOf = vstup.anyOf.map(schemaPreClaude);
  if (vstup.nullable === true) return { anyOf: [von, { type: "null" }] };
  return von;
}

/** Odstráni ```json obal, keď si ho model predsa pridal. */
export function bezObalu(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : t;
}

/** Text odpovede — bloky uvažovania (`thinking`) sa vynechajú. */
export function textOdpovede(sprava: Pick<Anthropic.Message, "content">): string {
  return sprava.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

const POKYN_JSON = "Odpovedz výhradne platným JSON objektom — bez vysvetlenia a bez bloku ```.";

async function volaj(
  obsah: Anthropic.ContentBlockParam[],
  nastavenie: ClaudeNastavenie,
  merac?: MeracTokenov,
): Promise<string> {
  const client = dajKlienta();
  const schema = nastavenie.json && nastavenie.schema ? schemaPreClaude(nastavenie.schema) : null;

  /*
    Claude Opus 5.5 uvažuje vždy (vypnúť sa nedá) a uvažovanie sa počíta do
    `max_tokens`. Strop od volajúceho (predkontácia 300) by sa minul na
    premýšľanie, preto sa berie aspoň 16 000 — platí sa len za skutočne
    vygenerované tokeny. Úsilie `low` drží vyťaženie rýchle.
  */
  const maxTokens = Math.min(Math.max(nastavenie.maxOutputTokens ?? 0, 16_000), 64_000);
  const limit = nastavenie.limitMs ?? 90_000;

  const controller = new AbortController();
  const casovac = setTimeout(() => controller.abort(), limit);
  let sprava: Anthropic.Message;
  try {
    sprava = await client.messages
      .stream(
        {
          model: nastavenie.model,
          max_tokens: maxTokens,
          ...(nastavenie.json && !schema ? { system: POKYN_JSON } : {}),
          output_config: {
            effort: "low",
            ...(schema ? { format: { type: "json_schema" as const, schema } } : {}),
          },
          messages: [{ role: "user", content: obsah }],
        },
        { signal: controller.signal },
      )
      .finalMessage();
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error(`Claude ${nastavenie.model}: časový limit ${Math.round(limit / 1000)} s`);
    }
    if (e instanceof Anthropic.APIError && e.status) {
      throw new Error(`Claude ${e.status}: ${String(e.message).slice(0, 300)}`);
    }
    throw e;
  } finally {
    clearTimeout(casovac);
  }

  // Spotreba sa hlási aj pri odrezanej či odmietnutej odpovedi — zaplatená je.
  const u = sprava.usage;
  merac?.({
    vstup:
      (u?.input_tokens ?? 0) +
      (u?.cache_creation_input_tokens ?? 0) +
      (u?.cache_read_input_tokens ?? 0),
    vystup: u?.output_tokens ?? null,
  });

  if (sprava.stop_reason === "refusal") {
    // Ide sa na ďalšieho poskytovateľa (`opravitelna` v `ai.server.ts`).
    throw new Error(`Claude ${nastavenie.model} odmietol odpovedať (refusal)`);
  }
  if (sprava.stop_reason === "max_tokens") {
    throw new Error("Odpoveď modelu sa nezmestila — dokument je príliš dlhý, rozdeľte ho.");
  }
  const text = textOdpovede(sprava);
  return nastavenie.json ? bezObalu(text) : text;
}

/** Prečítanie dokumentu (obrázok alebo PDF). */
export async function claudeVision(
  base64: string,
  mimeType: string,
  pokyn: string,
  nastavenie: ClaudeNastavenie,
  merac?: MeracTokenov,
): Promise<string> {
  // Base64 nesmie obsahovať zalomenia riadkov.
  const cisty = base64.replace(/\s+/g, "");
  const dokument: Anthropic.ContentBlockParam =
    mimeType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: cisty },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType.toLowerCase() as
              "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: cisty,
          },
        };
  // Dokument ide pred pokyn.
  return volaj([dokument, { type: "text", text: pokyn }], nastavenie, merac);
}

/** To isté nad obyčajným textom. */
export async function claudeText(
  pokyn: string,
  nastavenie: ClaudeNastavenie,
  merac?: MeracTokenov,
): Promise<string> {
  return volaj([{ type: "text", text: pokyn }], nastavenie, merac);
}
