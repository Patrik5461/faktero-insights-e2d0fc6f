import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AKCIE,
  KOTVY,
  SLOVA,
  VYRADENE,
  funkciePreKontext,
  hladajFunkcie,
  katalogFunkcii,
  skoreFunkcie,
  type Funkcia,
  type KontextFunkcii,
} from "./hladanie-funkcie";
import { TRASY_APLIKACIE } from "./hlas-trasy.gen";
import { NADPISY_POMOCI } from "./pomoc-nadpisy.gen";
import znalosti from "./znalosti-manualy.json";

const KOREN = join(__dirname, "../../..");

const MAJITEL: KontextFunkcii = {
  isCompanyAdmin: true,
  krajina: "SK",
  rola: "owner",
  opravnenia: null,
  adminPlatformy: false,
  modulZamestnanci: true,
  knihaJazd: true,
};

const odkaz = (f: Funkcia) =>
  `${f.odkaz.to}${f.odkaz.search ? `?${new URLSearchParams(f.odkaz.search)}` : ""}${f.odkaz.hash ? `#${f.odkaz.hash}` : ""}`;

/** Odkazy prvých výsledkov skupiny „Funkcie a nastavenia“. */
function prve(dotaz: string, k: KontextFunkcii = MAJITEL, n = 3): string[] {
  return hladajFunkcie(funkciePreKontext(k), dotaz).funkcie.slice(0, n).map(odkaz);
}

describe("hľadanie funkcií — katalóg", () => {
  const k = katalogFunkcii();

  it("bez detailov s parametrom, presmerovaní a technických stránok", () => {
    for (const f of k) {
      expect(f.odkaz.to).not.toContain("$");
      expect(VYRADENE.has(f.odkaz.to)).toBe(false);
      // Meno z adresy („sklad › inventura“) by v hľadaní pôsobilo ako chyba.
      expect(f.nazov).not.toContain(" › ");
    }
  });

  it("každý odkaz vedie na existujúcu trasu (aplikácia, admin alebo /pomoc)", () => {
    const trasy = new Set<string>(TRASY_APLIKACIE);
    for (const f of k) {
      const to = f.odkaz.to;
      if (f.druh === "admin") expect(to.startsWith("/admin")).toBe(true);
      else if (to.startsWith("/pomoc/"))
        expect(existsSync(join(KOREN, "src/routes", `${to.slice(1).replace(/\//g, ".")}.tsx`))).toBe(true);
      else expect(trasy.has(to)).toBe(true);
    }
  });

  it("kotvy (#…) na stránkach naozaj sú", () => {
    const zdroj: Record<string, string> = {
      "/firma": readFileSync(join(KOREN, "src/routes/_authenticated/firma.tsx"), "utf8"),
      "/nastavenia": readFileSync(join(KOREN, "src/routes/_authenticated/nastavenia.index.tsx"), "utf8"),
    };
    const kotvy = [...KOTVY.map((x) => ({ to: x.to, hash: x.hash })), ...AKCIE.filter((a) => a.hash)];
    for (const x of kotvy) {
      expect(zdroj[x.to], x.to).toBeDefined();
      expect(zdroj[x.to]).toContain(`id="${x.hash}"`);
    }
  });

  it("každé slovo v SLOVA patrí k funkcii, ktorá v katalógu je", () => {
    const kluce = new Set(k.map((f) => f.kluc));
    for (const kl of Object.keys(SLOVA)) expect(kluce.has(kl), kl).toBe(true);
  });

  it("akcie nahrádzajú tú istú stránku — nie sú v zozname dvakrát", () => {
    expect(k.find((f) => f.kluc === "/doklady/novy")).toBeUndefined();
    expect(k.find((f) => f.kluc === "akcia:nahrat-doklad")?.odkaz.to).toBe("/doklady/novy");
    expect(k.find((f) => f.kluc === "/faktury/nova")).toBeUndefined();
  });

  it("nadpisy pomoci sedia so znalosťami (inak spusti npm run znalosti)", () => {
    const zo = (znalosti as { clanky: { cesta: string; titulok: string; sekcie: { nadpis: string }[] }[] })
      .clanky;
    expect(NADPISY_POMOCI.map((c) => c.cesta)).toEqual(zo.map((c) => c.cesta));
    for (const [i, c] of NADPISY_POMOCI.entries()) {
      expect(c.titulok).toBe(zo[i].titulok);
      expect(c.sekcie.map((s) => s.nadpis)).toEqual(zo[i].sekcie.map((s) => s.nadpis));
    }
    // Kotvy manuálov sú `id` sekcií — napr. dvojfaktor v Zabezpečení účtu.
    const zab = NADPISY_POMOCI.find((c) => c.cesta === "/pomoc/zabezpecenie");
    expect(zab?.sekcie.some((s) => s.id === "dvojfaktor")).toBe(true);
  });
});

describe("hľadanie funkcií — kto čo vidí", () => {
  it("administrácia len administrátorovi platformy", () => {
    expect(funkciePreKontext(MAJITEL).some((f) => f.odkaz.to.startsWith("/admin"))).toBe(false);
    const admin = funkciePreKontext({ ...MAJITEL, adminPlatformy: true });
    expect(admin.some((f) => f.odkaz.to === "/admin/users" && f.druh === "admin")).toBe(true);
    expect(prve("audit log", { ...MAJITEL, adminPlatformy: true }, 1)).toEqual(["/admin/audit-log"]);
    expect(prve("audit log", MAJITEL, 1)).toEqual([]);
  });

  it("správcovské položky (API kľúče, pozvanie) nie bežnému členovi", () => {
    const clen = { ...MAJITEL, isCompanyAdmin: false, rola: "employee" };
    const kluce = new Set(funkciePreKontext(clen).map((f) => f.kluc));
    expect(kluce.has("/api-kluce")).toBe(false);
    expect(kluce.has("akcia:pozvat")).toBe(false);
    expect(kluce.has("/nastavenia/vzhlad-faktury")).toBe(false);
    expect(kluce.has("/nastavenia/schvalovanie")).toBe(true);
    const majitel = new Set(funkciePreKontext(MAJITEL).map((f) => f.kluc));
    expect(majitel.has("/api-kluce")).toBe(true);
    expect(majitel.has("akcia:pozvat")).toBe(true);
  });

  it("vlastný prístup: oblasť bez práva sa nenájde", () => {
    const len = { ...MAJITEL, isCompanyAdmin: false, rola: "custom", opravnenia: { faktury: "edit" } };
    const kluce = new Set(funkciePreKontext(len).map((f) => f.kluc));
    expect(kluce.has("/bankove-ucty")).toBe(false);
    expect(kluce.has("akcia:nahrat-doklad")).toBe(false);
    expect(kluce.has("akcia:nova-faktura")).toBe(true);
  });

  it("krajina, modul Zamestnanci a Kniha jázd ako v menu", () => {
    const cz = new Set(funkciePreKontext({ ...MAJITEL, krajina: "CZ" }).map((f) => f.odkaz.to));
    expect(cz.has("/efaktura")).toBe(false);
    expect(cz.has("/pokladna")).toBe(false);
    expect(cz.has("/pomoc/nemecko")).toBe(false);
    expect(funkciePreKontext({ ...MAJITEL, krajina: "DE" }).some((f) => f.odkaz.to === "/pomoc/nemecko")).toBe(true);
    const bez = funkciePreKontext({ ...MAJITEL, modulZamestnanci: false, knihaJazd: false });
    expect(bez.some((f) => f.odkaz.to.startsWith("/zamestnanci"))).toBe(false);
    expect(bez.some((f) => f.odkaz.to.startsWith("/jazdy"))).toBe(false);
  });
});

describe("hľadanie funkcií — Patrikove príklady", () => {
  it.each([
    ["schvaľovanie", "/nastavenia/schvalovanie"],
    ["schvalovanie", "/nastavenia/schvalovanie"],
    ["schválenie", "/schvalovanie"],
    ["predkontácie", "/uctovnictvo/predkontacie"],
    ["bankový účet", "/bankove-ucty"],
    ["IBAN", "/bankove-ucty"],
    ["logo", "/nastavenia/vzhlad-faktury"],
    ["pečiatka", "/nastavenia/vzhlad-faktury"],
    ["upomienky", "/faktury/upomienky"],
    ["eFaktúra", "/efaktura"],
    ["efaktura", "/efaktura"],
    ["export pohoda", "/exporty"],
    ["mostík", "/uctovnictvo/pohoda"],
    ["dvojfaktor", "/nastavenia/zabezpecenie"],
    ["2FA", "/nastavenia/zabezpecenie"],
    ["heslo", "/nastavenia/zabezpecenie"],
    ["pozvať", "/firma#pouzivatelia"],
    ["číselný rad", "/ciselne-rady"],
    ["číslovanie", "/ciselne-rady"],
    ["IČO", "/firma"],
    ["automatické účtovanie", "/uctovnictvo/zauctovanie"],
    ["kniha jázd", "/jazdy"],
    ["predplatné", "/predplatne"],
    ["API kľúč", "/api-kluce"],
    ["webhooky", "/webhooky"],
    ["šablóny e-mailov", "/nastavenia/email-sablony"],
    ["nahrať doklad", "/doklady/novy"],
    ["nová faktúra", "/faktury/nova"],
    ["nová prijatá", "/prijate-faktury/nova"],
    ["nová ponuka", "/ponuky/nova"],
    ["nový kontakt", "/odberatelia?new=1"],
    ["kompaktné", "/nastavenia#rozlozenie"],
  ])("„%s“ → %s medzi prvými tromi", (dotaz, cesta) => {
    expect(prve(dotaz)).toContain(cesta);
  });

  it("bankový účet nájde aj účty vo Firme, upomienky aj nastavenie vo Firme", () => {
    expect(prve("bankový účet")).toContain("/firma#bankove-ucty");
    expect(prve("upomienky")).toContain("/firma#upomienky");
  });

  it("pomoc: najviac 3 články, s kotvou sekcie", () => {
    const r = hladajFunkcie(funkciePreKontext(MAJITEL), "dvojfaktor");
    expect(r.pomoc.length).toBeGreaterThan(0);
    expect(r.pomoc.length).toBeLessThanOrEqual(3);
    expect(r.pomoc.map(odkaz)).toContain("/pomoc/zabezpecenie#dvojfaktor");
    expect(hladajFunkcie(funkciePreKontext(MAJITEL), "faktúra").pomoc.length).toBe(3);
  });
});

describe("hľadanie funkcií — poradie", () => {
  const f = (nazov: string, slova: string[] = []): Funkcia => ({
    kluc: nazov,
    druh: "stranka",
    nazov,
    cesta: [],
    odkaz: { to: "/x" },
    slova,
    skupinaNav: null,
  });

  it("presný názov > názov začína > slovo názvu > kľúčové slovo > koreň > preklep", () => {
    const presny = skoreFunkcie(f("Upomienky"), "upomienky");
    const zaciatok = skoreFunkcie(f("Upomienky po splatnosti"), "upomienky");
    const slovo = skoreFunkcie(f("Odoslané upomienky"), "upomienky");
    const kluc = skoreFunkcie(f("Firma", ["upomienky"]), "upomienky");
    const koren = skoreFunkcie(f("Firma", ["upomienkový text"]), "upomienky");
    const preklep = skoreFunkcie(f("Schvaľovanie"), "schvalovnie");
    expect(presny).toBeGreaterThan(zaciatok);
    expect(zaciatok).toBeGreaterThan(slovo);
    expect(slovo).toBeGreaterThan(kluc);
    expect(kluc).toBeGreaterThan(koren);
    expect(koren).toBeGreaterThan(preklep);
    expect(preklep).toBeGreaterThan(0);
  });

  it("bez diakritiky a bez ohľadu na veľké písmená", () => {
    expect(skoreFunkcie(f("Číselné rady"), "CISELNE")).toBe(skoreFunkcie(f("Číselné rady"), "číselné"));
  });

  it("jeden znak hľadá len začiatky slov názvu, nie kľúčové slová", () => {
    expect(skoreFunkcie(f("Banka"), "b")).toBeGreaterThan(0);
    expect(skoreFunkcie(f("Firma", ["banka"]), "b")).toBe(0);
    expect(skoreFunkcie(f("Doklady"), "o")).toBe(0);
  });

  it("meno partnera nenájde náhodné funkcie („novak“ ≠ „Nová faktúra“)", () => {
    expect(hladajFunkcie(funkciePreKontext(MAJITEL), "novak").funkcie).toEqual([]);
    expect(hladajFunkcie(funkciePreKontext(MAJITEL), "2026001").funkcie).toEqual([]);
  });

  it("najviac 6 funkcií, preklad názvu sa tiež hľadá", () => {
    const vsetky = funkciePreKontext(MAJITEL);
    expect(hladajFunkcie(vsetky, "n").funkcie.length).toBeLessThanOrEqual(6);
    const preloz = (s: string) => (s === "Číselné rady" ? "Nummernkreise" : s);
    expect(hladajFunkcie(vsetky, "nummernkreise", preloz).funkcie.map(odkaz)[0]).toBe("/ciselne-rady");
  });
});
