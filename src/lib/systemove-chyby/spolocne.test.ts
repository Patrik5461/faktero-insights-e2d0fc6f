import { describe, expect, it } from "vitest";
import {
  OknoPokusov,
  StropZapisov,
  bezTajomstiev,
  cistaTrasa,
  cistyStack,
  jeStareVydanie,
  jeSumPrehliadaca,
  miestoZoStacku,
  odtlacokChyby,
  rozoberChybu,
  jeObalReactu,
} from "./spolocne";

describe("bezTajomstiev", () => {
  it("skryje JWT, Bearer a kľúče", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
    expect(bezTajomstiev(`token ${jwt} zlyhal`)).not.toContain("eyJ");
    expect(bezTajomstiev("Authorization: Bearer abcdefgh12345678")).not.toContain(
      "abcdefgh12345678",
    );
    expect(bezTajomstiev("kľúč fk_live_AbCdEf1234567890 neplatný")).toBe("kľúč [kľúč] neplatný");
    expect(bezTajomstiev("re_123456789abcdefgh")).toBe("[kľúč]");
    expect(bezTajomstiev("bot 123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw")).toBe("bot [kľúč]");
  });

  it("skryje heslá a tokeny v parametroch aj v JSON", () => {
    expect(bezTajomstiev("?password=tajne123&x=1")).toBe("?password=[skryté]&x=1");
    expect(bezTajomstiev('{"heslo":"Abc!123","meno":"x"}')).toBe('{"heslo":"[skryté]","meno":"x"}');
    expect(bezTajomstiev("refresh_token: abc.def")).toBe("refresh_token: [skryté]");
  });

  it("skryje e-mail, IBAN, rodné číslo a číslo karty", () => {
    expect(bezTajomstiev("pre jan.novak@firma.sk")).toBe("pre [e-mail]");
    expect(bezTajomstiev("IBAN SK3112000000198742637541")).toBe("IBAN [IBAN]");
    expect(bezTajomstiev("RČ 850101/1234")).toBe("RČ [RČ]");
    expect(bezTajomstiev("karta 4111 1111 1111 1111")).toBe("karta [číslo]");
  });

  it("nechá bežný text a kódy chýb databázy", () => {
    expect(bezTajomstiev("duplicate key value violates unique constraint (code 23505)")).toBe(
      "duplicate key value violates unique constraint (code 23505)",
    );
    expect(bezTajomstiev("Cannot read properties of undefined (reading 'id')")).toBe(
      "Cannot read properties of undefined (reading 'id')",
    );
  });

  it("oreže dlhý text", () => {
    const s = bezTajomstiev("a ".repeat(5000), 100);
    expect(s.length).toBe(100);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("cistaTrasa", () => {
  it("zahodí query a fragment", () => {
    expect(cistaTrasa("https://www.faktero.sk/faktury/1?token=abc#x")).toBe("/faktury/1");
    expect(cistaTrasa("/auth/potvrdenie?code=123")).toBe("/auth/potvrdenie");
    expect(cistaTrasa(null)).toBeNull();
  });
});

describe("odtlačok a zlučovanie", () => {
  const stack1 = `TypeError: x is undefined
    at Faktura (https://www.faktero.sk/assets/faktury-AbCd1234.js:10:20)
    at renderWithHooks (https://www.faktero.sk/assets/vendor-XyZ98765.js:1:1)`;
  const stack2 = `TypeError: x is undefined
    at Faktura (https://www.faktero.sk/assets/faktury-QwEr5678.js:11:5)`;

  it("rovnaká chyba s inými číslami a identifikátormi má rovnaký odtlačok", () => {
    const a = odtlacokChyby({
      zdroj: "server",
      sprava: "Faktúra 123 (id 3f2504e0-4f89-11d3-9a0c-0305e82c3301) sa nenašla",
    });
    const b = odtlacokChyby({
      zdroj: "server",
      sprava: "Faktúra 987 (id 7c9e6679-7425-40de-944b-e07fc1f90ae7) sa nenašla",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{28}$/);
  });

  it("hash súboru a riadok po novom vydaní odtlačok nezmenia", () => {
    expect(miestoZoStacku(stack1)).toBe(miestoZoStacku(stack2));
    expect(odtlacokChyby({ zdroj: "prehliadac", sprava: "x", stack: stack1 })).toBe(
      odtlacokChyby({ zdroj: "prehliadac", sprava: "x", stack: stack2 }),
    );
  });

  it("iný zdroj, miesto alebo úroveň dá iný odtlačok", () => {
    const z = { sprava: "boom" };
    expect(odtlacokChyby({ zdroj: "server", ...z })).not.toBe(
      odtlacokChyby({ zdroj: "appka", ...z }),
    );
    expect(odtlacokChyby({ zdroj: "server", kde: "a#f", ...z })).not.toBe(
      odtlacokChyby({ zdroj: "server", kde: "b#g", ...z }),
    );
    expect(odtlacokChyby({ zdroj: "server", ...z })).not.toBe(
      odtlacokChyby({ zdroj: "server", uroven: "varovanie", ...z }),
    );
  });

  it("miesto preskočí rámce z node_modules", () => {
    const s = `Error: x
    at f (/app/node_modules/lib/index.js:1:1)
    at nasa (/app/.output/server/chunks/faktury.mjs:5:6)`;
    expect(miestoZoStacku(s)).toBe("at nasa (/app/.output/server/chunks/faktury.mjs)");
  });
});

describe("šum a staré vydanie", () => {
  it("rozšírenia, ResizeObserver, zrušené a sieťové chyby sú šum", () => {
    expect(jeSumPrehliadaca({ sprava: "x", stack: "at chrome-extension://abc/x.js:1" })).toBe(true);
    expect(jeSumPrehliadaca({ sprava: "ResizeObserver loop limit exceeded" })).toBe(true);
    expect(jeSumPrehliadaca({ sprava: "Script error." })).toBe(true);
    expect(jeSumPrehliadaca({ sprava: "AbortError: The user aborted a request." })).toBe(true);
    expect(jeSumPrehliadaca({ sprava: "TypeError: Failed to fetch" })).toBe(true);
    expect(jeSumPrehliadaca({ sprava: "Load failed" })).toBe(true);
    expect(jeSumPrehliadaca({ sprava: "TypeError: a is undefined", stack: "at f (x.js)" })).toBe(
      false,
    );
  });

  it("ChunkLoadError a chýbajúci modul sú staré vydanie", () => {
    expect(jeStareVydanie("ChunkLoadError: Loading chunk 12 failed")).toBe(true);
    expect(
      jeStareVydanie(
        "TypeError: Failed to fetch dynamically imported module: https://www.faktero.sk/assets/a-1.js",
      ),
    ).toBe(true);
    expect(jeStareVydanie("Importing a module script failed.")).toBe(true);
    expect(jeStareVydanie("TypeError: x is undefined")).toBe(false);
  });
});

describe("StropZapisov", () => {
  it("ten istý odtlačok zapíše raz za okno a odložené výskyty priráta", () => {
    let t = 0;
    const s = new StropZapisov(60, 10_000, () => t);
    expect(s.pust("server", "a")).toBe(1);
    t = 1000;
    expect(s.pust("server", "a")).toBeNull();
    expect(s.pust("server", "a")).toBeNull();
    t = 11_000;
    expect(s.pust("server", "a")).toBe(3);
  });

  it("strop za minútu na zdroj, iný zdroj ide ďalej", () => {
    let t = 0;
    const s = new StropZapisov(3, 10_000, () => t);
    expect(s.pust("prehliadac", "1")).toBe(1);
    expect(s.pust("prehliadac", "2")).toBe(1);
    expect(s.pust("prehliadac", "3")).toBe(1);
    expect(s.pust("prehliadac", "4")).toBeNull();
    expect(s.pust("server", "5")).toBe(1);
    t = 61_000;
    // Po minúte ide aj odložený výskyt.
    expect(s.pust("prehliadac", "4")).toBe(2);
  });
});

describe("OknoPokusov", () => {
  it("pustí max pokusov za okno", () => {
    let t = 0;
    const o = new OknoPokusov(2, 1000, () => t);
    expect(o.skus("ip")).toBe(true);
    expect(o.skus("ip")).toBe(true);
    expect(o.skus("ip")).toBe(false);
    expect(o.skus("ina")).toBe(true);
    t = 1500;
    expect(o.skus("ip")).toBe(true);
  });
});

describe("rozoberChybu a cistyStack", () => {
  it("správa s menom triedy, objekt aj reťazec", () => {
    expect(rozoberChybu(new TypeError("zlé")).sprava).toBe("TypeError: zlé");
    expect(rozoberChybu(new Error("x")).sprava).toBe("x");
    expect(rozoberChybu({ message: "y", code: "PGRST" }).sprava).toBe("y");
    expect(rozoberChybu("z").sprava).toBe("z");
    expect(rozoberChybu(undefined).sprava).toBe("(prázdna chyba)");
  });

  it("príčina (cause) ide do stacku; pri obale Reactu aj do správy", () => {
    // Presne ako React 19 hlási #520: obal s príčinou v `cause`.
    const pricina = new TypeError("x is not a function");
    const obal = new Error(
      "Minified React error #520; visit https://react.dev/errors/520 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.",
      { cause: pricina },
    );
    const r = rozoberChybu(obal);
    expect(r.sprava).toBe("Minified React error #520 — príčina: TypeError: x is not a function");
    expect(r.stack).toContain("Caused by: TypeError: x is not a function");
    expect(jeObalReactu(obal.message)).toBe(true);

    // Bežná chyba s príčinou: správa ostáva, príčina len v stacku.
    const db = new Error("Uloženie zlyhalo", { cause: new Error("duplicate key") });
    expect(rozoberChybu(db).sprava).toBe("Uloženie zlyhalo");
    expect(rozoberChybu(db).stack).toContain("Caused by: duplicate key");
    expect(jeObalReactu("TypeError: x")).toBe(false);
  });

  it("stack bez query a tajomstiev, najviac 41 riadkov", () => {
    const s = cistyStack(
      [
        "Error: x",
        "at f (https://www.faktero.sk/a.js?token=eyJabc:1:2)",
        ...Array(60).fill("at g"),
      ].join("\n"),
    )!;
    expect(s).not.toContain("token");
    expect(s.split("\n").length).toBe(41);
  });
});
