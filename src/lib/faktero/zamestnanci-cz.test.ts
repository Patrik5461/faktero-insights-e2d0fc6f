import { describe, expect, it } from "vitest";
import {
  dvadsiatyNasledujuceho,
  koniecPoMesiacoch,
  kontrolaZmluvyCz,
  limitDppCz,
  minimalnaMzdaCz,
  overCisloUctuCz,
  overRodneCisloCz,
} from "./zamestnanci-cz";
import {
  druhyZmluv,
  hodnotyTokenov,
  kluceSablon,
  predvolenaSablona,
  pripomienkyZamestnancov,
  vyplnSablonu,
  type Zamestnanec,
  type Zmluva,
} from "./zamestnanci";
import { textPripomienky } from "./zamestnanci-texty";
import { textPripomienok } from "./zamestnanci-pripomienky.server";
import { nacitajSlovnik, preloz } from "@/lib/i18n/jazyk";

const jana: Zamestnanec = {
  id: "z1",
  first_name: "Jana",
  last_name: "Nováková",
  status: "active",
  start_date: "2026-11-10",
};

const zmluva = (x: Partial<Zmluva>): Zmluva => ({
  id: "k1",
  employee_id: "z1",
  kind: "pracovna_zmluva",
  start_date: "2026-11-10",
  status: "active",
  ...x,
});

describe("CZ rodné číslo (zák. 133/2000 Sb. § 13)", () => {
  it("platné desaťmiestne, muž aj žena (+50)", () => {
    // 736028/5163: 7360285163 % 11 = 0, žena (mesiac 60 → 10).
    expect(overRodneCisloCz("736028/5163")).toEqual({ ok: true, hodnota: "736028/5163" });
    expect(overRodneCisloCz(najdiPlatne("800101")).ok).toBe(true);
  });

  it("odmietne zlú deliteľnosť, mesiac aj deň", () => {
    expect(overRodneCisloCz("736028/5164").ok).toBe(false);
    expect(overRodneCisloCz("731328/5168").ok).toBe(false); // mesiac 13
    expect(overRodneCisloCz("730232/0000").ok).toBe(false); // 32. február
    expect(overRodneCisloCz("12345").ok).toBe(false);
  });

  it("+20/+70 len od roku 2004", () => {
    // 2005-03-15, muž s +20 → mesiac 23.
    const rc = najdiPlatne("052315");
    expect(overRodneCisloCz(rc).ok).toBe(true);
    // Rovnaký trik pre rok 1990 neplatí.
    const stare = najdiPlatne("902315");
    expect(overRodneCisloCz(stare).ok).toBe(false);
  });

  it("deväťmiestne len pred rokom 1954", () => {
    expect(overRodneCisloCz("520101/123").ok).toBe(true);
    expect(overRodneCisloCz("600101/123").ok).toBe(false);
  });
});

/** Doplní koncovku tak, aby bolo číslo deliteľné 11. */
function najdiPlatne(prefix: string): string {
  for (let i = 0; i < 10000; i++) {
    const s = `${prefix}${String(i).padStart(4, "0")}`;
    if (Number(s) % 11 === 0) return `${s.slice(0, 6)}/${s.slice(6)}`;
  }
  throw new Error("nenašlo sa");
}

describe("CZ číslo účtu (vyhláška 169/2011 Sb.)", () => {
  it("prijme platné s predčíslím aj bez", () => {
    expect(overCisloUctuCz("19-2000145399/0800")).toEqual({
      ok: true,
      hodnota: "19-2000145399/0800",
    });
    expect(overCisloUctuCz("2000145399/0800").ok).toBe(true);
  });
  it("odmietne zlý kontrolný súčet a tvar", () => {
    expect(overCisloUctuCz("19-2000145398/0800").ok).toBe(false);
    expect(overCisloUctuCz("18-2000145399/0800").ok).toBe(false);
    expect(overCisloUctuCz("2000145399").ok).toBe(false);
  });
  it("prijme IBAN s platným mod 97", () => {
    expect(overCisloUctuCz("CZ65 0800 0000 1920 0014 5399").ok).toBe(true);
    expect(overCisloUctuCz("CZ66 0800 0000 1920 0014 5399").ok).toBe(false);
  });
});

describe("CZ čísla podľa roka", () => {
  it("minimálna mzda a limit DPP", () => {
    expect(minimalnaMzdaCz(2026)).toEqual({ mesacne: 22_400, hodinovo: 134.4 });
    expect(minimalnaMzdaCz(2025).mesacne).toBe(20_800);
    expect(limitDppCz(2026)).toBe(12_000);
    expect(limitDppCz(2025)).toBe(11_500);
  });
  it("koniec skúšobnej doby a 20. deň nasledujúceho mesiaca", () => {
    expect(koniecPoMesiacoch("2026-01-01", 4)).toBe("2026-04-30");
    expect(koniecPoMesiacoch("2026-03-15", 4)).toBe("2026-07-14");
    expect(koniecPoMesiacoch("2026-10-31", 4)).toBe("2027-02-28");
    expect(dvadsiatyNasledujuceho("2026-12-05")).toBe("2027-01-20");
  });
});

describe("CZ kontrola zmluvy", () => {
  const texty = (x: Parameters<typeof kontrolaZmluvyCz>[0]) =>
    kontrolaZmluvyCz(x)
      .filter((u) => u.zavaznost === "warning")
      .map((u) => u.text);

  it("skúšobná doba nad 4 a nad 8 mesiacov", () => {
    expect(
      texty({ kind: "pracovna_zmluva", start_date: "2026-01-01", probation_end: "2026-04-30" }),
    ).toEqual([]);
    expect(
      texty({ kind: "pracovna_zmluva", start_date: "2026-01-01", probation_end: "2026-05-01" })[0],
    ).toMatch(/4 mesiace/);
    expect(
      texty({ kind: "pracovna_zmluva", start_date: "2026-01-01", probation_end: "2026-09-01" })[0],
    ).toMatch(/8 mesiacov/);
    expect(
      texty({ kind: "dovp", start_date: "2026-01-01", probation_end: "2026-02-01" })[0],
    ).toMatch(/DPP ani DPČ/);
  });

  it("minimálna mzda podľa úväzku a hodinová", () => {
    expect(
      texty({
        kind: "pracovna_zmluva",
        start_date: "2026-02-01",
        salary: 22_000,
        weekly_hours: 40,
      })[0],
    ).toMatch(/minimálna mzda/);
    expect(
      texty({
        kind: "pracovna_zmluva",
        start_date: "2026-02-01",
        salary: 11_200,
        weekly_hours: 20,
      }),
    ).toEqual([]);
    expect(
      texty({ kind: "dovp", start_date: "2026-02-01", salary: 120, salary_period: "hodinovo" })[0],
    ).toMatch(/Hodinová/);
  });

  it("DPČ nad polovicu úväzku a info o limite DPP", () => {
    expect(texty({ kind: "dopc", start_date: "2026-02-01", weekly_hours: 25 })[0]).toMatch(
      /polovicu/,
    );
    const info = kontrolaZmluvyCz({ kind: "dovp", start_date: "2026-02-01" }).find(
      (u) => u.zavaznost === "info",
    );
    expect(info?.params).toMatchObject({ hodin: 300, limit: "12 000", rok: 2026 });
  });
});

describe("CZ pripomienky", () => {
  it("ČSSZ: termín je deň nástupu, ukáže sa najskôr 8 dní vopred", () => {
    expect(
      pripomienkyZamestnancov("2026-11-01", [jana], [], "CZ").some(
        (p) => p.druh === "sp_prihlaska",
      ),
    ).toBe(false);
    const p = pripomienkyZamestnancov("2026-11-02", [jana], [], "CZ").find(
      (x) => x.druh === "sp_prihlaska",
    );
    expect(p?.termin).toBe("2026-11-10");
    expect(p?.krajina).toBe("CZ");
    expect(p?.nadpis).toBe("Registrácia zamestnanca na ČSSZ");
  });

  it("zdravotná poisťovňa: 8 dní, pri samých dohodách 20. deň nasledujúceho mesiaca", () => {
    const pp = pripomienkyZamestnancov("2026-11-10", [jana], [zmluva({})], "CZ").find(
      (x) => x.druh === "zp_prihlaska",
    );
    expect(pp?.termin).toBe("2026-11-18");
    const dpp = pripomienkyZamestnancov(
      "2026-12-10",
      [jana],
      [zmluva({ kind: "dovp" })],
      "CZ",
    ).find((x) => x.druh === "zp_prihlaska");
    expect(dpp?.termin).toBe("2026-12-20");
    expect(dpp?.lenDohoda).toBe(true);
  });

  it("odhlášky po skončení aj pri ukončenej karte, kým sa nezapíšu", () => {
    const koniec: Zamestnanec = {
      ...jana,
      status: "ended",
      start_date: "2026-01-05",
      end_date: "2026-10-31",
      sp_registered_at: "2026-01-02",
      zp_registered_at: "2026-01-06",
    };
    const p = pripomienkyZamestnancov("2026-11-05", [koniec], [], "CZ");
    expect(p.map((x) => [x.druh, x.termin])).toEqual([
      ["sp_odhlaska", "2026-11-08"],
      ["zp_odhlaska", "2026-11-08"],
    ]);
    const vybavene = pripomienkyZamestnancov(
      "2026-11-05",
      [{ ...koniec, sp_deregistered_at: "2026-11-03", zp_deregistered_at: "2026-11-03" }],
      [],
      "CZ",
    );
    expect(vybavene).toEqual([]);
    // Staré skončenie (nad 90 dní) už nesvieti.
    expect(pripomienkyZamestnancov("2027-03-01", [koniec], [], "CZ")).toEqual([]);
  });

  it("SK firma sa nemení: odhlášky nepozná, ukončenú kartu preskočí", () => {
    const koniec: Zamestnanec = { ...jana, status: "ended", end_date: "2026-10-31" };
    expect(pripomienkyZamestnancov("2026-11-05", [koniec], [])).toEqual([]);
    const sk = pripomienkyZamestnancov("2026-11-05", [jana], []).find(
      (x) => x.druh === "sp_prihlaska",
    );
    expect(sk?.termin).toBe("2026-11-09");
    expect(sk?.krajina).toBeUndefined();
  });

  it("text pripomienky po česky", async () => {
    await nacitajSlovnik("cs");
    const t = (s: string, p?: Record<string, string | number>) => preloz("cs", s, p);
    const p = pripomienkyZamestnancov("2026-11-05", [jana], [], "CZ").find(
      (x) => x.druh === "sp_prihlaska",
    )!;
    const { nadpis, text } = textPripomienky(p, t);
    expect(nadpis).toBe("Registrace zaměstnance na ČSSZ");
    expect(text).toBe(
      "Jana Nováková: přihlásit na ČSSZ nejpozději před nástupem 10. 11. 2026 — do 10. 11. 2026",
    );
    const mail = textPripomienok("QA Česká s.r.o.", [p], "CZ");
    expect(mail.text).toContain("pro firmu QA Česká s.r.o. je potřeba vyřídit:");
    expect(mail.html).toContain("<strong>QA Česká s.r.o.</strong>");
  });
});

describe("CZ zmluvy a šablóny", () => {
  it("bez brigádnickej dohody, s DPP a DPČ", () => {
    expect(Object.keys(druhyZmluv("CZ"))).toEqual(["pracovna_zmluva", "dovp", "dopc", "ina"]);
    expect(kluceSablon("CZ")).not.toContain("brigadnicka");
    expect(kluceSablon("SK")).toContain("brigadnicka");
  });

  it("česká pracovná zmluva s českými tokenmi", () => {
    const text = vyplnSablonu(
      predvolenaSablona("pracovna_zmluva", "CZ"),
      hodnotyTokenov({
        firma: { name: "QA Česká s.r.o.", ico: "12345678", city: "Praha" },
        zamestnanec: jana,
        zmluva: zmluva({
          end_date: "2027-11-09",
          weekly_hours: 40,
          salary: 30_000,
          currency: "CZK",
        }),
        dnes: "2026-11-01",
        krajina: "CZ",
      }),
    );
    expect(text).toContain("PRACOVNÍ SMLOUVA");
    expect(text).toContain("zákona č. 262/2006 Sb.");
    expect(text).toContain("na dobu určitou do 9. 11. 2027");
    expect(text).toContain("40 hodin týdně");
    expect(text).toMatch(/30\s000,00\s+Kč měsíčně/);
    expect(text).toContain("V Praha dne 1. 11. 2026");
  });
});
