import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Náhrada za Gemini.
 *
 * Nedá sa to preklikať — na to by musel poskytovateľ naozaj zlyhať. Podstrčia
 * sa preto obe cesty a kontroluje sa, čo sa zavolá a kedy.
 */

const geminiVision = vi.fn();
const geminiText = vi.fn();
vi.mock("./gemini.server", () => ({
  geminiVision: (...a: unknown[]) => geminiVision(...a),
  geminiText: (...a: unknown[]) => geminiText(...a),
}));

const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: '{"z":"openai"}' } }] }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  process.env.GEMINI_API_KEY = "g";
  process.env.OPENAI_API_KEY = "o";
});

describe("výber poskytovateľa", () => {
  it("keď Gemini odpovie, OpenAI sa nevolá vôbec", async () => {
    geminiText.mockResolvedValueOnce('{"z":"gemini"}');
    const { aiText } = await import("./ai.server");

    expect(await aiText("pokyn")).toBe('{"z":"gemini"}');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("po vyčerpaní kreditu sa prejde na OpenAI", async () => {
    // Presne to, čo Gemini vráti, keď dôjde kredit.
    geminiVision.mockRejectedValueOnce(new Error("Gemini 429: RESOURCE_EXHAUSTED"));
    const { aiVision } = await import("./ai.server");

    expect(await aiVision("base64", "application/pdf", "pokyn")).toBe('{"z":"openai"}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const telo = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    // PDF musí ísť ako súbor, nie ako obrázok — inak ho model neprečíta.
    expect(telo.messages[1].content[1].type).toBe("file");
  });

  it("strop odpovede sa oreže na to, čo OpenAI unesie", async () => {
    // `gpt-4o` berie najviac 16 384 tokenov; väčšie číslo odmietne celé
    // volanie a náhradná cesta padne práve vtedy, keď na ňu dôjde.
    geminiVision.mockRejectedValueOnce(new Error("Gemini 429"));
    const { aiVision } = await import("./ai.server");

    await aiVision("base64", "image/png", "pokyn", { maxOutputTokens: 30000 });

    const telo = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(telo.max_tokens).toBeLessThanOrEqual(16384);
  });

  it("odrezaná odpoveď sa u druhého neopakuje", async () => {
    // Dokument je dlhý; druhý model ho neprečíta lepšie, len sa zaplatí dvakrát.
    geminiText.mockRejectedValueOnce(new Error("Odpoveď modelu sa nezmestila — rozdeľte ho."));
    const { aiText } = await import("./ai.server");

    await expect(aiText("pokyn")).rejects.toThrow(/nezmestila/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bez kľúča ku Gemini sa ide rovno na OpenAI", async () => {
    delete process.env.GEMINI_API_KEY;
    const { aiText } = await import("./ai.server");

    expect(await aiText("pokyn")).toBe('{"z":"openai"}');
    expect(geminiText).not.toHaveBeenCalled();
  });

  it("keď zlyhá Gemini a OpenAI kľúč nie je, ozve sa pôvodná chyba", async () => {
    delete process.env.OPENAI_API_KEY;
    geminiText.mockRejectedValueOnce(new Error("Gemini 429: RESOURCE_EXHAUSTED"));
    const { aiText } = await import("./ai.server");

    await expect(aiText("pokyn")).rejects.toThrow(/429/);
  });
});
