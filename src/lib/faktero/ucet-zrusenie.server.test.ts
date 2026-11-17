import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Zrušenie účtu s testovacou firmou. Supabase je falošný: tabuľky sú polia,
  filtre eq/in/is sa naozaj uplatnia, RPC a mazanie súborov sa zaznamenávajú.
*/

const db = vi.hoisted(() => ({
  tabulky: {} as Record<string, Record<string, unknown>[]>,
  subory: {} as Record<string, string[]>,
  udalosti: [] as string[],
}));

vi.mock("@/integrations/supabase/client.server", () => {
  function dotaz(tabulka: string) {
    const filtre: ((r: Record<string, unknown>) => boolean)[] = [];
    let mazat = false;
    const hodnota = (r: Record<string, unknown>, stlpec: string) => {
      // `companies.testovacia_pre` pri vnorenom výbere — tu stačí plochý stĺpec.
      const [prvy, druhy] = stlpec.split(".");
      return druhy ? (r[prvy] as any)?.[druhy] : r[prvy];
    };
    const vysledok = () => {
      const riadky = (db.tabulky[tabulka] ?? []).filter((r) => filtre.every((f) => f(r)));
      if (mazat) {
        db.tabulky[tabulka] = (db.tabulky[tabulka] ?? []).filter((r) => !riadky.includes(r));
        db.udalosti.push(`delete:${tabulka}`);
        return { data: null, error: null, count: riadky.length };
      }
      return { data: riadky, error: null };
    };
    const q: any = {
      select: () => q,
      order: () => q,
      limit: () => q,
      range: () => q,
      update: () => q,
      delete: () => {
        mazat = true;
        return q;
      },
      eq: (s: string, v: unknown) => (filtre.push((r) => hodnota(r, s) === v), q),
      in: (s: string, v: unknown[]) => (filtre.push((r) => v.includes(hodnota(r, s))), q),
      is: (s: string, v: unknown) => (filtre.push((r) => (hodnota(r, s) ?? null) === v), q),
      maybeSingle: async () => {
        const r = vysledok();
        return { data: (r.data as any[])?.[0] ?? null, error: null };
      },
      then: (ok: (v: unknown) => unknown, zle?: (e: unknown) => unknown) =>
        Promise.resolve(vysledok()).then(ok, zle),
    };
    return q;
  }
  return {
    supabaseAdmin: {
      from: dotaz,
      rpc: async (meno: string, args: { _company_id: string }) => {
        db.udalosti.push(`rpc:${meno}:${args._company_id}`);
        return { error: null };
      },
      storage: {
        from: (bucket: string) => ({
          list: async (prefix: string) => {
            if (prefix.includes("/")) return { data: [], error: null };
            const mena = bucket === "invoice-pdfs" ? (db.subory[prefix] ?? []) : [];
            return { data: mena.map((name) => ({ name, id: `${prefix}-${name}` })), error: null };
          },
          remove: async (cesty: string[]) => {
            db.udalosti.push(`subory:${cesty.join(",")}`);
            return { error: null };
          },
        }),
      },
      auth: {
        admin: {
          deleteUser: async (id: string) => {
            db.udalosti.push(`deleteUser:${id}`);
            return { error: null };
          },
        },
      },
    },
  };
});

import { firmyNaZmazanie, testovaciaFirmaRodica, zrusUcet } from "./ucet-zrusenie.server";

beforeEach(() => {
  db.udalosti = [];
  db.subory = { sama: ["a.pdf"], "test-sama": ["t.pdf"], zdielana: ["z.pdf"] };
  db.tabulky = {
    companies: [
      { id: "sama", name: "Sama s.r.o.", testovacia_pre: null },
      { id: "test-sama", name: "Test – Sama s.r.o.", testovacia_pre: "sama" },
      { id: "zdielana", name: "Zdieľaná a.s.", testovacia_pre: null },
      { id: "test-zdielana", name: "Test – Zdieľaná a.s.", testovacia_pre: "zdielana" },
    ],
    company_users: [
      { company_id: "sama", user_id: "ja" },
      { company_id: "test-sama", user_id: "ja" },
      { company_id: "zdielana", user_id: "ja" },
      { company_id: "zdielana", user_id: "kolega" },
      { company_id: "test-zdielana", user_id: "ja" },
      { company_id: "test-zdielana", user_id: "kolega" },
    ],
  };
});

describe("firmyNaZmazanie", () => {
  it("vráti len skutočnú firmu, kde je človek sám — testovaciu nie", async () => {
    expect(await firmyNaZmazanie("ja")).toEqual([{ id: "sama", name: "Sama s.r.o." }]);
  });
});

describe("testovaciaFirmaRodica", () => {
  it("nájde testovaciu firmu rodiča, inak null", async () => {
    expect(await testovaciaFirmaRodica("sama")).toBe("test-sama");
    expect(await testovaciaFirmaRodica("test-sama")).toBeNull();
  });
});

describe("zrusUcet", () => {
  it("zmaže súbory testovacej firmy aj rodiča, RPC volá len na rodiča", async () => {
    const v = await zrusUcet("ja");
    expect(v.zmazaneFirmy).toEqual(["Sama s.r.o."]);
    expect(v.zmazaneSubory).toBe(2);
    const rpc = db.udalosti.filter((u) => u.startsWith("rpc:"));
    expect(rpc).toEqual(["rpc:faktero_zmaz_firmu:sama"]);
    // Súbory testovacej firmy idú preč pred RPC rodiča; súbory zdieľanej firmy ostávajú.
    const poradie = db.udalosti.filter((u) => u.startsWith("subory:") || u.startsWith("rpc:"));
    expect(poradie).toEqual([
      "subory:test-sama/t.pdf",
      "subory:sama/a.pdf",
      "rpc:faktero_zmaz_firmu:sama",
    ]);
    expect(db.udalosti).toContain("deleteUser:ja");
  });
});
