/**
 * Celý príjem jednej notifikácie (`prijmiBankovuNotifikaciu`) nad databázou
 * v pamäti: overovací mail Gmailu, overený mail banky → pohyb a párovanie,
 * podvrh → kontrola, ten istý mail ani ten istý pohyb dvakrát, AI záloha.
 *
 * Text notifikácie ČSOB SK je doslovne z tomaj/bank-mails-parser (MIT),
 * tests/fixtures/csob-sk/sepa-platba.txt. Hlavičky, Gmail mail a podvrh sú
 * VYROBENÉ podľa popisu.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Riadok = Record<string, any>;
const db = vi.hoisted(() => ({ tabulky: {} as Record<string, Record<string, any>[]>, id: 0 }));

/** Najmenší PostgREST v pamäti — len to, čo modul volá. */
function dotaz(tabulka: string) {
  const filtre: ((r: Riadok) => boolean)[] = [];
  let akcia: "select" | "insert" | "update" = "select";
  let data: any = null;
  let limit = Infinity;
  const q: any = {
    select: () => q,
    eq: (k: string, v: any) => (filtre.push((r) => r[k] === v), q),
    neq: (k: string, v: any) => (filtre.push((r) => r[k] !== v), q),
    in: (k: string, v: any[]) => (filtre.push((r) => v.includes(r[k])), q),
    gte: (k: string, v: any) => (filtre.push((r) => r[k] >= v), q),
    lte: (k: string, v: any) => (filtre.push((r) => r[k] <= v), q),
    order: () => q,
    limit: (n: number) => ((limit = n), q),
    insert: (d: any) => ((akcia = "insert"), (data = d), q),
    update: (d: any) => ((akcia = "update"), (data = d), q),
    maybeSingle: () =>
      vykonaj().then((r: any) => ({
        ...r,
        data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
      })),
    single: () =>
      vykonaj().then((r: any) => ({ ...r, data: Array.isArray(r.data) ? r.data[0] : r.data })),
    then: (ok: any, zle: any) => vykonaj().then(ok, zle),
  };
  async function vykonaj() {
    const t = (db.tabulky[tabulka] ??= []);
    if (akcia === "insert") {
      const riadky: Riadok[] = (Array.isArray(data) ? data : [data]).map((r: Riadok) => ({
        id: `id-${++db.id}`,
        ...r,
      }));
      for (const r of riadky) {
        if (
          tabulka === "bank_transactions" &&
          r.transaction_reference &&
          t.some(
            (x) =>
              x.bank_account_id === r.bank_account_id &&
              x.transaction_reference === r.transaction_reference,
          )
        )
          return {
            data: null,
            error: { message: "duplicate key value violates unique constraint" },
          };
        if (
          tabulka === "banka_notifikacie_maily" &&
          t.some((x) => x.provider_email_id === r.provider_email_id)
        )
          return { data: null, error: { message: "duplicate key 23505" } };
      }
      t.push(...riadky);
      return { data: riadky, error: null };
    }
    const vybrane = t.filter((r) => filtre.every((f) => f(r))).slice(0, limit);
    if (akcia === "update") {
      for (const r of vybrane) Object.assign(r, data);
      return { data: vybrane, error: null };
    }
    // bank_accounts s vnoreným pripojením
    if (tabulka === "bank_accounts")
      return {
        data: vybrane.map((r) => ({ ...r, bank_connections: { provider: r._provider } })),
        error: null,
      };
    return { data: vybrane, error: null };
  }
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => dotaz(t) },
}));

const obsahy = vi.hoisted(() => new Map<string, any>());
vi.mock("./mail-prijem.server", () => ({ obsahMailu: async (id: string) => obsahy.get(id) }));

const parovanie = vi.hoisted(() => ({ volania: 0 }));
vi.mock("./parovanie.functions", () => ({
  sparujFirmuAutomaticky: async () => {
    parovanie.volania++;
    return { zapisanych: 0, uhradene: [] };
  },
}));
vi.mock("./push-uhrada.server", () => ({ oznamUhradu: async () => ({ poslane: 0 }) }));

const ai = vi.hoisted(() => ({ odpoved: "{}" as string, volania: [] as any[] }));
vi.mock("./ai.server", () => ({
  aiText: async (pokyn: string, nastavenie: any) => {
    ai.volania.push(nastavenie);
    return ai.odpoved;
  },
}));

const { prijmiBankovuNotifikaciu } = await import("./banka-notifikacie.server");

const CSOB = readFileSync(
  path.resolve(import.meta.dirname, "__fixtures__/banka-notifikacie/csob-sk_sepa-platba.txt"),
  "utf8",
)
  // IBAN protistrany v ukážke je anonymizovaný (zlá kontrolná číslica) — nahradíme platným.
  .replace("SK91 7500 0000 0030 2072 9058", "SK31 1200 0000 1987 4263 7541");
const TOKEN = "abcdefgh12345678";
const UCET = "ucet-1";
const FIRMA = "firma-1";

function podpis(domena: string) {
  return {
    "Authentication-Results": `inbound.resend.com; spf=pass smtp.mailfrom=${domena}; dkim=pass header.d=${domena}`,
  };
}

beforeEach(() => {
  db.tabulky = {
    banka_notifikacie_adresy: [
      {
        id: "adr-1",
        company_id: FIRMA,
        bank_account_id: UCET,
        banka: "csob_sk",
        active: true,
        token: TOKEN,
      },
    ],
    banka_notifikacie_maily: [],
    bank_accounts: [
      {
        id: UCET,
        company_id: FIRMA,
        iban: "SK1375000000004019425381",
        currency: "EUR",
        _provider: "email",
      },
    ],
    bank_transactions: [],
  };
  obsahy.clear();
  parovanie.volania = 0;
  ai.volania = [];
  process.env.RESEND_INBOUND_API_KEY = "re_test";
});

const dnes = "2019-09-07";
async function prijmi(id: string, from: string, obsah: any, subject = "ČSOB Info 24 - Avízo") {
  obsahy.set(id, obsah);
  return prijmiBankovuNotifikaciu({
    emailId: id,
    token: TOKEN,
    from,
    subject,
    naseAdresy: [`banka-${TOKEN}@doklady.faktero.sk`],
    dnes,
  });
}
const maily = () => db.tabulky.banka_notifikacie_maily!;
const pohyby = () => db.tabulky.bank_transactions!;

describe("príjem notifikácie", () => {
  it("neznámy token sa zahodí bez zápisu", async () => {
    const r = await prijmiBankovuNotifikaciu({
      emailId: "x",
      token: "zzzzzzzzzzzzzzzz",
      from: null,
      subject: null,
      naseAdresy: [],
    });
    expect(r).toBe("neznama_adresa");
    expect(maily()).toHaveLength(0);
  });

  it("overený mail banky založí pohyb a spustí párovanie", async () => {
    const r = await prijmi("e1", "AdminTBS@csob.sk", {
      text: CSOB,
      headers: { ...podpis("csob.sk"), "Message-ID": "<m1@csob.sk>" },
    });
    expect(r).toBe("spracovane");
    expect(pohyby()).toHaveLength(1);
    expect(pohyby()[0]).toMatchObject({
      amount: 1150,
      currency: "EUR",
      variable_symbol: "212049000",
      zdroj: "email",
      company_id: FIRMA,
      bank_account_id: UCET,
    });
    expect(parovanie.volania).toBe(1);
    expect(maily()[0]).toMatchObject({
      stav: "spracovane",
      sposob: "pravidlo:csob_sk",
      bank_transaction_id: pohyby()[0]!.id,
    });
    // Zostatok z notifikácie sa prepíše na účet bez napojenia.
    expect(db.tabulky.bank_accounts![0]!.balance).toBe(14050.7);
  });

  it("ten istý mail (opakovaný webhook aj iný id s rovnakým Message-ID) sa nespracuje druhýkrát", async () => {
    const obsah = { text: CSOB, headers: { ...podpis("csob.sk"), "Message-ID": "<m1@csob.sk>" } };
    await prijmi("e1", "AdminTBS@csob.sk", obsah);
    expect(await prijmi("e1", "AdminTBS@csob.sk", obsah)).toBe("duplicita");
    expect(await prijmi("e2", "AdminTBS@csob.sk", obsah)).toBe("duplicita");
    expect(pohyby()).toHaveLength(1);
    expect(maily()).toHaveLength(1);
  });

  it("ten istý pohyb v inom maile sa zastaví ako duplicita", async () => {
    await prijmi("e1", "AdminTBS@csob.sk", {
      text: CSOB,
      headers: { ...podpis("csob.sk"), "Message-ID": "<m1@csob.sk>" },
    });
    const r = await prijmi("e2", "AdminTBS@csob.sk", {
      text: CSOB,
      headers: { ...podpis("csob.sk"), "Message-ID": "<m2@csob.sk>" },
    });
    expect(r).toBe("duplicita");
    expect(pohyby()).toHaveLength(1);
    expect(maily()[1]).toMatchObject({ stav: "duplicita", bank_transaction_id: pohyby()[0]!.id });
  });

  it("pohyb, ktorý už prišiel z výpisu, sa nezdvojí", async () => {
    pohyby().push({
      id: "z-vypisu",
      bank_account_id: UCET,
      booking_date: "2019-09-06",
      amount: 1150,
      variable_symbol: "212049000",
      counterparty: "Novák Jozef",
    });
    expect(await prijmi("e1", "AdminTBS@csob.sk", { text: CSOB, headers: podpis("csob.sk") })).toBe(
      "duplicita",
    );
    expect(pohyby()).toHaveLength(1);
  });

  it("podvrh z cudzej domény ide na kontrolu a pohyb nevznikne", async () => {
    const r = await prijmi("e1", "ČSOB <AdminTBS@csob-sk.info>", {
      text: CSOB,
      headers: podpis("csob-sk.info"),
    });
    expect(r).toBe("na_kontrolu");
    expect(pohyby()).toHaveLength(0);
    expect(parovanie.volania).toBe(0);
    expect(maily()[0]).toMatchObject({ stav: "na_kontrolu" });
    expect(maily()[0]!.dovod).toMatch(/neprišiel priamo od banky/);
    // Údaje sa aj tak predvyplnia — podľa banky pri adrese.
    expect(maily()[0]!.udaje).toMatchObject({ suma: 1150, vs: "212049000" });
    expect(maily()[0]!.text_mailu).toContain("NOVAK JOZEF");
  });

  it("From banky bez platného podpisu ide na kontrolu", async () => {
    const r = await prijmi("e1", "AdminTBS@csob.sk", {
      text: CSOB,
      headers: { "Authentication-Results": "x; spf=fail; dkim=fail header.d=csob.sk" },
    });
    expect(r).toBe("na_kontrolu");
    expect(pohyby()).toHaveLength(0);
  });

  it("ručne preposlaný mail (Fwd) ide na kontrolu, pravidlo sa vyberie z pôvodného odosielateľa", async () => {
    db.tabulky.banka_notifikacie_adresy![0]!.banka = "ina";
    const text = `---------- Forwarded message ---------\nFrom: <AdminTBS@csob.sk>\nSubject: ČSOB Info 24 - Avízo\n\n${CSOB}`;
    const r = await prijmi(
      "e1",
      "Jana <jana@gmail.com>",
      { text, headers: podpis("gmail.com") },
      "Fwd: ČSOB Info 24 - Avízo",
    );
    expect(r).toBe("na_kontrolu");
    expect(maily()[0]!.sposob).toBe("pravidlo:csob_sk");
    expect(ai.volania).toHaveLength(0);
  });

  it("Gmail overovací mail: uloží sa len kód a odkaz, nie telo", async () => {
    const text = `jana@firma.sk has requested to automatically forward mail to your address banka-${TOKEN}@doklady.faktero.sk.\nConfirmation code: 123456789\n\nhttps://mail-settings.google.com/mail/vf-%5BABC%5D-xyz\n`;
    const r = await prijmi(
      "g1",
      "Gmail Team <forwarding-noreply@google.com>",
      {
        text,
        headers: {
          "Authentication-Results":
            "mx; spf=pass smtp.mailfrom=google.com; dkim=pass header.d=google.com",
        },
      },
      "(#123456789) Gmail Forwarding Confirmation - Receive Mail from jana@firma.sk",
    );
    expect(r).toBe("potvrdenie");
    expect(maily()[0]).toMatchObject({ stav: "potvrdenie" });
    expect(maily()[0]!.udaje).toEqual({
      code: "123456789",
      confirm_url: "https://mail-settings.google.com/mail/vf-%5BABC%5D-xyz",
      source_email: "jana@firma.sk",
    });
    expect(maily()[0]!.text_mailu).toBeUndefined();
    expect(pohyby()).toHaveLength(0);
  });

  it("podvrhnutý „Gmail“ bez podpisu Googlu sa zahodí", async () => {
    const r = await prijmi(
      "g1",
      "forwarding-noreply@google.com",
      {
        text: "Confirmation code: 111111111 https://mail-settings.google.com/mail/vf-zle",
        headers: podpis("zly.example"),
      },
      "(#111111111)",
    );
    expect(r).toBe("chyba");
    expect(maily()[0]!.udaje).toBeUndefined();
  });

  it("banka bez pravidla: číta AI s účelom banka_notifikacia; overený mail so sumou v texte založí pohyb", async () => {
    db.tabulky.banka_notifikacie_adresy![0]!.banka = "vub";
    // VYROBENÉ: tvar mailu VÚB nepoznáme, text je len na skúšku AI cesty.
    const text =
      "Na Váš účet SK13 7500 0000 0040 1942 5381 prišla platba 250,00 EUR dňa 6.9.2019, VS 2026001, od Novák s.r.o.";
    ai.odpoved = JSON.stringify({
      je_pohyb: true,
      smer: "kredit",
      suma: "250,00",
      mena: "EUR",
      datum: "2019-09-06",
      variabilny_symbol: "2026001",
      protistrana_meno: "Novák s.r.o.",
    });
    const r = await prijmi("v1", "info@vub.sk", { text, headers: podpis("vub.sk") }, "Platba");
    expect(ai.volania[0]).toMatchObject({
      ucel: "banka_notifikacia",
      json: true,
      bezUvazovania: true,
      firma: FIRMA,
    });
    expect(r).toBe("spracovane");
    expect(maily()[0]!.sposob).toBe("ai");
  });

  it("AI si sumu vymyslela (v texte nie je) — na kontrolu", async () => {
    db.tabulky.banka_notifikacie_adresy![0]!.banka = "vub";
    ai.odpoved = JSON.stringify({
      je_pohyb: true,
      smer: "kredit",
      suma: "2500,00",
      mena: "EUR",
      datum: "2019-09-06",
      variabilny_symbol: "2026001",
    });
    const r = await prijmi(
      "v1",
      "info@vub.sk",
      { text: "Prišla platba 250,00 EUR, VS 2026001", headers: podpis("vub.sk") },
      "Platba",
    );
    expect(r).toBe("na_kontrolu");
    expect(pohyby()).toHaveLength(0);
  });

  it("reklama od banky nie je pohyb", async () => {
    db.tabulky.banka_notifikacie_adresy![0]!.banka = "vub";
    ai.odpoved = JSON.stringify({ je_pohyb: false });
    expect(
      await prijmi(
        "v1",
        "info@vub.sk",
        { text: "Nová hypotéka so zľavou!", headers: podpis("vub.sk") },
        "Akcia",
      ),
    ).toBe("nie_pohyb");
  });

  it("vypnutá adresa nič neprijme", async () => {
    db.tabulky.banka_notifikacie_adresy![0]!.active = false;
    expect(await prijmi("e1", "AdminTBS@csob.sk", { text: CSOB, headers: podpis("csob.sk") })).toBe(
      "neznama_adresa",
    );
  });
});
