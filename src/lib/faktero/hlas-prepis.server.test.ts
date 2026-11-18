import { describe, expect, it, vi } from "vitest";
import {
  MODEL_PREPISU,
  jeOzvenaPromptu,
  formularPrepisu,
  jeHalucinacia,
  partneriPreSlovnik,
  prepisReci,
  priponaPreTyp,
  slovnikPrepisu,
  vstupneTokenyPrepisu,
  type VolaniePrepisu,
} from "./hlas-prepis.server";
import { cenaVolania } from "./ai-cennik";

const AUDIO = new Uint8Array([1, 2, 3, 4, 5]);

function odpoved(status: number, telo: unknown) {
  return {
    ok: status < 400,
    status,
    text: async () => (typeof telo === "string" ? telo : JSON.stringify(telo)),
  };
}

describe("hlas — slovník pre prepis", () => {
  it("odborné slová, firma a partneri; partneri na konci, bez duplicít, s limitom", () => {
    const p = slovnikPrepisu({
      jazyk: "sk",
      firma: "Tobify s.r.o.",
      partneri: ["Orange Slovensko, a.s.", "orange slovensko, a.s.", "Slovak Telekom, a.s.", ""],
    });
    for (const s of [
      "nespracované doklady",
      "predkontácia",
      "členenie DPH",
      "kontrolný výkaz",
      "Pohoda",
      "potvrď",
      "zruš",
    ])
      expect(p).toContain(s);
    expect(p).toMatch(
      /Firmy: Tobify s\.r\.o\., Orange Slovensko, a\.s\., Slovak Telekom, a\.s\.\.$/,
    );
    expect(p.match(/Orange/gi)).toHaveLength(1);
    const dlhy = slovnikPrepisu({
      jazyk: "sk",
      partneri: Array.from({ length: 200 }, (_, i) => `Firma číslo ${i} s.r.o.`),
    });
    expect(dlhy.length).toBeLessThanOrEqual(900);
    expect(slovnikPrepisu({ jazyk: "cs", partneri: [] })).toContain("Hlasový příkaz");
  });

  it("mená partnerov z prijatých, vystavených a adresára — najčastejší prví", async () => {
    const tabulky: Record<string, Record<string, string>[]> = {
      purchase_invoices: [
        { supplier_name: "Orange" },
        { supplier_name: "Orange" },
        { supplier_name: "Shell" },
      ],
      invoices: [{ customer_name: "Zavar" }, { customer_name: "orange" }],
      customers: [{ name: "Adresár Jediný" }, { name: "Shell" }],
    };
    const volane: string[] = [];
    const sb = {
      from: (t: string) => {
        volane.push(t);
        const q: any = { select: () => q, eq: () => q, is: () => q, gte: () => q, order: () => q };
        q.limit = async () => ({ data: tabulky[t], error: null });
        return q;
      },
    };
    const mena = await partneriPreSlovnik(sb, "f");
    expect(mena[0]).toBe("Orange");
    expect(mena).toEqual(["Orange", "Shell", "Zavar", "Adresár Jediný"]);
    expect(volane.sort()).toEqual(["customers", "invoices", "purchase_invoices"]);
  });
});

describe("hlas — požiadavka na OpenAI", () => {
  it("multipart: file s príponou, model, language, prompt, response_format json", async () => {
    const f = formularPrepisu({
      audio: AUDIO,
      mime: "audio/webm;codecs=opus",
      model: "gpt-4o-transcribe",
      jazyk: "sk",
      prompt: "Slová: Pohoda.",
    });
    const subor = f.get("file") as File;
    expect(subor.name).toBe("prikaz.webm");
    expect(subor.type).toBe("audio/webm");
    expect(subor.size).toBe(5);
    expect(f.get("model")).toBe("gpt-4o-transcribe");
    expect(f.get("language")).toBe("sk");
    expect(f.get("prompt")).toBe("Slová: Pohoda.");
    expect(f.get("response_format")).toBe("json");
    expect(priponaPreTyp("audio/mp4")).toBe("mp4");
    expect(priponaPreTyp("audio/ogg; codecs=opus")).toBe("ogg");
    expect(
      formularPrepisu({ audio: AUDIO, mime: "audio/mp4", model: "m", jazyk: "cs", prompt: "" }).get(
        "language",
      ),
    ).toBe("cs");
  });

  it("gpt-4o-transcribe → text, meranie tokenov", async () => {
    const volaj = vi.fn<VolaniePrepisu>(async () =>
      odpoved(200, {
        text: " Otvor nespracované doklady. ",
        usage: {
          type: "tokens",
          input_tokens: 400,
          output_tokens: 8,
          input_token_details: { audio_tokens: 100, text_tokens: 300 },
        },
      }),
    );
    const zmeraj = vi.fn();
    const r = await prepisReci(
      { audio: AUDIO, mime: "audio/webm", jazyk: "sk", prompt: "Slová: Pohoda." },
      { kluc: "k", volaj, zmeraj },
    );
    expect(r).toEqual({
      text: "Otvor nespracované doklady.",
      model: MODEL_PREPISU,
      prazdny: false,
      ozvena: false,
    });
    const [url, init] = volaj.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer k");
    expect(init.body.get("model")).toBe("gpt-4o-transcribe");
    // Text promptu sa prepočíta na cenu audio tokenu (2,5 / 6).
    expect(zmeraj).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-transcribe", ok: true, vstup: 225, vystup: 8 }),
    );
  });

  it("pri chybe prvého modelu skúsi whisper-1, oba pokusy sa zmerajú", async () => {
    const volaj = vi.fn<VolaniePrepisu>(async (_u, i) =>
      i.body.get("model") === "gpt-4o-transcribe"
        ? odpoved(500, "server error")
        : odpoved(200, { text: "zaúčtuj", usage: { type: "duration", seconds: 3 } }),
    );
    const zmeraj = vi.fn();
    const r = await prepisReci(
      { audio: AUDIO, mime: "audio/mp4", jazyk: "sk", prompt: "p" },
      { kluc: "k", volaj, zmeraj },
    );
    expect(r).toMatchObject({ text: "zaúčtuj", model: "whisper-1" });
    expect(zmeraj.mock.calls.map((c) => [c[0].model, c[0].ok])).toEqual([
      ["gpt-4o-transcribe", false],
      ["whisper-1", true],
    ]);
    // 3 s whisperu = 50 tokenov ekvivalentu.
    expect(zmeraj.mock.calls[1][0].vstup).toBe(50);
  });

  it("keď zlyhajú oba, hodí chybu (prehliadač prepne na svoje rozpoznávanie)", async () => {
    const volaj = vi.fn<VolaniePrepisu>(async () => odpoved(401, "bad key"));
    await expect(
      prepisReci(
        { audio: AUDIO, mime: "audio/webm", jazyk: "sk", prompt: "p" },
        { kluc: "k", volaj },
      ),
    ).rejects.toThrow(/Prepis reči zlyhal: OpenAI 401/);
    expect(volaj).toHaveBeenCalledTimes(2);
  });

  it("ticho / halucinácia → prázdny prepis", async () => {
    const prompt = slovnikPrepisu({ jazyk: "sk", partneri: [] });
    const volaj = vi.fn<VolaniePrepisu>(async () =>
      odpoved(200, { text: "Ďakujem za pozornosť." }),
    );
    const r = await prepisReci(
      { audio: AUDIO, mime: "audio/webm", jazyk: "sk", prompt },
      { kluc: "k", volaj },
    );
    expect(r).toMatchObject({ text: "", prazdny: true });
    expect(jeHalucinacia("nespracované doklady, prijaté faktúry, vystavené faktúry", prompt)).toBe(
      true,
    );
    expect(jeHalucinacia("otvor nespracované doklady", prompt)).toBe(false);
    expect(jeHalucinacia("   ", prompt)).toBe(true);
  });

  it("ozvena promptu (naostro pri tichu: „Faktero, vystavené faktúry, zaúčtuj, Slovak Telekom, a.s.“)", () => {
    const prompt = slovnikPrepisu({
      jazyk: "sk",
      firma: "Tobify s.r.o.",
      partneri: ["Slovak Telekom, a.s.", "Orange Slovensko, a.s."],
    });
    // Dlhá ozvena sa zahodí rovno.
    expect(jeHalucinacia("Faktero, vystavené faktúry, zaúčtuj, Slovak Telekom, a.s.", prompt)).toBe(
      true,
    );
    // Ozvena s vymysleným príkazom (naostro pri tóne 440 Hz) — začína „Faktero,“.
    expect(
      jeHalucinacia("Faktero, zaúčtuj prijaté faktúry od Orange Slovensko, a.s.", prompt),
    ).toBe(true);
    expect(jeHalucinacia("Faktero, otvor banku", prompt)).toBe(false);
    expect(jeHalucinacia("www.slovakatele.com", prompt)).toBe(true);
    expect(jeOzvenaPromptu("zaúčtuj prijaté faktúry od Orange", prompt)).toBe(true);
    // Krátka len zo slov slovníka je podozrivá — rozhodne prehliadač.
    expect(jeOzvenaPromptu("nespracované doklady", prompt)).toBe(true);
    expect(jeOzvenaPromptu("otvor nespracované doklady", prompt)).toBe(false);
    expect(jeOzvenaPromptu("potvrď", prompt)).toBe(false);
  });

  it("cena: príkaz s 5 s reči stojí zlomok centu", () => {
    const vstup = vstupneTokenyPrepisu({
      type: "tokens",
      input_token_details: { audio_tokens: 83, text_tokens: 250 },
    })!;
    const cena = cenaVolania("gpt-4o-transcribe", vstup, 20);
    expect(cena).toBeGreaterThan(0.0005);
    expect(cena).toBeLessThan(0.002);
    // Whisper: minúta = 0,006 USD.
    expect(
      cenaVolania("whisper-1", vstupneTokenyPrepisu({ type: "duration", seconds: 60 })!, 0),
    ).toBeCloseTo(0.006, 6);
  });
});
