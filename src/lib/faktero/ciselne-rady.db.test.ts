import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Číslovanie dokladov proti skutočnej databáze.
 *
 * Generátor je celý v SQL, takže bežné testy sa k nemu nedostanú — a práve
 * z neho vypadli tri chyby, ktoré sa prejavili až u zákazníka: funkcia
 * zavolaná vo `WHERE` sa na prázdnej tabuľke nevyhodnotila vôbec, dve
 * preťažené verzie robili volanie nejednoznačným a číslo zmazaného dokladu
 * sa v jednej agende zapĺňalo a v druhej nie. Chybné číslo na doklade je
 * právna chyba, nie kozmetika.
 *
 * Test si založí vlastnú firmu, odpracuje sa v nej a na konci ju zmaže.
 *
 * Zapína sa výslovne cez `npm run test:db`. Bežné `npm test` ho preskočí aj
 * na stroji, kde `.env` s kľúčmi je — zapisovať do ostrej databázy pri každom
 * spustení testov je zbytočné riziko. Keby beh spadol pred upratovaním,
 * ďalší si po sebe staré firmy zmaže sám.
 */
const URL_DB = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const KLUC = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const KLUC_KLIENTA =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
/** Bez tohto sa testy preskočia, aj keď kľúče v prostredí sú. */
const ZAPNUTE = process.env.FAKTERO_DB_TESTY === "1";
const bezPristupu = !ZAPNUTE || !URL_DB || !KLUC || !KLUC_KLIENTA;

/** Spoločná predpona, podľa ktorej sa dá po spadnutom behu upratať. */
const PREDPONA = "QA rady ";

/** Druhy, ktoré majú vlastnú tabuľku a vlastný stĺpec s číslom. */
const AGENDY = {
  quote: { tabulka: "quotes", cislo: "quote_number", datum: "issue_date" },
  sales_order: { tabulka: "sales_orders", cislo: "order_number", datum: "order_date" },
  purchase_order: { tabulka: "purchase_orders", cislo: "order_number", datum: "order_date" },
  cash: { tabulka: "cash_entries", cislo: "entry_number", datum: "entry_date" },
} as const;
type Agenda = keyof typeof AGENDY;

/** Zmaže firmu aj všetko, čo v nej test vyrobil. */
async function uprac(db: SupabaseClient, firma: string) {
  for (const t of [
    "invoices",
    "quotes",
    "sales_orders",
    "purchase_orders",
    "cash_entries",
    "number_series",
    "company_users",
  ]) {
    await db.from(t).delete().eq("company_id", firma);
  }
  await db.from("companies").delete().eq("id", firma);
}

describe.skipIf(bezPristupu)("číslovanie dokladov proti databáze", () => {
  let db: SupabaseClient;
  /** Klient prihláseného človeka — servisný kľúč nemá na rezervácie práva. */
  let ako: SupabaseClient;
  let firma: string;
  let pouzivatel: string;
  const heslo = `Qa!${Math.random().toString(36).slice(2)}A9`;

  /** Ďalšie číslo faktúry (vrátane zálohovej, dobropisu a dokladu k platbe). */
  async function dalsiaFaktura(typ: string, datum: string, radId?: string) {
    const { data, error } = await db.rpc("faktero_next_invoice_number", {
      _company_id: firma,
      _issue_date: datum,
      _type: typ,
      _series_id: radId ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return data as unknown as {
      invoice_number: string;
      sequence_number: number;
      series_id: string;
    };
  }

  /** Ďalšie číslo dokladu, ktorý má vlastnú tabuľku. */
  async function dalsiDoklad(druh: Agenda, datum: string, radId?: string) {
    const { data, error } = await db.rpc("faktero_next_series_number", {
      _company_id: firma,
      _kind: druh,
      _series_id: radId ?? null,
      _date: datum,
    } as never);
    if (error) throw new Error(error.message);
    return data as unknown as { number: string; sequence_number: number; series_id: string };
  }

  async function zapisFakturu(cislo: string, datum: string, typ = "regular") {
    const { error } = await db
      .from("invoices")
      .insert({ company_id: firma, invoice_number: cislo, issue_date: datum, type: typ } as never);
    if (error) throw new Error(error.message);
  }

  async function zapisDoklad(druh: Agenda, cislo: string, datum: string) {
    const a = AGENDY[druh];
    const riadok: Record<string, unknown> = {
      company_id: firma,
      [a.cislo]: cislo,
      [a.datum]: datum,
    };
    /* Pokladničný doklad bez sumy a popisu databáza neprijme. */
    if (druh === "cash") Object.assign(riadok, { type: "prijem", amount: 1, description: "QA" });
    const { error } = await db.from(a.tabulka).insert(riadok as never);
    if (error) throw new Error(`${a.tabulka}: ${error.message}`);
  }

  beforeAll(async () => {
    db = createClient(URL_DB, KLUC, { auth: { persistSession: false } });

    /* Zvyšky po behu, ktorý nedošiel k upratovaniu — staršie než hodinu. */
    const hodinaSpat = new Date(Date.now() - 3600_000).toISOString();
    const { data: stare } = await db
      .from("companies")
      .select("id")
      .like("name", `${PREDPONA}%`)
      .lt("created_at", hodinaSpat);
    for (const { id } of (stare ?? []) as { id: string }[]) {
      await uprac(db, id);
    }

    const { data, error } = await db
      .from("companies")
      .insert({ name: `${PREDPONA}${Date.now()}`, default_currency: "EUR" } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    firma = (data as { id: string }).id;

    /*
     * Rezervácie čísel drží RPC, ktorá chce prihláseného člena firmy —
     * servisný kľúč na tú tabuľku zámerne práva nemá. Test si preto založí
     * skutočný účet; tým sa zároveň overí, že kontrola členstva funguje.
     */
    const mail = `qa-rady-${Date.now()}@faktero.test`;
    const { data: u, error: chybaU } = await db.auth.admin.createUser({
      email: mail,
      password: heslo,
      email_confirm: true,
    });
    if (chybaU) throw new Error(chybaU.message);
    pouzivatel = u.user!.id;
    const { error: chybaClena } = await db
      .from("company_users")
      .insert({ company_id: firma, user_id: pouzivatel, role: "owner" } as never);
    if (chybaClena) throw new Error(chybaClena.message);

    ako = createClient(URL_DB, KLUC_KLIENTA, { auth: { persistSession: false } });
    const { error: chybaPrihlasenia } = await ako.auth.signInWithPassword({
      email: mail,
      password: heslo,
    });
    if (chybaPrihlasenia) throw new Error(chybaPrihlasenia.message);
  });

  afterAll(async () => {
    if (firma) await uprac(db, firma);
    if (pouzivatel) await db.auth.admin.deleteUser(pouzivatel);
  });

  it("rad sa založí sám pri prvom čísle a dostane šablónu podľa druhu", async () => {
    const f = await dalsiaFaktura("regular", "2027-01-05");
    expect(f.invoice_number).toBe("20270001");
    expect(f.sequence_number).toBe(1);
    expect(f.series_id).toBeTruthy();

    const zf = await dalsiaFaktura("proforma", "2027-01-05");
    /* Zálohová má vlastný rad, takže začína znova od jednotky — s predponou. */
    expect(zf.invoice_number).toBe("ZF20270001");
    expect(zf.series_id).not.toBe(f.series_id);
  });

  it("čísla idú po sebe, ako doklady pribúdajú", async () => {
    for (const ocakavane of ["20270001", "20270002", "20270003"]) {
      const f = await dalsiaFaktura("regular", "2027-01-10");
      expect(f.invoice_number).toBe(ocakavane);
      await zapisFakturu(f.invoice_number, "2027-01-10");
    }
  });

  it("nový rok začína znova od jednotky", async () => {
    const f = await dalsiaFaktura("regular", "2028-02-01");
    expect(f.invoice_number).toBe("20280001");
  });

  /*
   * Diera po zmazanej faktúre sa zaplní — číslovanie faktúr nesmie mať
   * medzery, inak ho daňová kontrola spochybní.
   */
  it("faktúry: číslo zmazaného dokladu sa použije znova", async () => {
    const { error } = await db
      .from("invoices")
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq("company_id", firma)
      .eq("invoice_number", "20270002");
    if (error) throw new Error(error.message);

    const f = await dalsiaFaktura("regular", "2027-01-10");
    expect(f.invoice_number).toBe("20270002");
  });

  /*
   * Ponuky a objednávky to majú naopak: číslo už odišlo zákazníkovi, tak
   * ostáva obsadené aj po zmazaní. Ich unikátny index zmazané riadky
   * nevynecháva, takže zaplnenie diery by skončilo chybou pri zápise.
   */
  it("ponuky: číslo zmazaného dokladu ostáva obsadené", async () => {
    const prva = await dalsiDoklad("quote", "2027-03-02");
    expect(prva.number).toBe("Q20270001");
    await zapisDoklad("quote", prva.number, "2027-03-02");

    const druha = await dalsiDoklad("quote", "2027-03-02");
    expect(druha.number).toBe("Q20270002");
    await zapisDoklad("quote", druha.number, "2027-03-02");

    const { error } = await db
      .from("quotes")
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq("company_id", firma)
      .eq("quote_number", "Q20270001");
    if (error) throw new Error(error.message);

    const tretia = await dalsiDoklad("quote", "2027-03-02");
    expect(tretia.number).toBe("Q20270003");
  });

  it("každá agenda má vlastný rad a vlastnú predponu", async () => {
    const ocakavane: Record<Agenda, string> = {
      quote: "Q20290001",
      sales_order: "OBJ20290001",
      purchase_order: "OBJ20290001",
      cash: "PD20290001",
    };
    for (const druh of Object.keys(AGENDY) as Agenda[]) {
      const d = await dalsiDoklad(druh, "2029-04-01");
      expect(d.number, druh).toBe(ocakavane[druh]);
      await zapisDoklad(druh, d.number, "2029-04-01");
      const dalsi = await dalsiDoklad(druh, "2029-04-01");
      expect(dalsi.sequence_number, druh).toBe(2);
    }
  });

  /* Prijaté a vydané objednávky majú rovnakú predponu, ale vlastnú tabuľku
     — čísla si nesmú prekážať. */
  it("objednávky prijaté a vydané sa navzájom nepretekajú", async () => {
    const prijata = await dalsiDoklad("sales_order", "2029-04-01");
    const vydana = await dalsiDoklad("purchase_order", "2029-04-01");
    expect(prijata.number).toBe("OBJ20290002");
    expect(vydana.number).toBe("OBJ20290002");
    expect(prijata.series_id).not.toBe(vydana.series_id);
  });

  it("šablóna s mesiacom sa resetuje každý mesiac", async () => {
    const { data: rad, error: chybaRadu } = await db
      .from("number_series")
      .insert({
        company_id: firma,
        kind: "invoice",
        name: "Mesačný",
        format: "M{YYYY}{MM}-{NNN}",
      } as never)
      .select("id")
      .single();
    if (chybaRadu) throw new Error(chybaRadu.message);
    const id = (rad as { id: string }).id;

    const maj = await dalsiaFaktura("regular", "2030-05-09", id);
    expect(maj.invoice_number).toBe("M203005-001");
    await zapisFakturu(maj.invoice_number, "2030-05-09");

    const majDruha = await dalsiaFaktura("regular", "2030-05-20", id);
    expect(majDruha.invoice_number).toBe("M203005-002");

    /* Jún začína znova od jednotky, hoci máj má už doklad. */
    const jun = await dalsiaFaktura("regular", "2030-06-01", id);
    expect(jun.invoice_number).toBe("M203006-001");
  });

  it("vlastná šablóna a začiatok poradia platia tak, ako sú zadané", async () => {
    const { data: rad, error: chybaRadu } = await db
      .from("number_series")
      .insert({
        company_id: firma,
        kind: "quote",
        name: "Vlastný",
        format: "PON {YYYY}/{NN}",
        start_from: 40,
      } as never)
      .select("id")
      .single();
    if (chybaRadu) throw new Error(chybaRadu.message);
    const id = (rad as { id: string }).id;

    const prva = await dalsiDoklad("quote", "2031-07-07", id);
    expect(prva.number).toBe("PON 2031/40");
    expect(prva.sequence_number).toBe(40);
    await zapisDoklad("quote", prva.number, "2031-07-07");

    const druha = await dalsiDoklad("quote", "2031-07-07", id);
    expect(druha.number).toBe("PON 2031/41");
  });

  /*
   * Rezervácia je číslo dopredu pre appku bez signálu. Kým platí, generátor
   * ho musí obísť — inak by faktúra z telefónu a faktúra z webu dostali to
   * isté číslo.
   */
  it("rezervované číslo generátor preskočí", async () => {
    const { data, error } = await ako.rpc("faktero_reserve_invoice_numbers", {
      _company_id: firma,
      _count: 2,
      _device: "QA",
      _days: 1,
    } as never);
    if (error) throw new Error(error.message);
    const rezervovane = (data as unknown as { invoice_number: string }[]).map(
      (r) => r.invoice_number,
    );
    expect(rezervovane).toHaveLength(2);

    const dnes = new Date().toISOString().slice(0, 10);
    const f = await dalsiaFaktura("regular", dnes);
    expect(rezervovane).not.toContain(f.invoice_number);

    await ako.rpc("faktero_release_invoice_numbers", {
      _company_id: firma,
      _numbers: rezervovane,
    } as never);
    /* Po vrátení je prvé z nich znova na rade. */
    const po = await dalsiaFaktura("regular", dnes);
    expect(po.invoice_number).toBe(rezervovane[0]);
  });

  it("kto nie je členom firmy, číslo nedostane", async () => {
    const { data, error: chybaFirmy } = await db
      .from("companies")
      .insert({ name: `QA bez pristupu ${Date.now()}`, default_currency: "EUR" } as never)
      .select("id")
      .single();
    if (chybaFirmy) throw new Error(chybaFirmy.message);
    const cudzia = (data as { id: string }).id;
    try {
      const { error } = await ako.rpc("faktero_next_invoice_number", {
        _company_id: cudzia,
        _issue_date: "2027-01-10",
        _type: "regular",
        _series_id: null,
      } as never);
      expect(error?.message ?? "").toContain("forbidden");
    } finally {
      await db.from("number_series").delete().eq("company_id", cudzia);
      await db.from("companies").delete().eq("id", cudzia);
    }
  });

  it("cudzia firma do nášho číslovania nevidí", async () => {
    const { data, error: chybaFirmy } = await db
      .from("companies")
      .insert({ name: `QA cudzia ${Date.now()}`, default_currency: "EUR" } as never)
      .select("id")
      .single();
    if (chybaFirmy) throw new Error(chybaFirmy.message);
    const cudzia = (data as { id: string }).id;
    try {
      const { data: r, error } = await db.rpc("faktero_next_invoice_number", {
        _company_id: cudzia,
        _issue_date: "2027-01-10",
        _type: "regular",
        _series_id: null,
      } as never);
      if (error) throw new Error(error.message);
      /* Naše tri faktúry z roku 2027 jej poradie neposunuli. */
      expect((r as unknown as { invoice_number: string }).invoice_number).toBe("20270001");
    } finally {
      await db.from("number_series").delete().eq("company_id", cudzia);
      await db.from("companies").delete().eq("id", cudzia);
    }
  });
});
