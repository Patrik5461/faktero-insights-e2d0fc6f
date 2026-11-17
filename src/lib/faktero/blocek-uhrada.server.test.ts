import { describe, expect, it } from "vitest";
import {
  presunBlocekDoOstatnych,
  presunBlockyDoOstatnych,
  priradBlocekKFakture,
  priradBlockyHromadne,
  navrhBlocku,
} from "./blocek-uhrada.server";
import { PREDPONA_INEJ_SUMY } from "./nespracovane-uhrada";

/*
  Bloček → doklad o úhrade / Iný doklad — falošný PostgREST klient a úložisko
  v pamäti (rovnaký ako nespracovane-uhrada.server.test.ts).
*/
type Riadok = Record<string, any>;
const PDF = new TextEncoder().encode("%PDF-1.4 test");

function ilike(hodnota: unknown, vzor: string): boolean {
  const re = new RegExp(
    "^" + vzor.split("%").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$",
    "i",
  );
  return re.test(String(hodnota ?? ""));
}

function falosnyKlient(tabulky: Record<string, Riadok[]>, subory: Record<string, Uint8Array> = {}) {
  const ulozisko = new Map(Object.entries(subory));
  let n = 0;
  const from = (tabulka: string) => {
    const filtre: ((r: Riadok) => boolean)[] = [];
    let akcia: "select" | "insert" | "delete" | "update" = "select";
    let nove: Riadok[] = [];
    let zmena: Riadok | null = null;
    let hlava = false;
    let limit = Infinity;
    const q: any = {
      select: (_s?: string, o?: { head?: boolean }) => ((hlava = !!o?.head), q),
      eq: (k: string, v: any) => (filtre.push((r) => r[k] === v), q),
      in: (k: string, vs: any[]) => (filtre.push((r) => vs.includes(r[k])), q),
      is: (k: string, v: any) => (filtre.push((r) => (r[k] ?? null) === v), q),
      or: (podmienky: string) => {
        const casti = podmienky.split(",").map((c) => {
          const [stlpec, op, ...zvysok] = c.split(".");
          return { stlpec: stlpec!, op: op!, h: zvysok.join(".") };
        });
        filtre.push((r) =>
          casti.some((c) => (c.op === "ilike" ? ilike(r[c.stlpec], c.h) : c.op === "eq" ? Number(r[c.stlpec]) === Number(c.h) : false)),
        );
        return q;
      },
      order: () => q,
      limit: (x: number) => ((limit = x), q),
      insert: (z: Riadok | Riadok[]) => ((akcia = "insert"), (nove = Array.isArray(z) ? z : [z]), q),
      delete: () => ((akcia = "delete"), q),
      update: (z: Riadok) => ((akcia = "update"), (zmena = z), q),
      vysledok() {
        const t = (tabulky[tabulka] ??= []);
        if (akcia === "insert") {
          const vlozene: Riadok[] = nove.map((r) => ({ id: r.id ?? `novy-${++n}`, ...r }));
          t.push(...vlozene);
          // Spúšťač úhrad: súčet úhrad ≥ suma → faktúra uhradená.
          if (tabulka === "purchase_invoice_payments")
            for (const u of vlozene) {
              const f = (tabulky.purchase_invoices ?? []).find((x) => x.id === u.purchase_invoice_id);
              const spolu = t.filter((x) => x.purchase_invoice_id === u.purchase_invoice_id).reduce((a, x) => a + x.amount, 0);
              if (f && spolu >= Math.abs(f.amount_total) - 0.005) Object.assign(f, { status: "paid", payment_date: u.paid_at });
            }
          return { data: vlozene, error: null };
        }
        const rs = t.filter((r) => filtre.every((f) => f(r)));
        if (akcia === "delete") {
          tabulky[tabulka] = t.filter((r) => !rs.includes(r));
          return { data: rs, error: null };
        }
        if (akcia === "update") for (const r of rs) Object.assign(r, zmena);
        return { data: rs.slice(0, limit).map((r) => ({ ...r })), error: null, count: rs.length };
      },
      maybeSingle: async () => {
        const v = q.vysledok();
        return { data: v.data?.[0] ?? null, error: v.error };
      },
      single: async () => {
        const v = q.vysledok();
        return { data: v.data?.[0] ?? null, error: v.error };
      },
      then: (ok: any, zle: any) =>
        Promise.resolve(q.vysledok()).then((v: any) => (hlava ? { ...v, data: null } : v)).then(ok, zle),
    };
    return q;
  };
  const storage = {
    from: (kos: string) => ({
      download: async (cesta: string) => {
        const b = ulozisko.get(`${kos}:${cesta}`);
        return b ? { data: new Blob([b as Uint8Array<ArrayBuffer>]), error: null } : { data: null, error: { message: "not found" } };
      },
      upload: async (cesta: string, b: Uint8Array) => {
        ulozisko.set(`${kos}:${cesta}`, b);
        return { error: null };
      },
      remove: async (cesty: string[]) => {
        for (const c of cesty) ulozisko.delete(`${kos}:${c}`);
        return { error: null };
      },
    }),
  };
  return { from, storage, tabulky, ulozisko };
}

const FIRMA = "d2dcad65-6e3c-48cf-abaa-4d44bbb5bee8";
const INA = "11111111-1111-4111-8111-111111111111";

/** Bloček METRO „ÚHRADA FAKTÚRY“ (RHJ) — ako ho uloží nahratie medzi Bločky. */
const AI_METRO = {
  document_title: "ÚHRADA FAKTÚRY",
  supplier_name: "METRO Cash & Carry SR s.r.o.",
  issue_date: "2026-10-12",
  amount_total: 621.7,
  payment_method: "karta",
  items: [{ name: "Faktúra č.0/0/0002/052152", total: 621.7, vat_rate: 0 }],
};
const blocek = (id: string, x: Riadok = {}) => ({
  id,
  company_id: FIRMA,
  status: "new",
  supplier_name: "METRO Cash & Carry SR s.r.o.",
  document_number: null,
  issue_date: "2026-10-12",
  total_amount: 621.7,
  vat_amount: 0,
  vat_breakdown: null,
  currency: "EUR",
  payment_method: "karta",
  items: AI_METRO.items,
  ai_raw: AI_METRO,
  note: null,
  file_path: `${FIRMA}/${id}.pdf`,
  file_mime: "application/pdf",
  exported_at: null,
  locked_at: null,
  ...x,
});
const prijata = (id: string, cislo: string, suma: number, x: Riadok = {}) => ({
  id,
  company_id: FIRMA,
  invoice_number: cislo,
  variable_symbol: null,
  supplier_name: "METRO Cash & Carry SR s. r. o.",
  issue_date: "2026-10-12",
  amount_total: suma,
  currency: "EUR",
  status: "booked",
  type: "regular",
  payment_method: null,
  payment_date: null,
  advance_amount: null,
  advance_invoice_id: null,
  deleted_at: null,
  ...x,
});
const subor = (...rs: Riadok[]) => Object.fromEntries(rs.map((r) => [`expense-receipts:${r.file_path}`, PDF]));
const db = (x: Record<string, Riadok[]>, zamknuteDo: string | null = null) => ({
  companies: [{ id: FIRMA, locked_until: zamknuteDo }],
  bank_transactions: [],
  kos_dokladov: [],
  prilohy_dokladov: [],
  purchase_invoice_payments: [],
  other_documents: [],
  other_document_files: [],
  ...x,
});

describe("priradBlocekKFakture", () => {
  it("METRO: súbor bločku ide k faktúre 0/0(022)0002/052152, faktúra je uhradená kartou, bloček je v koši", async () => {
    const r = blocek("b1");
    const sb = falosnyKlient(
      db({ expense_documents: [r], purchase_invoices: [prijata("f1", "0/0(022)0002/052152", 621.7)] }),
      subor(r),
    );
    const v = await priradBlocekKFakture(sb, "u1", r, "f1");
    expect(v).toEqual({ purchaseInvoiceId: "f1", cislo: "0/0(022)0002/052152", uhradene: true });
    const [p] = sb.tabulky.prilohy_dokladov!;
    expect(p).toMatchObject({ company_id: FIRMA, purchase_invoice_id: "f1", mime: "application/pdf" });
    expect(sb.ulozisko.has(`invoice-attachments:${p!.path}`)).toBe(true);
    expect(sb.tabulky.purchase_invoice_payments).toEqual([
      expect.objectContaining({ amount: 621.7, paid_at: "2026-10-12", method: "karta", note: "Doklad o úhrade z Bločkov" }),
    ]);
    expect(sb.tabulky.purchase_invoices![0]).toMatchObject({ status: "paid", payment_method: "karta" });
    expect(sb.tabulky.expense_documents).toEqual([]);
    expect(sb.tabulky.kos_dokladov).toEqual([
      expect.objectContaining({ druh: "doklad", zaznam_id: "b1", company_id: FIRMA, zmazal: "u1" }),
    ]);
    // Sken ostáva v úložisku Bločkov, kým sa kôš nevysype (obnova z koša).
    expect(sb.ulozisko.has(`expense-receipts:${r.file_path}`)).toBe(true);
  });

  it("odovzdaný do Pohody, zamknutý a v uzavretom období → odmietne s dôvodom, nič sa nezmení", async () => {
    const odovzdany = blocek("b1", { exported_at: "2026-11-01T10:00:00Z" });
    const zamknuty = blocek("b2", { locked_at: "2026-11-01T10:00:00Z" });
    const sb = falosnyKlient(
      db({ expense_documents: [odovzdany, zamknuty], purchase_invoices: [prijata("f1", "0/0(022)0002/052152", 621.7)] }),
      subor(odovzdany, zamknuty),
    );
    await expect(priradBlocekKFakture(sb, "u1", odovzdany, "f1")).rejects.toThrow(/vráťte z Pohody/);
    await expect(priradBlocekKFakture(sb, "u1", zamknuty, "f1")).rejects.toThrow(/Zamknutý/);
    const vObdobi = falosnyKlient(
      db({ expense_documents: [blocek("b3")], purchase_invoices: [prijata("f1", "0/0(022)0002/052152", 621.7)] }, "2026-10-31"),
      subor(blocek("b3")),
    );
    await expect(priradBlocekKFakture(vObdobi, "u1", blocek("b3"), "f1")).rejects.toThrow(/Uzavreté obdobie/);
    expect(sb.tabulky.prilohy_dokladov).toEqual([]);
    expect(sb.tabulky.purchase_invoice_payments).toEqual([]);
    expect(sb.tabulky.expense_documents).toHaveLength(2);
    expect(vObdobi.tabulky.expense_documents).toHaveLength(1);
  });

  it("iná suma bez potvrdenia odmietne; keď sa bloček nezmaže (chýba právo), príloha sa vráti", async () => {
    const r = blocek("b1");
    const sb = falosnyKlient(
      db({ expense_documents: [r], purchase_invoices: [prijata("f1", "0/0(022)0002/052152", 700)] }),
      subor(r),
    );
    await expect(priradBlocekKFakture(sb, "u1", r, "f1")).rejects.toThrow(PREDPONA_INEJ_SUMY);
    // Bloček medzitým zmizol (iný človek ho zmazal) — príloha sa nesmie zdvojiť.
    sb.tabulky.expense_documents = [];
    await expect(priradBlocekKFakture(sb, "u1", r, "f1", { ajInuSumu: true })).rejects.toThrow(/nezmazal/);
    expect(sb.tabulky.prilohy_dokladov).toEqual([]);
    expect(sb.tabulky.kos_dokladov).toEqual([]);
    expect(sb.tabulky.purchase_invoice_payments).toEqual([]);
  });
});

describe("presunBlocekDoOstatnych", () => {
  it("bloček sa stane Iným dokladom s tým istým súborom, dodávateľom, dátumom a sumou; bloček je v koši", async () => {
    const r = blocek("b1", { status: "processed", note: "z pokladne" });
    const sb = falosnyKlient(db({ expense_documents: [r] }), subor(r));
    const { id } = await presunBlocekDoOstatnych(sb, "u1", r);
    expect(sb.tabulky.other_documents).toEqual([
      expect.objectContaining({
        id,
        company_id: FIRMA,
        kind: "ine",
        sender: "METRO Cash & Carry SR s.r.o.",
        subject: "Úhrada faktúry č. 0/0/0002/052152",
        received_date: "2026-10-12",
        amount: 621.7,
        currency: "EUR",
        paid_at: "2026-10-12",
        status: "processed",
        processed_by: "u1",
        created_by: "u1",
        note: "Presunuté z Bločkov (úhrada faktúry)\nz pokladne",
      }),
    ]);
    const [f] = sb.tabulky.other_document_files!;
    expect(f).toMatchObject({ document_id: id, company_id: FIRMA, path: `${FIRMA}/${id}/b1.pdf`, name: "b1.pdf", position: 0 });
    expect(sb.ulozisko.has(`other-docs:${f!.path}`)).toBe(true);
    expect(sb.tabulky.expense_documents).toEqual([]);
    expect(sb.tabulky.kos_dokladov).toHaveLength(1);
  });

  it("odovzdaný bloček odmietne; keď sa bloček nezmaže, Iný doklad sa vráti", async () => {
    const odovzdany = blocek("b1", { exported_at: "2026-11-01T10:00:00Z" });
    const sb = falosnyKlient(db({ expense_documents: [odovzdany] }), subor(odovzdany));
    await expect(presunBlocekDoOstatnych(sb, "u1", odovzdany)).rejects.toThrow(/vráťte z Pohody/);
    expect(sb.tabulky.other_documents).toEqual([]);

    const zmiznuty = blocek("b2");
    const sb2 = falosnyKlient(db({ expense_documents: [] }), subor(zmiznuty));
    await expect(presunBlocekDoOstatnych(sb2, "u1", zmiznuty)).rejects.toThrow(/nezmazal/);
    expect(sb2.tabulky.other_documents).toEqual([]);
    expect(sb2.tabulky.other_document_files).toEqual([]);
    expect([...sb2.ulozisko.keys()].some((k) => k.startsWith("other-docs:"))).toBe(false);
  });
});

describe("hromadné akcie a návrh", () => {
  it("návrh pre detail nájde faktúru inak zapísanú a povie zámok", async () => {
    const sb = falosnyKlient(
      db({ purchase_invoices: [prijata("f1", "0/0(022)0002/052152", 621.7), prijata("cudzia", "0/0(022)0002/052152", 621.7, { company_id: INA })] }),
    );
    const n = await navrhBlocku(sb, blocek("b1") as any);
    expect(n.jeUhrada).toBe(true);
    expect(n.uhrada.cisloFaktury).toBe("0/0/0002/052152");
    expect(n.zhody.map((z) => z.faktura.id)).toEqual(["f1"]);
    expect(n.zamok).toBeNull();
  });

  it("priradí len úhradu s presnou zhodou, bežný bloček a zamknutý preskočí s dôvodom", async () => {
    const ok = blocek("b1");
    const nafta = blocek("b2", {
      supplier_name: "OMV",
      ai_raw: null,
      items: [{ name: "Diesel", total: 50, vat_rate: 23 }],
      vat_amount: 9.35,
      total_amount: 50,
    });
    const odovzdany = blocek("b3", { exported_at: "2026-11-01T10:00:00Z" });
    const sb = falosnyKlient(
      db({ expense_documents: [ok, nafta, odovzdany], purchase_invoices: [prijata("f1", "0/0(022)0002/052152", 621.7)] }),
      subor(ok, nafta, odovzdany),
    );
    const v = await priradBlockyHromadne(sb, "u1", FIRMA, ["b1", "b2", "b3"]);
    expect(v.priradene).toBe(1);
    expect(v.uhradene).toBe(1);
    expect(v.preskocene.map((p) => p.dovod.text)).toEqual([
      "Nevyzerá ako úhrada faktúry — priraďte ho v detaile bločku",
      "Odovzdaný do účtovníctva — najprv ho vráťte z Pohody",
    ]);
    expect(sb.tabulky.expense_documents!.map((r) => r.id)).toEqual(["b2", "b3"]);
  });

  it("hromadný presun do Iných dokladov preskočí odovzdaný", async () => {
    const a = blocek("b1");
    const odovzdany = blocek("b2", { exported_at: "2026-11-01T10:00:00Z" });
    const sb = falosnyKlient(db({ expense_documents: [a, odovzdany] }), subor(a, odovzdany));
    const v = await presunBlockyDoOstatnych(sb, "u1", FIRMA, ["b1", "b2"]);
    expect(v.presunute).toBe(1);
    expect(v.preskocene).toHaveLength(1);
    expect(sb.tabulky.other_documents).toHaveLength(1);
    expect(sb.tabulky.expense_documents!.map((r) => r.id)).toEqual(["b2"]);
  });
});
