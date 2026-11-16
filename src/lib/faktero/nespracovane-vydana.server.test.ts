import { describe, expect, it } from "vitest";
import { priradKVydanej, priradVydaneHromadne, vytvorVydanu } from "./nespracovane-vydana.server";
import { nacitajUdaje } from "./nespracovane";

/*
  Priradenie vlastnej vystavenej faktúry z Nespracovaných — falošný PostgREST
  klient a úložisko v pamäti (ako zrusenie-zauctovania.server.test.ts).
*/

type Riadok = Record<string, any>;
const PDF = new TextEncoder().encode("%PDF-1.4 test");

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
      order: () => q,
      limit: (x: number) => ((limit = x), q),
      insert: (z: Riadok | Riadok[]) => ((akcia = "insert"), (nove = Array.isArray(z) ? z : [z]), q),
      delete: () => ((akcia = "delete"), q),
      update: (z: Riadok) => ((akcia = "update"), (zmena = z), q),
      vysledok() {
        const t = (tabulky[tabulka] ??= []);
        if (akcia === "insert") {
          // Unikátne číslo živej faktúry vo firme (ako index v databáze).
          if (tabulka === "invoices")
            for (const r of nove)
              if (t.some((x) => x.company_id === r.company_id && x.invoice_number === r.invoice_number && !x.deleted_at))
                return { data: null, error: { code: "23505", message: "duplicate key" } };
          const vlozene = nove.map((r) => ({ id: r.id ?? `novy-${++n}`, ...r }));
          t.push(...vlozene);
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
const firma = { id: FIRMA, name: "RHJ s. r. o.", ico: "57348324", dic: "2122676809", ic_dph: null, country: "SK", default_currency: "EUR", uctovanie_nastavenia: {} };
const nespracovany = (id: string, x: Riadok = {}) => ({
  id,
  company_id: FIRMA,
  stav: "vytazene",
  druh: null,
  ai: null,
  file_name: `fa_RHJsro_${id}`,
  file_path: `${FIRMA}/doklado/${id}/0-fa_RHJsro_${id}`,
  file_mime: "application/pdf",
  udaje: { mena: "EUR", celkom: 686, dodavatel: { nazov: "Domov sociálnych služieb pre dospelých v Zavare" } },
  ...x,
});
const faktura = (id: string, cislo: string, total: number, x: Riadok = {}) => ({
  id,
  company_id: FIRMA,
  invoice_number: cislo,
  type: "regular",
  status: "paid",
  total,
  currency: "EUR",
  deleted_at: null,
  ...x,
});
const subor = (r: Riadok) => ({ [`nespracovane:${r.file_path}`]: PDF });

describe("priradKVydanej", () => {
  it("súbor ide medzi prílohy faktúry, nespracovaný záznam aj jeho súbor zmiznú", async () => {
    const r = nespracovany("2026018");
    const sb = falosnyKlient(
      { nespracovane_doklady: [r], invoices: [faktura("f18", "2026018", 686)], invoice_attachments: [] },
      subor(r),
    );
    const v = await priradKVydanej(sb, "u1", r, "f18");
    expect(v).toEqual({ invoiceId: "f18", cislo: "2026018" });
    const [p] = sb.tabulky.invoice_attachments!;
    expect(p).toMatchObject({
      company_id: FIRMA,
      invoice_id: "f18",
      name: "fa_RHJsro_2026018.pdf",
      mime: "application/pdf",
      size: PDF.length,
      created_by: "u1",
    });
    expect(p!.path.startsWith(`${FIRMA}/f18/`)).toBe(true);
    expect(sb.ulozisko.has(`invoice-attachments:${p!.path}`)).toBe(true);
    expect(sb.tabulky.nespracovane_doklady).toEqual([]);
    expect(sb.ulozisko.has(`nespracovane:${r.file_path}`)).toBe(false);
  });

  it("faktúra inej firmy, zmazaná, alebo plná príloh → nič sa nezmení", async () => {
    const r = nespracovany("2026018");
    const plna = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, invoice_id: "f18", company_id: FIRMA }));
    const sb = falosnyKlient(
      {
        nespracovane_doklady: [r],
        invoices: [
          faktura("f18", "2026018", 686),
          faktura("cudzia", "2026018", 686, { company_id: INA }),
          faktura("zmazana", "2026018", 686, { deleted_at: "2026-11-01T00:00:00Z" }),
        ],
        invoice_attachments: plna,
      },
      subor(r),
    );
    await expect(priradKVydanej(sb, "u1", r, "cudzia")).rejects.toThrow("inej firme");
    await expect(priradKVydanej(sb, "u1", r, "zmazana")).rejects.toThrow("nenašla");
    await expect(priradKVydanej(sb, "u1", r, "f18")).rejects.toThrow("najviac 10");
    expect(sb.tabulky.nespracovane_doklady).toHaveLength(1);
    expect(sb.tabulky.invoice_attachments).toHaveLength(10);
  });

  it("doklad medzitým spracoval niekto iný → príloha sa vráti späť", async () => {
    const r = nespracovany("2026018");
    const sb = falosnyKlient(
      { nespracovane_doklady: [], invoices: [faktura("f18", "2026018", 686)], invoice_attachments: [] },
      subor(r),
    );
    await expect(priradKVydanej(sb, "u1", r, "f18")).rejects.toThrow("niekto spracoval");
    expect(sb.tabulky.invoice_attachments).toEqual([]);
    expect([...sb.ulozisko.keys()].some((k) => k.startsWith("invoice-attachments:"))).toBe(false);
  });
});

describe("priradVydaneHromadne", () => {
  it("RHJ: štyri faktúry a dobropis z Doklada sa priradia, METRO bloček a cudzí doklad nie", async () => {
    const rows = [
      nespracovany("2026018"),
      nespracovany("2026019", { udaje: { celkom: 718.9, dodavatel: { nazov: "Domov" } } }),
      nespracovany("2026020", { udaje: { celkom: 840.5, dodavatel: { nazov: "Domov" } } }),
      nespracovany("2026021", {
        druh: "faktura",
        udaje: { cislo: "2026021", celkom: 823.9, dodavatel: { nazov: "Domov", ico: "57348324" } },
      }),
      nespracovany("2026022", {
        file_name: "dob_RHJsro_2026022",
        file_path: `${FIRMA}/doklado/x/0-dob_RHJsro_2026022`,
        udaje: { celkom: -535, dodavatel: { nazov: "Domov" } },
      }),
      nespracovany("metro", {
        druh: "faktura",
        file_name: "2026-11-10_01-40-52_RHJsro_iPhone182",
        udaje: { cislo: "0000/00002/051215", celkom: 621.7, dodavatel: { nazov: "METRO", ico: "35725664" } },
      }),
      nespracovany("cudzi", { company_id: INA }),
    ];
    const sb = falosnyKlient(
      {
        companies: [firma],
        nespracovane_doklady: rows,
        invoices: [
          faktura("f18", "2026018", 686),
          faktura("f19", "2026019", 718.9),
          faktura("f20", "2026020", 840.5),
          faktura("f21", "2026021", 823.9),
          faktura("f22", "2026022", -535, { type: "credit_note" }),
        ],
        invoice_attachments: [],
      },
      Object.assign({}, ...rows.map(subor)),
    );
    const v = await priradVydaneHromadne(sb, "u1", FIRMA, rows.map((r) => r.id));
    expect(v.priradene).toBe(5);
    expect(v.preskocene).toEqual([
      {
        popis: "METRO · 0000/00002/051215",
        dovod: { text: "Nevyzerá ako vaša vystavená faktúra — v detaile určte druh Vydaná faktúra" },
      },
    ]);
    expect(sb.tabulky.invoice_attachments!.map((p) => p.invoice_id).sort()).toEqual(["f18", "f19", "f20", "f21", "f22"]);
    expect(sb.tabulky.nespracovane_doklady!.map((r) => r.id)).toEqual(["metro", "cudzi"]);
  });

  it("číslo bez faktúry a iná suma sa preskočia s dôvodom", async () => {
    const rows = [
      nespracovany("2026099", { druh: "vydana" }),
      nespracovany("2026018", { druh: "vydana", udaje: { celkom: 999, dodavatel: { nazov: "Domov" } } }),
    ];
    const sb = falosnyKlient(
      { companies: [firma], nespracovane_doklady: rows, invoices: [faktura("f18", "2026018", 686)], invoice_attachments: [] },
      Object.assign({}, ...rows.map(subor)),
    );
    const v = await priradVydaneHromadne(sb, "u1", FIRMA, rows.map((r) => r.id));
    expect(v.priradene).toBe(0);
    expect(v.preskocene.map((p) => p.dovod.text)).toEqual([
      "Vystavená faktúra {cislo} sa nenašla — otvorte doklad a vyberte ju alebo ju vytvorte",
      "Suma nesedí s vystavenou faktúrou {cislo} — rozhodnite v detaile",
    ]);
    expect(sb.tabulky.nespracovane_doklady).toHaveLength(2);
  });
});

describe("vytvorVydanu", () => {
  const udaje = nacitajUdaje({
    cislo: "2026030",
    datumVystavenia: "2026-11-02",
    datumDodania: "2026-11-01",
    splatnost: "2026-11-16",
    mena: "EUR",
    celkom: 686,
    dodavatel: { nazov: "Domov sociálnych služieb pre dospelých v Zavare", ico: "00611930" },
    rozpis: [{ sadzba: 0, zaklad: 686, dph: 0 }],
  });

  it("založí vystavenú faktúru s číslom z dokladu, bez upomienok, so súborom v prílohách", async () => {
    const r = nespracovany("2026030", { druh: "vydana" });
    const sb = falosnyKlient(
      {
        companies: [firma],
        customers: [{ id: "k1", company_id: FIRMA, ico: "00611930" }],
        nespracovane_doklady: [r],
        invoices: [],
        invoice_items: [],
        invoice_attachments: [],
      },
      subor(r),
    );
    const v = await vytvorVydanu(sb, "u1", r, udaje);
    expect(v.cislo).toBe("2026030");
    const [f] = sb.tabulky.invoices!;
    expect(f).toMatchObject({
      company_id: FIRMA,
      customer_id: "k1",
      customer_name: "Domov sociálnych služieb pre dospelých v Zavare",
      invoice_number: "2026030",
      variable_symbol: "2026030",
      status: "issued",
      type: "regular",
      total: 686,
      reminders_enabled: false,
      import_source: "nespracovane",
      created_by: "u1",
    });
    // Číslo z dokladu — žiadny číselný rad.
    expect(f!.number_series_id).toBeUndefined();
    expect(f!.sequence_number).toBeUndefined();
    expect(f!.sent_at).toBeUndefined();
    expect(sb.tabulky.invoice_items).toEqual([
      expect.objectContaining({ invoice_id: f!.id, name: "Plnenie podľa dokladu 2026030", total: 686, vat_rate: 0 }),
    ]);
    expect(sb.tabulky.invoice_attachments).toEqual([expect.objectContaining({ invoice_id: f!.id })]);
    expect(sb.tabulky.nespracovane_doklady).toEqual([]);
  });

  it("obsadené číslo odmietne a nič nezaloží", async () => {
    const r = nespracovany("2026030", { druh: "vydana" });
    const sb = falosnyKlient(
      { companies: [firma], nespracovane_doklady: [r], invoices: [faktura("f30", "2026030", 1)], invoice_items: [] },
      subor(r),
    );
    await expect(vytvorVydanu(sb, "u1", r, udaje)).rejects.toThrow("už vo Fakturácii je");
    expect(sb.tabulky.invoices).toHaveLength(1);
    expect(sb.tabulky.nespracovane_doklady).toHaveLength(1);
  });

  it("nečitateľný doklad odmietne s dôvodom", async () => {
    const r = nespracovany("2026018");
    const sb = falosnyKlient({ companies: [firma], nespracovane_doklady: [r], invoices: [] }, subor(r));
    await expect(vytvorVydanu(sb, "u1", r, nacitajUdaje(r.udaje))).rejects.toThrow("nemá čitateľné údaje");
    expect(sb.tabulky.invoices).toEqual([]);
  });

  it("keď sa súbor nepriloží, faktúra sa zruší", async () => {
    const r = nespracovany("2026030", { druh: "vydana" });
    const sb = falosnyKlient({ companies: [firma], nespracovane_doklady: [r], invoices: [], invoice_items: [], invoice_attachments: [] });
    await expect(vytvorVydanu(sb, "u1", r, udaje)).rejects.toThrow("nepodarilo načítať");
    expect(sb.tabulky.invoices).toEqual([]);
    expect(sb.tabulky.invoice_items).toEqual([]);
  });
});
