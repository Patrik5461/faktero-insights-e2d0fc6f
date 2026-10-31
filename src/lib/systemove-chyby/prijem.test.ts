import { describe, expect, it } from "vitest";
import { citajTelo, noveLimityPrijmu, posudChybuZKlienta } from "./prijem";

const telo = (o: Record<string, unknown> = {}) => ({
  zdroj: "prehliadac",
  typ: "onerror",
  sprava: "TypeError: x is undefined",
  stack: "TypeError: x\n at f (https://www.faktero.sk/assets/a-AbCd1234.js:1:2)",
  trasa: "/faktury",
  ...o,
});

describe("posudChybuZKlienta", () => {
  it("prijme platnú chybu", () => {
    const r = posudChybuZKlienta(telo(), { ip: null, limity: noveLimityPrijmu() });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.uroven).toBe("chyba");
  });

  it("odmietne zlý tvar a neznámy zdroj", () => {
    const l = noveLimityPrijmu();
    expect(posudChybuZKlienta({ sprava: 1 }, { ip: null, limity: l })).toEqual({
      ok: false,
      dovod: "tvar",
    });
    expect(posudChybuZKlienta(telo({ zdroj: "server" }), { ip: null, limity: l }).ok).toBe(false);
    expect(posudChybuZKlienta(telo({ sprava: "x".repeat(5000) }), { ip: null, limity: l }).ok).toBe(
      false,
    );
  });

  it("šum zahodí, aj keď ho klient pošle", () => {
    const r = posudChybuZKlienta(telo({ sprava: "ResizeObserver loop completed" }), {
      ip: null,
      limity: noveLimityPrijmu(),
    });
    expect(r).toEqual({ ok: false, dovod: "sum" });
  });

  it("ChunkLoadError je staré vydanie", () => {
    const r = posudChybuZKlienta(telo({ sprava: "ChunkLoadError: Loading chunk 7 failed" }), {
      ip: null,
      limity: noveLimityPrijmu(),
    });
    expect(r.ok && r.uroven).toBe("stare_vydanie");
  });

  it("chyba počas obnovy po nasadení je staré vydanie (router bez modulu trasy)", () => {
    // Admin → Chyby 31. 10. 2026: /podpora a /faktury/<id> po nasadení.
    for (const sprava of [
      "TypeError: Cannot read properties of undefined (reading 'component')",
      'TypeError: can\'t access property "component", k is undefined',
    ]) {
      const r = posudChybuZKlienta(telo({ sprava, stare_vydanie: true }), {
        ip: null,
        limity: noveLimityPrijmu(),
      });
      expect(r.ok && r.uroven).toBe("stare_vydanie");
    }
    // Bez značky obnovy ostáva tá istá správa chybou.
    const r = posudChybuZKlienta(
      telo({ sprava: "TypeError: Cannot read properties of undefined (reading 'component')" }),
      { ip: null, limity: noveLimityPrijmu() },
    );
    expect(r.ok && r.uroven).toBe("chyba");
  });

  it("chyba, z ktorej sa React zotavil (#520), je varovanie; s príčinou zo starého vydania staré vydanie", () => {
    const l = noveLimityPrijmu();
    const r = posudChybuZKlienta(
      telo({ sprava: "Minified React error #520 — príčina: TypeError: x is undefined" }),
      { ip: null, limity: l },
    );
    expect(r.ok && r.uroven).toBe("varovanie");
    const s = posudChybuZKlienta(
      telo({
        sprava:
          "Minified React error #520 — príčina: TypeError: Failed to fetch dynamically imported module: https://www.faktero.sk/assets/a.js",
      }),
      { ip: null, limity: l },
    );
    expect(s.ok && s.uroven).toBe("stare_vydanie");
  });

  it("skúšobná chyba z E2E je varovanie", () => {
    const r = posudChybuZKlienta(telo({ sprava: "[E2E] skúšobná chyba" }), {
      ip: null,
      limity: noveLimityPrijmu(),
    });
    expect(r.ok && r.uroven).toBe("varovanie");
  });

  it("limit na IP, na odtlačok a spolu", () => {
    let t = 0;
    const l = noveLimityPrijmu(() => t);
    // 30 z jednej IP s rôznymi chybami prejde, 31. nie.
    for (let i = 0; i < 30; i++)
      expect(
        posudChybuZKlienta(telo({ sprava: `chyba ${"x".repeat(i)}` }), { ip: "1.2.3.4", limity: l })
          .ok,
      ).toBe(true);
    expect(posudChybuZKlienta(telo({ sprava: "iná" }), { ip: "1.2.3.4", limity: l })).toEqual({
      ok: false,
      dovod: "limit",
    });
    // Ten istý odtlačok najviac 20× za minútu (bez IP — router ju dnes stráca).
    t = 120_000;
    let prislo = 0;
    for (let i = 0; i < 25; i++)
      if (posudChybuZKlienta(telo({ sprava: "stále tá istá" }), { ip: null, limity: l }).ok)
        prislo++;
    expect(prislo).toBe(20);
  });
});

describe("citajTelo", () => {
  it("prečíta malé telo a odmietne veľké", async () => {
    const male = new Request("http://x/", { method: "POST", body: "{}" });
    expect(await citajTelo(male)).toBe("{}");
    const velke = new Request("http://x/", { method: "POST", body: "a".repeat(20_000) });
    expect(await citajTelo(velke, 16 * 1024)).toBeNull();
  });
});
