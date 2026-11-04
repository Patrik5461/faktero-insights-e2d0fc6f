import { describe, expect, it } from "vitest";
import {
  chybaUlozenejPrijatej,
  moznaDuplicita,
  popisPrijatej,
  rozlozChybuPrijatej,
  suDuplicitne,
  zPrijatej,
  PREDPONA_ULOZENEJ_PRIJATEJ,
} from "./duplicita-zauctovania";
import { PREDPONA_DUPLICITY } from "./prijate-duplicity";

/*
  Duplicitná prijatá faktúra sa nesmie ani uložiť (Patrik 4. 11.: MOKOŠÁK
  1126817 prišla mailom po importe a cez „Vytvoriť“ vznikla druhýkrát).
  Rovnaké číslo s inou sumou či z iného roka je len možná duplicita.
*/

type Riadok = Record<string, any>;
const FIRMA = "11111111-1111-4111-8111-111111111111";
const POVODNA = "0658bcaf-84e6-4e49-b65e-993aa3d0b463";

const mokosak = (z: Riadok = {}): Riadok => ({
  id: POVODNA,
  company_id: FIRMA,
  invoice_number: "1126817",
  supplier_ico: "47699167",
  supplier_name: "MOKOŠÁK PLUS s.r.o.",
  amount_total: 78.3,
  currency: "EUR",
  issue_date: "2026-10-15",
  type: "regular",
  status: "paid",
  deleted_at: null,
  zauctovane_at: "2026-10-27T22:17:24Z",
  exported_at: "2026-10-27T22:17:24Z",
  ...z,
});

describe("pravidlo zhody prijatej faktúry", () => {
  const a = zPrijatej(mokosak());
  const b = (z: Riadok) => zPrijatej(mokosak({ id: "druha", status: "received", zauctovane_at: null, exported_at: null, ...z }));

  it("rovnaké číslo + IČO + suma + rok = duplicita (blok)", () => {
    expect(suDuplicitne(b({}), a)).toBe(true);
    expect(suDuplicitne(b({ invoice_number: "01126-817" }), a)).toBe(true);
    // Iný deň v tom istom roku — prečítaný dátum dodania namiesto vystavenia.
    expect(suDuplicitne(b({ issue_date: "2026-10-20" }), a)).toBe(true);
    // Bez IČO rozhodne názov (bez diakritiky a právnej formy).
    expect(suDuplicitne(b({ supplier_ico: null, supplier_name: "Mokosak Plus" }), a)).toBe(true);
    expect(moznaDuplicita(b({}), a)).toBe(false);
  });

  it("iná suma alebo iný rok = len možná duplicita (Alza opakuje čísla)", () => {
    expect(suDuplicitne(b({ amount_total: 90.92 }), a)).toBe(false);
    expect(moznaDuplicita(b({ amount_total: 90.92 }), a)).toBe(true);
    expect(suDuplicitne(b({ issue_date: "2024-01-22" }), a)).toBe(false);
    expect(moznaDuplicita(b({ issue_date: "2024-01-22" }), a)).toBe(true);
  });

  it("iný dodávateľ, typ, dobropis, zmazaná, stornovaná či „bez čísla“ nie sú duplicita", () => {
    for (const z of [
      { supplier_ico: "1" },
      { type: "proforma" },
      { amount_total: -78.3 },
      { deleted_at: "2026-11-04" },
      { status: "cancelled" },
    ]) {
      expect(suDuplicitne(b(z), a)).toBe(false);
      expect(moznaDuplicita(b(z), a)).toBe(false);
    }
    const bez = (id: string) => zPrijatej(mokosak({ id, invoice_number: "bez čísla" }));
    expect(suDuplicitne(bez("x"), bez("y"))).toBe(false);
  });

  it("hláška s odkazom: popis + id sa dá rozložiť (aj zo spúšťača v DB)", () => {
    expect(popisPrijatej(mokosak())).toBe("1126817, MOKOŠÁK PLUS s.r.o., 78,30 EUR");
    const ch = chybaUlozenejPrijatej(mokosak());
    expect(ch).toBe(`${PREDPONA_ULOZENEJ_PRIJATEJ}1126817, MOKOŠÁK PLUS s.r.o., 78,30 EUR [${POVODNA}]`);
    expect(rozlozChybuPrijatej(`Error: ${ch}`)).toEqual({ popis: "1126817, MOKOŠÁK PLUS s.r.o., 78,30 EUR", id: POVODNA });
    expect(rozlozChybuPrijatej("iná chyba")).toBeNull();
  });
});

/** PostgREST klient nad poľami v pamäti — s insertom, delete a úložiskom. */
function falosnyKlient(tabulky: Record<string, Riadok[]>) {
  const zapisy: { tabulka: string; op: string; data?: Riadok }[] = [];
  const from = (tabulka: string) => {
    const filtre: ((r: Riadok) => boolean)[] = [];
    let op: "select" | "update" | "insert" | "delete" = "select";
    let data: Riadok | null = null;
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => (filtre.push((r) => r[k] === v), q),
      neq: (k: string, v: any) => (filtre.push((r) => r[k] !== v), q),
      in: (k: string, vs: any[]) => (filtre.push((r) => vs.includes(r[k])), q),
      is: (k: string, v: any) => (filtre.push((r) => (r[k] ?? null) === v), q),
      lt: () => q,
      not: () => q,
      or: () => q,
      ilike: () => q,
      order: () => q,
      gte: () => q,
      range: () => q,
      limit: () => q,
      update: (z: Riadok) => ((op = "update"), (data = z), q),
      insert: (z: Riadok) => ((op = "insert"), (data = { id: "nova", ...z }), q),
      delete: () => ((op = "delete"), q),
      vysledok() {
        if (op === "insert") {
          zapisy.push({ tabulka, op, data: data! });
          (tabulky[tabulka] ??= []).push(data!);
          return [data];
        }
        const rs = (tabulky[tabulka] ?? []).filter((r) => filtre.every((f) => f(r)));
        if (op !== "select") zapisy.push({ tabulka, op, data: data ?? undefined });
        return rs.map((r) => ({ ...r }));
      },
      maybeSingle: async () => ({ data: q.vysledok()[0] ?? null, error: null }),
      single: async () => ({ data: q.vysledok()[0] ?? null, error: null }),
      then: (ok: any, zle: any) => Promise.resolve({ data: q.vysledok(), error: null }).then(ok, zle),
    };
    return q;
  };
  const storage = {
    from: () => ({
      download: async () => ({ data: null }),
      upload: async () => (zapisy.push({ tabulka: "storage", op: "upload" }), { error: null }),
      remove: async () => ({ error: null }),
    }),
  };
  return { from, storage, zapisy };
}

describe("najdiUlozenuPrijatu / overUlozeniePrijatej", () => {
  it("blok vždy, možnú duplicitu len bez potvrdenia", async () => {
    const { najdiUlozenuPrijatu, overUlozeniePrijatej } = await import("./duplicita-zauctovania.server");
    const sb = falosnyKlient({ purchase_invoices: [mokosak()] });
    const nova = { invoice_number: "1126817", supplier_ico: "47699167", supplier_name: "MOKOŠÁK PLUS s.r.o.", amount_total: 78.3, issue_date: "2026-10-15", type: "regular" };
    const r = await najdiUlozenuPrijatu(sb, FIRMA, nova);
    expect(r.blok?.id).toBe(POVODNA);
    await expect(overUlozeniePrijatej(sb, FIRMA, nova, { ajMoznu: true })).rejects.toThrow(PREDPONA_ULOZENEJ_PRIJATEJ);
    // Úprava tej istej faktúry nie je duplicita sama so sebou.
    expect((await najdiUlozenuPrijatu(sb, FIRMA, nova, POVODNA)).blok).toBeNull();

    const inyRok = { ...nova, issue_date: "2027-01-05" };
    expect((await najdiUlozenuPrijatu(sb, FIRMA, inyRok)).mozna?.id).toBe(POVODNA);
    await expect(overUlozeniePrijatej(sb, FIRMA, inyRok)).rejects.toThrow(PREDPONA_DUPLICITY);
    await expect(overUlozeniePrijatej(sb, FIRMA, inyRok, { ajMoznu: true })).resolves.toBeUndefined();
  });
});

describe("vytvorDoklad z Nespracovaných", () => {
  const nespracovany = (): Riadok => ({
    id: "22222222-2222-4222-8222-222222222222",
    company_id: FIRMA,
    zdroj: "mail",
    file_path: null,
    inbox_message_id: null,
    created_by: null,
    created_at: "2026-11-04T11:48:00Z",
  });
  const udaje = async (z: Record<string, any> = {}) => {
    const { prazdneUdaje } = await import("./nespracovane");
    const u = prazdneUdaje();
    u.cislo = "1126817";
    u.dodavatel.nazov = "MOKOŠÁK PLUS s.r.o.";
    u.dodavatel.ico = "47699167";
    u.datumVystavenia = "2026-10-15";
    u.datumPrijatia = "2026-11-04";
    u.rozpis = [{ sadzba: 23, zaklad: 63.66, dph: 14.64 }];
    u.celkom = 78.3;
    u.kody.predkontacia = "502000 321000";
    u.kody.clenenie = "PN";
    return Object.assign(u, z);
  };

  it("duplicitu nevytvorí ani nezaúčtuje — nespracovaný ostáva", async () => {
    const { vytvorDoklad } = await import("./nespracovane.server");
    const r = nespracovany();
    const sb = falosnyKlient({ purchase_invoices: [mokosak()], nespracovane_doklady: [r] });
    await expect(vytvorDoklad(sb, "u1", r, "faktura", await udaje(), { ajDuplicitu: true })).rejects.toThrow(
      `${PREDPONA_ULOZENEJ_PRIJATEJ}1126817, MOKOŠÁK PLUS s.r.o., 78,30 EUR [${POVODNA}]`,
    );
    expect(sb.zapisy.filter((z) => z.op === "insert" && z.tabulka === "purchase_invoices")).toHaveLength(0);
    expect(sb.zapisy.filter((z) => z.op === "delete")).toHaveLength(0);
    expect(sb.zapisy.filter((z) => z.tabulka === "storage")).toHaveLength(0);
  });

  it("možnú duplicitu (iný rok) vytvorí až po potvrdení", async () => {
    const { vytvorDoklad } = await import("./nespracovane.server");
    const r = nespracovany();
    const sb = falosnyKlient({ purchase_invoices: [mokosak({ issue_date: "2024-03-01" })], nespracovane_doklady: [r] });
    await expect(vytvorDoklad(sb, "u1", r, "faktura", await udaje())).rejects.toThrow(PREDPONA_DUPLICITY);
    expect(sb.zapisy.filter((z) => z.op === "insert" && z.tabulka === "purchase_invoices")).toHaveLength(0);
  });
});

describe("duplicityNespracovanych (upozornenie pri otvorení a odznak v zozname)", () => {
  it("označí nespracovanú faktúru, ktorá už v evidencii je", async () => {
    const { duplicityNespracovanych } = await import("./nespracovane.server");
    const sb = falosnyKlient({ purchase_invoices: [mokosak()] });
    const m = await duplicityNespracovanych(sb, FIRMA, [
      { id: "n1", druh: null, udaje: { cislo: "1126817", dodavatel: { ico: "47699167", nazov: "MOKOŠÁK PLUS s.r.o." }, celkom: 78.3, rozpis: [{ sadzba: 23, zaklad: 63.66, dph: 14.64 }], datumVystavenia: "2026-10-15" } },
      { id: "n2", druh: "faktura", udaje: { cislo: "1126817", dodavatel: { ico: "47699167", nazov: "MOKOŠÁK" }, celkom: 12, rozpis: [{ sadzba: 23, zaklad: 9.76, dph: 2.24 }], datumVystavenia: "2026-10-15" } },
      { id: "n3", druh: "blocek", udaje: { cislo: "1126817", dodavatel: { ico: "47699167" } } },
      { id: "n4", druh: "faktura", udaje: { cislo: "999", dodavatel: { ico: "47699167" } } },
    ]);
    expect(m.get("n1")).toEqual({ id: POVODNA, popis: "1126817, MOKOŠÁK PLUS s.r.o., 78,30 EUR", blok: true, zauctovana: true });
    expect(m.get("n2")?.blok).toBe(false);
    expect(m.has("n3")).toBe(false);
    expect(m.has("n4")).toBe(false);
  });
});
