import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
  Webhook podpory vo WhatsAppe s databázou v pamäti a podvrhnutým fetch —
  na Meta, Resend ani do Supabase sa nič neposiela.
*/

type Riadok = Record<string, any>;
const tabulky: Record<string, Riadok[]> = {};
const ulozisko: string[] = [];
let cas = 0;
let cislo = 1000;

const tab = (t: string) => (tabulky[t] ??= []);

/** Predvolené hodnoty stĺpcov, ktoré by inak doplnila databáza. */
function sDefaultmi(t: string, r: Riadok): Riadok {
  const x: Riadok = {
    created_at: new Date(Date.UTC(2026, 9, 29, 10, 0, cas++)).toISOString(),
    ...r,
  };
  if (t === "podpora_poziadavky") {
    x.id ??= crypto.randomUUID();
    x.cislo ??= ++cislo;
    x.stav ??= "nova";
    x.odpoved_token ??= "a".repeat(18);
  } else if (t === "podpora_spravy") {
    x.id ??= crypto.randomUUID();
    x.interna ??= false;
  } else {
    x.id ??= crypto.randomUUID();
  }
  if (t === "whatsapp_chaty") {
    x.user_id ??= null;
    x.poziadavka_id ??= null;
    x.nedorucene_od ??= null;
  }
  return x;
}

/** Unikátne kľúče, ktoré stráži databáza. */
const KLUC: Record<string, string[]> = {
  whatsapp_prijate: ["message_id"],
  whatsapp_chaty: ["wa_id"],
  whatsapp_odoslane: ["wamid"],
  whatsapp_kody: ["kod_hash"],
};

class Dotaz implements PromiseLike<any> {
  private filtre: ((r: Riadok) => boolean)[] = [];
  private akcia: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private hodnoty: any = null;
  private jeden: "single" | "maybe" | null = null;
  private pocet = false;
  private hlava = false;
  private poradie: { stlpec: string; vzostupne: boolean } | null = null;
  private strop: number | null = null;
  constructor(private t: string) {}

  select(_s?: string, o?: { count?: string; head?: boolean }) {
    if (o?.count) this.pocet = true;
    if (o?.head) this.hlava = true;
    return this;
  }
  insert(v: any) {
    this.akcia = "insert";
    this.hodnoty = v;
    return this;
  }
  upsert(v: any) {
    this.akcia = "upsert";
    this.hodnoty = v;
    return this;
  }
  update(v: any) {
    this.akcia = "update";
    this.hodnoty = v;
    return this;
  }
  delete() {
    this.akcia = "delete";
    return this;
  }
  eq(s: string, v: any) {
    this.filtre.push((r) => r[s] === v);
    return this;
  }
  neq(s: string, v: any) {
    this.filtre.push((r) => r[s] !== v);
    return this;
  }
  in(s: string, v: any[]) {
    this.filtre.push((r) => v.includes(r[s]));
    return this;
  }
  gte(s: string, v: any) {
    this.filtre.push((r) => r[s] >= v);
    return this;
  }
  lte(s: string, v: any) {
    this.filtre.push((r) => r[s] <= v);
    return this;
  }
  lt(s: string, v: any) {
    this.filtre.push((r) => r[s] < v);
    return this;
  }
  order(s: string, o?: { ascending?: boolean }) {
    this.poradie = { stlpec: s, vzostupne: o?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.strop = n;
    return this;
  }
  maybeSingle() {
    this.jeden = "maybe";
    return this;
  }
  single() {
    this.jeden = "single";
    return this;
  }

  private vykonaj(): { data: any; error: any; count?: number } {
    const riadky = tab(this.t);
    const sedi = (r: Riadok) => this.filtre.every((f) => f(r));
    let vysledok: Riadok[] = [];
    if (this.akcia === "insert" || this.akcia === "upsert") {
      for (const v of [].concat(this.hodnoty)) {
        const novy = sDefaultmi(this.t, v);
        const kluc = KLUC[this.t];
        const stary = kluc && riadky.find((r) => kluc.every((k) => r[k] === novy[k]));
        if (stary) {
          if (this.akcia === "insert")
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          Object.assign(stary, v);
          vysledok.push(stary);
        } else {
          riadky.push(novy);
          vysledok.push(novy);
        }
      }
    } else if (this.akcia === "update") {
      vysledok = riadky.filter(sedi);
      for (const r of vysledok) Object.assign(r, this.hodnoty);
    } else if (this.akcia === "delete") {
      vysledok = riadky.filter(sedi);
      tabulky[this.t] = riadky.filter((r) => !sedi(r));
    } else {
      vysledok = riadky.filter(sedi);
      if (this.poradie) {
        const { stlpec, vzostupne } = this.poradie;
        vysledok = [...vysledok].sort(
          (a, b) =>
            (a[stlpec] > b[stlpec] ? 1 : a[stlpec] < b[stlpec] ? -1 : 0) * (vzostupne ? 1 : -1),
        );
      }
      if (this.strop != null) vysledok = vysledok.slice(0, this.strop);
    }
    if (this.pocet)
      return { data: this.hlava ? null : vysledok, error: null, count: vysledok.length };
    if (this.jeden) {
      if (this.jeden === "single" && vysledok.length !== 1)
        return { data: null, error: { message: "not single" } };
      return { data: vysledok[0] ?? null, error: null };
    }
    return { data: vysledok, error: null };
  }

  then<A, B>(ok?: (v: any) => A | PromiseLike<A>, zle?: (e: any) => B | PromiseLike<B>) {
    return Promise.resolve(this.vykonaj()).then(ok, zle);
  }
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) => new Dotaz(t),
    // `whatsapp_pusti` ako v databáze: počet v okne, potom zápis.
    rpc: (meno: string, a: any) => {
      if (meno !== "whatsapp_pusti")
        return Promise.resolve({ data: null, error: { message: `neznáma funkcia ${meno}` } });
      const teraz = Date.now();
      const v = tab("whatsapp_strop").filter(
        (r) => r.druh === a._druh && r.kluc === a._kluc && teraz - r.cas < a._okno_sekund * 1000,
      );
      if (v.length >= a._max) return Promise.resolve({ data: false, error: null });
      tab("whatsapp_strop").push({ kluc: a._kluc, druh: a._druh, cas: teraz });
      return Promise.resolve({ data: true, error: null });
    },
    storage: {
      from: () => ({
        upload: (cesta: string) => {
          ulozisko.push(cesta);
          return Promise.resolve({ error: null });
        },
        remove: () => Promise.resolve({ error: null }),
      }),
    },
  },
}));

/* ------------------------------------------------ podvrhnutý Graph API */

type Volanie = { url: string; telo: any };
const volania: Volanie[] = [];
const maily: any[] = [];
let dalsieId = 500;
/** Kód chyby, ktorým Meta odmietne ďalšie odoslanie (napr. 131047 mimo okna). */
let chybaOdoslania: number | null = null;
const povodnyFetch = globalThis.fetch;

globalThis.fetch = vi.fn(async (vstup: any, init?: any) => {
  const url = String(vstup);
  if (url === "https://api.resend.com/emails") {
    maily.push(JSON.parse(init.body));
    return new Response("{}", { status: 200 });
  }
  const m = url.match(/^https:\/\/graph\.facebook\.com\/v\d+\.\d\/(.+)$/);
  if (m) {
    const telo = init?.body ? JSON.parse(init.body) : null;
    volania.push({ url: m[1]!, telo });
    if (m[1]!.endsWith("/messages")) {
      if (chybaOdoslania)
        return new Response(
          JSON.stringify({ error: { code: chybaOdoslania, message: "Re-engagement message" } }),
          { status: 400 },
        );
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${++dalsieId}` }] }), {
        status: 200,
      });
    }
    return new Response(
      JSON.stringify({
        url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1",
        mime_type: "image/jpeg",
        file_size: 6,
      }),
      { status: 200 },
    );
  }
  if (url.startsWith("https://lookaside.fbsbx.com/")) {
    volania.push({ url, telo: null });
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), { status: 200 });
  }
  throw new Error(`neočakávané volanie ${url}`);
}) as typeof fetch;

afterAll(() => {
  globalThis.fetch = povodnyFetch;
});

const { prijmiWebhookWhatsApp, overWebhookWhatsApp } = await import("./whatsapp-webhook.server");
const { pridajSpravu, nacitajPoziadavku } = await import("./podpora.server");
const { overPodpis } = await import("./whatsapp.server");

const TAJOMSTVO = "tajomstvo-aplikacie-meta";
const CISLO_ID = "1234567890";
const ZAKAZNIK = "421911222333";
const INY = "420777123456";
let msgId = 1;

const podpis = (telo: string, tajomstvo = TAJOMSTVO) =>
  `sha256=${createHmac("sha256", tajomstvo).update(telo).digest("hex")}`;

function udalost(spravy: any[], o: { cisloId?: string; meno?: string; stavy?: any[] } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "421902101967",
                phone_number_id: o.cisloId ?? CISLO_ID,
              },
              contacts: spravy.map((s) => ({ wa_id: s.from, profile: { name: o.meno ?? "Ján" } })),
              messages: spravy,
              ...(o.stavy ? { statuses: o.stavy } : {}),
            },
          },
        ],
      },
    ],
  };
}

const text = (od: string, body: string, id = `wamid.in${msgId++}`) => ({
  from: od,
  id,
  timestamp: String(Math.floor(Date.now() / 1000)),
  type: "text",
  text: { body },
});

function poziadavka(telo: string, hlavicka: string | null): Request {
  return new Request("https://www.faktero.sk/api/public/whatsapp/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(hlavicka ? { "x-hub-signature-256": hlavicka } : {}),
    },
    body: telo,
  });
}

const posli = (u: any, hlavicka?: string | null) => {
  const telo = JSON.stringify(u);
  return prijmiWebhookWhatsApp(poziadavka(telo, hlavicka === undefined ? podpis(telo) : hlavicka), {
    cakat: true,
  });
};

const odoslane = (komu: string) =>
  volania.filter((v) => v.url.endsWith("/messages") && v.telo?.to === komu);

describe("webhook WhatsAppu", () => {
  beforeEach(() => {
    for (const k of Object.keys(tabulky)) delete tabulky[k];
    tab("whatsapp_stav").push({ id: 1 });
    volania.length = 0;
    maily.length = 0;
    ulozisko.length = 0;
    chybaOdoslania = null;
    process.env.WHATSAPP_TOKEN = "token-test";
    process.env.WHATSAPP_PHONE_NUMBER_ID = CISLO_ID;
    process.env.WHATSAPP_APP_SECRET = TAJOMSTVO;
    process.env.WHATSAPP_VERIFY_TOKEN = "overovaci-token";
    delete process.env.WHATSAPP_SABLONA;
    delete process.env.RESEND_API_KEY;
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  describe("podpis", () => {
    it("platný podpis prejde, zlý, cudzí alebo chýbajúci vráti 401", async () => {
      const u = udalost([text(ZAKAZNIK, "Ahoj")]);
      const telo = JSON.stringify(u);
      expect((await posli(u, null)).status).toBe(401);
      expect((await posli(u, "sha256=" + "0".repeat(64))).status).toBe(401);
      expect((await posli(u, podpis(telo, "ine-tajomstvo"))).status).toBe(401);
      expect((await posli(u, "nezmysel")).status).toBe(401);
      expect(tab("podpora_poziadavky")).toHaveLength(0);
      expect((await posli(u)).status).toBe(200);
      expect(tab("podpora_poziadavky")).toHaveLength(1);
    });

    it("bez nastaveného tajomstva aplikácie odmietne všetko", async () => {
      delete process.env.WHATSAPP_APP_SECRET;
      expect((await posli(udalost([text(ZAKAZNIK, "Ahoj")]))).status).toBe(401);
    });

    it("podpis sedí len na presne to isté telo", () => {
      const telo = '{"a":"á"}';
      expect(overPodpis(telo, podpis(telo), TAJOMSTVO)).toBe(true);
      expect(overPodpis('{"a":"a"}', podpis(telo), TAJOMSTVO)).toBe(false);
      expect(
        overPodpis(telo, podpis(telo).toUpperCase().replace("SHA256", "sha256"), TAJOMSTVO),
      ).toBe(true);
      expect(overPodpis(telo, podpis(telo), null)).toBe(false);
    });
  });

  it("GET overenie vráti challenge len so správnym tokenom", async () => {
    const get = (token: string) =>
      overWebhookWhatsApp(
        new Request(
          `https://www.faktero.sk/api/public/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=1158201444`,
        ),
      );
    const ok = await get("overovaci-token");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("1158201444");
    expect(tab("whatsapp_stav")[0]!.webhook_overeny_at).toBeTruthy();
    expect((await get("zly")).status).toBe(403);
  });

  it("prvá správa založí požiadavku, ďalšia ide do toho istého vlákna", async () => {
    await posli(udalost([text(ZAKAZNIK, "Nejde mi odoslať faktúru")]));
    const [p] = tab("podpora_poziadavky");
    const [chat] = tab("whatsapp_chaty");
    expect(p).toMatchObject({
      zdroj: "whatsapp",
      whatsapp_chat_id: chat!.id,
      email: "",
      user_id: null,
      predmet: "Nejde mi odoslať faktúru",
      meno: "Ján · +421 ••• ••• 333",
    });
    expect(chat).toMatchObject({ wa_id: ZAKAZNIK, poziadavka_id: p!.id });
    expect(odoslane(ZAKAZNIK).at(-1)!.telo.text.body).toContain(`P-${p!.cislo}`);

    await posli(udalost([text(ZAKAZNIK, "Ešte doplním: faktúra 2026001")]));
    expect(tab("podpora_poziadavky")).toHaveLength(1);
    expect(tab("podpora_spravy").map((s) => s.text)).toEqual([
      "Nejde mi odoslať faktúru",
      "Ešte doplním: faktúra 2026001",
    ]);
  });

  it("vyriešená požiadavka sa neotvára — ďalšia správa založí novú", async () => {
    await posli(udalost([text(ZAKAZNIK, "Prvá otázka")]));
    tab("podpora_poziadavky")[0]!.stav = "vyriesena";
    await posli(udalost([text(ZAKAZNIK, "Úplne iná vec")]));
    expect(tab("podpora_poziadavky")).toHaveLength(2);
  });

  it("opakované doručenie tej istej správy (message.id) sa nezdvojí", async () => {
    const s = text(ZAKAZNIK, "Raz", "wamid.ROVNAKE");
    await posli(udalost([s]));
    await posli(udalost([s]));
    expect(tab("podpora_spravy")).toHaveLength(1);
    expect(tab("whatsapp_prijate")).toHaveLength(1);
  });

  it("správu pre iné číslo aplikácie ignoruje", async () => {
    await posli(udalost([text(ZAKAZNIK, "Ahoj")], { cisloId: "999" }));
    expect(tab("podpora_poziadavky")).toHaveLength(0);
  });

  it("fotka sa stiahne cez media API a uloží ako príloha", async () => {
    await posli(
      udalost([
        {
          from: ZAKAZNIK,
          id: "wamid.foto",
          type: "image",
          image: {
            id: "MEDIA1",
            mime_type: "image/jpeg",
            caption: "/chyba Tlačidlo Uložiť nereaguje",
          },
        },
      ]),
    );
    const [p] = tab("podpora_poziadavky");
    expect(p!.kategoria).toBe("chyba");
    expect(volania.some((v) => v.url === "MEDIA1")).toBe(true);
    const [priloha] = tab("podpora_prilohy");
    expect(priloha).toMatchObject({ poziadavka_id: p!.id, mime: "image/jpeg", size: 6 });
    expect(ulozisko).toEqual([priloha!.path]);
  });

  it("hlasovú správu nevie spracovať a povie to", async () => {
    await posli(
      udalost([{ from: ZAKAZNIK, id: "wamid.audio", type: "audio", audio: { id: "A" } }]),
    );
    expect(tab("podpora_poziadavky")).toHaveLength(0);
    expect(odoslane(ZAKAZNIK).at(-1)!.telo.text.body).toContain("text, fotku alebo súbor");
  });

  it("e-mail podpore nesie len maskované číslo", async () => {
    process.env.RESEND_API_KEY = "re_test";
    await posli(udalost([text(ZAKAZNIK, "Otázka")]));
    expect(maily.length).toBeGreaterThan(0);
    for (const m of maily) {
      expect(JSON.stringify(m)).not.toContain(ZAKAZNIK);
      expect(JSON.stringify(m)).not.toContain("911222");
    }
    expect(maily[0].text).toContain("+421 ••• ••• 333");
  });

  describe("odpoveď podpory a 24-hodinové okno", () => {
    async function zalozAOdpovedz(text_: string) {
      const p = await nacitajPoziadavku(tab("podpora_poziadavky")[0]!.id);
      volania.length = 0;
      return pridajSpravu({ poziadavka: p!, autorId: "admin-1", od: "podpora", text: text_ });
    }

    it("v okne odíde voľný text", async () => {
      await posli(udalost([text(ZAKAZNIK, "Otázka")]));
      const r = await zalozAOdpovedz("Dobrý deň <b>x</b>");
      expect(r.upozornenie).toBeUndefined();
      const [v] = odoslane(ZAKAZNIK);
      expect(v!.telo).toMatchObject({ type: "text", to: ZAKAZNIK });
      expect(v!.telo.text.body).toContain("Dobrý deň <b>x</b>");
      expect(v!.telo.text.preview_url).toBe(false);
      expect(tab("whatsapp_odoslane")).toHaveLength(1);
    });

    it("mimo okna bez šablóny neodíde nič, admin dostane upozornenie a text sa doručí, keď zákazník napíše", async () => {
      await posli(udalost([text(ZAKAZNIK, "Otázka")]));
      tab("whatsapp_chaty")[0]!.posledna_od_zakaznika_at = new Date(
        Date.now() - 25 * 3600_000,
      ).toISOString();
      const r = await zalozAOdpovedz("Odpoveď po víkende");
      expect(odoslane(ZAKAZNIK)).toHaveLength(0);
      expect(r.upozornenie).toContain("24 hodín");
      expect(tab("whatsapp_chaty")[0]!.nedorucene_od).toBeTruthy();

      await posli(udalost([text(ZAKAZNIK, "Ste tam?")]));
      const texty = odoslane(ZAKAZNIK).map((v) => v.telo.text.body);
      expect(texty.some((t) => t.includes("Odpoveď po víkende"))).toBe(true);
      expect(tab("whatsapp_chaty")[0]!.nedorucene_od).toBeNull();
    });

    it("mimo okna so šablónou odíde šablóna s číslom požiadavky", async () => {
      process.env.WHATSAPP_SABLONA = "odpoved_podpory";
      await posli(udalost([text(ZAKAZNIK, "Otázka")]));
      const p = tab("podpora_poziadavky")[0]!;
      tab("whatsapp_chaty")[0]!.posledna_od_zakaznika_at = new Date(
        Date.now() - 25 * 3600_000,
      ).toISOString();
      const r = await zalozAOdpovedz("Text odpovede");
      const [v] = odoslane(ZAKAZNIK);
      expect(v!.telo).toMatchObject({
        type: "template",
        template: {
          name: "odpoved_podpory",
          language: { code: "sk" },
          components: [{ type: "body", parameters: [{ type: "text", text: `P-${p.cislo}` }] }],
        },
      });
      expect(JSON.stringify(v!.telo)).not.toContain("Text odpovede");
      expect(r.upozornenie).toContain("šablóna");

      // Tlačidlo zo šablóny doručí text a do vlákna nič nepridá.
      const pred = tab("podpora_spravy").length;
      await posli(
        udalost([
          { from: ZAKAZNIK, id: "wamid.btn", type: "button", button: { text: "Zobraziť odpoveď" } },
        ]),
      );
      expect(tab("podpora_spravy")).toHaveLength(pred);
      expect(odoslane(ZAKAZNIK).at(-1)!.telo.text.body).toContain("Text odpovede");
    });

    it("keď Meta odmietne text kódom 131047, pokračuje ako mimo okna", async () => {
      await posli(udalost([text(ZAKAZNIK, "Otázka")]));
      chybaOdoslania = 131047;
      const r = await zalozAOdpovedz("Odpoveď");
      expect(r.upozornenie).toBeTruthy();
      expect(tab("whatsapp_chaty")[0]!.nedorucene_od).toBeTruthy();
    });

    it("stav „failed“ z webhooku označí odpoveď ako nedoručenú", async () => {
      await posli(udalost([text(ZAKAZNIK, "Otázka")]));
      await zalozAOdpovedz("Odpoveď");
      const wamid = tab("whatsapp_odoslane")[0]!.wamid;
      await posli(
        udalost([], { stavy: [{ id: wamid, status: "failed", errors: [{ code: 131026 }] }] }),
      );
      expect(tab("whatsapp_chaty")[0]!.nedorucene_od).toBeTruthy();
      expect(tab("whatsapp_chaty")[0]!.posledna_chyba).toContain("131026");
      // Zákazník napíše — nedoručená odpoveď odíde znova.
      volania.length = 0;
      await posli(udalost([text(ZAKAZNIK, "Halo?")]));
      expect(odoslane(ZAKAZNIK).some((v) => v.telo.text.body.includes("Odpoveď"))).toBe(true);
    });

    it("interná poznámka do WhatsAppu neodíde", async () => {
      await posli(udalost([text(ZAKAZNIK, "Otázka")]));
      const p = await nacitajPoziadavku(tab("podpora_poziadavky")[0]!.id);
      volania.length = 0;
      await pridajSpravu({
        poziadavka: p!,
        autorId: "admin-1",
        od: "podpora",
        text: "len pre nás",
        interna: true,
      });
      expect(odoslane(ZAKAZNIK)).toHaveLength(0);
    });
  });

  it("prepojenie s účtom jednorazovým kódom", async () => {
    const { vytvorKodWhatsApp } = await import("./whatsapp.server");
    const { textPrepojenia } = await import("./whatsapp");
    const { kod } = await vytvorKodWhatsApp("user-1");
    await posli(udalost([text(ZAKAZNIK, textPrepojenia(kod))]));
    expect(tab("whatsapp_chaty")[0]!.user_id).toBe("user-1");
    expect(tab("whatsapp_kody")).toHaveLength(0);
    // Ten istý kód z iného čísla už nefunguje.
    await posli(udalost([text(INY, textPrepojenia(kod))]));
    expect(tab("whatsapp_chaty").find((c) => c.wa_id === INY)!.user_id).toBeNull();
    // Prepojenie nezaloží požiadavku.
    expect(tab("podpora_poziadavky")).toHaveLength(0);
  });

  it("strop správ na číslo drží databáza a v tabuľke stropov nie je číslo", async () => {
    for (let i = 0; i < 20; i++) await posli(udalost([text(ZAKAZNIK, `Správa ${i}`)]));
    const pred = tab("podpora_spravy").length;
    await posli(udalost([text(ZAKAZNIK, "Dvadsiata prvá")]));
    expect(tab("podpora_spravy")).toHaveLength(pred);
    expect(JSON.stringify(tab("whatsapp_strop"))).not.toContain(ZAKAZNIK);
    await posli(udalost([text(INY, "Iné číslo")]));
    expect(tab("podpora_poziadavky")).toHaveLength(2);
  });

  it("bez tokenu je WhatsApp vypnutý — odpoveď podpory nič neposiela a nespadne", async () => {
    await posli(udalost([text(ZAKAZNIK, "Otázka")]));
    delete process.env.WHATSAPP_TOKEN;
    const p = await nacitajPoziadavku(tab("podpora_poziadavky")[0]!.id);
    volania.length = 0;
    const r = await pridajSpravu({ poziadavka: p!, autorId: "a", od: "podpora", text: "x" });
    expect(r.zapisana).toBe(true);
    expect(volania).toHaveLength(0);
  });
});
