import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => () => {},
}));
vi.mock("@tanstack/react-start", async (povodny) => ({
  ...(await povodny<typeof import("@tanstack/react-start")>()),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));

import {
  KartaNahladu,
  NapovedaPredkontacii,
  RozlozenieDetailu,
  SekciaZauctovania,
} from "./DetailDokladu";
import { PoliaZauctovania } from "./ZauctovaniePanel";
import { KV_CLENENIA, KV_PRIJATE } from "@/lib/faktero/kv-clenenie";
import { JazykProvider } from "@/lib/i18n/useT";

const html = (prvok: ReactNode) =>
  renderToStaticMarkup(<JazykProvider jazyk="sk">{prvok}</JazykProvider>);

/** Poradie výskytov textov v HTML (index každého; -1 = chýba). */
const pozicie = (h: string, texty: string[]) => texty.map((x) => h.indexOf(x));

describe("RozlozenieDetailu + KartaNahladu", () => {
  const strom = (strana: "vlavo" | "vpravo", lenSiroka?: boolean) =>
    html(
      <RozlozenieDetailu
        strana={strana}
        nahlad={
          <KartaNahladu
            nazov="FA-1"
            odkaz={{ url: "https://x/fa.pdf", text: "Otvoriť FA-1.pdf" }}
            onSkryt={() => {}}
            lenSiroka={lenSiroka}
          >
            <p>PDF</p>
          </KartaNahladu>
        }
      >
        <div>UDAJE</div>
      </RozlozenieDetailu>,
    );

  it("vľavo: náhľad je v DOM pred údajmi, mriežka ako pri nespracovanom", () => {
    const h = strom("vlavo");
    expect(h).toContain('data-strana-nahladu="vlavo"');
    expect(h).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]");
    // Na mobile jeden stĺpec s minmax(0, 1fr) — široká tabuľka nesmie roztiahnuť stránku.
    expect(h).toMatch(/class="grid grid-cols-1 /);
    const [n, u] = pozicie(h, ["PDF", "UDAJE"]);
    expect(n).toBeGreaterThan(-1);
    expect(n).toBeLessThan(u);
  });

  it("vpravo: údaje sú v DOM pred náhľadom (tabulátor a čítačka idú tak, ako to vidno)", () => {
    const h = strom("vpravo");
    expect(h).toContain('data-strana-nahladu="vpravo"');
    const [n, u] = pozicie(h, ["PDF", "UDAJE"]);
    expect(u).toBeLessThan(n);
  });

  it("karta má popis pre čítačku, odkaz na súbor, prepínač strany a Skryť náhľad", () => {
    const h = strom("vlavo");
    expect(h).toContain('aria-label="Náhľad dokladu — FA-1"');
    expect(h).toContain('href="https://x/fa.pdf"');
    expect(h).toContain("data-prepinac-strany-nahladu");
    expect(h).toContain('aria-label="Skryť náhľad"');
    // Na mobile je viditeľná (nad/pod údajmi), na širokej obrazovke sa drží pri vrchu.
    expect(h).not.toContain("hidden lg:block");
    expect(h).toContain("lg:sticky");
    expect(h).toContain("self-start");
  });

  it("lenSiroka: na úzkej obrazovke sa karta nekreslí", () => {
    expect(strom("vlavo", true)).toContain("hidden lg:block");
  });

  it("bez náhľadu ostanú len údaje", () => {
    const h = html(
      <RozlozenieDetailu nahlad={null}>
        <div>UDAJE</div>
      </RozlozenieDetailu>,
    );
    expect(h).not.toContain("data-strana-nahladu");
    expect(h).toContain("UDAJE");
  });
});

describe("SekciaZauctovania", () => {
  it("nadpis Zaúčtovanie, stav vpravo a kotva #zauctovanie", () => {
    const h = html(
      <SekciaZauctovania stav={<span>Nezaúčtovaná</span>}>
        <NapovedaPredkontacii />
      </SekciaZauctovania>,
    );
    expect(h).toContain('id="zauctovanie"');
    expect(h).toMatch(/<h3[^>]*id="zauctovanie-nadpis"[^>]*>Zaúčtovanie<\/h3>/);
    expect(h).toContain('aria-labelledby="zauctovanie-nadpis"');
    expect(h.indexOf("Zaúčtovanie<")).toBeLessThan(h.indexOf("Nezaúčtovaná"));
    expect(h).toContain('href="/uctovnictvo/predkontacie"');
  });
});

describe("PoliaZauctovania — spoločné polia nespracovaného a vystaveného dokladu", () => {
  const navrhy = {
    predkontacie: [],
    clenenia: [],
    predvolenaPredkontacia: null,
    predvoleneClenenie: null,
  };

  it("nespracovaný (prijatý) doklad: predkontácia, členenie, KV, kategória, stredisko…", () => {
    const h = html(
      <PoliaZauctovania
        navrhy={navrhy}
        hodnoty={{
          predkontacia: "",
          clenenie: "",
          kv: "",
          kategoria: "",
          stredisko: "",
          cinnost: "",
          rad: "",
          intPoznamka: "",
        }}
        setHodnoty={() => {}}
      />,
    );
    const p = pozicie(h, [
      "Predkontácia (Pohoda)",
      "Členenie DPH (plnenie)",
      "Členenie KV DPH",
      "Kategória nákladu",
      "Stredisko",
      "Činnosť",
      "Interná poznámka pre účtovníka",
    ]);
    expect(p.every((x) => x > -1)).toBe(true);
    expect([...p].sort((a, b) => a - b)).toEqual(p);
    expect(h).toContain(KV_PRIJATE[0].nazov);
  });

  it("vystavená faktúra: to isté poradie, bez kategórie nákladu, KV vystavených a príklady 3Fv/UD", () => {
    const vydane = KV_CLENENIA.filter((k) => ["A1", "A2", "C1", "D1", "D2", "X"].includes(k.kod));
    const h = html(
      <PoliaZauctovania
        navrhy={navrhy}
        hodnoty={{
          predkontacia: "",
          clenenie: "",
          kv: "",
          stredisko: "",
          cinnost: "",
          intPoznamka: "",
        }}
        setHodnoty={() => {}}
        kvMoznosti={vydane}
        priklady={{ predkontacia: "napr. 3Fv", clenenie: "napr. UD" }}
      />,
    );
    const p = pozicie(h, [
      "Predkontácia (Pohoda)",
      "Členenie DPH (plnenie)",
      "Členenie KV DPH",
      "Stredisko",
      "Činnosť",
      "Interná poznámka pre účtovníka",
    ]);
    expect(p.every((x) => x > -1)).toBe(true);
    expect([...p].sort((a, b) => a - b)).toEqual(p);
    expect(h).not.toContain("Kategória nákladu");
    expect(h).not.toContain("Číselný rad v Pohode");
    expect(h).toContain('placeholder="napr. 3Fv"');
    expect(h).toContain('placeholder="napr. UD"');
    for (const k of vydane) expect(h).toContain(`value="${k.kod}"`);
    // Prijaté členenia (napr. B2) sa pri vystavenej neponúkajú.
    expect(h).not.toContain('value="B2"');
  });

  it("nemecká firma: predkontácia je účet DATEV a KV sa neukazuje", () => {
    const h = html(
      <PoliaZauctovania
        navrhy={navrhy}
        hodnoty={{ predkontacia: "", clenenie: "" }}
        setHodnoty={() => {}}
        popisPredkontacie="Predkontácia (účet DATEV)"
      />,
    );
    expect(h).toContain("Predkontácia (účet DATEV)");
    expect(h).not.toContain("Členenie KV DPH");
  });
});
