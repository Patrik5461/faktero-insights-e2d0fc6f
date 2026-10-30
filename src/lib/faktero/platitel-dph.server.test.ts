/**
 * Zápis overenia platiteľstva DPH — s podvrhnutým registrom a databázou v
 * pamäti. Overuje hlavné pravidlo: vyplnené nastavenie firmy sa nikdy
 * neprepíše, prázdne sa doplní, a história sa píše len pri zmene.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const registerFs = vi.hoisted(() => ({
  odpoved: {
    dphs: [] as any[],
    dphz: [] as any[],
    dphv: [] as any[],
    zoznamK: "2026-10-30",
  },
  chyba: null as string | null,
}));

vi.mock("./platitel-dph-fs.server", () => ({
  hladajVZoznamochFs: vi.fn(async () => {
    if (registerFs.chyba) throw new Error(registerFs.chyba);
    return registerFs.odpoved;
  }),
}));

import { overCakajuceFirmy, overFirmu, prevezmiZRegistra } from "./platitel-dph.server";

/** Najjednoduchšia náhrada supabase-js: select/eq/neq/order/limit/maybeSingle/update/insert/or. */
function pametovaDb(tabulky: Record<string, any[]>) {
  let id = 0;
  const from = (t: string) => {
    const filtre: ((r: any) => boolean)[] = [];
    let zoradenie: { stl: string; asc: boolean } | null = null;
    let limit = Infinity;
    let zmena: any = null;
    const riadky = () => {
      let r = (tabulky[t] ??= []).filter((x) => filtre.every((f) => f(x)));
      if (zoradenie) {
        const { stl, asc } = zoradenie;
        r = [...r].sort((a, b) => String(a[stl]).localeCompare(String(b[stl])) * (asc ? 1 : -1));
      }
      return r.slice(0, limit);
    };
    const q: any = {
      select: () => q,
      eq: (s: string, v: any) => (filtre.push((r) => r[s] === v), q),
      neq: (s: string, v: any) => (filtre.push((r) => r[s] !== v), q),
      or: () => q,
      order: (stl: string, o: any) => ((zoradenie ??= { stl, asc: o?.ascending !== false }), q),
      limit: (n: number) => ((limit = n), q),
      maybeSingle: async () => ({ data: riadky()[0] ?? null, error: null }),
      update: (z: any) => ((zmena = z), q),
      insert: async (r: any) => {
        (tabulky[t] ??= []).push({
          id: `r${++id}`,
          overene_at: new Date(Date.now() + id).toISOString(),
          ...r,
        });
        return { error: null };
      },
      then: (ok: any, zle: any) => {
        if (zmena) {
          for (const r of riadky()) Object.assign(r, zmena);
          return Promise.resolve({ error: null }).then(ok, zle);
        }
        return Promise.resolve({ data: riadky(), error: null }).then(ok, zle);
      },
    };
    return q;
  };
  return { from } as any;
}

const ESET = {
  icDph: "SK2020317068",
  ico: "31333532",
  nazov: "ESET",
  druh: "§4",
  datumReg: "11.10.2000",
  datumZmenyDruhu: null,
  platitelOd: "11.10.2000",
};

const firma = (o: any = {}) => ({
  id: "f1",
  name: "Firma",
  country: "SK",
  ico: "31333532",
  dic: null,
  ic_dph: null,
  vat_payer: false,
  vat_scheme: null,
  dph_auto_overenie: true,
  dph_overit_od: "2026-10-30T07:00:00Z",
  dph_overene_at: null,
  ...o,
});

beforeEach(() => {
  registerFs.odpoved = { dphs: [ESET], dphz: [], dphv: [], zoznamK: "2026-10-30" };
  registerFs.chyba = null;
});

describe("overFirmu", () => {
  it("prázdny režim doplní a zapíše dôkaz", async () => {
    const t = { companies: [firma()], dph_overenia: [] as any[] };
    const r = await overFirmu(pametovaDb(t), "f1", { sposob: "cron" });
    expect(r.porovnanie?.doplnit).toEqual({
      vat_scheme: "sk_4",
      vat_payer: true,
      ic_dph: "SK2020317068",
    });
    expect(t.companies[0]).toMatchObject({
      vat_scheme: "sk_4",
      vat_payer: true,
      ic_dph: "SK2020317068",
      dph_overit_od: null,
    });
    expect(t.companies[0].dph_overene_at).toBeTruthy();
    expect(t.dph_overenia).toHaveLength(1);
    expect(t.dph_overenia[0]).toMatchObject({
      zdroj: "fs_sk",
      stav: "platitel",
      schema: "sk_4",
      platne_od: "2000-10-11",
      zoznam_k: "2026-10-30",
      nesulad: null,
      sposob: "cron",
    });
    expect(t.dph_overenia[0].odpoved.dphs[0].druh).toBe("§4");
  });

  it("vyplnený režim neprepíše, zapíše nesúlad", async () => {
    const t = {
      companies: [firma({ vat_scheme: "sk_neplatitel", ic_dph: "SK2020317068" })],
      dph_overenia: [] as any[],
    };
    const r = await overFirmu(pametovaDb(t), "f1", { sposob: "cron" });
    expect(r.porovnanie).toEqual({ doplnit: null, nesulad: true });
    expect(t.companies[0]).toMatchObject({ vat_scheme: "sk_neplatitel", vat_payer: false });
    expect(t.dph_overenia[0].nesulad).toEqual({
      vat_payer: false,
      vat_scheme: "sk_neplatitel",
      ic_dph: "SK2020317068",
    });
  });

  it("opakované overenie s tým istým výsledkom nepridá riadok, zrušenie áno", async () => {
    const t = {
      companies: [firma({ vat_scheme: "sk_4", vat_payer: true, ic_dph: "SK2020317068" })],
      dph_overenia: [] as any[],
    };
    const db = pametovaDb(t);
    await overFirmu(db, "f1", { sposob: "cron" });
    await overFirmu(db, "f1", { sposob: "cron" });
    expect(t.dph_overenia).toHaveLength(1);

    registerFs.odpoved = {
      dphs: [],
      dphz: [],
      dphv: [
        {
          icDph: "SK2020317068",
          ico: "31333532",
          nazov: null,
          rokPorusenia: "2025",
          zverejnene: "01.06.2026",
          vymazane: "15.10.2026",
        },
      ],
      zoznamK: "2026-10-30",
    };
    const r = await overFirmu(db, "f1", { sposob: "cron" });
    expect(r.zmena).toBe("zrusenie");
    expect(t.dph_overenia).toHaveLength(2);
    expect(t.dph_overenia[1]).toMatchObject({
      stav: "neregistrovany",
      zmena: "zrusenie",
      predosla_schema: "sk_4",
      zrusene_od: "2026-10-15",
    });
    // Nastavenie firmy ostáva — zmena ide len do zvončeka a histórie.
    expect(t.companies[0]).toMatchObject({ vat_scheme: "sk_4", vat_payer: true });
  });

  it("výpadok registra: firma ostáva čakať, chyba sa zapíše raz", async () => {
    registerFs.chyba = "FS vrátila 503";
    const t = { companies: [firma()], dph_overenia: [] as any[] };
    const db = pametovaDb(t);
    await overFirmu(db, "f1", { sposob: "cron" });
    await overFirmu(db, "f1", { sposob: "cron" });
    expect(t.dph_overenia).toHaveLength(1);
    expect(t.dph_overenia[0].stav).toBe("chyba");
    expect(t.companies[0]).toMatchObject({
      vat_scheme: null,
      dph_overit_od: "2026-10-30T07:00:00Z",
    });
  });

  it("nanečisto nič nezapíše", async () => {
    const t = { companies: [firma()], dph_overenia: [] as any[] };
    const r = await overFirmu(pametovaDb(t), "f1", { sposob: "spatne", nanecisto: true });
    expect(r.porovnanie?.doplnit?.vat_scheme).toBe("sk_4");
    expect(t.companies[0].vat_scheme).toBeNull();
    expect(t.dph_overenia).toHaveLength(0);
  });

  it("firma bez IČO a IČ DPH sa len vyradí z čakania, bez záznamu", async () => {
    const t = { companies: [firma({ ico: null })], dph_overenia: [] as any[] };
    const r = await overFirmu(pametovaDb(t), "f1", { sposob: "cron" });
    expect(r.vysledok?.bezUdajov).toBe(true);
    expect(t.companies[0].dph_overit_od).toBeNull();
    expect(t.dph_overenia).toHaveLength(0);
  });

  it("nemecká firma sa len vyradí z čakania", async () => {
    const t = { companies: [firma({ country: "DE" })], dph_overenia: [] as any[] };
    const r = await overFirmu(pametovaDb(t), "f1", { sposob: "cron" });
    expect(r.vysledok).toBeNull();
    expect(t.companies[0].dph_overit_od).toBeNull();
    expect(t.dph_overenia).toHaveLength(0);
  });
});

describe("prevezmiZRegistra", () => {
  it("prepíše režim a zapíše, čo bolo predtým", async () => {
    const t = {
      companies: [firma({ vat_scheme: "sk_neplatitel", ic_dph: null })],
      dph_overenia: [] as any[],
    };
    await prevezmiZRegistra(pametovaDb(t), "f1", "u1");
    expect(t.companies[0]).toMatchObject({
      vat_scheme: "sk_4",
      vat_payer: true,
      ic_dph: "SK2020317068",
    });
    expect(t.dph_overenia[0]).toMatchObject({ sposob: "prevzatie", created_by: "u1" });
    expect(t.dph_overenia[0].doplnene.predtym.vat_scheme).toBe("sk_neplatitel");
  });

  it("neregistrovanej firme vymaže IČ DPH a predošlé zapíše do histórie", async () => {
    registerFs.odpoved = { dphs: [], dphz: [], dphv: [], zoznamK: "2026-10-30" };
    const t = {
      companies: [firma({ vat_scheme: "sk_4", vat_payer: true, ic_dph: "SK2020317068" })],
      dph_overenia: [] as any[],
    };
    const r = await prevezmiZRegistra(pametovaDb(t), "f1", "u1");
    expect(r.vymazaneIcDph).toBe("SK2020317068");
    expect(t.companies[0]).toMatchObject({
      vat_scheme: "sk_neplatitel",
      vat_payer: false,
      ic_dph: null,
    });
    expect(t.dph_overenia[0].doplnene).toMatchObject({
      ic_dph: null,
      vymazane_ic_dph: "SK2020317068",
      predtym: { ic_dph: "SK2020317068", vat_scheme: "sk_4" },
    });
  });
});

describe("overCakajuceFirmy", () => {
  it("prejde čakajúce firmy a spočíta výsledky", async () => {
    const t = {
      companies: [firma(), firma({ id: "f2", vat_scheme: "sk_neplatitel" })],
      dph_overenia: [] as any[],
    };
    const r = await overCakajuceFirmy(pametovaDb(t));
    expect(r).toMatchObject({ na_rade: 2, overene: 2, doplnene: 1, nesulad: 1, chyby: 0 });
  });
});
