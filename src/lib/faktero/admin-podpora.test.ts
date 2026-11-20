/*
  Nástroje podpory v administrácii — stráže, audit a prehľad bánk.
  Všetky údaje sú vymyslené.
*/
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  overSuperadminaPodpory,
  zrusDvojfaktorUctu,
  zmenEmailUctu,
  normalizujEmail,
} from "./admin-podpora-ucty.server";
import { filtrujBanky, poctyStavov, stavPripojenia, zostavPrehladBank } from "./admin-banky";

const ADMIN = "00000000-0000-4000-8000-00000000000a";
const INY_ADMIN = "00000000-0000-4000-8000-00000000000b";
const POUZIVATEL = "00000000-0000-4000-8000-000000000001";
const CUDZI = "00000000-0000-4000-8000-000000000002";

type Stav = {
  admini: Record<string, string>;
  profily: Record<string, { id: string; email: string | null; full_name: string | null }>;
  faktory: Record<string, Array<{ id: string; factor_type: string; status: string }>>;
  authEmaily: Record<string, string>;
};

/** Malý podvrh klienta Supabase — len to, čo moduly naozaj volajú. */
function falosnaDb(stav: Stav) {
  const audit: any[] = [];
  const zapisy: Array<{ tabulka: string; data: any }> = [];
  const zmazaneFaktory: string[] = [];
  const authUpdate: any[] = [];

  function dotaz(tabulka: string) {
    const f: Record<string, any> = {};
    let rezim: "select" | "update" = "select";
    let data: any = null;
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => ((f[k] = v), q),
      neq: (k: string, v: any) => ((f["!" + k] = v), q),
      ilike: (k: string, v: any) => ((f[k] = String(v).toLowerCase()), q),
      is: () => q,
      limit: () => q,
      update: (d: any) => ((rezim = "update"), (data = d), q),
      insert: (d: any) => {
        if (tabulka === "platform_audit_logs") audit.push(d);
        return Promise.resolve({ error: null });
      },
      maybeSingle: () => {
        if (tabulka === "platform_admins") {
          const r = stav.admini[f.user_id];
          return Promise.resolve({ data: r ? { role: r, user_id: f.user_id } : null, error: null });
        }
        if (tabulka === "profiles") return Promise.resolve({ data: stav.profily[f.id] ?? null, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      then: (ok: any, zle: any) => {
        let vysledok: any = { data: [], error: null };
        if (rezim === "update") {
          zapisy.push({ tabulka, data });
          if (tabulka === "profiles" && stav.profily[f.id]) stav.profily[f.id].email = data.email;
        } else if (tabulka === "profiles" && f.email) {
          vysledok = {
            data: Object.values(stav.profily).filter(
              (p) => (p.email ?? "").toLowerCase() === f.email && p.id !== f["!id"],
            ),
            error: null,
          };
        }
        return Promise.resolve(vysledok).then(ok, zle);
      },
    };
    return q;
  }

  const db = {
    from: dotaz,
    rpc: (meno: string, args: any) =>
      Promise.resolve({
        data: meno === "pouzivatel_podla_emailu" ? (stav.authEmaily[args.p_email] ?? null) : null,
        error: null,
      }),
    auth: {
      admin: {
        mfa: {
          listFactors: ({ userId }: any) =>
            Promise.resolve({ data: { factors: stav.faktory[userId] ?? [] }, error: null }),
          deleteFactor: ({ id }: any) => {
            zmazaneFaktory.push(id);
            return Promise.resolve({ data: { id }, error: null });
          },
        },
        updateUserById: (id: string, attrs: any) => {
          authUpdate.push({ id, attrs });
          return Promise.resolve({ data: {}, error: null });
        },
      },
    },
  };
  return { db, audit, zapisy, zmazaneFaktory, authUpdate };
}

function zaklad(): Stav {
  return {
    admini: { [ADMIN]: "superadmin", [INY_ADMIN]: "admin" },
    profily: {
      [POUZIVATEL]: { id: POUZIVATEL, email: "jana@priklad.test", full_name: "Jana Vzorová" },
      [CUDZI]: { id: CUDZI, email: "obsadeny@priklad.test", full_name: null },
      [INY_ADMIN]: { id: INY_ADMIN, email: "admin2@priklad.test", full_name: null },
    },
    faktory: {
      [POUZIVATEL]: [{ id: "f-1", factor_type: "totp", status: "verified" }],
      [INY_ADMIN]: [{ id: "f-9", factor_type: "totp", status: "verified" }],
    },
    authEmaily: { "obsadeny@priklad.test": CUDZI, "jana@priklad.test": POUZIVATEL },
  };
}

describe("overSuperadminaPodpory", () => {
  it("odmietne účet mimo platform_admins", async () => {
    const { db } = falosnaDb(zaklad());
    await expect(overSuperadminaPodpory(db, POUZIVATEL, () => {})).rejects.toThrow(/nie ste administrátor/);
  });
  it("odmietne bežného admina (len superadmin)", async () => {
    const { db } = falosnaDb(zaklad());
    await expect(overSuperadminaPodpory(db, INY_ADMIN, () => {})).rejects.toThrow(/len superadmin/);
  });
  it("vyžaduje aal2 aj od superadmina", async () => {
    const { db } = falosnaDb(zaklad());
    const aal = vi.fn(() => {
      throw new Error("Forbidden: aal2");
    });
    await expect(overSuperadminaPodpory(db, ADMIN, aal)).rejects.toThrow(/aal2/);
    expect(aal).toHaveBeenCalled();
  });
  it("pustí superadmina s aal2", async () => {
    const { db } = falosnaDb(zaklad());
    await expect(overSuperadminaPodpory(db, ADMIN, () => {})).resolves.toBeUndefined();
  });
});

describe("zrušenie dvojfaktorového overenia", () => {
  it("zmaže faktory, zapíše audit a pošle oznámenie", async () => {
    const { db, audit, zmazaneFaktory } = falosnaDb(zaklad());
    const posli = vi.fn(async () => {});
    const v = await zrusDvojfaktorUctu(db, {
      adminId: ADMIN,
      userId: POUZIVATEL,
      dovod: "P-0001 stratený telefón, overené IČO",
      upozornit: true,
      posli,
    });
    expect(v).toEqual({ zmazanych: 1, upozornenie: "odoslane" });
    expect(zmazaneFaktory).toEqual(["f-1"]);
    expect(posli).toHaveBeenCalledTimes(1);
    expect((posli.mock.calls[0] as any)[0].to).toBe("jana@priklad.test");
    const akcie = audit.map((a) => a.action);
    expect(akcie).toEqual(["zrusenie_2fa", "zrusenie_2fa_hotovo"]);
    expect(audit[0]).toMatchObject({
      admin_user_id: ADMIN,
      entity_type: "user",
      entity_id: POUZIVATEL,
      metadata: { dovod: "P-0001 stratený telefón, overené IČO" },
    });
  });

  it("na účte administrátora platformy nič nezmení", async () => {
    const { db, audit, zmazaneFaktory } = falosnaDb(zaklad());
    await expect(
      zrusDvojfaktorUctu(db, { adminId: ADMIN, userId: INY_ADMIN, dovod: "skúška stráže", upozornit: false }),
    ).rejects.toThrow(/administrátora platformy/);
    expect(zmazaneFaktory).toEqual([]);
    expect(audit).toEqual([]);
  });

  it("vlastný účet ani bez dôvodu nejde", async () => {
    const { db } = falosnaDb(zaklad());
    await expect(
      zrusDvojfaktorUctu(db, { adminId: ADMIN, userId: ADMIN, dovod: "vlastný účet", upozornit: false }),
    ).rejects.toThrow(/vlastnom účte/);
    await expect(
      zrusDvojfaktorUctu(db, { adminId: ADMIN, userId: POUZIVATEL, dovod: " ", upozornit: false }),
    ).rejects.toThrow(/dôvod/);
  });

  it("účet bez 2FA vráti chybu bez auditu", async () => {
    const s = zaklad();
    s.faktory[POUZIVATEL] = [];
    const { db, audit } = falosnaDb(s);
    await expect(
      zrusDvojfaktorUctu(db, { adminId: ADMIN, userId: POUZIVATEL, dovod: "P-0002 telefón", upozornit: false }),
    ).rejects.toThrow(/nemá zapnuté/);
    expect(audit).toEqual([]);
  });
});

describe("zmena e-mailu účtu", () => {
  it("zmení auth aj profil, zapíše audit a oznámi starej aj novej adrese", async () => {
    const { db, audit, authUpdate, zapisy } = falosnaDb(zaklad());
    const posli = vi.fn(async () => {});
    const v = await zmenEmailUctu(db, {
      adminId: ADMIN,
      userId: POUZIVATEL,
      novyEmail: "  Jana.Nova@Priklad.test ",
      dovod: "P-0003 stratená schránka, totožnosť cez faktúru",
      totoznostOverena: true,
      posli,
    });
    expect(v.novy).toBe("jana.nova@priklad.test");
    expect(authUpdate).toEqual([
      { id: POUZIVATEL, attrs: { email: "jana.nova@priklad.test", email_confirm: true } },
    ]);
    expect(zapisy.find((z) => z.tabulka === "profiles")?.data).toEqual({ email: "jana.nova@priklad.test" });
    expect(posli.mock.calls.map((c: any) => c[0].to).sort()).toEqual([
      "jana.nova@priklad.test",
      "jana@priklad.test",
    ]);
    expect(audit.map((a) => a.action)).toEqual(["zmena_emailu", "zmena_emailu_hotovo"]);
    expect(audit[0].metadata).toMatchObject({ stary: "jana@priklad.test", novy: "jana.nova@priklad.test" });
  });

  it("obsadený e-mail, admin a neoverená totožnosť neprejdú", async () => {
    const { db, authUpdate } = falosnaDb(zaklad());
    const o = { adminId: ADMIN, userId: POUZIVATEL, dovod: "P-0004 zmena", totoznostOverena: true };
    await expect(zmenEmailUctu(db, { ...o, novyEmail: "obsadeny@priklad.test" })).rejects.toThrow(/iný účet/);
    await expect(
      zmenEmailUctu(db, { ...o, userId: INY_ADMIN, novyEmail: "x@priklad.test" }),
    ).rejects.toThrow(/administrátora platformy/);
    await expect(
      zmenEmailUctu(db, { ...o, totoznostOverena: false, novyEmail: "x@priklad.test" }),
    ).rejects.toThrow(/totožnosť/);
    await expect(zmenEmailUctu(db, { ...o, novyEmail: "jana@priklad.test" })).rejects.toThrow(/rovnaký/);
    expect(authUpdate).toEqual([]);
  });

  it("tvar e-mailu", () => {
    expect(() => normalizujEmail("bez-zavinaca")).toThrow();
    expect(() => normalizujEmail("a@b")).toThrow();
    expect(normalizujEmail(" A@B.SK ")).toBe("a@b.sk");
  });
});

describe("prehľad bankových pripojení", () => {
  const teraz = new Date("2026-11-20T10:00:00Z");
  const firmy = [
    { id: "c1", name: "Alfa s.r.o.", ico: "11111111", testovacia_pre: null },
    { id: "c2", name: "Beta s.r.o.", ico: null, testovacia_pre: null },
    { id: "c3", name: "Alfa (test)", ico: null, testovacia_pre: "c1" },
    { id: "c4", name: "Gama s.r.o.", ico: null, testovacia_pre: null },
  ];
  const pripojenia = [
    { id: "p1", company_id: "c1", provider: "tatrabanka", status: "connected", last_synced_at: "2026-11-20T08:00:00Z", created_at: null },
    { id: "p2", company_id: "c2", provider: "tatrabanka", status: "connected", last_synced_at: "2026-11-20T08:00:00Z", created_at: null },
    { id: "p3", company_id: "c3", provider: "wise", status: "connected", last_synced_at: null, created_at: null },
    { id: "p4", company_id: "c4", provider: "email", status: "connected", last_synced_at: null, created_at: null, banka: "VÚB" },
    { id: "p5", company_id: "c4", provider: "tatrabanka", status: "pending", last_synced_at: null, created_at: null },
  ];
  const u = (o: any) => ({
    iban: null,
    last_synced_at: null,
    pohyby_ok_at: null,
    pohyby_chyba: null,
    pohyby_chyba_suhlas: null,
    unavailable_since: null,
    unavailable_reason: null,
    ...o,
  });
  const ucty = [
    u({ bank_connection_id: "p1", pohyby_ok_at: "2026-11-20T08:00:00Z" }),
    u({ bank_connection_id: "p1", pohyby_ok_at: "2026-08-01T08:00:00Z", pohyby_chyba: "Súhlas banky na čítanie pohybov vypršal", pohyby_chyba_suhlas: "s-1" }),
    u({ bank_connection_id: "p2", pohyby_ok_at: "2026-11-10T08:00:00Z", pohyby_chyba: "Banka je dočasne nedostupná (503)" }),
    u({ bank_connection_id: "p3", pohyby_ok_at: "2026-11-19T08:00:00Z" }),
    u({ bank_connection_id: "p4", pohyby_ok_at: "2026-11-20T07:00:00Z" }),
  ];
  const riadky = zostavPrehladBank(pripojenia, ucty, firmy, teraz);

  it("mapuje stav, počty účtov, najstaršie pohyby a chyby", () => {
    const p1 = riadky.find((r) => r.id === "p1")!;
    expect(p1).toMatchObject({ firma: "Alfa s.r.o.", banka: "Tatra banka", stav: "suhlas", uctov: 2 });
    expect(p1.poslednePohyby).toBe("2026-08-01T08:00:00Z");
    expect(p1.chyby).toHaveLength(1);
    expect(riadky.find((r) => r.id === "p2")!.stav).toBe("chyba");
    expect(riadky.find((r) => r.id === "p3")!).toMatchObject({ stav: "ok", testovacia: true });
    expect(riadky.find((r) => r.id === "p4")!.banka).toContain("VÚB");
    expect(riadky.find((r) => r.id === "p5")!).toMatchObject({ stav: "caka", uctov: 0, poslednePohyby: null });
  });

  it("filtre a testovacie firmy", () => {
    const vsetky = filtrujBanky(riadky, { filter: "vsetky", sTestovacimi: false });
    expect(vsetky.map((r) => r.id)).not.toContain("p3");
    expect(filtrujBanky(riadky, { filter: "ok", sTestovacimi: true }).map((r) => r.id).sort()).toEqual(["p3", "p4"]);
    expect(filtrujBanky(riadky, { filter: "suhlas", sTestovacimi: false }).map((r) => r.id)).toEqual(["p1"]);
    expect(filtrujBanky(riadky, { filter: "chyba", sTestovacimi: false }).map((r) => r.id)).toEqual(["p2"]);
    expect(poctyStavov(vsetky)).toMatchObject({ suhlas: 1, chyba: 1, ok: 1, caka: 1 });
  });

  it("zoradí od najstarších pohybov, bez pohybov úplne hore", () => {
    const ids = filtrujBanky(riadky, { filter: "vsetky", sTestovacimi: false }).map((r) => r.id);
    expect(ids).toEqual(["p5", "p1", "p2", "p4"]);
  });

  it("krátky výpadok banky (do 48 h) ešte nie je chyba", () => {
    expect(
      stavPripojenia({ status: "connected" }, [u({ bank_connection_id: "x", pohyby_ok_at: "2026-11-20T01:00:00Z", pohyby_chyba: "503" })], teraz),
    ).toBe("ok");
  });

  it("serverová funkcia nikdy nečíta celé metadata pripojenia (súkromné kľúče)", () => {
    const s = readFileSync(join(__dirname, "admin-podpora.functions.ts"), "utf8");
    const blok = s.slice(s.indexOf('.from("bank_connections")'));
    const select = /\.select\("([^"]+)"\)/.exec(blok)![1];
    expect(select).not.toMatch(/(^|,\s*)metadata(\s*,|$)/);
    expect(select).not.toMatch(/access_token|refresh_token|\*/);
  });
});
