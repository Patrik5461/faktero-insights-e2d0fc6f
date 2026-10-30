import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
  Webhook bota podpory s databázou v pamäti a podvrhnutým fetch — na
  Telegram ani do Supabase sa nič neposiela.
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
  } else if (
    !["telegram_updaty", "telegram_chaty", "telegram_admin_chaty", "telegram_spravy_bota"].includes(
      t,
    )
  ) {
    x.id ??= crypto.randomUUID();
  }
  return x;
}

/** Primárne kľúče, na ktorých má databáza unikátnosť. */
const KLUC: Record<string, string[]> = {
  telegram_updaty: ["update_id"],
  telegram_chaty: ["chat_id"],
  telegram_admin_chaty: ["chat_id"],
  telegram_spravy_bota: ["chat_id", "message_id"],
  telegram_kody: ["kod_hash"],
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
    // `telegram_pusti` ako v databáze: počet v okne, potom zápis.
    rpc: (meno: string, a: any) => {
      if (meno !== "telegram_pusti")
        return Promise.resolve({ data: null, error: { message: `neznáma funkcia ${meno}` } });
      const teraz = Date.now();
      const v = tab("telegram_strop").filter(
        (r) =>
          r.druh === a._druh && r.chat_id === a._chat_id && teraz - r.cas < a._okno_sekund * 1000,
      );
      if (v.length >= a._max) return Promise.resolve({ data: false, error: null });
      tab("telegram_strop").push({ chat_id: a._chat_id, druh: a._druh, cas: teraz });
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

/* --------------------------------------------------- podvrhnutý Telegram */

type Volanie = { metoda: string; telo: any };
const volania: Volanie[] = [];
let dalsieId = 500;
const povodnyFetch = globalThis.fetch;

globalThis.fetch = vi.fn(async (vstup: any, init?: any) => {
  const url = String(vstup);
  const m = url.match(/^https:\/\/api\.telegram\.org\/bot[^/]+\/(\w+)$/);
  if (m) {
    const telo = init?.body ? JSON.parse(init.body) : {};
    volania.push({ metoda: m[1]!, telo });
    const result =
      m[1] === "sendMessage"
        ? { message_id: ++dalsieId }
        : m[1] === "getFile"
          ? { file_path: "photos/file_1.jpg", file_size: 1234 }
          : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  }
  if (url.startsWith("https://api.telegram.org/file/bot")) {
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), { status: 200 });
  }
  throw new Error(`neočakávané volanie ${url}`);
}) as typeof fetch;

afterAll(() => {
  globalThis.fetch = povodnyFetch;
});

const { prijmiWebhookTelegramu } = await import("./telegram-webhook.server");
const { pridajSpravu, nacitajPoziadavku } = await import("./podpora.server");

const TAJOMSTVO = "tajne-tajomstvo-webhooku-1234";
let updateId = 1;

function poziadavka(update: any, tajomstvo: string | null = TAJOMSTVO): Request {
  return new Request("https://www.faktero.sk/api/public/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(tajomstvo ? { "x-telegram-bot-api-secret-token": tajomstvo } : {}),
    },
    body: JSON.stringify({ update_id: updateId++, ...update }),
  });
}

const posli = (update: any, tajomstvo?: string | null) =>
  prijmiWebhookTelegramu(poziadavka(update, tajomstvo), { cakat: true });

const ZAKAZNIK = 111_222;
const ADMIN = 999_000;
const CUDZI = 555_444;

const sprava = (chatId: number, text: string, navyse: Record<string, unknown> = {}) => ({
  message: {
    message_id: Math.floor(Math.random() * 1e6),
    chat: { id: chatId, type: "private" },
    from: { id: chatId, first_name: "Ján", username: "jan_test", language_code: "sk" },
    text,
    ...navyse,
  },
});

const odoslane = (chatId: number) =>
  volania.filter((v) => v.metoda === "sendMessage" && v.telo.chat_id === chatId);

describe("webhook bota podpory", () => {
  beforeEach(() => {
    for (const k of Object.keys(tabulky)) delete tabulky[k];
    volania.length = 0;
    ulozisko.length = 0;
    process.env.TELEGRAM_BOT_TOKEN = "123:test";
    process.env.TELEGRAM_WEBHOOK_SECRET = TAJOMSTVO;
    delete process.env.RESEND_API_KEY;
  });

  it("bez tajomstva alebo so zlým vráti 401 a nič nespracuje", async () => {
    expect((await posli(sprava(ZAKAZNIK, "Ahoj"), null)).status).toBe(401);
    expect((await posli(sprava(ZAKAZNIK, "Ahoj"), "zle")).status).toBe(401);
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect((await posli(sprava(ZAKAZNIK, "Ahoj"), TAJOMSTVO)).status).toBe(401);
    expect(tab("podpora_poziadavky")).toHaveLength(0);
    expect(volania).toHaveLength(0);
  });

  it("správa od neznámeho založí požiadavku a ďalšia ide do toho istého vlákna", async () => {
    const r = await posli(sprava(ZAKAZNIK, "Nejde mi odoslať faktúru"));
    expect(r.status).toBe(200);
    const [p] = tab("podpora_poziadavky");
    expect(p).toMatchObject({
      zdroj: "telegram",
      telegram_chat_id: ZAKAZNIK,
      email: "",
      user_id: null,
      kategoria: "otazka",
      predmet: "Nejde mi odoslať faktúru",
    });
    expect(p!.meno).toContain("@jan_test");
    expect(tab("telegram_chaty")[0]).toMatchObject({ chat_id: ZAKAZNIK, poziadavka_id: p!.id });
    expect(odoslane(ZAKAZNIK).at(-1)!.telo.text).toContain(`P-${p!.cislo}`);
    // Bez parse_mode — text zákazníka sa v Telegrame nič neformátuje.
    expect(odoslane(ZAKAZNIK).at(-1)!.telo.parse_mode).toBeUndefined();

    await posli(sprava(ZAKAZNIK, "Ešte doplním: je to faktúra 2026001"));
    expect(tab("podpora_poziadavky")).toHaveLength(1);
    const spravy = tab("podpora_spravy").filter((s) => s.poziadavka_id === p!.id);
    expect(spravy.map((s) => s.text)).toEqual([
      "Nejde mi odoslať faktúru",
      "Ešte doplním: je to faktúra 2026001",
    ]);
    expect(spravy.every((s) => s.od_podpory === false)).toBe(true);
  });

  it("opakované doručenie toho istého update_id sa nezdvojí", async () => {
    const u = { update_id: 77_777, ...sprava(ZAKAZNIK, "Raz") };
    const req = () =>
      new Request("https://www.faktero.sk/api/public/telegram/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": TAJOMSTVO },
        body: JSON.stringify(u),
      });
    await prijmiWebhookTelegramu(req(), { cakat: true });
    await prijmiWebhookTelegramu(req(), { cakat: true });
    expect(tab("podpora_spravy")).toHaveLength(1);
  });

  it("fotka sa uloží ako príloha požiadavky", async () => {
    await posli({
      message: {
        message_id: 42,
        chat: { id: ZAKAZNIK, type: "private" },
        from: { id: ZAKAZNIK, first_name: "Ján" },
        caption: "/chyba Tlačidlo Uložiť nereaguje",
        photo: [
          { file_id: "maly", file_size: 100, width: 90, height: 90 },
          { file_id: "velky", file_size: 1234, width: 1280, height: 720 },
        ],
      },
    });
    const [p] = tab("podpora_poziadavky");
    expect(p!.kategoria).toBe("chyba");
    expect(volania.find((v) => v.metoda === "getFile")!.telo.file_id).toBe("velky");
    const [priloha] = tab("podpora_prilohy");
    expect(priloha).toMatchObject({ poziadavka_id: p!.id, mime: "image/jpeg", size: 6 });
    expect(priloha!.sprava_id).toBe(tab("podpora_spravy")[0]!.id);
    expect(ulozisko).toEqual([priloha!.path]);
    expect(priloha!.path.startsWith(`${p!.id}/`)).toBe(true);
  });

  it("Reply spárovaného admina je odpoveď podpory a odíde zákazníkovi", async () => {
    tab("platform_admins").push({ user_id: "admin-1", role: "superadmin" });
    tab("telegram_admin_chaty").push({ chat_id: ADMIN, user_id: "admin-1" });

    await posli(sprava(ZAKAZNIK, "Ako vystavím dobropis?"));
    const [p] = tab("podpora_poziadavky");
    // Upozornenie admina si pamätá požiadavku.
    const upozornenie = tab("telegram_spravy_bota").find((s) => s.chat_id === ADMIN)!;
    expect(upozornenie.poziadavka_id).toBe(p!.id);
    expect(odoslane(ADMIN)[0]!.telo.text).toContain("Ako vystavím dobropis?");

    await posli(
      sprava(ADMIN, "Pri faktúre kliknite na … → Dobropis.", {
        reply_to_message: { message_id: upozornenie.message_id },
      }),
    );
    const odpoved = tab("podpora_spravy").find((s) => s.od_podpory);
    expect(odpoved).toMatchObject({
      poziadavka_id: p!.id,
      autor_id: "admin-1",
      text: "Pri faktúre kliknite na … → Dobropis.",
    });
    expect(tab("podpora_poziadavky")[0]!.stav).toBe("caka_na_zakaznika");
    expect(odoslane(ZAKAZNIK).at(-1)!.telo.text).toContain("Pri faktúre kliknite na … → Dobropis.");
    // Admin chat nezaložil vlastnú požiadavku.
    expect(tab("podpora_poziadavky")).toHaveLength(1);
  });

  it("odpoveď podpory z administrácie pošle sendMessage do chatu zákazníka", async () => {
    await posli(sprava(ZAKAZNIK, "Otázka k predplatnému"));
    volania.length = 0;
    const p = await nacitajPoziadavku(tab("podpora_poziadavky")[0]!.id);
    await pridajSpravu({
      poziadavka: p!,
      autorId: "admin-1",
      od: "podpora",
      text: "Dobrý deň <b>x</b>",
    });
    const [v] = odoslane(ZAKAZNIK);
    expect(v!.telo.text).toContain("Dobrý deň <b>x</b>");
    expect(v!.telo.parse_mode).toBeUndefined();
  });

  it("interná poznámka do Telegramu neodíde", async () => {
    await posli(sprava(ZAKAZNIK, "Otázka"));
    volania.length = 0;
    const p = await nacitajPoziadavku(tab("podpora_poziadavky")[0]!.id);
    await pridajSpravu({
      poziadavka: p!,
      autorId: "admin-1",
      od: "podpora",
      text: "len pre nás",
      interna: true,
    });
    expect(odoslane(ZAKAZNIK)).toHaveLength(0);
  });

  describe("tlačidlá pri návrhu opravy", () => {
    const OPRAVA = "3f2b8c1e-9a4d-4e2f-8b6a-1c2d3e4f5a6b";
    const klik = (chatId: number, akcia: "s" | "z", messageId = 700) => ({
      callback_query: {
        id: "cb1",
        from: { id: chatId, first_name: "X" },
        data: `ao:${akcia}:${OPRAVA}`,
        message: { message_id: messageId, chat: { id: chatId } },
      },
    });
    beforeEach(() => {
      tab("podpora_auto_opravy").push({
        id: OPRAVA,
        poziadavka_id: "p-1",
        stav: "navrh",
        commit_sha: "abc123",
      });
    });

    it("z nespárovaného chatu je „Schváliť“ odmietnuté", async () => {
      // Aj keď je to účet superadmina — chat nie je spárovaný.
      tab("platform_admins").push({ user_id: "admin-1", role: "superadmin" });
      tab("telegram_spravy_bota").push({ chat_id: CUDZI, message_id: 700, auto_oprava_id: OPRAVA });
      await posli(klik(CUDZI, "s"));
      expect(tab("podpora_auto_opravy")[0]!.stav).toBe("navrh");
      const odpoved = volania.find((v) => v.metoda === "answerCallbackQuery")!;
      expect(odpoved.telo.text).toContain("nie je spárovaný");
    });

    it("schváliť sa z Telegramu nedá ani superadminovi — len v administrácii", async () => {
      tab("platform_admins").push({ user_id: "admin-1", role: "superadmin" });
      tab("telegram_admin_chaty").push({ chat_id: ADMIN, user_id: "admin-1" });
      tab("telegram_spravy_bota").push({ chat_id: ADMIN, message_id: 701, auto_oprava_id: OPRAVA });
      await posli(klik(ADMIN, "s", 701));
      expect(tab("podpora_auto_opravy")[0]!.stav).toBe("navrh");
      expect(volania.at(-1)!.telo.text).toContain("administrácii");
    });

    it("tlačidlo na cudzej správe (iné id návrhu) neplatí", async () => {
      tab("platform_admins").push({ user_id: "admin-1", role: "superadmin" });
      tab("telegram_admin_chaty").push({ chat_id: ADMIN, user_id: "admin-1" });
      tab("telegram_spravy_bota").push({ chat_id: ADMIN, message_id: 700, auto_oprava_id: null });
      await posli(klik(ADMIN, "z"));
      expect(tab("podpora_auto_opravy")[0]!.stav).toBe("navrh");
    });
  });

  it("párovanie admina jednorazovým kódom", async () => {
    const { vytvorKodTelegram } = await import("./telegram.server");
    tab("platform_admins").push({ user_id: "admin-1", role: "superadmin" });
    const { kod } = await vytvorKodTelegram("admin-1", "admin");
    await posli(sprava(ADMIN, `/admin ${kod}`));
    expect(tab("telegram_admin_chaty")).toEqual([
      expect.objectContaining({ chat_id: ADMIN, user_id: "admin-1" }),
    ]);
    expect(tab("telegram_kody")).toHaveLength(0);
    // Ten istý kód druhýkrát nefunguje.
    await posli(sprava(CUDZI, `/admin ${kod}`));
    expect(tab("telegram_admin_chaty")).toHaveLength(1);
  });

  it("strop správ na chat drží databáza", async () => {
    for (let i = 0; i < 20; i++)
      tab("telegram_strop").push({ chat_id: ZAKAZNIK, druh: "spravy", cas: Date.now() });
    await posli(sprava(ZAKAZNIK, "Dvadsiata prvá"));
    expect(tab("podpora_poziadavky")).toHaveLength(0);
    // Iný chat strop nezdieľa.
    await posli(sprava(CUDZI, "Prvá správa"));
    expect(tab("podpora_poziadavky")).toHaveLength(1);
    expect(
      tab("telegram_strop").filter((r) => r.chat_id === CUDZI && r.druh === "spravy"),
    ).toHaveLength(1);
  });

  it("spoločný strop nových požiadaviek za hodinu zo všetkých chatov", async () => {
    for (let i = 0; i < 30; i++)
      tab("telegram_strop").push({ chat_id: 0, druh: "nove_spolu", cas: Date.now() });
    await posli(sprava(ZAKAZNIK, "Nová otázka"));
    expect(tab("podpora_poziadavky")).toHaveLength(0);
    expect(odoslane(ZAKAZNIK).at(-1)!.telo.text).toContain("veľa požiadaviek");
  });

  it("kód na spárovanie sa spotrebuje aj pri nesprávnom účele", async () => {
    const { vytvorKodTelegram, pouziKodTelegram } = await import("./telegram.server");
    const { kod } = await vytvorKodTelegram("user-1", "zakaznik");
    expect(await pouziKodTelegram(kod, "admin")).toBeNull();
    expect(await pouziKodTelegram(kod, "zakaznik")).toBeNull();
    const { kod: druhy } = await vytvorKodTelegram("user-1", "zakaznik");
    expect(await pouziKodTelegram(druhy, "zakaznik")).toBe("user-1");
    expect(tab("telegram_kody")).toHaveLength(0);
  });

  it("bez tokenu bota sa upozornenia ani odpovede neposielajú a nič nespadne", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const r = await posli(sprava(ZAKAZNIK, "Ahoj"));
    expect(r.status).toBe(200);
    expect(tab("podpora_poziadavky")).toHaveLength(1);
    expect(volania).toHaveLength(0);
  });
});
