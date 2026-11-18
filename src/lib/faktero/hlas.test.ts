import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import {
  HLAS_PRE,
  MAX_NAVRHOV,
  dokladyNaNavrh,
  jePotvrdenie,
  jeZrusenie,
  naPotvrdenie,
  smieHlas,
  smiePotvrdit,
  textNaPrecitanie,
  vyberHlas,
  type KontextHlasu,
  type NavrhHlasu,
} from "./hlas";
import {
  CHYBA_LEN_ADMINI,
  nastrojeHlasu,
  overSmieHlas,
  spracujPrikaz,
  spravyHistorie,
  type ProstredieHlasu,
  type VykonavaceNastrojov,
} from "./hlas.server";
import { navigaciaPreStranku, strankyPreHlas } from "./hlas-stranky";

const STRANKY = strankyPreHlas(false);

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const FIRMA = "99999999-9999-4999-8999-999999999999";

const kontext = (z: Partial<KontextHlasu> = {}): KontextHlasu => ({
  stranka: "nespracovane",
  cesta: "/nespracovane",
  doklady: [
    { typ: "nespracovany", id: ID1, cislo: "F1", partner: "Orange", suma: 12, mena: "EUR" },
    { typ: "nespracovany", id: ID2, cislo: "F2", partner: "Shell", suma: 50, mena: "EUR" },
  ],
  oznacene: [],
  otvoreny: null,
  ...z,
});

describe("hlas — kto ho vidí", () => {
  it("len administrátori platformy a len na webe", () => {
    expect(HLAS_PRE).toBe("admini");
    expect(
      smieHlas({
        adminRole: "superadmin",
        nativna: false,
        userId: "b54840e1-e150-4202-baea-4c49790e3f65",
      }),
    ).toBe(true);
    // Iný admin ako Patrikov testovací účet hlas nevidí.
    expect(
      smieHlas({
        adminRole: "superadmin",
        nativna: false,
        userId: "00000000-0000-0000-0000-000000000000",
      }),
    ).toBe(false);
    expect(smieHlas({ adminRole: "superadmin", nativna: false })).toBe(false);
    expect(smieHlas({ adminRole: null, nativna: false })).toBe(false);
    expect(smieHlas({ adminRole: "admin", nativna: true })).toBe(false);
  });

  it("server odmietne používateľa bez riadku v platform_admins", async () => {
    const sb = (riadok: unknown) => ({
      from: (t: string) => {
        expect(t).toBe("platform_admins");
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: riadok, error: null }),
        };
        return q;
      },
    });
    await expect(overSmieHlas({ supabase: sb(null), userId: ID1 })).rejects.toThrow(
      CHYBA_LEN_ADMINI,
    );
    await expect(
      overSmieHlas({
        supabase: sb({ role: "admin" }),
        userId: "b54840e1-e150-4202-baea-4c49790e3f65",
      }),
    ).resolves.toEqual({ admin: true });
  });

  it("každá serverová funkcia hlasu overí admina aj prístup k firme", () => {
    const s = readFileSync(join(__dirname, "hlas.functions.ts"), "utf8");
    const obsluhy = s.split("createServerFn(").slice(1);
    expect(obsluhy.length).toBe(3);
    for (const o of obsluhy) {
      expect(o).toContain("requireSupabaseAuth");
      expect(o.indexOf("overSmieHlas")).toBeGreaterThan(-1);
      expect(o.indexOf("overPristup")).toBeGreaterThan(o.indexOf("overSmieHlas"));
    }
    // Zápis len s oprávnením upravovať doklady.
    expect(obsluhy[2]).toContain('oblast: "doklady", zapis: true');
    // Prepis ani príkaz nezapisujú.
    expect(obsluhy[0]).not.toContain("zapis: true");
    expect(obsluhy[1]).not.toContain("zapis: true");
    // Bez servisného kľúča — všetko cez RLS prihláseného.
    expect(s).not.toContain("supabaseAdmin");
  });
});

describe("hlas — navigácia podľa katalógu stránok", () => {
  it("kľúče katalógu vedú na trasy routera, menu s parametrom aj s ním", () => {
    expect(navigaciaPreStranku(STRANKY, "/nespracovane")).toMatchObject({ to: "/nespracovane" });
    expect(navigaciaPreStranku(STRANKY, "/pokladna")).toMatchObject({
      to: "/pokladna",
      nazov: "Pokladňa",
    });
    expect(navigaciaPreStranku(STRANKY, "/faktury?type=credit")).toMatchObject({
      to: "/faktury",
      search: { type: "credit" },
      nazov: "Dobropisy",
    });
    expect(navigaciaPreStranku(STRANKY, "/prijate-faktury/$id", ID1)).toMatchObject({
      to: "/prijate-faktury/$id",
      params: { id: ID1 },
    });
    expect(navigaciaPreStranku(STRANKY, "/doklady", null, "B-123")).toMatchObject({
      to: "/doklady",
      search: { q: "B-123" },
    });
  });

  it("čokoľvek mimo katalógu, admin pre neadmina alebo detail bez platného id sa zahodí", () => {
    expect(navigaciaPreStranku(STRANKY, "admin")).toBeNull();
    expect(navigaciaPreStranku(STRANKY, "/admin/users")).toBeNull();
    expect(navigaciaPreStranku(strankyPreHlas(true), "/admin/users")).toMatchObject({
      to: "/admin/users",
    });
    expect(navigaciaPreStranku(STRANKY, "https://zly.example")).toBeNull();
    expect(navigaciaPreStranku(STRANKY, "/faktury/$id", null)).toBeNull();
    expect(navigaciaPreStranku(STRANKY, "/faktury/$id", "../admin")).toBeNull();
  });

  it("enum nástroja navigate = kľúče katalógu; všetky nástroje strict", () => {
    const n = nastrojeHlasu(STRANKY);
    const nav = n.find((x) => x.name === "navigate")!;
    const kluce = (nav.input_schema.properties as any).stranka.enum as string[];
    expect(kluce).toEqual(STRANKY.map((s) => s.kluc));
    for (const k of kluce) expect(navigaciaPreStranku(STRANKY, k, ID1)).not.toBeNull();
    for (const x of n) {
      expect(x.strict).toBe(true);
      expect((x.input_schema as any).additionalProperties).toBe(false);
      // Strict schéma: každá vlastnosť povinná.
      expect(((x.input_schema as any).required ?? []).sort()).toEqual(
        Object.keys((x.input_schema as any).properties).sort(),
      );
    }
  });
});

describe("hlas — potvrdenie", () => {
  it("súhlas rozpozná len z krátkej vety bez zápory", () => {
    for (const v of [
      "potvrď",
      "Áno",
      "áno, ulož to",
      "Potvrdzujem.",
      "ok",
      "zaúčtuj to",
      "potvrzuji",
    ])
      expect(jePotvrdenie(v)).toBe(true);
    for (const v of [
      "nepotvrdzuj",
      "nie",
      "zruš to",
      "otvor nespracované doklady",
      "navrhni zaúčtovanie pre všetky faktúry od Orange za október prosím",
      "",
    ])
      expect(jePotvrdenie(v)).toBe(false);
    expect(jeZrusenie("zruš")).toBe(true);
    expect(jeZrusenie("nie, nechaj to")).toBe(true);
    expect(jeZrusenie("potvrď")).toBe(false);
  });

  it("bez čakajúceho návrhu a bez výslovného súhlasu sa nezapisuje", () => {
    expect(smiePotvrdit({ maNavrh: false, klik: true })).toBe(false);
    expect(smiePotvrdit({ maNavrh: false, text: "potvrď" })).toBe(false);
    expect(smiePotvrdit({ maNavrh: true })).toBe(false);
    expect(smiePotvrdit({ maNavrh: true, text: "ukáž prijaté faktúry" })).toBe(false);
    expect(smiePotvrdit({ maNavrh: true, text: "potvrď" })).toBe(true);
    expect(smiePotvrdit({ maNavrh: true, klik: true })).toBe(true);
  });

  it("na potvrdenie idú len riadky s predkontáciou, ktoré sa dajú zapísať", () => {
    const n: NavrhHlasu = {
      vynechane: 0,
      polozky: [
        {
          typ: "prijata",
          id: ID1,
          cislo: "1",
          partner: null,
          suma: 1,
          mena: "EUR",
          predkontacia: "518",
          clenenieDph: "PD",
          kvClenenie: "B2",
          zdroj: "ai",
          istota: 90,
          upozornenia: [],
          nedaSa: null,
        },
        {
          typ: "prijata",
          id: ID2,
          cislo: "2",
          partner: null,
          suma: 1,
          mena: "EUR",
          predkontacia: null,
          clenenieDph: null,
          kvClenenie: null,
          zdroj: null,
          istota: null,
          upozornenia: [],
          nedaSa: "bez návrhu",
        },
        {
          typ: "prijata",
          id: ID3,
          cislo: "3",
          partner: null,
          suma: 1,
          mena: "EUR",
          predkontacia: "501",
          clenenieDph: null,
          kvClenenie: null,
          zdroj: "zvyk",
          istota: 80,
          upozornenia: [],
          nedaSa: "už je zaúčtovaný",
        },
      ],
    };
    expect(naPotvrdenie(n).map((p) => p.id)).toEqual([ID1]);
    expect(naPotvrdenie(null)).toEqual([]);
  });
});

describe("hlas — ktoré doklady navrhnúť", () => {
  it("označené > otvorený > na obrazovke; cudzie id nie", () => {
    expect(dokladyNaNavrh(kontext(), []).doklady.map((d) => d.id)).toEqual([ID1, ID2]);
    expect(dokladyNaNavrh(kontext({ oznacene: [ID2] }), []).doklady.map((d) => d.id)).toEqual([
      ID2,
    ]);
    expect(
      dokladyNaNavrh(kontext({ doklady: [], otvoreny: { typ: "prijata", id: ID3 } }), []).doklady,
    ).toEqual([{ typ: "prijata", id: ID3 }]);
    // Id, ktoré stránka ani zoznam neukázali, sa ignoruje.
    expect(dokladyNaNavrh(kontext(), [ID3]).doklady).toEqual([]);
    expect(
      dokladyNaNavrh(kontext(), [ID3], [{ typ: "vystavena", id: ID3 }]).doklady.map((d) => d.id),
    ).toEqual([ID3]);
  });

  it("najviac MAX_NAVRHOV naraz, zvyšok sa ohlási", () => {
    const veľa = Array.from({ length: 13 }, (_, i) => ({
      typ: "prijata" as const,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    }));
    const r = dokladyNaNavrh(kontext({ doklady: veľa }), []);
    expect(r.doklady).toHaveLength(MAX_NAVRHOV);
    expect(r.vynechane).toBe(3);
  });
});

describe("hlas — ženský hlas", () => {
  const h = (name: string, lang: string) => ({ name, lang });
  it("ženský slovenský pred mužským, potom ženský český", () => {
    expect(vyberHlas([h("Microsoft Lukas", "sk-SK"), h("Laura", "sk-SK")], "sk").hlas?.name).toBe(
      "Laura",
    );
    const r = vyberHlas([h("Microsoft Lukas", "sk-SK"), h("Zuzana", "cs-CZ")], "sk");
    expect(r).toEqual({ hlas: h("Zuzana", "cs-CZ"), zensky: true });
    expect(vyberHlas([h("Microsoft Viktoria Online (Natural)", "sk-SK")], "sk").zensky).toBe(true);
  });
  it("bez ženského hocijaký slovenský; uložená voľba vyhráva", () => {
    expect(vyberHlas([h("Microsoft Lukas", "sk-SK"), h("Alex", "en-US")], "sk")).toEqual({
      hlas: h("Microsoft Lukas", "sk-SK"),
      zensky: false,
    });
    expect(vyberHlas([h("Laura", "sk-SK"), h("Zuzana", "cs-CZ")], "sk", "Zuzana").hlas?.name).toBe(
      "Zuzana",
    );
    expect(vyberHlas([h("Alex", "en-US")], "sk").hlas).toBeNull();
    // Česky nastavené rozhranie: najprv český ženský.
    expect(vyberHlas([h("Laura", "sk-SK"), h("Zuzana", "cs-CZ")], "cs").hlas?.name).toBe("Zuzana");
  });
  it("predčíta sa len krátky text bez markdownu", () => {
    expect(textNaPrecitanie("**Hotovo** — 3 doklady.")).toBe("Hotovo — 3 doklady.");
    expect(
      textNaPrecitanie(
        "Prvá veta je dosť dlhá na to, aby sa zmestila. " + "x".repeat(400),
      ).endsWith("."),
    ).toBe(true);
  });
});

/* ---------- Slučka s podstrčeným Claudom ---------- */

function sprava(content: any[], stop: Anthropic.Message["stop_reason"]): Anthropic.Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  } as unknown as Anthropic.Message;
}
const nastroj = (name: string, input: unknown, id = "tu_1") => ({
  type: "tool_use",
  id,
  name,
  input,
});
const text = (t: string) => ({ type: "text", text: t });

function prostredie(odpovede: Anthropic.Message[], nastroje: Partial<VykonavaceNastrojov> = {}) {
  const volania: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const n: VykonavaceNastrojov = {
    hladaj: vi.fn(async () => []),
    pocty: vi.fn(async () => ({ nespracovane_doklady: 7 })),
    firmy: vi.fn(async () => []),
    banka: vi.fn(async () => ({ suhrn: {}, polozky: [] })),
    kontakty: vi.fn(async () => []),
    produkty: vi.fn(async () => []),
    zakazky: vi.fn(async () => []),
    navrhni: vi.fn(async (d) => ({
      vynechane: 0,
      polozky: d.map((x: any) => ({
        typ: x.typ,
        id: x.id,
        cislo: x.cislo ?? null,
        partner: x.partner ?? null,
        suma: x.suma ?? null,
        mena: x.mena ?? null,
        predkontacia: "518",
        clenenieDph: "PD",
        kvClenenie: "B2",
        zdroj: "ai",
        istota: 90,
        upozornenia: [],
        nedaSa: null,
      })),
    })),
    poSplatnosti: vi.fn(async () => ({ pocet: 2, spolu_podla_meny: { EUR: 300 } })),
    dph: vi.fn(async () => ({ rozdiel: 120 })),
    ...nastroje,
  };
  const env: ProstredieHlasu = {
    jazyk: "sk",
    dnes: "2026-11-18",
    companyId: FIRMA,
    firma: "Tobify s.r.o.",
    stranky: STRANKY,
    nastroje: n,
    volajModel: vi.fn(async (p) => {
      volania.push(JSON.parse(JSON.stringify(p)));
      const o = odpovede.shift();
      if (!o) throw new Error("model volaný viackrát, než sa čakalo");
      return o;
    }),
  };
  return { env, n, volania };
}

const vstup = (t: string, z: Partial<Parameters<typeof spracujPrikaz>[1]> = {}) => ({
  text: t,
  kontext: kontext(),
  historia: [],
  cakaNavrh: false,
  zname: [],
  ...z,
});

const hladanie = (z: Record<string, unknown> = {}) => ({
  druh: "prijate",
  partner: null,
  cislo: null,
  suma: null,
  datum_od: null,
  datum_do: null,
  stav: "vsetky",
  otvorit: false,
  limit: 10,
  ...z,
});

describe("hlas — smerovanie príkazov (podstrčený Claude)", () => {
  it("„otvor nespracované“ → navigácia na /nespracovane", async () => {
    const { env, volania } = prostredie([
      sprava(
        [nastroj("navigate", { stranka: "/nespracovane", id: null, hladat: null })],
        "tool_use",
      ),
      sprava([text("Otváram nespracované doklady.")], "end_turn"),
    ]);
    const r = await spracujPrikaz(env, vstup("otvor mi nespracované doklady"));
    expect(r.akcie).toEqual([
      { typ: "navigovat", navigacia: { to: "/nespracovane" }, nazov: "Nespracované doklady" },
    ]);
    expect(r.text).toBe("Otváram nespracované doklady.");
    // Haiku, nástroje strict, kontext stránky v správe.
    expect(volania[0].model).toBe("claude-haiku-5-5");
    expect(volania[0].tools?.every((t: any) => t.strict)).toBe(true);
    // Pokyn: dnešok, obdobia, aktívna firma a katalóg stránok; v cache.
    const pokyn = (volania[0].system as any[])[0];
    expect(pokyn.cache_control).toEqual({ type: "ephemeral" });
    expect(pokyn.text).toContain("Dnes je 2026-11-18");
    expect(pokyn.text).toContain("Minulý mesiac: 2026-10-01 až 2026-10-31");
    expect(pokyn.text).toContain("Aktívna firma: Tobify s.r.o.");
    expect(pokyn.text).toContain("/pokladna — Pokladňa");
    expect(JSON.stringify(volania[0].messages)).toContain(ID1);
    // Druhé kolo nesie výsledok nástroja v jednej user správe.
    const posledna = volania[1].messages[volania[1].messages.length - 1];
    expect(posledna.role).toBe("user");
    expect((posledna.content as any[])[0].type).toBe("tool_result");
  });

  it("nepovolený cieľ sa neotvorí a model dostane chybu", async () => {
    const { env, volania } = prostredie([
      sprava(
        [nastroj("navigate", { stranka: "/admin/users", id: null, hladat: null })],
        "tool_use",
      ),
      sprava([text("Toto otvoriť nemôžem.")], "end_turn"),
    ]);
    const r = await spracujPrikaz(env, vstup("otvor administráciu"));
    expect(r.akcie).toEqual([]);
    const vysledok = (volania[1].messages[volania[1].messages.length - 1].content as any[])[0];
    expect(vysledok.content).toContain("nie je v katalógu");
  });

  it("„navrhni zaúčtovanie“ → návrh pre doklady na obrazovke, nič sa nezapíše", async () => {
    const { env, n } = prostredie([
      sprava([nastroj("propose_accounting", { ids: [] })], "tool_use"),
      sprava([text("Navrhla som zaúčtovanie dvoch dokladov. Potvrdíte?")], "end_turn"),
    ]);
    const r = await spracujPrikaz(env, vstup("navrhni zaúčtovanie"));
    expect(n.navrhni).toHaveBeenCalledTimes(1);
    expect((n.navrhni as any).mock.calls[0][0].map((d: any) => d.id)).toEqual([ID1, ID2]);
    expect(r.akcie).toHaveLength(1);
    expect(r.akcie[0]).toMatchObject({ typ: "navrh_akcie", akcia: { druh: "zauctovanie" } });
    // Nástroje hlasu nemajú žiadny zápis — potvrdenie ide inou cestou.
    expect(Object.keys(n).sort()).toEqual([
      "banka",
      "dph",
      "firmy",
      "hladaj",
      "kontakty",
      "navrhni",
      "poSplatnosti",
      "pocty",
      "produkty",
      "zakazky",
    ]);
  });

  it("confirm_pending bez čakajúceho návrhu nič nespraví", async () => {
    const { env } = prostredie([
      sprava([nastroj("confirm_pending", { potvrdit: true })], "tool_use"),
      sprava([text("Nič na potvrdenie nečaká.")], "end_turn"),
    ]);
    const r = await spracujPrikaz(env, vstup("potvrď"));
    expect(r.akcie).toEqual([]);
  });

  it("confirm_pending s návrhom vráti len akciu — zápis rozhodne prehliadač podľa vety", async () => {
    const { env } = prostredie([
      sprava([nastroj("confirm_pending", { potvrdit: true })], "tool_use"),
      sprava([text("Ukladám.")], "end_turn"),
    ]);
    const r = await spracujPrikaz(env, vstup("hm, asi hej, daj to tam", { cakaNavrh: true }));
    expect(r.akcie).toEqual([{ typ: "potvrdit" }]);
    // Veta nie je jednoznačný súhlas → prehliadač nezapíše.
    expect(smiePotvrdit({ maNavrh: true, text: "hm, asi hej, daj to tam" })).toBe(false);
  });

  it("súhrny volajú čítacie funkcie", async () => {
    const { env, n } = prostredie([
      sprava(
        [
          nastroj("overdue_receivables", {}, "a"),
          nastroj("vat_summary", { rok: 2026, mesiac: 13 }, "b"),
        ],
        "tool_use",
      ),
      sprava([text("Po splatnosti sú dve faktúry za 300 eur.")], "end_turn"),
    ]);
    const r = await spracujPrikaz(env, vstup("koľko máme po splatnosti a DPH za október"));
    expect(n.poSplatnosti).toHaveBeenCalled();
    // Mesiac mimo 1–12 sa oreže.
    expect(n.dph).toHaveBeenCalledWith(2026, 12);
    expect(r.text).toContain("300");
  });

  it("chyba nástroja ide modelu ako is_error a slučka pokračuje", async () => {
    const { env, volania } = prostredie(
      [
        sprava(
          [
            nastroj(
              "find_documents",
              hladanie({ partner: "Orange", stav: "nezauctovane", limit: 99 }),
            ),
          ],
          "tool_use",
        ),
        sprava([text("Zoznam sa nepodarilo načítať.")], "end_turn"),
      ],
      {
        hladaj: vi.fn(async () => {
          throw new Error("RLS");
        }),
      },
    );
    await spracujPrikaz(env, vstup("nájdi faktúry od Orange"));
    const vysledok = (volania[1].messages[volania[1].messages.length - 1].content as any[])[0];
    expect(vysledok.is_error).toBe(true);
  });

  it("odmietnutie modelu nezhodí odpoveď", async () => {
    const { env } = prostredie([sprava([], "refusal")]);
    const r = await spracujPrikaz(env, vstup("čokoľvek"));
    expect(r.akcie).toEqual([]);
    expect(r.text).toBeTruthy();
  });
});

describe("hlas — história rozhovoru", () => {
  it("striedavé správy, začína user a končí asistentom", () => {
    const m = spravyHistorie([
      { kto: "asistent", text: "Ahoj" },
      { kto: "user", text: "otvor faktúry" },
      { kto: "user", text: "vystavené" },
      { kto: "asistent", text: "Otváram." },
      { kto: "user", text: "posledná bez odpovede" },
    ]);
    expect(m.map((x) => x.role)).toEqual(["user", "assistant"]);
    expect(m[0].content).toBe("otvor faktúry\nvystavené");
  });
});

describe("hlas — hľadanie, otvorenie a prepnutie firmy (podstrčený Claude)", () => {
  const orange = {
    typ: "prijata" as const,
    id: ID1,
    cislo: "2026100",
    partner: "Orange Slovensko, a.s.",
    suma: 24.9,
    mena: "EUR",
    datum: "2026-10-05",
    stav: "neuhradená",
  };
  const orange2 = { ...orange, id: ID2, cislo: "2026101", datum: "2026-09-05" };

  it("„nájdi faktúru od Orange za október“ → filter ide vykonávaču, zoznam do panela, nič sa neotvára", async () => {
    const { env, n } = prostredie(
      [
        sprava(
          [
            nastroj(
              "find_documents",
              hladanie({ partner: "orendž", datum_od: "2026-10-01", datum_do: "2026-10-31" }),
            ),
          ],
          "tool_use",
        ),
        sprava([text("Našla som jednu faktúru od Orange za október.")], "end_turn"),
      ],
      { hladaj: vi.fn(async () => [orange]) },
    );
    const r = await spracujPrikaz(env, vstup("nájdi faktúru od orendž za október"));
    expect(n.hladaj).toHaveBeenCalledWith({
      druh: "prijate",
      partner: "orendž",
      cislo: null,
      suma: null,
      datumOd: "2026-10-01",
      datumDo: "2026-10-31",
      stav: "vsetky",
    });
    expect(r.akcie).toEqual([
      { typ: "zoznam", nadpis: "Prijaté faktúry", polozky: [orange], celkom: 1 },
    ]);
    // Nájdený doklad je „známy“ — ďalší príkaz ho smie navrhnúť na zaúčtovanie.
    expect(r.zname.map((d) => d.id)).toContain(ID1);
  });

  it("„otvor faktúru od Orange“ pri jedinej zhode otvorí detail", async () => {
    const { env } = prostredie(
      [
        sprava(
          [nastroj("find_documents", hladanie({ partner: "Orange", otvorit: true }))],
          "tool_use",
        ),
        sprava([text("Otváram faktúru od Orange.")], "end_turn"),
      ],
      { hladaj: vi.fn(async () => [orange]) },
    );
    const r = await spracujPrikaz(env, vstup("otvor faktúru od Orange"));
    expect(r.akcie).toEqual([
      { typ: "navigovat", navigacia: { to: "/prijate-faktury/$id", params: { id: ID1 } } },
    ]);
  });

  it("pri viacerých zhodách sa nič neotvorí, v paneli je zoznam", async () => {
    const { env, volania } = prostredie(
      [
        sprava(
          [nastroj("find_documents", hladanie({ partner: "Orange", otvorit: true }))],
          "tool_use",
        ),
        sprava([text("Mám dve faktúry od Orange, vyberte v paneli.")], "end_turn"),
      ],
      { hladaj: vi.fn(async () => [orange, orange2]) },
    );
    const r = await spracujPrikaz(env, vstup("otvor faktúru od Orange"));
    expect(r.akcie.map((a) => a.typ)).toEqual(["zoznam"]);
    const vysledok = (volania[1].messages[volania[1].messages.length - 1].content as any[])[0];
    expect(vysledok.content).toContain("Viac zhôd");
  });

  it("neplatný dátum od modelu sa zahodí", async () => {
    const { env, n } = prostredie([
      sprava(
        [
          nastroj(
            "find_documents",
            hladanie({ druh: "vystavene", stav: "neuhradene", datum_od: "október" }),
          ),
        ],
        "tool_use",
      ),
      sprava([text("Nič.")], "end_turn"),
    ]);
    await spracujPrikaz(env, vstup("ukáž neuhradené"));
    expect((n.hladaj as any).mock.calls[0][0]).toMatchObject({
      druh: "vystavene",
      stav: "neuhradene",
      datumOd: null,
    });
  });

  it("„koľko je nespracovaných“ → counts_overview", async () => {
    const { env, n } = prostredie([
      sprava([nastroj("counts_overview", {})], "tool_use"),
      sprava([text("V nespracovaných je 7 dokladov.")], "end_turn"),
    ]);
    const r = await spracujPrikaz(env, vstup("koľko dokladov je v nespracovaných"));
    expect(n.pocty).toHaveBeenCalled();
    expect(r.text).toContain("7");
  });

  const firmy = [
    { id: FIRMA, name: "Tobify s.r.o.", ico: "12345678", testovacia_pre: null },
    { id: ID1, name: "PALIERA s.r.o.", ico: "87654321", testovacia_pre: null },
    { id: ID2, name: "Test – PALIERA s.r.o.", ico: null, testovacia_pre: ID1 },
    { id: ID3, name: "Zavar Group a.s.", ico: "11223344", testovacia_pre: null },
  ];

  it("switch_company: jasná zhoda → prepnutie (skutočná firma pred testovacou)", async () => {
    const { env } = prostredie(
      [
        sprava([nastroj("switch_company", { nazov: "paliera" })], "tool_use"),
        sprava([text("Prepínam na PALIERA.")], "end_turn"),
      ],
      { firmy: vi.fn(async () => firmy) },
    );
    const r = await spracujPrikaz(env, vstup("prepni na paliera"));
    expect(r.akcie).toEqual([
      {
        typ: "prepnut_firmu",
        firma: { id: ID1, nazov: "PALIERA s.r.o.", ico: "87654321", testovacia: false },
      },
    ]);
  });

  it("switch_company: „testovaciu palieru“ → testovacia firma", async () => {
    const { env } = prostredie(
      [
        sprava([nastroj("switch_company", { nazov: "testovacia paliera" })], "tool_use"),
        sprava([text("Prepínam.")], "end_turn"),
      ],
      { firmy: vi.fn(async () => firmy) },
    );
    const r = await spracujPrikaz(env, vstup("prepni na testovaciu palieru"));
    expect(r.akcie[0]).toMatchObject({
      typ: "prepnut_firmu",
      firma: { id: ID2, testovacia: true },
    });
  });

  it("switch_company: aktívna firma sa neprepína, neznáma vráti chybu", async () => {
    const { env } = prostredie(
      [
        sprava(
          [
            nastroj("switch_company", { nazov: "tobify" }, "a"),
            nastroj("switch_company", { nazov: "Microsoft" }, "b"),
          ],
          "tool_use",
        ),
        sprava([text("Už ste v Tobify.")], "end_turn"),
      ],
      { firmy: vi.fn(async () => firmy) },
    );
    const r = await spracujPrikaz(env, vstup("prepni na tobify"));
    expect(r.akcie).toEqual([]);
  });

  it("switch_company: nejednoznačné → výber v paneli", async () => {
    const dve = [
      { id: ID1, name: "Novák stavby s.r.o.", ico: "1", testovacia_pre: null },
      { id: ID2, name: "Novák obchod s.r.o.", ico: "2", testovacia_pre: null },
    ];
    const { env } = prostredie(
      [
        sprava([nastroj("switch_company", { nazov: "novák" })], "tool_use"),
        sprava([text("Ktorú firmu Novák?")], "end_turn"),
      ],
      { firmy: vi.fn(async () => dve) },
    );
    const r = await spracujPrikaz(env, vstup("prepni na novák"));
    expect(r.akcie).toHaveLength(1);
    expect(r.akcie[0].typ).toBe("vyber_firmy");
    expect((r.akcie[0] as any).firmy.map((f: any) => f.id).sort()).toEqual([ID1, ID2].sort());
  });
});
