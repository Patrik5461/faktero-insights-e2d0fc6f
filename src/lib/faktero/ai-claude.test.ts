import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Claude v poradí poskytovateľov. Gemini, Claude aj OpenAI sú podstrčené —
 * kontroluje sa poradie, istič na Gemini Pro a čítanie odpovede Claude.
 */

const geminiVision = vi.fn();
const geminiText = vi.fn();
vi.mock("./gemini.server", () => ({
  geminiVision: (...a: unknown[]) => geminiVision(...a),
  geminiText: (...a: unknown[]) => geminiText(...a),
}));

const claudeVision = vi.fn();
const claudeText = vi.fn();
vi.mock("./anthropic.server", () => ({
  claudeVision: (...a: unknown[]) => claudeVision(...a),
  claudeText: (...a: unknown[]) => claudeText(...a),
}));

const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: '{"z":"openai"}' } }] }),
}));

const PRO = "gemini-3.1-pro-preview";

beforeEach(() => {
  vi.clearAllMocks();
  geminiVision.mockReset();
  geminiText.mockReset();
  claudeVision.mockReset();
  claudeText.mockReset();
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
  process.env.GEMINI_API_KEY = "g";
  process.env.OPENAI_API_KEY = "o";
  process.env.ANTHROPIC_API_KEY = "a";
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_MODEL_VYTAZENIE;
  delete process.env.CLAUDE_MODEL;
  delete process.env.CLAUDE_MODEL_VYTAZENIE;
});

const modelVolania = (call: unknown[]) => (call[3] as { model?: string })?.model;

describe("vyťažovanie: Claude Opus → Gemini Flash → Gemini Pro → OpenAI", () => {
  it("Claude odpovie — Gemini sa nevolá", async () => {
    claudeVision.mockResolvedValueOnce("claude");
    const { aiVision } = await import("./ai.server");
    expect(await aiVision("b", "image/png", "p", { vytazenie: true })).toBe("claude");
    expect((claudeVision.mock.calls[0] as any[])[3].model).toBe("claude-opus-5-5");
    expect(geminiVision).not.toHaveBeenCalled();
  });

  it("PDF so schémou ide na Claude Opus a ohlási anthropic", async () => {
    claudeVision.mockResolvedValueOnce('{"z":"claude"}');
    const { aiVision } = await import("./ai.server");
    const odpovedal = vi.fn();
    expect(
      await aiVision("b", "application/pdf", "p", {
        vytazenie: { limitMs: 90_000 },
        json: true,
        schema: { type: "object", properties: {} },
        odpovedal,
      }),
    ).toBe('{"z":"claude"}');
    const [, mime, , nast] = claudeVision.mock.calls[0] as any[];
    expect(mime).toBe("application/pdf");
    expect(nast).toMatchObject({ model: "claude-opus-5-5", json: true, limitMs: 90_000 });
    expect(nast.schema).toBeTruthy();
    expect(odpovedal.mock.calls.map((c) => c[0])).toEqual(["anthropic"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Claude zlyhá → Gemini Flash (nie Pro)", async () => {
    claudeVision.mockRejectedValueOnce(new Error("Claude 529: overloaded"));
    geminiVision.mockResolvedValueOnce("flash");
    const { aiVision } = await import("./ai.server");
    expect(await aiVision("b", "image/jpeg", "p", { vytazenie: true })).toBe("flash");
    expect(modelVolania(geminiVision.mock.calls[0])).toBeUndefined();
  });

  it("Claude aj Flash zlyhajú → Gemini Pro", async () => {
    claudeVision.mockRejectedValueOnce(new Error("Claude 500: boom"));
    geminiVision.mockRejectedValueOnce(new Error("Gemini 400: bad"));
    geminiVision.mockResolvedValueOnce("pro");
    const { aiVision } = await import("./ai.server");
    expect(await aiVision("b", "image/png", "p", { vytazenie: true })).toBe("pro");
    expect(modelVolania(geminiVision.mock.calls[1])).toBe(PRO);
  });

  it("všetci Gemini aj Claude zlyhajú → OpenAI", async () => {
    geminiVision.mockRejectedValue(new Error("Gemini 503: UNAVAILABLE"));
    claudeVision.mockRejectedValueOnce(new Error("Claude 500: boom"));
    const { aiVision } = await import("./ai.server");
    expect(await aiVision("b", "image/png", "p", { vytazenie: true })).toBe('{"z":"openai"}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("istič: Pro po 503 vypadne na 10 minút, Flash sa skúša ďalej", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      claudeVision.mockRejectedValue(new Error("Claude 500: boom"));
      geminiVision.mockRejectedValueOnce(new Error("Gemini 503: high demand")); // Flash
      geminiVision.mockRejectedValueOnce(new Error("Gemini 503: high demand")); // Pro
      const { aiVision, stavAi } = await import("./ai.server");
      expect(await aiVision("b", "image/png", "p", { vytazenie: true })).toBe('{"z":"openai"}');
      expect(stavAi().gemini.vytazenieVypnuteDo).not.toBeNull();
      geminiVision.mockRejectedValueOnce(new Error("Gemini 400: bad")); // Flash
      await aiVision("b", "image/png", "p", { vytazenie: true });
      // Pro sa v druhom behu nevolal.
      expect(geminiVision.mock.calls.filter((c) => modelVolania(c) === PRO)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bez kľúča Anthropic je poradie ako predtým (Pro → Flash)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    geminiVision.mockRejectedValueOnce(new Error("Gemini 503: high demand"));
    geminiVision.mockResolvedValueOnce("flash");
    const { aiVision } = await import("./ai.server");
    expect(await aiVision("b", "image/png", "p", { vytazenie: true })).toBe("flash");
    expect(modelVolania(geminiVision.mock.calls[0])).toBe(PRO);
    expect(claudeVision).not.toHaveBeenCalled();
  });

  it("odrezaná odpoveď Claude sa ďalej neskúša", async () => {
    claudeVision.mockRejectedValueOnce(
      new Error("Odpoveď modelu sa nezmestila — dokument je príliš dlhý, rozdeľte ho."),
    );
    const { aiVision } = await import("./ai.server");
    await expect(aiVision("b", "image/png", "p", { vytazenie: true })).rejects.toThrow(
      /nezmestila/,
    );
    expect(geminiVision).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("obrázok, ktorý Claude nevie (HEIC), ide rovno na Gemini Flash", async () => {
    geminiVision.mockResolvedValueOnce("flash");
    const { aiVision } = await import("./ai.server");
    expect(await aiVision("b", "image/heic", "p", { vytazenie: true })).toBe("flash");
    expect(claudeVision).not.toHaveBeenCalled();
  });

  it("zlý kľúč Claude ho umlčí", async () => {
    claudeVision.mockRejectedValueOnce(new Error("Claude 401: invalid x-api-key"));
    geminiVision.mockResolvedValue("flash");
    const { aiVision, stavAi } = await import("./ai.server");
    await aiVision("b", "image/png", "p", { vytazenie: true });
    await aiVision("b", "image/png", "p", { vytazenie: true });
    expect(claudeVision).toHaveBeenCalledTimes(1);
    expect(stavAi().anthropic.umlcanyDo).not.toBeNull();
  });
});

describe("rýchle úlohy: Claude Haiku → Gemini Flash → OpenAI", () => {
  it("aiVision bez vyťažovania ide na Haiku", async () => {
    claudeVision.mockResolvedValueOnce("haiku");
    const { aiVision } = await import("./ai.server");
    expect(await aiVision("b", "image/png", "p", {})).toBe("haiku");
    expect((claudeVision.mock.calls[0] as any[])[3].model).toBe("claude-haiku-5-5");
    expect(geminiVision).not.toHaveBeenCalled();
  });

  it("aiVision bez vyťažovania: Haiku zlyhá → Flash (nie Pro)", async () => {
    claudeVision.mockRejectedValueOnce(new Error("Claude 529: overloaded"));
    geminiVision.mockResolvedValueOnce("flash");
    const { aiVision } = await import("./ai.server");
    expect(await aiVision("b", "image/png", "p", {})).toBe("flash");
    expect(modelVolania(geminiVision.mock.calls[0])).toBeUndefined();
  });

  it("aiText: Haiku so schémou", async () => {
    claudeText.mockResolvedValueOnce('{"predkontacia":"P1"}');
    const { aiText } = await import("./ai.server");
    const schema = { type: "object", properties: { predkontacia: { type: "string" } } };
    expect(await aiText("pokyn", { json: true, schema, maxOutputTokens: 300 })).toBe(
      '{"predkontacia":"P1"}',
    );
    expect(claudeText.mock.calls[0][1]).toMatchObject({
      model: "claude-haiku-5-5",
      json: true,
      schema,
      maxOutputTokens: 300,
    });
    expect(geminiText).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aiText: Haiku zlyhá → Flash", async () => {
    claudeText.mockRejectedValueOnce(new Error("Claude 529: overloaded"));
    geminiText.mockResolvedValueOnce("flash");
    const { aiText } = await import("./ai.server");
    expect(await aiText("pokyn")).toBe("flash");
  });

  it("aiText: Haiku aj Flash zlyhajú → OpenAI", async () => {
    geminiText.mockRejectedValueOnce(new Error("Gemini 503"));
    claudeText.mockRejectedValueOnce(new Error("Claude 529: overloaded"));
    const { aiText } = await import("./ai.server");
    expect(await aiText("pokyn")).toBe('{"z":"openai"}');
  });
});
