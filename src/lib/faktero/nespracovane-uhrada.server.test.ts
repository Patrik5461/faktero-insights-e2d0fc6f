import { describe, expect, it } from "vitest";
import { navrhyUhrad, priradUhradu, priradUhradyHromadne } from "./nespracovane-uhrada.server";
import { PREDPONA_INEJ_SUMY } from "./nespracovane-uhrada";

/*
  Doklad o úhrade z Nespracovaných — falošný PostgREST klient a úložisko
  v pamäti (ako nespracovane-vydana.server.test.ts), navyše `or` s `ilike`.
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

/** Skutočný bloček METRO „ÚHRADA FAKTÚRY“ (RHJ, z Doklada) — tak, ako ho prečítal model. */
const AI_METRO = {
  document_type: "faktura",
  document_subtype: "blocek",
  document_title: "ÚHRADA FAKTÚRY",
  supplier_name: "METRO Cash & Carry SR s.r.o.",
  ekasa_uid: "O-4A1B2C3D4E5F40718293A4B5C6D7E8F9",
  issue_date: "2026-10-12",
  amount_total: 621.7,
  payment_method: "karta",
  items: [{ name: "Faktúra č.0/0/0002/052152", total: 621.7, vat_rate: 23 }],
  vat_breakdown: [{ rate: 23, base: 505.45, vat: 116.25 }],
};

const nespracovany = (id: string, x: Riadok = {}) => ({
  id,
  company_id: FIRMA,
  stav: "vytazene",
  druh: "uhrada",
  ai: AI_METRO,
  file_name: `doklado_${id}.pdf`,
  file_path: `${FIRMA}/doklado/${id}.pdf`,
  file_mime: "application/pdf",
  udaje: { mena: "EUR", celkom: 621.7, dodavatel: { nazov: "METRO Cash & Carry SR s.r.o." } },
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
const subor = (...rs: Riadok[]) => Object.fromEntries(rs.map((r) => [`nespracovane:${r.file_path}`, PDF]));

describe("priradUhradu", () => {
  it("METRO: súbor ide medzi prílohy faktúry 0/0(022)0002/052152, faktúra je uhradená kartou 12. 10., doklad zmizne", async () => {
    const r = nespracovany("n1");
    const sb = falosnyKlient(
      {
        nespracovane_doklady: [r],
        purchase_invoices: [prijata("f1", "0/0(022)0002/052152", 621.7)],
        prilohy_dokladov: [],
        purchase_invoice_payments: [],
      },
      subor(r),
    );
    const v = await priradUhradu(sb, "u1", r, "f1");
    expect(v).toEqual({ purchaseInvoiceId: "f1", cislo: "0/0(022)0002/052152", uhradene: true });
    const [p] = sb.tabulky.prilohy_dokladov!;
    expect(p).toMatchObject({ company_id: FIRMA, purchase_invoice_id: "f1", mime: "application/pdf", size: PDF.length, created_by: "u1" });
    expect(p!.path.startsWith(`${FIRMA}/f1/`)).toBe(true);
    expect(sb.ulozisko.has(`invoice-attachments:${p!.path}`)).toBe(true);
    expect(sb.tabulky.purchase_invoice_payments).toEqual([
      expect.objectContaining({
        company_id: FIRMA,
        purchase_invoice_id: "f1",
        amount: 621.7,
        paid_at: "2026-10-12",
        method: "karta",
        zdroj: "rucne",
        currency: "EUR",
      }),
    ]);
    expect(sb.tabulky.purchase_invoices![0]).toMatchObject({ status: "paid", payment_date: "2026-10-12", payment_method: "karta" });
    expect(sb.tabulky.nespracovane_doklady).toEqual([]);
    expect(sb.ulozisko.has(`nespracovane:${r.file_path}`)).toBe(false);
  });

  it("už uhradená faktúra len dostane prílohu — druhá úhrada nevznikne", async () => {
    const r = nespracovany("n1");
    const sb = falosnyKlient(
      {
        nespracovane_doklady: [r],
        purchase_invoices: [prijata("f1", "0/0(022)0002/052152", 621.7, { status: "paid", payment_date: "2026-10-12" })],
        prilohy_dokladov: [],
        purchase_invoice_payments: [],
      },
      subor(r),
    );
    const v = await priradUhradu(sb, "u1", r, "f1");
    expect(v.uhradene).toBe(false);
    expect(v.dovod?.text).toMatch(/už je uhradená/);
    expect(sb.tabulky.prilohy_dokladov).toHaveLength(1);
    expect(sb.tabulky.purchase_invoice_payments).toEqual([]);
    expect(sb.tabulky.nespracovane_doklady).toEqual([]);
  });

  it("iná suma bez potvrdenia → nič sa nezmení; s potvrdením sa priradí", async () => {
    const r = nespracovany("n1");
    const sb = falosnyKlient(
      {
        nespracovane_doklady: [r],
        purchase_invoices: [prijata("f1", "0/0(022)0002/052152", 700)],
        prilohy_dokladov: [],
        purchase_invoice_payments: [],
      },
      subor(r),
    );
    await expect(priradUhradu(sb, "u1", r, "f1")).rejects.toThrow(PREDPONA_INEJ_SUMY);
    expect(sb.tabulky.prilohy_dokladov).toEqual([]);
    expect(sb.tabulky.nespracovane_doklady).toHaveLength(1);
    const v = await priradUhradu(sb, "u1", r, "f1", { ajInuSumu: true });
    expect(v.uhradene).toBe(true);
    // Čiastočná úhrada sumou z dokladu — faktúra ostáva neuhradená v zvyšku.
    expect(sb.tabulky.purchase_invoice_payments![0]).toMatchObject({ amount: 621.7 });
    expect(sb.tabulky.purchase_invoices![0]!.status).toBe("booked");
  });

  it("faktúra inej firmy, zmazaná, dobropis či plná príloh → odmietne a nič nezmení", async () => {
    const r = nespracovany("n1");
    const plna = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, purchase_invoice_id: "f1", company_id: FIRMA }));
    const sb = falosnyKlient(
      {
        nespracovane_doklady: [r],
        purchase_invoices: [
          prijata("f1", "0/0(022)0002/052152", 621.7),
          prijata("cudzia", "0/0(022)0002/052152", 621.7, { company_id: INA }),
          prijata("zmazana", "0/0(022)0002/052152", 621.7, { deleted_at: "2026-11-01" }),
          prijata("dob", "0/0(022)0002/052152", -621.7, { type: "credit_note" }),
        ],
        prilohy_dokladov: plna,
        purchase_invoice_payments: [],
      },
      subor(r),
    );
    await expect(priradUhradu(sb, "u1", r, "cudzia")).rejects.toThrow(/inej firme/);
    await expect(priradUhradu(sb, "u1", r, "zmazana")).rejects.toThrow(/nenašla/);
    await expect(priradUhradu(sb, "u1", r, "dob")).rejects.toThrow(/len k prijatej faktúre/);
    await expect(priradUhradu(sb, "u1", r, "f1")).rejects.toThrow(/najviac 10/);
    expect(sb.tabulky.purchase_invoice_payments).toEqual([]);
    expect(sb.tabulky.nespracovane_doklady).toHaveLength(1);
  });

  it("stornovaná faktúra dostane prílohu, úhrada sa nezapíše a povie prečo", async () => {
    const r = nespracovany("n1");
    const sb = falosnyKlient(
      {
        nespracovane_doklady: [r],
        purchase_invoices: [prijata("f1", "0/0(022)0002/052152", 621.7, { status: "cancelled" })],
        prilohy_dokladov: [],
        purchase_invoice_payments: [],
      },
      subor(r),
    );
    const v = await priradUhradu(sb, "u1", r, "f1");
    expect(v.uhradene).toBe(false);
    expect(v.dovod?.text).toMatch(/stornovaná/);
    expect(sb.tabulky.prilohy_dokladov).toHaveLength(1);
  });
});

describe("navrhyUhrad a hromadné priradenie", () => {
  it("návrh: bloček zaradený ako bloček vyzerá ako doklad o úhrade a nájde faktúru inak zapísanú", async () => {
    const sb = falosnyKlient({
      purchase_invoices: [
        prijata("f1", "0/0(022)0002/052152", 621.7),
        prijata("f2", "0/0(021)0002/040110", 467.58),
        prijata("cudzia", "0/0(022)0002/052152", 621.7, { company_id: INA }),
      ],
    });
    const m = await navrhyUhrad(sb, FIRMA, [nespracovany("n1", { druh: "blocek" })]);
    const n = m.get("n1")!;
    expect(n.navrh).toBe(true);
    expect(n.uhrada.cisloFaktury).toBe("0/0/0002/052152");
    expect(n.zhody.map((z) => z.faktura.id)).toEqual(["f1"]);
  });

  it("priradí len doklad o úhrade s presnou zhodou, ostatné preskočí s dôvodom", async () => {
    const ok = nespracovany("n1");
    const bezFaktury = nespracovany("n2", {
      ai: { ...AI_METRO, items: [{ name: "Faktúra č.0/0/0009/099999", total: 50 }], amount_total: 50 },
      udaje: { mena: "EUR", celkom: 50 },
    });
    const faktura = nespracovany("n3", {
      druh: "faktura",
      ai: { document_type: "faktura", document_title: "FAKTÚRA č. 2026001", invoice_number: "2026001", amount_total: 10 },
    });
    const sb = falosnyKlient(
      {
        nespracovane_doklady: [ok, bezFaktury, faktura],
        purchase_invoices: [prijata("f1", "0/0(022)0002/052152", 621.7)],
        prilohy_dokladov: [],
        purchase_invoice_payments: [],
      },
      subor(ok, bezFaktury, faktura),
    );
    const v = await priradUhradyHromadne(sb, "u1", FIRMA, ["n1", "n2", "n3"]);
    expect(v.priradene).toBe(1);
    expect(v.uhradene).toBe(1);
    expect(v.preskocene.map((p) => p.dovod.text)).toEqual([
      "Faktúra {cislo} ešte nie je vo Fakteri — otvorte doklad a vytvorte ju",
      "Nie je doklad o úhrade — v detaile určte druh Doklad o úhrade",
    ]);
    expect(sb.tabulky.nespracovane_doklady!.map((r) => r.id)).toEqual(["n2", "n3"]);
    expect(sb.tabulky.purchase_invoices![0]!.status).toBe("paid");
  });
});
