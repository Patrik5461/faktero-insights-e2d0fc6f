import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import {
  HLAS_PRE,
  MAX_NAVRHOV,
  cestaPreCiel,
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
  NASTROJE,
  overSmieHlas,
  spracujPrikaz,
  spravyHistorie,
  type ProstredieHlasu,
  type VykonavaceNastrojov,
} from "./hlas.server";

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
    expect(smieHlas({ adminRole: "superadmin", nativna: false, userId: "b54840e1-e150-4202-baea-4c49790e3f65" })).toBe(true);
    // Iný admin ako Patrikov testovací účet hlas nevidí.
    expect(smieHlas({ adminRole: "superadmin", nativna: false, userId: "00000000-0000-0000-0000-000000000000" })).toBe(false);
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
    await expect(overSmieHlas({ supabase: sb(null), userId: ID1 })).rejects.toThrow(CHYBA_LEN_ADMINI);
    await expect(overSmieHlas({ supabase: sb({ role: "admin" }), userId: "b54840e1-e150-4202-baea-4c49790e3f65" })).resolves.toBeUndefined();
  });

  it("každá serverová funkcia hlasu overí admina aj prístup k firme", () => {
    const s = readFileSync(join(__dirname, "hlas.functions.ts"), "utf8");
    const obsluhy = s.split("createServerFn(").slice(1);
    expect(obsluhy.length).toBe(2);
    for (const o of obsluhy) {
      expect(o).toContain("requireSupabaseAuth");
      expect(o.indexOf("overSmieHlas")).toBeGreaterThan(-1);
      expect(o.indexOf("overPristup")).toBeGreaterThan(o.indexOf("overSmieHlas"));
    }
    // Zápis len s oprávnením upravovať doklady.
    expect(obsluhy[1]).toContain('oblast: "doklady", zapis: true');
    // Bez servisného kľúča — všetko cez RLS prihláseného.
    expect(s).not.toContain("supabaseAdmin");
  });
});

describe("hlas — povolené ciele navigácie", () => {
  it("známe ciele vedú na pevné cesty", () => {
    expect(cestaPreCiel("nespracovane")).toEqual({ to: "/nespracovane" });
    expect(cestaPreCiel("prijate_faktury")).toEqual({ to: "/prijate-faktury" });
    expect(cestaPreCiel("vystavene_faktury")).toEqual({ to: "/faktury" });
    expect(cestaPreCiel("dph_vykazy")).toEqual({ to: "/uctovnictvo/vykazy" });
    expect(cestaPreCiel("detail_prijata", ID1)).toEqual({
      to: "/prijate-faktury/$id",
      params: { id: ID1 },
    });
  });

  it("čokoľvek mimo zoznamu alebo detail bez platného id sa zahodí", () => {
    expect(cestaPreCiel("admin")).toBeNull();
    expect(cestaPreCiel("/admin/users")).toBeNull();
    expect(cestaPreCiel("https://zly.example")).toBeNull();
    expect(cestaPreCiel("detail_vystavena", null)).toBeNull();
    expect(cestaPreCiel("detail_vystavena", "../admin")).toBeNull();
  });

  it("enum nástroja navigate sa zhoduje so zoznamom ciest", () => {
    const nav = NASTROJE.find((n) => n.name === "navigate")!;
    const ciele = (nav.input_schema.properties as any).ciel.enum as string[];
    for (const c of ciele) expect(cestaPreCiel(c, ID1)).not.toBeNull();
    for (const n of NASTROJE) {
      expect(n.strict).toBe(true);
      expect((n.input_schema as any).additionalProperties).toBe(false);
    }
  });
});

describe("hlas — potvrdenie", () => {
  it("súhlas rozpozná len z krátkej vety bez zápory", () => {
    for (const v of ["potvrď", "Áno", "áno, ulož to", "Potvrdzujem.", "ok", "zaúčtuj to", "potvrzuji"])
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
        { typ: "prijata", id: ID1, cislo: "1", partner: null, suma: 1, mena: "EUR", predkontacia: "518", clenenieDph: "PD", kvClenenie: "B2", zdroj: "ai", istota: 90, upozornenia: [], nedaSa: null },
        { typ: "prijata", id: ID2, cislo: "2", partner: null, suma: 1, mena: "EUR", predkontacia: null, clenenieDph: null, kvClenenie: null, zdroj: null, istota: null, upozornenia: [], nedaSa: "bez návrhu" },
        { typ: "prijata", id: ID3, cislo: "3", partner: null, suma: 1, mena: "EUR", predkontacia: "501", clenenieDph: null, kvClenenie: null, zdroj: "zvyk", istota: 80, upozornenia: [], nedaSa: "už je zaúčtovaný" },
      ],
    };
    expect(naPotvrdenie(n).map((p) => p.id)).toEqual([ID1]);
    expect(naPotvrdenie(null)).toEqual([]);
  });
});

describe("hlas — ktoré doklady navrhnúť", () => {
  it("označené > otvorený > na obrazovke; cudzie id nie", () => {
    expect(dokladyNaNavrh(kontext(), []).doklady.map((d) => d.id)).toEqual([ID1, ID2]);
    expect(dokladyNaNavrh(kontext({ oznacene: [ID2] }), []).doklady.map((d) => d.id)).toEqual([ID2]);
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
    expect(vyberHlas([h("Microsoft Lukas", "sk-SK"), h("Laura", "sk-SK")], "sk").hlas?.name).toBe("Laura");
    const r = vyberHlas([h("Microsoft Lukas", "sk-SK"), h("Zuzana", "cs-CZ")], "sk");
    expect(r).toEqual({ hlas: h("Zuzana", "cs-CZ"), zensky: true });
    expect(vyberHlas([h("Microsoft Viktoria Online (Natural)", "sk-SK")], "sk").zensky).toBe(true);
  });
  it("bez ženského hocijaký slovenský; uložená voľba vyhráva", () => {
    expect(vyberHlas([h("Microsoft Lukas", "sk-SK"), h("Alex", "en-US")], "sk")).toEqual({
      hlas: h("Microsoft Lukas", "sk-SK"),
      zensky: false,
    });
    expect(vyberHlas([h("Laura", "sk-SK"), h("Zuzana", "cs-CZ")], "sk", "Zuzana").hlas?.name).toBe("Zuzana");
    expect(vyberHlas([h("Alex", "en-US")], "sk").hlas).toBeNull();
    // Česky nastavené rozhranie: najprv český ženský.
    expect(vyberHlas([h("Laura", "sk-SK"), h("Zuzana", "cs-CZ")], "cs").hlas?.name).toBe("Zuzana");
  });
  it("predčíta sa len krátky text bez markdownu", () => {
    expect(textNaPrecitanie("**Hotovo** — 3 doklady.")).toBe("Hotovo — 3 doklady.");
    expect(textNaPrecitanie("Prvá veta je dosť dlhá na to, aby sa zmestila. " + "x".repeat(400)).endsWith(".")).toBe(true);
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
const nastroj = (name: string, input: unknown, id = "tu_1") => ({ type: "tool_use", id, name, input });
const text = (t: string) => ({ type: "text", text: t });

function prostredie(odpovede: Anthropic.Message[], nastroje: Partial<VykonavaceNastrojov> = {}) {
  const volania: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const n: VykonavaceNastrojov = {
    zoznam: vi.fn(async () => []),
    navrhni: vi.fn(async (d) => ({
      vynechane: 0,
      polozky: d.map((x: any) => ({
        typ: x.typ, id: x.id, cislo: x.cislo ?? null, partner: x.partner ?? null, suma: x.suma ?? null, mena: x.mena ?? null,
        predkontacia: "518", clenenieDph: "PD", kvClenenie: "B2", zdroj: "ai", istota: 90, upozornenia: [], nedaSa: null,
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

describe("hlas — smerovanie príkazov (podstrčený Claude)", () => {
  it("„otvor nespracované“ → navigácia na /nespracovane", async () => {
    const { env, volania } = prostredie([
      sprava([nastroj("navigate", { ciel: "nespracovane", id: null })], "tool_use"),
      sprava([text("Otváram nespracované doklady.")], "end_turn"),
    ]);
    const r = await spracujPrikaz(env, vstup("otvor mi nespracované doklady"));
    expect(r.akcie).toEqual([
      { typ: "navigovat", ciel: "nespracovane", navigacia: { to: "/nespracovane" } },
    ]);
    expect(r.text).toBe("Otváram nespracované doklady.");
    // Haiku, nástroje strict, kontext stránky v správe.
    expect(volania[0].model).toBe("claude-haiku-5-5");
    expect(volania[0].tools?.every((t: any) => t.strict)).toBe(true);
    expect(JSON.stringify(volania[0].messages)).toContain(ID1);
    // Druhé kolo nesie výsledok nástroja v jednej user správe.
    const posledna = volania[1].messages[volania[1].messages.length - 1];
    expect(posledna.role).toBe("user");
    expect((posledna.content as any[])[0].type).toBe("tool_result");
  });

  it("nepovolený cieľ sa neotvorí a model dostane chybu", async () => {
    const { env, volania } = prostredie([
      sprava([nastroj("navigate", { ciel: "admin", id: null })], "tool_use"),
      sprava([text("Toto otvoriť nemôžem.")], "end_turn"),
    ]);
    const r = await spracujPrikaz(env, vstup("otvor administráciu"));
    expect(r.akcie).toEqual([]);
    const vysledok = (volania[1].messages[volania[1].messages.length - 1].content as any[])[0];
    expect(vysledok.content).toContain("nie je povolený");
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
    expect(r.akcie[0].typ).toBe("navrh");
    // Nástroje hlasu nemajú žiadny zápis — potvrdenie ide inou cestou.
    expect(Object.keys(n).sort()).toEqual(["dph", "navrhni", "poSplatnosti", "zoznam"]);
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
      sprava([nastroj("overdue_receivables", {}, "a"), nastroj("vat_summary", { rok: 2026, mesiac: 13 }, "b")], "tool_use"),
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
        sprava([nastroj("list_documents", { druh: "prijate", hladat: "Orange", len_nezauctovane: true, limit: 99 })], "tool_use"),
        sprava([text("Zoznam sa nepodarilo načítať.")], "end_turn"),
      ],
      { zoznam: vi.fn(async () => { throw new Error("RLS"); }) },
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
