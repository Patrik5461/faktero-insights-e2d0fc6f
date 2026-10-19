import { beforeEach, describe, expect, it, vi } from "vitest";

/* Napodobnený supabaseAdmin: firma, účet, RPC strážcu a dokončenie. */
const stav = vi.hoisted(() => ({
  firma: null as any,
  ucetVytvoreny: null as string | null,
  rezervacia: { ok: true, id: "r1" } as any,
  blok: { prave_pozastavene: false } as any,
  rpc: [] as Array<{ fn: string; args: any }>,
  dokoncene: [] as any[],
}));

vi.mock("@/integrations/supabase/client.server", () => {
  const supabaseAdmin = {
    from: (tabulka: string) => {
      if (tabulka === "companies") {
        const q: any = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: stav.firma, error: null }),
        };
        return q;
      }
      return {
        update: (z: any) => ({
          eq: async () => {
            stav.dokoncene.push(z);
            return { error: null };
          },
        }),
      };
    },
    rpc: async (fn: string, args: any) => {
      stav.rpc.push({ fn, args });
      return { data: fn === "odosielanie_rezervuj" ? stav.rezervacia : stav.blok, error: null };
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { created_at: stav.ucetVytvoreny, email: "x@firma.sk" } },
        }),
      },
    },
  };
  return { supabaseAdmin };
});

import {
  HLASKY,
  STROPY,
  jeZastavene,
  strazOdoslanie,
  stropyFirmy,
  upravAdresatov,
} from "./ochrana-odosielania.server";

const dniDozadu = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const zakladFirmy = (v: Partial<any> = {}) => ({
  id: "f1",
  name: "Moja firma s.r.o.",
  ico: "12345678",
  email: "info@mojafirma.sk",
  email_sender_name: null,
  website: "mojafirma.sk",
  created_at: dniDozadu(400),
  created_by: "u1",
  odosielanie_overene: false,
  odosielanie_pozastavene: false,
  ...v,
});

const odoslanie = (v: Partial<any> = {}) => ({
  companyId: "f1",
  userId: "u1",
  druh: "faktura" as const,
  dokladId: "d1",
  adresati: ["odberatel@firma.sk"],
  predmet: "Faktúra 2026001",
  sprava: "Dobrý deň, v prílohe posielame faktúru.",
  ...v,
});

async function chyba(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e as any;
  }
  return null;
}

beforeEach(() => {
  stav.firma = zakladFirmy();
  stav.ucetVytvoreny = dniDozadu(400);
  stav.rezervacia = { ok: true, id: "r1" };
  stav.blok = { prave_pozastavene: false };
  stav.rpc = [];
  stav.dokoncene = [];
});

describe("stropy", () => {
  it("nová firma vs. staršia vs. overená", () => {
    expect(stropyFirmy({ vekDni: 1, overena: false })).toMatchObject({
      nova: true,
      naMail: 3,
      zaDen: 10,
      zaHodinu: 30,
    });
    expect(stropyFirmy({ vekDni: 30, overena: false })).toMatchObject({
      nova: false,
      naMail: 20,
      zaDen: 200,
      zaHodinu: 30,
    });
    expect(stropyFirmy({ vekDni: 1, overena: true })).toMatchObject({
      nova: false,
      naMail: 20,
      zaDen: 200,
      zaHodinu: 300,
    });
  });
  it("adresáti bez duplicít a veľkých písmen", () => {
    expect(upravAdresatov([" A@b.sk", "a@B.sk", "", "c@d.sk"])).toEqual(["a@b.sk", "c@d.sk"]);
  });
  it("hláška pre novú firmu spomína 10 adresátov a podporu", () => {
    expect(HLASKY.novaDen).toContain("10 adresátom denne");
    expect(HLASKY.novaDen).toContain("podpora@faktero.sk");
  });
});

describe("strážca", () => {
  it("bežná faktúra staršej firmy prejde a zarezervuje sa so stropmi staršej firmy", async () => {
    const p = await strazOdoslanie(odoslanie());
    const rez = stav.rpc.find((r) => r.fn === "odosielanie_rezervuj")!;
    expect(rez.args).toMatchObject({ p_max_den: 200, p_max_doklad: 20, p_max_hodina: 30 });
    await p.hotovo(true);
    expect(stav.dokoncene).toEqual([{ stav: "odoslane" }]);
  });

  it("nový účet v starej firme má stropy novej firmy", async () => {
    stav.ucetVytvoreny = dniDozadu(1);
    await strazOdoslanie(odoslanie());
    const rez = stav.rpc.find((r) => r.fn === "odosielanie_rezervuj")!;
    expect(rez.args).toMatchObject({ p_max_den: 10, p_max_doklad: 3 });
  });

  it("pozastavená firma neodošle nič", async () => {
    stav.firma = zakladFirmy({ odosielanie_pozastavene: true });
    const e = await chyba(strazOdoslanie(odoslanie()));
    expect(jeZastavene(e)).toBe(true);
    expect(e.message).toBe(HLASKY.pozastavene);
    expect(stav.rpc).toEqual([]);
  });

  it("nová firma: 4 adresáti v jednom maile neprejdú", async () => {
    stav.firma = zakladFirmy({ created_at: dniDozadu(0) });
    const e = await chyba(
      strazOdoslanie(odoslanie({ adresati: ["a@x.sk", "b@x.sk", "c@x.sk", "d@x.sk"] })),
    );
    expect(e?.message).toBe(HLASKY.novaMail);
    expect(stav.rpc.map((r) => r.fn)).toEqual(["odosielanie_zapis_blok"]);
  });

  it("phishing z útoku sa zastaví a zapíše", async () => {
    stav.firma = zakladFirmy({ created_at: dniDozadu(0), name: "VlNTED" });
    const e = await chyba(strazOdoslanie(odoslanie({ predmet: "VlNTED Invoice No: #A21578" })));
    expect(e?.message).toBe(HLASKY.podvod);
    const blok = stav.rpc.find((r) => r.fn === "odosielanie_zapis_blok")!;
    expect(blok.args).toMatchObject({
      p_dovod: "maskovana_znacka",
      p_len_vystraha: false,
      p_prah: 3,
    });
    expect(stav.rpc.some((r) => r.fn === "odosielanie_rezervuj")).toBe(false);
  });

  it("značka v maili staršej firmy len zapíše výstrahu a mail odíde", async () => {
    await strazOdoslanie(odoslanie({ predmet: "Faktúra za prepravu DPD" }));
    const blok = stav.rpc.find((r) => r.fn === "odosielanie_zapis_blok")!;
    expect(blok.args).toMatchObject({ p_dovod: "znacka", p_len_vystraha: true });
    expect(stav.rpc.some((r) => r.fn === "odosielanie_rezervuj")).toBe(true);
  });

  it("denný strop z databázy → hláška pre novú firmu", async () => {
    stav.firma = zakladFirmy({ created_at: dniDozadu(2) });
    stav.rezervacia = { ok: false, dovod: "strop_den", pocet: 11 };
    const e = await chyba(strazOdoslanie(odoslanie()));
    expect(e?.message).toBe(HLASKY.novaDen);
  });

  it("hodinový prah pozastaví firmu", async () => {
    stav.rezervacia = { ok: false, dovod: "hodina", pocet: 31, prave_pozastavene: true };
    const e = await chyba(strazOdoslanie(odoslanie()));
    expect(e?.message).toBe(HLASKY.pozastavene);
  });

  it("chyba pri odoslaní uvoľní miesto v strope", async () => {
    const p = await strazOdoslanie(odoslanie());
    await p.hotovo(false);
    expect(stav.dokoncene).toEqual([{ stav: "zlyhalo" }]);
  });

  it("konštanty sedia so zadaním", () => {
    expect(STROPY).toMatchObject({
      NOVA_DNI: 7,
      NOVA_ZA_DEN: 10,
      NOVA_NA_MAIL: 3,
      NA_MAIL: 20,
      ZA_DEN: 200,
      ZA_HODINU: 30,
      ZA_HODINU_OVERENA: 300,
      BLOKOV_ZA_HODINU: 3,
    });
  });
});

describe("preklad hlášok", () => {
  it("každá hláška strážcu aj registrácie má nemecký preklad", async () => {
    const de = (await import("@/lib/i18n/de/ochrana-odosielania")).default as Record<
      string,
      string
    >;
    const { HLASKY_EMAILU } = await import("./overenie-emailu.server");
    for (const h of [...Object.values(HLASKY), ...Object.values(HLASKY_EMAILU)]) {
      if (h === "E-mailová adresa nie je platná.") continue; // preložená inde
      expect(de[h], h).toBeTruthy();
    }
  });
});
