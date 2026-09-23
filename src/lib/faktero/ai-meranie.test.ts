import { beforeEach, describe, expect, it, vi } from "vitest";
import { naRiadok } from "./ai-merac.server";

/**
 * Meranie sa inak overiť nedá — zápis ide mimo odpovede a do tabuľky, ktorú
 * testy písať nesmú. Podstrčí sa preto samotné meranie a pozerá sa, čo by sa
 * bolo zapísalo.
 */

const merania: any[] = [];
vi.mock("./ai-merac.server", async () => {
  const skutocny = await vi.importActual<typeof import("./ai-merac.server")>("./ai-merac.server");
  return {
    ...skutocny,
    zmeraj: async (meta: any, volanie: any) => {
      let tokeny: any = {};
      try {
        const v = await volanie((t: any) => {
          tokeny = t;
        });
        merania.push({ ...meta, ok: true, tokeny });
        return v;
      } catch (e) {
        merania.push({ ...meta, ok: false, tokeny, chyba: String((e as Error).message) });
        throw e;
      }
    },
  };
});

const geminiText = vi.fn();
vi.mock("./gemini.server", () => ({
  geminiVision: vi.fn(),
  geminiText: (...a: unknown[]) => geminiText(...a),
}));

const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: "{}" } }],
    usage: { prompt_tokens: 120, completion_tokens: 30 },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  merania.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  process.env.GEMINI_API_KEY = "g";
  process.env.OPENAI_API_KEY = "o";
});

describe("meranie využitia", () => {
  it("úspešné volanie Gemini si poznačí účel, firmu aj spotrebu", async () => {
    geminiText.mockImplementationOnce(async (_pokyn: string, _n: unknown, merac: any) => {
      merac?.({ vstup: 900, vystup: 40 });
      return "{}";
    });
    const { aiText } = await import("./ai.server");

    await aiText("pokyn", { ucel: "bankovy-vypis", firma: "f1" });

    expect(merania).toHaveLength(1);
    expect(merania[0]).toMatchObject({
      poskytovatel: "gemini",
      model: "gemini-3.5-flash",
      ucel: "bankovy-vypis",
      firma: "f1",
      ok: true,
      tokeny: { vstup: 900, vystup: 40 },
    });
  });

  it("prechod na OpenAI je vidieť ako náhrada, aj s tokenmi z odpovede", async () => {
    geminiText.mockRejectedValueOnce(new Error("Gemini 429: RESOURCE_EXHAUSTED"));
    const { aiText } = await import("./ai.server");

    await aiText("pokyn", { ucel: "blocek" });

    expect(merania).toHaveLength(2);
    expect(merania[0]).toMatchObject({ poskytovatel: "gemini", ok: false });
    expect(merania[1]).toMatchObject({
      poskytovatel: "openai",
      model: "gpt-4o-mini",
      nahrada: true,
      ok: true,
      tokeny: { vstup: 120, vystup: 30 },
    });
  });

  it("obrázok ide na vidiaci model a to sa aj zapíše", async () => {
    delete process.env.GEMINI_API_KEY;
    const { aiVision } = await import("./ai.server");

    await aiVision("base64", "image/png", "pokyn", { ucel: "blocek" });

    expect(merania[0]).toMatchObject({ poskytovatel: "openai", model: "gpt-4o", nahrada: false });
    process.env.GEMINI_API_KEY = "g";
  });
});

describe("riadok tabuľky", () => {
  it("bez účelu a firmy sa riadok nezahodí", () => {
    expect(naRiadok({ poskytovatel: "gemini", model: "m", ok: true })).toMatchObject({
      ucel: "neznáme",
      company_id: null,
      nahrada: false,
      chyba: null,
    });
  });

  it("dlhá hláška sa oreže, aby sa do stĺpca nesypal celý výpis", () => {
    const r = naRiadok({ poskytovatel: "openai", model: "m", ok: false, chyba: "x".repeat(900) });
    expect(r.chyba).toHaveLength(500);
  });
});
