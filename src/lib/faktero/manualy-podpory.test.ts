/*
  Interné manuály podpory (docs/podpora) — pomocné funkcie a hlavne strážca,
  že sa obsah nedostane von: nie do `public/`, nie do znalostí AI asistenta pre
  zákazníkov, nie do klientskeho kódu a nie mimo admin rozhrania.
*/
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cistyText,
  hladajVManualoch,
  manualZoSuboru,
  nadpisyManualu,
  normalizuj,
  prelinkujManualy,
  slugNadpisu,
  slugZOdkazu,
} from "./manualy-podpory";

const KOREN = join(__dirname, "..", "..", "..");
// Manuály nie sú v repozitári (je verejný) — ležia na serveri. Kde priečinok
// nie je (iný stroj), testy obsahu sa preskočia, strážcovia úniku bežia vždy.
const DOCS = process.env.MANUALY_PODPORY_DIR?.trim() || "/home/patrik/faktero-podpora-manualy";
const MAME_MANUALY = existsSync(DOCS);
const subory = MAME_MANUALY
  ? readdirSync(DOCS)
      .filter((f) => f.endsWith(".md"))
      .sort()
  : [];
const manualy = subory.map((f) => manualZoSuboru(f, readFileSync(join(DOCS, f), "utf8")));

function vsetkySubory(adr: string): string[] {
  const out: string[] = [];
  for (const m of readdirSync(adr)) {
    const p = join(adr, m);
    if (statSync(p).isDirectory()) out.push(...vsetkySubory(p));
    else out.push(p);
  }
  return out;
}

describe("pomocné funkcie manuálov podpory", () => {
  it("normalizuje bez diakritiky a so zachovanou dĺžkou", () => {
    expect(normalizuj("Účtovné Importy")).toBe("uctovne importy");
    expect(normalizuj("ľščťžýáíéôä").length).toBe("ľščťžýáíéôä".length);
  });

  it("kotvy nadpisov sú jedinečné a bez diakritiky", () => {
    const md =
      "# Titul\n\n## Časté otázky\n\n```\n## v kóde nie\n```\n\n## Časté otázky\n### „Nejde“ `kód`";
    expect(nadpisyManualu(md).map((n) => [n.uroven, n.id, n.riadok])).toEqual([
      [1, "titul", 1],
      [2, "caste-otazky", 3],
      [2, "caste-otazky-1", 9],
      [3, "nejde-kod", 10],
    ]);
    expect(slugNadpisu("**Dobropis** — rozpor")).toBe("dobropis-rozpor");
    expect(cistyText("**a** `b` [c](d)")).toBe("a b c");
  });

  it("prelinkuje holé odkazy na iné manuály, kód nechá komponentu", () => {
    const slugy = new Set(["14-mobilna-appka"]);
    expect(prelinkujManualy("pozri 14-mobilna-appka.md (appka)", slugy)).toBe(
      "pozri [14-mobilna-appka.md](?m=14-mobilna-appka) (appka)",
    );
    expect(prelinkujManualy("`14-mobilna-appka.md`", slugy)).toBe("`14-mobilna-appka.md`");
    expect(prelinkujManualy("99-neexistuje.md", slugy)).toBe("99-neexistuje.md");
    expect(slugZOdkazu("14-mobilna-appka.md", slugy)).toBe("14-mobilna-appka");
  });

  it("fulltext nájde sekciu podľa slov bez diakritiky", () => {
    const v = hladajVManualoch(manualy, "dobropis kladne");
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((x) => x.slug === "03-vystavene-faktury")).toBe(true);
    expect(hladajVManualoch(manualy, "   ")).toEqual([]);
    expect(hladajVManualoch(manualy, "zzzneexistujucezzz")).toEqual([]);
  });
});

describe("v repozitári nie sú", () => {
  it("priečinok docs/podpora neexistuje a je v .gitignore", () => {
    expect(existsSync(join(KOREN, "docs", "podpora"))).toBe(false);
    expect(readFileSync(join(KOREN, ".gitignore"), "utf8")).toMatch(/^\/?docs\/podpora\/?$/m);
  });
});

describe.skipIf(!MAME_MANUALY)("obsah manuálov na serveri", () => {
  it("je 17 manuálov, každý s nadpisom a jedinečnými kotvami", () => {
    expect(manualy.length).toBe(17);
    expect(manualy[0].slug).toBe("00-index");
    for (const m of manualy) {
      expect(m.nazov, m.slug).not.toBe(m.slug);
      const ids = nadpisyManualu(m.obsah).map((n) => n.id);
      expect(new Set(ids).size, m.slug).toBe(ids.length);
    }
  });
});

describe.skipIf(!MAME_MANUALY)("serverové načítanie z priečinka", () => {
  it("vráti všetky manuály v poradí a s tým istým obsahom ako na disku", async () => {
    const { nacitajManualyPodpory } = await import("./manualy-podpory.server");
    const zoServera = await nacitajManualyPodpory(DOCS);
    expect(zoServera.map((m) => m.slug)).toEqual(manualy.map((m) => m.slug));
    expect(zoServera.map((m) => m.obsah)).toEqual(manualy.map((m) => m.obsah));
  });
});

describe("interné manuály sa nedostanú von", () => {
  it("nie sú v public/", () => {
    const verejne = vsetkySubory(join(KOREN, "public"));
    const nazvy = new Set(subory);
    expect(verejne.filter((p) => nazvy.has(p.split("/").pop()!))).toEqual([]);
    // Ani obsah prilepený do iného verejného súboru.
    const znacka = "Pre koho: podpora Faktera (interné";
    const textove = verejne.filter((p) => /\.(md|txt|html|json|js|xml)$/.test(p));
    expect(textove.filter((p) => readFileSync(p, "utf8").includes(znacka))).toEqual([]);
  });

  it("nie sú v znalostiach AI asistenta pre zákazníkov", () => {
    const skript = readFileSync(join(KOREN, "scripts", "znalosti-manualy.mjs"), "utf8");
    expect(skript).toContain('path.join(KOREN, "src/routes")');
    expect(skript).not.toMatch(/docs/);
    const znalosti = readFileSync(join(KOREN, "src/lib/faktero/znalosti-manualy.json"), "utf8");
    expect(znalosti).not.toContain("interné, nezverejňovať");
    expect(znalosti).not.toContain("Interné manuály podpory");
    for (const m of manualy) expect(znalosti).not.toContain(m.slug + ".md");
  });

  it("obsah číta len serverový modul, ten sa načíta len v obsluhe admin funkcie", () => {
    const src = join(KOREN, "src");
    const odkazy = vsetkySubory(src)
      .filter((p) => /\.(ts|tsx|mjs)$/.test(p) && !/\.test\.tsx?$/.test(p))
      // Čítanie z priečinka manuálov (readdir/readFile) len v serverovom module.
      .filter((p) => /faktero-podpora-manualy|MANUALY_PODPORY_DIR/.test(readFileSync(p, "utf8")))
      .map((p) => p.slice(src.length + 1));
    expect(odkazy).toEqual(["lib/faktero/manualy-podpory.server.ts"]);

    const importy = vsetkySubory(src)
      .filter((p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p))
      .filter((p) => /import[^\n]*manualy-podpory\.server/.test(readFileSync(p, "utf8")))
      .map((p) => p.slice(src.length + 1))
      .filter((p) => p !== "lib/faktero/manualy-podpory.server.ts");
    expect(importy).toEqual(["lib/faktero/manualy-podpory.functions.ts"]);

    const fn = readFileSync(join(src, "lib/faktero/manualy-podpory.functions.ts"), "utf8");
    // Len dynamický import vnútri obsluhy — statický by obsah pribalil do prehliadača.
    expect(fn).not.toMatch(/^import[^\n]*manualy-podpory\.server/m);
    expect(fn).toContain('.from("platform_admins")');
    expect(fn).toContain("vyzadujAal2Admina");
    expect(fn.indexOf("vyzadujAal2Admina")).toBeLessThan(fn.indexOf("manualy-podpory.server"));
  });

  it("stránka je pod /admin (stráž platform_admins + aal2) a mimo sitemapy a robotov", () => {
    const routes = join(KOREN, "src", "routes");
    expect(existsSync(join(routes, "admin.podpora.manualy.tsx"))).toBe(true);
    expect(readFileSync(join(routes, "admin.podpora.manualy.tsx"), "utf8")).toContain(
      'createFileRoute("/admin/podpora/manualy")',
    );
    const layout = readFileSync(join(routes, "admin.tsx"), "utf8");
    expect(layout).toContain('.from("platform_admins")');
    expect(layout).toContain("adminSmie(");
    expect(layout).toContain('redirect({ to: "/dashboard" })');
    expect(readFileSync(join(routes, "sitemap[.]xml.ts"), "utf8")).toMatch(
      /EXCLUDED_PREFIXES = \[[^\]]*"\/admin"/,
    );
    expect(readFileSync(join(routes, "robots[.]txt.ts"), "utf8")).toContain("Disallow: /admin/");
  });
});
