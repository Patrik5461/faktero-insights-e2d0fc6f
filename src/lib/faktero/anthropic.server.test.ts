import { beforeEach, describe, expect, it, vi } from "vitest";

/** Volanie Claude s podstrčeným SDK — čo sa pošle a ako sa číta odpoveď. */

const stream = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class Anthropic {
    static APIError = APIError;
    messages = { stream: (...a: unknown[]) => stream(...a) };
  }
  return { default: Anthropic };
});

const sprava = (o: Record<string, unknown>) => ({
  finalMessage: async () => ({
    content: [
      { type: "thinking", thinking: "" },
      { type: "text", text: '{"a":1}' },
    ],
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5 },
    ...o,
  }),
});

beforeEach(() => {
  stream.mockReset();
  vi.resetModules();
  process.env.ANTHROPIC_API_KEY = "a";
});

describe("schemaPreClaude", () => {
  it("nullable, veľké typy, additionalProperties a vnorené polia", async () => {
    const { schemaPreClaude } = await import("./anthropic.server");
    expect(
      schemaPreClaude({
        type: "OBJECT",
        properties: {
          kod: { type: "string", minLength: 1 },
          popis: { type: "string", nullable: true },
          druh: { type: "string", enum: ["a", "b"] },
          riadky: {
            type: "array",
            maxItems: 9,
            items: { type: "object", properties: { x: { type: "number", minimum: 0 } } },
          },
        },
        required: ["kod"],
      }),
    ).toEqual({
      type: "object",
      properties: {
        kod: { type: "string" },
        popis: { anyOf: [{ type: "string" }, { type: "null" }] },
        druh: { type: "string", enum: ["a", "b"] },
        riadky: {
          type: "array",
          items: {
            type: "object",
            properties: { x: { type: "number" } },
            additionalProperties: false,
          },
        },
      },
      required: ["kod"],
      additionalProperties: false,
    });
  });
});

describe("claudeVision / claudeText", () => {
  it("PDF ide ako document blok pred pokynom, schéma do output_config.format", async () => {
    stream.mockReturnValueOnce(sprava({}));
    const { claudeVision } = await import("./anthropic.server");
    const merac = vi.fn();
    const text = await claudeVision(
      "QUJD\nREVG",
      "application/pdf",
      "pokyn",
      {
        model: "claude-opus-5-5",
        json: true,
        schema: { type: "object", properties: { a: { type: "integer" } } },
        maxOutputTokens: 300,
      },
      merac,
    );
    expect(text).toBe('{"a":1}');
    const [telo, volby] = stream.mock.calls[0] as any[];
    expect(telo.model).toBe("claude-opus-5-5");
    expect(telo.max_tokens).toBe(16_000);
    expect(telo.output_config.effort).toBe("low");
    expect(telo.output_config.format.type).toBe("json_schema");
    expect(telo.output_config.format.schema.additionalProperties).toBe(false);
    expect(telo.thinking).toBeUndefined();
    expect(telo.system).toBeUndefined();
    const obsah = telo.messages[0].content;
    expect(obsah[0]).toEqual({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: "QUJDREVG" },
    });
    expect(obsah[1]).toEqual({ type: "text", text: "pokyn" });
    expect(volby.signal).toBeDefined();
    expect(merac).toHaveBeenCalledWith({ vstup: 105, vystup: 20 });
  });

  it("obrázok ide ako image blok; JSON bez schémy dostane pokyn a zbaví sa obalu", async () => {
    stream.mockReturnValueOnce(
      sprava({ content: [{ type: "text", text: '```json\n{"b":2}\n```' }] }),
    );
    const { claudeVision } = await import("./anthropic.server");
    const text = await claudeVision("eA==", "image/JPEG", "p", {
      model: "claude-haiku-5-5",
      json: true,
    });
    expect(text).toBe('{"b":2}');
    const [telo] = stream.mock.calls[0] as any[];
    expect(telo.messages[0].content[0].source.media_type).toBe("image/jpeg");
    expect(telo.system).toMatch(/JSON/);
    expect(telo.output_config.format).toBeUndefined();
  });

  it("refusal je chyba, po ktorej sa skúša ďalší poskytovateľ", async () => {
    stream.mockReturnValueOnce(sprava({ stop_reason: "refusal", content: [] }));
    const { claudeText } = await import("./anthropic.server");
    await expect(claudeText("p", { model: "claude-opus-5-5" })).rejects.toThrow(/refusal/);
  });

  it("max_tokens = odpoveď sa nezmestila", async () => {
    stream.mockReturnValueOnce(sprava({ stop_reason: "max_tokens" }));
    const { claudeText } = await import("./anthropic.server");
    await expect(claudeText("p", { model: "claude-opus-5-5" })).rejects.toThrow(/nezmestila/);
  });

  it("časový limit preruší volanie", async () => {
    stream.mockImplementationOnce((_t: unknown, volby: { signal: AbortSignal }) => ({
      finalMessage: () =>
        new Promise((_, nie) =>
          volby.signal.addEventListener("abort", () => nie(new Error("aborted"))),
        ),
    }));
    const { claudeText } = await import("./anthropic.server");
    await expect(claudeText("p", { model: "claude-opus-5-5", limitMs: 20 })).rejects.toThrow(
      /časový limit/,
    );
  });
});
